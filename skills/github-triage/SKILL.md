---
name: github-triage
description: Triage local Markdown issues through a label-based state machine. Use when user wants to create an issue, triage issues, review incoming bugs or feature requests, prepare issues for an AFK agent, or manage issue workflow.
---

# Local Issue Triage

Triage issues in the current project using a label-based state machine. Issues live as Markdown files under `issues/`. Do not use remote trackers or issue-tracker CLIs for issue operations.

## Local issue store

Use an `issues/` directory at the current project root. Create it if needed.

Issue files are Markdown files named with the next available four-digit ID and a short kebab-case slug:

```text
issues/0001-login-form-validation.md
```

Each file must start with frontmatter:

```
---
id: 0001
title: Login form validation accepts blank passwords
kind: bug
status: needs-triage
labels: []
blocked_by: []
created: YYYY-MM-DD
updated: YYYY-MM-DD
---
```

Use the frontmatter `status`, `kind`, and `labels` fields instead of remote tracker labels. Append triage notes, agent briefs, and status history as Markdown sections in the same file.

## Reference docs

- [AGENT-BRIEF.md](AGENT-BRIEF.md) — how to write durable agent briefs
- [OUT-OF-SCOPE.md](OUT-OF-SCOPE.md) — how the `.out-of-scope/` knowledge base works

## Labels

| Label             | Type     | Description                              |
| ----------------- | -------- | ---------------------------------------- |
| `bug`             | Category | Something is broken                      |
| `enhancement`     | Category | New feature or improvement               |
| `needs-triage`    | State    | Maintainer needs to evaluate this issue  |
| `needs-info`      | State    | Waiting on reporter for more information |
| `ready-for-agent` | State    | Fully specified, ready for AFK agent     |
| `ready-for-human` | State    | Requires human implementation            |
| `wontfix`         | State    | Will not be actioned                     |

Every issue should have exactly **one** state in frontmatter and **one** category in `kind`. If an issue has conflicting state information (for example `status: needs-triage` but a status history entry says `ready-for-agent` is current), flag the conflict and ask the maintainer which state is correct before doing anything else. Provide a recommendation.

## State Machine

| Current State  | Can transition to | Who triggers it        | What happens                                                                                                         |
| -------------- | ----------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `unlabeled`    | `needs-triage`    | Skill (on first look)  | Issue needs maintainer evaluation. Skill updates frontmatter after presenting recommendation.                        |
| `unlabeled`    | `ready-for-agent` | Maintainer (via skill) | Issue is already well-specified and agent-suitable. Skill appends agent brief section and updates frontmatter.       |
| `unlabeled`    | `ready-for-human` | Maintainer (via skill) | Issue requires human implementation. Skill appends a brief task summary and updates frontmatter.                     |
| `unlabeled`    | `wontfix`         | Maintainer (via skill) | Issue is spam, duplicate, or out of scope. Skill records the decision in the file and writes `.out-of-scope/` for enhancements. |
| `needs-triage` | `needs-info`      | Maintainer (via skill) | Issue is underspecified. Skill appends triage notes capturing progress so far + questions for reporter.              |
| `needs-triage` | `ready-for-agent` | Maintainer (via skill) | Grilling session complete, agent-suitable. Skill appends agent brief section and updates frontmatter.                |
| `needs-triage` | `ready-for-human` | Maintainer (via skill) | Grilling session complete, needs human. Skill appends a brief task summary and updates frontmatter.                  |
| `needs-triage` | `wontfix`         | Maintainer (via skill) | Maintainer decides not to action. Skill records the decision in the file and writes `.out-of-scope/` for enhancements. |
| `needs-info`   | `needs-triage`    | Skill (detects update) | Reporter or maintainer has added information. Skill surfaces to maintainer for re-evaluation.                       |

An issue can only move along these transitions. The maintainer can override any state directly (see Quick State Override below), but the skill should flag if the transition is unusual.

## Invocation

The maintainer invokes `/github-triage` or asks for issue triage in natural language. The skill interprets the request and takes the appropriate local-file action.

Example requests:

- "Show me anything that needs my attention"
- "Let's look at issue 0042"
- "Move `issues/0042-fix-login.md` to ready-for-agent"
- "What's ready for agents to pick up?"
- "Are there any unlabeled issues?"

## Workflow: Show What Needs Attention

When the maintainer asks for an overview, scan `issues/*.md` and present a summary grouped into three buckets:

1. **Unlabeled issues** — new, no labels at all. These have never been triaged.
2. **`needs-triage` issues** — maintainer needs to evaluate or continue evaluating.
3. **`needs-info` issues with new activity** — the file has been updated since the last triage notes section. Check file metadata and `updated` frontmatter when available.

