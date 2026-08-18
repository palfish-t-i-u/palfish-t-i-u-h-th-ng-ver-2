# PLAN SHIP — Hệ thống đối soát GMV ↔ Lead (bắt SĐT gốc + lý do đơn New không khớp lead)

**Ngày**: 2026-08-18 · **Bắt đầu**: 10:50 · **Mục tiêu**: air tính năng **chiều nay 18/8**
**Status**: SẴN SÀNG THỰC THI (đã duyệt hướng, đã có ground-truth verbatim)
**Executor**: Claude Sonnet 4.6 — plan tự-chứa, mỗi task đủ path:line + code nguyên văn + verify + guardrail để thực thi độc lập **kể cả sau context compact**.
**Supersedes**: phần thực thi của `PLAN_LEAD_PHONE_MATCH_2026-08-16.md` (giữ file đó làm ground-truth §2). Đồng bộ theo `docs/specs/huong-dan-IT-doi-chieu-SDT-lead.md` (doc IT anh Hiếu 18/8).

---

## 1. Bối cảnh + ranh giới ship hôm nay

175 đơn New (~8,2%, ~300tr/tháng) mất nguồn quảng cáo vì SĐT thanh toán ≠ SĐT lead marketing. Khi sale tạo/sửa PR nhóm New: app tra SĐT trong kho lead (`leads_lookup`), không thấy thì **bắt sale phản hồi** (nhập SĐT gốc HOẶC chọn lý do) — không chặn thao tác.

**TRONG scope hôm nay:**
- UI lead-check ở **Create modal** (điểm chính) + **badge trạng thái ở Drawer view** + (nếu kịp) **lead-check ở Drawer edit**.
- Lưu 6 field metadata xuống `payment_requests` → chảy xuống `so_doanh_thu` khi B3 kích hoạt.
- Query bảng `leads_lookup` (bản sao Supabase của `app_lookup.lead_phone_lookup`), seed thủ công từ BQ (quyền cá nhân anh Minh).

**NGOÀI scope hôm nay (chặn ngoài anh Hiếu — ghi ở §9):**
- API 2 ghi ngược `app_write.lead_phone_manual` (doc Hiếu §8) — chờ Hiếu tạo dataset `app_write` + SA.
- Job tự động sync BQ→Supabase 1h/lần — chờ SA. Hôm nay seed tay.
- Sửa view `gmv_new` dùng `sdt_goc` — việc anh Hiếu.
- Backfill 175 đơn cũ — plan riêng.

---

## 2. Trạng thái hiện tại (chốt 10:50, 18/8)

| Hạng mục | Trạng thái | Ghi chú |
|---|---|---|
| Migration sandbox (6 cột PR + 6 cột Sổ + bảng `leads_lookup`) | ✅ XONG | `apply_migration` OK, verified 14 cột leads_lookup + 6 cột PR |
| `backend/leads_routes.py` (GET lookup) | ⚠️ CÓ BUG | sort mồ côi + comment rác — G1-T2 dọn |
| PR models + `_apply_lead_fields` | ⚠️ CÓ BUG | PATCH không clear được về null — G1-T1 fix |
| `revenue_routes.py` propagate 6 field | ✅ XONG | insert + 2 update path; nhánh tay/hoan giữ nguyên |
| `main.py` register leads_routes | ✅ XONG | |
| FE `useLeadCheck.ts` + `leadSource.ts` const + `api.ts` endpoint + `CreatePaymentRequestPayload` type | ✅ XONG | `buildLeadPayload` trả đủ 5 key |
| FE Create modal wiring | ❌ CHƯA | M2 |
| FE mapper + `PaymentRequest` type + Drawer view badge | ❌ CHƯA | M3 |
| FE Drawer edit lead-check | ❌ CHƯA | M4 (cắt được nếu quá giờ) |
| Tests (BE 3 + FE 2) | ❌ CHƯA | G1-T3, G2-T2 |
| Seed `leads_lookup` | ❌ CHƯA | M5 |
| Deploy prod | ❌ CHƯA | M5 |

---

## 3. Roadmap (Milestone → Task)

**M1 — Hardening backend** (fix bug + dọn + test) — *~40′*
- **G1-T1** — **Fix PATCH clearing** bằng `model_fields_set` (Pydantic v2 đã xác nhận).
- **G1-T2** — **Dọn `leads_routes.py`**: bỏ sort mồ côi + viết lại sort 2-pass gọn + **bỏ uid-fallback** (lệch gmv_new).
- **G1-T3** — **BE tests**: `test_leads_lookup.py` + `test_pr_lead_fields.py` + mở rộng sync_ledger.

**M2 — Create modal (điểm chính)** — *~50′*
- **G2-T1** — **Component `LeadCheckBlock.tsx`** dùng chung (badge xanh / box vàng / radio / ô SĐT gốc / select lý do).
- **G2-T2** — **Wire vào Create modal**: state, trigger onBlur phone + đổi source, submit gate, reset on open, spread payload.
- **G2-T3** — **FE tests**: `useLeadCheck.test.ts` + submit-gate test.

**M3 — Mapper + type + Drawer view** — *~30′*
- **G3-T1** — **Mapper + type**: thêm 6 field vào `fromApiPaymentRequest` + `PaymentRequest` interface.
- **G3-T2** — **Drawer view badge**: hiển thị trạng thái lead read-only trong panel B1.

**M4 — Drawer edit lead-check** *(CẮT ĐƯỢC nếu quá 15:30)* — *~45′*
- **G4-T1** — **Extract `seedDraft(request)`** khử trùng lặp 2 chỗ seed (1715-1753 + 1909-1941) + thêm lead fields vào `DraftPr`.
- **G4-T2** — **Wire edit + thread patch** qua `onUpdatePr` → `PaymentRequestsTab.handleUpdatePr` (include có điều kiện).

**M5 — Seed + deploy** — *~30′ + tay Minh*
- **G5-N1** — **Seed sandbox** (Claude: bq sample ~500 dòng → execute_sql).
- **G5-N2** — **E2E tay sandbox** theo 11-check doc Hiếu (§5).
- **G5-N3** — **Prod**: migration + seed CSV full (Minh) + deploy (Minh).

### Bảng deadline / owner

| Milestone | Owner | Xong trước | Chặn bởi |
|---|---|---|---|
| M1 | Claude/Sonnet | 11:40 | — |
| M2 | Claude/Sonnet | 12:40 | M1 (bug fix) |
| M3 | Claude/Sonnet | 14:00 | M2 (LeadCheckBlock) |
| M4 *(optional)* | Claude/Sonnet | 15:30 | M3 |
| M5-N1/N2 | Claude/Sonnet | 16:00 | M1-M3, migration sandbox |
| M5-N3 | **anh Minh** | 17:00 | M5-N2 pass |

**Cut line**: nếu 15:30 chưa xong M4 → ship M1+M2+M3+M5 (Create modal + view badge). Drawer edit fast-follow mai. Feature vẫn giao đủ giá trị (bắt tại thời điểm tạo PR).

---

## 4. Task details (tự-chứa cho Sonnet)

> **Quy ước chung**: Sau MỖI task code → `cd frontend && npx tsc -b` (FE) hoặc chạy test tương ứng (BE). KHÔNG `--noEmit`. KHÔNG ghi SĐT vào log/print (guardrail doc Hiếu §7). Đọc `docs/learnings/` grep tên file trước khi sửa nếu task ghi "check learnings".

### G1-T1 — Fix PATCH clearing (`backend/payment_request_routes.py`)

