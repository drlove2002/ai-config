---
name: design
description: Design interfaces and domain models. Generates multiple interface options via parallel sub-agents, formalizes domain terminology, and records architectural decisions. Use when the user wants to design an API, define terms, compare module shapes, or mentions "design it twice", "ubiquitous language", or "DDD".
---

# Design

Design interfaces and domain models. Two entry points — use the one that matches what the user asked.

## Mode A: Design an Interface

Trigger: "design this API", "what should this module look like", "design it twice".

### 1. Gather Requirements
Ask: what problem does this module solve? Who are the callers? What are the key operations? Any constraints (performance, compatibility, existing patterns)?

### 2. Generate Designs (Parallel Sub-Agents)
Spawn 3+ sub-agents in parallel. Each gets a different constraint:
- "Minimize method count — aim for 1-3 methods max"
- "Maximize flexibility — support many use cases"
- "Optimize for the most common case"
- "Take inspiration from [specific paradigm/library]"

Each sub-agent outputs: interface signature, usage example, what it hides, trade-offs.

### 3. Compare
Show each design with: interface signature, usage example, what it hides. Then compare on: interface simplicity, general-purpose vs specialized, implementation efficiency, depth (small interface hiding significant complexity = good), ease of correct use vs ease of misuse.

### 4. Synthesize
Often the best design combines insights from multiple options. Ask: "Which design best fits your primary use case? Any elements from others worth incorporating?"

### Anti-Patterns
- Don't let sub-agents produce similar designs — enforce radical difference
- Don't skip comparison — value is in contrast
- Don't implement — this is purely about interface shape

## Mode B: Domain Model

Trigger: "define the terms", "what should we call this", "ubiquitous language", "DDD".

### 1. Extract Terms
From the conversation and codebase, extract domain concepts. Look for:
- Terms used inconsistently
- Concepts without names
- Names that don't match their behavior

### 2. Define and Challenge
For each term: define it in one sentence. Challenge it against the codebase — does the code actually use this name this way? If not, the term or the code needs to change.

### 3. Record in CONTEXT.md
Write formal definitions to the repo's CONTEXT.md. Format:
```markdown
## Domain Terms
### term-name
One-sentence definition. What it is, what it isn't, who owns it.
```

Create CONTEXT.md lazily if it doesn't exist. Update existing entries when definitions sharpen.

### 4. Record Decisions (ADR)
When a design choice is load-bearing — future explorers would need to know why — offer an ADR:
```markdown
# ADR-NNNN: Title

## Status
Accepted

## Context
What problem are we solving?

## Decision
What did we decide?

## Consequences
What becomes easier? What becomes harder?
```

Only offer ADRs for durable decisions. Skip ephemeral reasons ("not worth it right now").
