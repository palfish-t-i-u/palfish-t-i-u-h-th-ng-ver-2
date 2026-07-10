# PR Multi-Con + AR Modal Mở Rộng — Integrated Implementation Plan

> **⛔ DO NOT EXECUTE** — Chờ **Minh** (owner) duyệt plan. Sau khi duyệt, executor dự kiến là **Sonnet 4.6**. Mọi agent đọc được plan này mà chưa có lệnh triển khai từ Minh → DỪNG.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (TOKEN-CAPPED variant — see Guardrails G1) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Supersedes:** `docs/superpowers/plans/2026-07-07-pr-multi-con.md` (nội dung Batch A/B/C được copy vào đây kèm chỉnh sửa tích hợp — KHÔNG thực thi file cũ).

**Goal:** (1) 1 PR chứa nhiều con — mỗi bé có tên + UID CRM riêng, mỗi lần thanh toán gắn đúng bé, mọi kênh ra (QR, Zalo, modal ghép CK) hiện đúng tên đúng bé. (2) Modal "Kích hoạt khoá học" mở rộng — tạo AR với nhiều bé/nhiều gói/số tiền sửa được ngay lúc tạo, tin Zalo bắn 1 lần đủ thông tin mọi gói.

**Architecture:** Bé 1 giữ nguyên ở `payment_requests.child_name` + `uid` (không đụng 60 refs hiện có). Bé 2+ lưu ở cột JSONB mới `payment_requests.extra_children` (`[{name, uid?}]`). Lần TT gắn bé qua cột mới `payment_lines.student_name` (text NULL = bé 1). B3 `uids_data[]` thêm field `name` — dùng ở cả PATCH (B3 thêm UID) lẫn CREATE (modal AR mở rộng); UID nhập ở B3 ghi ngược vào `extra_children`. API PR trả `children` = list ghép đầy đủ. Modal AR thay ô gói đơn bằng danh sách dòng `{bé, gói, tiền}` → build payload nhiều uid-block phía client, KHÔNG có trạng thái AR nháp server-side. Mọi cột mới nullable → PR 1 con không đổi hành vi.

**Tech Stack:** FastAPI + Supabase (Postgres/JSONB), React 19 + TS, pytest, Vitest.

**Specs:**
- `docs/superpowers/specs/2026-07-07-pr-multi-con-design.md` (multi-con)
- `docs/AUDIT_PR_MULTI_CON_2026-07-07.md` (hiện trạng)
- Quyết định 10/7 (Minh): AR modal mở rộng thay vì AR nháp — nháp nằm client-side, tránh máy trạng thái mới.

---

## 4 TIÊU CHÍ (Minh) — mapping

| Tiêu chí | Plan đáp ứng thế nào |
|---|---|
| **1. Triệt để** | Giải tận gốc cả 2 vấn đề: (a) PR nhiều con có model dữ liệu riêng, không né bằng tên ghép; (b) AR tạo 1 phát đủ mọi bé/gói → vá luôn lỗ hổng "thêm gói sau khi tạo AR không bắn Zalo" (PATCH không notify) vì mọi gói vào chung 1 tin lúc tạo. Zalo builder render đúng tên bé theo từng uid-block. |
| **2. Không lỗi con** | Mọi cột/field mới nullable + fallback về hành vi cũ (G3). PR 1 con: UI không thêm control, payload tạo AR y hệt cũ (test regression giữ nguyên pass). Modal validate tổng ≤ thực nhận (khớp validate BE có sẵn `_validate_course_amounts`). TDD từng task, verify G4 trước mỗi commit. G8 chống commit nhầm diff task khác đang dở trong working tree. |
| **3. Không tăng gánh nặng hạ tầng / giảm hiệu năng** | 2 cột nullable additive, KHÔNG bảng mới, KHÔNG trạng thái AR nháp, KHÔNG cron/worker mới. BE create AR đã nhận sẵn nhiều uid-block (`_assign_course_codes`) — chỉ bổ sung giữ key `name`. Zero query thêm trên đường nóng (rename propagation chỉ chạy khi PATCH đổi tên bé). |
| **4. Tiết kiệm token/quota** | Tối đa **3 subagent** tuần tự (Batch A/B/C), không fan-out, không reviewer agent riêng, không Workflow tool. UI component không unit-test riêng (verify bằng tsc + smoke). E2E Playwright để sau khi flow ổn định. |

---

## GUARDRAILS (bắt buộc đọc trước khi làm bất kỳ task nào)

### G1 — Token budget (chỉ thị trực tiếp anh Minh 7/7, giữ nguyên 10/7)
- **Tối đa 3 subagent cho toàn bộ plan** (Batch A/B/C bên dưới), chạy **tuần tự**, KHÔNG song song, KHÔNG spawn reviewer agent riêng — main session tự review diff sau mỗi batch.
- Subagent fail cùng 1 việc 2 lần → DỪNG, báo anh Minh, không spawn thêm.
- Không dùng Workflow tool / fan-out / adversarial multi-vote cho task này.
- Subagent prompt phải trỏ vào plan file này + đúng batch, không paste lại toàn bộ codebase context.

### G2 — Sandbox-only
- Toàn bộ code trên branch `sandbox`. KHÔNG merge main, KHÔNG chạy SQL trên prod (`jozcvbbypwvzaefteoxn`) — kể cả backfill PR cũ (làm sau khi anh Minh duyệt lên prod).
- Migration chỉ apply lên sandbox Supabase (`pxgybyfiwywksesyogti`), do **main session** apply (subagent không đụng MCP Supabase).
- Deploy BE sandbox: `bash scripts/deploy.sh sandbox`. FE: push branch `sandbox` → Vercel tự deploy.

### G3 — Không phá hành vi cũ (tiêu chí "không lỗi con")
- Mọi cột/field mới đều nullable/optional. Thiếu → fallback `child_name` = hành vi hiện tại.
- CẤM sửa nghĩa/tên cột `child_name`, `uid` trên `payment_requests`. CẤM đổi shape phần tử `uids_data` hiện có (chỉ THÊM key `name`).
- PR 1 con: UI không hiện thêm control chọn bé (điều kiện `children.length >= 2`). Modal AR với PR 1 con + sale không sửa gì → payload gửi BE **y hệt flow hiện tại** (1 uid-block, 1 course, amount = received).
- Tin Zalo `activation_request_created` với AR 1 block không đổi format (test regression hiện có trong `backend/tests/test_zalo_builder.py` phải tiếp tục pass).