**Problem**: `_apply_lead_fields` hiện check `has_any = any(getattr(body,f) is not None ...)`. Pydantic v2 không phân biệt "field vắng mặt" vs "gửi null tường minh" — cả hai đều None. Khi sale đổi source New→non-New, FE gửi 5 field = null để clear, nhưng hàm skip → data lead cũ (VD `lead_matched=true`) kẹt lại trong DB → chảy sai xuống Sổ.

**Root cause**: dùng giá trị None thay vì `model_fields_set` để biết field có được gửi hay không.

**Fix** — thay nguyên hàm `_apply_lead_fields` (hiện ở `payment_request_routes.py:1066`) bằng:

```python
def _apply_lead_fields(target: dict[str, Any], body, *, is_patch: bool) -> None:
    """Ghi 5 field lead + stamp lead_check_at.
    Create: chỉ ghi khi có ít nhất 1 field non-None (đơn New đã check).
    Patch: chỉ ghi khi FE gửi tường minh ít nhất 1 field lead (model_fields_set) —
           cho phép clear về null khi đổi source New→non-New.
    """
    lead_fields = ("sdt_goc", "lead_matched", "lead_id", "lead_matched_by", "ly_do_khong_ghep")

    if is_patch:
        sent = getattr(body, "model_fields_set", set())
        if not any(f in sent for f in lead_fields):
            return
    else:
        if not any(getattr(body, f, None) is not None for f in lead_fields):
            return

    if body.lead_matched_by is not None and body.lead_matched_by not in _VALID_MATCHED_BY:
        raise HTTPException(422, f"lead_matched_by phải thuộc {_VALID_MATCHED_BY}")
    if body.ly_do_khong_ghep is not None and body.ly_do_khong_ghep not in _LY_DO_CODES:
        raise HTTPException(422, f"ly_do_khong_ghep phải thuộc {_LY_DO_CODES}")

    target["sdt_goc"] = _clean_text(body.sdt_goc) or None
    target["lead_matched"] = body.lead_matched
    target["lead_id"] = _clean_text(body.lead_id) or None
    target["lead_matched_by"] = body.lead_matched_by
    target["ly_do_khong_ghep"] = body.ly_do_khong_ghep
    target["lead_check_at"] = datetime.now(timezone.utc).isoformat()
```

**Đổi 2 call site**:
- Trong `_payment_request_insert_row` (cuối hàm, hiện `_apply_lead_fields(row, body)`): → `_apply_lead_fields(row, body, is_patch=False)`
- Trong `_payment_request_patch_row` (trước `if not patch: return {}`, hiện `_apply_lead_fields(patch, body)`): → `_apply_lead_fields(patch, body, is_patch=True)`

**Guardrail**: `_VALID_MATCHED_BY` + `_LY_DO_CODES` đã khai báo ở `:1062-1063`, giữ nguyên. KHÔNG đổi tên mã lý do (doc Hiếu §12.4).

**Verify**: `cd backend && py -m pytest tests/test_pr_lead_fields.py -q` (viết ở G1-T3) — case "patch gửi 5 null → row có 5 null + lead_check_at" phải pass.

---

### G1-T2 — Dọn `leads_routes.py`: sort + bỏ uid-fallback

**Problem A (dead code sort)**: hàm `_sort_leads` (`:24-33`) mồ côi (không ai gọi). `_final_sort` (`:36-56`) có comment rác thinking-out-loud ("# Simpler: just use negative approach / # Actually, let's use a proper multi-key sort") + groupby lằng nhằng.

**Fix**: XÓA `_sort_leads` hoàn toàn. Thay `_final_sort` bằng 2-pass stable sort (Python sort ổn định → pass sau giữ thứ tự pass trước trong mỗi nhóm). ORDER BY khớp `gmv_new` (doc Hiếu §7, **KHÔNG đổi thứ tự**):

```python
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
```

**Đổi call site** trong `lead_lookup` (`:113`): `leads = _final_sort(leads, ec_sale)[:10]` → `leads = _sort_leads(leads, ec_sale)[:10]`.

Xóa `from itertools import groupby` nếu chỉ dùng ở đó. Xóa import `Any` nếu không còn dùng (kiểm tra: file còn dùng `Any` ở đâu không → nếu không, xóa dòng `from typing import Any`).

**Problem B (uid-fallback lệch gmv_new)**: `lead_lookup` hiện có nhánh fallback: nếu phone9 không khớp thì thử `WHERE uid = :uid` và trả `matched_by="uid"` (`leads_routes.py:95-108`). **Vi phạm doc Hiếu cảnh báo #3**: matching của app phải khớp `gmv_new` — mà `gmv_new` chỉ ghép theo phone9 (doc §7 API 1). Đơn khớp qua uid sẽ: sale thấy "✓ đã khớp" (xanh) NHƯNG `sdt_goc` vẫn NULL → khi chảy lên `gmv_new`, không có số gốc để ghép → ROI vẫn "chưa khớp". Đúng failure mode doc cấm: "app báo đã khớp nhưng báo cáo tính chưa khớp → vô hiệu hoá toàn bộ tính năng".

**Fix B**: XÓA nguyên khối uid-fallback (`leads_routes.py:93-108`, gồm `matched_by = "sdt"` + `if not leads and uid:` block). Sau xóa: phone9 không khớp → luôn trả `{"matched": False, ...}` → sale đi nhánh "none" → nhập `sdt_goc` (số lead thật) → gmv_new ghép được. Giữ param `uid` trong signature (harmless, FE vẫn gửi) hoặc xóa nếu muốn sạch. Response `matched_by` khi khớp: hardcode `"sdt"`.

**Verify**: `cd backend && py -m pytest tests/test_leads_lookup.py -q` (G1-T3) — sort + normalize pass.

---

### G1-T3 — BE tests

Theo pattern repo (đã xác nhận): test hàm thuần bằng `assert` trần, `def test_...()`, import trực tiếp; DB-touch dùng fixture `mock_supabase` (conftest.py:65, chainable MagicMock, `.execute.return_value = MagicMock(data=[...])`). `_env_defaults` autouse — không cần set env.

**File 1 — `backend/tests/test_leads_lookup.py`** (MỚI). Test hàm thuần `_normalize_phone9` + `_sort_leads` (không cần mock), và route `lead_lookup` (mock_supabase override `.execute.return_value`):

```python
from __future__ import annotations
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from leads_routes import _normalize_phone9, _sort_leads


def test_normalize_phone9_formats():
    assert _normalize_phone9("0912 345 678") == "912345678"
    assert _normalize_phone9("+84 912 345 678") == "912345678"
    assert _normalize_phone9("84-912345678") == "912345678"
    assert _normalize_phone9("(091) 234-5678") == "912345678"
    assert _normalize_phone9("12345678") is None          # <9 số
    assert _normalize_phone9("") is None


def test_sort_leads_order_matches_gmv_new():
    # ⚠️ EXPECTED = ['d','a','c','b'] — KHÔNG phải ['d','c','a','b'].
    # ORDER BY doc Hiếu §7: (has_date, same_ec, date DESC) — same_ec ƯU TIÊN HƠN date.
    # → a (cùng EC1, ngày cũ hơn) PHẢI đứng TRƯỚC c (khác EC9, ngày mới hơn).
    # Nếu test fail ở đây: SỬA test cho khớp, TUYỆT ĐỐI KHÔNG sửa _sort_leads
    # (đổi thứ tự = phá parity với gmv_new — vi phạm guardrail §6 + doc §7).
    leads = [
        {"lead_id": "a", "lead_date": "2026-07-01", "ec": "EC1"},   # cùng EC, ngày cũ
        {"lead_id": "b", "lead_date": None,          "ec": "EC1"},   # NULL → cuối
        {"lead_id": "c", "lead_date": "2026-08-01", "ec": "EC9"},   # khác EC, ngày mới
        {"lead_id": "d", "lead_date": "2026-08-01", "ec": "EC1"},   # cùng EC, ngày mới → đầu
    ]
    out = _sort_leads(leads, ec_sale="EC1")
    assert [l["lead_id"] for l in out] == ["d", "a", "c", "b"]


def test_sort_leads_no_ec_falls_back_to_date_desc():
    leads = [
        {"lead_id": "x", "lead_date": "2026-06-01", "ec": "E"},
        {"lead_id": "y", "lead_date": "2026-09-01", "ec": "E"},
    ]
    out = _sort_leads(leads, ec_sale=None)
    assert [l["lead_id"] for l in out] == ["y", "x"]
```

