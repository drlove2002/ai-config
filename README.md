# AI Agent Configuration & Skills

My personal global configuration, skills, and extensions for the [`pi` coding agent](https://github.com/badlogic/pi-mono).

## Directory Structure

- `agents/`: Specialized subagent definitions (scout, worker, planner, browser).
- `extensions/`: Custom TypeScript plugins for `pi` (e.g., interactive TUI decision menus, context readers).
- `memories/`: Durable technical preferences, technology choices, and project guidelines.
- `rules/`: Core operating policies, behavior guidelines, and constraints.
- `skills/`: Reusable, intent-based markdown workflows (TDD, bug triage, refactoring plans, domain-driven design, etc.).

## Setup

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

## Highlights

- **Interactive User Decisions**: Includes a custom `user-decisions.ts` extension that gives agents the ability to pause and ask multi-select/custom-text questions using native TUI components before chaining complex commands.
- **Context-Aware Skills**: Playbooks optimized for efficient context windows, automatically chaining planning phases into execution phases using subagents.
- **Smart Git History**: Built-in workflows to logically group dirty working trees into clean, conventional commits.

## License

MIT
