# Báo Đơn Bổ Sung (Lần 2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) Khách đóng thêm tiền cho bé/gói mới trên PR đã có Active Request → nút "Báo đơn & Kích hoạt" sáng lại thành **"Báo đơn bổ sung"**, mở đúng modal đẹp, xác nhận = cộng bé/gói vào AR CŨ + bắn tin DingTalk báo đơn lần 2 (chỉ bé mới) kèm bill. (2) Modal thêm **trường SĐT riêng mỗi bé** (CRM mỗi bé 1 số): đầu số combobox + đuôi số, smart-paste cắt đầu số thừa, cảnh báo sai độ dài (đỏ + rung, KHÔNG chặn), bố cục 4 dòng user chốt 18/7.

**Architecture:** KHÔNG tạo AR thứ 2 (đường multi-AR chưa từng chạy prod — 0 PR nào >1 AR). Thay vào đó: BE endpoint mới `POST /active-requests/{ar_id}/append` nhận `{uids:[...]}` (cùng shape create), merge vào `uids_data` AR hiện có (course code TIẾP SEQ, không đè), re-validate tổng tiền ≤ received, enqueue tin `activation_request_created` với `source_id` KHÁC tin đầu (outbox có UNIQUE(source_table,source_id,event_type) — dùng lại source_id cũ là tin bị nuốt im lặng). FE: điều kiện nút đổi từ "đã có AR → khoá vĩnh viễn" sang "còn tiền chưa phân bổ → sáng"; modal branch create/append; cảnh báo trong chế độ Sửa mini-card (đường câm không bắn tin).

**Tech Stack:** FastAPI + supabase-py (BE), React 19 + TS (FE), pytest + Vitest.

---

## Bối cảnh cho người không có context

- PR (Payment Request) = 1 thương vụ, nhiều lần thanh toán. Đủ 100% tiền → sale bấm nút **"Báo đơn & Kích hoạt"** ([PaymentRequestDetailDrawer.tsx:2538](../../frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx)) → mở modal chọn bé+gói → xác nhận → `POST /payment-requests/{pr_id}/active-requests` tạo Active Request (AR) + enqueue tin DingTalk "Báo đơn" cho kế toán.
- **Bug nghiệp vụ:** nút `disabled={!ready || hasActiveRequest}` — có AR rồi = khoá VĨNH VIỄN. Khách đóng thêm tiền cho bé thứ 2 → sale không báo/kích hoạt được. Đường vòng duy nhất là nút "Sửa" trên AR mini-card (thêm UID tay) — nhưng đường đó KHÔNG bắn tin DingTalk, kế toán mù.
- `active_requests.uids_data` = JSONB `[{uid, name, phone, courses:[{code:"CC-<PRdigits>-<seq>", name, amount, order_id, invoiced}]}]`. Course code sinh bởi `_assign_course_codes` seq bắt đầu 1 — **append naive sẽ ĐỤNG CODE cũ**.
- Tin DingTalk enqueue ở `_enqueue_activation_request_created_dingtalk` ([activation_routes.py:1038](../../backend/activation_routes.py)) — `source_uuid = md5(ar_id)`, outbox UNIQUE → **tin thứ 2 cùng ar_id bị drop im lặng** nếu không đổi source_id.
- `_validate_course_amounts` ([activation_routes.py:558](../../backend/activation_routes.py)) đã hỗ trợ tổng-nhiều-AR + `exclude_ar_id` — dùng lại nguyên.
- FE đã có `activeRequestAllocation(ar, pr)` ([paymentRequestUtils.ts:416](../../frontend/src/components/payment-request/paymentRequestUtils.ts)) trả `{total, received, remaining,...}` — "remaining" = tiền chưa phân bổ, chính là điều kiện nút.
- **Phone infra sẵn có:** `CountryCombo` ([CountryCombo.tsx](../../frontend/src/components/payment-request/CountryCombo.tsx)) = dropdown+search 248 nước, export `COUNTRIES`, `findCountry(code)`; mỗi country có `dial` ("+84") + `exampleLocal` ("987 654 321" — dùng làm mẫu độ dài đuôi số). BE `_normalize_uid_block` ([activation_routes.py:180](../../backend/activation_routes.py)) đã giữ `phone`+`country` per uid block → **phone KHÔNG cần đổi BE**. Modal hiện KHÔNG có ô SĐT — `buildCreateActiveRequestPayload` điền ngầm `pr.phone` cho mọi bé (sai với multi-con: CRM mỗi bé 1 số riêng).

## Guardrails (map 4 tiêu chí)

| # | Guardrail | Tiêu chí |
|---|-----------|----------|
| G1 | KHÔNG tạo AR thứ 2 — append vào AR cũ. Đường multi-AR chưa test prod, đụng hoá đơn/sổ/referral | Không lỗi con |
| G2 | Course code phải TIẾP SEQ từ max hiện có (`_max_course_seq`) — trùng code là vỡ gắn Order ID + xuất HĐ của Thu Hiền | Không lỗi con |
| G3 | Tin lần 2: `source_suffix` đổi source_id (outbox UNIQUE nuốt im lặng nếu không) + `uids_data` chỉ bé MỚI (kế toán đọc đúng phần bổ sung). KHÔNG sửa format message (format anh Hiếu duyệt 17/7 giữ nguyên, dùng lại builder) | Triệt để + quy trình |
| G4 | Validate server-side: `assert_pr_paid` + `assert_all_paid_lines_have_bill` + `_validate_course_amounts(merged, exclude_ar_id)` — không tin FE | Không lỗi con |
| G5 | `_derive_status(merged)` — gói cũ đã kích hoạt giữ nguyên flags, status tự về partial (1/2) | Không lỗi con |
| G6 | Zalo KHÔNG gọi ở append (Zalo chỉ còn tin báo tiền — event routing hiện tại; thêm sau nếu bật lại event) | Không tăng gánh |
| G7 | 0 migration, 0 bảng mới, 0 cột mới — chỉ code | Không tăng gánh |
| G8 | Test message prod phải 🧪 prefix + HỎI user trước khi bắn nhóm thật | Quy trình |
| G9 | Deploy prod cần user gõ rõ "deploy prod" | Quy trình |
| G10 | is_test PR → enqueue tự skip (gate sẵn dòng 1053) — smoke sandbox không bắn nhóm thật | Quy trình |
| G11 | **Phone smart-parse KHÔNG sửa hộ khi nghi sai**: chỉ cắt đầu số khi paste có separator (`420-...`, `+84 ...`) VÀ đầu số nằm trong COUNTRIES; chỉ bỏ 1 số "0" đầu khi sau khi bỏ khớp độ dài mẫu VÀ không còn bắt đầu bằng 0 (case "0083329127" = số 0 đầu thật → giữ nguyên); sai độ dài (lệch >1 vs exampleLocal) → cảnh báo đỏ + rung, KHÔNG chặn submit, KHÔNG tự sửa (user chốt 18/7) | Không lỗi con |
| G12 | **Chống double-submit**: modal confirm `await` server xong MỚI đóng, nút disable `arSubmitting` — bấm đúp/bấm lại sau lỗi mạng không cộng đúp bé vào AR | Không lỗi con |

**Residual chấp nhận (ghi rõ, không vá):**
- Retry sau timeout-nhưng-đã-ghi vẫn có thể đúp (G12 chặn double-click, không chặn được response-lost) — parity với mọi mutation khác trong app (Sửa/Lưu mini-card cùng kiểu read-merge-write không lock); volume 1 PR 1 sale, hiếm. Phát hiện được qua audit log `activation.append_children`.
- Enqueue tin DingTalk best-effort (never-raise, giống create): enqueue fail → append vẫn thành công, tin mất có log `[dingtalk] ... enqueue failed`. Parity hành vi create hiện tại.

---

### Task 1: BE — `_assign_course_codes` nhận `start_seq` + helper `_max_course_seq`

**Files:**
- Modify: `backend/activation_routes.py` (hàm `_assign_course_codes` dòng ~195)
- Test: `backend/tests/test_activation_append.py` (create)

- [ ] **Step 1.1: Viết failing tests** — create `backend/tests/test_activation_append.py`:

