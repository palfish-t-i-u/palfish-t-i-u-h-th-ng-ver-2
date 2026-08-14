# Ẩn đơn tín dụng khỏi tab Kích hoạt tới khi ghép giao dịch — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đơn tín dụng (có lần TT quẹt thẻ) chỉ hiện trên tab "Chờ điền Order ID" (B3 Kích hoạt) sau khi **mọi lần quẹt thẻ đã ghép giao dịch**; trước đó ẩn hẳn khỏi mọi tab/đếm của ActivationTab.

**Architecture:** BE tính 1 cờ suy ra per-AR `credit_settlement_pending` trên `active_requests`: list endpoint tính batch (`payment_lines` method∈{card,installment} → `gateway_transactions` match_status='matched'), MỌI endpoint trả 1 AR (create/append/patch/order-id/issue-invoice/detail) tính live qua wrapper `_serialize_ar_with_hold` — nếu không, FE merge response mặc định `false` sẽ un-hide đơn vừa tạo/sửa. FE map cờ vào `ActiveRequest.creditSettlementPending` rồi **lọc bỏ hẳn** các AR pending ở nguồn `rows` của ActivationTab → biến mất khỏi cả 3 tab, badge, KPI. DingTalk KHÔNG đổi (vẫn bắn lúc báo đơn).

**Tech Stack:** Python/FastAPI + Supabase (BE), React 19 + TS + Vite (FE), pytest (BE test), Vitest (FE test).

## Bối cảnh nghiệp vụ (nguồn feedback 14/08)

Chị Sương Mai/Thu Hiền: đơn tín dụng quẹt thẻ hôm nay, **tiền chưa về** nhưng đã xuất hiện ở "chỗ nộp đơn" (tab Tạo gói học = tab "Chờ điền Order ID"). Kế toán không soi bill quẹt thì tưởng đã có tiền → nộp đơn CRM nhầm. Quyết định (phương án A, ẩn hẳn): đơn vào **backlog**, chỉ hiện khi kế toán ghép được giao dịch quẹt thẻ.

## Quy tắc gate (chốt)

Một AR bị **ẩn** khi PR liên kết (`active_requests.pr_id`) có **≥1** `payment_lines` với `method ∈ {"card","installment"}` mà **KHÔNG** có `gateway_transactions` nào `match_status='matched'` trỏ vào (`payment_line_id`).

- Mọi lần quẹt thẻ đã matched → hiện bình thường.
- PR không có lần quẹt thẻ nào (thuần QR/CK/cash) → **không đụng**, hiện ngay.
- Lần TT khác loại (qr/cash) chưa ghép → KHÔNG chặn.
- AR không có `pr_id` → coi như không tín dụng → hiện.

## Ca biên

| Đơn (PR) | Kết quả |
|---|---|
| 1 lần card, chưa matched | ẩn |
| 1 lần card, matched | hiện |
| 2 lần card, 1 matched | ẩn (còn 1 chưa) |
| card + qr, card chưa matched | ẩn (qr không cứu) |
| card + qr, card matched | hiện (qr matched hay chưa kệ) |
| thuần qr/cash | hiện (không đụng) |
| không có payment_lines | hiện |
| AR không pr_id | hiện |

## File Structure

- `backend/activation_routes.py` — thêm helper thuần `_is_credit_pending` + batch `_credit_hold_map`; thêm tham số `credit_settlement_pending` cho `_serialize_ar`; thêm wrapper `_serialize_ar_with_hold`; wire batch vào list + convert MỌI call site đơn-AR sang wrapper.
- `backend/tests/test_activation_credit_hold.py` (mới) — unit cờ + integration qua TestClient.
- `frontend/src/types/paymentRequest.ts` — thêm field `creditSettlementPending` vào `ActiveRequest`, `credit_settlement_pending` vào `ActiveRequestApiRow`, map trong `fromApiActiveRequest`... (mapper ở `paymentRequestUtils.ts`).
- `frontend/src/components/payment-request/paymentRequestUtils.ts` — map cờ trong `fromApiActiveRequest`.
- `frontend/src/components/activation/activationFlatList.ts` — thêm helper thuần `visibleActiveRequests`.
- `frontend/src/components/activation/activationFlatList.test.ts` — test helper.
- `frontend/src/components/ActivationTab.tsx:2138` — lọc `visibleActiveRequests` trước `enrichActiveRequest`.

