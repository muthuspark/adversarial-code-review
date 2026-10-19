# advreview

Adversarial review of a set of dependent GitHub pull requests, driven by the
`claude` CLI already logged in on your machine. It assumes the PRs are broken
and looks for proof: regressions, contract breaks between repos, spec gaps,
and consumers in other projects that the PRs never touched.

- **No API key.** Uses your `claude` login. Cost is shown but not billed
  separately on a subscription account.
- **Read-only.** The reviewer reads code and git history. It never runs tests,
  builds, or any code from the PRs.
- **One context.** Every PR you paste is reviewed together, because dependent
  PRs cannot be judged apart.
- **Whole codebase.** Every repo under your codebase root is searched for
  consumers of what the PRs change, PR or not.
- **Two passes.** A hunt pass finds candidates; a separate verify pass per
  finding tries to refute each one. Only what survives is reported.
- **Human posts.** Nothing reaches GitHub until you confirm each comment.

## Requirements

| Tool | Why | Check |
|---|---|---|
| Node.js 18.17+ | runs the tool; no npm dependencies | `node --version` |
| `claude` CLI, logged in | the reviewer | `claude --version` |
| `gh` CLI, logged in | PR metadata, diffs, clones, posting | `gh auth status` |
| `git` 2.20+ | worktrees at PR heads | `git --version` |

If you use more than one GitHub account, log them all in with `gh auth login`.
The tool picks, per repository owner, the first account that can read the
repo. It never switches your active `gh` account. Force one with
`ADVREVIEW_GH_USER=<login>`.

## Install

```bash
git clone <this repo> advreview
cd advreview
npm test            # 2 unit tests, no install step
npm link            # optional: puts `advreview` on your PATH
```

Without `npm link`, replace `advreview` below with `node bin/advreview.js`.

## Quick start

### Web UI

```bash
advreview serve     # or: npm start
```

Open <http://localhost:8765>.

1. **Codebase root.** Defaults to `~/workspace/git`. The field validates live
   and shows how many repos it holds. Remembered in the browser.
2. **Paste PR links**, one per line. Blank lines are ignored. A plain text line
   becomes the label of the set. Include the spec PR (for example the OpenSpec
   change) so requirements get validated.
3. **Review.** The left pane streams the trace: checkouts, every file read,
   grep, git command, the reviewer's notes, and each verify verdict. Cost and
   tool-call count sit in the pane header.
4. **Report** appears on the right when the run ends: summary, cross-PR
   contract check, spec compliance table, findings ranked by severity, refuted
   findings in a footer.
5. **Post.** Tick findings, click Post selected. Each one opens in a dialog
   with the editable comment and its own Post / Skip / Stop. Posted findings
   show a link.
6. **History** reopens any past session with its trace and report.

A run keeps going if you close the page. Reopen it from History when done.

### CLI

```bash
# one PR
advreview review https://github.com/owner/repo/pull/123

# a dependent set across repos: one context, contracts checked
advreview review owner/api#45 owner/web#120 owner/infra#9

# pasted links from the clipboard, a file, or stdin
pbpaste | advreview review --input -
advreview review --input prs.txt

# after reading the report, post selected findings as PR comments
advreview post reviews/20261016-143701
```

Accepted PR forms: `https://github.com/o/r/pull/N` (trailing `/changes`,
`/files` or query string is fine), `o/r#N`, `o/r/pull/N`.

`post` walks the surviving findings one by one and asks `y` (post), `n`
(skip), `e` (edit in `$EDITOR`, then ask again), `q` (stop).

## Options

Flags for `advreview review`:

| flag | default | meaning |
|---|---|---|
| `--codebase DIR` | `~/workspace/git` | parent directory of every platform repo |
| `--input FILE`, `-i` | | file of pasted links; `-` reads stdin |
| `--model NAME` | claude default | passed through to `claude --model` |
| `--no-verify` | off | skip the refutation pass; findings are reported as unverified |
| `--parallel N` | 4 | verify passes run at the same time |
| `--max-turns N` | 200 | turn cap for the hunt pass |
| `--verify-turns N` | 60 | turn cap for each verify pass |
| `--keep-workspace` | off | keep the PR worktrees under the session dir |

Environment variables:

| variable | default | meaning |
|---|---|---|
| `ADVREVIEW_CODEBASE` | `~/workspace/git` | default codebase root for CLI and UI |
| `ADVREVIEW_OUT` | `./reviews` | where sessions are written |
| `ADVREVIEW_CACHE` | `~/.cache/advreview` | fallback clones for repos not under the codebase root |
| `ADVREVIEW_GH_USER` | auto | force one `gh` account for every repo |

`advreview serve [port]` takes an optional port, default 8765.

## What it does

1. **Fetch.** PR metadata and unified diff through `gh`.
2. **Checkout.** Finds each PR's repo under the codebase root by origin URL
   and fetches it. Repos not found there are cloned once into the cache. A
   detached git worktree is created at the PR head under
   `reviews/<session>/ws/`. Your own branches and working trees are never
   touched. Worktrees are removed when the run ends.