```python
"""Append bé/gói vào Active Request có sẵn (báo đơn bổ sung lần 2, 18/7)."""
import pytest

from activation_routes import _assign_course_codes, _max_course_seq


def test_assign_course_codes_default_starts_at_1():
    out = _assign_course_codes([{"uid": "U1", "courses": [{"name": "G1", "amount": 100}]}], "PR-2026-0001")
    assert out[0]["courses"][0]["code"] == "CC-20260001-001"


def test_assign_course_codes_start_seq_offset():
    out = _assign_course_codes(
        [{"uid": "U2", "courses": [{"name": "G2", "amount": 100}, {"name": "G3", "amount": 200}]}],
        "PR-2026-0001",
        start_seq=3,
    )
    codes = [c["code"] for c in out[0]["courses"]]
    assert codes == ["CC-20260001-003", "CC-20260001-004"]


def test_max_course_seq_reads_existing_codes():
    uids_data = [
        {"uid": "U1", "courses": [{"code": "CC-20260001-001"}, {"code": "CC-20260001-002"}]},
        {"uid": "U2", "courses": [{"code": "CC-20260001-005"}]},
    ]
    assert _max_course_seq(uids_data) == 5


def test_max_course_seq_ignores_malformed_and_empty():
    assert _max_course_seq([]) == 0
    assert _max_course_seq([{"uid": "U", "courses": [{"code": "JUNK"}, {"code": ""}, {}]}]) == 0
```

- [ ] **Step 1.2: Chạy để thấy fail**

Run: `cd backend && python -m pytest tests/test_activation_append.py -v`
Expected: FAIL `ImportError: cannot import name '_max_course_seq'` (và `_assign_course_codes` chưa nhận start_seq)

- [ ] **Step 1.3: Implement** — trong `backend/activation_routes.py`:

Sửa signature `_assign_course_codes` (dòng ~195): `def _assign_course_codes(uids_in: list[Any], pr_id: str, start_seq: int = 1) -> list[dict[str, Any]]:` và `seq = start_seq` (thay `seq = 1`). Docstring thêm: `start_seq dùng khi append vào AR có sẵn — tiếp seq, không đụng code cũ (G2).`

Thêm ngay TRƯỚC `_assign_course_codes`:

```python
def _max_course_seq(uids_data: list[Any]) -> int:
    """Seq lớn nhất trong các course code CC-xxx-NNN của AR — 0 nếu không parse được.

    Dùng để append tiếp seq (G2): code trùng là vỡ gắn Order ID / xuất HĐ.
    """
    max_seq = 0
    for block in uids_data or []:
        for c in (block or {}).get("courses") or []:
            code = str((c or {}).get("code") or "")
            tail = code.rsplit("-", 1)[-1]
            if tail.isdigit():
                max_seq = max(max_seq, int(tail))
    return max_seq
```

- [ ] **Step 1.4: Chạy test pass**

Run: `cd backend && python -m pytest tests/test_activation_append.py -v`
Expected: 4 PASS. Chạy thêm regression: `python -m pytest tests/ -q -k "activation or ar_created"` — không vỡ gì.

- [ ] **Step 1.5: Commit**

```bash
git add backend/activation_routes.py backend/tests/test_activation_append.py
git commit -m "feat(activation): course code tiếp seq khi append (start_seq + _max_course_seq)"
```

---

### Task 2: BE — enqueue DingTalk nhận `source_suffix` (tin lần 2 không bị outbox UNIQUE nuốt)

**Files:**
- Modify: `backend/activation_routes.py` (`_enqueue_activation_request_created_dingtalk` dòng ~1038)
- Test: `backend/tests/test_dingtalk_ar_created.py` (thêm 2 test)

- [ ] **Step 2.1: Viết failing tests** — thêm vào CUỐI class `TestEnqueueActivationRequestCreatedDingtalk` trong `backend/tests/test_dingtalk_ar_created.py` (dùng lại helpers `_build_dt_sb`, `_sample_saved_ar`, `_sample_pr` có sẵn trong file):

```python
    def test_source_suffix_changes_source_id(self):
        """Append lần 2: suffix đổi source_id — outbox UNIQUE không nuốt tin bổ sung."""
        import hashlib, uuid as uuid_mod
        captured = []
        sb = _build_dt_sb(insert_side_effect=lambda payload: captured.append(payload))
        ar = _sample_saved_ar()
        pr = _sample_pr()

        activation_routes._enqueue_activation_request_created_dingtalk(sb, ar, pr)
        activation_routes._enqueue_activation_request_created_dingtalk(
            sb, ar, pr, source_suffix=":append:CC-9508-002"
        )

        assert len(captured) == 2
        assert captured[0]["source_id"] != captured[1]["source_id"]
        ar_id = str(ar["id"])
        expect_first = str(uuid_mod.UUID(hashlib.md5(ar_id.encode()).hexdigest()))
        expect_second = str(uuid_mod.UUID(hashlib.md5(f"{ar_id}:append:CC-9508-002".encode()).hexdigest()))
        assert captured[0]["source_id"] == expect_first   # default không đổi (backward compat)
        assert captured[1]["source_id"] == expect_second

    def test_source_suffix_default_unchanged(self):
        """Không truyền suffix → source_id giữ nguyên md5(ar_id) — tin create cũ idempotent như trước."""
        import hashlib, uuid as uuid_mod
        captured = []
        sb = _build_dt_sb(insert_side_effect=lambda payload: captured.append(payload))
        ar = _sample_saved_ar()
        activation_routes._enqueue_activation_request_created_dingtalk(sb, ar, _sample_pr())
        ar_id = str(ar["id"])
        assert captured[0]["source_id"] == str(uuid_mod.UUID(hashlib.md5(ar_id.encode()).hexdigest()))
```

Lưu ý cho engineer: đọc chữ ký thật của `_build_dt_sb`/`_sample_saved_ar`/`_sample_pr` trong file test trước — nếu `insert_side_effect` nhận kiểu khác (vd exception thay callable), điều chỉnh cách capture payload theo đúng pattern các test hiện có trong class (vd `test_happy_path_raw_team_with_bill_image` capture thế nào thì mirror).

- [ ] **Step 2.2: Chạy để thấy fail**

Run: `cd backend && python -m pytest tests/test_dingtalk_ar_created.py -v -k "suffix"`
Expected: FAIL `TypeError: ... unexpected keyword argument 'source_suffix'`

- [ ] **Step 2.3: Implement** — trong `_enqueue_activation_request_created_dingtalk`:

Signature: `def _enqueue_activation_request_created_dingtalk(sb, saved_ar: dict[str, Any], pr: dict[str, Any] | None, source_suffix: str = "") -> None:`

Sửa dòng tính source_uuid (dòng ~1136):

```python
        ar_id = str(saved_ar.get("id") or "")
        # source_suffix (append lần 2): outbox UNIQUE(source_table, source_id, event_type)
        # — giữ md5(ar_id) là tin bổ sung bị drop im lặng (G3).
        source_uuid = str(uuid.UUID(hashlib.md5(f"{ar_id}{source_suffix}".encode()).hexdigest()))
```

- [ ] **Step 2.4: Chạy test pass**

Run: `cd backend && python -m pytest tests/test_dingtalk_ar_created.py -v`
Expected: PASS toàn bộ (test cũ + 2 mới).

- [ ] **Step 2.5: Commit**

```bash
git add backend/activation_routes.py backend/tests/test_dingtalk_ar_created.py
git commit -m "feat(dingtalk): source_suffix cho tin báo đơn bổ sung — né outbox UNIQUE"
```

---

### Task 3: BE — merge helper + endpoint `POST /active-requests/{ar_id}/append`

**Files:**
- Modify: `backend/activation_routes.py`
- Test: `backend/tests/test_activation_append.py`

- [ ] **Step 3.1: Viết failing tests** — thêm vào cuối `backend/tests/test_activation_append.py`:

