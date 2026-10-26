"""Client đọc GVCN từ CS app (dashboard) để ghi lại cột GVCN trên sheet bàn giao.

Nguồn sự thật GVCN nằm ở CS app: endpoint máy-đọc `GET /api/cs?resource=gvcn_sync`
(shared-key header), trả GVCN cho cả KH mới (người xử lý ca tiếp nhận) lẫn gia hạn /
KH cũ (CS hiện tại trong student_info). Ở đây chỉ GỌI + gom thành {uid: tên GVCN}.

Cấu hình qua env (đặt trên GMV service):
    PALFISH_CS_SYNC_URL  — base endpoint CS, vd https://<domain>/palfish/data/api/cs
    PALFISH_CS_SYNC_KEY  — shared key, khớp với CS app

Thiếu cấu hình / lỗi mạng → trả {} (không ghi GVCN; an toàn, không chặn luồng bàn giao).
"""
from __future__ import annotations

import json
import os
import urllib.parse
import urllib.request
from typing import Any, Iterable


def _cfg() -> tuple[str, str]:
    return (
        os.environ.get("PALFISH_CS_SYNC_URL", "").strip().rstrip("/"),
        os.environ.get("PALFISH_CS_SYNC_KEY", "").strip(),
    )


def fetch_gvcn(uids: Iterable[Any]) -> dict[str, str]:
    """{uid: tên GVCN} cho các uid truyền vào. Rỗng nếu thiếu cấu hình / lỗi / không có."""
    base, key = _cfg()
    clean = [u for u in {str(x).strip() for x in uids} if u]
    if not clean or not base or not key:
        return {}
    try:
        qs = urllib.parse.urlencode(
            {"resource": "gvcn_sync", "uids": ",".join(clean[:500])}
        )
        req = urllib.request.Request(f"{base}?{qs}", headers={"x-cs-sync-key": key})
        with urllib.request.urlopen(req, timeout=10) as resp:  # noqa: S310 (URL cấu hình nội bộ)
            data = json.loads(resp.read().decode("utf-8"))
    except Exception as exc:  # noqa: BLE001 — non-fatal, luồng bàn giao vẫn chạy
        print(f"[cs_gvcn] fetch lỗi (bỏ qua): {exc}")
        return {}
    out: dict[str, str] = {}
    for a in data.get("assignments", []) or []:
        uid = str(a.get("uid") or "").strip()
        gvcn = str(a.get("gvcn") or "").strip()
        if uid and gvcn:
            out[uid] = gvcn
    return out
