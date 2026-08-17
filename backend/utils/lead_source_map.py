"""Mirror của frontend/src/constants/leadSource.ts.

Dùng để hiển thị `Nguồn: <label>` thân thiện trong tin Zalo thay vì in raw enum
key/channel code. Nếu FE cập nhật constants, PHẢI update file này tương ứng.
"""

from __future__ import annotations

LEAD_SOURCES: list[dict] = [
    {
        "key": "quang_cao",
        "label": "Quảng cáo",
        "channels": [
            {"code": "300265", "label": "FB - VN"},
            {"code": "300281", "label": "FB H5 OV"},
            {"code": "300431", "label": "FB - Livestream"},
            {"code": "300561", "label": "FB-Instant Form-VN"},
            {"code": "300571", "label": "FB-Instant Form-OV"},
            {"code": "300581", "label": "FB-Landing Page-VN"},
            {"code": "300531", "label": "FB - Paid Partnership"},
            {"code": "300301", "label": "Tiktok ads"},
            {"code": "300551", "label": "Tiktokshop"},
            {"code": "300541", "label": "Zalo"},
            {"code": "300291", "label": "VN google"},
            {"code": "300361", "label": "Gọi hotline & nhắn tin FE"},
        ],
    },
    {
        "key": "gioi_thieu",
        "label": "Giới thiệu",
        "channels": [
            {"code": "832", "label": "Kênh giới thiệu"},
        ],
    },
    {
        "key": "offline",
        "label": "Offline",
        "channels": [
            {"code": "300461", "label": "HCM Offline booth"},
            {"code": "300441", "label": "VN Offline booth"},
            {"code": "300511", "label": "Linh Đàm Offline Store"},
            {"code": "932", "label": "Offline events"},
        ],
    },
    {
        "key": "koc",
        "label": "KOC",
        "channels": [
            {"code": "300391", "label": "VN KOC"},
        ],
    },
    {"key": "gia_han", "label": "Gia hạn", "channels": []},
    {"key": "kho_chung", "label": "Kho Chung", "channels": []},
    {
        "key": "khac",
        "label": "Khác",
        "channels": [
            {"code": "300444", "label": "Tài App - Palfish Class"},
            {"code": "300445", "label": "Tài App - Palfish English"},
            {"code": "300311", "label": "Sales tự tìm kiếm"},
            {"code": "300471", "label": "Sales tự tìm kiếm (HCM)"},
        ],
    },
]

_SOURCE_LABEL: dict[str, str] = {s["key"]: s["label"] for s in LEAD_SOURCES}
_CHANNEL_LABEL: dict[str, str] = {}
for _s in LEAD_SOURCES:
    for _ch in _s["channels"]:
        _CHANNEL_LABEL[_ch["code"]] = _ch["label"]


def resolve_lead_label(source_key: str | None, channel_code: str | None) -> str:
    """Trả label VN cho tin Zalo `Nguồn: ...`.

    - Có source + channel map được: ``"Source Label · Channel Label"``
    - Chỉ source map được: ``"Source Label"``
    - Chỉ channel map được: ``"Channel Label"``
    - Không map được nhưng có giá trị: giữ raw (backward-compat với dữ liệu cũ)
    - Cả 2 trống: ``"?"``
    """
    s_key = (source_key or "").strip()
    c_code = (channel_code or "").strip()
    s_label = _SOURCE_LABEL.get(s_key) if s_key else None
    c_label = _CHANNEL_LABEL.get(c_code) if c_code else None

    if s_label and c_label:
        return f"{s_label} · {c_label}"
    if s_label:
        return s_label
    if c_label:
        return c_label
    # Fallback raw để không phá tin nếu FE gửi label sẵn (không phải code)
    if s_key and c_code:
        return f"{s_key} · {c_code}"
    if c_code:
        return c_code
    if s_key:
        return s_key
    return "?"


# lead_source key → giá trị `loai` báo cáo (vocab BC02/Sổ doanh thu, xem
# frontend/src/lib/loaiLabel.ts LEDGER_LOAI_OPTIONS + bc02TypeMap.ts).
_SOURCE_TO_LOAI: dict[str, str] = {
    "quang_cao": "广告",
    "gioi_thieu": "转介绍",
    "gia_han": "续费",
    "kho_chung": "公海",
    "offline": "Offline",
    "koc": "KOC",
    "khac": "Other",
}

_CHANNEL_TO_SOURCE_KEY: dict[str, str] = {
    ch["code"]: s["key"] for s in LEAD_SOURCES for ch in s["channels"]
}


# FB-Livestream tách riêng cột "Lives" trên BC02, không gộp vào "广告" dù
# channel này thuộc source quang_cao (chị Hiền chốt — xem plan mục 3, G2-T1).
_LIVESTREAM_CHANNEL_CODE = "300431"


def resolve_loai_from_lead_source(source_key: str | None, channel_code: str | None) -> str:
    """Map lead_source/lead_channel (Payment Request) → `loai` (vocab Sổ doanh thu/BC02).

    Ưu tiên source_key; source_key không map được thì suy ra source qua channel_code.
    Ngoại lệ: quang_cao + kênh Livestream (300431) → "Lives", không phải "广告".
    Không map được gì cả → "" (giữ trống, không đoán bừa — an toàn hơn để "Khác"
    khi thật sự không biết, so với gán nhầm loai).
    """
    s_key = (source_key or "").strip()
    c_code = (channel_code or "").strip()

    if s_key == "quang_cao" and c_code == _LIVESTREAM_CHANNEL_CODE:
        return "Lives"

    if s_key in _SOURCE_TO_LOAI:
        return _SOURCE_TO_LOAI[s_key]

    src_from_channel = _CHANNEL_TO_SOURCE_KEY.get(c_code)
    if src_from_channel:
        return _SOURCE_TO_LOAI.get(src_from_channel, "")

    return ""
