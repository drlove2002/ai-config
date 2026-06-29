#!/usr/bin/env bash
set -euo pipefail

# === macOS AI Config Setup ===
# Run this after cloning the nixos config repo on a Mac.
# Links ~/.config/ai from an existing backup or copies it from the NixOS PC.

AI_DIR="$HOME/.config/ai"
REPO_DIR="$HOME/.config/nixos"

if [ -d "$AI_DIR" ] && [ -n "$(ls -A "$AI_DIR" 2>/dev/null)" ]; then
  echo "~/.config/ai already exists and is not empty. Skipping."
  exit 0
fi

# Option 1: AI config lives as a tracked directory in the nixos repo
if [ -d "$REPO_DIR/ai-config" ]; then
  echo "Linking AI config from nixos repo..."
  ln -sfn "$REPO_DIR/ai-config" "$AI_DIR"
  echo "Done."
  exit 0
fi

# Option 2: Restore from a backup tarball
BACKUP="$HOME/ai-backup.tar.zst"
if [ -f "$BACKUP" ]; then
  echo "Restoring from $BACKUP..."
  mkdir -p "$AI_DIR"
  tar --zstd -xf "$BACKUP" -C "$AI_DIR"
  echo "Done."
  exit 0
fi

# Option 3: Instructions
echo ""
echo "=== No AI config found ==="
echo ""
echo "Copy it from your NixOS PC with one of:"
echo ""
echo "  # rsync (direct)"
echo "  rsync -avz nixos:~/.config/ai/ ~/.config/ai/"
echo ""
echo "  # tar + scp (faster for large dirs)"
echo "  cd ~/.config && tar --zstd -cf /tmp/ai-backup.tar.zst ai"
echo "  scp /tmp/ai-backup.tar.zst mac:~/""
echo "  # then re-run this script"
echo ""
echo "  # rsync reverse (if Mac can reach NixOS)"
echo "  rsync -avz ~/.config/ai/ nixos:~/.config/ai/"
echo ""