```python
# ---- _merge_uid_blocks ----
from activation_routes import _merge_uid_blocks


def _block(uid, codes_amounts):
    return {
        "uid": uid,
        "courses": [{"code": c, "name": f"G{c[-1]}", "amount": a, "order_id": "", "invoiced": False}
                    for c, a in codes_amounts],
    }


def test_merge_new_uid_appends_block():
    existing = [_block("U1", [("CC-1-001", 100)])]
    new = [_block("U2", [("CC-1-002", 200)])]
    merged = _merge_uid_blocks(existing, new)
    assert len(merged) == 2
    assert merged[0]["uid"] == "U1" and merged[1]["uid"] == "U2"
    # existing không bị mutate object gốc
    assert len(existing[0]["courses"]) == 1


def test_merge_same_uid_extends_courses():
    existing = [_block("U1", [("CC-1-001", 100)])]
    new = [_block("U1", [("CC-1-002", 200)])]
    merged = _merge_uid_blocks(existing, new)
    assert len(merged) == 1
    assert [c["code"] for c in merged[0]["courses"]] == ["CC-1-001", "CC-1-002"]


def test_merge_preserves_existing_course_flags():
    existing = [_block("U1", [("CC-1-001", 100)])]
    existing[0]["courses"][0]["invoiced"] = True
    existing[0]["courses"][0]["order_id"] = "OD-9"
    merged = _merge_uid_blocks(existing, [_block("U1", [("CC-1-002", 200)])])
    assert merged[0]["courses"][0]["invoiced"] is True
    assert merged[0]["courses"][0]["order_id"] == "OD-9"
```

- [ ] **Step 3.2: Chạy để thấy fail**

Run: `cd backend && python -m pytest tests/test_activation_append.py -v -k "merge"`
Expected: FAIL ImportError `_merge_uid_blocks`

- [ ] **Step 3.3: Implement `_merge_uid_blocks`** — thêm vào `activation_routes.py` ngay sau `_max_course_seq`:

```python
def _merge_uid_blocks(
    existing: list[dict[str, Any]], new_blocks: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Merge bé/gói mới vào uids_data hiện có (append lần 2).

    Cùng uid → nối courses vào block cũ (giữ nguyên flags invoiced/order_id gói cũ);
    uid mới → thêm block. Deep-copy — không mutate input.
    """
    import copy

    merged = copy.deepcopy(existing or [])
    by_uid = {str(b.get("uid") or ""): b for b in merged if str(b.get("uid") or "")}
    for nb in new_blocks:
        uid = str(nb.get("uid") or "")
        target = by_uid.get(uid)
        if target is not None:
            target.setdefault("courses", []).extend(nb.get("courses") or [])
        else:
            merged.append(nb)
            if uid:
                by_uid[uid] = nb
    return merged
```

- [ ] **Step 3.4: Chạy test merge pass**

Run: `cd backend && python -m pytest tests/test_activation_append.py -v`
Expected: 7 PASS

- [ ] **Step 3.4B: Viết failing tests cho core logic** — thêm vào cuối `backend/tests/test_activation_append.py`:

```python
# ---- _append_children_core ----
from unittest.mock import MagicMock
from fastapi import HTTPException
from activation_routes import _append_children_core


def _fake_sb(ars=None):
    """Fake supabase: mọi query active_requests trả `ars` (cho validate + order-id check)."""
    sb = MagicMock()
    res = MagicMock()
    res.data = ars or []
    sb.table.return_value.select.return_value.execute.return_value = res
    sb.table.return_value.select.return_value.eq.return_value.execute.return_value = res
    return sb


def _ar_row():
    return {
        "id": "AR-2026-9508",
        "pr_id": "PR-2026-0001",
        "uids_data": [_block("UID-1", [("CC-20260001-001", 4_000_000)])],
    }


def _pr():
    return {"id": "PR-2026-0001", "target": 5_000_000, "received": 5_000_000}


def test_append_core_happy_codes_continue_and_merge():
    new_blocks, merged, status = _append_children_core(
        _fake_sb(), _ar_row(), _pr(),
        [{"uid": "UID-2", "courses": [{"name": "Gói B", "amount": 1_000_000}]}],
    )
    assert new_blocks[0]["courses"][0]["code"] == "CC-20260001-002"  # G2: tiếp seq
    assert len(merged) == 2
    assert status  # _derive_status trả string không rỗng


def test_append_core_over_budget_raises_400():
    with pytest.raises(HTTPException) as exc:
        _append_children_core(
            _fake_sb(), _ar_row(), _pr(),
            [{"uid": "UID-2", "courses": [{"name": "Gói B", "amount": 2_000_000}]}],  # 4+2 > 5
        )
    assert exc.value.status_code == 400


def test_append_core_empty_uids_raises_400():
    with pytest.raises(HTTPException) as exc:
        _append_children_core(_fake_sb(), _ar_row(), _pr(), [])
    assert exc.value.status_code == 400


def test_append_core_missing_course_name_raises():
    with pytest.raises(HTTPException):
        _append_children_core(
            _fake_sb(), _ar_row(), _pr(),
            [{"uid": "UID-2", "courses": [{"name": "", "amount": 500_000}]}],
        )
```

(Engineer: nếu `_validate_course_amounts`/`_assert_uids_data_order_ids_unique` gọi chain khác fake — đọc 2 hàm thật, chỉnh `_fake_sb` cho khớp chain, KHÔNG đổi logic test.)

Run: `cd backend && python -m pytest tests/test_activation_append.py -v -k "core"`
Expected: FAIL ImportError `_append_children_core`

- [ ] **Step 3.5: Implement core + endpoint** — thêm vào `activation_routes.py`.

Trước tiên core (đặt sau `_merge_uid_blocks`, NGOÀI hàm register — module-level như các helper khác):

```python
def _append_children_core(
    sb, ar_row: dict[str, Any], pr: dict[str, Any], uids_in: list[Any]
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], str]:
    """Logic ruột báo đơn bổ sung — tách khỏi endpoint để test trực tiếp.

    Trả (new_blocks, merged, status). Raises HTTPException khi input sai/vượt tiền.
    KHÔNG side-effect ghi DB — endpoint lo phần update/enqueue/audit.
    """
    if not uids_in:
        raise HTTPException(400, "Cần ít nhất 1 bé/gói để bổ sung")
    ar_id = str(ar_row.get("id") or "")
    pr_id = str(ar_row.get("pr_id") or "")
    existing_uids = ar_row.get("uids_data") or []
    start_seq = _max_course_seq(existing_uids) + 1  # G2
    new_blocks = _assign_course_codes(uids_in, pr_id, start_seq=start_seq)
    _assert_course_names_present(new_blocks)
    _assert_uids_have_uid(new_blocks)
    merged = _merge_uid_blocks(existing_uids, new_blocks)
    _validate_course_amounts(sb, pr, merged, exclude_ar_id=ar_id)  # G4
    _assert_uids_data_order_ids_unique(sb, ar_id, merged)
    return new_blocks, merged, _derive_status(merged)
```

Sau đó endpoint — đặt NGAY SAU endpoint `create_active_request` (sau dòng ~2058, cùng scope đăng ký route để có `supabase_factory`):

```python
    @app.post("/api/v1/active-requests/{ar_id}/append", tags=["Activation"])
    def append_active_request_children(
        ar_id: str,
        payload: Any = Body(...),
        authorization: str | None = Header(None),
    ):
        """Báo đơn bổ sung (lần 2+): cộng bé/gói mới vào AR có sẵn + bắn tin DingTalk.

        Body cùng shape create: {"uids": [{uid, name?, phone?, courses:[{name, amount,...}]}]}.
        KHÔNG tạo AR thứ 2 (G1) — merge vào uids_data, course code tiếp seq (G2),
        tin báo đơn source_id riêng + chỉ chứa bé mới (G3).
        """
        sb = supabase_factory()
        if not sb:
            raise HTTPException(503, "Supabase chưa cấu hình")

        actor = resolve_actor(sb, authorization)

        try:
            res = sb.table("active_requests").select("*").eq("id", ar_id).limit(1).execute()
        except Exception as exc:
            raise HTTPException(500, f"Khong doc active_requests: {exc}") from exc
        if not res.data:
            raise HTTPException(404, f"Active Request {ar_id} khong ton tai")
        ar_row = res.data[0]

        pr_id = str(ar_row.get("pr_id") or "")
        if not pr_id:
            raise HTTPException(400, "AR không gắn PR — không hỗ trợ báo đơn bổ sung")
        pr = _fetch_payment_request(sb, pr_id)

        # G4 — server-side guards y hệt create
        assert_pr_paid(pr)
        assert_all_paid_lines_have_bill(sb, pr)

        _, _, uids_in = _parse_create_ar_payload(payload)
        new_blocks, merged, new_status = _append_children_core(sb, ar_row, pr, uids_in)

        patch = {
            "uids_data": merged,
            "status": new_status,  # G5
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        try:
            upd = sb.table("active_requests").update(patch).eq("id", ar_id).execute()
        except Exception as exc:
            raise HTTPException(500, f"Khong cap nhat active_requests: {exc}") from exc
        updated = (upd.data or [{**ar_row, **patch}])[0]

        _writeback_pr_uid_from_ar(sb, updated, pr, merged)

        # G3: tin bổ sung — CHỈ bé mới, source_id riêng theo code gói mới đầu tiên
        # (deterministic → retry idempotent; mỗi đợt append 1 source_id riêng).
        first_new_code = new_blocks[0]["courses"][0]["code"]
        _enqueue_activation_request_created_dingtalk(
            sb,
            {**updated, "uids_data": new_blocks},
            pr,
            source_suffix=f":append:{first_new_code}",
        )
        # G6: Zalo không gọi — event này Zalo đang tắt (chỉ còn tin báo tiền).

        try:
            from audit import log_audit
            log_audit(
                sb, actor.email, "activation.append_children", "active_request", ar_id,
                {"new_codes": [c["code"] for b in new_blocks for c in b["courses"]]},
            )
        except Exception as exc:
            print(f"[activation] append audit failed (non-fatal): {exc}")

        return _serialize_ar(updated, pr)
```