**Traps đã đọc (docs/learnings):**
- `egress-visibility-gate-before-slim-payload.md` → dùng query **batch**, không N+1; đây là compute BE nhẹ (2 query batch có index FK), không tăng tải đáng kể.
- `2026-08-08-gateway-fee-doubled-multi-con.md` → "dòng thẻ/quẹt/trả góp" = `method ∈ {card,installment}`; matched sống ở `gateway_transactions.match_status='matched'` trỏ `payment_line_id` — đúng nguồn ta gate.

---

### Task 1: BE — helper thuần + batch map trạng thái ghép thẻ

**Files:**
- Modify: `backend/activation_routes.py` (chèn sau `_tien_ve_bounds`, ~line 440, trước `def _serialize_ar`)
- Test: `backend/tests/test_activation_credit_hold.py` (create)

- [ ] **Step 1: Viết test thất bại (pure + batch qua FakeSB)**

Create `backend/tests/test_activation_credit_hold.py`:

```python
"""Đơn tín dụng: ẩn khỏi tab Kích hoạt tới khi mọi lần quẹt thẻ đã ghép giao dịch.

Gate BE: active_requests.pr_id → payment_lines(method in card/installment)
         → gateway_transactions(match_status='matched', payment_line_id).
"""
from __future__ import annotations

import os
import sys
from unittest.mock import MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import activation_routes  # noqa: E402


# ---------- pure function ----------

def test_is_credit_pending_no_card_lines_false():
    assert activation_routes._is_credit_pending([], {"x"}) is False


def test_is_credit_pending_all_matched_false():
    assert activation_routes._is_credit_pending(["L1", "L2"], {"L1", "L2"}) is False


def test_is_credit_pending_some_unmatched_true():
    assert activation_routes._is_credit_pending(["L1", "L2"], {"L1"}) is True


def test_is_credit_pending_none_matched_true():
    assert activation_routes._is_credit_pending(["L1"], set()) is True


# ---------- batch map + endpoint via FakeSB ----------

class Query:
    def __init__(self, rows):
        self.rows = rows
        self.eqs = []
        self.ins = []
        self._limit = None

    def select(self, *_a, **_k):
        return self

    def order(self, *_a, **_k):
        return self

    def limit(self, v):
        self._limit = v
        return self

    def eq(self, k, v):
        self.eqs.append((k, v))
        return self

    def in_(self, k, vals):
        self.ins.append((k, set(str(v) for v in vals)))
        return self

    def ilike(self, *_a, **_k):
        # list_active_requests dùng ilike khi có ?search= — no-op (test không lọc search).
        return self

    def execute(self):
        m = list(self.rows)
        for k, v in self.eqs:
            m = [r for r in m if str(r.get(k, "")) == str(v)]
        for k, vals in self.ins:
            m = [r for r in m if str(r.get(k)) in vals]
        if self._limit is not None:
            m = m[: self._limit]
        return MagicMock(data=m)


class FakeSB:
    def __init__(self):
        self.tables = {
            "active_requests": [
                _ar("AR-CARD", "PR-CARD"),      # card chưa matched → pending
                _ar("AR-DONE", "PR-DONE"),      # card đã matched → không pending
                _ar("AR-QR", "PR-QR"),          # thuần qr → không pending
                _ar("AR-NONE", None),           # không pr → không pending
            ],
            "payment_requests": [
                {"id": "PR-CARD", "name": "A", "target": 1, "received": 1},
                {"id": "PR-DONE", "name": "B", "target": 1, "received": 1},
                {"id": "PR-QR", "name": "C", "target": 1, "received": 1},
            ],
            "payment_lines": [
                {"id": "L-CARD", "payment_request_id": "PR-CARD", "method": "card"},
                {"id": "L-DONE", "payment_request_id": "PR-DONE", "method": "installment"},
                {"id": "L-QR", "payment_request_id": "PR-QR", "method": "qr"},
            ],
            "gateway_transactions": [
                {"payment_line_id": "L-DONE", "match_status": "matched"},
                {"payment_line_id": "L-CARD", "match_status": "pending"},
            ],
        }

    def table(self, name):
        return Query(self.tables.get(name, []))


def _ar(ar_id, pr_id):
    return {
        "id": ar_id,
        "pr_id": pr_id,
        "customer_name": "KH",
        "uids_data": [{"uid": "u1", "phone": "0", "country": "VN",
                       "courses": [{"code": "PF-1", "name": "Goi", "amount": 1, "order_id": ""}]}],
        "status": "pending_order",
        "created_at": "2026-08-14T10:00:00+00:00",
    }


ACTOR = MagicMock(email="ops@test.com", role="system")


def _flag_by_id(payload):
    return {row["id"]: row.get("credit_settlement_pending") for row in payload}


def test_credit_hold_map_direct():
    sb = FakeSB()
    m = activation_routes._credit_hold_map(sb, ["PR-CARD", "PR-DONE", "PR-QR"])
    assert m.get("PR-CARD") is True
    assert "PR-DONE" not in m   # matched → không pending
    assert "PR-QR" not in m     # không phải card → vắng mặt


def test_list_endpoint_sets_flag_per_ar():
    sb = FakeSB()
    app = FastAPI()
    activation_routes.register_activation_routes(app, lambda: sb)
    client = TestClient(app, raise_server_exceptions=False)

    with patch("activation_routes.resolve_actor", return_value=ACTOR):
        resp = client.get("/api/v1/active-requests")

    assert resp.status_code == 200
    flags = _flag_by_id(resp.json())
    assert flags["AR-CARD"] is True     # ẩn
    assert flags["AR-DONE"] is False    # hiện
    assert flags["AR-QR"] is False      # hiện
    assert flags["AR-NONE"] is False    # hiện
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `cd backend && python -m pytest tests/test_activation_credit_hold.py -v`
Expected: FAIL — `AttributeError: module 'activation_routes' has no attribute '_is_credit_pending'`.

- [ ] **Step 3: Cài helper thuần + batch map**

Trong `backend/activation_routes.py`, chèn ngay sau hàm `_tien_ve_bounds` (kết thúc ~line 440), TRƯỚC `def _serialize_ar`:

```python
# Loại lần TT quẹt thẻ tín dụng — đồng bộ gateway_routes.py:512 (candidates match cổng).
CREDIT_METHODS = ("card", "installment")


