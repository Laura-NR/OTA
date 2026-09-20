#!/usr/bin/env python3
"""Render the Agent Constitution's managed block into agent instruction files.

The constitution is the single source of truth. Each target file (AGENTS.md,
CLAUDE.md, GEMINI.md, ...) carries a marker pair; everything between the markers
is replaced, everything outside is left byte-identical.

    python sync-agent-standard.py --targets AGENTS.md CLAUDE.md
    python sync-agent-standard.py --check --targets AGENTS.md   # CI: exit 1 if stale
    python sync-agent-standard.py --dry-run --targets AGENTS.md

Exit codes: 0 = in sync / written, 1 = stale (--check), 2 = malformed input.
"""

from __future__ import annotations

import argparse
import difflib
import re
import sys
from pathlib import Path

START_RE = re.compile(r"^<!--\s*AGENT-STANDARD:START(?:\s+(?P<version>\S+))?\s*-->\s*$", re.M)
END_RE = re.compile(r"^<!--\s*AGENT-STANDARD:END\s*-->\s*$", re.M)

BANNER = (
    "<!-- Managed block. Rendered from AGENT-CONSTITUTION.md — do not edit here. -->\n"
    "<!-- Run: python sync-agent-standard.py --targets {target} -->\n"
)


class Malformed(Exception):
    """A file's markers are missing, duplicated, or out of order."""


def locate_block(text: str, path: Path) -> tuple[int, int, int, int, str | None]:
    """Return (start_tag_begin, start_tag_end, end_tag_begin, end_tag_end, version)."""
    starts = list(START_RE.finditer(text))
    ends = list(END_RE.finditer(text))

    if len(starts) != 1 or len(ends) != 1:
        raise Malformed(
            f"{path}: expected exactly one AGENT-STANDARD:START and one :END marker, "
            f"found {len(starts)} and {len(ends)}. "
            "Add the marker pair (see AGENTS.md.template) before syncing."
        )
    if starts[0].start() > ends[0].start():
        raise Malformed(f"{path}: :END marker appears before :START.")

    return (
        starts[0].start(),
        starts[0].end(),
        ends[0].start(),
        ends[0].end(),
        starts[0].group("version"),
    )


def read_source(constitution: Path) -> tuple[str, str | None]:
    """Extract the managed body and declared version from the constitution."""
    text = constitution.read_text(encoding="utf-8")
    _, body_begin, body_end, _, version = locate_block(text, constitution)
    body = text[body_begin:body_end].strip("\n")
    if not body:
        raise Malformed(f"{constitution}: managed block is empty; refusing to sync.")
    return body, version


def render(target: Path, body: str, version: str | None) -> str:
    """Return the target's full new contents with the managed block replaced."""
    text = target.read_text(encoding="utf-8")
    tag_begin, _, _, tag_end_stop, _ = locate_block(text, target)

    version_suffix = f" {version}" if version else ""
    block = (
        f"<!-- AGENT-STANDARD:START{version_suffix} -->\n"
        + BANNER.format(target=target.name)
        + f"\n{body}\n"
        + "<!-- AGENT-STANDARD:END -->"
    )
    return text[:tag_begin] + block + text[tag_end_stop:]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--constitution", type=Path, default=Path("AGENT-CONSTITUTION.md"))
    ap.add_argument("--targets", type=Path, nargs="+", required=True)
    ap.add_argument("--check", action="store_true", help="report drift, write nothing, exit 1 if stale")
    ap.add_argument("--dry-run", action="store_true", help="print the diff, write nothing")
    args = ap.parse_args()

    if not args.constitution.is_file():
        print(f"error: constitution not found: {args.constitution}", file=sys.stderr)
        return 2

    try:
        body, version = read_source(args.constitution)
    except Malformed as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    label = version or "unversioned"
    stale: list[Path] = []
    missing: list[Path] = []

    for target in args.targets:
        if not target.is_file():
            missing.append(target)
            continue

        current = target.read_text(encoding="utf-8")
        try:
            updated = render(target, body, version)
        except Malformed as exc:
            print(f"error: {exc}", file=sys.stderr)
            return 2

        if current == updated:
            print(f"  ok       {target}  (standard {label})")
            continue

        stale.append(target)

        if args.check:
            print(f"  STALE    {target}  (expected standard {label})")
        elif args.dry_run:
            print(f"  would update  {target}")
            diff = difflib.unified_diff(
                current.splitlines(keepends=True),
                updated.splitlines(keepends=True),
                fromfile=f"{target} (current)",
                tofile=f"{target} (synced)",
            )
            sys.stdout.writelines(diff)
        else:
            target.write_text(updated, encoding="utf-8")
            print(f"  updated  {target}  → standard {label}")

    if missing:
        for target in missing:
            print(f"error: target not found: {target}", file=sys.stderr)
        return 2

    if args.check and stale:
        print(
            f"\n{len(stale)} file(s) out of sync with {args.constitution} ({label}).\n"
            "Run: python sync-agent-standard.py --targets " + " ".join(str(t) for t in stale),
            file=sys.stderr,
        )
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
