#!/usr/bin/env python3
"""Extract readable UI strings from PalFish CRM.html prototype."""
from __future__ import annotations

import html
import re
import sys
from pathlib import Path

PATH = Path(r"c:\Users\silly\Downloads\PalFish CRM.html")


def main() -> int:
    text = PATH.read_text(encoding="utf-8", errors="replace")
    found: set[str] = set()
    for m in re.finditer(r">([^<]{3,100})<", text):
        s = html.unescape(m.group(1)).strip()
        if "H4sI" in s or "font-face" in s or s.startswith("http"):
            continue
        if re.search(r"[\u0100-\u1EF9A-Za-z]", s):
            found.add(s)
    keywords = (
        "payment", "request", "qr", "hoa", "don", "kich", "active", "course",
        "order", "thanh", "xuất", "yêu", "sổ", "đối", "tiền", "pr-", "uid",
        "tạo", "quản", "mã", "khoá", "activate", "invoice",
    )
    print("=== UI strings (filtered) ===")
    for s in sorted(found, key=str.lower):
        low = s.lower()
        if any(k in low for k in keywords):
            print(s)
    print("\n=== All short labels (<=40 chars, sample) ===")
    short = sorted({s for s in found if len(s) <= 40}, key=str.lower)
    for s in short[:120]:
        print(s)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
