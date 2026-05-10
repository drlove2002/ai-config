# Coding Architecture Preferences

Apply these preferences across programming languages unless a repo-specific `AGENTS.md` overrides them.

## Structure First

- Prefer types, structs, interfaces, and classes to model domain concepts and behavior.
- Avoid loose functions and variables spread across a module when a cohesive type or structure would make scope and ownership clearer.
- Use types and structures to reduce naming ambiguity instead of making names longer.

## File Organization

- Do not put unrelated code in one large file.
- Split code into small files by separation of concern.
- Keep modules cohesive: each file should have one clear responsibility.
- Keep coupling low: expose narrow interfaces and avoid unnecessary cross-module dependencies.

## Naming

- Prefer concise names for functions, variables, types, structs, interfaces, classes, and modules.
- Use one word where clear, two words at most when needed.
- Rely on scope, modules, and types to carry context instead of repeating context in every name.
