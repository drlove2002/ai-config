# Rust Coding Guidelines

Use this note when editing Rust code, especially service or library code that may become long-lived.

## Baseline

- Follow the intent of Microsoft-style Rust engineering discipline from `lx-industries/ms-rust-skill`: prefer small, explicit, maintainable changes over cleverness.
- Use the Rust API Guidelines checklist as the public-API quality bar: https://rust-lang.github.io/api-guidelines/checklist.html

## Working Rules

- Prefer clear ownership, explicit types at boundaries, and predictable control flow.
- Keep functions focused. Split long functions by responsibility instead of stacking branches and mutable state.
- Avoid boilerplate-heavy designs when a smaller explicit abstraction will do the job.
- Prefer modular file structure over single large files. Split growing features by responsibility before they turn into god modules.
- Prefer domain types and enums over `bool`, ad-hoc tuples, or loosely-typed strings when they encode behavior.
- Return meaningful error types. Add context at boundaries and avoid lossy `map_err(|_| ...)` conversions unless intentional.
- Validate inputs near the boundary where invalid state enters the system.
- Keep async and concurrency code boring: minimize shared mutable state, make lock scope small, and avoid holding locks across awaits.
- Prefer iterator and collection code that stays readable under debugging. Do not compress important business logic into dense chains.
- Derive and implement standard traits when they improve interoperability and debugging: especially `Debug`, `Clone`, `Default`, `Eq`, `PartialEq`, and conversion traits where appropriate.
- For public or reused interfaces, check naming, conversions, documentation, error semantics, trait impls, and future-proofing against the Rust API Guidelines checklist.
- Add comments only where intent is non-obvious, especially around invariants, safety assumptions, scheduler behavior, or persistence semantics.

## WWAPI Focus

- Favor correctness and recoverability over micro-optimizations in state, persistence, and scheduler code.
- Make state transitions explicit. Hidden side effects across Redis, PostgreSQL, in-memory state, and gRPC boundaries should be avoided.
- Prefer changes that preserve observability: useful logs, debuggable types, and errors that retain cause and domain meaning.
