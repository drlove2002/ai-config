#!/usr/bin/env bash
# pi-tts: permanent local Pocket TTS setup.
#
# Installs pocket-tts into a uv-managed virtualenv at extensions/pi-tts/.venv
# (no uvx, no nix) and exposes it as bin/pocket-tts-cli. Idempotent and
# reproducible: re-running upgrades/repairs the venv.
#
# Start the server: bin/pocket-tts-cli serve --host 127.0.0.1 --port 18080

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV_DIR="$SCRIPT_DIR/.venv"
BIN_DIR="$SCRIPT_DIR/bin"
WRAPPER="$BIN_DIR/pocket-tts-cli"
POCKET_TTS_VERSION="2.1.0"
PORT="${TTS_PORT:-18080}"

echo "=== pi-tts setup ==="
echo "Venv:  $VENV_DIR"
echo "Bin:   $WRAPPER"

# uv is required to build a stable, self-contained venv.
if ! command -v uv &>/dev/null; then
  echo ""
  echo "uv not found."
  echo "Install uv first:  curl -LsSf https://astral.sh/uv/install.sh | sh"
  echo "Then re-run: $0"
  exit 1
fi

# Create the venv if missing.
if [ ! -x "$VENV_DIR/bin/python" ]; then
  echo "Creating venv at $VENV_DIR ..."
  uv venv "$VENV_DIR" --python 3.12
fi

# (Re)install the pinned pocket-tts into the venv.
echo "Installing pocket-tts==$POCKET_TTS_VERSION into venv ..."
uv pip install --python "$VENV_DIR/bin/python" "pocket-tts==$POCKET_TTS_VERSION"

# Build the bin wrapper that execs the venv binary.
mkdir -p "$BIN_DIR"
cat > "$WRAPPER" <<'WRAPPER'
#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# venv lives one level up from bin/ (extensions/pi-tts/.venv)
PARENT="$(dirname "$SCRIPT_DIR")"
exec "$PARENT/.venv/bin/pocket-tts" "$@"
WRAPPER
chmod +x "$WRAPPER"

# Verify the wrapper execs and the CLI is reachable.
if ! "$WRAPPER" --help >/dev/null 2>&1; then
  echo ""
  echo "WARNING: $WRAPPER --help failed. pocket-tts may need extra system libs."
  echo "Server start: $WRAPPER serve --host 127.0.0.1 --port $PORT"
  exit 0
fi

echo "Built: $WRAPPER"
echo "Start server: $WRAPPER serve --host 127.0.0.1 --port $PORT"
