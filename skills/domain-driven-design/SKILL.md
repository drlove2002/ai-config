---
name: domain-driven-design
description: Extract, clarify, and challenge domain terminology from the conversation. Create or update DDD-style ubiquitous language (CONTEXT.md) and ADRs inline as decisions crystallise. Use when the user wants to define terms, build a glossary, stress-test a plan against the domain model, or mentions "DDD" or "ubiquitous language".
disable-model-invocation: true
---

# Domain Driven Design & Ubiquitous Language

Extract and formalize domain terminology from the conversation into a consistent glossary, challenge the user's plan against it, and update local files (`CONTEXT.md`, ADRs) inline.

## 1. Domain Awareness & Codebase Context

If a question can be answered by exploring the codebase, explore the codebase first. Look for existing documentation:

### File Structure

Most repos have a single context:
```
/
├── CONTEXT.md
├── docs/
│   └── adr/
│       ├── 0001-event-sourced-orders.md
│       └── 0002-postgres-for-write-model.md
└── src/
```

If a `CONTEXT-MAP.md` exists at the root, the repo has multiple contexts:
```
/
├── CONTEXT-MAP.md
├── docs/
│   └── adr/                          ← system-wide decisions
├── src/
│   ├── ordering/
│   │   ├── CONTEXT.md
│   │   └── docs/adr/                 ← context-specific decisions
```

Create files lazily — only when you have something to write. If no `CONTEXT.md` exists, create one when the first term is resolved. If no `docs/adr/` exists, create it when the first ADR is needed.

## 2. Interactive Grilling & Clarification

Interview the user relentlessly about every aspect of their plan or terminology until shared understanding is reached. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one. For each question, provide your recommended answer.

**Ask questions one at a time.** Wait for feedback on each question before continuing.

### Challenge Against the Glossary
When the user uses a term that conflicts with existing language in `CONTEXT.md`, call it out immediately: *"Your glossary defines 'cancellation' as X, but you seem to mean Y — which is it?"*

### Sharpen Fuzzy Language
When the user uses vague or overloaded terms, propose a precise canonical term: *"You're saying 'account' — do you mean the Customer or the User? Those are different things."*

### Cross-Reference with Code
When the user states how something works, check whether the code agrees. If you find a contradiction, surface it.

## 3. Extracting the Ubiquitous Language

When a term is resolved, update `CONTEXT.md` right there. Don't batch these up. 
Identify problems such as ambiguities (same word for different concepts) or synonyms (different words for the same concept).

### CONTEXT.md Format

Write a `CONTEXT.md` file using this structure:

```md
# {Context Name}

{One or two sentence description of what this context is and why it exists.}

## Language

**Order**:
A customer's request to purchase one or more items.
_Avoid_: Purchase, transaction

**Invoice**:
A request for payment sent to a customer after delivery.
_Avoid_: Bill, payment request

## Relationships

- An **Order** produces one or more **Invoices**

## Example dialogue

> **Dev:** "When a **Customer** places an **Order**, do we create the **Invoice** immediately?"
> **Domain expert:** "No — an **Invoice** is only generated once a **Fulfillment** is confirmed."

## Flagged ambiguities

- "account" was used to mean both **Customer** and **User** — resolved: these are distinct concepts.
```

### Glossary Rules
- **Be opinionated:** Pick the best word for a concept and list the rest under "_Avoid_".
- **Only include domain terms:** Skip generic programming concepts (array, endpoint, timeout) unless they have a domain-specific meaning.
- **Keep definitions tight:** One sentence max. Define what it IS, not what it does.
- **Write an example dialogue:** Create a short exchange between a developer and a domain expert to demonstrate how terms interact naturally.

## 4. Architectural Decision Records (ADRs)

Only offer to create an ADR in `docs/adr/` when all three are true:
1. **Hard to reverse** — the cost of changing your mind later is meaningful
2. **Surprising without context** — a future reader will wonder "why did they do it this way?"
3. **The result of a real trade-off** — there were genuine alternatives and you picked one for specific reasons

If all three are true, use the standard [ADR format](https://adr.github.io/madr/) (Title, Status, Context, Decision, Consequences).