Display counts per group. Within each group, show issues oldest first (longest-waiting gets attention first). For each issue, show: ID/path, title, age, and a one-line summary of the issue body.

Let the maintainer pick which issue to dive into.

## Workflow: Triage a Specific Issue

### Step 1: Gather context

Before presenting anything to the maintainer:

- Read the full issue file: frontmatter, body, prior notes, status history, who reported it if recorded, and timestamps
- If there are prior triage notes sections (from previous sessions), parse them to understand what has already been established
- Explore the codebase to build context — understand the domain, relevant interfaces, and existing behavior related to the issue
- Read `.out-of-scope/*.md` files and check if this issue matches or is similar to a previously rejected concept

### Step 2: Present a recommendation

Tell the maintainer:

- **Category recommendation:** bug or enhancement, with reasoning
- **State recommendation:** where this issue should go, with reasoning
- If it matches a prior out-of-scope rejection, surface that: "This is similar to `.out-of-scope/concept-name.md` — we rejected this before because X. Do you still feel the same way?"
- A brief summary of what you found in the codebase that's relevant

Then wait for the maintainer's direction. They may:

- Agree and ask you to update status/frontmatter → do it
- Want to flesh it out → start a /domain-model session
- Override with a different state → apply their choice
- Want to discuss → have a conversation

### Step 3: Bug reproduction (bugs only)

If the issue is categorized as a bug, attempt to reproduce it before starting a /domain-model session. This will vary by codebase, but do your best:

- Read the reporter's reproduction steps (if provided)
- Explore the codebase to understand the relevant code paths
- Try to reproduce the bug: run tests, execute commands, or trace the logic to confirm the reported behavior
- If reproduction succeeds, report what you found to the maintainer — include the specific behavior you observed and where in the code it originates
- If reproduction fails, report that too — the bug may be environment-specific, already fixed, or the report may be inaccurate
- If the report lacks enough detail to attempt reproduction, note that — this is a strong signal the issue should move to `needs-info`

The reproduction attempt informs the /domain-model session and the agent brief. A confirmed reproduction with a known code path makes for a much stronger brief.

### Step 4: /domain-model session (if needed)

If the issue needs to be fleshed out before it's ready for an agent, interview the maintainer to build a complete specification. Use the /domain-model skill.

### Step 5: Apply the outcome

Depending on the outcome:

- **ready-for-agent** — append an agent brief section (see [AGENT-BRIEF.md](AGENT-BRIEF.md)) and update `status`
- **ready-for-human** — append a section summarizing the task, what was established during triage, and why it needs human implementation. Use the same structure as an agent brief but note the reason it can't be delegated to an agent (e.g. requires judgment calls, external system access, design decisions, or manual testing).
- **needs-info** — append triage notes with progress so far and questions for the reporter (see Needs Info Output below) and update `status`
- **wontfix (bug)** — append a polite decision note explaining why and update `status: wontfix`
- **wontfix (enhancement)** — write to `.out-of-scope/`, append a decision note linking to it, and update `status: wontfix` (see [OUT-OF-SCOPE.md](OUT-OF-SCOPE.md))
- **needs-triage** — update `status`. Optionally append a note if there's partial progress to capture.

## Workflow: Quick State Override

When the maintainer explicitly tells you to move an issue to a specific state (e.g. "move issue 0042 to ready-for-agent"), trust their judgment and update the frontmatter directly.

Still show a confirmation of what you're about to do: which frontmatter fields will change, and whether you'll append notes or decision sections. But skip the /domain-model session entirely.

If moving to `ready-for-agent` without a /domain-model session, ask the maintainer if they want to write a brief agent brief comment or skip it.

## Needs Info Output

When moving an issue to `needs-info`, append a section that captures the interview progress and tells the reporter what's needed:

```markdown
## Triage Notes

**What we've established so far:**

- point 1
- point 2

**What we still need from you (@reporter):**

- question 1
- question 2
```

Include everything resolved during the /domain-model session in "established so far" — this work should not be lost. The questions for the reporter should be specific and actionable, not vague ("please provide more info").

## Resuming Previous Sessions

When triaging an issue that already has triage notes from a previous session:

1. Read the issue file to find prior triage notes
2. Parse what was already established
3. Check if the reporter or maintainer has answered any outstanding questions in the file
4. Present the maintainer with an updated picture: "Here's where we left off, and here's what has been added since"
5. Continue the /domain-model session from where it stopped — do not re-ask resolved questions
