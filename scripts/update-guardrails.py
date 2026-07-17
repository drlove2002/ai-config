#!/usr/bin/env python3
"""Regenerate auto-sections of worldwide-guardrails.md from session logs.

Reads session JSONL files, extracts correction signals, updates the Failure
Modes table and Evolution metadata block. Sections marked with
<!-- AUTO:..._START/END --> are replaced. All other content is preserved.

Incremental by default: only processes sessions newer than the last run.
Use --reset to force a full re-scan.

Trigger: daily systemd timer (home/programs/ai-guardrails.nix)
Runtime: ~/scripts/ or manual invocation
"""

import argparse
import json
import re
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

WORLDWIDE_DIR = Path.home() / "Projects/worldwide"
SESSION_KEY = f"--{str(WORLDWIDE_DIR).strip('/').replace('/', '-')}--"
SESSION_DIR = Path.home() / ".pi/agent/sessions" / SESSION_KEY
GUARDRAILS_FILE = Path.home() / ".config/ai/rules/worldwide-guardrails.md"
STATE_FILE = Path.home() / ".config/ai/.guardrails-state.json"

CUTOFF_DATE = datetime(2026, 4, 1, tzinfo=timezone.utc)  # ignore ancient sessions

# ── Signal detection ────────────────────────────────────────────────────────

CORRECTION_SIGNALS = [
    "don't", "never", "stop", "wrong", "incorrect", "no,", "actually",
    "instead", "should", "shouldn't", "always", "not that", "you missed",
    "why did you", "i already told", "remember", "read the", "check the",
    "look at", "AGENTS.md", "guidelines", "guardrails", "you forgot",
    "please read", "before you", "use the", "not that way",
]

FAILURE_CATEGORIES = {
    "FM1_git_history": {
        "sig": [
            r"\bgit log\b", r"\bgit history\b", r"\bcheck git\b",
            r"\bgit diff\b", r"\bgit blame\b", r"\bgit show\b",
        ],
        "label": "Git history not checked before changes",
        "rule": "Rule 1",
    },
    "FM2_unsafe_assumptions": {
        "sig": [
            "don't", "never", "stop", "wrong", "incorrect", "not that",
            "shouldn't", "you shouldn't", "not supposed to",
        ],
        "label": "Unsafe assumptions (wrong error codes, naming, semantics)",
        "rule": "Rules 5, 6",
    },
    "FM3_mid_flow": {
        "sig": [
            r"\bcontinue where you left\b", r"\bkeep going\b", r"\bfinish the\b",
            r"\byou stopped\b", r"\bwhy did you stop\b", r"\bnot done\b",
        ],
        "label": "Agent stops mid-flow on multi-file work",
        "rule": "Rule 7 (main agent retains ownership through verification)",
    },
    "FM4_over_engineering": {
        "sig": [
            r"\bsimplif", r"\btoo much\b", r"\boverkill\b",
            r"\bjust do\b", r"\ball i wanted\b", r"\bunnecessary\b",
        ],
        "label": "Over-engineering (should be simpler)",
        "rule": "Rules 6, 7",
    },
    "FM5_wrong_root": {
        "sig": [
            r"\bnot a git repo\b", r"\bworkspace root\b", r"\bnot in.*git\b",
            r"\bcd into the.*repo\b", r"\bgit -C\b", r"\bwrong.*repo\b",
        ],
        "label": "Git commands at workspace root (not a repo)",
        "rule": "Rule 4",
    },
    "FM6_agents_md": {
        "sig": [
            r"\bAGENTS\.md\b", r"\bguidelines\b", r"\bguardrails\b",
            r"\byou forgot to read\b", r"\bread the.*file\b",
        ],
        "label": "AGENTS.md not read before acting",
        "rule": "Rule 2",
    },
    "FM7_edit_failure": {
        "sig": [
            r"\bstale\b", r"\banchor\b", r"\bpre-read\b",
            r"\bread before edit\b", r"\bLINE#HASH\b",
        ],
        "label": "Edit tool failures (stale anchors, no pre-read)",
        "rule": "Read before edit",
    },
    "FM8_circular_thinking": {
        "sig": [
            r"\bwait.*re-examin", r"\bcircular thinking", r"\bwait.*let me",
            r"\bactually.*i just realized", r"\bwait.*unless\b",
            r"\bthinking in circle", r"\breconsider", r"\bopen.?thinking\b",
            r"\bre-?litigat", r"\bself.?doubt", r"\bwhat if instead\b",
            r"\bjust going in loop", r"\btoken waste",
        ],
        "label": "Circular thinking / open-thinking paralysis",
        "rule": "No Circular Thinking (orchestrator.md)",
    },
}


