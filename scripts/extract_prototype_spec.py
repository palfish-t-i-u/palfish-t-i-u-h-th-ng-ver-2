#!/usr/bin/env python3
"""Extract UI module names from PalFish CRM.html for spec alignment."""
from __future__ import annotations

import codecs
import re
from pathlib import Path

PATH = Path(r"c:\Users\silly\Downloads\PalFish CRM.html")
OUT = Path(__file__).resolve().parents[1] / "docs" / "PROTOTYPE_UI_SPEC.md"


def load_html() -> str:
    raw = PATH.read_text(encoding="utf-8", errors="replace")
    if raw.lstrip().startswith('"'):
        return codecs.decode(raw.strip()[1:-1], "unicode_escape")
    return raw


def main() -> int:
    text = load_html()
    sections = sorted(set(m.group(1).strip() for m in re.finditer(r"/\* ─+ ([^─]+) ─+ \*/", text)))

    # Vietnamese UI strings (common labels)
    vi_labels = []
    for pat in [
        r">(TỔNG PR[^<]{0,80})<",
        r">(ĐÃ THU[^<]{0,40})<",
        r">(CÒN THIẾU[^<]{0,40})<",
        r">(SẴN SÀNG[^<]{0,50})<",
        r">(TẠO LÚC)<",
        r">(CHÊNH LỆCH)<",
        r">(TT GÓI HỌC)<",
        r">(Gói học đã tạo)<",
        r">(Tạo Payment Request)<",
        r">(Khoảng thời gian)<",
    ]:
        vi_labels.extend(re.findall(pat, text, re.I))

    lines = [
        "# Prototype UI spec (auto-extracted)",
        "",
        f"**Source:** `{PATH}`",
        "",
        "## CSS modules in HTML (Figma export blocks)",
        "",
    ]
    for s in sections:
        lines.append(f"- {s}")

    lines.extend(["", "## Key labels found in HTML", ""])
    for label in sorted(set(vi_labels)):
        lines.append(f"- `{label.strip()}`")

    lines.extend(
        [
            "",
            "## How dev should use this file",
            "",
            "1. Open HTML in browser — this list tells which blocks exist.",
            "2. Implement one block → one React component under `frontend/src/components/payment-request/`.",
            "3. Do not invent layout — match column order and Vietnamese copy from HTML.",
            "4. Re-run: `python scripts/extract_prototype_spec.py` after Hiếu updates HTML.",
            "",
        ]
    )

    OUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {OUT} ({len(sections)} sections, {len(set(vi_labels))} labels)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
