---
name: docs
description: >-
  Look up documentation for any library, framework, or product concept. Checks local docs first (Next.js, Nextcord, Discord.py, wwideas product docs), falls back to Context7 API, then browser. Use when the user asks about API syntax, configuration, version migration, setup, or "how do I" with a specific technology. Never rely on training data for API details.
---

# Docs

Lookup priority: **local → Context7 → browser**. Check each tier before falling through.

## 0. Product / Domain Questions

If the question is about the Worldwide product (how a feature works, what a system does, game mechanics, terminology), read from wwideas first:

- `CONTEXT.md` — canonical domain language
- `LIVE_FEATURES.md` — what's currently live
- `issues/` — active plans and PRDs
- `systems/existing/` — documented live mechanics

**Read these before touching any implementation code.** If wwideas doesn't answer, fall through to the code itself.

## 1. Local Docs

Check `~/.config/ai/docs/index.json` for the package. Currently:

| Package | Local path | Format |
|---------|-----------|--------|
| Next.js | `~/.config/ai/docs/next.js/` | `.md` |
| Nextcord | `~/.config/ai/docs/nextcord/` | `.rst` |
| Discord.py | `~/.config/ai/docs/discord.py/` | `.rst` |

If the package is in the index, read the local files:
- Start from `index.md` or `index.rst` to understand structure
- Grep for the specific topic
- Read the most relevant page fully — don't skim

If the package is NOT in the index, skip to Context7.

## 2. Context7 (ctx7 CLI)

For libraries not in the local index, or when local docs don't answer the question.

**Step 1 — Resolve the library ID:**
```bash
npx ctx7@latest library <name> "<query describing what you need>"
```

**Step 2 — Query with the resolved ID:**
```bash
npx ctx7@latest docs <libraryId> "<specific question>"
```

Max 3 attempts. If all fail, tell the user why and fall through to browser.

### Retry with --research
If the default `npx ctx7@latest docs` answer was shallow, re-run with `--research` for deeper analysis.

### Quota exhausted
If Context7 hits a quota error, tell the user and fall through to browser. Never silently fall back to training data.

## 3. Browser

If local docs + Context7 both fail, use the `browser` subagent to fetch docs from the official source. Prefer official documentation sites over forum posts or blogs.

## Rules

- Never answer API questions from training data alone. Always check a tier.
- One tier at a time. Don't jump to browser when local docs exist.
- If local docs exist but don't answer, say "local docs don't cover this" before moving on.
- For Rust stdlib and Python stdlib (not yet in local index), skip straight to Context7 or browser.
