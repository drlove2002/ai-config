#!/usr/bin/env bash
# web-test capture helper — batches all Phase 1 data collection
# Usage: capture.sh <url> [session-name]
# Output: JSON manifest written to stdout, files saved to /tmp/web-test/<session>/

set -euo pipefail

URL="$1"
SESSION="${2:-$(date +%s)}"
DIR="/tmp/web-test/${SESSION}"
mkdir -p "$DIR"

# Ensure browser is closed before starting fresh session
agent-browser close 2>/dev/null || true

echo "{\"session\":\"$SESSION\",\"url\":\"$URL\",\"dir\":\"$DIR\"," >&2

# ---- CAPTURE ----
echo -n '{"open":' >&2
agent-browser open "$URL" 2>&1 | tee "$DIR/open.txt" >&2
echo ',' >&2

echo -n '"snapshot":' >&2
agent-browser snapshot -i 2>&1 | tee "$DIR/snapshot.txt" >&2
echo ',' >&2

echo -n '"screenshot":' >&2
agent-browser screenshot --full "$DIR/screenshot.png" 2>&1 | tee "$DIR/screenshot_out.txt" >&2
echo ',' >&2

echo -n '"console":' >&2
agent-browser console 2>&1 | tee "$DIR/console.txt" >&2
echo ',' >&2

echo -n '"errors":' >&2
agent-browser errors 2>&1 | tee "$DIR/errors.txt" >&2
echo ',' >&2

echo -n '"vitals":' >&2
agent-browser vitals --json 2>&1 | tee "$DIR/vitals.json" >&2
echo ',' >&2

echo -n '"title":' >&2
agent-browser get title 2>&1 | tee "$DIR/title.txt" >&2
echo '}' >&2

# Keep browser alive for Phase 3 interaction testing
# Agent-browser daemon persists after script exits

# ---- MANIFEST ----
cat <<JSON
{
  "session": "$SESSION",
  "url": "$URL",
  "dir": "$DIR",
  "files": {
    "open": "$DIR/open.txt",
    "snapshot": "$DIR/snapshot.txt",
    "screenshot": "$DIR/screenshot.png",
    "console": "$DIR/console.txt",
    "errors": "$DIR/errors.txt",
    "vitals": "$DIR/vitals.json",
    "title": "$DIR/title.txt"
  },
  "interaction_count": $(grep -c 'ref=' "$DIR/snapshot.txt" 2>/dev/null; true)
}
JSON
