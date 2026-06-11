---
name: triage
description: Diagnose bugs, capture feature requests, and manage issues through a label-based workflow. Use when the user reports a bug, wants to create an issue, triage issues, review incoming work, or prepare issues for execution.
---

# Triage

Manage issues end-to-end: capture → diagnose → write → label workflow.

## 1. Capture

For bugs: ask at most 1-2 clarifying questions — expected vs actual behavior, reproduction steps. Don't over-interview. If the description is clear, start exploring.

For feature requests: ask what problem it solves and what "done" looks like. Don't design yet — that's for the `plan` or `design` skill.

## 2. Diagnose (Bugs)

Spawn a scout subagent to find:
- Where the bug manifests (entry point, UI, API)
- What code path is involved
- Why it fails (root cause, not symptom)
- What tests exist or are missing

Present the root cause and a fix approach. Ask if the user wants a TDD fix (chains into `tdd`).

## 3. Write the Issue

Create a local Markdown file in `issues/`. Name with next available 4-digit ID and kebab-case slug.

Frontmatter:
```yaml
---
id: NNNN
title: ...
kind: bug | enhancement | refactor | prd
status: needs-triage
slice_type: AFK | HITL
blocked_by: []
created: YYYY-MM-DD
---
```

Bug template:
```markdown
## Problem
- **Actual behavior:**
- **Expected behavior:**
- **Steps to reproduce:**

## Root Cause Analysis
Describe why it fails using domain terms, not file paths.

## TDD Fix Plan
1. **RED**: Write a test that ...
   **GREEN**: Minimal change to make it pass

## Acceptance Criteria
- [ ] ...

## Blocked by
None (or list issue IDs)
```

## 4. Label Workflow

Issues move through statuses:
- `needs-triage` → new, unreviewed
- `needs-discussion` → ambiguous, needs user input
- `ready-for-agent` → scoped enough for execution
- `in-progress` → being worked on
- `done` → merged and verified

When the user says "triage issues" or "review incoming", list all issues in `issues/`, show current status, and ask which to process.

When preparing for execution, classify each as:
- **AFK**: Can be implemented without human interaction
- **HITL**: Needs design decisions or user review mid-flight

## 5. Parent/Child Linking

If an issue is part of a larger plan (PRD in `plan` skill):
```markdown
## Parent
`issues/NNNN-prd-....md`
```

If blocked:
```markdown
## Blocked by
- `issues/NNNN-....md`
```

Create issues in dependency order so blocked_by references real IDs.
