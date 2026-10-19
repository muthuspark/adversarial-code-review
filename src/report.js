// Report rendering for terminal and report.md.
const SEV_RANK = { critical: 0, high: 1, medium: 2 };
const V_RANK = { CONFIRMED: 0, UNCERTAIN: 1, REFUTED: 2 };

export function verdictOf(f) {
  return f.verification?.verdict ?? "CONFIRMED";
}

export function sortKey(a, b) {
  return (V_RANK[verdictOf(a)] - V_RANK[verdictOf(b)])
    || (SEV_RANK[a.severity] - SEV_RANK[b.severity])
    || (b.confidence - a.confidence);
}

export function wrap(s, indent = 0, width = 100) {
  const pad = " ".repeat(indent);
  const out = [];
  for (const para of String(s ?? "").trim().split("\n")) {
    if (!para.trim()) continue;
    let line = pad;
    for (const word of para.split(/\s+/)) {
      if (line.length + word.length + 1 > width && line.trim()) { out.push(line); line = pad + word; }
      else line += (line.trim() ? " " : "") + word;
    }
    out.push(line);
  }
  return out.join("\n");
}

export function renderReport(r, color) {
  const c = (code, s) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
  const sevColor = { critical: "1;31", high: "31", medium: "33" };
  const out = [];
  out.push(c("1", "# Adversarial review" + (r.label ? `: ${r.label}` : "")));
  for (const p of r.prs) out.push(`- ${p.owner}/${p.repo}#${p.number}  ${p.title}  (${p.url})`);
  out.push("", c("1", "## Summary"), "", wrap(r.summary), "");
  if (r.cross_pr_notes?.trim()) out.push(c("1", "## Cross-PR contract check"), "", wrap(r.cross_pr_notes), "");

  const spec = r.spec;
  out.push(c("1", "## Spec compliance"), "");
  if (!spec.found) out.push("No spec found in PR bodies or diffs.");
  else {
    out.push(`Source: ${spec.source}`, "");
    const mark = { met: c("32", "MET    "), partial: c("33", "PARTIAL"), missing: c("31", "MISSING"), contradicted: c("1;31", "CONTRA ") };
    for (const q of spec.requirements) {
      out.push(`  ${mark[q.status]}  ${q.id}: ${q.text}`);
      if (q.status !== "met" && q.evidence) out.push(`           ${q.evidence}`);
    }
  }
  out.push("");

  const live = r.findings.filter((f) => verdictOf(f) !== "REFUTED");
  const dead = r.findings.filter((f) => verdictOf(f) === "REFUTED");
  out.push(c("1", `## Findings (${live.length} reported, ${dead.length} refuted on verify)`), "");
  if (!live.length) out.push("PASS: no finding survived verification.");
  for (const f of live) {
    const v = f.verification;
    const tag = v ? `[${v.verdict} ${v.confidence}%]` : `[unverified ${f.confidence}%]`;
    const flags = [];
    if (f.cross_pr) flags.push("CROSS-PR");
    if (f.spec_gap) flags.push("SPEC-GAP");
    for (const repo of f.affected_repos ?? []) flags.push(`AFFECTS ${repo}`);
    let head = `${f.id}  ${c(sevColor[f.severity], f.severity.toUpperCase())}  ${tag}  ${f.title}`;
    if (flags.length) head += "  " + c("35", flags.join(" "));
    out.push(head);
    out.push(`    ${f.repo}#${f.pr_number}  ${f.file}:${f.line}  [${f.category}]`);
    out.push(wrap(f.problem, 4));
    out.push(wrap("Fails when: " + f.failure_scenario, 4));
    out.push(wrap("Evidence: " + f.evidence, 4));
    if (v && v.verdict !== "CONFIRMED") out.push(wrap("Verifier: " + v.reasoning, 4));
    if (f.suggested_fix?.trim()) out.push(wrap("Fix: " + f.suggested_fix, 4));
    out.push("");
  }
  if (dead.length) {
    out.push(c("90", "## Refuted (not reported)"));
    for (const f of dead) out.push(c("90", `- ${f.id} ${f.title}: ${f.verification.reasoning}`));
    out.push("");
  }
  return out.join("\n");
}

export function findingComment(f) {
  const conf = f.verification ? f.verification.confidence : f.confidence;
  const parts = [
    `**${f.severity.toUpperCase()}: ${f.title}**  _(adversarial review, confidence ${conf}%)_`, "",
    f.problem, "",
    `**Fails when:** ${f.failure_scenario}`, "",
    `**Evidence:** ${f.evidence}`,
  ];
  if (f.suggested_fix?.trim()) parts.push("", `**Suggested fix:** ${f.suggested_fix}`);
  return parts.join("\n");
}