Lưu ý engineer: kiểm tra đầu file đã có `from datetime import datetime, timezone` + `Body` import chưa (create endpoint dùng `Body(...)` rồi — có sẵn); `assert_pr_paid`/`assert_all_paid_lines_have_bill` import từ `pr_guards` ở scope nào (create dùng qua `_save_active_request` — nếu chưa import trực tiếp trong scope route, thêm `from pr_guards import assert_pr_paid, assert_all_paid_lines_have_bill` đầu hàm như pattern ở `payment_request_routes.py:2043`). Kiểm tra `log_audit` module path bằng `grep -n "from audit import" backend/activation_routes.py` — nếu đã import top-level thì bỏ import trong hàm.

- [ ] **Step 3.6: Smoke import + route đăng ký**

Run: `cd backend && python -c "import activation_routes; print('import ok')" && grep -c "active-requests/{ar_id}/append" activation_routes.py`
Expected: `import ok` + `1`. (Lesson indent bug 19/6: route phải nằm ĐÚNG indent trong hàm register — verify bằng grep `@app.post` cùng cột với `@app.patch` dòng 1763.)

- [ ] **Step 3.7: Chạy toàn bộ test activation**

Run: `cd backend && python -m pytest tests/ -q -k "activation or ar_created or append"`
Expected: PASS toàn bộ.

- [ ] **Step 3.8: Commit**

```bash
git add backend/activation_routes.py backend/tests/test_activation_append.py
git commit -m "feat(activation): endpoint append bé/gói vào AR + tin báo đơn bổ sung"
```

---

### Task 4: FE — api client + context handler + wiring tab

**Files:**
- Modify: `frontend/src/lib/api.ts` (~dòng 196-200, section activeRequests)
- Modify: `frontend/src/contexts/PaymentFlowContext.tsx` (~dòng 90 type, ~dòng 417 handler, provider value)
- Modify: `frontend/src/components/PaymentRequestsTab.tsx` (~dòng 735 handler, ~dòng 847 prop)

- [ ] **Step 4.1: api.ts** — thêm vào object `activeRequests` (cạnh `patch` dòng ~198):

```typescript
    append: (arId: string, body: CreateActiveRequestPayload) =>
      api.post<ActiveRequestApiRow>(`/api/v1/active-requests/${arId}/append`, body),
```

(`CreateActiveRequestPayload` + `ActiveRequestApiRow` đã import sẵn trong api.ts — verify bằng grep, thiếu thì thêm vào dòng import types.)

- [ ] **Step 4.2: PaymentFlowContext.tsx** — thêm vào interface (cạnh dòng 90):

```typescript
  handleAppendActiveRequest: (pr: PaymentRequest, arId: string, rows: ArDraftRow[]) => Promise<ActiveRequest>;
```

Thêm handler ngay sau `handleCreateActiveRequest` (sau dòng ~439):

```typescript
  const handleAppendActiveRequest = useCallback(
    async (pr: PaymentRequest, arId: string, rows: ArDraftRow[]) => {
      try {
        const res = await endpoints.activeRequests.append(
          arId,
          buildCreateActiveRequestPayload(pr, rows)
        );
        const ar = fromApiActiveRequest(res.data);
        if (!ar.customerName) ar.customerName = pr.name;
        // Replace-in-place: AR đã tồn tại trong state, không prepend bản sao
        setActiveRequests((prev) => prev.map((x) => (x.id === ar.id ? ar : x)));
        setApiNote("");
        return ar;
      } catch (err) {
        const msg =
          (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
          "Không bổ sung được bé/gói trên máy chủ. Vui lòng thử lại.";
        setApiNote(String(msg));
        throw err;
      }
    },
    []
  );
```

Thêm `handleAppendActiveRequest` vào provider value (tìm chỗ `handleCreateActiveRequest` được liệt kê trong value object — thêm cạnh đó).

- [ ] **Step 4.3: PaymentRequestsTab.tsx** — sau `onCreateActiveRequest` (dòng ~740) thêm:

```typescript
  const onAppendActiveRequest = async (rows: ArDraftRow[]) => {
    if (!selected) return;
    const existingAr = arByPrId[selected.id];
    if (!existingAr) return;
    await handleAppendActiveRequest(selected, existingAr.id, rows);
  };
```

(`handleAppendActiveRequest` lấy từ context — thêm vào destructure cùng chỗ `handleCreateActiveRequest`.) Truyền prop xuống drawer cạnh dòng ~847: `onAppendActiveRequest={onAppendActiveRequest}`.

- [ ] **Step 4.4: Drawer prop** — `PaymentRequestDetailDrawer.tsx`: thêm vào props destructure (~dòng 1551) `onAppendActiveRequest,` và vào type props (~dòng 1588 khu vực):

```typescript
  /** Báo đơn bổ sung (lần 2+): cộng bé/gói mới vào AR có sẵn + tin DingTalk lần 2 */
  onAppendActiveRequest: (rows: ArDraftRow[]) => Promise<void>;
```

- [ ] **Step 4.5: Type check**

Run: `cd frontend && npx tsc -b`
Expected: PASS (drawer dùng prop ở Task 5 — nếu tsc kêu unused thì để Task 5 xử; unused param không phải error mặc định).

- [ ] **Step 4.6: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/contexts/PaymentFlowContext.tsx frontend/src/components/PaymentRequestsTab.tsx frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx
git commit -m "feat(fe): api + context handler báo đơn bổ sung (append AR)"
```

---

### Task 4B: FE — phoneUtils (smart-paste + normalize + cảnh báo độ dài)

**Files:**
- Create: `frontend/src/components/payment-request/phoneUtils.ts`
- Test: `frontend/src/components/payment-request/phoneUtils.test.ts` (create)

- [ ] **Step 4B.1: Viết failing tests** — create `frontend/src/components/payment-request/phoneUtils.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { smartParsePhonePaste, normalizeLocalPhone, crmPhoneFormat } from "./phoneUtils";
import { findCountry } from "./CountryCombo";

describe("smartParsePhonePaste", () => {
  it("cắt đầu số dạng 420-777710688 → dial 420 + local", () => {
    expect(smartParsePhonePaste("420-777710688")).toEqual({ dial: "420", local: "777710688" });
  });
  it("cắt +84 352334789 (dấu cộng + space)", () => {
    expect(smartParsePhonePaste("+84 352334789")).toEqual({ dial: "84", local: "352334789" });
  });
  it("đầu số không tồn tại → giữ nguyên digits, không dial", () => {
    expect(smartParsePhonePaste("999-123456789")).toEqual({ local: "999123456789" });
  });
  it("không separator → chỉ lọc ký tự rác, KHÔNG đoán đầu số (G11)", () => {
    expect(smartParsePhonePaste("84987654321")).toEqual({ local: "84987654321" });
  });
  it("lọc ký tự rác (ngoặc, chấm, space)", () => {
    expect(smartParsePhonePaste("(035) 233.4789")).toEqual({ local: "0352334789" });
  });
});

