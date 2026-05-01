---
name: skills-overview
description: Overview of available skills. Not an executable skill.
disable-model-invocation: true
---

# Agent Skills

Personal agent skills for reusable coding, planning, triage, and documentation workflows across languages and ecosystems.

This repository is intended to be checked out at:

```text
~/.config/ai/skills
```

Skills are specialized instruction sets and workflows for handling specific tasks. You should detect user intent and automatically load the relevant skill file using the `read` tool from `~/.config/ai/skills/<skill-name>/SKILL.md`.

## Included Skills

- `bug-triage` - run conversational QA, find root causes, and write TDD fix plans
- `design-an-interface` - explore multiple interface designs for a module
- `domain-driven-design` - stress-test plans, extract terminology, and build a ubiquitous language glossary
- `edit-article` - revise and tighten article drafts
- `find-docs` - retrieve authoritative technical documentation
- `git-history` - squash unpushed commits or group uncommitted changes logically
- `github-triage` - triage local Markdown issues through a state workflow
- `grill-me` - interrogate a plan or design until it is clear
- `improve-codebase-architecture` - find architectural deepening opportunities
- `request-refactor-plan` - create incremental refactor plans
- `scaffold-exercises` - scaffold course exercise directories
- `spec-to-tasks` - turn context into a PRD and break it down into tracking issues
- `stop-slop` - remove AI writing patterns and filler from prose
- `tdd` - follow a red-green-refactor workflow
- `write-a-skill` - create new agent skills
- `zoom-out` - provide broader codebase context

*When a task matches one of these descriptions, always load the corresponding `SKILL.md` file first before proceeding.*