> Nếu muốn test route `lead_lookup` end-to-end: import `register_leads_routes`, tạo FastAPI app + TestClient, mock `get_sb` trả `mock_supabase` với `resolve_actor` monkeypatch. TỐN CÔNG — ưu tiên test 2 hàm thuần trên (đủ cover logic khác biệt). Nếu quá giờ, chỉ giữ 2 hàm thuần.

**File 2 — `backend/tests/test_pr_lead_fields.py`** (MỚI). Test `_apply_lead_fields` với `PaymentRequestCreate`/`PaymentRequestPatch`:

```python
from __future__ import annotations
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from payment_request_routes import (
    _apply_lead_fields, PaymentRequestCreate, PaymentRequestPatch,
)


def test_create_writes_lead_fields_and_stamps():
    body = PaymentRequestCreate(name="A", phone="0912345678", target=1,
                                lead_source="quang_cao",
                                sdt_goc=None, lead_matched=True, lead_id="L1",
                                lead_matched_by="sdt")
    row: dict = {}
    _apply_lead_fields(row, body, is_patch=False)
    assert row["lead_matched"] is True
    assert row["lead_id"] == "L1"
    assert row["lead_matched_by"] == "sdt"
    assert row["lead_check_at"]                       # stamped


def test_create_skips_when_no_lead_fields():
    body = PaymentRequestCreate(name="A", phone="0912345678", target=1,
                                lead_source="gia_han")
    row: dict = {}
    _apply_lead_fields(row, body, is_patch=False)
    assert "lead_check_at" not in row                 # không đụng


def test_patch_clears_to_null_when_sent_explicitly():
    # BUG cũ: bị skip. Fix: model_fields_set thấy field đã gửi → ghi null.
    body = PaymentRequestPatch(sdt_goc=None, lead_matched=None, lead_id=None,
                               lead_matched_by=None, ly_do_khong_ghep=None)
    patch: dict = {}
    _apply_lead_fields(patch, body, is_patch=True)
    assert patch["lead_matched"] is None
    assert patch["lead_id"] is None
    assert "lead_check_at" in patch                   # vẫn stamp


def test_patch_untouched_when_lead_fields_absent():
    body = PaymentRequestPatch(note="chỉ sửa note")
    patch: dict = {}
    _apply_lead_fields(patch, body, is_patch=True)
    assert patch == {}                                # không đụng cột lead


def test_invalid_ly_do_raises_422():
    import pytest
    from fastapi import HTTPException
    body = PaymentRequestPatch(ly_do_khong_ghep="SAI_MA")
    with pytest.raises(HTTPException) as e:
        _apply_lead_fields({}, body, is_patch=True)
    assert e.value.status_code == 422
```

**File 3 — mở rộng sync_ledger** (cạnh `test_ar_lead_source_passthrough.py`, đặt tên `test_ledger_lead_passthrough.py` MỚI): PR row có 6 lead field → `sync_ledger_from_ar_course` payload insert Sổ chứa đủ 6 field. Dùng `mock_supabase`; override AR/PR/course fixtures. NẾU quá phức tạp để mock (nhiều bảng): giảm scope xuống assert bằng cách gọi trực tiếp và kiểm payload dict — hoặc SKIP file này (propagate đã có code, ưu tiên File 1+2). Ghi rõ trong commit nếu skip.

**Verify M1**: `cd backend && py -m pytest tests/test_leads_lookup.py tests/test_pr_lead_fields.py -q` → all pass.

---

### G2-T1 — Component `LeadCheckBlock.tsx` (MỚI, dùng chung modal + drawer)

Tạo `frontend/src/components/payment-request/LeadCheckBlock.tsx`. Presentational — nhận state + handler từ `useLeadCheck`, render theo `status`. Nguyên tắc doc Hiếu §7 (box vàng NỔI BẬT, không text mờ) + §5 (không tự chọn lead khi multi, mặc định dòng đầu) + §5 checklist #2.

```tsx
import type { LeadCheckState, LeadHit } from "./useLeadCheck";
import { LY_DO_KHONG_GHEP } from "../../constants/leadSource";

interface Props {
  state: LeadCheckState;
  onSelectLead: (leadId: string) => void;
  onSdtGocInput: (val: string) => void;
  onSdtGocBlur: (val: string) => void;
  onReasonChange: (val: string) => void;
}

function LeadLine({ hit }: { hit: LeadHit }) {
  return (
    <span>
      {hit.name || "(không tên)"} · {hit.leadDate || "?"} · kênh {hit.crmCode || "?"}
      {hit.status ? ` · ${hit.status}` : ""}
    </span>
  );
}

export default function LeadCheckBlock({
  state, onSelectLead, onSdtGocInput, onSdtGocBlur, onReasonChange,
}: Props) {
  if (state.status === "idle" || state.status === "skipped" || state.status === "error") return null;

  if (state.status === "loading") {
    return <div style={{ fontSize: 12, color: "var(--muted)", padding: "4px 0" }}>Đang tra lead…</div>;
  }

  if (state.status === "matched") {
    const many = state.leads.length > 1;
    return (
      <div style={{ background: "var(--success-bg, #ecfdf5)", border: "1px solid var(--success, #10b981)",
                    borderRadius: 8, padding: 8, fontSize: 12 }}>
        <div style={{ fontWeight: 600, color: "var(--success, #059669)" }}>
          ✓ Khớp lead{state.matchedBy === "sdt_goc" ? " qua số gốc" : ""}:
        </div>
        {!many ? (
          <div style={{ marginTop: 2 }}><LeadLine hit={state.leads[0]} /></div>
        ) : (
          <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ color: "var(--muted)" }}>Có {state.leads.length} lead — chọn đúng khách:</div>
            {state.leads.map((h) => (
              <label key={h.leadId} style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
                <input type="radio" name="lead-pick" checked={state.selectedLeadId === h.leadId}
                       onChange={() => onSelectLead(h.leadId)} />
                <LeadLine hit={h} />
              </label>
            ))}
          </div>
        )}
      </div>
    );
  }

  // status === "none"
  return (
    <div style={{ background: "var(--warning-bg, #fffbeb)", border: "1px solid var(--warning, #f59e0b)",
                  borderRadius: 8, padding: 8, fontSize: 12, display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontWeight: 600, color: "var(--warning-fg, #b45309)" }}>
        ⚠ Không tìm thấy số này trong dữ liệu marketing. Khách có dùng số khác khi đăng ký không?
      </div>
      <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ color: "var(--muted)" }}>SĐT khách dùng lúc đăng ký (nếu khác)</span>
        <input value={state.sdtGoc}
               onChange={(e) => onSdtGocInput(e.target.value)}
               onBlur={(e) => onSdtGocBlur(e.target.value)}
               placeholder="VD 0912 345 678"
               style={{ padding: "4px 6px", border: "1px solid var(--border)", borderRadius: 6 }} />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ color: "var(--muted)" }}>Hoặc chọn lý do</span>
        <select value={state.reason} onChange={(e) => onReasonChange(e.target.value)}
                style={{ padding: "4px 6px", border: "1px solid var(--border)", borderRadius: 6 }}>
          <option value="">— Chọn lý do —</option>
          {LY_DO_KHONG_GHEP.map((r) => (<option key={r.value} value={r.value}>{r.label}</option>))}
        </select>
      </label>
    </div>
  );
}
```

