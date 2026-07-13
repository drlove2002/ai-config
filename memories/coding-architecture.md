# Coding Architecture Preferences

Apply these preferences across programming languages unless a repo-specific `AGENTS.md` overrides them.

## Structure First

- Prefer types, structs, interfaces, and classes to model domain concepts and behavior.
- Avoid loose functions and variables spread across a module when a cohesive type or structure would make scope and ownership clearer.
- Use types and structures to reduce naming ambiguity instead of making names longer.

## Reuse Before New Code

Before writing new code, look for existing functions, types, modules, helpers, patterns, libraries, or standard tools that already solve the problem. Reuse, extend, or compose them unless they do not fit.

- Extend or compose existing code before adding new modules, files, abstractions, or helpers.
- Treat rewrites and rebuilds from scratch as opt-in. Only do them when the user asks, or when existing code cannot support the change. State that reason in the plan.
- Preserve existing structure and public interfaces unless the task requires changing them or the user approves.
- Keep scope surgical. Change only what the task needs; do not reorganize adjacent code unasked.
- Prefer deleting unnecessary new code over adding wrappers, adapters, or abstractions for one use.

## File Organization

- Do not put unrelated code in one large file.
- Split code into small files by separation of concern.
- Keep modules cohesive: each file should have one clear responsibility.
- Keep coupling low: expose narrow interfaces and avoid unnecessary cross-module dependencies.

## Naming

- Prefer concise names for functions, variables, types, structs, interfaces, classes, and modules.
- Use one word where clear, two words at most when needed.
- Rely on scope, modules, and types to carry context instead of repeating context in every name.
