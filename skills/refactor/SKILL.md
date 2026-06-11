---
name: refactor
description: >-
  Improve existing code through inspection, simplification, and testing. Use when the user wants to clean up, simplify, reduce duplication, restructure architecture, find deep modules, or plan a safe refactor. Detects intent: "clean this up" triggers direct simplify-test loop; "plan a refactor" triggers interview + issue; "improve architecture" triggers structural deep-module analysis.
---

# Refactor

Three modes depending on what the user asks for. Detect intent, don't ask the user to choose.

## Mode A: Simplify In-Place

Trigger: "clean this up", "simplify", "reduce duplication", "make this readable".

1. **Inspect** the relevant code — scout subagent if >2 files.
2. **Propose** the highest-value cleanup in 1-2 sentences. Wait for approval.
3. **Simplify** — fewer concepts, fewer branches, smaller functions. Remove duplication only when the replacement is simpler than the original. No speculative abstractions.
4. **Test** — run the nearest tests. If behavior changed, use `tdd` (write failing test → make it pass).
5. **Repeat** — propose next cleanup. Stop when remaining changes are cosmetic or low leverage.
6. If a simplification needs broader changes than the task justifies, stop and say so.

## Mode B: Plan a Refactor

Trigger: "plan a refactor", "break this refactor into commits", "how should I restructure".

1. **Interview** the user about what they want to change and what stays the same.
2. **Scout** the affected area — blast radius, callers, test coverage.
3. **Break into tiny commits** — each commit leaves the codebase working. TDD red-green-refactor per commit where applicable.
4. **Write a local issue** in `issues/` with frontmatter:
```yaml
---
id: NNNN
title: Refactor: ...
kind: refactor
status: needs-triage
blocked_by: []
created: YYYY-MM-DD
---
```
5. Sections: Problem, Solution, Commits (numbered step-by-step), Decision Document, Testing Decisions, Out of Scope.
6. Hand off: "Want me to start executing?"

## Mode C: Structural Deepening

Trigger: "improve architecture", "find deep modules", "reduce coupling", "consolidate".

1. **Read existing docs** — CONTEXT.md and docs/adr/ for domain language and prior decisions.
2. **Explore** the codebase for friction: shallow modules (interface as complex as implementation), tight coupling, pass-throughs, untestable seams. Apply the deletion test: would deleting this module concentrate complexity or just move it?
3. **Present candidates** — numbered list. For each: files involved, problem, solution in plain English, benefits in terms of locality and leverage. Use domain terms from CONTEXT.md.
4. **Grill** the user on their chosen candidate — constraints, dependencies, what sits behind the seam, what tests survive.
5. **Record decisions** — if a new term emerges, add it to CONTEXT.md. If a decision should prevent future re-litigation, offer an ADR.
6. If the user wants to explore interface alternatives, switch to the `design` skill.

## Stop Conditions

- Remaining cleanup is cosmetic or low leverage.
- A simplification needs broader changes than the task justifies.
- The user says "good enough."
