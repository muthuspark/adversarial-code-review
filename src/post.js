// Posting findings to GitHub. Only ever one at a time, only after a human confirmed that one.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline/promises";
import { spawnSync } from "node:child_process";
import { gh, ghEnv } from "./gh.js";
import { findingComment, verdictOf } from "./report.js";
import { loadSession } from "./review.js";

/** Post one finding. Inline at file:line on the reviewed commit; general PR comment as fallback. */
export function postCommentApi(p, f, body) {
  const repo = `${p.owner}/${p.repo}`;
  const payload = { body, commit_id: p.head_sha, path: f.file, line: f.line, side: "RIGHT" };
  const r = spawnSync("gh", ["api", `repos/${repo}/pulls/${p.number}/comments`, "--method", "POST", "--input", "-"],
    { input: JSON.stringify(payload), env: ghEnv(p.owner, p.repo), encoding: "utf8" });
  if (r.status === 0) {
    let url = "";
    try { url = JSON.parse(r.stdout).html_url || ""; } catch { /* ignore */ }
    return { mode: "inline", url };
  }
  const body2 = `\`${f.file}:${f.line}\`\n\n${body}`;
  const out = gh(["pr", "comment", String(p.number), "--repo", repo, "--body", body2], p.owner, p.repo).trim();
  return { mode: "general", url: out };
}

/** Post one finding of a saved session by id (used by the web server). */
export function postFinding(sessionName, findingId, body) {
  const r = loadSession(sessionName).findings;
  const f = r.findings.find((x) => x.id === findingId);
  if (!f) throw new Error(`no finding ${findingId}`);
  const p = r.prs.find((x) => x.repo === f.repo.split("/").pop() && x.number === f.pr_number);
  if (!p) throw new Error(`no PR for finding ${findingId}`);
  return postCommentApi(p, f, body);
}

function editText(text) {
  const editor = process.env.EDITOR || "vi";
  const file = path.join(os.tmpdir(), `advreview-${Date.now()}.md`);
  fs.writeFileSync(file, text);
  spawnSync(editor, [file], { stdio: "inherit" });
  return fs.readFileSync(file, "utf8");
}

/** Interactive CLI posting: y / n / e / q per finding. */
export async function postInteractive(sessionDir) {
  const name = path.basename(path.resolve(sessionDir));
  const r = loadSession(name).findings;
  const live = r.findings.filter((f) => verdictOf(f) !== "REFUTED");
  if (!live.length) { console.log("No findings to post."); return; }
  console.log(`${live.length} finding(s). For each: y=post  n=skip  e=edit body  q=quit\n`);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  let posted = 0;
  try {
    for (const f of live) {
      const p = r.prs.find((x) => x.repo === f.repo.split("/").pop() && x.number === f.pr_number);
      let body = findingComment(f);
      console.log("-".repeat(100));
      console.log(`${f.id} ${f.severity.toUpperCase()} ${p.owner}/${p.repo}#${p.number} ${f.file}:${f.line}`);
      console.log(body.replace(/^/gm, "    "));
      let ans;
      for (;;) {
        ans = (await rl.question("post? [y/n/e/q] ")).trim().toLowerCase();
        if (ans === "e") { body = editText(body); console.log(body.replace(/^/gm, "    ")); continue; }
        break;
      }
      if (ans === "q") break;
      if (ans !== "y") continue;
      const res = postCommentApi(p, f, body);
      console.log(res.mode === "inline" ? `  posted inline at ${f.file}:${f.line}  ${res.url}` : `  inline rejected by GitHub; posted as general PR comment  ${res.url}`);
      posted += 1;
    }
  } finally {
    rl.close();
  }
  console.log(`\nPosted ${posted} comment(s).`);
}
