---
name: git-history
description: Automate the workflow of grouping unstaged changes or squashing unpushed commits into logical, high-quality conventional commits. Use to clean up git history, create smart commits from a dirty worktree, or squash many small commits.
---

# Git History & Smart Commits

Use this skill when the user wants to commit a dirty worktree logically, or clean up existing unpushed commits before a PR.

## 1. Determine Mode

First, look at the git state using `git status` and `git log origin/main..HEAD --oneline` (or whatever the upstream branch is).

If the user has **unstaged/dirty changes**, use **Smart Commit Mode**.
If the user has a clean worktree but **many unpushed small commits**, use **Squash Mode**.

## Smart Commit Mode

Goal: Create well-grouped commits based on logical boundaries from a dirty worktree.

1. **Inspect changes:**
   - `git diff`
   - `git diff --staged`
2. **Group files:**
   Group by feature boundary, bug fix, refactor, or paired tests/implementation.
3. **Stage & Commit:**
   - Stage one logical group at a time (`git add <file>`).
   - Create a conventional commit (see format below).

## Squash Mode

Goal: Review and squash unpushed commits into a few high-quality logical commits.

1. **Verify State:** Ensure the worktree is clean.
2. **Soft Reset:** Run `git reset --soft origin/main` to uncommit all unpushed changes while keeping them staged.
3. **Unstage:** Run `git reset HEAD` to unstage everything so you can selectively group them.
4. **Group Changes:** Analyze changes (`git diff --stat`). Group related files together.
5. **Stage & Commit:** Selectively `git add` and commit them logically.

## Commit Message Shape

Use the conventional commit format:

```text
type(scope): short description

- Detailed bullet points for what changed
- Brief explanation of why when useful
```

Valid types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `style`.

## Guardrails
- **NEVER** use `git add -A` or `git add .` — always add specific files.
- **NEVER** mix unrelated changes in the same commit.
- Read the diffs (`git diff`) before deciding grouping.
- Ensure the original intent of squashed commits is preserved in the new message bodies.

## Output
After committing, output a summary of the new commits created and what each one contains.