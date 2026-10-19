// The review itself: checkout, context, hunt pass, verify pass, report files.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parsePr, slug } from "./parse.js";
import { HUNT_SCHEMA, VERIFY_SCHEMA } from "./schemas.js";
import { Emitter } from "./emitter.js";
import { prView, prDiff } from "./gh.js";
import { DEFAULT_CODEBASE, expand, listRepos, ensureClone, worktreeForPr, removeWorktree, isCacheClone } from "./checkout.js";
import { claudeJson } from "./claude.js";
import { renderReport, sortKey, verdictOf } from "./report.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, "..");
export const PROMPTS = path.join(ROOT, "prompts");
export const REVIEWS = process.env.ADVREVIEW_OUT || path.join(ROOT, "reviews");

export const DEFAULTS = {
  codebase: DEFAULT_CODEBASE, model: null, noVerify: false, parallel: 4,
  maxTurns: 200, verifyTurns: 60, keepWorkspace: false,
};

function loadPrompt(name, subs) {
  let text = fs.readFileSync(path.join(PROMPTS, name), "utf8");
  for (const [k, v] of Object.entries(subs)) text = text.split(`{{${k}}}`).join(v);
  return text;
}

function timestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function buildContext(group, sessionDir, label, codebase) {
  const ws = path.join(sessionDir, "ws");
  const lines = ["# PR group under review" + (label ? `: ${label}` : ""), ""];
  if (label) lines.push(`The human labeled this group **${label}**. Treat that as the feature name; the PRs implement it together.`, "");
  lines.push(`Group of ${group.length} PR(s). Workspace root: \`${ws}\``, "");
  const inGroup = new Set(group.map((g) => `${g.owner}/${g.repo}`.toLowerCase()));
  lines.push(`## Codebase root: \`${codebase}\``, "",
    "Every repository of the platform is checked out here. Repos with a PR in this group are listed below with their PR-head worktree; use the worktree for those. The other repos are at the developer's current local checkout, not necessarily the default branch. Use them to find consumers of anything the PRs change.", "");
  for (const r of listRepos(codebase)) {
    const mark = inGroup.has(r.slug.toLowerCase()) ? " (PR in this group, use its worktree)" : "";
    lines.push(`- \`${r.name}\` (${r.slug || "no github origin"})${mark}`);
  }
  lines.push("");
  for (const g of group) {
    const pr = g.pr;
    const files = pr.files.slice(0, 80).map((f) => `\`${f.path}\``).join(", ") + (pr.files.length > 80 ? " ..." : "");
    lines.push(
      `## PR ${g.owner}/${g.repo}#${pr.number}: ${pr.title}`, "",
      `- URL: ${pr.url}`,
      `- Author: ${pr.author?.login}`,
      `- Base: \`${pr.baseRefName}\` @ ${pr.baseRefOid.slice(0, 10)}`,
      `- Head: \`${pr.headRefName}\` @ ${pr.headRefOid.slice(0, 10)}`,
      `- Full checkout at PR head: \`${g.worktree}\``,
      `- Diff file: \`${g.diffFile}\``,
      `- Changed files (${pr.files.length}): ${files}`, "",
      "### PR body", "", (pr.body || "").trim() || "(empty)", "");
  }
  const ctx = path.join(sessionDir, "context.md");
  fs.writeFileSync(ctx, lines.join("\n"));
  return ctx;
}

function cleanup(group, ws, keep) {
  if (keep) return;
  for (const g of group) removeWorktree(g.clone, g.worktree);
  fs.rmSync(ws, { recursive: true, force: true });
}

