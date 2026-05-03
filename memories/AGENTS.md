# AGENTS

Instructions for `~/.config/ai/memories`.

## Files

- **`writing-style/`** — Prose quality rules: cut filler, break formulaic structures, active voice, be specific. Applies to all text output (articles, comments, PRs, commit messages). Bundled references: phrases, structures, examples.
- **`python-guidelines.md`** — Python coding standards: small functions, type hints, early returns, async patterns, context managers.
- **`rust-guidelines.md`** — Rust coding standards: ownership clarity, modular files, domain types over bools, error context. Includes WWAPI-specific focus on state transitions and observability.
- **`nextjs-guidelines.md`** — Next.js App Router standards: default to server components, thin client components, explicit caching, React Compiler patterns. Includes WWPAGE-specific focus (reactCompiler: true).

## Purpose

- Store durable context that should survive across sessions
- Keep memories short, factual, and stable over time
- Use memories for identity, preferences, recurring project facts, and standing constraints

## What belongs here

- Stable user preferences
- Cross-project rules that repeatedly matter
- Important architectural facts that are costly to rediscover
- Notes about long-lived workflows, deployment habits, or repo conventions

## What does not belong here

- Session chatter
- Temporary plans
- Debug logs
- One-off command output
- Fast-changing facts that should be re-verified from source

## Writing rules

- Prefer one file per topic
- Use direct titles and short sections
- Update existing memory before creating duplicates
- If a fact belongs to a specific repo, prefer that repo's `AGENTS.md` over copying it here unless it affects cross-project reasoning
