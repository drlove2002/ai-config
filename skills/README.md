# Agent Skills

Personal agent skills for reusable coding, planning, triage, and documentation workflows.

Skills live at `~/.pi/agent/skills/<name>/SKILL.md`. The agent detects intent and loads the relevant skill automatically.

## Skills

| Skill | Does |
|-------|------|
| `commit` | Group unstaged changes or squash unpushed commits into clean conventional commits |
| `design` | Design interfaces (parallel sub-agents, multiple options) and domain models (ubiquitous language, ADRs) |
| `docs` | Look up current docs, API references, and code examples for any library or framework |
| `grill` | Interview relentlessly about a plan or design until every decision is resolved |
| `plan` | Turn conversation context into a PRD and break it into vertical-slice tracking issues |
| `recover` | Surgical recovery from production regressions — classify drift, revert, regression test |
| `refactor` | Improve code: simplify in-place, plan a refactor, or find structural deepening opportunities |
| `skill` | Create a new agent skill with proper structure and progressive disclosure |
| `tdd` | Red-green-refactor: write failing test, make it pass, clean up |
| `triage` | Diagnose bugs, capture feature requests, and manage issues through a label-based workflow |
