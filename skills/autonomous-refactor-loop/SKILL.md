---
name: autonomous-refactor-loop
description: Autonomous inspect-simplify-test loop for existing codebases. Use when the user wants to optimize, simplify, refactor, improve readability, reduce duplication, or asks for an autonomous prompt that keeps inspecting code, making the highest-value cleanup, testing it, and repeating until further simplification is low value.
---

# Autonomous Refactor Loop

## Workflow

1. Inspect the relevant code first.
2. Identify the highest-value simplification or cleanup.
3. If the architecture or naming is unclear, resolve that before editing.
4. If the task is broad, break it into the smallest safe step that still improves the code.
5. If behavior changes are needed, use TDD:
   - write one failing test
   - make the smallest change that passes
   - rerun the relevant tests
6. Prefer fewer concepts, fewer branches, smaller functions, and clearer names.
7. Remove duplication only when the replacement is simpler than the original.
8. Keep changes local and avoid speculative abstractions.
9. Repeat the inspect-simplify-test loop until further simplification would be low value or risky.

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
