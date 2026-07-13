# AI Agent Configuration & Skills

My personal global configuration, skills, and extensions for the [`pi` coding agent](https://github.com/badlogic/pi-mono).

## Directory Structure

- `agents/`: Specialized subagent definitions (scout, worker, planner, browser).
- `extensions/`: Custom TypeScript plugins for `pi` (e.g., interactive TUI decision menus, context readers).
- `memories/`: Durable technical preferences, technology choices, and project guidelines.
- `rules/`: Core operating policies, behavior guidelines, and constraints.
- `skills/`: Reusable, intent-based markdown workflows (TDD, bug triage, refactoring plans, domain-driven design, etc.).
- `bootstrap/`: Standalone macOS onboarding (installs brew, uv, node, pi; links config; sets up providers + docs). Generic for any Mac user.

## Setup

### One-shot macOS onboarding (recommended)

Runs on any Mac, installs prerequisites, clones this repo into `~/.config/ai`, links it into `~/.pi/agent`, configures providers, fetches docs, and installs the Pocket TTS backend. See `bootstrap/README.md` for details.

```bash
sh -c "$(curl -fsSL https://raw.githubusercontent.com/drlove2002/ai-config/main/bootstrap/bootstrap.sh)"
# or, after cloning:
#   ./bootstrap/setup.sh
```

The bootstrap is interactive where it matters (existing config, API keys) and idempotent. Nix is *optional*: if a local nix agent overlay exists it is linked as gitignored local files; otherwise it is skipped.

### Manual setup

To use this configuration, clone the repository to `~/.config/ai` and symlink the directories to your local `pi` environment:

```bash
git clone https://github.com/drlove2002/ai-config.git ~/.config/ai

# Backup existing dirs if needed, then symlink:
ln -sf ~/.config/ai/skills ~/.pi/agent/skills
ln -sf ~/.config/ai/extensions ~/.pi/agent/extensions
ln -sf ~/.config/ai/agents ~/.pi/agent/agents
ln -sf ~/.config/ai/rules ~/.pi/agent/rules
ln -sf ~/.config/ai/memories ~/.pi/agent/memories
ln -sf ~/.config/ai/AGENTS.md ~/.pi/agent/AGENTS.md
```

### Pocket TTS (voice output)

Pocket TTS installs into a permanent uv-managed venv (not `uvx`, not nix). Re-run to (re)install or repair:

```bash
extensions/pi-tts/setup.sh
```

Start the server (auto-started by the extension on session start):

```bash
extensions/pi-tts/bin/pocket-tts-cli serve --host 127.0.0.1 --port 18080
```

## Highlights

- **Interactive User Decisions**: Includes a custom `user-decisions.ts` extension that gives agents the ability to pause and ask multi-select/custom-text questions using native TUI components before chaining complex commands.
- **Context-Aware Skills**: Playbooks optimized for efficient context windows, automatically chaining planning phases into execution phases using subagents.
- **Smart Git History**: Built-in workflows to logically group dirty working trees into clean, conventional commits.

## License

MIT
