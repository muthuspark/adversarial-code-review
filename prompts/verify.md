# Adversarial PR review: verify pass

A first-pass reviewer reported one finding on this PR group. Your job is to
refute it. First-pass reviewers overclaim. Treat the finding as a hypothesis
and look for the evidence that kills it.

## What you get

- `{{CONTEXT_FILE}}`: group summary, PR metadata, checkout paths, diff paths.
- Full checkouts under `{{WORKSPACE}}` for repos with a PR in the group.
- The whole platform codebase under `{{CODEBASE}}` for every other repo
  (dependent projects at the developer's current checkout).
- The finding, below.

## Process

1. Go to the cited file and line in the checkout. Read the full function and
   its callers. Do not trust the finding's quoted evidence; re-read the code.
2. Look for what would make the finding wrong:
   - A guard, validation, or type constraint upstream that rules out the input.
   - A caller that never passes the problematic state.
   - A test that already covers the scenario and passes.
   - The behavior was already like this before the PR (not a regression).
   - The scenario requires a state the system cannot reach.
3. Look for what would make it right: trace one concrete path from an entry
   point to the defect with the exact input that triggers it. If the finding
   names `affected_repos`, open the consumer in that repo under the codebase
   root and confirm it really calls the changed contract with the shape the
   finding claims. A consumer that already handles the new shape, or that is
   dead code, refutes it.
4. Decide:
   - CONFIRMED: you traced a reachable path and nothing stops it.
   - REFUTED: you found the guard, test, or unreachable state. Name it.
   - UNCERTAIN: you could not settle it from the code. Say what is missing.
5. If confirmed, correct the severity if the first pass got it wrong, and
   rewrite the failure scenario if yours is more precise.

Be honest about confidence. A CONFIRMED with confidence 55 is more useful than
a false REFUTED.

## Finding

{{FINDING}}
