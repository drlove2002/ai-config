# AGENTS

Instructions for `~/.config/ai/rules`.

## Files

- **`default.rules`** — Command allowlist. Permitted prefixes include: `nix develop`, `nix eval`, `nix flake`, `cargo test`, `cargo build`, `cargo clippy`, `pnpm build`, `pnpm dev`, `psql -d`, `git -C ... push`, `xdg-open`, `uv run`, `mkdir -p` (specific paths), `bash -lc` (wrapped commands). All other commands require user approval.
- **`orchestrator.md`** — Always-active session protocol: understand before building (verify, don't assume), context hygiene (use subagents for exploration, save context), implementation discipline (direct, simple, verify before claiming done).
- **`voice-speaking.md`** — Voice output rules for when and how to use `<voice>` tags.

## Purpose

- Store reusable agent rule files that can be consulted across tasks
- Keep these rules generic enough to apply in multiple repos or sessions
- Use this directory for operational policy, not for project documentation

## Rules for rule files

- One concern per file when practical
- Prefer short, explicit rules over broad narrative
- Record exceptions when they are real and recurring
- Link to the authoritative project source when a rule depends on a specific repo

## Boundaries

- Do not duplicate whole project `AGENTS.md` files here
- Do not store volatile notes that belong in `memories/`
- Do not put scratch prompts, transcripts, or temporary experiments here
