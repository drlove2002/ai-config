---
name: simplify-writing
description: Normalize written knowledge by eliminating redundancy, centralizing canonical descriptions, and surfacing contradictions. Use when the user wants to simplify, deduplicate, or optimize written content — docs, rules, memories, specs, or any collection of text files. Triggered by phrases like "simplify writing," "deduplicate," "normalize docs," "optimize knowledge," "eliminate redundancy."
---

# Simplify Writing

Normalize written knowledge the way databases normalize data. One canonical fact, one location. Everything else links.

## Process

### 1. Scan

Read every file in the target directory tree. Build a complete map of what exists and where.

### 2. Find duplicates

Compare every section, rule, checklist, definition, and example across all files. A duplicate is any two passages that convey the same meaning, even with different wording. Flag exact duplicates, near-duplicates, and the same concept described in multiple places.

### 3. Centralize

For each duplicated concept, pick one canonical home. Decision rules:

- The file closest to the main index/entry point wins
- If one version is more detailed, that one becomes canonical
- If one is referenced by other files, that's likely the canonical location
- When no clear winner: present options to the user

Delete all other copies. Replace each deleted copy with a link to the canonical location.

### 4. Find contradictions

Compare every rule, prohibition, and guideline across files. A contradiction is any pair where one says "do X" and another says "don't do X" or "do Y instead." Also catch: rule A permits something rule B forbids, absolute vs. qualified versions of the same rule, examples that violate the rules they illustrate.

**Never auto-resolve contradictions.** Present them to the user as a table:

```
| File A | Says | File B | Says | Conflict |
|--------|------|--------|------|----------|
| ...    | ...  | ...    | ...  | ...      |
```

Let the user decide which version wins.

### 5. Remove dead references

After centralizing, check all links. Fix any that point to deleted sections. Remove any "see also" that now points to nothing.

### 6. Verify

Re-read the entry point file. Walk every link. Confirm each concept appears exactly once.

## Scope

Text only. Source code, config files, and data files are out of scope. Treat code blocks inside text files as opaque — don't analyze them for duplication.

## Output

After each pass, report:

- Files scanned
- Duplicate sets found and where they were collapsed
- Canonical locations chosen (and why)
- Contradictions found (never resolved — only reported)
- Dead links removed
