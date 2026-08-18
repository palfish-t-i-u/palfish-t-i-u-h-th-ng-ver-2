"""Lead lookup API — tra cứu leads_lookup (Supabase replica của BQ app_lookup.lead_phone_lookup).

Ref: docs/specs/huong-dan-IT-doi-chieu-SDT-lead.md §7
     docs/plans/PLAN_LEAD_PHONE_MATCH_2026-08-16.md §4.1
"""

import re
from datetime import date, datetime, timezone

from fastapi import FastAPI, Header, HTTPException, Query

from rbac import resolve_actor, require_min_role

VALID_MATCHED_BY = {"sdt", "sdt_goc", "uid", "manual"}
LY_DO_CODES = {"TU_TIM_DEN", "NGUOI_QUEN_GT", "KHACH_CU_MUA_LAI", "SO_KHAC_KHONG_NHO", "KHAC"}


def _normalize_phone9(raw: str) -> str | None:
    digits = re.sub(r"[^0-9]", "", str(raw or ""))
    return digits[-9:] if len(digits) >= 9 else None


def _sort_leads(leads: list[dict], ec_sale: str | None) -> list[dict]:
    """ORDER BY khớp gmv_new (doc Hiếu §7 — KHÔNG đổi thứ tự):
      1) lead có ngày lên trước (lead_date IS NULL → cuối)
      2) lead cùng sale (ec = ec_sale) lên trước
      3) lead_date mới nhất lên trước
    Python sort ổn định: sort DESC theo ngày trước, rồi stable-sort ASC theo (has_date, same_ec).
    """
    out = list(leads)
    out.sort(key=lambda l: l.get("lead_date") or "", reverse=True)          # pass 1: ngày DESC
    out.sort(key=lambda l: (                                                 # pass 2: stable ASC
        0 if l.get("lead_date") else 1,
        0 if (ec_sale and l.get("ec") == ec_sale) else 1,
    ))
    return out


def register_leads_routes(app: FastAPI, get_sb):

    @app.get("/api/v1/leads/lookup")
    def lead_lookup(
        phone: str = Query(..., min_length=1),
        order_date: str | None = Query(None),
        uid: str | None = Query(None),
        ec_sale: str | None = Query(None),
        authorization: str | None = Header(None),
    ):
        sb = get_sb()
        actor = resolve_actor(sb, authorization)
        require_min_role(actor, "sale")

        phone9 = _normalize_phone9(phone)
        if not phone9:
            return {"matched": False, "count": 0, "matched_by": None, "leads": []}

        if order_date:
            od = order_date
        else:
            od = date.today().isoformat()

        res = (
            sb.table("leads_lookup")
            .select("*")
            .eq("phone9", phone9)
            .execute()
        )
        leads = [
            l for l in (res.data or [])
            if l.get("lead_date") is None or l["lead_date"] <= od
        ]

        if not leads:
            return {"matched": False, "count": 0, "matched_by": None, "leads": []}

        leads = _sort_leads(leads, ec_sale)[:10]
        matched_by = "sdt"

        out = []
        for l in leads:
            out.append({
                "lead_id": l.get("lead_id"),
                "name": l.get("name"),
                "phone": l.get("phone_goc"),
                "lead_date": l.get("lead_date"),
                "crm_code": l.get("crm_code"),
                "ec": l.get("ec"),
                "status": l.get("status"),
                "status_2": l.get("status_2"),
                "nation": l.get("nation"),
                "uid": l.get("uid"),
                "match_source": l.get("match_source"),
            })

        return {
            "matched": True,
            "count": len(out),
            "matched_by": matched_by,
            "leads": out,
        }