describe("normalizeLocalPhone", () => {
  const vn = findCountry("VN"); // exampleLocal "987 654 321" = 9 digits

  it("bỏ 1 số 0 đầu khi sau khi bỏ khớp độ dài mẫu", () => {
    expect(normalizeLocalPhone("0352334789", vn)).toEqual({ value: "352334789", warn: false });
  });
  it("KHÔNG bỏ 0 khi bắt đầu 00 (số 0 đầu thật — G11)", () => {
    const r = normalizeLocalPhone("0083329127", vn);
    expect(r.value).toBe("0083329127");
  });
  it("KHÔNG bỏ 0 khi độ dài sau bỏ vẫn lệch", () => {
    const r = normalizeLocalPhone("035233", vn);
    expect(r.value).toBe("035233");
    expect(r.warn).toBe(true); // 6 digits, lệch >1 vs 9
  });
  it("đúng độ dài → không cảnh báo", () => {
    expect(normalizeLocalPhone("352334789", vn).warn).toBe(false);
  });
  it("lệch 1 → tha (exampleLocal chỉ là 1 mẫu, nhiều nước có range)", () => {
    expect(normalizeLocalPhone("35233478", vn).warn).toBe(false); // 8 vs 9
  });
  it("lệch >1 → cảnh báo (case user: 420 mà đuôi 11 số)", () => {
    const cz = findCountry("CZ");
    const czLen = cz.exampleLocal.replace(/\D/g, "").length;
    const tooLong = "1".repeat(czLen + 2);
    expect(normalizeLocalPhone(tooLong, cz).warn).toBe(true);
  });
  it("rỗng → không cảnh báo (chưa điền ≠ điền sai)", () => {
    expect(normalizeLocalPhone("", vn).warn).toBe(false);
  });
});

describe("crmPhoneFormat", () => {
  it("dạng CRM đầu số-đuôi số", () => {
    expect(crmPhoneFormat("352334789", findCountry("VN"))).toBe("84-352334789");
  });
  it("local rỗng → chuỗi rỗng", () => {
    expect(crmPhoneFormat("", findCountry("VN"))).toBe("");
  });
});
```

Lưu ý engineer: verify `findCountry("CZ")` tồn tại trong COUNTRIES (248 nước generated — gần chắc có); nếu không, đổi test dùng nước khác có trong list.

- [ ] **Step 4B.2: Chạy để thấy fail**

Run: `cd frontend && npx vitest run src/components/payment-request/phoneUtils.test.ts`
Expected: FAIL — module chưa tồn tại

- [ ] **Step 4B.3: Implement** — create `frontend/src/components/payment-request/phoneUtils.ts`:

```typescript
import { COUNTRIES, type Country } from "./CountryCombo";

/** Smart-paste SĐT (18/7): sale copy "420-777710688" / "+84 352 334 789" từ CRM/chat
 *  dán vào ô đuôi số → tự cắt đầu số + chọn country. CHỈ nhận diện khi có separator
 *  sau đầu số VÀ đầu số tồn tại trong COUNTRIES (G11 — không đoán mò chuỗi digits trần). */
export function smartParsePhonePaste(raw: string): { dial?: string; local: string } {
  const m = raw.trim().match(/^\+?(\d{1,3})[-\s]+([\d\s().-]{4,})$/);
  if (m) {
    const dial = m[1];
    if (COUNTRIES.some((c) => c.dial === `+${dial}`)) {
      return { dial, local: m[2].replace(/\D/g, "") };
    }
  }
  return { local: raw.replace(/\D/g, "") };
}

/** Chuẩn hoá đuôi số theo country + cảnh báo độ dài (G11 — cảnh báo, KHÔNG sửa hộ/chặn).
 *  - Bỏ đúng 1 số "0" đầu KHI: sau khi bỏ khớp độ dài mẫu VÀ không còn bắt đầu bằng 0
 *    ("0352334789" VN → "352334789"; "0083329127" giữ nguyên — số 0 đầu thật).
 *  - warn khi lệch >1 so với exampleLocal (1 mẫu, nhiều nước có range → tolerance ±1). */
export function normalizeLocalPhone(local: string, country: Country): { value: string; warn: boolean } {
  const expected = country.exampleLocal.replace(/\D/g, "").length;
  let v = local.replace(/\D/g, "");
  if (v.startsWith("0") && !v.startsWith("00") && v.length - 1 === expected && !v.slice(1).startsWith("0")) {
    v = v.slice(1);
  }
  const warn = v.length > 0 && Math.abs(v.length - expected) > 1;
  return { value: v, warn };
}

/** Format gửi/hiển thị CRM: "84-352334789" (đầu số-đuôi số, user chốt 18/7). */
export function crmPhoneFormat(local: string, country: Country): string {
  const v = local.replace(/\D/g, "");
  if (!v) return "";
  return `${country.dial.replace("+", "")}-${v}`;
}
```

- [ ] **Step 4B.4: Chạy test pass**

Run: `cd frontend && npx vitest run src/components/payment-request/phoneUtils.test.ts`
Expected: PASS toàn bộ (13 tests)

- [ ] **Step 4B.5: Commit**

```bash
git add frontend/src/components/payment-request/phoneUtils.ts frontend/src/components/payment-request/phoneUtils.test.ts
git commit -m "feat(fe): phoneUtils — smart-paste đầu số + normalize + cảnh báo độ dài"
```

---

### Task 5: FE — helper `reportButtonState` + nút sáng lại + modal branch

**Files:**
- Modify: `frontend/src/components/payment-request/paymentRequestUtils.ts` (thêm helper cuối file + sửa `buildCreateActiveRequestPayload`)
- Modify: `frontend/src/types/paymentRequest.ts` (`ArDraftRow` ~dòng 271 — thêm phone)
- Modify: `frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx` (nút ~2538, timeline ~2456, modal ~2564-2749, onClick prefill ~2548, row-card layout mới)
- Test: `frontend/src/components/payment-request/paymentRequestUtils.reportButton.test.ts` (create)

- [ ] **Step 5.1: Viết failing tests** — create `frontend/src/components/payment-request/paymentRequestUtils.reportButton.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { reportButtonState } from "./paymentRequestUtils";

describe("reportButtonState", () => {
  it("chưa đủ tiền → disabled, label mặc định", () => {
    const s = reportButtonState({ ready: false, hasAr: false, unallocated: 0, arLabel: "" });
    expect(s.enabled).toBe(false);
    expect(s.label).toBe("Báo đơn & Kích hoạt");
    expect(s.title).toContain("100%");
  });

  it("đủ tiền, chưa có AR → enabled, label báo đơn lần đầu", () => {
    const s = reportButtonState({ ready: true, hasAr: false, unallocated: 0, arLabel: "" });
    expect(s.enabled).toBe(true);
    expect(s.label).toBe("Báo đơn & Kích hoạt");
  });

  it("có AR + còn tiền chưa phân bổ → enabled, label Báo đơn bổ sung", () => {
    const s = reportButtonState({ ready: true, hasAr: true, unallocated: 1_000_000, arLabel: "Đã kích hoạt khoá học" });
    expect(s.enabled).toBe(true);
    expect(s.label).toBe("Báo đơn bổ sung");
    expect(s.title).toContain("1.000.000");
  });

  it("có AR + hết tiền chưa phân bổ → disabled, label = trạng thái AR", () => {
    const s = reportButtonState({ ready: true, hasAr: true, unallocated: 0, arLabel: "Đã kích hoạt khoá học" });
    expect(s.enabled).toBe(false);
    expect(s.label).toBe("Đã kích hoạt khoá học");
  });

  it("chưa đủ tiền nhưng có AR (edge PR tăng target) → disabled", () => {
    const s = reportButtonState({ ready: false, hasAr: true, unallocated: 500, arLabel: "Chờ kích hoạt khóa học" });
    expect(s.enabled).toBe(false);
  });
});
```

- [ ] **Step 5.2: Chạy để thấy fail**

Run: `cd frontend && npx vitest run src/components/payment-request/paymentRequestUtils.reportButton.test.ts`
Expected: FAIL — `reportButtonState` chưa export

- [ ] **Step 5.3: Implement helper** — thêm cuối `paymentRequestUtils.ts` (sau `activeRequestAllocation`):

```typescript
/** Trạng thái nút "Báo đơn & Kích hoạt" (18/7 — mở lại cho báo đơn bổ sung).
 *  Điều kiện sáng đổi từ "chưa có AR" sang "còn tiền chưa phân bổ vào gói":
 *  khách đóng thêm cho bé/gói mới → sale tự báo đơn lần 2, không cần Ops sửa tay. */
