---
name: plan
description: Turn conversation context into a Product Requirements Document (PRD) and break it down into independently-grabbable tracking issues. Use when the user wants to plan a feature, write a spec, or break a project into tickets.
---

# Plan

Synthesize the conversation and codebase context into a PRD, then break it into vertical-slice tracking issues.

## 1. Context

Explore the repo to understand the current state. Sketch the major modules to build or modify. Look for opportunities to extract deep modules testable in isolation.

**If the conversation already contains scouted details (file paths, API formats, exact commands) — don't re-scout. Use what you have.**

## 2. Write the PRD

Save as `issues/NNNN-prd-....md` at the project root. Frontmatter:
```yaml
---
id: NNNN
title: PRD: ...
kind: prd
status: needs-triage
blocked_by: []
created: YYYY-MM-DD
---
```

Sections:
```markdown
## Problem Statement
The problem from the user's perspective.

## Solution
The solution from the user's perspective.

## User Stories
Numbered list (As an <actor>, I want <feature>, so that <benefit>).

## Implementation Decisions
- Modules built/modified
- Interfaces modified
- Architectural decisions
- API contracts
- If concrete details exist (file paths, endpoints, commands): include them. The PRD is the canonical record.

## Testing Decisions
- What makes a good test here
- Which modules will be tested

## Out of Scope
```

**If the conversation has a concrete plan** (exact files, APIs, Nix expressions): preserve those details. The PRD is the canonical record. Don't strip specifics just because a template says "abstract."

**If still at the problem/idea stage**: keep it abstract. No file paths.

## 3. Ask About Breakdown

Use `ask_user_decisions`:
- Q1: "Break this PRD into tracking issues now?" (Yes / No, let me review first)
- Q2: "How granular?" (Coarse milestones / Granular vertical slices / Extremely granular commits)

If "No", stop. If "Yes", proceed.

## 4. Break into Vertical Slices

Draft vertical slices (tracer bullets) that cut through ALL layers end-to-end. Do not slice by layer. Each slice must be deliverable on its own.

Classify each:
- **AFK**: Can be implemented and merged without human interaction.
- **HITL**: Needs human-in-the-loop decisions.

Quiz the user on titles, type, blockers, user stories covered. Wait for approval.

## 5. Create Tracking Issues

For each approved slice, create `issues/NNNN-....md` in dependency order. Frontmatter:
```yaml
---
id: NNNN
title: ...
kind: enhancement
status: ready-for-agent
slice_type: AFK
blocked_by: []
created: YYYY-MM-DD
---
```

Sections:
```markdown
## Parent
`issues/NNNN-prd-....md`

## What to build
Concise description of this vertical slice end-to-end.

## Acceptance criteria
- [ ] Criterion

## Blocked by
None (or list issue IDs)
```

If concrete details exist in the PRD, include them in each issue — the agent picking up the issue should have everything needed without re-reading the PRD.