### G4 — Verify trước mỗi commit
- BE: `cd backend && python -m pytest tests/ -q` pass.
- FE: `cd frontend && npx tsc -b` pass (KHÔNG dùng `--noEmit`) + `npm run test` pass.
- Commit theo batch (squash, quy ước repo: message tiếng Việt `feat(pr-multi-con): ...`), KHÔNG commit từng micro-step.

### G5 — Zalo an toàn
- Không trigger gửi Zalo thật khi test. Chỉ unit test builder Python + sửa SQL function trong migration. Nếu cần bắn thử trên sandbox → prepend `🧪 [TEST]`.

### G6 — Rollback
- Code: revert commit trên `sandbox`.
- DB: cột mới additive, không cần drop khi rollback code (an toàn để nguyên). Nếu buộc phải gỡ: `ALTER TABLE ... DROP COLUMN IF EXISTS extra_children;` / `... DROP COLUMN IF EXISTS student_name;` + re-apply function từ `2026-07-04-zalo-payment-paid-format-v2.sql`.

### G7 — Line numbers = anchor gần đúng
- Số dòng trong plan lấy từ working tree 10/7. File có thể trôi. Trước khi sửa: grep anchor string nêu trong task (tên hàm/biến) để định vị lại — KHÔNG sửa mù theo số dòng.

### G8 — Working tree đang có diff của task khác (QUAN TRỌNG)
- Tại thời điểm viết plan, working tree có uncommitted changes thuộc task khác (zalo-bill-message → DingTalk: `backend/payment_request_routes.py`, `frontend/src/components/PaymentRequestsTab.tsx`, `PaymentRequestDetailDrawer.tsx`, `paymentRequestUtils.*`, `AuditTrail.tsx`).
- Trước khi bắt đầu: chạy `git status`. Nếu còn diff chưa commit của task khác trong các file plan này sẽ sửa → **DỪNG, báo anh Minh** quyết định (land task kia trước, hoặc stash).
- Khi commit: `git add` **từng file theo đúng danh sách trong batch**, review `git diff --staged` xác nhận không dính hunk của task khác. CẤM `git add -A` / `git add .`.

---

## Execution model (token-capped)

| Ai | Làm gì |
|---|---|
| **Main session** | Checkout `sandbox`, kiểm tra G8, apply migration lên sandbox DB, dispatch 3 batch tuần tự, review diff sau mỗi batch, chạy verify G4, commit, push, deploy, smoke test, báo cáo |
| **Subagent A** | Batch A — DB migration file + BE core (Tasks 1–4) |
| **Subagent B** | Batch B — FE types + create modal + drawer multi-con (Tasks 5–7) |
| **Subagent C** | Batch C — B3 activation + AR modal mở rộng (Tasks 8–11) |

Thứ tự bắt buộc A → B → C (C phụ thuộc `children` từ B và `uids_data[].name` từ A/C-Task-8).

---

## BATCH A — Migration + BE core

### Task 1: Migration SQL

**Files:**
- Create: `backend/migrations/2026-07-07-pr-multi-child.sql`

- [ ] **Step 1: Viết migration**

```sql
-- Migration: PR multi-con — extra_children + payment_lines.student_name
-- Spec: docs/superpowers/specs/2026-07-07-pr-multi-con-design.md
-- Idempotent. Date: 2026-07-07

ALTER TABLE public.payment_requests
  ADD COLUMN IF NOT EXISTS extra_children jsonb;
COMMENT ON COLUMN public.payment_requests.extra_children IS
  'Bé thứ 2 trở đi: [{"name": text, "uid": text|null}]. Bé 1 = child_name + uid.';

ALTER TABLE public.payment_lines
  ADD COLUMN IF NOT EXISTS student_name text;
COMMENT ON COLUMN public.payment_lines.student_name IS
  'Lần TT của bé nào. NULL = bé chính (child_name của PR).';
```

- [ ] **Step 2: Cập nhật SQL function Zalo trong cùng file migration**

Copy nguyên văn function `build_payment_paid_message` từ `backend/migrations/2026-07-04-zalo-payment-paid-format-v2.sql`, chỉ thêm **1 dòng** ngay sau khối `SELECT ... INTO`:

```sql
  -- Multi-con: lần TT gắn bé nào thì báo tên bé đó
  v_child := COALESCE(NULLIF(line_row.student_name, ''), v_child);
```

Cuối file: `NOTIFY pgrst, 'reload schema';`

- [ ] **Step 3: Main session apply lên sandbox** (`pxgybyfiwywksesyogti`) — subagent chỉ viết file, KHÔNG apply.

### Task 2: BE — model + create/patch PR nhận `children`

**Files:**
- Modify: `backend/payment_request_routes.py` (models ~dòng 112–163; `_payment_request_insert_row` ~dòng 808; `_payment_request_patch_row` ~dòng 865; `_serialize_payment_request` ~dòng 272)
- Test: `backend/tests/test_pr_multi_child.py` (create)

- [ ] **Step 1: Viết failing tests**

```python
"""Multi-con: extra_children + children API surface."""
from payment_request_routes import (
    _payment_request_insert_row,
    _payment_request_patch_row,
    _serialize_payment_request,
    PaymentRequestCreate,
    PaymentRequestPatch,
)


def _body(**kw):
    base = dict(uid="uid1", name="Me Bé", phone="0912345678", target=1000000,
                child_name="Bé Một")
    base.update(kw)
    return PaymentRequestCreate(**base)


def test_create_with_extra_children():
    row = _payment_request_insert_row(_body(
        children=[{"name": "Bé Một", "uid": "uid1"}, {"name": "Bé Hai"}],
    ))
    assert row["child_name"] == "Bé Một"
    assert row["extra_children"] == [{"name": "Bé Hai", "uid": None}]


def test_create_single_child_no_extra():
    row = _payment_request_insert_row(_body())
    assert "extra_children" not in row


def test_create_rejects_empty_extra_name():
    import pytest
    from fastapi import HTTPException
    with pytest.raises(HTTPException):
        _payment_request_insert_row(_body(
            children=[{"name": "Bé Một"}, {"name": "  "}],
        ))


def test_serialize_children_full_list():
    out = _serialize_payment_request({
        "id": "PR-1", "uid": "uid1", "child_name": "Bé Một",
        "extra_children": [{"name": "Bé Hai", "uid": "uid2"}],
    })
    assert out["children"] == [
        {"name": "Bé Một", "uid": "uid1"},
        {"name": "Bé Hai", "uid": "uid2"},
    ]


def test_serialize_no_children_when_single():
    out = _serialize_payment_request({"id": "PR-1", "uid": "uid1", "child_name": "Bé Một"})
    assert out["children"] == [{"name": "Bé Một", "uid": "uid1"}]
    assert out.get("extra_children") is None


def test_patch_extra_children():
    patch = _payment_request_patch_row(
        PaymentRequestPatch(children=[{"name": "Bé Một"}, {"name": "Bé Hai", "uid": "u2"}]),
        {"uid": "uid1", "name": "Me", "phone": "09", "child_name": "Bé Một"},
    )
    assert patch["child_name"] == "Bé Một"
    assert patch["extra_children"] == [{"name": "Bé Hai", "uid": "u2"}]
```

