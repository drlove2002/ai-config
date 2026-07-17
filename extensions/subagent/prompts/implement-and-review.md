---
description: User approves a bounded worker package, orchestrator dispatches implement + review cycle (fresh approval for follow-ups)
---
This template describes the implement-and-review workflow. The main agent (orchestrator) is responsible for dispatching each step; this template does not dispatch subagents on its own.

Workflow:

1. The user approves a bounded workerPackage containing the implementation plan (objective, files, changes, acceptance, verification). The main agent may then dispatch a worker with that package. STOP — the main agent must wait for explicit user approval on the package before any dispatch.
2. Present the worker's output to the user. STOP — the main agent must wait for explicit user approval before proceeding.
3. After user approval, the main agent may dispatch the reviewer agent (or a review-capable agent) to review the implementation from the previous step (use {previous} placeholder).
4. Present review results. For any follow-up changes the main agent must create a fresh bounded workerPackage, obtain explicit user approval on it, and dispatch a new worker. Never mutate or extend an already-approved package without a new approval cycle.

**IMPORTANT**: This template stops before every dispatch. The main agent must obtain explicit user approval between steps. Do NOT dispatch the worker or reviewer without explicit user approval.
