# Asciinema UI Testing Reference

## Core commands

- Record interactive shell: `asciinema rec demo.cast`
- Record one command: `asciinema rec --command "npm test" demo.cast`
- Replay: `asciinema play demo.cast`
- Upload (optional): `asciinema upload demo.cast`

## Recording flags useful for test artifacts

- `--window-size COLSxROWS`: Fixes terminal dimensions for consistent layout comparisons.
- `--idle-time-limit SECS`: Caps long pauses during playback.
- `--headless`: Records without attaching to current terminal UI.
- `--return`: Exits with the recorded command's status code.
- `--overwrite`: Replaces previous artifacts safely in scripted runs.
- `--capture-input`: Includes keystrokes (avoid for sensitive input).

## Suggested deterministic recipe

```bash
asciinema rec \
  --overwrite \
  --headless \
  --return \
  --window-size 120x30 \
  --idle-time-limit 1.0 \
  --command "npm run test:cli-smoke" \
  artifacts/smoke.cast
```

## Troubleshooting

- **Recording hangs**: Ensure the command exits; in command mode recording ends when the command exits.
- **Playback wraps unexpectedly**: Increase `--window-size` or replay in a terminal with equal/larger dimensions.
- **Need cleaner pacing**: Lower `--idle-time-limit` (for example `0.5`) for faster, denser playback.