3. **Context.** Writes `context.md`: the label, every PR's body, refs, changed
   files, worktree and diff paths, and the list of every repo under the
   codebase root, marking those that have a PR in the set. The others are
   dependent projects at your current local checkout.
4. **Hunt pass.** One `claude -p` run over the whole set with
   `prompts/hunt.md`. It reads every diff, greps callers in the full
   checkouts, checks contracts between the PRs and what happens if they deploy
   in any order, greps the whole codebase root for consumers of every changed
   contract, extracts spec requirements from PR bodies or a spec file in the
   diffs, and tries to refute its own candidates. Output is JSON validated by
   a schema. Reporting bar: concrete failure scenario, file and line,
   confidence 50 or more. No style or naming comments.
5. **Verify pass.** One fresh `claude -p` run per candidate with
   `prompts/verify.md`, told to refute it. Verdict CONFIRMED, REFUTED, or
   UNCERTAIN. A confirmed finding takes the verifier's severity and failure
   scenario. A failed verify run keeps the finding as UNCERTAIN instead of
   losing it.
6. **Report.** Findings sorted by verdict, severity, confidence. Flags:
   `CROSS-PR` (defect exists only because two PRs interact), `SPEC-GAP` (a
   requirement the PR fails), `AFFECTS <repo>` (a consumer in a repo with no
   PR in the set).
7. **Post.** An inline review comment at the finding's file and line on the
   exact commit that was reviewed. If GitHub rejects the position, a general
   PR comment naming the file and line is posted instead.

Reviewer permissions on every `claude -p` run: `--permission-mode dontAsk`
with an allowlist of Read, Grep, Glob, Agent, and read-only git commands.
Writes are denied. Claude Code may still auto-allow a few harmless read-only
shell commands such as `wc` or `ls`. User-level Claude settings and hooks are
not loaded (`--setting-sources project`), so your personal prompts do not
shape the review.

## Session files

```
reviews/20261016-143701-screen-management/
├── context.md                      what the reviewer was given
├── <owner>__<repo>__pr<N>.diff     one per PR
├── hunt.json                       raw hunt output, saved before verify starts
├── findings.json                   full result; input to `post` and the UI
├── report.md                       the terminal report, plain text
├── trace.jsonl                     one event per line
└── ws/                             worktrees, removed unless --keep-workspace
```

Sessions are self-contained. You can post from one days later without
re-running the review.

## Expectations

- A set of 6 to 7 PRs, about 15,000 changed lines, takes 20 to 30 minutes.
  Hunt pass roughly $10 to $15 shown, verify passes $1 to $4 each.
- A single small PR takes 3 to 5 minutes.
- Dependent projects are read at whatever branch you have checked out
  locally. Pull them to master before an important review.
- Spec links to Jira or Confluence in a PR body are not fetched. Put the spec
  in a PR and include that PR in the set.

## Tuning

- `prompts/hunt.md`: regression classes hunted, the reporting bar, the
  dependent-project check.
- `prompts/verify.md`: how hard the second pass pushes back.
- `src/schemas.js`: fields a finding must carry. Changing these also changes
  the report, the UI, and `ARCHITECTURE.md` §5.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `no logged-in gh account can see owner/repo` | None of your `gh` logins can read it. `gh auth login` with the right account, or set `ADVREVIEW_GH_USER`. |
| `codebase root not found` | The `--codebase` path or the UI field points nowhere. Fix the path; the UI shows the repo count when it is right. |
| `claude hunt failed` with usage-limit text | Your Claude quota ran out mid-run. Wait for the reset and rerun. `hunt.json` is kept if the hunt had finished. |
| Verify pass shows `UNCERTAIN · verify pass failed` | That one verify run failed (often quota). The finding is kept unverified. |
| Trace shows paths under `reviews/.../ws/` | Normal: the reviewer reads the PR worktree, not your checkout. |
| Review button stays disabled | No PR links recognised, or the codebase root does not exist. |

## Layout

```
bin/advreview.js   CLI entry: review | post | serve
src/parse.js       PR reference and paste parsing
src/schemas.js     JSON schemas for the hunt and verify passes
src/emitter.js     trace events (trace.jsonl, stderr, UI sink)
src/gh.js          gh calls with per-owner account selection
src/checkout.js    repo lookup under the codebase root, clones, worktrees
src/claude.js      one claude -p run, streamed
src/review.js      the review flow, session files
src/report.js      report rendering, comment body
src/post.js        posting to GitHub (interactive CLI, server helper)
src/server.js      web UI backend (Node http, SSE)
ui/index.html      web UI page, single file, no build
ui/mockup.html     the static mockup the UI was built from
prompts/           hunt.md, verify.md
test/              node --test unit tests (npm test)
```

## Further reading

- `ARCHITECTURE.md`: component, sequence, state, class, and module diagrams.
- `SPEC.md`: numbered requirements with acceptance criteria and verification.
- `CLAUDE.md`: rules for changing this repo, including the doc-sync table.