**Guardrail**: KHÔNG hardcode màu dark-only — dùng CSS var có fallback (repo theme-aware). KHÔNG hiển thị SĐT lead ra ngoài phạm vi cần (chỉ tên/ngày/kênh/status theo doc Hiếu §5 cột "Dùng ở đâu").

**Verify**: `npx tsc -b` pass.

---

### G2-T2 — Wire `useLeadCheck` vào Create modal (`CreatePaymentRequestModal.tsx`)

Anchors verbatim (file 529 dòng):
- imports `:1` (đã có `crmPhoneFormat, normalizeLocalPhone, applySmartPhoneInput`, `findCountry`, `endpoints`).
- FormState `:15` (phone `:20`, leadSource `:30`); INITIAL `:40`.
- `set()` helper `:103-104`; `canSubmit` `:119-123` (gate nút submit `:517`).
- reset useEffect on open `:84-90`.
- phone `<input>` `:213`, onBlur `:221-224` (chỉ normalize).
- leadSource `<select>` `:277`, onChange `:279-283` (đã reset leadChannel — HOOK SAU, đừng thay).
- handleSubmit `:125`; payload `:133-153`.

**Bước wiring:**

1. **Import** (thêm vào block `:1`):
```tsx
import { useLeadCheck } from "./useLeadCheck";
import { NEW_CHECK_SOURCES } from "../../constants/leadSource";
import LeadCheckBlock from "./LeadCheckBlock";
```
`crmPhoneFormat` đã import sẵn.

2. **Khởi tạo hook** (trong component, cạnh state khác ~`:78`):
```tsx
const lead = useLeadCheck();
```

3. **Trigger check** — sửa onBlur phone `:221-224` để sau khi normalize, nếu source ∈ New thì tra lead:
```tsx
onBlur={() => {
  const n = normalizeLocalPhone(form.phone, findCountry(form.country));
  const finalPhone = n.value !== form.phone ? n.value : form.phone;
  if (n.value !== form.phone) set("phone", n.value);
  if (NEW_CHECK_SOURCES.has(form.leadSource)) {
    lead.runCheck(crmPhoneFormat(finalPhone, findCountry(form.country)), form.uid);
  }
}}
```

4. **Trigger khi đổi source** — sửa onChange leadSource `:279-283`, thêm sau 2 dòng `set(...)` hiện có:
```tsx
onChange={(e) => {
  const next = e.target.value;
  set("leadSource", next);
  set("leadChannel", defaultChannelForSource(next) ?? "");
  if (NEW_CHECK_SOURCES.has(next)) {
    if (form.phone) lead.runCheck(crmPhoneFormat(form.phone, findCountry(form.country)), form.uid);
  } else {
    lead.resetLeadCheck();     // đổi sang non-New → xóa kết quả cũ (doc Hiếu §9 + checklist #9)
  }
}}
```

5. **Render `LeadCheckBlock`** — chèn NGAY SAU khối leadSource/leadChannel select (sau dòng đóng của kênh `<select>`, ~sau `:309`):
```tsx
{NEW_CHECK_SOURCES.has(form.leadSource) && (
  <LeadCheckBlock
    state={lead.leadCheck}
    onSelectLead={lead.selectLead}
    onSdtGocInput={lead.setSdtGoc}
    onSdtGocBlur={(v) => lead.runCheckSdtGoc(v)}
    onReasonChange={lead.setReason}
  />
)}
```
> **Lưu `sdt_goc` = số sale gõ nguyên bản** (không `crmPhoneFormat`). BE `_normalize_phone9` tự chuẩn hoá khi tra; lưu số gốc khớp thiết kế doc Hiếu §8 (`phone_lead_nhap` giữ định dạng gốc). `runCheckSdtGoc` gọi lookup với số raw — BE chuẩn hoá 9-số để query.

