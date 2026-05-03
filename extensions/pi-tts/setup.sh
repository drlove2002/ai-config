#!/usr/bin/env bash
# pi-tts: Cross-platform build & setup
# Detects Nix vs non-Nix environments and builds pocket-tts-cli accordingly.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BIN_DIR="$SCRIPT_DIR/bin"
mkdir -p "$BIN_DIR"

echo "=== pi-tts setup ==="
echo "Target: $BIN_DIR/pocket-tts-cli"

# ── Check for existing binary ──
if [ -x "$BIN_DIR/pocket-tts-cli" ]; then
    echo "Binary already exists. To rebuild, delete $BIN_DIR/pocket-tts-cli first."
    echo "Start server: $BIN_DIR/pocket-tts-cli serve --port 18080 --voice alba"
    exit 0
fi

# ── Nix path ──
if command -v nix &>/dev/null && [ -f "$SCRIPT_DIR/flake.nix" ]; then
    echo "Nix detected — building with flake..."
    cd "$SCRIPT_DIR"
    nix build --no-link

    # Find the result symlink or store path
    if [ -L result ] || [ -d result ]; then
        NIX_OUT="$(readlink -f result)"
    else
        NIX_OUT="$(nix eval --raw .#default.outPath 2>/dev/null || echo "")"
    fi

    if [ -n "$NIX_OUT" ] && [ -f "$NIX_OUT/bin/pocket-tts-cli" ]; then
        # Create a wrapper so the binary can find its config files
        cat > "$BIN_DIR/pocket-tts-cli" <<WRAPPER
#!/usr/bin/env bash
exec "$NIX_OUT/bin/pocket-tts-cli" "\$@"
WRAPPER
        chmod +x "$BIN_DIR/pocket-tts-cli"
        echo "Built: $BIN_DIR/pocket-tts-cli"
        echo "Start server: $BIN_DIR/pocket-tts-cli serve --port 18080 --voice alba"
        exit 0
    fi
    echo "Nix build produced no binary. Falling back to cargo..."
fi

# ── Cargo path (for non-Nix Linux) ──
if command -v cargo &>/dev/null; then
    echo "Cargo detected — building from source..."

    # Check system dependencies
    MISSING=""
    for lib in openssl alsa; do
        if ! pkg-config --exists "$lib" 2>/dev/null; then
            MISSING="$MISSING $lib"
        fi
    done

    if [ -n "$MISSING" ]; then
        echo ""
        echo "Missing system packages. Install them first:"
        echo "  Debian/Ubuntu: sudo apt install libssl-dev libasound2-dev pkg-config"
        echo "  Fedora:        sudo dnf install openssl-devel alsa-lib-devel pkg-config"
        echo "  Arch:          sudo pacman -S openssl alsa-lib pkgconf"
        exit 1
    fi

    BUILD_DIR="$(mktemp -d)"
    trap "rm -rf $BUILD_DIR" EXIT

    git clone --depth 1 --branch main \
        https://github.com/PocketVTuber/pocket-tts-cli.git \
        "$BUILD_DIR" 2>/dev/null || {
        echo "Failed to clone pocket-tts-cli. Check your internet connection."
        exit 1
    }

    cd "$BUILD_DIR"

    # Apply ungated weights patch
    for cfg in crates/pocket-tts/config/*.yaml; do
        sed -i '/^weights_path:/d' "$cfg"
        sed -i 's/^weights_path_without_voice_cloning:/weights_path:/' "$cfg"
    done

    cargo build --release --no-default-features

    # Copy binary and config files
    cp target/release/pocket-tts-cli "$BIN_DIR/pocket-tts-cli-real"
    mkdir -p "$BIN_DIR/config"
    cp crates/pocket-tts/config/*.yaml "$BIN_DIR/config/"

    # Wrapper to set working directory for config resolution
    cat > "$BIN_DIR/pocket-tts-cli" <<WRAPPER
#!/usr/bin/env bash
cd "\$(dirname "\$0")"
exec ./pocket-tts-cli-real "\$@"
WRAPPER
    chmod +x "$BIN_DIR/pocket-tts-cli"

    echo "Built: $BIN_DIR/pocket-tts-cli"
    echo "Start server: $BIN_DIR/pocket-tts-cli serve --port 18080 --voice alba"
    exit 0
fi

# ── Neither Nix nor Cargo ──
echo ""
echo "Neither Nix nor Cargo found."
echo "Install one of:"
echo "  - Nix:     curl -L https://nixos.org/nix/install | sh"
echo "  - Rust:    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
echo ""
echo "Then re-run: $0"
exit 1
