---
description: Full implementation workflow - scout gathers context, planner creates bounded packages, user approves, worker implements
---
Use the subagent tool with the chain parameter to execute this workflow:

1. First, use the "scout" agent to find all code relevant to: $@
2. Then, use the "planner" agent to create bounded worker packages for "$@" using the context from the previous step (use {previous} placeholder)
3. Present the planner's bounded packages to the user. STOP and wait for explicit approval before proceeding.
4. After user approval, dispatch each bounded package to a "worker" agent using workerPackage (not raw task).

The planner output must consist of numbered packages, each with: objective, files, changes, acceptance, verification. Worker packages are dispatched individually.

Execute the scout→planner steps as a chain, passing output between steps via {previous}. STOP after planner output for user approval.