export function reportButtonState(args: {
  ready: boolean;        // PR đủ 100% tiền (state done/over)
  hasAr: boolean;        // PR đã có Active Request
  unallocated: number;   // received − tổng tiền các gói trong AR (activeRequestAllocation().remaining)
  arLabel: string;       // activationSummary(ar).buttonLabel — hiện khi khoá
}): { enabled: boolean; label: string; title: string; isAppend: boolean } {
  const { ready, hasAr, unallocated, arLabel } = args;
  if (!ready) {
    return {
      enabled: false,
      label: "Báo đơn & Kích hoạt",
      title: "Cần thu đủ 100% số tiền trước khi báo đơn",
      isAppend: false,
    };
  }
  if (!hasAr) {
    return {
      enabled: true,
      label: "Báo đơn & Kích hoạt",
      title: "Báo đơn lên DingTalk + tạo yêu cầu kích hoạt khoá học",
      isAppend: false,
    };
  }
  if (unallocated > 0) {
    return {
      enabled: true,
      label: "Báo đơn bổ sung",
      title: `Còn ${unallocated.toLocaleString("vi-VN")} đ chưa phân bổ — báo đơn cho bé/gói mới`,
      isAppend: true,
    };
  }
  return { enabled: false, label: arLabel, title: arLabel, isAppend: false };
}
```

- [ ] **Step 5.4: Chạy test pass**

Run: `cd frontend && npx vitest run src/components/payment-request/paymentRequestUtils.reportButton.test.ts`
Expected: 5 PASS

- [ ] **Step 5.4B: Test payload builder với phone per bé** — create `frontend/src/components/payment-request/paymentRequestUtils.payload.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { buildCreateActiveRequestPayload } from "./paymentRequestUtils";
import type { PaymentRequest, ArDraftRow } from "../../types/paymentRequest";

const PR = { phone: "0977000111", country: "VN" } as PaymentRequest;

const row = (over: Partial<ArDraftRow>): ArDraftRow => ({
  childName: "Bé A", uid: "U1", phone: "", phoneCountry: "VN",
  packageName: "Gói X", amount: 100, leadSource: "", leadChannel: "", ...over,
});

describe("buildCreateActiveRequestPayload — phone per bé (18/7)", () => {
  it("phone của row vào block (không dùng ngầm số PR)", () => {
    const p = buildCreateActiveRequestPayload(PR, [row({ phone: "352334789" })]);
    expect(p.uids[0].phone).toBe("352334789");
    expect(p.uids[0].country).toBe("VN");
  });

  it("phone trống → fallback số PR (bé đầu = số khách)", () => {
    const p = buildCreateActiveRequestPayload(PR, [row({})]);
    expect(p.uids[0].phone).toBe("0977000111");
  });

  it("2 bé 2 số riêng → 2 block đúng số từng bé", () => {
    const p = buildCreateActiveRequestPayload(PR, [
      row({ childName: "Bé A", uid: "U1", phone: "352334789" }),
      row({ childName: "Bé B", uid: "U2", phone: "777710688", phoneCountry: "CZ" }),
    ]);
    expect(p.uids).toHaveLength(2);
    expect(p.uids[0].phone).toBe("352334789");
    expect(p.uids[1].phone).toBe("777710688");
    expect(p.uids[1].country).toBe("CZ");
  });
});
```

Run: `cd frontend && npx vitest run src/components/payment-request/paymentRequestUtils.payload.test.ts`
Expected: FAIL (builder chưa nhận phone) → sau Step 5.5B(ii) chạy lại → 3 PASS. Nhớ `git add` file test này ở Step 5.7.

- [ ] **Step 5.5: Nối vào drawer** — `PaymentRequestDetailDrawer.tsx`:

(a) Import: thêm `reportButtonState`, `activeRequestAllocation` vào import từ `./paymentRequestUtils` (đầu file — grep dòng import hiện có).

(b) Sau `const activeSummary = activationSummary(activeRequest);` (dòng ~1733) thêm:

```typescript
  const arUnallocated = hasActiveRequest && activeRequest
    ? activeRequestAllocation(activeRequest, request).remaining
    : 0;
  const reportBtn = reportButtonState({
    ready,
    hasAr: hasActiveRequest,
    unallocated: arUnallocated,
    arLabel: activeSummary.buttonLabel,
  });
```

(c) Thay nút (dòng ~2538-2560) bằng:

```tsx
            {!readOnly && <button
              className={`btn ${reportBtn.enabled ? "btn-success" : "btn-outline"}`}
              disabled={!reportBtn.enabled}
              title={reportBtn.title}
              onClick={() => {
                const missingLines = findPaidLinesWithoutBill(request.payments ?? []);
                if (missingLines.length > 0) {
                  setMissingBillLines(missingLines.map((l) => ({ line_id: l.id, idx: l.idx, amount: l.amount ?? 0 })));
                  setMissingBillsPopupOpen(true);
                  return;
                }
                setArDraftRows([
                  reportBtn.isAppend
                    // Bé bổ sung: SĐT + UID trống — bé mới có số/UID riêng, bắt sale điền (user chốt 18/7)
                    ? { childName: "", uid: "", phone: "", phoneCountry: request.country || "VN", packageName: "", amount: arUnallocated, leadSource: request.leadSource || "", leadChannel: request.leadChannel || "" }
                    // Lần đầu: prefill SĐT của PR (đa số ca 1 bé = số khách)
                    : { childName: splitChildNames(request.childName)[0] ?? "", uid: request.uid ?? "", phone: (request.phone ?? "").replace(/\D/g, ""), phoneCountry: request.country || "VN", packageName: "", amount: Math.max(0, request.received), leadSource: request.leadSource || "", leadChannel: request.leadChannel || "" },
                ]);
                setArPackageModalOpen(true);
              }}
            >
              <Icons.CheckSquare size={14} /> {reportBtn.label}
            </button>}
```

(d) Timeline B3 meta (dòng ~2456-2460) — thay block `{hasActiveRequest ? ... : ready ? ... : ...}` bằng:

```tsx
                    {reportBtn.isAppend
                      ? `Còn ${arUnallocated.toLocaleString("vi-VN")} đ chưa phân bổ — bấm "Báo đơn bổ sung" cho bé/gói mới`
                      : hasActiveRequest
                      ? `Active Request ${activeRequestId} — ${activeSummary.buttonLabel}`
                      : ready
                      ? 'Sẵn sàng — bấm "Báo đơn & Kích hoạt" để báo kế toán & mở gói'
                      : "Sẽ mở khoá khi đủ 100% tiền"}
```

(e) Modal (IIFE dòng ~2564): trong phần tính toán đầu IIFE thay `const arRemaining = arReceived - arTotal;` bằng:

```typescript
        const arAlreadyAllocated = reportBtn.isAppend && activeRequest
          ? activeRequestAllocation(activeRequest, request).total
          : 0;
        const arRemaining = arReceived - arAlreadyAllocated - arTotal;
```

(f) Modal header (dòng ~2590-2593):

```tsx
                <h3>{reportBtn.isAppend ? "Báo đơn bổ sung" : "Báo đơn & Kích hoạt khoá học"}</h3>
                <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
                  {reportBtn.isAppend
                    ? "Bé/gói mới sẽ cộng vào yêu cầu kích hoạt hiện có + gửi tin báo đơn bổ sung lên DingTalk (kèm bill)."
                    : "Điền gói học → bấm xác nhận = báo đơn lên DingTalk (kèm bill) + tạo yêu cầu kích hoạt."}
                </div>
