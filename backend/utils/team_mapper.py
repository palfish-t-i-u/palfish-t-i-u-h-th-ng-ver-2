"""Team Mapper utility."""

from typing import Optional

TEAM_PIVOT_LABELS: dict[str, str] = {
    "Inhouse 1": "HN inhouse",
    "Inhouse 2": "HN inhouse 2",
    "HCM (Online)": "HCM team",
    "In-house": "HN inhouse",
    "HCM team": "HCM team",
    "Linh Dam (Store)": "Linh Dam",
    "Offline": "Offline",
    "An Binh (Store)": "An Binh",
}

KNOWN_BC01_TEAMS = frozenset(
    {
        "Inhouse 1",
        "Inhouse 2",
        "HCM (Online)",
        "Linh Dam (Store)",
        "Offline",
        "An Binh (Store)",
    }
)

BC01_TEAM_ORDER = [
    "Inhouse 1",
    "Inhouse 2",
    "HCM (Online)",
    "Linh Dam (Store)",
    "Offline",
    "An Binh (Store)",
    "Khác",
]

TEAM_TO_CANONICAL: dict[str, str] = {
    "Inhouse 1": "Inhouse 1",
    "Inhouse 2": "Inhouse 2",
    "HCM (Online)": "HCM (Online)",
    "In-house": "Inhouse 1",
    "HN inhouse": "Inhouse 1",
    "HN inhouse 2": "Inhouse 2",
    "HCM team": "HCM (Online)",
    "Linh Dam": "Linh Dam (Store)",
    "Linh Dam Store": "Linh Dam (Store)",
    "Linh Dam (Store)": "Linh Dam (Store)",
    "Offline": "Offline",
    "Offline Store": "Offline",
    "An Binh": "An Binh (Store)",
    "An Binh Store": "An Binh (Store)",
    "An Binh (Store)": "An Binh (Store)",
    "IH1": "Inhouse 1",
    "IH2": "Inhouse 2",
}

def get_canonical_team(raw_team_name: Optional[str]) -> str:
    """
    Chuẩn hóa tên team.
    Nếu không tìm thấy, trả về tên gốc hoặc 'Khác'.
    """
    if not raw_team_name:
        return "Khác"
        
    t = raw_team_name.strip()
    
    # Ưu tiên map chính xác trước
    if t in TEAM_TO_CANONICAL:
        return TEAM_TO_CANONICAL[t]
        
    # Thử case-insensitive mapping
    lower_t = t.lower()
    for key, canonical in TEAM_TO_CANONICAL.items():
        if key.lower() == lower_t:
            return canonical
            
    # Thử lấy từ TEAM_PIVOT_LABELS nếu có
    if t in TEAM_PIVOT_LABELS:
        pivot = TEAM_PIVOT_LABELS[t]
        if pivot in TEAM_TO_CANONICAL:
            return TEAM_TO_CANONICAL[pivot]
            
    # Nếu t đã nằm trong known list
    if t in KNOWN_BC01_TEAMS:
        return t
        
    # Trả về giá trị gốc nếu không thể chuẩn hóa
    return t