def extract_user_messages(filepath: Path) -> list[str]:
    """Extract user message text from a session JSONL file."""
    messages = []
    try:
        with open(filepath) as f:
            for line in f:
                try:
                    d = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if d.get("type") != "message":
                    continue
                msg = d.get("message", {})
                if msg.get("role") != "user":
                    continue
                content = msg.get("content", "")
                if isinstance(content, list):
                    text = " ".join(
                        b.get("text", "") for b in content
                        if isinstance(b, dict) and b.get("type") == "text"
                    )
                else:
                    text = str(content)
                if text.strip():
                    messages.append(text)
    except Exception:
        pass
    return messages


def count_failure_matches(messages: list[str]) -> dict[str, int]:
    """Count how many user messages match each failure pattern."""
    counts = {k: 0 for k in FAILURE_CATEGORIES}
    for msg in messages:
        lower = msg.lower()
        for key, cat in FAILURE_CATEGORIES.items():
            for sig in cat["sig"]:
                if re.search(sig, lower, re.IGNORECASE):
                    counts[key] += 1
                    break
    return counts


# ── State management ─────────────────────────────────────────────────────────

def load_state() -> dict:
    """Load cumulative state from disk. Returns empty dict if missing/corrupt."""
    if not STATE_FILE.exists():
        return {"last_processed_date": None, "failure_counts": {}, "total_sessions": 0}
    try:
        with open(STATE_FILE) as f:
            state = json.load(f)
        d = state.get("last_processed_date")
        state["last_processed_date"] = (
            datetime.fromisoformat(d).replace(tzinfo=timezone.utc) if d else None
        )
        return state
    except (json.JSONDecodeError, KeyError, ValueError):
        return {"last_processed_date": None, "failure_counts": {}, "total_sessions": 0}


def save_state(last_date: datetime, failure_counts: dict[str, int], total: int) -> None:
    """Persist cumulative state to disk."""
    state = {
        "last_processed_date": last_date.isoformat(),
        "failure_counts": failure_counts,
        "total_sessions": total,
    }
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, indent=2) + "\n")


def merge_counts(cumulative: dict[str, int], new: dict[str, int]) -> dict[str, int]:
    """Add new counts into cumulative dict."""
    merged = dict(cumulative)
    for k, v in new.items():
        merged[k] = merged.get(k, 0) + v
    return merged


# ── Analysis ─────────────────────────────────────────────────────────────────

def find_latest_session_date() -> datetime | None:
    """Find the newest session date across all files."""
    latest = None
    for fpath in SESSION_DIR.glob("*.jsonl"):
        try:
            date_str = fpath.name[:10]
            d = datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            continue
        if latest is None or d > latest:
            latest = d
    return latest


def analyze_sessions(
    start_date: datetime | None = None,
) -> tuple[dict[str, int], int]:
    """Analyze session files. Only processes files >= start_date if given.

    Returns (failure_counts, sessions_processed).
    """
    files = sorted(SESSION_DIR.glob("*.jsonl"))

    all_failure_counts: dict[str, int] = {}
    total = 0

    for fpath in files:
        try:
            date_str = fpath.name[:10]
            session_date = datetime.strptime(date_str, "%Y-%m-%d").replace(
                tzinfo=timezone.utc
            )
        except ValueError:
            continue
        if session_date < CUTOFF_DATE:
            continue
        if start_date is not None and session_date < start_date:
            continue

        total += 1
        messages = extract_user_messages(fpath)
        session_failures = count_failure_matches(messages)
        for key, count in session_failures.items():
            if count > 0:
                all_failure_counts[key] = all_failure_counts.get(key, 0) + 1

    return all_failure_counts, total


# ── Output generation ────────────────────────────────────────────────────────

def generate_failure_table(counts: dict[str, int]) -> str:
    """Generate the Markdown failure modes table."""
    lines = [
        "<!-- AUTO:FAILURE_MODES_START -->",
        "## Known Failure Modes (from session analysis)",
        "",
        "| # | Pattern | Count | Prevented by rule |",
        "|---|---------|-------|-------------------|",
    ]

    ordered = sorted(FAILURE_CATEGORIES.items(), key=lambda x: x[0])
    for idx, (key, cat) in enumerate(ordered):
        count = counts.get(key, 0)
        lines.append(
            f"| FM{idx + 1} | {cat['label']} | {count} sessions with pattern | {cat['rule']} |"
        )

    lines.append("<!-- AUTO:FAILURE_MODES_END -->")
    return "\n".join(lines)


