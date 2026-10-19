# advreview: Software Requirements Specification

| Field | Value |
|---|---|
| Document | SRS for advreview, adversarial pull-request review tool |
| Version | 1.1 |
| Status | Baseline, matches the code as of 2026-10-16 (Node.js port) |
| Format | IEEE 29148 style: introduction, overall description, specific requirements, verification |
| Owner | Muthukrishnan Thukkaram |
| Related | `ARCHITECTURE.md` (design), `README.md` (usage), `package.json`, `prompts/hunt.md`, `prompts/verify.md` |

Requirement language: **shall** is mandatory, **should** is recommended, **may** is optional. Each requirement has an ID for traceability. Acceptance criteria use Given / When / Then.

---

## 1. Introduction

### 1.1 Purpose

This document specifies the requirements for advreview, a tool that reviews a set of dependent GitHub pull requests adversarially and reports defects that have a high probability of causing a regression or bug if merged. It is written for the maintainers of the tool and for reviewers who want to know what the tool guarantees.

### 1.2 Scope

advreview covers:

- Taking a set of pull-request links from a human reviewer.
- Checking out every PR at its head commit, with full repository history.
- Running an adversarial review over the whole set in one context, using the locally installed `claude` CLI.
- Validating the PRs against a specification when one is part of the set.
- Checking dependent projects in the same codebase for consumers that the PRs break.
- Verifying each candidate finding in a separate, independent pass.
- Presenting the findings to the human in a terminal and in a local web page.
- Posting selected findings to GitHub as review comments, one at a time, each after explicit human confirmation.

advreview does not cover:

- Automated merge decisions or CI gating.
- Fixing code.
- Style, formatting, or naming review.
- Running tests, builds, or any code from the PRs.

### 1.3 Definitions

| Term | Meaning |
|---|---|
| PR | A GitHub pull request, identified by owner, repository, and number. |
| Group | The complete set of PRs pasted for one review. Always reviewed as one unit. |
| Session | One review run and its output directory under `reviews/`. |
| Codebase root | A directory holding every repository of the platform, one clone per subdirectory. Default `~/workspace/git`. |
| PR repo | A repository that has a PR in the group. |
| Dependent project | A repository under the codebase root that has no PR in the group. |
| Worktree | A git worktree of a PR repo at the PR head commit, created for the session. |
| Hunt pass | The first `claude -p` run. Reads everything and emits candidate findings. |
| Verify pass | One `claude -p` run per candidate finding, instructed to refute it. |
| Finding | A reported defect with file, line, severity, failure scenario, evidence, and confidence. |
| Spec | Requirements the PRs claim to implement, found in a PR body or in a spec file in the group's diffs. |
| Trace | The ordered list of events a session emits: checkouts, tool calls, model notes, verdicts. |
| Claude CLI | The `claude` command-line tool, logged in with the reviewer's account. |

### 1.4 References

- `ARCHITECTURE.md`: component, sequence, state, and class diagrams.
- asdlc.io, "Adversarial Code Review" pattern: the critic-agent model this tool follows.
- GitHub REST API, pull request review comments endpoint.
- Claude Code CLI documentation, `--print`, `--output-format stream-json`, `--json-schema`, `--allowedTools`.

---

## 2. Overall description

### 2.1 Product perspective

advreview is a standalone local tool. It sits between the deterministic quality gates (compilers, linters, CI tests) and the human acceptance gate. It consumes PRs from GitHub through the `gh` CLI, runs the review through the `claude` CLI, and writes results to disk. It has two front ends, a CLI and a local web page, over one core module.

```
reviewer ──> CLI or web UI ──> core (src/*.js) ──> gh, git, claude -p
                                      │
                                      └──> reviews/<session>/  (report, findings, trace)
```

### 2.2 Product functions

1. Parse pasted PR links into one group.
2. Resolve each PR's repository under the codebase root, or clone it.
3. Create a worktree at each PR head.
4. Build a context document describing the group, the checkouts, and every repo under the codebase root.
5. Run the hunt pass and collect structured candidate findings and spec compliance.
6. Run a verify pass per finding and record a verdict.
7. Render a report to the terminal, to disk, and to the web page.
8. Stream the trace live to the web page.
9. Post confirmed findings to GitHub.