def _is_credit_pending(credit_line_ids: list[str], matched_line_ids: set[str]) -> bool:
    """PR có đơn tín dụng CHỜ khi tồn tại ≥1 lần quẹt thẻ chưa ghép giao dịch.

    Không có lần quẹt thẻ nào → False (không phải đơn tín dụng, không chờ).
    """
    if not credit_line_ids:
        return False
    return any(lid not in matched_line_ids for lid in credit_line_ids)


def _credit_hold_map(sb, pr_ids: list[str]) -> dict[str, bool]:
    """Map pr_id → True nếu còn lần TT quẹt thẻ (card/installment) CHƯA matched.

    Đơn tín dụng bị ẩn khỏi tab Kích hoạt tới khi mọi lần quẹt thẻ đã ghép
    (`gateway_transactions.match_status='matched'`, trỏ `payment_line_id`).
    PR không có lần quẹt thẻ → VẮNG MẶT trong map (coi như không chờ → hiện).
    Batch, KHÔNG N+1 (mirror _tien_ve_map).
    """
    ids = [str(p) for p in pr_ids if p]
    if not ids:
        return {}
    CHUNK = 150

    # 1) Lần TT quẹt thẻ của các PR.
    credit_lines_by_pr: dict[str, list[str]] = {}
    all_line_ids: list[str] = []
    for i in range(0, len(ids), CHUNK):
        try:
            res = (
                sb.table("payment_lines")
                .select("id, payment_request_id")
                .in_("payment_request_id", ids[i : i + CHUNK])
                .in_("method", list(CREDIT_METHODS))
                .execute()
            )
        except Exception:
            continue
        for r in (res.data or []):
            lid = str(r.get("id") or "")
            prid = str(r.get("payment_request_id") or "")
            if not lid or not prid:
                continue
            credit_lines_by_pr.setdefault(prid, []).append(lid)
            all_line_ids.append(lid)
    if not all_line_ids:
        return {}

    # 2) Lần TT quẹt thẻ nào đã matched.
    matched: set[str] = set()
    for i in range(0, len(all_line_ids), CHUNK):
        try:
            res = (
                sb.table("gateway_transactions")
                .select("payment_line_id")
                .in_("payment_line_id", all_line_ids[i : i + CHUNK])
                .eq("match_status", "matched")
                .execute()
            )
        except Exception:
            continue
        for r in (res.data or []):
            plid = str(r.get("payment_line_id") or "")
            if plid:
                matched.add(plid)

    # 3) PR nào còn lần quẹt thẻ chưa matched → pending.
    return {
        prid: True
        for prid, line_ids in credit_lines_by_pr.items()
        if _is_credit_pending(line_ids, matched)
    }
