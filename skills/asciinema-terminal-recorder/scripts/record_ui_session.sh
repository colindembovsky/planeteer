#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <output.cast> \"<command>\"" >&2
  exit 1
fi

output_file="$1"
shift
command_to_record="$*"

window_size="${ASCIINEMA_WINDOW_SIZE:-120x30}"
idle_limit="${ASCIINEMA_IDLE_LIMIT:-1.0}"
title="${ASCIINEMA_TITLE:-UI Test Recording}"

asciinema rec \
  --overwrite \
  --headless \
  --return \
  --quiet \
  --window-size "$window_size" \
  --idle-time-limit "$idle_limit" \
  --title "$title" \
  --command "$command_to_record" \
  "$output_file"
