# advreview

Adversarial PR review tool driven by the local `claude` CLI. A Node.js
package (ESM, Node 18.17+) with zero npm dependencies; the only external
tools are `gh`, `git`, and `claude`.

- `bin/advreview.js`: CLI entry (`review`, `post`, `serve`).
- `src/review.js`: the review flow. Checkout, context, hunt pass, verify pass, session files.
- `src/claude.js`: the single place that spawns `claude -p`. `src/gh.js`: the single place that calls `gh`.
- `src/checkout.js`, `src/parse.js`, `src/schemas.js`, `src/emitter.js`, `src/report.js`, `src/post.js`: one concern each, see README "Layout".
- `src/server.js`: web UI backend. Node `http` only, SSE trace stream.
- `ui/index.html`: the web UI page (single file, no build step). `ui/mockup.html` is the approved static mockup.
- `test/`: `node --test` unit tests. Run `npm test` before reporting done.
- `prompts/hunt.md`, `prompts/verify.md`: the two prompts sent to `claude -p`.
- `SPEC.md`: software requirements specification, numbered FR/NFR requirements with acceptance and verification. Read it before changing behavior.
- `ARCHITECTURE.md`: diagrams and data shapes. Read it before changing anything.
- `README.md`: starting and using the web UI, accepted PR forms, env vars. CLI flags live in the `--help` text in `bin/advreview.js`.
- `reviews/`: output sessions. Never edit by hand, never commit.

## Keep SPEC.md and ARCHITECTURE.md in sync

ARCHITECTURE.md is the source of truth for how this tool works. Every code
change that alters behavior must update it in the same change. Do not finish a
task with the code and the diagrams disagreeing.

Before you report a code change as done, check each section against what you
changed:

| Change in code | Section to update |
|---|---|
| New or removed subcommand, module, external tool, or store | §1 Components (flowchart) |
| Any change to the order of steps in `review` or `post`, new `claude -p` call, new gh/git call | §2 Review flow (sequence diagram) |
| New verdict, new way a finding is dropped or kept, change to `sortKey` or `post` prompts | §3 Finding lifecycle (state diagram) |
| Change to `parseGroups`, `parsePr`, or `--input` | §4 Input parsing (flowchart) |
| Any field added, removed, or renamed in `HUNT_SCHEMA`, `VERIFY_SCHEMA`, or the `result` dict | §5 Data shapes (class diagram) |
| New module, or a module gaining a new responsibility | §6 Modules |
| New file written to or read from the session dir | §7 Session directory |
| New or changed HTTP endpoint, SSE event kind, or UI pane | §8 Web UI |
| A design decision reversed or a new one introduced | §9 Why these choices |
| New flag or env var | `--help` text in `bin/advreview.js`; README.md env var table if the UI honours it; and the section above that the flag affects |
| Any requirement added, removed, or changed in meaning (new behavior, removed option, different default, new guarantee) | SPEC.md: add, retire, or reword the FR/NFR, keep IDs stable, update §6 verification and §7 open items |

Rules:

1. Update the diagram, not just the prose under it. Mermaid blocks must still render.
2. Match names exactly: function names, flag names, file names, schema fields.
3. If a change is purely internal (refactor, rename of a local variable, log wording), no update is needed. Say so explicitly when you report done.
4. If you are unsure whether a section is affected, re-read that section and decide. Do not skip.
5. Prompt changes (`prompts/*.md`) that change what the model is asked to return or how it decides need §3 or §5 updated; wording-only edits do not.

## Conventions

- Node 18.17+, ESM, Node built-ins only. No npm dependencies, no build step. `package.json` has no `dependencies` field on purpose.
- Prose in files is normal English. No terse or compressed style in code, comments, docs, or prompts.
- `claude -p` calls go through `claudeJson` in `src/claude.js`. Do not spawn `claude` elsewhere.
- Progress goes through the `Emitter`. Do not `console.log` inside `reviewGroup`; the server runs it with `quiet: true`.
- `src/server.js` must stay on Node's `http` module. No frameworks.
- The codebase root (`--codebase`, UI field, `ADVREVIEW_CODEBASE`) is the parent of every platform repo. Both the PR-repo lookup and the dependent-project search use it. Do not add a second repo-location setting.
- `gh` calls go through `gh` / `ghJson` in `src/gh.js` so the right account is picked per repo owner.
- Nothing posts to GitHub except `postCommentApi`, and only after the interactive `y` (CLI) or the per-finding dialog (UI).
- Session files (`findings.json`, `trace.jsonl`, `report.md`) keep their current shape so older sessions still open from History.
- Run `npm test` before reporting done.
