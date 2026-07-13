#!/usr/bin/env bash
# collect-changes.sh — read-only change-scope reporter for the simplify-code skill.
#
# Usage: collect-changes.sh [<diff-range>]
#   No arg -> report uncommitted changes (tracked modified + staged + untracked)
#             and unpushed commits against upstream if configured.
#   Arg    -> report changed files and diff stat for the given range/ref.
#
# Read-only: never stages, checks out, resets, or pushes.
set -euo pipefail

# Must run inside a git repository.
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Error: not inside a git repository." >&2
  exit 1
fi

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'detached')"
upstream="$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || echo 'none')"

echo "Repo root : $repo_root"
echo "Branch    : $branch"
echo "Upstream  : $upstream"

# User-provided diff range/ref.
if [ "$#" -ge 1 ]; then
  range="$1"
  echo ""
  echo "=== Diff range: $range ==="
  echo "--- Changed files ---"
  git diff --name-only "$range"
  echo "--- Diff stat ---"
  git diff --stat "$range"
  exit 0
fi

# Default: uncommitted + unpushed.
echo ""
echo "=== Working tree status ==="
git status --short

echo ""
echo "=== Changed files (tracked modified + untracked) ==="
{
  git diff --name-only HEAD
  git ls-files --others --exclude-standard
} | sort -u

echo ""
echo "=== Diff stat (tracked, unstaged + staged) ==="
git diff --stat HEAD

if [ "$upstream" != "none" ]; then
  echo ""
  echo "=== Unpushed commits ($upstream..HEAD) ==="
  git log --oneline "$upstream..HEAD"
  echo "--- Unpushed diff stat ---"
  git diff --stat "$upstream..HEAD"
else
  echo ""
  echo "=== Unpushed commits ==="
  echo "No upstream configured; skipped unpushed summary."
fi
