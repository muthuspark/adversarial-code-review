#!/usr/bin/env node
// advreview CLI: review | post | serve
import fs from "node:fs";
import { parseArgs } from "node:util";
import { parseGroups } from "../src/parse.js";
import { reviewGroup, DEFAULTS } from "../src/review.js";
import { postInteractive } from "../src/post.js";
import { serve } from "../src/server.js";

const USAGE = `advreview: adversarial review of dependent GitHub PRs via the local claude CLI

Usage:
  advreview review <pr> [<pr> ...] [options]
  advreview review --input FILE | -       (pasted links; all of them form one group)
  advreview post <session-dir>            (interactive y/n/e/q per finding)
  advreview serve [port]                  (web UI, default 8765)

A <pr> is a GitHub PR URL, owner/repo#N, or owner/repo/pull/N.

Options for review:
  --codebase DIR       parent dir of every platform repo (default ${DEFAULTS.codebase}, env ADVREVIEW_CODEBASE)
  --model NAME         claude model override
  --no-verify          skip the refutation pass
  --parallel N         verify passes at once (default ${DEFAULTS.parallel})
  --max-turns N        hunt pass turn cap (default ${DEFAULTS.maxTurns})
  --verify-turns N     verify pass turn cap (default ${DEFAULTS.verifyTurns})
  --keep-workspace     keep repo worktrees under the session dir
`;

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === "-h" || cmd === "--help") { process.stdout.write(USAGE); return; }

  if (cmd === "serve") { serve(rest[0] ? Number(rest[0]) : 8765); return; }

  if (cmd === "post") {
    if (!rest[0]) throw new Error("post needs a session directory");
    await postInteractive(rest[0]);
    return;
  }

  if (cmd === "review") {
    const { values, positionals } = parseArgs({
      args: rest, allowPositionals: true,
      options: {
        input: { type: "string", short: "i" }, codebase: { type: "string" }, model: { type: "string" },
        "no-verify": { type: "boolean" }, parallel: { type: "string" }, "max-turns": { type: "string" },
        "verify-turns": { type: "string" }, "keep-workspace": { type: "boolean" },
      },
    });
    let text = "";
    if (values.input) text = values.input === "-" ? fs.readFileSync(0, "utf8") : fs.readFileSync(values.input, "utf8");
    const groups = parseGroups(text + "\n" + positionals.join("\n"));
    if (!groups.length) throw new Error("no PRs given. Pass PR refs, or --input FILE / --input - for pasted text");
    const [{ label, prs }] = groups;
    await reviewGroup(label, prs, {
      codebase: values.codebase, model: values.model, noVerify: !!values["no-verify"],
      parallel: values.parallel ? Number(values.parallel) : DEFAULTS.parallel,
      maxTurns: values["max-turns"] ? Number(values["max-turns"]) : DEFAULTS.maxTurns,
      verifyTurns: values["verify-turns"] ? Number(values["verify-turns"]) : DEFAULTS.verifyTurns,
      keepWorkspace: !!values["keep-workspace"],
    });
    return;
  }
  throw new Error(`unknown command: ${cmd}\n\n${USAGE}`);
}

main().catch((e) => { process.stderr.write(`error: ${e.message || e}\n`); process.exit(1); });
