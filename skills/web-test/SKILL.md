---
name: web-test
description: Browser automation via agent-browser CLI for testing pages, debugging, performance audits, visual review, accessibility checks, and interaction testing. Use when user wants to test a website, check UI/UX, debug console errors, measure perf, audit a11y, inspect page state, or interact with a deployed page. Agents should assemble commands based on the task — this skill is a tool reference, not a fixed pipeline.
---

# Web Test

## How to use

Read the task. Pick the relevant commands from the reference below. If the task involves visuals, route screenshots to the `vision` subagent (MiniMax M3). Console/logs/vitals go to a text model (DeepSeek V4 Flash). Large synthesis jobs go to `planner` (DeepSeek V4 Pro).

## Quick reference

### Capture page state

| Command | Output | ~Tokens | Best model |
|---------|--------|---------|------------|
| `agent-browser snapshot -i` | Interactive a11y tree (links, inputs, buttons with @refs) | 50-300 | Flash |
| `agent-browser screenshot --full <path>` | Full-page PNG | Image | M3 (vision) |
| `agent-browser screenshot --annotate <path>` | Screenshot with numbered labels | Image | M3 (vision) |
| `agent-browser console` | JS console output | 0-50 | Flash |
| `agent-browser errors` | Page errors | 0-30 | Flash |
| `agent-browser vitals --json` | Web Vitals (TTFB, FCP, LCP, CLS, INP) | 10-30 | Flash |
| `agent-browser get title` | Page title | 1 | Flash |
| `agent-browser eval "<js>"` | Evaluated JS result | Variable | Flash |

### Interact

| Command | What it does |
|---------|-------------|
| `agent-browser click @eN` | Click element by ref from snapshot |
| `agent-browser fill @eN "text"` | Clear and type into input |
| `agent-browser type @eN "text"` | Type without clearing |
| `agent-browser select @eN "value"` | Pick dropdown option |
| `agent-browser press Enter` | Key press |
| `agent-browser scroll down 500` | Scroll |
| `agent-browser wait 2000` | Wait 2s for state to settle |

### Diff & regression

| Command | What it does |
|---------|-------------|
| `agent-browser diff snapshot` | Unified diff of DOM changes since last `snapshot` call |
| `agent-browser diff screenshot --baseline <path>` | Image diff vs baseline |
| `agent-browser diff url <u1> <u2>` | Compare two pages |

### Network & debug

| Command | What it does |
|---------|-------------|
| `agent-browser network route <url> --abort` | Block requests |
| `agent-browser network route <url> --body <json>` | Stub responses |
| `agent-browser trace start` / `trace stop` | Chrome DevTools trace |
| `agent-browser profiler start` / `profiler stop` | JS profile |
| `agent-browser record start <path>` / `record stop` | Video recording (WebM) |
| `agent-browser highlight @eN` | Highlight element visually |
| `agent-browser inspect` | Open DevTools for the active page |

### React-specific (requires `agent-browser open --enable react-devtools`)

| Command | What it does |
|---------|-------------|
| `agent-browser react tree` | Full component tree |
| `agent-browser react inspect <id>` | Fiber inspection (props, hooks, state) |
| `agent-browser react renders start` / `stop --json` | Re-render profiling |
| `agent-browser react suspense` | Suspense boundary report |

### Session management

| Command | What it does |
|---------|-------------|
| `agent-browser --session <name> open <url>` | Isolated session (parallel tests, no interference) |
| `agent-browser session list` | List active sessions |
| `agent-browser close` / `close --all` | Close browser(s) |

### Lifecycle helpers

```bash
# Clean state — kill daemon before starting
kill $(cat ~/.agent-browser/default.pid) 2>/dev/null; sleep 1

# Batch capture (convenience script)
bash ~/.pi/agent/skills/web-test/scripts/capture.sh <url> [session]
# Outputs JSON manifest: { session, dir, files: { snapshot, screenshot, console, errors, vitals, title } }
```

## Model routing

| Data type | Agent | Model | Why |
|-----------|-------|-------|-----|
| Screenshot (PNG) | `vision` | commandcode/MiniMaxAI/MiniMax-M3 | Vision-native. Reads layout, colors, UI state, visual bugs |
| Text (snapshot, console, errors, vitals, diff) | `worker` or `scout` | DeepSeek V4 Flash | Fast, cheap. Pattern matching on text output |
| Synthesis (merge findings, write report) | `planner` | DeepSeek V4 Pro | Reasoning across modalities |

## Task patterns

### Visual / UI review

```
capture: open → screenshot --full → snapshot -i
analyze: vision (screenshot) → report layout, colors, readability
         worker (snapshot) → check element states
```

### Performance test

```
capture: open → vitals --json → trace start → interactions → trace stop
analyze: worker (vitals) → threshold check
         worker (trace) → long tasks, layout shifts
```

### Debug / console

```
capture: open → console → errors
[after each interaction]: console → errors → eval "specific JS check"
analyze: worker → classify errors by severity/source
```

### Accessibility audit

```
capture: open → snapshot -i
analyze: worker → heading hierarchy, missing labels, landmarks, tab order
```

### Interaction test

```
capture: open → snapshot -i → screenshot
interact: click/fill @eN → wait → snapshot -i → screenshot → diff snapshot → console → errors
analyze: vision (before/after screenshots) → layout shifts, visual state
         worker (diff, console, errors) → DOM mutations, JS errors
```

### Full suite (all of the above)

Run capture script → parallel analysis (vision + 3 workers) → interaction(s) → re-analyze → synthesize with planner. See `scripts/capture.sh` for batch capture.

## Rules

- **Snap before click**: always `snapshot -i` first to get @refs, then `click @eN`
- **Wait after action**: `wait 500` minimum before next snapshot/screenshot
- **Check console after every interaction**: errors can surface late
- **Kill daemon if stale**: old refs won't work if the daemon restarted between calls
- **Use sessions for parallel tests**: `--session <name>` isolates each
- **Vision for images, Flash for text, Pro for synthesis**: never cross the streams
