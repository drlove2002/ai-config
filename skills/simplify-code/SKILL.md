---
name: simplify-code
description: >-
  Review uncommitted changes, unpushed commits, or a provided git diff range with a reuse-first simplification lens. Use when the user asks to simplify code, reuse existing code, reduce new code, clean up uncommitted changes, review unpushed commits for redundancy, or avoid rebuilding from scratch.
---

# Simplify Code

Reuse-first simplification of recent changes. Reduce new code, not just restyle it. Operates on uncommitted changes, unpushed commits, or a user-provided diff range.

## Workflow

### 1. Collect change scope

Run the bundled helper (resolved from this skill's directory):

```bash
bash scripts/collect-changes.sh [<diff-range>]
```

- No arg → uncommitted changes (tracked modified + staged + untracked) and unpushed commits against upstream.
- Arg given (e.g. `main..HEAD`, `HEAD~3`, `abc123`) → that range/ref.

If the user points at specific files or paths instead of a range, scope to those.

### 2. Inspect existing code before judging new code

For every added or modified block, read the surrounding module and related files first (use `scout` for 2+ files). Do not flag new code as redundant until you know what already exists. The reuse check is the first question, not an afterthought.

### 3. Find reuse opportunities

Search for code that already does the new code's job:
- helper / utility functions
- existing types, structs, interfaces, classes
- modules or patterns already in the repo
- standard library or already-imported libraries
- project tooling that replaces hand-rolled logic

Prefer extending or composing existing code over adding new files, wrappers, or abstractions.

### 4. Classify findings

Tag each observation:
- **REUSE** — replace new code with an existing helper/type/pattern.
- **DELETE** — new code is unnecessary; remove it.
- **MERGE** — duplicate logic across files; consolidate.
- **KEEP** — new code is justified; leave it.
- **RISK** — touches a public interface, shared helper, or wide blast radius; verify callers before touching.

### 5. Present a simplification plan

Before any edit, show: files, each finding with its tag, the proposed change, risks, and verification steps. Wait for explicit approval. Collecting scope, classifying findings, or your own confidence is not approval.

### 6. Edit surgically (after approval)

- Change only what the task needs; avoid reorganizing adjacent code.
- Preserve existing public interfaces and structure unless the user approves changing them.
- Before modifying any function/class, grep all callers and summarize blast radius.
- Delete imports/variables your changes made unused. Leave pre-existing dead code alone.
- Minimum code, no speculative abstractions.

### 7. Verify

- Run the repo formatter/linter, tests, and build where feasible.
- For multi-file changes (2+ files or 30+ lines), delegate to the `reviewer` subagent.
- Show proof: tests pass, build exits 0, or the simplification diff.

### 8. Leave changes uncommitted

Do not stage or commit. After verification, suggest the `commit` skill for logical commits if the user wants them. Never push.

## Stop conditions

- Every finding is KEEP or requires changes broader than the task justifies.
- The user says "good enough."
- A simplification would alter a public interface or semantics the user hasn't approved.

## Guardrails

- No guessing: if you don't know whether code is reused elsewhere, search or ask.
- Inspect git history (`git log --oneline -10 -- <file>`) before changing files that predate the change set.
- Never assume a workspace is a single git repo; use the resolved repo root.
- No production or external mutation. Read-only until approved edits; never push.