### 2.3 User classes

| User | Needs |
|---|---|
| Reviewer (primary) | Paste links, wait, read a short ranked list of real problems, decide what to post. |
| Maintainer of advreview | Change prompts, schemas, and flow without breaking the two front ends. |

### 2.4 Operating environment

- macOS or Linux workstation with Node.js 18.17 or newer. No npm dependencies.
- `git` 2.20 or newer.
- `gh` CLI, logged in to at least one account that can read the target repositories.
- `claude` CLI, logged in. No API key is used or stored.
- Network access to GitHub.
- A modern browser for the web UI.

### 2.5 Design constraints

- C-1: No API key. All model access goes through the logged-in `claude` CLI.
- C-2: No npm dependencies. Node built-ins only. No build step for the UI.
- C-3: The reviewer model shall never execute PR code, tests, or builds.
- C-4: Nothing is written to GitHub without a per-finding human confirmation.
- C-5: The reviewer's own branches and working trees under the codebase root are never modified.

### 2.6 Assumptions and dependencies

- A-1: Dependent projects under the codebase root are at whatever branch the developer has checked out. The tool reports against that state and says so.
- A-2: The spec for a feature, when it exists, is in a PR body or in a file changed by a PR in the group. There is no side channel for a spec.
- A-3: `claude` honors `--allowedTools` and `--permission-mode dontAsk`, so writes are denied. Claude Code may still auto-allow a few read-only shell commands such as `wc` or `ls`.
- A-4: Usage limits on the Claude account may interrupt a run. The tool degrades rather than losing completed work.

---

## 3. Specific requirements

### 3.1 Input and grouping

**FR-1** The system shall accept PR references in these forms: `https://github.com/{owner}/{repo}/pull/{n}` with any trailing path or query, `{owner}/{repo}#{n}`, and `{owner}/{repo}/pull/{n}`.

**FR-2** The system shall treat every PR reference in one paste or one command line as a single group, regardless of blank lines between them.

**FR-3** The system shall use the first non-PR text line of a paste, if any, as the group label. Other text lines shall be ignored.

**FR-4** The system shall reject input that contains no PR reference with a clear error.

Acceptance:
- Given a paste with two blank-line-separated blocks of links and a text line "Screen management", When parsed, Then one group with all links and the label "Screen management" results.

### 3.2 Repository access

**FR-5** The system shall locate each PR's repository under the codebase root by matching the `origin` remote to `{owner}/{repo}`, case-insensitive, with or without `.git`.

**FR-6** If no match exists, the system shall clone the repository with full history into `~/.cache/advreview/repos/{owner}__{repo}` and reuse it on later runs.

**FR-7** The system shall fetch `origin` and the PR head ref, then create a detached git worktree at the PR head commit under `reviews/{session}/ws/`. The source clone's checked-out branch and working tree shall not change.

**FR-8** When two PRs in a group belong to the same repository, each shall get its own worktree.

**FR-9** The system shall remove the worktrees when the session ends, unless the user asks to keep them.

**FR-10** The system shall select, per repository owner, a logged-in `gh` account that can read the repository, without changing the global active `gh` account. The user may force an account with `ADVREVIEW_GH_USER`.

**FR-11** The codebase root shall be configurable from the CLI (`--codebase`), the web UI (a field on the page), and the environment (`ADVREVIEW_CODEBASE`), with default `~/workspace/git`. A root that does not exist shall be rejected before any checkout.

### 3.3 Review context

**FR-12** The system shall write a context document for the session containing: the label, every PR's URL, author, title, body, base and head refs and commits, changed-file list, worktree path, and diff file path; the codebase root; and the list of every repository under the root, marking those that have a PR in the group.

**FR-13** The system shall save each PR's unified diff as a file in the session directory.

**FR-14** The reviewer model shall have read access to the session directory, the worktrees, and the entire codebase root.

### 3.4 Hunt pass

**FR-15** The system shall run exactly one hunt pass per group, covering all PRs in one model context.