```

(g) Footer phân bổ (dòng ~2713-2726) — thay dòng "Đã phân bổ..." bằng:

```tsx
              <div style={{ marginTop: 12, fontSize: 12.5 }}>
                {reportBtn.isAppend && (
                  <>Gói đã báo trước <strong>{arAlreadyAllocated.toLocaleString("vi-VN")} đ</strong> + </>
                )}
                {reportBtn.isAppend ? "bổ sung" : "Đã phân bổ"} <strong>{arTotal.toLocaleString("vi-VN")} đ</strong> / thực nhận{" "}
                <strong>{arReceived.toLocaleString("vi-VN")} đ</strong>
                {arRemaining > 0 && (
                  <span style={{ color: "var(--text-3)" }}>
                    {" "}— còn {arRemaining.toLocaleString("vi-VN")} đ chưa phân bổ (có thể phân bổ nốt ở tab Kích hoạt)
                  </span>
                )}
                {arRemaining < 0 && (
                  <span style={{ color: "var(--danger)" }}>
                    {" "}— vượt {Math.abs(arRemaining).toLocaleString("vi-VN")} đ so với tiền thực nhận
                  </span>
                )}
              </div>
```

(h) Confirm button (dòng ~2732-2744) — G12: chờ server xong MỚI đóng modal, disable khi đang gửi (chống double-submit cộng đúp bé). Thêm state cạnh `arPackageModalOpen` (~dòng 1603): `const [arSubmitting, setArSubmitting] = useState(false);`

```tsx
              <button
                type="button"
                className="btn btn-success"
                disabled={!arValid || arSubmitting}
                style={!arValid || arSubmitting ? { opacity: 0.4, cursor: "not-allowed" } : undefined}
                onClick={async () => {
                  if (!arValid || arSubmitting) return;
                  setArSubmitting(true);
                  const rows = arDraftRows.map((r) => ({ ...r, childName: r.childName.trim() }));
                  try {
                    if (reportBtn.isAppend) {
                      await onAppendActiveRequest(rows);
                    } else {
                      await onCreateActiveRequest(rows);
                    }
                    setArPackageModalOpen(false); // đóng CHỈ khi server ok — lỗi giữ modal + dữ liệu cho bấm lại
                  } catch {
                    /* apiNote đã set trong context handler; giữ modal */
                  } finally {
                    setArSubmitting(false);
                  }
                }}
              >
                <Icons.CheckSquare size={14} />{" "}
                {arSubmitting ? "Đang gửi…" : reportBtn.isAppend ? "Xác nhận báo đơn bổ sung" : "Xác nhận báo đơn & kích hoạt"}
              </button>
```

- [ ] **Step 5.5B: Trường SĐT per bé + bố cục 4 dòng (user chốt 18/7)**

(i) `frontend/src/types/paymentRequest.ts` — `ArDraftRow` (~dòng 271) thêm 2 field:

```typescript
export type ArDraftRow = {
  childName: string;   // "" khi PR không có tên con (fallback bé 1)
  uid: string;         // "" = bé chưa có UID CRM (Ops điền ở B3 → write-back)
  phone: string;       // đuôi số local (digits) — CRM mỗi bé 1 SĐT riêng (18/7)
  phoneCountry: string; // country code cho đầu số, VD "VN"
  packageName: string;
  amount: number;      // VND
  leadSource: string;
  leadChannel: string;
};
```

(ii) `paymentRequestUtils.ts` — `buildCreateActiveRequestPayload` (~dòng 388-392): block lấy SĐT theo ROW thay vì điền ngầm pr.phone:

```typescript
      block = {
        uid: row.uid.trim(),
        phone: row.phone.trim() || pr.phone,        // SĐT riêng của bé; fallback số PR
        country: row.phoneCountry || pr.country,
        courses: [],
      };
