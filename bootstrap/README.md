# Bootstrap (macOS onboarding)

Generic macOS setup for the Worldwide AI config. Works on any Mac — no nix
required. Nix, if present, is an optional overlay only.

## What it does

1. Verifies macOS.
2. Installs **Homebrew** if missing (Apple Silicon / Intel `shellenv` handled).
3. Installs **uv** if missing (`astral.sh/uv/install.sh`), updates PATH for the run.
4. Installs **node/npm** via brew if missing.
5. Installs **pi** (official `pi.dev/install.sh` installer, npm fallback), verifies `pi --version`.
6. Clones this repo into `~/.config/ai` (or adopts it in place; prompts before backing up an existing non-repo dir). HTTPS by default; override with `AI_CONFIG_REPO`.
7. Symlinks `~/.config/ai` items into `~/.pi/agent` — never overwriting `auth.json` or `sessions`. Real conflicting files are backed up.
8. Provider onboarding: runs `pi /login` (GPT Codex) and prompts for the Opencode Zen key (writes `~/.config/.env` `ZEN_OPENCODE_API`, `chmod 600`). Command Code optional.
9. Docs: runs `scripts/fetch-docs.sh` (discord.py/nextcord) and installs Next.js docs from the pinned npm tarball into `~/.config/ai/docs/next.js` (no `/data` path).
10. Optional nix overlay: links `rules/*.md` / `memories/*.md` from an overlay dir into gitignored `rules/local-*.md` / `memories/local-nix/`. If nix exists but no overlay, generates a minimal `rules/local-nix.md`. Else removes it.
11. Runs `extensions/pi-tts/setup.sh` (permanent uv venv, no nix).
12. Verifies (JSON parse, symlinks, `pi --version`, docs dirs, TTS wrapper) and writes `~/.config/ai/.bootstrap-manifest.json`.

## Usage

One-liner:

```bash
sh -c "$(curl -fsSL https://raw.githubusercontent.com/drlove2002/ai-config/main/bootstrap/bootstrap.sh)"
```

Or after cloning:

```bash
./bootstrap/setup.sh                # full run
./bootstrap/setup.sh --skip-docs    # skip doc fetch
./bootstrap/setup.sh --skip-tts     # skip Pocket TTS install
./bootstrap/setup.sh --dry-run      # print actions, change nothing
```

## Files

- `bootstrap.sh` — thin downloader for the one-line install.
- `setup.sh` — entrypoint; delegates to `onboard.py`.
- `onboard.py` — orchestrator (Python 3 standard library only).
- `bootstrap.config.json` — reserved for future tunables (currently unused).

## Generated / gitignored artifacts

`.bootstrap-manifest.json`, `rules/local-*.md`, `memories/local-nix/`,
`extensions/pi-tts/.venv/`, and the generated `extensions/pi-tts/bin/pocket-tts-cli`
wrapper are gitignored and never committed.
