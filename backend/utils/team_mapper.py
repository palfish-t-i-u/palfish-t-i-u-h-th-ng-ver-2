"""Team Mapper — Single Source of Truth for team name normalisation.

Every backend module that needs canonical team names MUST import from here.
Do NOT duplicate these mappings elsewhere.
"""

from __future__ import annotations

from typing import Optional


# ---------------------------------------------------------------------------
# 1. Pivot labels — used by revenue ledger to group teams in Excel-style pivot
# ---------------------------------------------------------------------------
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

# ---------------------------------------------------------------------------
# 2. Known BC01 teams — the official set used by BC01 report pivot
# ---------------------------------------------------------------------------
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

# ---------------------------------------------------------------------------
# 3. BC01 team ordering — controls row order in the BC01 pivot table
# ---------------------------------------------------------------------------
BC01_TEAM_ORDER = [
    "Inhouse 1",
    "Inhouse 2",
    "HCM (Online)",
    "Linh Dam (Store)",
    "Offline",
    "An Binh (Store)",
    "Khác",
]

# ---------------------------------------------------------------------------
# 4. Canonical mapping — raw team name → standard canonical name
# ---------------------------------------------------------------------------
TEAM_TO_CANONICAL: dict[str, str] = {
    # Canonical ↔ Canonical (idempotent)
    "Inhouse 1": "Inhouse 1",
    "Inhouse 2": "Inhouse 2",
    "HCM (Online)": "HCM (Online)",
    "Linh Dam (Store)": "Linh Dam (Store)",
    "Offline": "Offline",
    "An Binh (Store)": "An Binh (Store)",
    # Aliases → Canonical
    "In-house": "Inhouse 1",
    "HN inhouse": "Inhouse 1",
    "HN inhouse 2": "Inhouse 2",
    "HCM team": "HCM (Online)",
    "Linh Dam": "Linh Dam (Store)",
    "Linh Dam Store": "Linh Dam (Store)",
    "Offline Store": "Offline",
    "An Binh": "An Binh (Store)",
    "An Binh Store": "An Binh (Store)",
    "HN Offline Store": "Offline",
    # Short aliases
    "IH1": "Inhouse 1",
    "IH2": "Inhouse 2",
}


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------


def team_to_pivot_label(team: Optional[str]) -> str:
    """Convert a team name to its pivot label (used by revenue ledger)."""
    t = (team or "").strip()
    if not t:
        return "Khác"
    return TEAM_PIVOT_LABELS.get(t, t)


def team_to_canonical(
    team: Optional[str], team_pivot_label: Optional[str] = None
) -> str:
    """Resolve a team name to its canonical form.

    Used by revenue_routes for BC01 pivot grouping.
    Checks team first, then team_pivot_label, then KNOWN set.
    Falls back to "Khác".
    """
    t = (team or "").strip()
    if t in TEAM_TO_CANONICAL:
        return TEAM_TO_CANONICAL[t]
    pl = (team_pivot_label or "").strip()
    if pl in TEAM_TO_CANONICAL:
        return TEAM_TO_CANONICAL[pl]
    if t in KNOWN_BC01_TEAMS:
        return t
    if pl in KNOWN_BC01_TEAMS:
        return pl
    return "Khác"


def get_canonical_team(raw_team_name: Optional[str]) -> str:
    """Normalise a raw team name to its canonical form.

    Designed for the Zalo message builder and any new module that only
    has a single raw team string (no pivot label column).

    Steps:
        1. Strip whitespace.  Return "Khác" if empty / None.
        2. Exact match in TEAM_TO_CANONICAL.
        3. Case-insensitive match in TEAM_TO_CANONICAL.
        4. Check TEAM_PIVOT_LABELS chain.
        5. Check KNOWN_BC01_TEAMS membership.
        6. Fallback: return the original string as-is.
    """
    if not raw_team_name:
        return "Khác"

    t = raw_team_name.strip()
    if not t:
        return "Khác"

    # Exact match
    if t in TEAM_TO_CANONICAL:
        return TEAM_TO_CANONICAL[t]

    # Case-insensitive match
    lower_t = t.lower()
    for key, canonical in TEAM_TO_CANONICAL.items():
        if key.lower() == lower_t:
            return canonical

    # Try via TEAM_PIVOT_LABELS
    if t in TEAM_PIVOT_LABELS:
        pivot = TEAM_PIVOT_LABELS[t]
        if pivot in TEAM_TO_CANONICAL:
            return TEAM_TO_CANONICAL[pivot]

    # Already a known canonical name
    if t in KNOWN_BC01_TEAMS:
        return t

    # Fallback — return original (don't lose data)
    return t