async function pool(items, limit, fn) {
  const results = [];
  let next = 0;
  async function worker() {
    while (next < items.length) { const i = next++; results[i] = await fn(items[i]); }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * Review one group of PRs. Returns the session directory.
 * @param {string} label
 * @param {string[]} prRefs
 * @param {object} opts  DEFAULTS overrides, plus sink (event callback) and quiet
 */
export async function reviewGroup(label, prRefs, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const refs = prRefs.map(parsePr);
  const ts = timestamp();
  const sessionDir = path.join(REVIEWS, label ? `${ts}-${slug(label)}` : ts);
  const ws = path.join(sessionDir, "ws");
  fs.mkdirSync(ws, { recursive: true });
  const emit = new Emitter(sessionDir, o.sink, o.quiet);
  const codebase = expand(o.codebase || DEFAULT_CODEBASE);
  if (!fs.existsSync(codebase) || !fs.statSync(codebase).isDirectory()) {
    emit.close();
    throw new Error(`codebase root not found: ${codebase}`);
  }
  if (!o.quiet) {
    console.log("\n" + "=".repeat(100));
    console.log(`GROUP: ${label || "(unlabeled)"}  [${refs.length} PRs]`);
    console.log("=".repeat(100));
  }
  emit.emit("info", `session dir: ${sessionDir}`, "checkout", { session: sessionDir, label });

  const group = [];
  for (const { owner, repo, number } of refs) {
    const pr = prView(owner, repo, number);
    const clone = ensureClone(owner, repo, codebase);
    const sameRepo = refs.filter((r) => r.repo === repo).length;
    const wtName = sameRepo === 1 ? repo : `${repo}-pr${number}`;
    const worktree = worktreeForPr(clone, pr, path.join(ws, wtName));
    const diffFile = path.join(sessionDir, `${owner}__${repo}__pr${number}.diff`);
    fs.writeFileSync(diffFile, prDiff(owner, repo, number));
    group.push({ owner, repo, pr, clone, worktree, diffFile });
    emit.emit("ok", `${repo}#${number} · ${isCacheClone(clone) ? "cloned" : "local clone"} · ${pr.files.length} files · ${pr.title}`, "checkout");
  }

  const ctx = buildContext(group, sessionDir, label, codebase);
  emit.emit("info", `codebase root: ${codebase} (${listRepos(codebase).length} repos visible)`, "checkout");

  const common = { cwd: ws, addDirs: [sessionDir, codebase], model: o.model, emit };
  let hunt;
  try {
    hunt = await claudeJson({ ...common, prompt: loadPrompt("hunt.md", { CONTEXT_FILE: ctx, WORKSPACE: ws, CODEBASE: codebase }),
      schema: HUNT_SCHEMA, maxTurns: o.maxTurns, tag: "hunt", phase: "hunt" });
  } catch (e) {
    emit.emit("error", String(e.message || e), "hunt");
    cleanup(group, ws, o.keepWorkspace);
    emit.close();
    throw e;
  }
  fs.writeFileSync(path.join(sessionDir, "hunt.json"), JSON.stringify(hunt, null, 2));

  const findings = hunt.findings;
  findings.forEach((f, i) => { f.id = `F${i + 1}`; });
  const specNote = hunt.spec.found ? `found, ${hunt.spec.requirements.length} reqs` : "not found";
  emit.emit("ok", `Hunt done · ${findings.length} candidate finding(s) · spec ${specNote}`, "hunt", { findings: findings.length });

  if (findings.length && !o.noVerify) {
    let done = 0;
    await pool(findings, o.parallel, async (f) => {
      let v;
      try {
        v = await claudeJson({ ...common, prompt: loadPrompt("verify.md", { CONTEXT_FILE: ctx, WORKSPACE: ws, CODEBASE: codebase, FINDING: JSON.stringify(f, null, 2) }),
          schema: VERIFY_SCHEMA, maxTurns: o.verifyTurns, tag: `verify ${f.id}`, phase: "verify" });
      } catch (e) {
        emit.emit("warn", `verify ${f.id} failed, keeping finding as UNCERTAIN: ${e.message}`, "verify");
        v = { verdict: "UNCERTAIN", confidence: f.confidence, reasoning: `verify pass failed: ${e.message}`, evidence: "", severity: f.severity, failure_scenario: f.failure_scenario };
      }
      f.verification = v;
      let sevNote = "";
      if (v.verdict === "CONFIRMED") {
        if (v.severity !== f.severity) sevNote = ` · severity ${f.severity.toUpperCase()} → ${v.severity.toUpperCase()}`;
        f.severity = v.severity;
        f.failure_scenario = v.failure_scenario || f.failure_scenario;
      }
      done += 1;
      emit.emit("verdict", `${f.id} ${v.verdict} ${v.confidence}%${sevNote} · ${f.title}`, "verify", { id: f.id, verdict: v.verdict, done, total: findings.length });
    });
  }

  const result = {
    session: sessionDir, label, codebase, created: ts,
    prs: group.map((g) => ({ owner: g.owner, repo: g.repo, number: g.pr.number, url: g.pr.url, title: g.pr.title, head_sha: g.pr.headRefOid })),
    summary: hunt.summary, spec: hunt.spec, cross_pr_notes: hunt.cross_pr_notes,
    findings: [...findings].sort(sortKey),
  };
  fs.writeFileSync(path.join(sessionDir, "findings.json"), JSON.stringify(result, null, 2));
  fs.writeFileSync(path.join(sessionDir, "report.md"), renderReport(result, false));

  cleanup(group, ws, o.keepWorkspace);
  const live = findings.filter((f) => verdictOf(f) !== "REFUTED").length;
  emit.emit("done", `Saved ${path.basename(sessionDir)}/report.md · ${live} finding(s) reported`, "done", { session: sessionDir, findings: live });
  emit.close();

  if (!o.quiet) {
    console.log(renderReport(result, process.stdout.isTTY));
    console.log(`\nSaved: ${sessionDir}/report.md  ${sessionDir}/findings.json`);
    console.log(`To post confirmed findings after reading them:  advreview post ${sessionDir}`);
  }
  return sessionDir;
}

/** Load a saved session: findings.json, trace.jsonl, report.md. */
export function loadSession(name) {
  if (!name || name.includes("/") || name.includes("..")) throw new Error(`bad session name: ${name}`);
  const d = path.join(REVIEWS, name);
  const fj = path.join(d, "findings.json");
  if (!fs.existsSync(fj)) throw new Error(`no findings.json in ${name}`);
  const findings = JSON.parse(fs.readFileSync(fj, "utf8"));
  const trace = [];
  const tf = path.join(d, "trace.jsonl");
  if (fs.existsSync(tf)) {
    for (const line of fs.readFileSync(tf, "utf8").split("\n")) {
      try { if (line.trim()) trace.push(JSON.parse(line)); } catch { /* skip */ }
    }
  }
  const rm = path.join(d, "report.md");
  return { findings, trace, report_md: fs.existsSync(rm) ? fs.readFileSync(rm, "utf8") : "" };
}

export function listSessions() {
  if (!fs.existsSync(REVIEWS)) return [];
  const out = [];
  for (const name of fs.readdirSync(REVIEWS).sort().reverse()) {
    const fj = path.join(REVIEWS, name, "findings.json");
    if (!fs.existsSync(fj)) continue;
    let r;
    try { r = JSON.parse(fs.readFileSync(fj, "utf8")); } catch { continue; }
    out.push({ session: name, label: r.label || "", created: r.created,
      prs: r.prs.map((p) => `${p.repo}#${p.number}`),
      findings: r.findings.filter((f) => verdictOf(f) !== "REFUTED").length });
  }
  return out;
}
