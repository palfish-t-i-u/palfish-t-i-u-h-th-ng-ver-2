"""Single source of truth: ISO 3166-1 alpha-2 → E.164 country calling code.

Lý do tồn tại: trước đây có nhiều bảng dial CỤT rải rác ở BE
(``payment_request_routes._COUNTRY_DIAL`` 22 nước, ``zalo_message_builder._COUNTRY_DIAL_CODE``
10 nước). Country không nằm trong bảng → rơi về default "84" (VN) → nội dung chuyển
khoản / tin nhắn hiện SAI mã vùng cho khách nước ngoài. Sự cố PR-2026-0578 (26/7/2026):
khách Séc (CZ) → nội dung CK ra ``84777737388`` thay vì ``420777737388`` → khách không tin.

Gộp về đây; mọi nơi ở BE import chung để không drift nữa. FE dùng danh sách 248 nước
generated (``frontend/.../CountryCombo``) — bảng này phủ đủ ISO alpha-2 để BE khớp FE.
Value = calling code (chỉ chữ số, KHÔNG dấu ``+``). NANP (US/CA/Caribbean) cùng "1".

⚠ Còn 1 bản sao ở SQL: ``public.format_phone_intl`` (migration
``2026-07-04-zalo-phone-intl-format.sql``). Bản đó dùng cho luồng tin build phía DB.
Nếu cần đồng bộ đầy đủ, phải cập nhật migration đó riêng — Python không import được.
"""

from __future__ import annotations

# ISO 3166-1 alpha-2 → E.164 (alphabetical by code)
COUNTRY_DIAL: dict[str, str] = {
    "AD": "376", "AE": "971", "AF": "93", "AG": "1", "AI": "1", "AL": "355",
    "AM": "374", "AO": "244", "AR": "54", "AS": "1", "AT": "43", "AU": "61",
    "AW": "297", "AX": "358", "AZ": "994",
    "BA": "387", "BB": "1", "BD": "880", "BE": "32", "BF": "226", "BG": "359",
    "BH": "973", "BI": "257", "BJ": "229", "BL": "590", "BM": "1", "BN": "673",
    "BO": "591", "BQ": "599", "BR": "55", "BS": "1", "BT": "975", "BW": "267",
    "BY": "375", "BZ": "501",
    "CA": "1", "CC": "61", "CD": "243", "CF": "236", "CG": "242", "CH": "41",
    "CI": "225", "CK": "682", "CL": "56", "CM": "237", "CN": "86", "CO": "57",
    "CR": "506", "CU": "53", "CV": "238", "CW": "599", "CX": "61", "CY": "357",
    "CZ": "420",
    "DE": "49", "DJ": "253", "DK": "45", "DM": "1", "DO": "1", "DZ": "213",
    "EC": "593", "EE": "372", "EG": "20", "EH": "212", "ER": "291", "ES": "34",
    "ET": "251",
    "FI": "358", "FJ": "679", "FK": "500", "FM": "691", "FO": "298", "FR": "33",
    "GA": "241", "GB": "44", "GD": "1", "GE": "995", "GF": "594", "GG": "44",
    "GH": "233", "GI": "350", "GL": "299", "GM": "220", "GN": "224", "GP": "590",
    "GQ": "240", "GR": "30", "GT": "502", "GU": "1", "GW": "245", "GY": "592",
    "HK": "852", "HN": "504", "HR": "385", "HT": "509", "HU": "36",
    "ID": "62", "IE": "353", "IL": "972", "IM": "44", "IN": "91", "IO": "246",
    "IQ": "964", "IR": "98", "IS": "354", "IT": "39",
    "JE": "44", "JM": "1", "JO": "962", "JP": "81",
    "KE": "254", "KG": "996", "KH": "855", "KI": "686", "KM": "269", "KN": "1",
    "KP": "850", "KR": "82", "KW": "965", "KY": "1", "KZ": "7",
    "LA": "856", "LB": "961", "LC": "1", "LI": "423", "LK": "94", "LR": "231",
    "LS": "266", "LT": "370", "LU": "352", "LV": "371", "LY": "218",
    "MA": "212", "MC": "377", "MD": "373", "ME": "382", "MF": "590", "MG": "261",
    "MH": "692", "MK": "389", "ML": "223", "MM": "95", "MN": "976", "MO": "853",
    "MP": "1", "MQ": "596", "MR": "222", "MS": "1", "MT": "356", "MU": "230",
    "MV": "960", "MW": "265", "MX": "52", "MY": "60", "MZ": "258",
    "NA": "264", "NC": "687", "NE": "227", "NF": "672", "NG": "234", "NI": "505",
    "NL": "31", "NO": "47", "NP": "977", "NR": "674", "NU": "683", "NZ": "64",
    "OM": "968",
    "PA": "507", "PE": "51", "PF": "689", "PG": "675", "PH": "63", "PK": "92",
    "PL": "48", "PM": "508", "PN": "64", "PR": "1", "PS": "970", "PT": "351",
    "PW": "680", "PY": "595",
    "QA": "974",
    "RE": "262", "RO": "40", "RS": "381", "RU": "7", "RW": "250",
    "SA": "966", "SB": "677", "SC": "248", "SD": "249", "SE": "46", "SG": "65",
    "SH": "290", "SI": "386", "SJ": "47", "SK": "421", "SL": "232", "SM": "378",
    "SN": "221", "SO": "252", "SR": "597", "SS": "211", "ST": "239", "SV": "503",
    "SX": "1", "SY": "963", "SZ": "268",
    "TC": "1", "TD": "235", "TG": "228", "TH": "66", "TJ": "992", "TK": "690",
    "TL": "670", "TM": "993", "TN": "216", "TO": "676", "TR": "90", "TT": "1",
    "TV": "688", "TW": "886", "TZ": "255",
    "UA": "380", "UG": "256", "US": "1", "UY": "598", "UZ": "998",
    "VA": "39", "VC": "1", "VE": "58", "VG": "1", "VI": "1", "VN": "84",
    "VU": "678",
    "WF": "681", "WS": "685",
    "XK": "383",
    "YE": "967", "YT": "262",
    "ZA": "27", "ZM": "260", "ZW": "263",
}