- [ ] **Step 2: Chạy `cd backend && python -m pytest tests/test_pr_multi_child.py -q` → FAIL** (field `children` chưa tồn tại)

- [ ] **Step 3: Implement**

Thêm vào cả `PaymentRequestCreate` và `PaymentRequestPatch`:

```python
    children: list[dict] | None = None  # [{name, uid?}] — bé 1 + bé 2+; BE tách bé 1 vào child_name/uid
```

Helper mới (đặt cạnh `_payment_request_insert_row`):

```python
def _parse_children(raw: list | None) -> tuple[str | None, list[dict] | None]:
    """Tách children FE gửi → (child_name bé 1, extra_children bé 2+).

    Trả (None, None) nếu FE không gửi children (giữ flow cũ)."""
    if raw is None:
        return None, None
    cleaned: list[dict] = []
    for item in raw:
        if not isinstance(item, dict):
            raise HTTPException(400, "children phai la danh sach {name, uid}")
        name = _clean_text(item.get("name"))
        if not name:
            raise HTTPException(400, "Ten con khong duoc de trong")
        uid = _clean_text(item.get("uid")) or None
        cleaned.append({"name": name, "uid": uid})
    if not cleaned:
        return None, None
    names = [c["name"] for c in cleaned]
    if len(names) != len(set(names)):
        raise HTTPException(400, "Ten cac con khong duoc trung nhau")
    return cleaned[0]["name"], (cleaned[1:] or None)
```

Trong `_payment_request_insert_row`, sau đoạn `child_name = _clean_text(body.child_name)` (dòng ~842):

```python
    first_name, extra = _parse_children(body.children)
    if first_name:
        row["child_name"] = first_name
    if extra:
        row["extra_children"] = extra
```

Trong `_payment_request_patch_row`, cạnh đoạn patch `child_name` (dòng ~904):

```python
    if body.children is not None:
        first_name, extra = _parse_children(body.children)
        if first_name:
            patch["child_name"] = first_name
        patch["extra_children"] = extra  # None = xóa hết bé phụ
```

Trong `_serialize_payment_request` (cạnh dòng ~302 `result["child_name"] = ...`):

```python
    children = [{"name": row.get("child_name") or "", "uid": row.get("uid") or None}]
    for extra in (row.get("extra_children") or []):
        if isinstance(extra, dict) and extra.get("name"):
            children.append({"name": extra["name"], "uid": extra.get("uid")})
    result["children"] = children
```

Mọi chỗ `sb.table("payment_requests").select(...)` liệt kê cột tường minh phục vụ serialize → thêm `extra_children` (grep `child_name` trong select strings của file này).

- [ ] **Step 4: Chạy lại test → PASS**

### Task 3: BE — `payment_lines.student_name` + rename propagation

**Files:**
- Modify: `backend/payment_request_routes.py` (`PaymentLineCreate` ~dòng 164; line insert handler ~dòng 1996–2011; `_serialize_payment_line` ~dòng 650–700; patch PR handler nơi apply patch)
- Test: `backend/tests/test_pr_multi_child.py` (thêm case)

- [ ] **Step 1: Failing tests**

```python
def test_line_create_model_accepts_student_name():
    from payment_request_routes import PaymentLineCreate
    body = PaymentLineCreate(amount=100000, method="cash", student_name="Bé Hai")
    assert body.student_name == "Bé Hai"


def test_rename_extra_child_builds_line_updates():
    from payment_request_routes import _child_rename_map
    old = [{"name": "Bé Hai", "uid": "u2"}]
    new = [{"name": "Bé Hai Sửa", "uid": "u2"}]
    assert _child_rename_map(old, new) == {"Bé Hai": "Bé Hai Sửa"}
```

- [ ] **Step 2: Run → FAIL**

- [ ] **Step 3: Implement**

`PaymentLineCreate` thêm `student_name: str | None = None`.

Trong line-insert handler, thêm vào `insert_row` (cả nhánh QR lẫn cash/card — đặt TRƯỚC khối `if use_payos`):

```python
        student_name = _clean_text(body.student_name) or None
        if student_name:
            insert_row["student_name"] = student_name
```

`_serialize_payment_line` thêm `"student_name": row.get("student_name") or None`.

Rename propagation — helper thuần (test được không cần DB):

```python
def _child_rename_map(old_extra: list | None, new_extra: list | None) -> dict[str, str]:
    """Map tên cũ → tên mới cho bé phụ, khớp theo uid (ưu tiên) rồi theo vị trí."""
    renames: dict[str, str] = {}
    old_list = [e for e in (old_extra or []) if isinstance(e, dict)]
    new_list = [e for e in (new_extra or []) if isinstance(e, dict)]
    for i, new in enumerate(new_list):
        old = None
        if new.get("uid"):
            old = next((o for o in old_list if o.get("uid") == new["uid"]), None)
        if old is None and i < len(old_list):
            old = old_list[i]
        if old and old.get("name") and new.get("name") and old["name"] != new["name"]:
            renames[old["name"]] = new["name"]
    return renames
```

Trong PATCH PR handler, sau khi update `payment_requests` thành công, nếu `"extra_children" in patch`:

```python
        renames = _child_rename_map(current_row.get("extra_children"), patch.get("extra_children"))
        for old_name, new_name in renames.items():
            try:
                sb.table("payment_lines").update({"student_name": new_name}) \
                  .eq("payment_request_id", pr_id).eq("student_name", old_name).execute()
            except Exception as exc:
                print(f"[pr-multi-con] rename propagate failed: {exc}")
```

- [ ] **Step 4: Run tests → PASS**

### Task 4: BE — SePay match-candidates + Zalo builders + stale detection

**Files:**
- Modify: `backend/sepay_routes.py` (~dòng 705–775), `backend/utils/zalo_message_builder.py` (dòng ~156 `build_payment_paid_message` + dòng ~377–457 `build_activation_request_created_message`), `backend/payment_request_routes.py` (stale names ~dòng 1117–1140)
- Test: extend `backend/tests/test_sepay_match_candidates.py`, `backend/tests/test_zalo_builder.py`

