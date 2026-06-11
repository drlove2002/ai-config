#!/usr/bin/env bash
set -euo pipefail

DOCS_DIR="${HOME}/.config/ai/docs"
TMPDIR="$(mktemp -d)"
trap "rm -rf $TMPDIR" EXIT

declare -A REPOS=(
  ["nextcord"]="https://github.com/nextcord/nextcord|docs"
  ["discord.py"]="https://github.com/Rapptz/discord.py|docs"
)

for NAME in "${!REPOS[@]}"; do
  IFS='|' read -r URL SUBDIR <<< "${REPOS[$NAME]}"
  TARGET="${DOCS_DIR}/${NAME}"

  echo "=== Fetching ${NAME} ==="
  git clone --depth 1 --filter=blob:none --sparse "$URL" "$TMPDIR/$NAME" 2>&1 | tail -1
  cd "$TMPDIR/$NAME"
  git sparse-checkout set "$SUBDIR" 2>&1 | tail -1

  rm -rf "$TARGET"
  mv "$SUBDIR" "$TARGET"
  echo "  → $TARGET ($(find "$TARGET" -name '*.rst' -o -name '*.md' | wc -l) files)"
done

echo "Done."
