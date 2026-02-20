#!/usr/bin/env python3
"""Generate timestamped markdown UI reports with screen-capture artifacts."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create a markdown report and capture files from terminal output."
    )
    parser.add_argument("input_file", help="Path to simulator/replay output text file")
    parser.add_argument(
        "--output-dir",
        default=".",
        help="Directory where report and capture artifacts are written",
    )
    parser.add_argument(
        "--prefix",
        default="ui-report",
        help="Artifact filename prefix (default: ui-report)",
    )
    parser.add_argument(
        "--max-captures",
        type=int,
        default=5,
        help="Maximum number of screen captures to include (default: 5)",
    )
    parser.add_argument(
        "--lines-per-capture",
        type=int,
        default=40,
        help="Maximum lines to embed per capture in markdown (default: 40)",
    )
    return parser.parse_args()


def split_frames(raw_text: str) -> list[str]:
    if "---FRAME---" in raw_text:
        return [frame.strip("\n") for frame in raw_text.split("\n---FRAME---\n")]
    return [raw_text.strip("\n")]


def pick_indices(total: int, max_captures: int) -> list[int]:
    if total <= 0:
        return []
    if max_captures <= 1 or total == 1:
        return [0]
    if total <= max_captures:
        return list(range(total))

    picks = {
        round((i * (total - 1)) / (max_captures - 1))
        for i in range(max_captures)
    }
    return sorted(picks)


def main() -> int:
    args = parse_args()
    input_path = Path(args.input_file).resolve()
    if not input_path.exists():
        raise FileNotFoundError(f"Input file not found: {input_path}")

    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    now = datetime.now(timezone.utc)
    timestamp = now.strftime("%Y%m%dT%H%M%SZ")
    generated_at = now.isoformat()

    raw_text = input_path.read_text(encoding="utf-8")
    frames = [f for f in split_frames(raw_text) if f.strip()]
    if not frames:
        frames = ["(No non-empty terminal output captured)"]

    indices = pick_indices(len(frames), max(1, args.max_captures))
    report_path = output_dir / f"{args.prefix}-{timestamp}.md"

    capture_entries: list[tuple[int, Path, str]] = []
    for capture_no, frame_idx in enumerate(indices, start=1):
        frame_text = frames[frame_idx]
        capture_path = output_dir / (
            f"{args.prefix}-{timestamp}-capture-{capture_no:02d}-frame-{frame_idx:04d}.txt"
        )
        capture_path.write_text(frame_text + "\n", encoding="utf-8")
        preview = "\n".join(frame_text.splitlines()[: max(1, args.lines_per_capture)])
        capture_entries.append((frame_idx, capture_path, preview))

    lines: list[str] = [
        "# Terminal UI Test Report",
        "",
        f"- Generated at (UTC): `{generated_at}`",
        f"- Source input: `{input_path}`",
        f"- Total frames detected: `{len(frames)}`",
        f"- Captures included: `{len(capture_entries)}`",
        "",
        "## Screen Captures",
        "",
    ]

    for idx, capture_path, preview in capture_entries:
        lines.extend(
            [
                f"### Frame {idx}",
                f"- Capture file: `{capture_path}`",
                "",
                "```text",
                preview,
                "```",
                "",
            ]
        )

    report_path.write_text("\n".join(lines), encoding="utf-8")
    print(report_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