def generate_meta_block(total_sessions: int, incremental: bool = False) -> str:
    """Generate the Self-Evolution metadata block."""
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    mode = "incremental" if incremental else "full re-scan"
    lines = [
        "<!-- AUTO:EVOLUTION_META_START -->",
        "## Self-Evolution",
        "",
        "This file's auto-generated sections (Failure Modes, this metadata block) are refreshed daily by `update-guardrails.py` triggered via systemd timer. The HARD RULES and Integration Hotspots sections are hand-curated and never overwritten.",
        "",
        f"**Last analysis**: {now} ({total_sessions} sessions, {mode})",
        "**Run**: `~/.config/ai/scripts/update-guardrails.py`",
        "<!-- AUTO:EVOLUTION_META_END -->",
    ]
    return "\n".join(lines)


def update_guardrails(
    failure_table: str, meta_block: str, write: bool = True
) -> str:
    """Replace auto-sections in the guardrails file."""
    if not GUARDRAILS_FILE.exists():
        print(f"ERROR: {GUARDRAILS_FILE} not found", file=sys.stderr)
        sys.exit(1)

    content = GUARDRAILS_FILE.read_text()

    # Replace failure modes table
    pattern_fm = re.compile(
        r"<!-- AUTO:FAILURE_MODES_START -->.*?<!-- AUTO:FAILURE_MODES_END -->",
        re.DOTALL,
    )
    content = pattern_fm.sub(failure_table.replace("\\", "\\\\"), content)

    # Replace evolution metadata
    pattern_meta = re.compile(
        r"<!-- AUTO:EVOLUTION_META_START -->.*?<!-- AUTO:EVOLUTION_META_END -->",
        re.DOTALL,
    )
    content = pattern_meta.sub(meta_block.replace("\\", "\\\\"), content)

    if write:
        GUARDRAILS_FILE.write_text(content)
        print(f"Updated {GUARDRAILS_FILE}", file=sys.stderr)

    return content


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Update worldwide-guardrails.md auto-sections from session logs."
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Force full re-scan of all sessions (ignore incremental state)",
    )
    args = parser.parse_args()

    print("Analyzing Worldwide session logs...", file=sys.stderr)

    state = load_state()

    if args.reset:
        print("  --reset: forcing full re-scan", file=sys.stderr)
        last_processed = None
        cumulative_counts = {}
        cumulative_total = 0
    else:
        last_processed = state.get("last_processed_date")
        cumulative_counts = state.get("failure_counts", {})
        cumulative_total = state.get("total_sessions", 0)
        if last_processed:
            print(f"  Incremental: processing sessions since {last_processed.date()}", file=sys.stderr)
        else:
            print("  No prior state found, performing full scan", file=sys.stderr)

    new_counts, new_sessions = analyze_sessions(start_date=last_processed)

    if new_sessions == 0 and not args.reset and last_processed is not None:
        print("  No new sessions since last run. Writing current state without changes.", file=sys.stderr)
        failure_table = generate_failure_table(cumulative_counts)
        meta_block = generate_meta_block(cumulative_total, incremental=True)
        update_guardrails(failure_table, meta_block)
        print("Done.", file=sys.stderr)
        return

    cumulative_counts = merge_counts(cumulative_counts, new_counts)
    cumulative_total += new_sessions

    print(f"  New sessions processed: {new_sessions}", file=sys.stderr)
    print(f"  Cumulative sessions:     {cumulative_total}", file=sys.stderr)

    # Show top failure counts from this run
    if new_counts:
        sorted_new = sorted(new_counts.items(), key=lambda x: x[1], reverse=True)
        print(f"  New failure pattern hits:", file=sys.stderr)
        for k, v in sorted_new:
            cat = FAILURE_CATEGORIES.get(k, {})
            print(f"    {v:4d}  {cat.get('label', k)}", file=sys.stderr)

    # Persist state
    latest_date = find_latest_session_date()
    if latest_date:
        save_state(latest_date, cumulative_counts, cumulative_total)
        print(f"  State saved (last: {latest_date.date()})", file=sys.stderr)

    failure_table = generate_failure_table(cumulative_counts)
    meta_block = generate_meta_block(
        cumulative_total, incremental=not args.reset
    )
    update_guardrails(failure_table, meta_block)
    print("Done.", file=sys.stderr)


if __name__ == "__main__":
    main()