6. **Submit gate** — AND vào `canSubmit` `:119-123`. **QUAN TRỌNG (fix race)**: gate chỉ pass khi lead-check đã **hoàn tất** (matched/error) hoặc sale đã phản hồi (none + sdt_goc/reason). Trạng thái `idle`/`loading`/`skipped` với source New = **CHẶN** (chống lưu trước khi tra xong — nếu chỉ check `!== "none"` thì idle/loading lọt → PR New lưu chưa tra, thua doc checklist #4/#5):
```tsx
const isNewSource = NEW_CHECK_SOURCES.has(form.leadSource);
const s = lead.leadCheck.status;
const leadGateOk =
  !isNewSource ||
  s === "matched" ||
  s === "error" ||                                              // fail-open API lỗi (doc §7)
  (s === "none" && (!!lead.leadCheck.sdtGoc.trim() || !!lead.leadCheck.reason));
const canSubmit = !!(
  form.name && form.phone && targetNum > 0 &&
  form.leadSource && (!needsChannel || form.leadChannel) &&
  emailValid && addressOk &&
  leadGateOk
);
```
> `idle`/`loading` → nút Lưu disabled (canSubmit=false) → tín hiệu "đang tra / hãy để con trỏ rời ô SĐT". Bước 6b bên dưới đảm bảo không kẹt.

6b. **Chống kẹt idle** — đầu `handleSubmit` (`:125`, TRƯỚC `if (!canSubmit)`), nếu source New mà chưa tra (idle/loading) thì tra rồi return để sale xem kết quả:
```tsx
const handleSubmit = async () => {
  if (isNewSource && (lead.leadCheck.status === "idle" || lead.leadCheck.status === "loading")) {
    await lead.runCheck(crmPhoneFormat(form.phone, findCountry(form.country)), form.uid);
    return;                       // hiện kết quả → sale bấm Lưu lần nữa
  }
  if (!canSubmit || submitting) return;
  // ...phần cũ giữ nguyên...
};
```
> `runCheck` có guard `checkedPhone` — nếu đã tra đúng số này rồi thì không gọi lại thừa.

7. **Spread payload** — trong `onSubmit({...})` `:133-153`, thêm trước dòng đóng `});`:
```tsx
  ...lead.buildLeadPayload(),
```
> `buildLeadPayload()` trả đủ 5 key null tường minh. Với source non-New, `status` là `idle/skipped` → trả toàn null → BE `is_patch=False` + has_any(non-null)=false → skip, cột default null. ✓

8. **Reset on open** — trong useEffect `:84-90`, thêm:
```tsx
lead.resetLeadCheck();
```
> Chống badge/warning cũ kẹt qua lần mở modal sau (gotcha agent chỉ ra).

**Guardrail**: KHÔNG chuyển `runCheck` sang onChange (spam API) — chỉ onBlur. `useLeadCheck` đã có AbortController chống race + `checkedPhone` chống re-check thừa.

**Verify**: `npx tsc -b` pass. Test G2-T3.

---

### G2-T3 — FE tests

Pattern (đã xác nhận): `vi.mock("../../lib/api", ...)` TRƯỚC import; `renderHook` + `act`; MSW `onUnhandledRequest:"error"` → PHẢI mock api (đừng để gọi thật).

**File 1 — `frontend/src/components/payment-request/useLeadCheck.test.ts`** (MỚI):
```ts
import { act, renderHook } from "@testing-library/react";   // KHÔNG import waitFor — noUnusedLocals=true → tsc TS6133
import { afterEach, describe, expect, it, vi } from "vitest";

const lookup = vi.fn();
vi.mock("../../lib/api", () => ({ endpoints: { leads: { lookup } } }));

import { useLeadCheck, buildLeadPayload } from "./useLeadCheck";

afterEach(() => { lookup.mockReset(); });

describe("useLeadCheck", () => {
  it("matched: 1 lead → status matched + selected đầu", async () => {
    lookup.mockResolvedValue({ data: { matched: true, count: 1, matched_by: "sdt",
      leads: [{ lead_id: "L1", name: "A", phone: "0912", lead_date: "2026-07-01",
                crm_code: "300265", ec: "E", status: "L4", status_2: null, nation: null,
                uid: null, match_source: "phone" }] } });
    const { result } = renderHook(() => useLeadCheck());
    await act(async () => { await result.current.runCheck("84-912345678"); });
    expect(result.current.leadCheck.status).toBe("matched");
    expect(result.current.leadCheck.selectedLeadId).toBe("L1");
  });

  it("none: 0 lead → status none", async () => {
    lookup.mockResolvedValue({ data: { matched: false, count: 0, matched_by: null, leads: [] } });
    const { result } = renderHook(() => useLeadCheck());
    await act(async () => { await result.current.runCheck("84-999999999"); });
    expect(result.current.leadCheck.status).toBe("none");
  });

  it("fail-open: API reject → status error, không throw", async () => {
    lookup.mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useLeadCheck());
    await act(async () => { await result.current.runCheck("84-912345678"); });
    expect(result.current.leadCheck.status).toBe("error");
  });

  it("buildLeadPayload trả đủ 5 key null khi idle", () => {
    const p = buildLeadPayload({ status: "idle", matchedBy: null, leads: [], selectedLeadId: null,
      sdtGoc: "", reason: "", checkedPhone: "" });
    expect(p).toEqual({ sdt_goc: null, lead_matched: null, lead_id: null,
      lead_matched_by: null, ly_do_khong_ghep: null });
  });

  it("buildLeadPayload: none + reason → lead_matched false + ly_do", () => {
    const p = buildLeadPayload({ status: "none", matchedBy: null, leads: [], selectedLeadId: null,
      sdtGoc: "", reason: "TU_TIM_DEN", checkedPhone: "912" });
    expect(p.lead_matched).toBe(false);
    expect(p.ly_do_khong_ghep).toBe("TU_TIM_DEN");
  });
});
```

**File 2** — nếu kịp: `CreatePaymentRequestModal` submit-gate test (render modal, chọn source quang_cao, mock lookup→none, assert nút Lưu disabled tới khi nhập reason). TỐN CÔNG (modal nhiều field bắt buộc). Nếu quá giờ SKIP — gate logic đã cover gián tiếp qua `leadGateOk` + useLeadCheck test. Ghi rõ nếu skip.

**Verify**: `cd frontend && npm run test` → useLeadCheck.test.ts pass.

---

### G3-T1 — Mapper + PaymentRequest type (6 field)

**File `frontend/src/types/paymentRequest.ts`** — thêm 6 field vào `interface PaymentRequest` (mở `:94`), chèn sau `leadChannel?: string;` (`:112`), trước `wantsInvoice?` (`:113`):
```ts
  sdtGoc?: string | null;
  leadMatched?: boolean | null;
  leadId?: string | null;
  leadMatchedBy?: "sdt" | "sdt_goc" | "uid" | "manual" | null;
  lyDoKhongGhep?: string | null;
  leadCheckAt?: string | null;
```
> `CreatePaymentRequestPayload` (`:242`) ĐÃ có 5 field snake_case (`:263-267`) — không đụng. `PatchPaymentRequestPayload = Partial<CreatePaymentRequestPayload>` tự có.

**File `frontend/src/components/payment-request/paymentRequestUtils.ts`** — trong `fromApiPaymentRequest` (`:172`), thêm sau `leadChannel` (`:196`), theo đúng convention dual-fallback:
```ts
    sdtGoc: raw.sdt_goc ?? raw.sdtGoc ?? undefined,
    leadMatched: raw.lead_matched ?? raw.leadMatched ?? undefined,
    leadId: raw.lead_id ?? raw.leadId ?? undefined,
    leadMatchedBy: raw.lead_matched_by ?? raw.leadMatchedBy ?? undefined,
    lyDoKhongGhep: raw.ly_do_khong_ghep ?? raw.lyDoKhongGhep ?? undefined,
    leadCheckAt: raw.lead_check_at ?? raw.leadCheckAt ?? undefined,
```

**Verify**: `npx tsc -b` pass.

---

### G3-T2 — Drawer VIEW-mode badge (`PaymentRequestDetailDrawer.tsx`)

Anchors: panel B1 `:1902-2430`; view-grid `:2020-2125`; cell "Nguồn KH" `:2079-2084` (conditional `{request.leadSource && ...}`). `findSourceByKey` đã import.

Thêm 1 info-cell NGAY SAU cell "Nguồn KH" (sau `:2084`), chỉ render khi source ∈ New:
```tsx
{NEW_CHECK_SOURCES.has(request.leadSource ?? "") && (
  <div className="info-cell">
    <div className="info-label">Đối soát lead</div>
    <div className="info-value">
      {request.leadMatched === true ? (
        <span style={{ color: "var(--success, #059669)", fontWeight: 600 }}>
          ✓ Đã khớp lead{request.sdtGoc ? ` (số gốc ${request.sdtGoc})` : ""}
        </span>
      ) : request.leadMatched === false ? (
        <span style={{ color: "var(--warning-fg, #b45309)", fontWeight: 600 }}>
          ⚠ Chưa khớp{request.lyDoKhongGhep ? ` — ${lyDoLabel(request.lyDoKhongGhep)}` : ""}
        </span>
      ) : (
        <span style={{ color: "var(--muted)" }}>Chưa kiểm tra</span>
      )}
    </div>
  </div>
)}
```
Thêm import `NEW_CHECK_SOURCES, LY_DO_KHONG_GHEP` từ `../../constants/leadSource` (kiểm file đã import `findSourceByKey` từ đó chưa → thêm vào cùng dòng). Thêm helper cạnh component:
```tsx
const lyDoLabel = (code: string) =>
  LY_DO_KHONG_GHEP.find((r) => r.value === code)?.label ?? code;
```

**Guardrail**: KHÔNG đụng logic badge đỏ UID-mismatch (module CLAUDE.md — no silent overwrite). Đây là cell hiển thị read-only riêng, không ghi gì.

**Verify**: `npx tsc -b` pass.

---

### G4-T1 — Extract `seedDraft` + DraftPr lead fields *(M4, cắt được)*

**Problem**: 2 chỗ seed draft trùng lặp — inline "Sửa" button `:1909-1941` (đường chính) + `handleOpenEditForTarget` `:1715-1753` (qua modal "PR đã đủ" `:3298`). Thêm field lead phải sửa CẢ 2.

**Bước 1** — thêm 5 field vào `interface DraftPr` (`:628-648`):
```ts
  sdtGoc: string;
  leadMatched: boolean | null;
  leadId: string | null;
  leadMatchedBy: "sdt" | "sdt_goc" | "uid" | "manual" | null;
  lyDoKhongGhep: string;
```

**Bước 2** — tạo helper `seedDraft(request)` (cạnh component, nhận `request: PaymentRequest` trả `DraftPr`). Copy nguyên field list hiện có TRONG `handleOpenEditForTarget` `:1718-1740` + thêm 5 field lead:
```ts
    sdtGoc: request.sdtGoc ?? "",
    leadMatched: request.leadMatched ?? null,
    leadId: request.leadId ?? null,
    leadMatchedBy: request.leadMatchedBy ?? null,
    lyDoKhongGhep: request.lyDoKhongGhep ?? "",
```
Thay body của CẢ 2 chỗ seed bằng `setDraft(seedDraft(request));` (giữ nguyên `setEditing(true)` + phần scroll/focus của `handleOpenEditForTarget`).

**Verify**: `npx tsc -b` pass; mở edit từ cả 2 đường (nút Sửa panel + modal "PR đã đủ") thấy field cũ nạp đúng.

---

### G4-T2 — Wire edit lead-check + thread patch *(M4, cắt được)*

Anchors: draft state `:1625`; edit phone input `:2172-2218`, onBlur `:2189-2201`; save handler `:1955-1994`, gọi `onUpdatePr(next)` với `leadSource: draft.leadSource || undefined` `:1983`; `onUpdatePr` prop `:1588`; PATCH thật ở `PaymentRequestsTab.tsx handleUpdatePr :245-314` (payload `:258-276`, call `:279`, truyền drawer `:873`).

**⚠️ Nguyên tắc chống data-loss (BẮT BUỘC)**: Drawer edit chỉ được ghi cột lead khi sale **thực sự tương tác** lead-check trong phiên edit này (đổi phone/source, hoặc nhập sdt_goc/reason). Nếu sale chỉ sửa địa chỉ/note của 1 PR đã matched → **TUYỆT ĐỐI không đụng cột lead** (nếu ghi `buildLeadPayload()` từ hook idle → toàn null → xoá mất `lead_matched=true` cũ → chảy null sai xuống Sổ). Dùng cờ `leadTouched` + truyền `leadPatch` qua **tham số thứ 2** của `onUpdatePr` (KHÔNG nhồi vào object `next`, vì `next = {...request}` luôn mang giá trị cũ → không phân biệt được "muốn ghi null" vs "không đụng").

**Bước 1 — đổi chữ ký `onUpdatePr`** (backward-compatible). Type prop drawer `:1588`:
```ts
onUpdatePr: (next: PaymentRequest, leadPatch?: LeadPatchSnake) => Promise<boolean>;
```
Khai báo type cạnh drawer (hoặc import từ useLeadCheck — `buildLeadPayload` đã trả đúng shape này):
```ts
type LeadPatchSnake = {
  sdt_goc: string | null; lead_matched: boolean | null; lead_id: string | null;
  lead_matched_by: string | null; ly_do_khong_ghep: string | null;
};
```

**Bước 2 — state + trigger**: trong drawer component thêm `const lead = useLeadCheck();` + `const [leadTouched, setLeadTouched] = useState(false);`. Reset `setLeadTouched(false)` mỗi lần vào edit (trong `seedDraft` caller, cạnh `setEditing(true)`) và `lead.resetLeadCheck()`.
- Edit phone onBlur `:2189-2201`: sau normalize, nếu `NEW_CHECK_SOURCES.has(draft.leadSource)` → `lead.runCheck(crmPhoneFormat(draft.phone, findCountry(draft.country)), draft.uid); setLeadTouched(true);`
- Edit source onChange: vào New → `runCheck` + `setLeadTouched(true)`; ra non-New → `lead.resetLeadCheck(); setLeadTouched(true);` (đánh dấu để clear).

**Bước 3 — render `LeadCheckBlock`** trong edit-grid (sau field Nguồn KH edit), guard `NEW_CHECK_SOURCES.has(draft.leadSource)`. `onSdtGocBlur={(v)=>{ lead.runCheckSdtGoc(v); setLeadTouched(true); }}`, `onReasonChange={(v)=>{ lead.setReason(v); setLeadTouched(true); }}`, `onSelectLead={(id)=>{ lead.selectLead(id); setLeadTouched(true); }}`.

**Bước 4 — save handler `:1955-1994`**: tính `leadPatch` CHỈ khi `leadTouched`; drawer tự biết source cũ (`request.leadSource`) và mới (`draft.leadSource`):
```ts
const wasNew = NEW_CHECK_SOURCES.has(request.leadSource ?? "");
const isNew  = NEW_CHECK_SOURCES.has(draft.leadSource ?? "");
let leadPatch: LeadPatchSnake | undefined;
if (leadTouched) {
  leadPatch = isNew
    ? lead.buildLeadPayload()                                   // ghi kết quả tra
    : wasNew
    ? { sdt_goc: null, lead_matched: null, lead_id: null, lead_matched_by: null, ly_do_khong_ghep: null }  // New→non-New: clear
    : undefined;                                                // non-New→non-New: không đụng
}
const ok = await onUpdatePr({ ...request, /* ...field cũ... */,
  leadSource: draft.leadSource || undefined,
  leadChannel: draft.leadChannel || undefined,
  wantsInvoice: draft.wantsInvoice }, leadPatch);
```
> KHÔNG thêm field lead vào object `next` — chỉ truyền qua `leadPatch`. Nếu `!leadTouched` → `leadPatch=undefined` → BE không nhận key lead → cột giữ nguyên (chống data-loss).

**Bước 5 — `PaymentRequestsTab.tsx handleUpdatePr :245`**: nhận `leadPatch`, merge vào payload nếu có:
```ts
const handleUpdatePr = async (next: PaymentRequest, leadPatch?: LeadPatchSnake) => {
  // ...previous fetch :246, build payload :258-276 giữ nguyên...
  const payload: PatchPaymentRequestPayload = { /* ...hiện có... */ };
  if (leadPatch) Object.assign(payload, leadPatch);
  // ...endpoints.paymentRequests.update(next.id, payload) :279...
};
```
> KHÔNG cần `NEW_CHECK_SOURCES` / `wasNew` trong Tab nữa (drawer đã quyết định). Biến pre-patch trong hàm này tên `previous` (`:246`), KHÔNG phải `request` — nhưng ta không dùng nó cho lead nữa.

**Guardrail**: BE `_apply_lead_fields(is_patch=True)` + `model_fields_set` → payload thiếu key lead (leadPatch undefined) → không đụng cột. Khớp thiết kế.

**Verify**: `npx tsc -b`. E2E tay 3 case: (1) sửa PR quang_cao matched — CHỈ đổi địa chỉ → Lưu → `SELECT lead_matched,lead_id FROM payment_requests` GIỮ NGUYÊN (không về null); (2) sửa phone → badge cập nhật + ghi mới; (3) đổi source quang_cao→gia_han → Lưu → cột lead về null.

---

### G5-N1 — Seed `leads_lookup` sandbox (Claude)

Môi trường có `bq` CLI (auth cá nhân anh Minh — quyền Data Viewer trên `crm_leads`, HỢP LỆ vì đây là thao tác tay của Minh, KHÁC với ràng buộc SA của app).

**Bước 1** — viết SQL ra FILE (Write tool → `<scratchpad>/leads_seed.sql`) rồi `bq query` đọc từ stdin (tránh shell-quote hell: SQL chứa cả `'`, backtick `` ` ``, backslash — KHÔNG nhét inline vào bash). SQL = **full Phụ lục A doc Hiếu (CẢ 2 nhánh phone + note — BẮT BUỘC, doc cảnh báo #4: 1.282 khách chỉ có số trong note)** + cột `lead_id` MD5 (bảng Supabase có PK `lead_id`; `app_lookup.lead_phone_lookup` gốc không có → sinh khi seed):

```sql
-- file: leads_seed.sql
WITH src AS (
  -- Nguồn 1: cột SĐT chính thức
  SELECT
    RIGHT(REGEXP_REPLACE(l.phone, r'[^0-9]',''), 9) AS phone9,
    'phone' AS match_source, l.phone AS phone_goc, l.name, l.uid, TRIM(l.ec) AS ec,
    SAFE.PARSE_DATE('%Y-%m-%d', l.date_leads_appeared) AS lead_date,
    l.CRM_code_2 AS crm_code, l.source_name, l.status, l.status_2, l.nation
  FROM `daily-report-smai-to-openclaw.crm_leads.leads_all` l
  WHERE l.CRM_code_2 IS NOT NULL AND COALESCE(l.phone,'') != ''

  UNION ALL

  -- Nguồn 2: SĐT sale ghi tay trong note (BẮT BUỘC — không được bỏ)
  SELECT pk9, 'note', l.phone, l.name, l.uid, TRIM(l.ec),
    SAFE.PARSE_DATE('%Y-%m-%d', l.date_leads_appeared),
    l.CRM_code_2, l.source_name, l.status, l.status_2, l.nation
  FROM `daily-report-smai-to-openclaw.crm_leads.leads_all` l
  CROSS JOIN UNNEST(ARRAY_CONCAT(
    ARRAY(SELECT RIGHT(REGEXP_REPLACE(x, r'[^0-9]',''), 9)
          FROM UNNEST(REGEXP_EXTRACT_ALL(l.note, r'[0-9][0-9\.\-\(\)\+]{8,18}[0-9]')) x
          WHERE LENGTH(REGEXP_REPLACE(x, r'[^0-9]','')) BETWEEN 9 AND 15
            AND NOT REGEXP_CONTAINS(x, r'^[0-9]{1,3}(?:\.[0-9]{3})+$')),
    ARRAY(SELECT RIGHT(REGEXP_REPLACE(x, r'[^0-9]',''), 9)
          FROM UNNEST(REGEXP_EXTRACT_ALL(l.note, r'[0-9]{2,4}(?: [0-9]{2,8}){1,4}')) x
          WHERE LENGTH(REGEXP_REPLACE(x, r'[^0-9]','')) BETWEEN 9 AND 15)
  )) AS pk9
  WHERE l.CRM_code_2 IS NOT NULL AND COALESCE(l.note,'') != ''
),
dedup AS (
  SELECT * EXCEPT(rn) FROM (
    SELECT s.*, ROW_NUMBER() OVER (
      PARTITION BY phone9, COALESCE(uid,''), COALESCE(CAST(lead_date AS STRING),''), crm_code
      ORDER BY IF(match_source='phone', 1, 2)   -- ưu tiên số chính thức hơn note (đúng Phụ lục A)
    ) AS rn
    FROM src s WHERE LENGTH(phone9) = 9
  ) WHERE rn = 1
)
SELECT
  TO_HEX(MD5(CONCAT(phone9,'|',COALESCE(uid,''),'|',COALESCE(CAST(lead_date AS STRING),''),'|',COALESCE(crm_code,'')))) AS lead_id,
  phone9, match_source, phone_goc, name, uid, lead_date, crm_code, ec, status, status_2, nation, source_name
FROM dedup
```

Chạy (sandbox sample):
```bash
bq query --use_legacy_sql=false --format=csv --max_rows=1000 < "<scratchpad>/leads_seed.sql" > "<scratchpad>/leads_seed.csv"
```

**Bước 2** — nạp vào sandbox `leads_lookup` (project `pxgybyfiwywksesyogti`) qua `execute_sql` batch INSERT (đọc CSV, sinh INSERT ~200 dòng/lần, `ON CONFLICT (lead_id) DO NOTHING`). Verify:
- `SELECT count(*), count(distinct phone9) FROM leads_lookup;`
- `SELECT count(*) FROM leads_lookup WHERE match_source='note';` — **PHẢI > 0** (chứng minh nhánh note chạy — acceptance #3).
- Tìm 1 phone9 có ≥2 lead: `SELECT phone9 FROM leads_lookup GROUP BY phone9 HAVING count(*) > 1 LIMIT 1;` → dùng test multi-match.

**Guardrail doc Hiếu §12.6**: KHÔNG xuất toàn bộ bảng ra ngoài repo; file `.sql`+`.csv` nằm trong scratchpad, XÓA sau seed (`rm`), KHÔNG commit, KHÔNG upload đâu khác.

---

### G5-N2 — E2E tay sandbox (11-check doc Hiếu §5)

Chạy dev (`cd frontend && npm run dev` + backend), tạo PR test với phone từ seed. Đối chiếu **checklist nghiệm thu doc Hiếu §10** (§5 plan này). Screenshot mỗi case. Verify DB: `SELECT sdt_goc, lead_matched, lead_id, lead_matched_by, ly_do_khong_ghep, lead_check_at FROM payment_requests WHERE id=...` sau tạo, và `so_doanh_thu` sau kích hoạt B3.

---

### G5-N3 — Prod (anh Minh)

1. **Migration prod** — chạy `backend/migrations/2026-08-18-lead-phone-match.sql` trên Supabase prod (project prod `jozc...`). Cột nullable → an toàn.
2. **Seed prod full** — chạy SQL G5-N1 (GIỮ nguyên cả 2 nhánh phone+note) với `--max_rows=100000` (full ~67k dòng) → CSV → import Supabase Dashboard prod (Table Editor → `leads_lookup` → Import CSV; cột khớp thứ tự, `synced_at` để trống → default now()). Verify count ~67.727, distinct phone9 ~64.349, `match_source='note'` ~1.423 (khớp Phụ lục A/B doc Hiếu).
   - **Guardrail PII §12.6 (QUAN TRỌNG — file này chứa full phone_goc + name của 67k khách)**: CSV ghi ra thư mục tạm NGOÀI repo (VD `%TEMP%`), **XÓA ngay sau khi import Supabase thành công**, KHÔNG commit, KHÔNG gửi qua chat/upload đâu khác. Đây là export PII đậm đặc nhất — xử lý như dữ liệu nhạy cảm.
3. **Deploy** — merge main + push (push main bị classifier chặn → Claude đưa lệnh, Minh chạy):
```bash
git add -A && git commit -m "feat(lead-match): đối soát GMV↔Lead — bắt SĐT gốc/lý do đơn New" && git push origin main
```
Vercel (FE) + Render (BE) auto-deploy. Verify prod: tạo PR quang_cao số có/không trong lookup.
4. **Báo anh Hiếu**: cột `sdt_goc`/`lead_matched`... đã lưu ở `payment_requests` + `so_doanh_thu`; chờ dataset `app_write` + SA để bật ghi ngược (§9).

---

## 5. Acceptance — 11-check doc Hiếu §10 (áp cho G5-N2)

| # | Tình huống | Kết quả đúng | Map |
|---|---|---|---|
| 1 | Số có đúng 1 lead | Box xanh, đủ tên/ngày/kênh/status | LeadCheckBlock matched |
| 2 | Số có nhiều lead | Radio, mặc định dòng đầu, đổi được | matched many |
| 3 | Số chỉ trong ghi chú (`match_source='note'`) | Vẫn khớp | seed có nguồn note (full seed) |
| 4 | Số không có trong kho | Box vàng, khóa nút Lưu | status none + leadGateOk |
| 5 | Box vàng, chưa nhập, bấm Lưu | Nút disabled (gate) | leadGateOk=false |
| 6 | `+84 912 345 678` vs `0912345678` | Cùng kết quả | _normalize_phone9 |
| 7 | Số 8 chữ số | Không gọi API | runCheck digits<9 |
| 8 | Lead ngày > ngày đơn | Không hiện | filter lead_date<=od |
| 9 | Đổi Nguồn KH → Gia hạn | Khối biến mất + xóa kết quả | resetLeadCheck |
| 10 | Lưu đơn không khớp | (ghi ngược `app_write`) — **HÔM NAY: lưu `payment_requests` 6 field** | §9 defer write-back |
| 11 | SĐT trong log ứng dụng | KHÔNG có | guardrail §6 |

> Check #10 phần ghi `app_write` là §9 (chặn Hiếu). Hôm nay verify data ở `payment_requests`/`so_doanh_thu`.

---

## 6. Guardrail bảo mật (doc Hiếu — GIỮ NGUYÊN VĂN, không vi phạm)

- "Không sửa, không tạo, không xoá bất cứ thứ gì trong dataset `crm_leads`" — app query `leads_lookup` (Supabase), KHÔNG query `crm_leads`. Seed đọc `crm_leads` bằng **quyền cá nhân Minh** (thao tác tay, không phải app SA) — hợp lệ.
- "Không ghi số điện thoại vào log ứng dụng" — KHÔNG `print`/`console.log` phone trong leads_routes / useLeadCheck / LeadCheckBlock.
- "Không cache kết quả quá 1 giờ" — leads_routes không cache Ở TẦNG API. ⚠️ **NHƯNG bảng `leads_lookup` seed tay chưa có refresh tự động** (job auto = §9): lead marketing MỚI về sau lần seed sẽ đọc ra NOT_FOUND cho tới lần re-seed — đúng failure mode guardrail #8 muốn tránh (chỉ đổi nguyên nhân: thiếu job sync thay vì cache app). **Giảm thiểu tạm**: anh Minh **re-seed tay 1 lần/ngày** (chạy lại G5-N1/N3 SQL) tới khi job auto 1h/lần lên (§9). Ghi cam kết này vào lịch.
- "Mã lý do phải cố định, không đổi tên" — `TU_TIM_DEN / NGUOI_QUEN_GT / KHACH_CU_MUA_LAI / SO_KHAC_KHONG_NHO / KHAC` (đã đúng ở `leadSource.ts` + BE `_LY_DO_CODES`).
- "Thứ tự ORDER BY không được đổi" — `_sort_leads` khớp gmv_new §7.
- "Không cấp/không yêu cầu Editor/Owner/bigquery.admin/dataEditor" — không đụng (app chưa có SA; seed dùng Data Viewer cá nhân).

---

## 7. Tự chấm 5 tiêu chí

| # | Tiêu chí | Đánh giá |
|---|---|---|
| 1 | **Triệt để** | Fix root cause (model_fields_set thay None-check); xử đủ Create+view (+edit nếu kịp); seed data thật. Write-back defer là **đúng ranh giới** (chặn ngoài), không phải workaround. |
| 2 | **Không lỗi con** | Bug PATCH clearing được fix + test riêng; dọn dead code; fail-open API; reset-on-open chống state kẹt; conditional leadPatch chống re-stamp; extract seedDraft khử trùng lặp. |
| 3 | **Không tăng hạ tầng** | Query bảng Supabase có sẵn (index phone9); không thêm service/cron hôm nay (job auto là §9). $0. |
| 4 | **Tối ưu token** | Tái dùng `useLeadCheck`/`phoneUtils`/`mock_supabase`; 1 component `LeadCheckBlock` chung modal+drawer; test chỉ cho logic mới; gom commit theo milestone. |
| 5 | **Bền vững qua compact** | Mỗi task có path:line + code nguyên văn + verify + expected + guardrail; ground-truth verbatim ở §4; không tham chiếu "như đã bàn". |

---

## 8. Rollback

- FE/BE: revert commit — field nullable, không breaking.
- Migration: cột nullable, `leads_lookup` bảng độc lập — drop bất kỳ lúc nào không ảnh hưởng.
- Fail-open: `leads_lookup` rỗng/cũ → app chạy như trước (không cảnh báo) → zero rủi ro nghiệp vụ.

---

## 9. Defer — chặn ngoài anh Hiếu (KHÔNG ship hôm nay)

| Hạng mục | Chặn bởi | Khi mở |
|---|---|---|
| API 2 ghi ngược `app_write.lead_phone_manual` (doc Hiếu §8) | Hiếu tạo dataset `app_write` + SA `app-lead-match@...` + custom role `appLeadPhoneWriter` | Thêm route POST ghi BQ; hoặc worker đọc `payment_requests` chưa-sync → INSERT batch |
| Job auto sync BQ→Supabase 1h/lần | SA Data Viewer trên `app_lookup` (hoặc `crm_leads` interim) | Đặt trong `bq-sync/` (tái dùng infra Cloud Function + Scheduler, còn 2/3 job free) |
| Sửa view `gmv_new` dùng `sdt_goc` | — | Việc anh Hiếu, sau khi cột chảy lên BQ |
| 6 cột `so_doanh_thu` lên BQ | Nếu bq-sync đã cutover: thêm vào `SCHEMAS["so_doanh_thu"]`; chưa: Fivetran QUERY_BASED tự nhận | Điều phối với `PLAN_MIGRATE_FIVETRAN_TO_BQSYNC_2026-08-16.md` |
| Backfill 175 đơn New cũ | — | Plan riêng Phase 4 |

---

## 10. Self-review đối kháng (đã chạy 18/8 trước khi trình duyệt)

Plan v1 đã qua 3 critic song song (executability / logic-correctness Opus / doc-Hiếu compliance) — mỗi critic mở file thật kiểm chứng. Anchor file:line xác nhận chính xác (~25 citation khớp byte-for-byte). Đã sửa các lỗi tìm được vào bản này:

| # | Lỗi (v1) | Mức | Đã sửa ở |
|---|---|---|---|
| 1 | Test G1-T3 assert SAI thứ tự sort (`['d','c','a','b']`); code ĐÚNG theo §7 | Blocker | G1-T3 → `['d','a','c','b']` + cảnh báo "sửa test không sửa code" |
| 2 | Seed SQL rớt nhánh note (1.282 khách chỉ có số trong note) | Blocker | G5-N1 → full Phụ lục A 2 nhánh + dedup `IF(match_source='phone',1,2)` |
| 3 | Drawer edit data-loss: sửa PR matched → ghi đè lead về null | Major | G4-T2 redesign: `leadTouched` guard + `onUpdatePr` arg 2 |
| 4 | G4 dùng biến `request` không tồn tại (là `previous`) | Major | G4-T2 redesign (drawer tự tính, Tab không cần) |
| 5 | Test `waitFor` import thừa → tsc TS6133 | Major | G2-T3 bỏ import |
| 6 | Submit gate cho idle/loading lọt → PR New lưu chưa tra | Major | G2-T2 bước 6 siết gate + 6b chống kẹt |
| 7 | Seed prod PII không có lệnh xóa/no-commit | Major | G5-N3 bước 2 thêm guardrail §12.6 |
| 8 | uid-fallback lệch gmv_new (app xanh, ROI đỏ) | Minor | G1-T2 Fix B: bỏ uid-fallback |
| 9 | `sdt_goc` lưu format "84-..." | Minor | G2-T2: lưu số sale gõ, BE tự chuẩn hoá |
| 10 | Staleness: seed tay, lead mới → NOT_FOUND | Minor | §6 caveat + cam kết re-seed/ngày |

Không lỗi nào còn mở. Anchor + guardrail xác nhận: no crm_leads mutation, no phone in log, ORDER BY §7 nguyên văn, mã ly_do cố định, sync_ledger tay/hoan insert-once giữ nguyên, UID no-silent-overwrite tôn trọng, ranh giới ship/defer trung thực (không gì ship hôm nay phụ thuộc `app_write`/SA chưa có).
```
