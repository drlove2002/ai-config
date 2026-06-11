---
name: recover
description: Surgical recovery from production regressions caused by agent-introduced bugs. Finds the commit, classifies changes as intended vs drift, surgically reverts unrelated edits, checks blast radius on callers, and writes a regression test. Use when a client reports a bug, a regression is found in production, or the user says "what broke?" or "revert this safely".
---

# Regression Recovery

Recover from a production bug introduced by an agent change. The goal is surgical reversion — preserve the intended work, remove only the parts that caused harm, and add a regression test so it doesn't happen again.

## 1. Find the Commit

Ask the user which area is broken (command, feature, file). Then:

```bash
git log --oneline -20 -- <affected files>
```

Identify the commit that introduced the regression. If uncertain, present the candidates and let the user choose.

## 2. Full Diff Review

```bash
git show <commit> --stat          # Every file touched
git show <commit> -- <file>       # Per-file diff
```

## 3. Classify Every Changed Hunk

For each changed hunk, label it:

- `[FEATURE]` — part of the intended change. Keep.
- `[DRIFT]` — unrelated edit (cleanup, refactor, "improvement") that shouldn't have shipped. Revert.

Present the classification to the user before acting. Do not decide alone.

## 4. Blast Radius on Drifted Code

For every function, class, or import touched by `[DRIFT]` changes:

```bash
grep -r "function_name\|ClassName" --include="*.py" .
```

List every caller. Check if any of those callers have side-effect bugs from the drift.

## 5. Surgical Revert

For `[DRIFT]` hunks only — preserve `[FEATURE]` work:

```bash
# Revert a whole file back to pre-commit state
git checkout <commit>^ -- <file>

# OR for partial revert: use git checkout -p to select hunks
git checkout <commit>^ -- <file1> <file2>
```

If the drift is mixed into the same file as feature work, use `git checkout -p <commit>^ -- <file>` to interactively select hunks. Present the diff before committing.

## 6. Regression Test

Write a test that reproduces exactly what the client reported:

- The specific input or action
- The expected behavior
- The actual broken behavior before the fix

Run it, show it fails on the old code, passes after the revert.

## 7. Verify

```bash
# Run the regression test
# Run the existing test suite for the touched area
# Confirm the feature still works
```

Present results. Ask if this should be committed as a single `fix:` commit.

## Guardrails

- Never revert the entire commit blindly. Preserve feature work.
- Never add unrelated cleanup during recovery. Fix only the regression.
- Always present the classification before reverting. Let the user confirm.
- After recovery, save a brief postmortem to `wwideas/issues/` — what drifted, why, and which guardrail would have caught it.
