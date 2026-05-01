---
name: spec-to-tasks
description: Turn the conversation context into a Product Requirements Document (PRD) and automatically break it down into independently-grabbable local Markdown tracking issues. Use when you need to plan a feature, write a spec, or break a project into tickets/tasks.
---

# Spec to Tasks

Synthesize the current conversation and codebase context into a PRD, then break it down into vertical-slice tracking issues.

## 1. Context & Codebase Recon

Explore the repo to understand the current state of the codebase.
Sketch out the major modules you will need to build or modify. Look for opportunities to extract deep modules that can be tested in isolation.

## 2. Generate the PRD (`issues/XXXX-prd-...`)

Write the PRD using the template below and save it as a local Markdown issue in `issues/` at the current project root.
Name the file with the next available four-digit ID and a short kebab-case slug, for example `issues/0001-prd-bulk-import.md`.

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

<prd-template>
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
*(Do NOT include specific file paths or code snippets)*

## Testing Decisions
- What makes a good test here
- Which modules will be tested

## Out of Scope
Things out of scope for this PRD.
</prd-template>

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

Draft vertical slices (tracer bullets) that cut through ALL integration layers end-to-end (DB, API, UI). Do not slice by layer.
Each slice must be deliverable on its own.

Classify each slice as:
- **AFK**: Can be implemented and merged without human interaction.
- **HITL**: Requires human-in-the-loop decisions (e.g. design reviews).

Quiz the user on the proposed slices:
- Title, Type (AFK/HITL), Blockers, User stories covered.
Wait for their approval before generating the files.

## 5. Generate Tracking Issues (`issues/XXXX-...`)

For each approved slice, create a local Markdown issue file in `issues/` in dependency order.

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

<issue-template>
## Parent
`issues/0001-prd-bulk-import.md`

## What to build
A concise description of this vertical slice end-to-end.

## Acceptance criteria
- [ ] Criterion 1
- [ ] Criterion 2

## Blocked by
- Blocked by `issues/0002-api-setup.md` (or "None")
</issue-template>