```

- [ ] **Step 4: Chạy lại 6 test pure + `_credit_hold_map` direct (endpoint test vẫn fail vì chưa wire serialize)**

Run: `cd backend && python -m pytest tests/test_activation_credit_hold.py -v -k "not endpoint"`
Expected: 5 PASS (`_is_credit_pending` × 4 + `_credit_hold_map` direct). `test_list_endpoint_sets_flag_per_ar` để Task 2.

- [ ] **Step 5: Commit**

```bash
git add backend/activation_routes.py backend/tests/test_activation_credit_hold.py
git commit -m "feat(activation): helper _credit_hold_map — PR còn lần quẹt thẻ chưa ghép"
```

---

### Task 2: BE — wire cờ vào `_serialize_ar` (list batch + wrapper cho MỌI endpoint đơn-AR)

> **QUAN TRỌNG — vì sao phải đụng hết call site:** `grep -n "_serialize_ar(" backend/activation_routes.py` ra **15 dòng**: 1 dòng `def` (~443), 1 call batch trong `list_active_requests` (~1840, trả nhiều AR), và **13 call site trả 1 AR** (create / create-from-form / append / patch AR / patch course order-id / issue-invoice / credit-referral / detail…). 13 call site đơn-AR trả **1 AR** về FE, và FE **merge thẳng vào state** `activeRequests` (`setActiveRequests((prev) => prev.map(...))` hoặc `[ar, ...prev]` — xem `PaymentFlowContext.tsx:428,453,492,506,536,554,621,644,684,698`). Nếu các nơi này trả `credit_settlement_pending` mặc định `false`, đơn tín dụng **vừa tạo/sửa sẽ hiện lại ngay** (un-hide) tới lần refetch list kế tiếp — hỏng "ẩn hẳn", nặng nhất là ca **create** (đơn tín dụng mới báo hiện tức thì). → Bọc 1 wrapper tính cờ live, thay cả 13 call site đơn-AR.

**Files:**
- Modify: `backend/activation_routes.py` — `_serialize_ar` def (~443), thêm `_serialize_ar_with_hold` (sau `_serialize_ar`, ~504), `list_active_requests` (~1832-1847), và **tất cả call site đơn-AR** của `_serialize_ar`.
- Test: `backend/tests/test_activation_credit_hold.py` (đã có `test_list_endpoint_sets_flag_per_ar`)

- [ ] **Step 1: Thêm tham số + field vào `_serialize_ar`**

Sửa chữ ký `_serialize_ar` (line 443-448) thêm tham số keyword mặc định `False`:

```python
def _serialize_ar(
    row: dict[str, Any],
    pr: dict[str, Any] | None = None,
    sale_name_map: dict[str, str] | None = None,
    tien_ve: tuple[str | None, str | None] | None = None,
    credit_settlement_pending: bool = False,
) -> dict[str, Any]:
```

Trong dict `out` (sau dòng `"hold_note": row.get("hold_note") or None,` ~line 483) thêm 1 key — LUÔN có mặt để FE map ổn định:

```python
        "hold_note": row.get("hold_note") or None,
        "credit_settlement_pending": bool(credit_settlement_pending),
    }
