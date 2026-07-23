#!/usr/bin/env python3
"""Convert Shogakukan MDict MDX data into JaReader's compact dictionary JSON."""

from __future__ import annotations

import argparse
import json
import os
import re
from html.parser import HTMLParser
from pathlib import Path
from typing import Any

try:
    from readmdict import MDX
except ImportError as exc:  # pragma: no cover - script dependency check
    raise SystemExit(
        "Missing dependency: readmdict. Install with: python -m pip install readmdict python-lzo"
    ) from exc


READING_RE = re.compile(
    r"<h3[^>]*>.*?<span[^>]*class=[\"'][^\"']*pinyin_h[^\"']*[\"'][^>]*>(.*?)</span>",
    re.IGNORECASE | re.DOTALL,
)
H3_RE = re.compile(r"<h3\b[^>]*>.*?</h3>", re.IGNORECASE | re.DOTALL)
LINK_RE = re.compile(r'<link\b[^>]*rel=["\']stylesheet["\'][^>]*>', re.IGNORECASE)
SPACE_RE = re.compile(r"[ \t\r\f\v]+")
BLANK_LINE_RE = re.compile(r"\n{3,}")
POS_RE = re.compile(r"^\[([^\]]{1,20})\]")


class TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.skip_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        attrs_dict = {k.lower(): v or "" for k, v in attrs}
        if tag in {"script", "style", "link"}:
            self.skip_depth += 1
            return
        if self.skip_depth:
            return

        if tag in {"p", "div", "section"}:
            self._newline()
        elif tag == "br":
            self._newline()
        elif tag == "jae":
            self._append("¶")
        elif tag == "ja_cn":
            self._append(" / ")
        elif tag == "span" and attrs_dict.get("class") == "white-square":
            self._append(" ")

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if self.skip_depth:
            self.skip_depth -= 1
            return
        if tag in {"p", "div", "section", "ja_cn"}:
            self._newline()

    def handle_data(self, data: str) -> None:
        if not self.skip_depth:
            self._append(data)

    def _append(self, text: str) -> None:
        if text:
            self.parts.append(text)

    def _newline(self) -> None:
        if self.parts and self.parts[-1] != "\n":
            self.parts.append("\n")

    def text(self) -> str:
        text = "".join(self.parts)
        text = SPACE_RE.sub(" ", text)
        lines = [line.strip() for line in text.splitlines()]
        text = "\n".join(line for line in lines if line)
        text = BLANK_LINE_RE.sub("\n\n", text)
        return text.strip()


def decode(value: Any) -> str:
    if isinstance(value, bytes):
        return value.decode("utf-8", "replace")
    return str(value)


def extract_reading(html: str) -> str:
    match = READING_RE.search(html)
    if not match:
        return ""
    extractor = TextExtractor()
    extractor.feed(match.group(1))
    return extractor.text()


def extract_text(html: str) -> str:
    html = LINK_RE.sub("", html)
    html = H3_RE.sub("", html)
    extractor = TextExtractor()
    extractor.feed(html)
    return extractor.text()


def extract_pos(text: str) -> str:
    match = POS_RE.search(text)
    return match.group(1) if match else ""


def find_default_mdx(project_root: Path) -> Path:
    candidates = sorted(project_root.glob("小学馆v3/*.mdx"))
    if not candidates:
        candidates = sorted(project_root.glob("**/Shogakukanjcv3.mdx"))
    if not candidates:
        raise FileNotFoundError("Could not find 小学馆v3/Shogakukanjcv3.mdx")
    return candidates[0]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", "-i", help="Path to Shogakukanjcv3.mdx")
    parser.add_argument(
        "--output",
        "-o",
        default="assets/dictionary/dict-data.json",
        help="Output JaReader JSON path",
    )
    parser.add_argument(
        "--max-gloss-chars",
        type=int,
        default=6000,
        help="Truncate very long entries to keep the mobile import manageable",
    )
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[1]
    mdx_path = Path(args.input) if args.input else find_default_mdx(root)
    output_path = Path(args.output)
    if not output_path.is_absolute():
        output_path = root / output_path

    mdx = MDX(str(mdx_path))
    entries: list[dict[str, str]] = []
    seen: set[tuple[str, str, str]] = set()
    link_count = 0

    for raw_key, raw_value in mdx.items():
        word = decode(raw_key).strip()
        value = decode(raw_value).strip()
        if not word:
            continue

        if value.startswith("@@@LINK="):
            target = value.removeprefix("@@@LINK=").strip()
            reading = ""
            gloss = f"参见：{target}" if target else ""
            link_count += 1
        else:
            reading = extract_reading(value)
            gloss = extract_text(value)

        if not gloss:
            continue
        if len(gloss) > args.max_gloss_chars:
            gloss = gloss[: args.max_gloss_chars].rstrip() + "..."

        pos = extract_pos(gloss)
        key = (word, reading, gloss)
        if key in seen:
            continue
        seen.add(key)
        entries.append({"w": word, "r": reading, "p": pos, "g": gloss})

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as f:
        json.dump(entries, f, ensure_ascii=False, separators=(",", ":"))

    size_mb = output_path.stat().st_size / (1024 * 1024)
    print(f"Input: {mdx_path}")
    print(f"Entries: {len(entries)}")
    print(f"Links: {link_count}")
    print(f"Output: {output_path} ({size_mb:.1f} MB)")

    if len(entries) < 100_000:
        raise RuntimeError(f"Generated dictionary looks too small: {len(entries)} entries")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