**FR-16** The hunt pass shall instruct the model to: read every diff in full; find every caller and consumer of each changed symbol in the full checkouts; check contracts between PRs in the group and the effect of deploying them in any order or alone; grep the whole codebase root for consumers of each changed public contract and report consumers in dependent projects; extract spec requirements and mark each met, partial, missing, or contradicted; attempt to refute each candidate before reporting it.

**FR-17** The hunt pass shall report only findings that have a concrete failure scenario, a file and line in a PR worktree, and a confidence of 50 or more. Style, naming, formatting, and speculative future needs shall not be reported.

**FR-18** The hunt pass shall hunt, at minimum, these regression classes: unintended behavior change on an existing path; null, empty, missing-key and boundary inputs; error handling and cleanup; concurrency; data and schema migration; public contract breaks; resource leaks; security regressions; deleted or weakened tests and untested new branches.

**FR-19** The hunt pass shall return JSON validated against `HUNT_SCHEMA`: summary, spec (found, source, requirements), cross-PR notes, and findings with id, repo, PR number, file, line, severity (critical, high, medium), category, title, problem, failure scenario, evidence, confidence, cross_pr, spec_gap, affected_repos, suggested_fix.

**FR-20** The system shall save the raw hunt output to `hunt.json` before the verify pass starts, so a failed verify pass cannot lose it.

### 3.5 Verify pass

**FR-21** The system shall run one verify pass per candidate finding, each in a fresh model context, with the same read access as the hunt pass.

**FR-22** The verify pass shall instruct the model to re-read the cited code and its callers, look for guards, tests, unreachable states, and pre-existing behavior that refute the finding, and trace one concrete path that confirms it. For findings with `affected_repos`, it shall open the consumer in the dependent project and confirm the call.

**FR-23** The verify pass shall return one of CONFIRMED, REFUTED, UNCERTAIN with confidence, reasoning, evidence, severity, and a failure scenario.

**FR-24** When the verdict is CONFIRMED, the finding's severity and failure scenario shall be replaced by the verifier's values.

**FR-25** Verify passes shall run concurrently, with a configurable limit (default 4).

**FR-26** If a verify pass fails for any reason, the finding shall be kept with verdict UNCERTAIN and the error recorded. The session shall still complete.

**FR-27** The user may skip the verify pass (`--no-verify`). Findings are then reported as unverified.

### 3.6 Findings and report

**FR-28** The system shall order findings by verdict (CONFIRMED, UNCERTAIN, REFUTED), then severity (critical, high, medium), then confidence descending.

**FR-29** The report shall contain: the PR list with links; the summary; cross-PR notes when present; spec compliance with each requirement's status and evidence for non-met ones; each non-refuted finding with severity, verdict and confidence, title, repo and PR, file and line, category, problem, failure scenario, evidence, suggested fix, and flags CROSS-PR, SPEC-GAP, and AFFECTS {repo}; and refuted findings in a separate footer with the verifier's reasoning.

**FR-30** The system shall write `findings.json` (full structured result), `report.md` (plain text report), `trace.jsonl` (one event per line), `context.md`, `hunt.json`, and the diff files into `reviews/{timestamp}[-{label}]/`.

**FR-31** When no finding survives, the report shall say PASS and show the spec table.

### 3.7 Trace

**FR-32** The system shall emit a trace event for: each PR checkout; the start and end of each model run with turn count and cost; each tool call the model makes (tool name and a one-line argument summary with paths shown relative to the worktree); each text note the model writes; each verify verdict with running count; session completion; and errors.

**FR-33** Trace events shall carry a timestamp, a phase (checkout, hunt, verify, done), a kind, and a message.

**FR-34** Paths in trace messages shall be shown relative to the worktree or session directory.

### 3.8 Command-line interface

**FR-35** `advreview review <refs...> | --input FILE | --input -` shall run a session and print the report with ANSI colors when attached to a terminal.

**FR-36** `review` shall accept `--codebase`, `--model`, `--no-verify`, `--parallel`, `--max-turns`, `--verify-turns`, `--keep-workspace`.

**FR-37** `advreview post <session-dir>` shall walk the non-refuted findings and, for each, show the comment and accept `y` (post), `n` (skip), `e` (edit in `$EDITOR` then re-ask), `q` (stop).

