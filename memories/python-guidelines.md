# Python Coding Guidelines

Use this note when editing Python code, especially service and application code that will be maintained over time.

## Baseline

- Inspired by minimaxir's Python AGENTS guidance, but apply it pragmatically to the active repo instead of copying universal mandates blindly.
- Prefer clarity, maintainability, and good asymptotic behavior over clever compression.
- Use the repo's actual toolchain first.

## Working Rules

- Keep functions focused and reasonably small. Split by responsibility instead of stacking branches or hidden side effects.
- Use descriptive names, type hints on touched signatures, and explicit return types where they improve readability.
- Avoid `Any` unless the boundary is genuinely dynamic.
- Prefer early returns to reduce nesting.
- Never use mutable default arguments.
- Catch specific exceptions, add meaningful context, and do not silently swallow failures.
- Prefer context managers for resources and cleanup.
- Use the project's logger for runtime errors and operational events instead of `print`, unless the codebase already has a narrow startup or CLI exception.
- Avoid redundant comments. Add comments only for intent, invariants, async ordering, protocol behavior, or non-obvious tradeoffs.
- Organize imports as standard library, third-party, then local imports unless the formatter or repo conventions already rewrite them.

## Quality Bar

- Favor efficient algorithms and data access patterns, but do not chase micro-optimizations that reduce debuggability.
- Reuse existing libraries and repo helpers when they materially reduce code and complexity.
- Add or update tests for new logic when the repo has a practical testing path.
- Run the repo's formatter, linter, and configured type checker where feasible.

## Async Focus

- Keep async flows explicit and boring.
- Avoid blocking work in async paths.
- Minimize shared mutable state.
- Be careful with task lifecycles, cancellation, retries, and cleanup.
- Do not hold scarce resources longer than necessary.
