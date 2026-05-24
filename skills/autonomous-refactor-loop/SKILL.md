---
name: autonomous-refactor-loop
description: Inspect-simplify-test loop for existing codebases after user plan approval. Use when the user wants to optimize, simplify, refactor, improve readability, reduce duplication, or asks for a loop that inspects code, proposes the highest-value cleanup, waits for approval, tests it, and repeats until further simplification is low value.
---

# Approved Refactor Loop

## Workflow

1. Inspect the relevant code first.
2. Identify the highest-value simplification or cleanup.
3. Present the smallest safe plan to the user before editing.
4. Wait for user approval.
5. If the architecture or naming is unclear, resolve that before editing.
6. If behavior changes are needed, use TDD after approval:
   - write one failing test
   - make the smallest change that passes
   - rerun the relevant tests
7. Prefer fewer concepts, fewer branches, smaller functions, and clearer names.
8. Remove duplication only when the replacement is simpler than the original.
9. Keep changes local and avoid speculative abstractions.
10. After each loop, report results and propose the next cleanup. Wait for approval before the next edit.

## Decision Rules

- Use `improve-codebase-architecture` when the main problem is structural friction.
- Use `domain-model` and `ubiquitous-language` when terms, boundaries, or concepts are fuzzy.
- Use `request-refactor-plan` when the work needs safe incremental decomposition.
- Use `tdd` for any behavior change.
- Use `smart-commit` when the work is ready to package cleanly.

## Stop Conditions

- Stop when the remaining cleanup is cosmetic or low leverage.
- Stop when a simplification would need broader changes than the current task justifies.
- Stop and report when you hit a real blocker or ambiguous design choice.
