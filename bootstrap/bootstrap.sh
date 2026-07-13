#!/usr/bin/env bash
# bootstrap/bootstrap.sh — one-line fetch-and-run for the macOS onboarding.
#
# Usage:
#   sh -c "$(curl -fsSL https://raw.githubusercontent.com/drlove2002/ai-config/main/bootstrap/bootstrap.sh)"
#
# Clones the repo to a temp dir, then runs bootstrap/setup.sh. Idempotent:
# if ~/.config/ai already exists it is adopted in place.

set -euo pipefail

REPO="${AI_CONFIG_REPO:-https://github.com/drlove2002/ai-config.git}"
TMP="$(mktemp -d)"
trap "rm -rf $TMP" EXIT

echo "=== pi ai-config bootstrap ==="
echo "Cloning $REPO into $TMP ..."
git clone --depth 1 "$REPO" "$TMP/repo"

echo "Running bootstrap/setup.sh ..."
bash "$TMP/repo/bootstrap/setup.sh" "$@"
status=$?
trap - EXIT
rm -rf "$TMP"
exit "$status"
