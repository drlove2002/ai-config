#!/usr/bin/env python3
"""Bootstrap orchestrator for the Worldwide AI config on macOS.

Generic for any Mac user. Installs Homebrew, uv, node, and pi; clones (or adopts)
this repo into ~/.config/ai; links it into ~/.pi/agent; sets up providers;
optionally links a local nix agent overlay; and installs Pocket TTS.

Run via bootstrap/setup.sh. Can also be invoked directly:
    python3 bootstrap/onboard.py [--skip-tts] [--dry-run]
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

HOME = Path.home()
AI_DIR = HOME / ".config" / "ai"
PI_AGENT_DIR = HOME / ".pi" / "agent"
MANIFEST = AI_DIR / ".bootstrap-manifest.json"

# Symlinked items from ~/.config/ai -> ~/.pi/agent (never overwrite auth/sessions).
LINK_ITEMS = [
    "AGENTS.md",
    "agents",
    "extensions",
    "memories",
    "rules",
    "skills",
    "models.json",
    "settings.json",
    "keybindings.json",
]
# Never overwrite these inside ~/.pi/agent.
PROTECTED = {"auth.json", "sessions"}

PI_NPM_PACKAGE = "@earendil-works/pi-coding-agent"
PI_INSTALL_CURL = "https://pi.dev/install.sh"
AI_CONFIG_REPO_DEFAULT = "https://github.com/drlove2002/ai-config.git"

NIX_OVERLAY_CANDIDATES = [
    os.environ.get("AI_NIX_CONFIG_DIR"),
    str(HOME / ".config" / "nixos" / "ai"),
    str(HOME / ".config" / "nix-darwin" / "ai"),
    str(HOME / ".config" / "nix" / "ai"),
]


def log(msg: str) -> None:
    print(f"[bootstrap] {msg}")


def run(cmd, *args, check=True, shell=False, env=None, capture=False):
    log(f"run: {cmd if isinstance(cmd, str) else ' '.join(cmd)}")
    if isinstance(cmd, str) and not shell:
        cmd = cmd.split()
    result = subprocess.run(
        cmd, *args, check=check, shell=shell, env=env,
        capture_output=capture, text=capture,
    )
    if capture:
        # Always return captured stdout as text, even on non-zero exit. Callers
        # must not assume a CompletedProcess is returned (that previously caused
        # AttributeError when calling .strip()).
        return result.stdout or ""
    return result


def which(name: str) -> bool:
    return shutil.which(name) is not None


def is_macos() -> bool:
    return sys.platform == "darwin"


def prompt_yes_no(question: str, default: bool = False) -> bool:
    suffix = " [Y/n] " if default else " [y/N] "
    try:
        ans = input(question + suffix).strip().lower()
    except EOFError:
        return default
    if not ans:
        return default
    return ans in ("y", "yes")


def _write_env_key(env_file: Path, key: str, value: str) -> None:
    """Write KEY=VALUE to a dotenv file, replacing any existing line.

    Idempotent: an existing line is replaced rather than appended, so repeated
    runs never create duplicates. Sets restrictive 0600 perms.
    """
    line = f"{key}={value}"
    existing: list[str] = []
    if env_file.exists():
        existing = env_file.read_text().splitlines()
    kept = [ln for ln in existing if not ln.startswith(f"{key}=")]
    kept.append(line)
    env_file.write_text("\n".join(kept).rstrip("\n") + "\n")
    os.chmod(env_file, 0o600)


# ── Prerequisite installers ──

def install_homebrew() -> None:
    if which("brew"):
        log("Homebrew already installed.")
        return
    log("Installing Homebrew...")
    install_cmd = (
        '/bin/bash -c "$(curl -fsSL '
        'https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
    )
    run(install_cmd, shell=True)
    # Add brew to PATH for the current run.
    for prefix in ("/opt/homebrew/bin", "/usr/local/bin"):
        if os.path.exists(prefix) and prefix not in os.environ["PATH"]:
            os.environ["PATH"] = f"{prefix}:{os.environ['PATH']}"
    log("Homebrew installed. Restart your shell for the profile change to persist.")


def install_uv() -> None:
    if which("uv"):
        log("uv already installed.")
        return
    log("Installing uv...")
    run("curl -LsSf https://astral.sh/uv/install.sh | sh", shell=True)
    uv_bin = HOME / ".local" / "bin"
    if uv_bin.exists() and str(uv_bin) not in os.environ["PATH"]:
        os.environ["PATH"] = f"{uv_bin}:{os.environ['PATH']}"
    log("uv installed.")


def install_node() -> None:
    if which("node") and which("npm"):
        log("node/npm already installed.")
        return
    if which("brew"):
        log("Installing node via Homebrew...")
        run(["brew", "install", "node"])
    else:
        log("WARN: Homebrew missing, cannot install node automatically.")


def install_pi() -> None:
    if which("pi"):
        log("pi already installed.")
        # Verify it reports a version.
        try:
            run(["pi", "--version"], check=True)
        except subprocess.CalledProcessError:
            log("WARN: pi present but `pi --version` failed.")
        return
    log("Installing pi...")
    # Prefer the official installer; fall back to npm.
    try:
        run(f"curl -fsSL {PI_INSTALL_CURL} | sh", shell=True)
    except subprocess.CalledProcessError:
        log("Official installer failed; falling back to npm global install.")
        run(["npm", "install", "-g", "--ignore-scripts", PI_NPM_PACKAGE])
    try:
        run(["pi", "--version"], check=True)
        log("pi installed.")
    except subprocess.CalledProcessError:
        log("WARN: pi installed but `pi --version` failed. Check your PATH.")


# ── Repo adopt/clone ──

def ensure_repo(dry_run: bool) -> None:
    repo = os.environ.get("AI_CONFIG_REPO", AI_CONFIG_REPO_DEFAULT)
    if AI_DIR.exists() and any(AI_DIR.iterdir()):
        # Already populated. If it is this repo, adopt it; else prompt.
        git_dir = AI_DIR / ".git"
        if git_dir.exists():
            log(f"{AI_DIR} already a git repo; adopting in place.")
            return
        log(f"{AI_DIR} exists and is non-empty but not a git repo.")
        if dry_run:
            log("[dry-run] would prompt before backing up / replacing.")
            return
        if prompt_yes_no("Back up and replace existing ~/.config/ai?", default=False):
            backup = HOME / f".config/ai-backup-{int(__import__('time').time())}"
            log(f"Backing up to {backup}")
            if not dry_run:
                shutil.move(str(AI_DIR), str(backup))
        else:
            log("Aborting repo setup. Leaving ~/.config/ai untouched.")
            return
    log(f"Cloning {repo} -> {AI_DIR}")
    if not dry_run:
        run(["git", "clone", repo, str(AI_DIR)])


# ── Symlink config into ~/.pi/agent ──

def link_config(dry_run: bool) -> None:
    PI_AGENT_DIR.mkdir(parents=True, exist_ok=True)
    for item in LINK_ITEMS:
        src = AI_DIR / item
        dst = PI_AGENT_DIR / item
        if not src.exists():
            log(f"skip link (missing source): {item}")
            continue
        if dst.name in PROTECTED:
            log(f"protect: {dst} left untouched")
            continue
        if dst.exists() or dst.is_symlink():
            if dst.is_symlink() and os.readlink(dst) == str(src):
                continue
            if not dry_run:
                if dst.is_dir() and not dst.is_symlink():
                    backup = dst.with_suffix(dst.suffix + ".bak")
                    log(f"backing up real dir {dst} -> {backup}")
                    shutil.move(str(dst), str(backup))
                else:
                    log(f"removing conflicting {dst}")
                    dst.unlink()
        if not dry_run:
            dst.symlink_to(src, target_is_directory=src.is_dir())
        log(f"link {dst} -> {src}")


# ── Provider onboarding ──

def setup_providers(dry_run: bool) -> None:
    # GPT Codex: instruct interactive /login, but only when interactive.
    if which("pi") and not dry_run and sys.stdin.isatty():
        if prompt_yes_no("Now run `pi /login` to authenticate GPT Codex?", default=True):
            try:
                run(["pi", "/login"], check=False)
            except Exception:
                log("WARN: `pi /login` failed or was interrupted.")
        else:
            log("Skipped `pi /login`. Run it later: pi /login")
    else:
        log("GPT Codex: run `pi /login` when ready (skipped: non-interactive or pi missing).")

    # Opencode Zen API key -> ~/.config/.env (chmod 600). Idempotent: replace
    # any existing ZEN_OPENCODE_API= line instead of appending duplicates.
    if dry_run:
        log("[dry-run] would prompt for Opencode Zen API key; skipping.")
        return
    env_file = HOME / ".config" / ".env"
    env_file.parent.mkdir(parents=True, exist_ok=True)
    key = os.environ.get("ZEN_OPENCODE_API", "")
    if not key:
        key = input("Paste Opencode Zen API key (leave blank to skip): ").strip()
    if key:
        if not dry_run:
            _write_env_key(env_file, "ZEN_OPENCODE_API", key)
        log(f"Wrote ZEN_OPENCODE_API to {env_file} (chmod 600).")
    else:
        log("Skipped Opencode Zen key (none provided).")

    log("Command Code is optional; not required.")





# ── Optional nix overlay ──

def link_nix_overlay(dry_run: bool) -> None:
    overlay = next((p for p in NIX_OVERLAY_CANDIDATES if p and os.path.isdir(p)), None)
    rules_src = Path(overlay) / "rules" if overlay else None
    mem_src = Path(overlay) / "memories" if overlay else None

    if overlay and (rules_src.exists() or mem_src.exists()):
        log(f"Found nix agent overlay at {overlay}; linking gitignored local files.")
        if rules_src.exists():
            for md in rules_src.glob("*.md"):
                dst = AI_DIR / "rules" / f"local-{md.name}"
                if not dry_run:
                    dst.unlink(missing_ok=True)
                    dst.symlink_to(md)
                log(f"link {dst} -> {md}")
        if mem_src.exists():
            dst_dir = AI_DIR / "memories" / "local-nix"
            if not dry_run:
                dst_dir.mkdir(parents=True, exist_ok=True)
            for md in mem_src.glob("*.md"):
                dst = dst_dir / md.name
                if not dry_run:
                    dst.unlink(missing_ok=True)
                    dst.symlink_to(md)
                log(f"link {dst} -> {md}")
        return

    # No overlay. If nix is installed, generate minimal guidance as a local file.
    local_nix = AI_DIR / "rules" / "local-nix.md"
    if which("nix"):
        log("nix detected but no overlay present; generating minimal local-nix.md.")
        if not dry_run:
            local_nix.write_text(
                "# Local Nix Guidance (generated)\n\n"
                "nix is installed on this machine. Shared config does not require it.\n"
                "If you manage system state with nix, keep those instructions in a\n"
                "local overlay and link them here rather than editing shared files.\n"
            )
    else:
        # No nix at all: remove any generated local nix file.
        if local_nix.exists():
            log("nix not installed; removing generated local-nix.md.")
            if not dry_run:
                local_nix.unlink()


# ── Pocket TTS ──

def setup_tts(dry_run: bool) -> None:
    setup = AI_DIR / "extensions" / "pi-tts" / "setup.sh"
    if not setup.exists():
        log("WARN: extensions/pi-tts/setup.sh missing.")
        return
    if dry_run:
        log("[dry-run] would run pi-tts setup; skipping actual install.")
        return
    log("Running pi-tts setup (permanent uv venv, no nix)...")
    try:
        run(["bash", str(setup)], check=False)
    except Exception:
        log("WARN: pi-tts setup failed.")


# ── Kitty notification permission ──

def _kitty_osc99_payload(value: str) -> str:
    """Mirror notify.ts kittyPayload: drop control chars, escape backslash/semicolon."""
    cleaned = "".join(ch for ch in value if ord(ch) >= 0x20 and ord(ch) != 0x7F)
    return cleaned.replace("\\", "\\\\").replace(";", "\\;")


def _tmux_passthrough(seq: str) -> str:
    """Mirror notify.ts tmuxPassthrough: double ESC, wrap in DCS passthrough."""
    doubled = seq.replace("\x1b", "\x1b\x1b")
    return f"\x1bPtmux;{doubled}\x1b\\"


def setup_kitty_notifications(dry_run: bool) -> None:
    """Best-effort trigger for macOS/kitty to prompt for notification permission.

    Non-fatal: logs warnings only. Sends one OSC 99 notification to /dev/tty with
    a pleasant sound so macOS/kitty can prompt the user to allow alerts.
    """
    if dry_run:
        log("[dry-run] would prompt to send a kitty notification for permission (if in kitty + interactive).")
        return

    if not sys.stdin.isatty():
        log("Skipped kitty notification permission step (non-interactive).")
        return

    if not os.environ.get("KITTY_WINDOW_ID"):
        log("Not inside kitty (KITTY_WINDOW_ID unset). Run /notify-permission in Pi from official kitty later to enable alerts.")
        return

    if not prompt_yes_no(
        "Send a kitty notification now so macOS can prompt for notification permission?",
        default=True,
    ):
        log("Skipped kitty notification permission prompt.")
        return

    try:
        title = "Pi Agent"
        body = "Pi wants to send you notifications. Click Allow to enable completion alerts."
        seq = (
            f"\x1b]99;i=1:d=0:a=focus:s=aW5mbw==:p=title;{_kitty_osc99_payload(title)}\x1b\\"
            f"\x1b]99;i=1:p=body;{_kitty_osc99_payload(body)}\x1b\\"
        )
        if os.environ.get("TMUX"):
            seq = _tmux_passthrough(seq)
        with open("/dev/tty", "w") as tty:
            tty.write(seq)
            tty.flush()
        log("Sent kitty notification request; click Allow if macOS/kitty prompts.")
    except Exception as e:
        log(f"WARN: failed to send kitty notification: {e}")


# ── Verify + manifest ──

def verify(dry_run: bool) -> dict:
    checks: dict[str, object] = {}
    checks["pi_version"] = None
    try:
        out = run(["pi", "--version"], check=False, capture=True)
    except Exception:
        out = None
    if out:
        checks["pi_version"] = out.strip() or "present"
    else:
        checks["pi_version"] = "missing"

    try:
        checks["symlinks_ok"] = all(
            (PI_AGENT_DIR / item).exists() or (PI_AGENT_DIR / item).is_symlink()
            for item in LINK_ITEMS
            if (AI_DIR / item).exists()
        )

        checks["tts_wrapper"] = (AI_DIR / "extensions" / "pi-tts" / "bin" / "pocket-tts-cli").exists()
    except Exception as e:
        checks["symlinks_ok"] = f"ERROR: {e}"

    # Validate JSON files touched.
    for jf in ("pi-tts.json", "models.json", "settings.json"):
        p = AI_DIR / jf
        if p.exists():
            try:
                json.loads(p.read_text())
                checks[f"json_ok:{jf}"] = True
            except json.JSONDecodeError as e:
                checks[f"json_ok:{jf}"] = f"ERROR: {e}"

    return checks


def write_manifest(checks: dict, dry_run: bool) -> None:
    manifest = {
        "generated_by": "bootstrap/onboard.py",
        "platform": sys.platform,
        "checks": checks,
    }
    if not dry_run:
        AI_DIR.mkdir(parents=True, exist_ok=True)
        MANIFEST.write_text(json.dumps(manifest, indent=2))
        log(f"Wrote manifest: {MANIFEST}")
    else:
        log(f"[dry-run] manifest would be: {json.dumps(manifest, indent=2)}")


def main() -> int:
    ap = argparse.ArgumentParser(description="macOS AI config bootstrap")
    ap.add_argument("--skip-tts", action="store_true", help="skip Pocket TTS setup")
    ap.add_argument("--dry-run", action="store_true", help="print actions, change nothing")
    args = ap.parse_args()

    if not is_macos():
        log("ERROR: this bootstrap targets macOS only.")
        return 2

    log("Starting macOS onboarding (generic).")
    try:
        install_homebrew()
        install_uv()
        install_node()
        install_pi()
        ensure_repo(args.dry_run)
        link_config(args.dry_run)
        setup_providers(args.dry_run)

        link_nix_overlay(args.dry_run)
        if not args.skip_tts:
            setup_tts(args.dry_run)
        setup_kitty_notifications(args.dry_run)
    except Exception as e:
        log(f"WARN: onboarding step failed: {e}")
    checks = verify(args.dry_run)
    write_manifest(checks, args.dry_run)
    log("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
