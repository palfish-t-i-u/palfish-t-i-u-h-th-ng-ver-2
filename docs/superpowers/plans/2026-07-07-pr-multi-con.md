# PR Multi-Con (1 PR nhiều con) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (TOKEN-CAPPED variant — see Guardrails G1) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 1 PR chứa nhiều con — mỗi bé có tên + UID CRM riêng, mỗi lần thanh toán gắn đúng bé, mọi kênh ra (QR, Zalo, modal ghép CK) hiện đúng tên đúng bé.

**Architecture:** Bé 1 giữ nguyên ở `payment_requests.child_name` + `uid` (không đụng 60 refs hiện có). Bé 2+ lưu ở cột JSONB mới `payment_requests.extra_children` (`[{name, uid?}]`). Lần TT gắn bé qua cột mới `payment_lines.student_name` (text NULL = bé 1). B3 `uids_data[]` thêm field `name`, UID nhập ở B3 ghi ngược vào `extra_children`. API trả `children` = list ghép đầy đủ. Mọi cột mới nullable → PR 1 con không đổi hành vi.

**Tech Stack:** FastAPI + Supabase (Postgres/JSONB), React 19 + TS, pytest, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-07-pr-multi-con-design.md`

---

## GUARDRAILS (bắt buộc đọc trước khi làm bất kỳ task nào)

### G1 — Token budget (chỉ thị trực tiếp anh Minh 7/7)
- **Tối đa 3 subagent cho toàn bộ plan** (Batch A/B/C bên dưới), chạy **tuần tự**, KHÔNG song song, KHÔNG spawn reviewer agent riêng — main session tự review diff sau mỗi batch.
- Subagent fail cùng 1 việc 2 lần → DỪNG, báo anh Minh, không spawn thêm.
- Không dùng Workflow tool / fan-out / adversarial multi-vote cho task này.
- Subagent prompt phải trỏ vào plan file này + đúng batch, không paste lại toàn bộ codebase context.

### G2 — Sandbox-only
- Toàn bộ code trên branch `sandbox`. KHÔNG merge main, KHÔNG chạy SQL trên prod (`jozcvbbypwvzaefteoxn`) — kể cả backfill 2 PR cũ (làm sau khi anh Minh duyệt lên prod).
- Migration chỉ apply lên sandbox Supabase (`pxgybyfiwywksesyogti`), do **main session** apply (subagent không đụng MCP Supabase).
- Deploy BE sandbox: `bash scripts/deploy.sh sandbox`. FE: push branch `sandbox` → Vercel tự deploy.

### G3 — Không phá hành vi cũ (tiêu chí "không lỗi con")
- Mọi cột/field mới đều nullable/optional. Thiếu → fallback `child_name` = hành vi hiện tại.
- CẤM sửa nghĩa/tên cột `child_name`, `uid` trên `payment_requests`. CẤM đổi shape phần tử `uids_data` hiện có (chỉ THÊM key `name`).
- PR 1 con: UI không hiện thêm bất kỳ control nào (điều kiện `children.length >= 2`).

### G4 — Verify trước mỗi commit
- BE: `cd backend && python -m pytest tests/ -q` pass.
- FE: `cd frontend && npx tsc -b` pass (KHÔNG dùng `--noEmit`) + `npm run test` pass.
- Commit theo batch (squash, quy ước repo: message tiếng Việt `feat(pr-multi-con): ...`), KHÔNG commit từng micro-step.

### G5 — Zalo an toàn
- Không trigger gửi Zalo thật khi test. Chỉ unit test builder Python + sửa SQL function trong migration. Nếu cần bắn thử trên sandbox → prepend `🧪 [TEST]`.

### G6 — Rollback
- Code: revert commit trên `sandbox`.
- DB: cột mới additive, không cần drop khi rollback code (an toàn để nguyên). Nếu buộc phải gỡ: `ALTER TABLE ... DROP COLUMN IF EXISTS extra_children;` / `... DROP COLUMN IF EXISTS student_name;` + re-apply function từ `2026-07-04-zalo-payment-paid-format-v2.sql`.

---

## Execution model (token-capped)

| Ai | Làm gì |
|---|---|
| **Main session** | Checkout `sandbox`, apply migration lên sandbox DB, dispatch 3 batch tuần tự, review diff sau mỗi batch, chạy verify G4, commit, push, deploy, smoke test, báo cáo |
| **Subagent A** | Batch A — DB migration file + BE core (Tasks 1–4) |
| **Subagent B** | Batch B — FE types + create modal + drawer (Tasks 5–7) |
| **Subagent C** | Batch C — B3 activation BE+FE + write-back UID (Tasks 8–9) |

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

### Task 4: BE — SePay match-candidates + Zalo mirror + stale detection

**Files:**
- Modify: `backend/sepay_routes.py` (~dòng 705–775), `backend/utils/zalo_message_builder.py` (~dòng 156), `backend/payment_request_routes.py` (stale names ~dòng 1117–1140)
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
```