DEFAULT_DIAL = "84"  # country trống → coi như VN (đa số khách trong nước)

# Độ dài phần thuê bao (sau country code, bỏ trunk-prefix 0).
# Dùng bởi format_phone_intl để phân biệt số local bắt đầu trùng dial code
# (VD: Vinaphone 084xxx = local 9 số bắt đầu "84") vs số quốc tế dính dial.
# Nước thiếu → DEFAULT_LOCAL_LEN (9, đúng cho VN + đa số châu Á).
COUNTRY_LOCAL_LEN: dict[str, int] = {
    "AU": 9, "CN": 11, "DE": 10, "FR": 9, "GB": 10, "ID": 10, "IN": 10,
    "JP": 10, "KH": 8, "KR": 9, "LA": 8, "MY": 9, "PH": 10, "SG": 8,
    "TH": 9, "TW": 9, "US": 10, "VN": 9,
}
DEFAULT_LOCAL_LEN = 9


def local_len_for(country: str | None) -> int:
    key = (str(country).strip().upper() if country else "VN") or "VN"
    return COUNTRY_LOCAL_LEN.get(key, DEFAULT_LOCAL_LEN)


def dial_for(country: str | None) -> str:
    """Calling code (chỉ số) cho ISO alpha-2.

    country trống/None → "84" (VN). Không nhận diện được → cũng "84" (an toàn:
    SePay khớp đơn bằng transfer_code chứ không bằng SĐT, nên prefix sai chỉ ảnh
    hưởng hiển thị). Với bảng đủ ISO alpha-2, nhánh không-nhận-diện gần như không xảy ra.
    """
    key = (str(country).strip().upper() if country else "VN") or "VN"
    return COUNTRY_DIAL.get(key, DEFAULT_DIAL)
