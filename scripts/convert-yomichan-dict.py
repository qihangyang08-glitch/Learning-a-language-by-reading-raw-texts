#!/usr/bin/env python3
"""Convert a Yomichan term_bank zip into JaReader's compact dictionary JSON."""

from __future__ import annotations

import argparse
import html
import json
import os
import re
import zipfile
from typing import Any


POS_RE = re.compile(r"〔([^〕]+)〕")
TAG_RE = re.compile(r"<[^>]+>")
SPACE_RE = re.compile(r"\s+")


def stringify_definition(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return "\n".join(
            part for part in (stringify_definition(item) for item in value) if part
        )
    if isinstance(value, dict):
        # Yomichan structured-content definitions commonly keep text in "content".
        for key in ("content", "text", "tag"):
            if key in value:
                text = stringify_definition(value[key])
                if text:
                    return text
        return ""
    return str(value) if value is not None else ""


def clean_definition(text: str) -> str:
    text = html.unescape(text)
    text = TAG_RE.sub("", text)
    text = SPACE_RE.sub(" ", text)
    return text.strip()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("zip_path")
    parser.add_argument("output_path")
    args = parser.parse_args()

    entries: list[dict[str, str]] = []
    seen: set[str] = set()

    with zipfile.ZipFile(args.zip_path, "r") as zf:
        term_banks = sorted(
            name
            for name in zf.namelist()
            if name.startswith("term_bank_") and name.endswith(".json")
        )
        if not term_banks:
            raise RuntimeError("No term_bank_*.json files found in Yomichan zip")

        for name in term_banks:
            print(f"  Processing {name}...")
            with zf.open(name) as f:
                data = json.load(f)

            for row in data:
                headword = row[0].strip() if len(row) > 0 and row[0] else ""
                reading = row[1].strip() if len(row) > 1 and row[1] else ""
                if not headword:
                    continue

                key = f"{headword}|{reading}"
                if key in seen:
                    continue
                seen.add(key)

                definition_parts = row[5] if len(row) > 5 and row[5] else []
                definition = clean_definition(stringify_definition(definition_parts))
                pos = ";".join(POS_RE.findall(definition[:300])[:5])

                entries.append(
                    {"w": headword, "r": reading, "p": pos, "g": definition}
                )

    os.makedirs(os.path.dirname(os.path.abspath(args.output_path)), exist_ok=True)
    with open(args.output_path, "w", encoding="utf-8") as f:
        json.dump(entries, f, ensure_ascii=False, separators=(",", ":"))

    size_mb = os.path.getsize(args.output_path) / (1024 * 1024)
    print(f"Done: {len(entries)} entries written ({size_mb:.1f} MB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
