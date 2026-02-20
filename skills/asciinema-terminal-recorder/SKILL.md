---
name: asciinema-terminal-recorder
description: Record deterministic terminal sessions with asciinema for CLI/UI testing and demos. Use when Claude needs to capture terminal interactions as .cast files, replay recordings, or run scriptable command-based recordings (Playwright-style artifacts for terminals).
---

# Asciinema Terminal Recorder

Create reproducible terminal recordings for UI testing and CLI demos using asciinema.

## Quick workflow

1. Choose scripted mode for deterministic test artifacts (recommended).
2. Record to a `.cast` file.
3. Replay with `asciinema play` to verify output and timing.

## Scripted recording (recommended)

Use the bundled helper script for stable, automation-friendly captures:

```bash
scripts/record_ui_session.sh <output.cast> "<command>"
```

Example:

```bash
scripts/record_ui_session.sh artifacts/login-flow.cast "npm run test:cli-smoke"
```

Defaults applied by the script:

- `--headless` for non-interactive capture
- `--window-size 120x30` for consistent terminal layout
- `--idle-time-limit 1.0` to avoid long pauses
- `--overwrite` to refresh existing artifacts
- `--return` so failures propagate to callers

Override defaults with env vars before running:

```bash
ASCIINEMA_WINDOW_SIZE=100x28 ASCIINEMA_IDLE_LIMIT=0.5 scripts/record_ui_session.sh out.cast "pnpm test"
```

## Interactive recording

For exploratory/manual sessions:

```bash
asciinema rec demo.cast
```

End recording with `Ctrl+D` or `exit`.

For command-only recording without helper script:

```bash
asciinema rec --command "htop" demo.cast
```

## Validate recordings

Replay locally:

```bash
asciinema play demo.cast
```

Read `references/asciinema-ui-testing.md` for command options and troubleshooting patterns.
