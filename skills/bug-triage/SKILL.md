---
name: bug-triage
description: Interactive QA and triage session. Listen to user bug reports, explore the codebase for root causes, and write local Markdown issues with TDD-based fix plans. Use when the user reports bugs, does QA, or mentions "triage" or "fix this bug".
---

# Bug Triage & QA

Investigate reported problems conversationally, find root causes, and create local Markdown tracking issues with TDD fix plans.

## 1. Capture the Problem

Let the user describe the problem. Ask at most 1-2 clarifying questions about:
- Expected vs actual behavior
- Reproduction steps

Do NOT over-interview. If the description is clear, start investigating immediately.

## 2. Explore & Diagnose

Spawn an exploration subagent to investigate the codebase to find:
- **Where** the bug manifests (entry points, UI, API).
- **What** code path is involved.
- **Why** it fails (the root cause, not just the symptom).
- **What** tests already exist or are missing.

## 3. Assess Scope (Single vs Breakdown)

Decide if this should be one issue or multiple:
- **Break down** if the fix spans multiple independent areas (e.g. "form validation is wrong AND success message is missing").
- **Keep single** if it's one behavior caused by the same root behavior.

## 4. Design TDD Fix Plan

For each issue, create a concrete, ordered list of RED-GREEN cycles:
- **RED**: Write a specific test that captures the broken/missing behavior (testing public interfaces, not internals).
- **GREEN**: Describe the minimal code change to make that test pass.
- **REFACTOR**: Cleanup steps once tests pass.

## 5. Create Local Issue Files (`issues/XXXX-...`)

Write the local Markdown issue files in `issues/`. Name them with a 4-digit ID and slug (e.g. `issues/0001-login-validation.md`).

**Create issues in dependency order** so you can reference real local issue IDs in the "Blocked by" field.

```yaml
---
id: 0001
title: Login form validation accepts blank passwords
kind: bug
status: needs-triage
blocked_by: []
created: YYYY-MM-DD
---
```

<issue-template>
## Problem
- **Actual behavior:** What happens
- **Expected behavior:** What should happen
- **Steps to reproduce:** Numbered steps using domain terms

## Root Cause Analysis
Describe why it fails based on your investigation. 
*(Do NOT include specific file paths or line numbers that easily go stale. Describe modules, behaviors, and contracts.)*

## TDD Fix Plan
1. **RED**: Write a test that [describes expected behavior]
   **GREEN**: [Minimal change to make it pass]

2. **RED**: Write a test that [describes next behavior]
   **GREEN**: [Minimal change to make it pass]

## Acceptance Criteria
- [ ] Criterion 1
- [ ] All new tests pass
</issue-template>

*(If breaking down into multiple issues, add a `## Parent issue` and `## Blocked by` section to link them together).*

## 6. Hand-off

Print the issue paths, summarize the root cause, and ask the user if they want to move directly into implementation (which naturally chains into the `tdd` skill).