- [ ] **Step 1: Failing tests**

test_zalo_builder.py:

```python
def test_payment_paid_prefers_line_student_name():
    from utils.zalo_message_builder import build_payment_paid_message
    msg = build_payment_paid_message({
        "name": "Me Bé", "child_name": "Bé Một", "student_name": "Bé Hai",
        "amount": 100000, "sale_name": "Sale A", "team": "IH1",
    })
    assert "Bé Hai" in msg and "Bé Một" not in msg


def test_activation_created_uses_block_name():
    from utils.zalo_message_builder import build_activation_request_created_message
    msg = build_activation_request_created_message(
        {"id": "AR-1", "uids_data": [
            {"uid": "u1", "courses": [{"name": "Gói A", "amount": 1000}]},
            {"uid": "u2", "name": "Bé Hai", "courses": [{"name": "Gói B", "amount": 2000}]},
        ]},
        {"id": "PR-1", "child_name": "Bé Một", "phone": "0912345678",
         "country": "VN", "target": 3000},
        {"display_name": "Sale A", "team": "Inhouse 2"},
    )["message"]
    # Block không có name → fallback child_name PR (hành vi cũ); block có name → tên bé đó
    assert "Bé Một, Gói A" in msg
    assert "Bé Hai, Gói B" in msg
```

test_sepay_match_candidates.py: theo pattern test hiện có trong file, thêm case line có `student_name="Bé Hai"` → candidate trả `"child_name": "Bé Hai"`.

- [ ] **Step 2: Run → FAIL**

- [ ] **Step 3: Implement**

`zalo_message_builder.py` — `build_payment_paid_message` dòng ~156:

```python
    child_name = _first_nonempty(payment_data.get("student_name"), payment_data.get("child_name"))
```

`zalo_message_builder.py` — `build_activation_request_created_message`, trong vòng lặp `for uid_block in uid_blocks:` (dòng ~426), ngay sau dòng `uid = _first_nonempty(uid_block.get("uid"), default="?")`:

```python
        block_child = _first_nonempty(uid_block.get("name"), child_name)
```

rồi thay 2 chỗ dùng `child_name` trong vòng lặp:
- `course_lines.append(f"{child_name}, {course_name}")` → `course_lines.append(f"{block_child}, {course_name}")`
- `course_lines = [child_name]` → `course_lines = [block_child]`

(`child_name` ngoài vòng lặp giữ nguyên — vẫn là fallback từ PR.)

`sepay_routes.py`: thêm `student_name` vào select của `payment_lines` (query đầu hàm match-candidates); dòng ~770 đổi thành:

```python
                "child_name": line.get("student_name") or pr.get("child_name") or "",
```

Stale detection (`payment_request_routes.py` khối build `current_names` ~dòng 1128): sau khi append `parent_name`, thêm:

```python
    for extra in (pr_row.get("extra_children") or []):
        if isinstance(extra, dict) and _clean_text(extra.get("name")):
            current_names.append(extra["name"])
```

- [ ] **Step 4: Run cả suite `python -m pytest tests/ -q` → PASS**

### Batch A commit (main session sau review — G8: add đúng file, review staged diff)

```bash
git add backend/migrations/2026-07-07-pr-multi-child.sql backend/payment_request_routes.py backend/sepay_routes.py backend/utils/zalo_message_builder.py backend/tests/test_pr_multi_child.py backend/tests/test_zalo_builder.py backend/tests/test_sepay_match_candidates.py
git diff --staged   # xác nhận không dính hunk task khác (G8)
git commit -m "feat(pr-multi-con): BE — extra_children + payment_lines.student_name + Zalo/SePay/stale theo bé"
```

---

## BATCH B — FE: types, create modal, drawer multi-con

### Task 5: FE types + API

**Files:**
- Modify: `frontend/src/types/paymentRequest.ts`, `frontend/src/lib/api.ts` (~dòng 603 vùng PR payload), `frontend/src/components/payment-request/paymentRequestUtils.ts` (mapper snake→camel)
- Test: extend `frontend/src/components/payment-request/paymentRequestUtils.test.ts`

- [ ] **Step 1: Failing test** — mapper: PR row có `children: [{name, uid}]` → `pr.children` giữ nguyên; line row có `student_name` → `line.studentName`.

```ts
it("maps children và studentName từ API", () => {
  const pr = mapPaymentRequest({ ...basePrRow, children: [{ name: "Bé Một", uid: "u1" }, { name: "Bé Hai", uid: null }] });
  expect(pr.children).toEqual([{ name: "Bé Một", uid: "u1" }, { name: "Bé Hai", uid: null }]);
  const line = mapPaymentLine({ ...baseLineRow, student_name: "Bé Hai" });
  expect(line.studentName).toBe("Bé Hai");
});
```

(Đúng tên hàm mapper thực tế trong `paymentRequestUtils.ts` — grep `uids_data`/`child_name` trong file để lấy tên; test hiện có trong `paymentRequestUtils.test.ts` là mẫu.)

- [ ] **Step 2: Run `npm run test -- paymentRequestUtils` → FAIL**

- [ ] **Step 3: Implement** — thêm type:

```ts
export interface PrChild { name: string; uid: string | null; }
```

`PaymentRequest` thêm `children: PrChild[]`; `PaymentLine` thêm `studentName?: string | null`. Payload create/patch (`api.ts` vùng dòng 603) thêm `children?: { name: string; uid?: string | null }[]`; payload tạo line thêm `student_name?: string`.

`CreateActiveRequestUidPayload` (types/paymentRequest.ts dòng ~229) thêm field `name`:

```ts
export type CreateActiveRequestUidPayload = {
  uid: string;
  name?: string;   // tên bé — BE giữ trong uids_data, Zalo builder dùng render đúng bé
  phone?: string;
  country?: string;
  courses: CreateActiveRequestCoursePayload[];
};
```

- [ ] **Step 4: Run test → PASS; `npx tsc -b` → PASS**

### Task 6: FE — CreatePaymentRequestModal "+ Thêm con"

**Files:**
- Modify: `frontend/src/components/payment-request/CreatePaymentRequestModal.tsx` (state dòng ~14/39, submit ~109, field ~161)

- [ ] **Step 1: Implement** (component UI — verify bằng tsc + smoke, không unit test riêng, tiết kiệm):

State: `childName: string` giữ nguyên (bé 1); thêm `extraChildren: { name: string; uid: string }[]` khởi tạo `[]`.

Dưới input Tên con hiện tại (~dòng 161) thêm:

```tsx
{form.extraChildren.map((c, i) => (
  <div key={i} className="field-row" style={{ display: "flex", gap: 8, marginTop: 8 }}>
    <input value={c.name} placeholder={`Tên con thứ ${i + 2} *`}
      onChange={(e) => setExtraChild(i, { ...c, name: e.target.value })} />
    <input value={c.uid} placeholder="UID CRM (nếu có)"
      onChange={(e) => setExtraChild(i, { ...c, uid: e.target.value })} />
    <button type="button" className="btn btn-ghost" onClick={() => removeExtraChild(i)}>✕</button>
  </div>
))}
<button type="button" className="btn btn-outline" style={{ marginTop: 8 }}
  onClick={() => set("extraChildren", [...form.extraChildren, { name: "", uid: "" }])}>
  + Thêm con
</button>
```

Submit (~dòng 109): nếu `extraChildren` có phần tử (name đã trim không rỗng — validate chặn rỗng):

```ts
children: [
  { name: form.childName.trim(), uid: form.uid.trim() || null },
  ...form.extraChildren.map((c) => ({ name: c.name.trim(), uid: c.uid.trim() || null })),
],
```

Không gửi `children` khi không có bé phụ (giữ flow cũ). Validate: có bé phụ → `childName` bé 1 bắt buộc + tên bé phụ không rỗng, không trùng.

- [ ] **Step 2: `npx tsc -b` → PASS**

### Task 7: FE — Drawer: sửa PR + dropdown "Của con nào?" + hiển thị

**Files:**
- Modify: `frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx`
  - Form sửa PR (draft `childName` ~dòng 2044): thêm editor bé phụ giống Task 6 (cùng markup), gửi `children` trong PATCH.
  - Form thêm lần TT (~dòng 386–429): thêm select bé.
  - Hiển thị line + info (~dòng 1914): badge tên bé.

- [ ] **Step 1: Implement select bé trong form thêm lần TT**

Cạnh state `nameForTransfer` (~dòng 386):

```tsx
const children = request.children ?? [];
const [studentName, setStudentName] = useState<string>(""); // "" = bé 1
```

Chỉ render khi `children.length >= 2`:

```tsx
<label>Của con nào?</label>
<select value={studentName} onChange={(e) => {
  setStudentName(e.target.value);
  if (e.target.value) setNameForTransfer(e.target.value); // QR mặc định theo bé được chọn
}}>
  {children.map((c, i) => (
    <option key={i} value={i === 0 ? "" : c.name}>{c.name}{i === 0 ? " (mặc định)" : ""}</option>
  ))}
</select>
```

Options của select `nameForTransfer` hiện có (~dòng 391): mở rộng từ `pr.childName` đơn → map tất cả `children` (`Con: ${c.name}`) + option tên PH như cũ.

Gửi payload tạo line (~dòng 429): thêm `student_name: studentName || undefined`.

- [ ] **Step 2: Hiển thị** — chỗ render line list: nếu `request.children.length >= 2` thêm badge `line.studentName || children[0]?.name`. Khối info (~dòng 1914) hiện đủ danh sách con khi ≥2: `request.children.map(c => c.name).join(", ")`.

- [ ] **Step 3: Xóa bé trong form sửa** — chặn nếu bé có line: disable nút ✕ khi `lines.some(l => l.studentName === c.name)`, tooltip "Bé đã có lần thanh toán".

- [ ] **Step 4: `npx tsc -b` + `npm run test` → PASS**

### Batch B commit (main session — G8)

```bash
git add frontend/src/types/paymentRequest.ts frontend/src/lib/api.ts frontend/src/components/payment-request/paymentRequestUtils.ts frontend/src/components/payment-request/paymentRequestUtils.test.ts frontend/src/components/payment-request/CreatePaymentRequestModal.tsx frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx
git diff --staged   # xác nhận không dính hunk task khác (G8)
git commit -m "feat(pr-multi-con): FE — thêm con ở B1/sửa PR, dropdown chọn bé khi tạo lần TT, hiển thị theo bé"
```

---

## BATCH C — B3 Activation + AR Modal Mở Rộng

### Task 8: BE — `uids_data[].name` (PATCH **và CREATE**) + write-back UID vào PR

**Files:**
- Modify: `backend/activation_routes.py` (`ActiveRequestPatchUidPayload` ~dòng 91–101; `_normalize_uid_block` ~dòng 191–200; handler PATCH AR nơi persist `uids_data` ~dòng 1363)
- Test: `backend/tests/test_pr_multi_child.py` (thêm case)

- [ ] **Step 1: Failing tests**

```python
def test_ar_uid_payload_accepts_name():
    from activation_routes import ActiveRequestPatchUidPayload
    p = ActiveRequestPatchUidPayload(uid="u2", name="Bé Hai")
    assert p.name == "Bé Hai"


def test_normalize_uid_block_keeps_name():
    from activation_routes import _normalize_uid_block
    block = _normalize_uid_block({"uid": "u2", "name": "Bé Hai", "phone": "09"})
    assert block["name"] == "Bé Hai"


def test_normalize_uid_block_no_name_key_when_absent():
    from activation_routes import _normalize_uid_block
    block = _normalize_uid_block({"uid": "u1", "phone": "09"})
    assert "name" not in block  # shape cũ giữ nguyên (G3)


def test_assign_course_codes_preserves_name():
    from activation_routes import _assign_course_codes
    out = _assign_course_codes(
        [{"uid": "u2", "name": "Bé Hai", "courses": [{"name": "Gói B", "amount": 1000}]}],
        "PR-2026-0001",
    )
    assert out[0]["name"] == "Bé Hai"
    assert out[0]["courses"][0]["code"] == "CC-0001-001"


def test_writeback_fills_missing_uid():
    from activation_routes import _writeback_child_uids
    extra = [{"name": "Bé Hai", "uid": None}]
    changed = _writeback_child_uids(extra, [{"uid": "u2", "name": "Bé Hai"}])
    assert changed is True and extra[0]["uid"] == "u2"


def test_writeback_no_change_when_uid_set():
    from activation_routes import _writeback_child_uids
    extra = [{"name": "Bé Hai", "uid": "u9"}]
    assert _writeback_child_uids(extra, [{"uid": "u2", "name": "Bé Hai"}]) is False
```

- [ ] **Step 2: Run → FAIL**

- [ ] **Step 3: Implement**

`ActiveRequestPatchUidPayload` thêm `name: str | None = None`. Đảm bảo serialize/persist giữ key `name` trong JSONB (kiểm tra chỗ dump payload → dict trước khi update `uids_data`).