```

(iii) Drawer — import thêm đầu file: `import CountryCombo, { findCountry } from "./CountryCombo";` (nếu chưa có trong file — grep trước) + `import { smartParsePhonePaste, normalizeLocalPhone, crmPhoneFormat } from "./phoneUtils";`

(iv) Drawer — THAY row-card body trong `arDraftRows.map` (dòng ~2601-2697) bằng bố cục 4 dòng. Giữ nguyên `Combobox`/`MoneyInput`/select Nguồn-Kênh hiện có, chỉ SẮP XẾP lại + thêm SĐT:

```tsx
                <div key={i} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", marginBottom: 10 }}>
                  {/* Dòng 1: Tên bé | SĐT riêng của bé */}
                  <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                    <div className="field" style={{ flex: 1, minWidth: 180, marginBottom: 0 }}>
                      <label>Tên bé <span style={{ color: "var(--text-3)", fontWeight: 400 }}>(hiển thị trong yêu cầu kích hoạt)</span></label>
                      <Combobox
                        freeText
                        value={row.childName}
                        onChange={(v) => setArRow(i, { childName: v })}
                        options={arChildOptions.map((n) => ({ value: n, label: n }))}
                        placeholder="Chọn hoặc gõ tên bé..."
                        emptyLabel="— Bỏ chọn —"
                      />
                    </div>
                    <div className="field" style={{ flex: 1, minWidth: 200, marginBottom: 0 }}>
                      {(() => {
                        const country = findCountry(row.phoneCountry);
                        const norm = normalizeLocalPhone(row.phone, country);
                        return (
                          <>
                            <label>SĐT của bé <span style={{ color: "var(--danger)" }}>*</span></label>
                            <div style={{ display: "flex", gap: 6 }}>
                              <CountryCombo
                                value={row.phoneCountry}
                                onChange={(code) => setArRow(i, { phoneCountry: code })}
                              />
                              <input
                                className={norm.warn ? "ar-phone-bad" : undefined}
                                placeholder={country.exampleLocal.replace(/\s/g, "")}
                                value={row.phone}
                                onChange={(e) => {
                                  const parsed = smartParsePhonePaste(e.target.value);
                                  if (parsed.dial) {
                                    const c = COUNTRIES.find((x) => x.dial === `+${parsed.dial}`);
                                    setArRow(i, { phone: parsed.local, ...(c ? { phoneCountry: c.code } : {}) });
                                  } else {
                                    setArRow(i, { phone: parsed.local });
                                  }
                                }}
                                onBlur={() => {
                                  const n = normalizeLocalPhone(row.phone, findCountry(row.phoneCountry));
                                  if (n.value !== row.phone) setArRow(i, { phone: n.value });
                                }}
                                style={{ flex: 1, minWidth: 0, fontFamily: "JetBrains Mono, monospace", ...(norm.warn ? { borderColor: "var(--danger)" } : {}) }}
                              />
                            </div>
                            <div style={{ marginTop: 3, fontSize: 11.5, color: norm.warn ? "var(--danger)" : "var(--text-3)" }}>
                              {norm.warn
                                ? "SĐT chưa đúng — vui lòng kiểm tra lại"
                                : row.phone
                                ? <>Gửi CRM: <span style={{ fontFamily: "JetBrains Mono, monospace" }}>{crmPhoneFormat(row.phone, country)}</span></>
                                : "Dán cả cụm (VD 84-352334789) — hệ thống tự tách đầu số"}
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                  {/* Dòng 2: UID CRM — GIỮ NGUYÊN block UID hiện có (label + input + cảnh báo bắt buộc) */}
                  {/* Dòng 3: Gói học + Số tiền — GIỮ NGUYÊN block hiện có (Combobox gói + MoneyInput + nút xoá dòng) */}
                  {/* Dòng 4: Nguồn + Kênh — GIỮ NGUYÊN block hiện có */}
                </div>
```

Chỉ dẫn engineer: 3 comment "GIỮ NGUYÊN" = di chuyển các block JSX hiện có (UID dòng ~2648-2663, Gói+tiền ~2613-2647, Nguồn+Kênh ~2664-2696) vào đúng thứ tự dòng 2→3→4 — KHÔNG viết lại nội dung, chỉ đổi vị trí. `COUNTRIES` import từ `./CountryCombo`.

(v) Nút "Thêm gói" trong modal (dòng ~2699-2712) — object mới thêm 2 field: `phone: "", phoneCountry: request.country || "VN",`

(vi) Hiệu ứng rung: thêm vào file CSS drawer đang dùng (grep `className="ar-` hoặc file css của gmv-prototype — nếu drawer dùng inline style toàn bộ thì thêm `<style>` block cạnh modal, pattern đã có trong codebase thì theo):

```css
@keyframes arPhoneShake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-3px); }
  75% { transform: translateX(3px); }
}
.ar-phone-bad { animation: arPhoneShake 0.25s ease-in-out 2; }
```

(vii) Validate: SĐT **bắt buộc CÓ** (CRM luôn cần mỗi bé 1 số — như UID) nhưng **SAI ĐỘ DÀI KHÔNG chặn** (G11 — chỉ cảnh báo đỏ+rung). Sửa `arRowsValid` (dòng ~2568):

```typescript
        const arRowsValid = arDraftRows.length > 0 && arDraftRows.every(
          (r) => r.packageName.trim() && r.amount > 0 && r.uid.trim() && r.phone.trim()
        );
```

(Lần đầu prefill số PR → tự thoả; bé bổ sung bắt điền số riêng. `norm.warn` KHÔNG tham gia arRowsValid.)

- [ ] **Step 5.6: Type check + full FE test**

Run: `cd frontend && npx tsc -b && npm run test`
Expected: PASS toàn bộ.

- [ ] **Step 5.7: Commit**

```bash
git add frontend/src/components/payment-request/paymentRequestUtils.ts frontend/src/components/payment-request/paymentRequestUtils.reportButton.test.ts frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx frontend/src/types/paymentRequest.ts
git commit -m "feat(fe): nút Báo đơn bổ sung + trường SĐT per bé, bố cục modal 4 dòng"
```

---

### Task 6: FE — cảnh báo "đường câm" trong chế độ Sửa mini-card

**Files:**
- Modify: `frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx` (khu Thêm UID ~dòng 1430)

- [ ] **Step 6.1: Thêm warning box** — NGAY TRƯỚC div chứa nút "Thêm UID" (dòng ~1430 `<div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 12, paddingBottom: 4 }}>`) chèn (theo UI-visibility principle — warning box nổi bật, không text mờ):

```tsx
      <div style={{
        marginTop: 10, padding: "8px 12px", borderRadius: 8, fontSize: 12, lineHeight: 1.5,
        border: "1.5px solid var(--warning, #f59e0b)", background: "var(--warning-bg, #fef3c7)",
        color: "var(--warning-text, #92400e)",
      }}>
        ⚠️ Thêm bé/gói tại đây <strong>không gửi tin báo đơn</strong> cho kế toán — chỉ dùng để sửa
        thông tin nhập sai. Muốn báo bé/gói mới (khách đóng thêm tiền): dùng nút{" "}
        <strong>"Báo đơn bổ sung"</strong> ở cuối phiếu.
      </div>
```

(Block này nằm cùng scope render với nút Thêm UID — chỉ hiện khi đang ở chế độ Sửa, đúng lúc user có thể gây đường câm.)

- [ ] **Step 6.2: Verify + commit**

Run: `cd frontend && npx tsc -b`
Expected: PASS.

```bash
git add frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx
git commit -m "feat(fe): cảnh báo Sửa mini-card không bắn tin — trỏ sang nút Báo đơn bổ sung"
```

---

### Task 7: Full suite + push sandbox

- [ ] **Step 7.1: BE full suite**

Run: `cd backend && python -m pytest -q`
Expected: pass toàn bộ trừ 3 fail xlrd pre-existing (`No module named 'xlrd'` — KHÔNG liên quan).

- [ ] **Step 7.2: FE full**

Run: `cd frontend && npx tsc -b && npm run test`
Expected: PASS.

- [ ] **Step 7.3: Push**

```bash
git push origin sandbox
```

---

### Task 8: Deploy sandbox + smoke

- [ ] **Step 8.1: Deploy BE sandbox** — `bash scripts/deploy.sh sandbox`, chờ ~70s, check `get_deploy` (service `srv-d8co3nmq1p3s73bis1s0`) status=live. FE sandbox: Vercel auto-deploy theo push sandbox.

- [ ] **Step 8.2: Smoke trên sandbox** (https://palfish-gmv-manager-sandbox.vercel.app/, login `test.user@dev`): dùng PR test có sẵn AR + tạo thêm 1 lần thanh toán rồi xác nhận bằng `test.admin@dev` (như user đã làm 18/7 với PR-2026-TEST01 — PR đó giờ hết tiền dư vì đã Sửa tay, dùng PR-2026-TEST02 hoặc tạo lần TT mới). Verify:
  1. Nút hiện **"Báo đơn bổ sung"** màu xanh khi có tiền dư chưa phân bổ
  2. Bấm → modal "Báo đơn bổ sung", tiền điền sẵn = số dư; SĐT + UID trống (bé mới)
  2b. Ô SĐT: dán `420-777710688` → tự nhảy đầu số +420, đuôi 777710688; gõ `0352334789` với +84 → blur tự thành 352334789, preview `84-352334789`; gõ số cụt (6 số) → ô đỏ + rung + "SĐT chưa đúng — vui lòng kiểm tra lại" nhưng VẪN xác nhận được
  3. Xác nhận → mục Kích hoạt hiện bé mới (2 UID, mỗi bé đúng SĐT riêng), course code TIẾP SEQ không trùng (check DB: `select uids_data from active_requests where id='<AR>'`)
  4. `dingtalk_outbox` sandbox: PR test là `is_test` → KHÔNG có row mới (G10, đúng kỳ vọng — enqueue tự skip). Row outbox chỉ xuất hiện với PR thật (test prod Task 9).
  5. Nút sau khi bổ sung hết tiền dư → xám lại, label trạng thái AR.

- [ ] **Step 8.3: Verify sandbox logs** — Render logs sandbox không có traceback mới quanh append.

---

### Task 9: Prod (CÓ CHECKPOINT HỎI USER)

- [ ] **Step 9.1: 🛑 HỎI USER "deploy prod?"** (G9). Đồng ý → `git checkout main && git merge sandbox --no-edit && git push origin main && git checkout sandbox` (Vercel FE prod auto) + `bash scripts/deploy.sh prod`, chờ live (service `srv-d8786dl7vvec738pem2g`).

- [ ] **Step 9.2: 🛑 HỎI USER trước khi test tin thật trên prod** (G8). Nếu user muốn test end-to-end tin DingTalk bổ sung: cần 1 PR THẬT (không is_test) → tin phải có 🧪 prefix không chèn được qua đường app → **khuyến nghị**: KHÔNG test tin thật; thay bằng theo dõi ca thật đầu tiên (query `select * from dingtalk_outbox where source_id like '%' and event_type='activation_request_created' order by id desc limit 5;` sau khi có sale dùng). User quyết.

- [ ] **Step 9.3: Update memory** — `project_bao_don_hoan_thanh.md`: thêm block 18/7 phần 2: nút Báo đơn bổ sung (điều kiện theo tiền chưa phân bổ), endpoint append, source_suffix, cảnh báo Sửa-đường-câm; và memory `project_pr_multi_con_ar_modal.md` nếu chạm.

- [ ] **Step 9.4: extract-approach** — ứng viên learning: "outbox UNIQUE theo source_id = tin nghiệp vụ lần 2 phải đổi source_id, không phải đổi event_type" + "nút gate theo trạng thái tồn-tại (hasAR) vs gate theo số dư (unallocated) — tồn-tại là one-shot, số dư là resumable".

---

## Self-review đã chạy

- **Spec coverage:** nút sáng lại theo tiền dư ✅ (T5), modal đẹp lần 2 ✅ (T5), cộng vào AR cũ không tạo AR mới ✅ (T3, G1), tin DingTalk lần 2 kèm bill ✅ (T2+T3, G3), chặn/cảnh báo đường Sửa câm ✅ (T6), SĐT per bé bố cục 4 dòng + smart-paste + cảnh báo đỏ/rung không chặn ✅ (T4B + T5.5B, G11), 4 tiêu chí map ở Guardrails ✅.
- **Placeholder scan:** không còn TBD/TODO; mọi step code có code đầy đủ; 2 chỗ chủ động dặn engineer verify signature thực tế (helpers test file T2, import audit T3) — đó là chỉ dẫn verify, không phải placeholder logic.
- **Type consistency:** `reportButtonState` args/return dùng thống nhất T5.1↔T5.3↔T5.5; `_max_course_seq`/`_merge_uid_blocks`/`_assign_course_codes(start_seq)` thống nhất T1↔T3; endpoint body shape = `CreateActiveRequestPayload` (FE) = `_parse_create_ar_payload` (BE) — cùng shape create, không field mới.
- **Rollback:** revert commits = về hành vi khoá-vĩnh-viễn hiện tại; không migration nên không có dấu vết DB (ngoài audit log vô hại).