```

- [ ] **Step 2: Thêm wrapper `_serialize_ar_with_hold` (tính cờ live cho 1 AR)**

Ngay SAU khi `_serialize_ar` kết thúc (`return out`, ~line 504), TRƯỚC `def _course_order_id` (~line 507), chèn:

```python
def _serialize_ar_with_hold(sb, row: dict[str, Any], *args, **kwargs) -> dict[str, Any]:
    """Serialize 1 AR kèm cờ credit_settlement_pending tính LIVE (single-AR).

    Dùng cho MỌI endpoint trả về 1 AR (create/append/patch/order-id/issue-invoice/
    detail…) — nếu không, cờ mặc định False sẽ un-hide đơn tín dụng khi FE merge
    response vào state. `list_active_requests` KHÔNG dùng hàm này (đã batch riêng).
    Chi phí: 2 query nhỏ có index/mutation → không đáng kể (mutation tần suất thấp).
    """
    pr_id = str(row.get("pr_id") or "")
    kwargs.setdefault(
        "credit_settlement_pending",
        _credit_hold_map(sb, [pr_id]).get(pr_id, False) if pr_id else False,
    )
    return _serialize_ar(row, *args, **kwargs)
```

- [ ] **Step 3: Wire batch vào `list_active_requests`**

Sửa khối line 1832-1847. Tách `pr_ids` ra biến, tính `hold_map` batch, truyền per AR (đây là nơi DUY NHẤT vẫn gọi `_serialize_ar` trực tiếp):

```python
        rows = res.data or []
        pr_ids = list({str(r.get("pr_id")) for r in rows if r.get("pr_id")})
        pr_map = _fetch_prs_by_ids(sb, pr_ids)
        from payment_request_routes import _sale_name_map
        try:
            snm = _sale_name_map(sb)
        except Exception:
            snm = {}
        tv_map = _tien_ve_map(sb, [str(r.get("id")) for r in rows if r.get("id")])
        hold_map = _credit_hold_map(sb, pr_ids)
        return [
            _serialize_ar(
                r,
                pr_map.get(str(r.get("pr_id") or "")),
                snm,
                tien_ve=tv_map.get(str(r.get("id") or ""), (None, None)),
                credit_settlement_pending=hold_map.get(str(r.get("pr_id") or ""), False),
            )
            for r in rows
        ]
