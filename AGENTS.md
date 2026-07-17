# Global AI Agent Configuration

This directory (`~/.config/ai`) serves as the central operating state and knowledge base for all AI coding agents. It provides a standard environment across all workspaces.

## Context Resolution Priority

When working, always respect instructions in this order:

1. Repo-specific `AGENTS.md` (inside the active project)
2. Workspace-level `AGENTS.md` (e.g., mono-repo root)
3. Global rules & memories (`~/.config/ai/rules/` and `~/.config/ai/memories/`)
4. This global `~/.config/ai/AGENTS.md`

## Directory Tree

```
~/.config/ai/
├── AGENTS.md              ← this file (global defaults, context resolution, subagent routing)
├── agents/
│   ├── AGENTS.md           ← subagent catalog (capabilities, models, tools per agent)
│   ├── <agent-name>.md     ← subagent definition files (discovered at runtime)
│   └── ...
├── extensions/
│   ├── clear-command.ts    ← /clear command (permanently delete session)
│   ├── pi-rules.ts         ← lean system prompt injection + context widget
│   ├── user-decisions.ts   ← interactive TUI questionnaire + /edit-decisions command
│   └── subagent/           ← subagent tool (spawn isolated pi processes)
├── memories/
│   ├── AGENTS.md           ← memory directory guide
│   ├── writing-style/           ← prose quality rules + references (phrases, structures, examples)
│   ├── python-guidelines.md     ← Python coding standards
│   ├── rust-guidelines.md       ← Rust coding standards + WWAPI focus
│   └── nextjs-guidelines.md     ← Next.js App Router standards + WWPAGE focus
├── rules/
│   ├── AGENTS.md           ← rules directory guide
│   ├── default.rules       ← command allowlist (cargo, pnpm, git, psql, uv, etc.)
│   └── orchestrator.md     ← always-active session protocol (context hygiene, subagent routing, implementation discipline)
├── skills/                 ← on-demand workflows (TDD, bug triage, refactor plans, DDD, etc.)
├── settings.json           ← default provider/model + thinking level (see settings.json)
├── models.json             ← provider + model definitions (commandcode, opencode-zen, groq, cloudflare, nvidia-nim, etc.)
├── auth.json               ← API keys (permissions: 600)
└── packages/               ← npm packages (pi-agent-browser)
```

## Directory Usage

- **`agents/`**: Specialized subagent definitions (system prompts, tool sets, models). See `agents/AGENTS.md` for catalog.
- **`extensions/`**: Custom TypeScript plugins for pi (tools, commands, system prompt hooks).
- **`memories/`**: Durable tech preferences and project guidelines. See `memories/AGENTS.md` for index.
- **`rules/`**: Operational policies and command allowlists. See `rules/AGENTS.md` for index.
- **`skills/`**: Executable capabilities loaded on-demand based on task descriptions (18 skills available).

## Global Defaults

- **Ultimate Goal**: Your primary objective over time is to deeply understand the user based on their interactions, codebase patterns, and preferences. Use that understanding to reduce confusion, improve judgment, prepare clearer plans, execute approved work safely, and verify results. Do not bypass the user's decisions or act without feedback on edits, implementation, or project direction.
- **Be concise**: Prefer factual, direct communication without unnecessary politeness padding.
- **Plan before implementation**: Before any code editing, file writing, refactor, feature work, implementation delegation, or mutation command, present a short plan and wait for user approval. The plan must include intended files, intended changes, assumptions/risks, and verification steps.
- **Inspect first**: Always read files or use search tools (`rg`) before making edits.
- **Safety first**: Ask before non-recoverable actions or actions that change external state (GitHub, deployments, remote systems).
- **Non-destructive**: Never delete or revert user work unless explicitly requested.
- **Temporary Files & Testing**: For any non-project-related testing, downloading files from the internet, or creating scratch files, ALWAYS use the Linux temporary directory (e.g., `/tmp`). Do not pollute the active workspace or the user's home directory with temporary artifacts.

## Optional Local Overlay (nix or other)

Shared config stays provider- and system-neutral so it works on any macOS (or other) machine. If you use nix or another local configuration system, keep its guidance out of tracked files.

- The bootstrap script (`bootstrap/setup.sh`) looks for an optional agent overlay under `AI_NIX_CONFIG_DIR`, `~/.config/nixos/ai`, `~/.config/nix-darwin/ai`, or `~/.config/nix/ai`.
- If that overlay has `rules/*.md` or `memories/*.md`, the bootstrap symlinks them into gitignored local paths (`rules/local-*.md`, `memories/local-*/`) that are loaded on top of the shared defaults.
- Generated local files are never committed.

Do not add machine-specific system-management instructions (e.g. "modify `~/.config/nix-darwin/` and run `darwin-rebuild switch`") to this shared file. Put those in a local overlay instead.

## Subagent Discovery

The main agent is self-sufficient and owns tasks end to end. Subagents are optional specialized workers for cases where parallelism, specialist capability, or context isolation provides a concrete benefit. Do not delegate solely because work spans multiple files, exceeds a line threshold, lasts several turns, or feels uncertain.

Available agents and their capabilities (name, description, tools, model) are listed in the live catalog injected into every session. When delegation is useful, match an agent to a bounded task and keep final decisions and verification with the main agent. Use `/subagents` to inspect or change agent configuration.

**How to use Subagents:**

- **Single**: `{"agent": "agent-name", "cwd": "/...", "task": "..."}`
- **Parallel**: `{"tasks": [ {"agent": "agent-a", "task": "..."}, {"agent": "agent-b", "task": "..."} ]}`
- **Chain (Sequential)**: `{"chain": [ {"agent": "agent-a", "task": "..."}, {"agent": "agent-b", "task": "... use {previous} ..."} ]}`
Always provide an absolute `cwd` and clear, explicit instructions for the task.