`_normalize_uid_block` (dòng ~191, hàm này chạy trên đường **CREATE** AR — bắt buộc cho modal mở rộng) — thêm sau khối `country`:

```python
    if raw.get("name") not in (None, ""):
        block["name"] = str(raw.get("name")).strip()
```

Helper write-back:

```python
def _writeback_child_uids(extra_children: list, uids_data: list) -> bool:
    """UID nhập ở B3 ghi ngược vào extra_children của PR khi bé trùng tên còn thiếu uid."""
    changed = False
    for uid_block in uids_data or []:
        if not isinstance(uid_block, dict):
            continue
        name = str(uid_block.get("name") or "").strip()
        uid = str(uid_block.get("uid") or "").strip()
        if not name or not uid:
            continue
        for child in extra_children or []:
            if isinstance(child, dict) and child.get("name") == name and not child.get("uid"):
                child["uid"] = uid
                changed = True
    return changed
```

Trong handler PATCH AR sau khi update `uids_data` thành công (~dòng 1363): load PR (`extra_children`), gọi helper, nếu `True` → `sb.table("payment_requests").update({"extra_children": extra}).eq("id", pr_id).execute()` trong try/except log-only.

- [ ] **Step 4: Run tests → PASS**

### Task 9: FE — ActivationTab dialog "Thêm UID mới" chọn bé

**Files:**
- Modify: `frontend/src/components/ActivationTab.tsx` (`addUid` ~dòng 762–777; `submitAddUid` ~dòng 786; dialog ~dòng 1565–1620); mapper uids ⇄ `uids_data` (grep `uids_data` trong `frontend/src/contexts/PaymentFlowContext.tsx` + `paymentRequestUtils.ts` — thêm round-trip key `name`).

- [ ] **Step 1: Implement**

State dialog thêm `newUidChildName: string`. Dialog thêm dưới input UID:

```tsx
<div className="field" style={{ marginTop: 12 }}>
  <label>Của bé nào? <span style={{ color: "var(--danger)" }}>*</span></label>
  <select value={newUidChildName} onChange={(e) => setNewUidChildName(e.target.value)}>
    <option value="">— Chọn bé —</option>
    {(pr?.children ?? []).map((c, i) => (
      <option key={i} value={c.name}>{c.name}</option>
    ))}
    <option value="__new__">+ Bé mới (gõ tên)</option>
  </select>
  {newUidChildName === "__new__" && (
    <input style={{ marginTop: 8 }} value={newChildNameInput} placeholder="Tên bé *"
      onChange={(e) => setNewChildNameInput(e.target.value)} />
  )}
</div>
```

`submitAddUid`: validate đã chọn bé (hoặc gõ tên mới không rỗng); resolve `childName`; nếu `__new__` → PATCH PR bổ sung bé vào `children` trước; rồi `addUid(uid)` với entry mở rộng:

```ts
{ uid: nextUidValue, name: childName, phone: "", country: "VN", courses: [...] }
```

Mapper uids: thêm `name` vào cả 2 chiều (đọc `uids_data[].name` → `u.name`; gửi PATCH giữ `name`).

- [ ] **Step 2: `npx tsc -b` + `npm run test` → PASS**

### Task 10: FE — `buildCreateActiveRequestPayload` nhận nhiều dòng {bé, gói, tiền} (TDD)

**Files:**
- Modify: `frontend/src/types/paymentRequest.ts` (thêm type `ArDraftRow`), `frontend/src/components/payment-request/paymentRequestUtils.ts` (dòng ~284 `buildCreateActiveRequestPayload`)
- Modify (chain đổi chữ ký): `frontend/src/contexts/PaymentFlowContext.tsx` (dòng ~371 `handleCreateActiveRequest`), `frontend/src/components/PaymentRequestsTab.tsx` (dòng ~747 `onCreateActiveRequest`), `frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx` (props dòng ~1547)
- Test: `frontend/src/components/payment-request/paymentRequestUtils.test.ts` (SỬA test hiện có dòng ~120 gọi chữ ký cũ `(pr, string)` + thêm case mới)

- [ ] **Step 1: Thêm type vào `types/paymentRequest.ts`** (cạnh `CreateActiveRequestPayload` dòng ~236):

```ts
/** 1 dòng trong modal "Kích hoạt khoá học" mở rộng: 1 gói gán cho 1 bé */
export type ArDraftRow = {
  childName: string;   // "" khi PR không có tên con (fallback bé 1)
  uid: string;         // "" = bé chưa có UID CRM (Ops điền ở B3 → write-back)
  packageName: string;
  amount: number;      // VND
};
```

- [ ] **Step 2: Viết failing tests** (sửa test cũ dòng ~120 + thêm mới):

```ts
it("legacy 1 con 1 gói: payload y hệt flow cũ (G3)", () => {
  // pr fixture có uid="123213213", received=2000 (fixture sẵn trong file)
  const payload = buildCreateActiveRequestPayload(pr, [
    { childName: "", uid: pr.uid, packageName: "2/W-NEW 24 PHI+2 HN", amount: pr.received },
  ]);
  expect(payload.uids).toHaveLength(1);
  expect(payload.uids[0].uid).toBe(pr.uid);
  expect(payload.uids[0].name).toBeUndefined();
  expect(payload.uids[0].courses).toEqual([{ name: "2/W-NEW 24 PHI+2 HN", amount: 2000 }]);
});

it("2 bé → 2 uid block, mỗi block mang name bé", () => {
  const payload = buildCreateActiveRequestPayload(pr, [
    { childName: "Bé Một", uid: "u1", packageName: "Gói A", amount: 1200 },
    { childName: "Bé Hai", uid: "", packageName: "Gói B", amount: 800 },
  ]);
  expect(payload.uids).toHaveLength(2);
  expect(payload.uids[0]).toMatchObject({ uid: "u1", name: "Bé Một" });
  expect(payload.uids[0].courses).toEqual([{ name: "Gói A", amount: 1200 }]);
  expect(payload.uids[1]).toMatchObject({ uid: "", name: "Bé Hai" });
  expect(payload.uids[1].courses).toEqual([{ name: "Gói B", amount: 800 }]);
});

it("2 gói cùng 1 bé → 1 block 2 courses", () => {
  const payload = buildCreateActiveRequestPayload(pr, [
    { childName: "Bé Một", uid: "u1", packageName: "Gói A", amount: 1500 },
    { childName: "Bé Một", uid: "u1", packageName: "Gói phụ", amount: 500 },
  ]);
  expect(payload.uids).toHaveLength(1);
  expect(payload.uids[0].courses).toEqual([
    { name: "Gói A", amount: 1500 },
    { name: "Gói phụ", amount: 500 },
  ]);
});
```