### 3.9 Web interface

**FR-38** `advreview serve [port]` shall serve a single HTML page on `localhost:8765` by default using only Node built-in modules.

**FR-39** The page shall provide: a text area for PR links with a live parse preview (PR count and label); a codebase root field with live validation and repo count, remembered in the browser; a Review button, disabled until the input parses and the root exists; a trace pane that streams events live grouped by phase, with running cost and tool-call count; a report pane that renders the report when the session ends; a History dropdown that reopens any past session with its trace and report; a Copy report.md button.

**FR-40** The server shall expose: `GET /api/config`, `GET /api/parse`, `POST /api/review`, `GET /api/run`, `GET /api/events` (Server-Sent Events), `GET /api/sessions`, `GET /api/session`, `POST /api/post`.

**FR-41** The event stream shall support resuming from an event index so a reconnecting client misses nothing.

**FR-42** A review started from the page shall keep running if the page is closed; its results shall be reachable from History.

### 3.10 Posting to GitHub

**FR-43** The system shall post a finding only after the human has seen that finding's full comment text and confirmed it individually. Bulk confirmation shall not exist.

**FR-44** In the web UI, Post selected shall open a dialog per ticked finding with the editable comment, the target file and line, and buttons Post, Skip, Stop.

**FR-45** The server shall refuse `POST /api/post` unless the body carries `confirmed: true`.

**FR-46** A posted comment shall be an inline pull-request review comment at the finding's file and line on the exact head commit that was reviewed. If GitHub rejects the position, the system shall post a general PR comment that names the file and line instead, and report which happened.

**FR-47** A posted finding shall show as posted in the UI with a link, and its checkbox shall be disabled.

### 3.11 Safety and permissions

**FR-48** Every model run shall use `--permission-mode dontAsk` and an allowlist limited to Read, Grep, Glob, Agent, and `git log`, `git diff`, `git show`, `git blame`, `git grep`, `git status`, plus `ls`, `wc`, `cat`, `head`, `tail`. No write, edit, network, package, test, or build command shall be allowed.

**FR-49** Every model run shall load settings from the project scope only (`--setting-sources project`) so the reviewer's personal hooks, output styles, and prompts do not shape the review.

**FR-50** Every model run shall request structured output through `--json-schema`; the system shall never parse findings out of free text.

### 3.12 Error handling

**FR-51** A failed hunt pass shall end the session with an error in the trace and the terminal; worktrees shall still be cleaned up.

**FR-52** A `gh` account that cannot see a repository shall produce an error naming the repository and the accounts tried.

**FR-53** The web server shall survive any failure inside a session and report the error in the session's tab.

---

## 4. Non-functional requirements

**NFR-1 Independence.** Each model run shall start with a fresh context: the prompt, the context document, the diffs, and the checkouts. No builder reasoning, chat history, or earlier model output other than the finding under verification shall be passed in.

