#!/usr/bin/env bash
# pi-tts: Local TTS setup wrapper
# Uses uvx to expose the kyutai-labs/pocket-tts CLI as pocket-tts-cli.

# Keep the legacy binary name because the extension expects it.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BIN_DIR="$SCRIPT_DIR/bin"
mkdir -p "$BIN_DIR"

echo "=== pi-tts setup ==="
echo "Target: $BIN_DIR/pocket-tts-cli"

# Reuse an existing wrapper if it is already in place.
if [ -x "$BIN_DIR/pocket-tts-cli" ]; then
    echo "Binary already exists. To rebuild, delete $BIN_DIR/pocket-tts-cli first."
    echo "Start server: $BIN_DIR/pocket-tts-cli serve --host 127.0.0.1 --port 18080"
    exit 0
fi

if ! command -v uvx &>/dev/null; then
    echo ""
    echo "uvx not found."
    echo "Install uv so pi-tts can launch pocket-tts."
    echo ""
    echo "Then re-run: $0"
    exit 1
fi

if ! command -v nix &>/dev/null; then
    echo ""
    echo "nix not found."
    echo "pi-tts needs nix to provide libstdc++ for pocket-tts's torch runtime."
    echo ""
    echo "Then re-run: $0"
    exit 1
fi

cat > "$BIN_DIR/pocket-tts-cli" <<'WRAPPER'
#!/usr/bin/env bash
set -euo pipefail

export LD_LIBRARY_PATH="$(nix eval --raw nixpkgs#gcc.cc.lib.outPath)/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
exec uvx --from pocket-tts pocket-tts "$@"
WRAPPER
chmod +x "$BIN_DIR/pocket-tts-cli"

echo "Built: $BIN_DIR/pocket-tts-cli"
echo "Start server: $BIN_DIR/pocket-tts-cli serve --host 127.0.0.1 --port 18080"