test_sepay_match_candidates.py: theo pattern test hiện có trong file, thêm case line có `student_name="Bé Hai"` → candidate trả `"child_name": "Bé Hai"`.

- [ ] **Step 2: Run → FAIL**

- [ ] **Step 3: Implement**

`zalo_message_builder.py` dòng ~156:

```python
    child_name = _first_nonempty(payment_data.get("student_name"), payment_data.get("child_name"))
```

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

### Batch A commit (main session sau review)

```bash
git add backend/migrations/2026-07-07-pr-multi-child.sql backend/payment_request_routes.py backend/sepay_routes.py backend/utils/zalo_message_builder.py backend/tests/
git commit -m "feat(pr-multi-con): BE — extra_children + payment_lines.student_name + Zalo/SePay/stale theo bé"
```

---

## BATCH B — FE: types, create modal, drawer

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

### Batch B commit (main session)

```bash
git add frontend/src
git commit -m "feat(pr-multi-con): FE — thêm con ở B1/sửa PR, dropdown chọn bé khi tạo lần TT, hiển thị theo bé"
```

---

## BATCH C — B3 Activation: name per UID + write-back

### Task 8: BE — `uids_data[].name` + write-back UID vào PR

**Files:**
- Modify: `backend/activation_routes.py` (`ActiveRequestPatchUidPayload` ~dòng 91–101; handler PATCH AR nơi persist `uids_data` ~dòng 1363)
- Test: `backend/tests/test_pr_multi_child.py` (thêm case)

- [ ] **Step 1: Failing tests**

```python
def test_ar_uid_payload_accepts_name():
    from activation_routes import ActiveRequestPatchUidPayload
    p = ActiveRequestPatchUidPayload(uid="u2", name="Bé Hai")
    assert p.name == "Bé Hai"


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

Helper:

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

### Batch C commit (main session)

```bash
git add backend/activation_routes.py backend/tests/test_pr_multi_child.py frontend/src
git commit -m "feat(pr-multi-con): B3 — chọn bé khi thêm UID, ghi ngược UID vào PR"
```

---

## Verify cuối (main session, sau 3 batch)

- [ ] `cd backend && python -m pytest tests/ -q` — full suite PASS
- [ ] `cd frontend && npx tsc -b && npm run test && npm run build` — PASS
- [ ] Push `sandbox` → Vercel sandbox tự deploy; BE: `bash scripts/deploy.sh sandbox`
- [ ] **Smoke checklist trên https://palfish-gmv-manager-sandbox.vercel.app/** (login test.user@dev):
  1. Tạo PR 1 con → form y hệt cũ, không thấy control mới. Tạo lần TT → không có dropdown bé.
  2. Tạo PR 2 con ("Bé A", "Bé B" — B chưa có UID) → PR hiện đủ 2 tên.
  3. Tạo lần TT chọn Bé B → nội dung CK chứa tên Bé B; lần TT list có badge Bé B.
  4. Sửa PR đổi tên "Bé B" → "Bé B2" → badge line đổi theo; QR pending hiện cảnh báo stale.
  5. (Admin) Modal ghép CK ngoài: candidate của line Bé B hiện "Bé B2", không phải tên bé 1.
  6. B3: tạo AR, Thêm UID mới → bắt buộc chọn bé; chọn Bé B2 + UID → mở lại PR thấy UID đã điền vào Bé B2.
  7. Xóa bé đang có lần TT trong form sửa → bị chặn.
- [ ] Báo cáo anh Minh: kết quả smoke + số token đã dùng. KHÔNG merge main, KHÔNG đụng prod.

## Ngoài phạm vi (chờ duyệt lên prod)
- Backfill 2 PR prod (`PR-2026-0034`, `PR-2026-0132`) — tách tên ghép, làm tay sau khi merge main + migration prod.
- E2E Playwright multi-con — viết sau khi flow ổn định trên sandbox (tiết kiệm token/effort vòng này).