**NFR-2 Precision over recall.** The tool shall favor fewer, verified findings. A confidence floor of 50 and a refutation pass are mandatory in the default configuration. (This is a deliberate departure from the asdlc.io pattern's "favor false positives".)

**NFR-3 Performance.** A group of 6 to 7 PRs totalling about 15,000 changed lines should complete in 30 minutes or less on a subscription account with default settings. The trace should show the first tool call within 20 seconds of the hunt starting.

**NFR-4 Cost visibility.** Each model run's reported cost shall appear in the trace and the UI header, even when the account is a flat subscription.

**NFR-5 Reproducibility.** A session directory shall contain everything needed to re-render the report and to post findings later, without re-running the review.

**NFR-6 Portability.** The tool shall run on Node.js 18.17+ with built-in modules only and shall declare no npm dependencies. The UI shall be one HTML file with no build step and no external script or stylesheet.

**NFR-7 Session compatibility.** Session directories written by earlier versions shall keep opening from History and from `post`; the shapes of `findings.json`, `trace.jsonl`, and `report.md` are a stable interface.

**NFR-8 Documentation sync.** `ARCHITECTURE.md` shall be updated in the same change as any behavior change, per the table in `CLAUDE.md`. This SRS shall be updated when a requirement is added, removed, or changed.

---

## 5. Data requirements

### 5.1 Finding

| Field | Type | Rule |
|---|---|---|
| id | string | `F{n}`, assigned by the system after the hunt pass |
| repo | string | `{owner}/{repo}` of the PR repo |
| pr_number | int | PR in the group |
| file | string | path relative to the repo root, at the PR head |
| line | int | 1-based line at the PR head |
| severity | enum | critical, high, medium |
| category | string | free text, e.g. behavior-regression, deploy-order |
| title | string | one line |
| problem | string | two or three sentences |
| failure_scenario | string | concrete input or state, then the wrong result |
| evidence | string | file:line references and the proving line of code |
| confidence | int | 0 to 100; hunt reports 50 or more |
| cross_pr | bool | defect exists only because two PRs in the group interact |
| spec_gap | bool | finding is a spec requirement the PR fails |
| affected_repos | string[] | directory names under the codebase root with a broken consumer and no PR in the group |
| suggested_fix | string | may be empty |
| verification | object | verdict, confidence, reasoning, evidence, severity, failure_scenario; absent when `--no-verify` |
| posted_url | string | UI only, set after a successful post |

### 5.2 Session result (`findings.json`)

session, label, codebase, created, prs (owner, repo, number, url, title, head_sha), summary, spec, cross_pr_notes, findings (sorted).

### 5.3 Trace event (`trace.jsonl`)

ts, phase, kind (info, ok, warn, error, tool, text, verdict, done), msg, and optional tag, cost, turns, id, verdict, done, total, session, label, findings.

---

## 6. Verification

Each requirement is verified by one of: **T** automated or manual test on a known PR, **I** inspection of code or prompt, **D** demonstration in the UI.

| Requirements | Method | How |
|---|---|---|
| FR-1 to FR-4 | T | `npm test` runs `test/parse.test.js` against a paste with mixed forms, blank lines, and a label |
| FR-5 to FR-11 | T, I | run against a repo present under the root and one absent; inspect `git worktree list` before and after |
| FR-12 to FR-14 | I | read `context.md` of a session; confirm `--add-dir` arguments |
| FR-15 to FR-20 | T, I | run on `psf/requests#7586` (expect PASS) and `psf/requests#7415` (expect the history-pickle regression); inspect `hunt.json` |
| FR-21 to FR-27 | T | run on a group with a known false positive (`psf/requests#7520 + #7415` produced one refuted finding) |
| FR-28 to FR-31 | I | compare `report.md` to `findings.json` |
| FR-32 to FR-34 | D | watch the trace pane during a run |
| FR-35 to FR-37 | T | run `review --help`, run `post` on a saved session and answer `n` to all |
| FR-38 to FR-42 | D | `advreview serve`, run a review, reload mid-run, reopen from History |
| FR-43 to FR-47 | D, T | tick a finding, Post selected, press Stop; `curl` `/api/post` without `confirmed` and expect 400 |
| FR-48 to FR-50 | T | ask the model to run `touch` in a session; expect a permission denial in the result |
| FR-51 to FR-53 | T | point `--codebase` at a missing directory; kill `claude` during a verify pass |
| NFR-1 to NFR-7 | I | code and prompt review |

Baseline evidence as of 2026-10-16: the whatfix rrweb chunkification group (7 PRs) produced 5 candidates, 4 confirmed, 1 refuted; the single-PR `psf/requests#7586` run produced PASS with 4 of 4 spec requirements met, then one medium finding after the dependent-project prompt was added.

---

## 7. Open items

| ID | Item | Status |
|---|---|---|
| O-1 | Reconnect a reloaded page to a running session by run id | Open |
| O-2 | Per-finding `test_requirements` field, as the asdlc.io pattern suggests | Open |
| O-3 | Explicit check of negated spec constraints ("must not") in the hunt prompt | Open |
| O-4 | Parallel critic lanes (architecture, security, QA) with a merge pass | Deferred until single-pass misses are observed |
| O-5 | Spec sourced from Jira or Confluence links in the PR body | Rejected; spec must be a PR in the group |
