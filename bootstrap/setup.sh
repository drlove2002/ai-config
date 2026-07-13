#!/usr/bin/env bash
# bootstrap/setup.sh — macOS onboarding entrypoint for the Worldwide AI config.
#
# Generic for any Mac user. Installs brew/uv/node/pi, adopts this repo into
# ~/.config/ai, links it into ~/.pi/agent, configures providers, fetches docs,
# optionally links a local nix agent overlay, and installs Pocket TTS.
#
# Usage:
#   ./bootstrap/setup.sh [--skip-docs] [--skip-tts] [--dry-run]
#
# The script runs onboard.py (Python 3) for the heavy lifting.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ "$(uname)" != "Darwin" ]; then
  echo "[bootstrap] ERROR: this script targets macOS only." >&2
  exit 2
fi

if ! command -v python3 &>/dev/null; then
  echo "[bootstrap] ERROR: python3 is required." >&2
  exit 1
fi

exec python3 "$SCRIPT_DIR/onboard.py" "$@"
