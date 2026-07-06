"""Dong goi crm-token-extension/ -> frontend/public/palfish-gmv-sync.zip.

Chay sau MOI lan sua extension — zip nay la file ke toan tai tu app,
de lech code la lap lai su co 06/07/2026 (ke toan chay ban cu 18/6).

Usage: python scripts/build_extension_zip.py
"""
import json
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "crm-token-extension"
OUT = ROOT / "frontend" / "public" / "palfish-gmv-sync.zip"
FILES = ["manifest.json", "background.js", "content-app-flag.js", "popup.html", "popup.js"]


def main() -> int:
    missing = [f for f in FILES if not (SRC / f).is_file()]
    if missing:
        print(f"LOI: thieu file trong {SRC}: {missing}")
        return 1
    version = json.loads((SRC / "manifest.json").read_text(encoding="utf-8"))["version"]
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
        for name in FILES:
            z.write(SRC / name, name)
    print(f"OK: {OUT.relative_to(ROOT)} (extension v{version}, {len(FILES)} files)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