```

- [ ] **Step 4: Convert MỌI call site đơn-AR còn lại sang wrapper**

Liệt kê call site hiện tại (`grep -n "_serialize_ar(" backend/activation_routes.py` — bỏ qua dòng `def` ở 443 và khối `list_active_requests` vừa sửa ở Step 3):

- `~1026`: `"active_request": _serialize_ar(merged_row, pr),`
- `~1051`: `return {"active_request": _serialize_ar(merged_row, pr), "course_code": course_code}`
- `~1867`: `return _serialize_ar(row, pr, tien_ve=_tien_ve_bounds(sb, ar_id))` (get_active_request)
- `~2039`: `current_ar = _serialize_ar(` (multi-line)
- `~2084`: `return _serialize_ar(merged, pr_map.get(str(merged.get("pr_id") or "")), tien_ve=_tien_ve_bounds(sb, ar_id))`
- `~2110`: `return _serialize_ar(merged, pr_map.get(str(merged.get("pr_id") or "")), tien_ve=_tien_ve_bounds(sb, ar_id))`
- `~2188`: `return _serialize_ar(upd.data[0], pr_map.get(str(upd.data[0].get("pr_id") or "")))`
- `~2219`: `return _serialize_ar(saved, pr)`
- `~2253`: `return _serialize_ar(saved, pr)`
- `~2334`: `return _serialize_ar(updated, pr)`
- `~2392`: `return _serialize_ar(row, pr_map.get(str(row.get("pr_id") or "")),` (multi-line)
- `~2407`: `return _serialize_ar(row, pr_map.get(str(row.get("pr_id") or "")),` (multi-line)
- `~2469`: `return _serialize_ar(merged_row, pr)`

**Quy tắc cơ học:** mỗi call ở trên đổi `_serialize_ar(` → `_serialize_ar_with_hold(sb, ` — chèn `sb` làm tham số ĐẦU, giữ nguyên toàn bộ tham số còn lại. Ví dụ:
`_serialize_ar(saved, pr)` → `_serialize_ar_with_hold(sb, saved, pr)`
`_serialize_ar(merged, pr_map.get(...), tien_ve=_tien_ve_bounds(sb, ar_id))` → `_serialize_ar_with_hold(sb, merged, pr_map.get(...), tien_ve=_tien_ve_bounds(sb, ar_id))`

`sb` đã có sẵn trong scope ở CẢ 13 call site (đã xác minh): các route dùng `sb = supabase_factory()`; hai helper `_issue_course_invoice_atomic(sb, …)` (chứa 1026) và `_revoke_course_invoice_atomic(sb, …)` (chứa 1051) nhận `sb` làm tham số đầu. → mọi call `_serialize_ar_with_hold(sb, …)` hợp lệ.

- [ ] **Step 5: Verify chuyển đổi — chỉ còn 3 chỗ gọi `_serialize_ar(` trực tiếp**

Run: `grep -n "_serialize_ar(" backend/activation_routes.py`
Expected: đúng **3 dòng** khớp `_serialize_ar(` (lưu ý grep KHÔNG khớp `_serialize_ar_with_hold(` vì có `_with_hold` chen giữa):
1. `def _serialize_ar(` — định nghĩa (~443)
2. `return _serialize_ar(row, *args, **kwargs)` — bên TRONG wrapper `_serialize_ar_with_hold` (Step 2), đây là chỗ ĐÚNG phải giữ nguyên
3. call trong `list_active_requests` (Step 3)

Nếu thấy >3 → còn call site đơn-AR chưa convert. Nếu <3 → convert nhầm 1 trong 3 dòng trên. Chạy thêm `grep -c "_serialize_ar_with_hold(" backend/activation_routes.py` → phải ra **14** (1 def wrapper + 13 call site đã convert).

- [ ] **Step 6: Chạy test — endpoint PASS + không regression**

Run: `cd backend && python -m pytest tests/test_activation_credit_hold.py tests/test_ar_sale_name_enrichment.py tests/test_activation_hold.py tests/test_activation_append.py -v`
Expected: tất cả PASS (`test_ar_sale_name_enrichment`/`append`/`hold` vẫn xanh vì FakeSB không có `payment_lines` → `_credit_hold_map` trả `{}` → `credit_settlement_pending=False`; các assert cũ không đụng field mới).

- [ ] **Step 7: Commit**

```bash
git add backend/activation_routes.py backend/tests/test_activation_credit_hold.py
git commit -m "feat(activation): credit_settlement_pending trên list + mọi endpoint đơn-AR"
```

---

### Task 3: FE — type + mapper cho `creditSettlementPending`

**Files:**
- Modify: `frontend/src/types/paymentRequest.ts:201-216` (interface), `:343-386` (ApiRow)
- Modify: `frontend/src/components/payment-request/paymentRequestUtils.ts:364-377` (`fromApiActiveRequest`)

- [ ] **Step 1: Thêm field vào interface `ActiveRequest`**

Trong `paymentRequest.ts`, sau `tienVeMuon?` (line 215), trước `}` (line 216):

```typescript
  /** Ngày tiền về muộn nhất (max) trong Sổ doanh thu của AR — ISO "YYYY-MM-DD". */
  tienVeMuon?: string | null;
  /** Đơn tín dụng còn lần quẹt thẻ chưa ghép giao dịch → ẩn hẳn khỏi tab Kích hoạt
   * tới khi tiền về. BE tính ở list + detail endpoint (batch gateway match). */
  creditSettlementPending?: boolean;
}
```

- [ ] **Step 2: Thêm field vào `ActiveRequestApiRow`**

Trong `paymentRequest.ts`, sau `tien_ve_muon?` (line 384):

```typescript
  tien_ve_som?: string | null;
  tien_ve_muon?: string | null;
  credit_settlement_pending?: boolean;
  payment_request?: { name?: string; email?: string; sale_name?: string; sale_email?: string };
```

- [ ] **Step 3: Map trong `fromApiActiveRequest`**

Trong `paymentRequestUtils.ts`, sau dòng `tienVeMuon: ...` (line 377), thêm — mặc định `false` để BE cũ / thiếu field = KHÔNG ẩn (an toàn, không regression):

```typescript
    tienVeMuon: "tien_ve_muon" in raw ? (raw.tien_ve_muon ?? null) : undefined,
    creditSettlementPending: raw.credit_settlement_pending ?? false,
```

- [ ] **Step 4: Typecheck**

Run: `cd frontend && npx tsc -b`
Expected: PASS (0 errors).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types/paymentRequest.ts frontend/src/components/payment-request/paymentRequestUtils.ts
git commit -m "feat(activation): map creditSettlementPending vào ActiveRequest"
```

---

### Task 4: FE — ẩn hẳn AR pending khỏi ActivationTab

**Files:**
- Modify: `frontend/src/components/activation/activationFlatList.ts:1-5` (import + helper mới)
- Modify: `frontend/src/components/ActivationTab.tsx:2138`
- Test: `frontend/src/components/activation/activationFlatList.test.ts`

- [ ] **Step 1: Viết test thất bại cho helper `visibleActiveRequests`**

Trong `activationFlatList.test.ts`, thêm import `visibleActiveRequests` vào dòng import (cạnh `flatCourseRows`) và thêm block test. `ar(...)` là factory sẵn có trong file test (dùng ở các block khác):

```typescript
describe("visibleActiveRequests", () => {
  it("ẩn AR có creditSettlementPending=true, giữ phần còn lại", () => {
    const pending = ar({ id: "AR-CARD" });
    (pending as { creditSettlementPending?: boolean }).creditSettlementPending = true;
    const shown = ar({ id: "AR-QR" });
    const legacy = ar({ id: "AR-OLD" }); // field undefined → hiện
    const out = visibleActiveRequests([pending, shown, legacy]);
    expect(out.map((a) => a.id)).toEqual(["AR-QR", "AR-OLD"]);
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `cd frontend && npx vitest run src/components/activation/activationFlatList.test.ts`
Expected: FAIL — `visibleActiveRequests is not exported` / not a function.

- [ ] **Step 3: Cài helper `visibleActiveRequests`**

Trong `activationFlatList.ts`, sau `courseRowMatchesTab` (line 96), thêm:

```typescript
/** Ẩn hẳn đơn tín dụng còn lần quẹt thẻ chưa ghép giao dịch (backlog chờ tiền về).
 * Áp ở NGUỒN `rows` của ActivationTab → biến mất khỏi cả 3 tab, badge, KPI. */
export function visibleActiveRequests(ars: ActiveRequest[]): ActiveRequest[] {
  return ars.filter((a) => !a.creditSettlementPending);
}
```

- [ ] **Step 4: Chạy test, xác nhận PASS**

Run: `cd frontend && npx vitest run src/components/activation/activationFlatList.test.ts`
Expected: PASS (block mới + các block cũ vẫn xanh).

- [ ] **Step 5: Áp helper ở ActivationTab (`rows`)**

Trong `ActivationTab.tsx:2138`, đổi:

```typescript
  const rows = useMemo(() => activeRequests.map(enrichActiveRequest), [activeRequests]);
```

thành:

```typescript
  const rows = useMemo(
    () => visibleActiveRequests(activeRequests).map(enrichActiveRequest),
    [activeRequests]
  );
```

Và thêm `visibleActiveRequests` vào import từ `./activation/activationFlatList` (line 32) — thêm tên vào danh sách destructure có sẵn:

```typescript
import { AR_PER_PAGE, applyCourseOrderId, countCourseTabs, courseRowMatchesSearch, courseRowMatchesTab, flatCourseRows, groupRowsByAr, isArInvoiceActionable, summarizeArInvoiceAction, visibleActiveRequests, type ArInvoiceAction, type CourseRow } from "./activation/activationFlatList";
```

- [ ] **Step 6: Typecheck + test lại**

Run: `cd frontend && npx tsc -b && npx vitest run src/components/activation/activationFlatList.test.ts`
Expected: tsc PASS, vitest PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/activation/activationFlatList.ts frontend/src/components/activation/activationFlatList.test.ts frontend/src/components/ActivationTab.tsx
git commit -m "feat(activation): ẩn hẳn đơn tín dụng chờ ghép giao dịch khỏi tab Kích hoạt"
```

---

### Task 5: Verify toàn cục + cập nhật index

**Files:**
- Modify: `MODULES.md` (nếu section Kích hoạt liệt kê danh sách test BE)

- [ ] **Step 1: BE full test**

Run: `cd backend && python -m pytest tests/test_activation_credit_hold.py tests/test_ar_sale_name_enrichment.py tests/test_activation_hold.py tests/test_gateway_routes.py -q`
Expected: all PASS.

- [ ] **Step 2: FE full typecheck + unit**

Run: `cd frontend && npx tsc -b && npm run test`
Expected: PASS.

- [ ] **Step 3: (nếu áp dụng) thêm `test_activation_credit_hold.py` vào MODULES.md**

Nếu MODULES.md liệt kê file test theo module Kích hoạt, thêm dòng `backend/tests/test_activation_credit_hold.py`. Nếu không liệt kê chi tiết test → bỏ qua.

- [ ] **Step 4: Commit (nếu có sửa MODULES.md)**

```bash
git add MODULES.md
git commit -m "docs: map test đối soát ẩn đơn tín dụng vào MODULES.md"
```

- [ ] **Step 5: Extract learning**

Sau khi xong, chạy skill `extract-approach` — bẫy đáng ghi: "gate visibility đúng lớp (ẩn ở nguồn `rows`, không rải từng consumer)" + "matched sống ở gateway_transactions không phải payment_lines".

---

## Self-Review

- **Spec coverage:** quy tắc gate → Task 1 (`_is_credit_pending`/`_credit_hold_map`); "ẩn hẳn khỏi mọi tab/đếm" → Task 4 lọc tại nguồn `rows` (feeds counts/tabCounts/courseVisible/filtered/holdArs/sumReady); "chỉ đơn tín dụng" → `CREDIT_METHODS={card,installment}`, PR khác vắng mặt trong map = không ẩn; **"không un-hide sau mutation"** → Task 2 Step 2+4 bọc `_serialize_ar_with_hold` cho MỌI endpoint trả 1 AR (create/append/patch/order-id/issue-invoice/detail), verify bằng grep Step 5 (chỉ còn def + list gọi `_serialize_ar` trực tiếp); DingTalk giữ nguyên → không có task đụng notifier. ✅
- **Un-hide gap (đã vá):** FE merge response mutation thẳng vào state `activeRequests`; nếu single-AR endpoint trả cờ default `false`, đơn tín dụng vừa create/sửa hiện lại tức thì tới lần refetch list. Wrapper tính cờ live chặn việc này. Chi phí: +2 query nhỏ có index/mutation (tần suất thấp) — trong ngưỡng tiêu chí hạ tầng. ✅
- **Placeholder scan:** không có TBD/TODO; mọi step có code/command thật. ✅
- **Type consistency:** BE key `credit_settlement_pending` (snake) ↔ FE `creditSettlementPending` (camel) map ở Task 3 Step 3; helper `visibleActiveRequests` khai báo Task 4 Step 3, dùng Task 4 Step 5 — cùng tên. `_credit_hold_map`/`_is_credit_pending` khai báo Task 1, dùng Task 2. ✅
- **Ambiguity:** "matched" = có ≥1 `gateway_transactions` `match_status='matched'` trỏ line; line không có gw txn matched = chưa ghép. Rõ. ✅

## Không làm (YAGNI)

- KHÔNG thêm tab/badge "chờ ghép tiền" trong ActivationTab (chị chốt ẩn hẳn; theo dõi ở tab đối soát thẻ mPOS/Payoo).
- KHÔNG đổi DingTalk / báo đơn.
- KHÔNG thêm cột DB / migration (cờ suy ra runtime).
- KHÔNG đụng đơn thuần QR/CK/cash.
