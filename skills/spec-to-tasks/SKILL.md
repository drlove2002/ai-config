---
name: spec-to-tasks
description: Turn the conversation context into a Product Requirements Document (PRD) and automatically break it down into independently-grabbable local Markdown tracking issues. Use when you need to plan a feature, write a spec, or break a project into tickets/tasks.
---

# Spec to Tasks

Synthesize the current conversation and codebase context into a PRD, then break it down into vertical-slice tracking issues.

## 1. Context & Codebase Recon

Explore the repo to understand the current state of the codebase.
Sketch out the major modules you will need to build or modify. Look for opportunities to extract deep modules that can be tested in isolation.

**If the conversation already contains scouted codebase details (file paths, API formats, exact commands, dependency trees) — do not re-scout. Use what you already have.**

## 2. Generate the PRD (`issues/XXXX-prd-...`)

Write the PRD and save it as a local Markdown issue in `issues/` at the current project root.
Name the file with the next available four-digit ID and a short kebab-case slug, e.g. `issues/0001-prd-bulk-import.md`.

**Two paths:**

**Path A — No concrete plan yet**: When the conversation is still at the problem/idea stage and no implementation details exist, use the template as-is. Keep the PRD abstract — stakeholder-readable, no file paths or code snippets.

**Path B — Concrete plan already exists**: When the conversation already has scouted details (exact file paths, API endpoints, response formats, build commands, Nix expression shapes), **preserve those details in the PRD**. The PRD is the canonical record of what was decided. Do not strip concrete details just because the abstract template says so. The template is a floor — include everything needed to execute.

PRD frontmatter:

```yaml
---
id: 0001
title: PRD: Bulk import
kind: prd
status: needs-triage
blocked_by: []
created: YYYY-MM-DD
---
```

PRD sections:

## Problem Statement
The problem that the user is facing, from the user's perspective.

## Solution
The solution to the problem, from the user's perspective.

## User Stories
A numbered list (e.g., As an <actor>, I want a <feature>, so that <benefit>).

## Implementation Decisions
- Modules built/modified
- Interfaces modified
- Architectural decisions
- API contracts
- **Path B only**: Include exact file paths, API endpoints, response formats, shell commands, Nix expression shapes — every concrete detail the conversation established.

## Testing Decisions
- What makes a good test here
- Which modules will be tested

## Out of Scope
Things out of scope for this PRD.

## 3. Ask User for Task Breakdown

Use the `ask_user_decisions` tool to ask the user if they want to break this PRD down into tracking issues immediately.

**Question 1:** Should we break this PRD down into tracking issues now?
- Yes, break it down
- No, let me review the PRD first

**Question 2:** How granular should the tasks be?
- Coarse (Large milestones)
- Granular (Thin vertical slices, recommended)
- Extremely granular (Tiny commits)

If they choose "No", stop here. If "Yes", proceed to Step 4.

## 4. Break Down into Vertical Slices

Draft vertical slices (tracer bullets) that cut through ALL integration layers end-to-end. Do not slice by layer.
Each slice must be deliverable on its own.

**If Path B (concrete plan exists)**: slices should reference the concrete details from the PRD — specific files, APIs, commands per slice.

Classify each slice as:
- **AFK**: Can be implemented and merged without human interaction.
- **HITL**: Requires human-in-the-loop decisions (e.g. design reviews).

Quiz the user on the proposed slices:
- Title, Type (AFK/HITL), Blockers, User stories covered.
Wait for their approval before generating the files.

## 5. Generate Tracking Issues (`issues/XXXX-...`)

For each approved slice, create a local Markdown issue file in `issues/` in dependency order.

**If Path B**: tracking issues include the concrete file paths, API details, and commands from the PRD. The agent picking up the issue should have everything needed to execute without re-reading the PRD.

```yaml
---
id: 0002
title: Add import preview
kind: enhancement
status: ready-for-agent
slice_type: AFK
blocked_by: []
created: YYYY-MM-DD
---
```

## Parent
`issues/0001-prd-bulk-import.md`

## What to build
A concise description of this vertical slice end-to-end.

## Acceptance criteria
- [ ] Criterion 1
- [ ] Criterion 2

## Blocked by
- Blocked by `issues/0002-api-setup.md` (or "None")