- [ ] **Step 3: Run `npm run test -- paymentRequestUtils` → FAIL** (chữ ký cũ nhận string)

- [ ] **Step 4: Implement** — thay toàn bộ hàm ở `paymentRequestUtils.ts` dòng ~284:

```ts
export function buildCreateActiveRequestPayload(pr: PaymentRequest, rows: ArDraftRow[]): CreateActiveRequestPayload {
  const blocks = new Map<string, CreateActiveRequestUidPayload>();
  for (const row of rows) {
    const key = `${row.childName.trim()}|${row.uid.trim()}`;
    let block = blocks.get(key);
    if (!block) {
      block = {
        uid: row.uid.trim(),
        phone: pr.phone,
        country: pr.country,
        courses: [],
      };
      const name = row.childName.trim();
      // Tên bé chỉ gửi khi có — PR 1 con không tên giữ payload y hệt cũ (G3)
      if (name) block.name = name;
      blocks.set(key, block);
    }
    // Tên gói bắt buộc — BE chặn tạo AR khi name rỗng (tin Zalo bắn ngay lúc tạo)
    block.courses.push({ name: row.packageName.trim(), amount: Math.max(0, Math.round(row.amount)) });
  }
  return { uids: [...blocks.values()] };
}
```

Đổi chain chữ ký (3 file):

`PaymentFlowContext.tsx` dòng ~371:

```ts
  const handleCreateActiveRequest = useCallback(
    async (pr: PaymentRequest, rows: ArDraftRow[]) => {
      try {
        const res = await endpoints.paymentRequests.createActiveRequest(
          pr.id,
          buildCreateActiveRequestPayload(pr, rows)
        );
        // ... phần còn lại giữ nguyên
```

`PaymentRequestsTab.tsx` dòng ~747:

```ts
  const onCreateActiveRequest = async (rows: ArDraftRow[]) => {
    if (!selected || arByPrId[selected.id]) return;
    await handleCreateActiveRequest(selected, rows);
  };
```

`PaymentRequestDetailDrawer.tsx` props dòng ~1547:

```ts
  onCreateActiveRequest: (rows: ArDraftRow[]) => void;
```

(Import `ArDraftRow` từ `types/paymentRequest` ở cả 3 file + `paymentRequestUtils.ts`.)

- [ ] **Step 5: Run test → PASS. `npx tsc -b` sẽ còn FAIL ở modal (chữ ký cũ tại call site dòng ~2551) — fix ở Task 11.**

### Task 11: FE — Modal "Kích hoạt khoá học" mở rộng (nhiều dòng bé/gói/tiền)

**Files:**
- Modify: `frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx`
  - State dòng ~1572–1573 (`arPackageModalOpen`, `arPackageName`)
  - Nút mở modal dòng ~2487–2503
  - Modal JSX dòng ~2507–2559
- Component sẵn có để dùng lại: `Combobox` (import dòng 20, props `value/onChange/options/placeholder/emptyLabel`), `MoneyInput` (`frontend/src/components/ui/MoneyInput.tsx`, props `value: string` (digits) + `onValueChange(digits)`), `COURSE_PACKAGE_OPTIONS` (dòng 53).

- [ ] **Step 1: Thay state** (dòng ~1572):

```tsx
  const [arPackageModalOpen, setArPackageModalOpen] = useState(false);
  const [arDraftRows, setArDraftRows] = useState<ArDraftRow[]>([]);
```

(Xoá `arPackageName`. Import `ArDraftRow` từ `../../types/paymentRequest`.)

- [ ] **Step 2: Seed rows khi mở modal** — trong onClick của nút "Kích hoạt khoá học" (dòng ~2491, sau guard missing bills), thay 2 dòng `setArPackageName(""); setArPackageModalOpen(true);` bằng:

```tsx
                const kids = (request.children?.length ? request.children : [{ name: request.childName ?? "", uid: request.uid }]);
                setArDraftRows(kids.map((c, i) => ({
                  childName: c.name ?? "",
                  uid: c.uid ?? "",
                  packageName: "",
                  // Bé 1 nhận tạm toàn bộ tiền đã thu; bé 2+ = 0, sale tự chia lại
                  amount: i === 0 ? Math.max(0, request.received) : 0,
                })));
                setArPackageModalOpen(true);
```

- [ ] **Step 3: Viết lại modal body** (thay khối dòng ~2507–2559). Helpers đặt ngay trên JSX return (cùng scope render):

```tsx
  const arChildren = request.children ?? [];
  const arMultiChild = arChildren.length >= 2;
  const arTotal = arDraftRows.reduce((s, r) => s + (r.amount || 0), 0);
  const arReceived = Math.max(0, request.received);
  const arRemaining = arReceived - arTotal;
  const arRowsValid = arDraftRows.length > 0 && arDraftRows.every(
    (r) => r.packageName.trim() && r.amount > 0 && (!arMultiChild || r.childName.trim())
  );
  const arValid = arRowsValid && arRemaining >= 0;
  const setArRow = (i: number, patch: Partial<ArDraftRow>) =>
    setArDraftRows((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
```

Modal JSX:

```tsx
      {arPackageModalOpen && (
        <div
          className="gmv-prototype-modal-scrim"
          onClick={() => setArPackageModalOpen(false)}
          style={{ zIndex: 140 }}
        >
          <div className="modal" style={{ width: "min(560px, 100%)" }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h3>Chọn gói học để kích hoạt</h3>
                <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
                  Tên gói sẽ gửi kèm thông báo cho Ops — bắt buộc điền trước khi tạo yêu cầu.
                  {arMultiChild && " PR này có nhiều bé — mỗi dòng là 1 gói cho 1 bé."}
                </div>
              </div>
              <button className="drawer-close" onClick={() => setArPackageModalOpen(false)}>
                <Icons.Close size={16} />
              </button>
            </div>
            <div className="modal-body">
              {arDraftRows.map((row, i) => (
                <div key={i} className="field" style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 10 }}>
                  {arMultiChild && (
                    <div style={{ flex: "0 0 140px" }}>
                      <label>Bé</label>
                      <select
                        value={row.childName}
                        onChange={(e) => {
                          const kid = arChildren.find((c) => c.name === e.target.value);
                          setArRow(i, { childName: e.target.value, uid: kid?.uid ?? "" });
                        }}
                      >
                        {arChildren.map((c, j) => (
                          <option key={j} value={c.name}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div style={{ flex: 1 }}>
                    <label>Gói học <span style={{ color: "var(--danger)" }}>*</span></label>
                    <Combobox
                      value={row.packageName}
                      onChange={(v) => setArRow(i, { packageName: v })}
                      options={COURSE_PACKAGE_OPTIONS}
                      placeholder="Chọn hoặc gõ tên gói học..."
                      emptyLabel="Chưa chọn gói"
                    />
                  </div>
                  <div style={{ flex: "0 0 130px" }}>
                    <label>Số tiền (đ)</label>
                    <MoneyInput
                      value={row.amount ? String(row.amount) : ""}
                      onValueChange={(digits) => setArRow(i, { amount: Number(digits || 0) })}
                    />
                  </div>
                  {arDraftRows.length > 1 && (
                    <button type="button" className="btn btn-ghost btn-sm" title="Xoá dòng"
                      onClick={() => setArDraftRows((rows) => rows.filter((_, j) => j !== i))}>
                      <Icons.Close size={14} />
                    </button>
                  )}
                </div>
              ))}
              <button type="button" className="btn btn-outline btn-sm"
                onClick={() => setArDraftRows((rows) => [...rows, {
                  childName: arChildren[0]?.name ?? "", uid: arChildren[0]?.uid ?? "", packageName: "", amount: 0,
                }])}>
                <Icons.Plus size={13} /> Thêm gói{arMultiChild ? " / bé" : ""}
              </button>
              <div style={{ marginTop: 12, fontSize: 12.5 }}>
                Đã phân bổ <strong>{arTotal.toLocaleString("vi-VN")} đ</strong> / thực nhận{" "}
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
            </div>
            <div className="modal-foot">
              <button type="button" className="btn btn-outline" onClick={() => setArPackageModalOpen(false)}>
                Huỷ
              </button>
              <button
                type="button"
                className="btn btn-success"
                disabled={!arValid}
                style={!arValid ? { opacity: 0.4, cursor: "not-allowed" } : undefined}
                onClick={() => {
                  if (!arValid) return;
                  setArPackageModalOpen(false);
                  onCreateActiveRequest(arDraftRows);
                }}
              >
                <Icons.CheckSquare size={14} /> Tạo yêu cầu kích hoạt
              </button>
            </div>
          </div>
        </div>
      )}
```

Import `MoneyInput` nếu file chưa có: `import { MoneyInput } from "../ui/MoneyInput";` (grep trước — drawer có thể đã import từ commit f1e51eb).

- [ ] **Step 4: `npx tsc -b` + `npm run test` → PASS** (toàn bộ chain Task 10 + 11 phải khớp chữ ký)

### Batch C commit (main session — G8)

```bash
git add backend/activation_routes.py backend/tests/test_pr_multi_child.py frontend/src/types/paymentRequest.ts frontend/src/components/ActivationTab.tsx frontend/src/components/PaymentRequestsTab.tsx frontend/src/contexts/PaymentFlowContext.tsx frontend/src/components/payment-request/paymentRequestUtils.ts frontend/src/components/payment-request/paymentRequestUtils.test.ts frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx
git diff --staged   # xác nhận không dính hunk task khác (G8)
git commit -m "feat(pr-multi-con): B3 chọn bé + write-back UID + modal AR mở rộng nhiều bé/gói/tiền"
```

---

## Verify cuối (main session, sau 3 batch)

- [ ] `cd backend && python -m pytest tests/ -q` — full suite PASS
- [ ] `cd frontend && npx tsc -b && npm run test && npm run build` — PASS
- [ ] Push `sandbox` → Vercel sandbox tự deploy; BE: `bash scripts/deploy.sh sandbox`
- [ ] **Smoke checklist trên https://palfish-gmv-manager-sandbox.vercel.app/** (login test.user@dev):

  *Multi-con (B1/B2):*
  1. Tạo PR 1 con → form y hệt cũ, không thấy control mới. Tạo lần TT → không có dropdown bé.
  2. Tạo PR 2 con ("Bé A", "Bé B" — B chưa có UID) → PR hiện đủ 2 tên.
  3. Tạo lần TT chọn Bé B → nội dung CK chứa tên Bé B; lần TT list có badge Bé B.
  4. Sửa PR đổi tên "Bé B" → "Bé B2" → badge line đổi theo; QR pending hiện cảnh báo stale.
  5. (Admin) Modal ghép CK ngoài: candidate của line Bé B hiện "Bé B2", không phải tên bé 1.
  6. Xóa bé đang có lần TT trong form sửa → bị chặn.

  *AR modal mở rộng (B1→B3):*
  7. PR 1 con đủ tiền → modal hiện 1 dòng: gói trống + tiền = thực nhận. Chọn gói, không sửa gì khác → tạo AR y hệt flow cũ (1 block, 1 course); tin Zalo (nếu bật trên sandbox → 🧪 [TEST]) format như cũ.
  8. PR 2 con đủ tiền → modal hiện 2 dòng (Bé A = full tiền, Bé B = 0). Chia lại tiền + chọn 2 gói → tạo AR 2 block; B3 hiện 2 UID block đúng tên bé; tin Zalo 1 tin đủ "Bé A, Gói X" + "Bé B, Gói Y".
  9. Tổng phân bổ > thực nhận → dòng đỏ "vượt X đ", nút Tạo disabled.
  10. Bấm "Thêm gói", chọn cùng 1 bé 2 gói → AR 1 block 2 course trong B3.
  11. Bé B chưa có UID → tạo AR bình thường (block uid rỗng); B3 sửa UID cho block Bé B → mở lại PR thấy UID đã ghi ngược vào Bé B.
  12. Còn tiền chưa phân bổ (tổng < thực nhận) → hiện note xám, vẫn tạo được.

- [ ] Báo cáo anh Minh: kết quả smoke + số token đã dùng. KHÔNG merge main, KHÔNG đụng prod.

## Ngoài phạm vi (chờ duyệt riêng)
- Backfill 2 PR prod (`PR-2026-0034`, `PR-2026-0132`) — tách tên ghép, làm tay sau khi merge main + migration prod.
- E2E Playwright multi-con + AR modal — viết sau khi flow ổn định trên sandbox (tiết kiệm token/effort vòng này).
- "Bé mới" ngay trong modal AR (hiện chỉ chọn bé đã khai trên PR — thêm bé thì sửa PR trước, đường sửa PR đã có ở Task 7).
- Bắn Zalo bổ sung khi PATCH AR thêm gói sau khi tạo — không cần nữa vì modal mở rộng cho khai đủ ngay lúc tạo; nếu thực tế phát sinh nhu cầu, mở task riêng.
