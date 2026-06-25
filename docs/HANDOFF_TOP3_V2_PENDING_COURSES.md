# HANDOFF — TOP3 V2: Nhắc kích hoạt gấp hỗ trợ nhiều gói pending

**Bối cảnh:** V1 đã deploy (PR-level reminder, rate-limit 1 active/PR). Vấn đề: PR có nhiều gói học, sales chỉ nhắc được 1 lần — không nhắc lại được khi còn gói pending khác.

**Quyết định 23/06/2026:** Đi hướng **C (PR-level + pending courses list)** thay vì B (course-level). Lý do: ít rủi ro lỗi JSONB trigger, FE đơn giản hơn, không spam Zalo group.

**Estimated effort:** ~1-2 giờ.

---

## SCOPE — chỉ thay 4 thứ

### 1. BE — `build_activation_urgent_reminder_message` thêm pending courses

**File:** `backend/utils/zalo_message_builder.py`

**Hiện tại** in: `Gói: 1/2`

**Đổi thành** in cả danh sách gói chưa kích hoạt:
```
⚡ Cần kích hoạt khóa học GẤP
PR-2026-9501 · Phụ huynh A
Gói: 1/2 — Còn: CC-9501-002 · 2/W- Both AB REFER 24 PHI+2 HN
Sale nhắc: Test Sales Rep
Note: KH cần học T2
```

**Input mới của builder** (truyền từ route):
```python
{
    "pr_code": "PR-2026-9501",
    "customer_name": "Phụ huynh A",
    "courses_total": 2,
    "courses_activated": 1,
    "pending_courses": [  # NEW — list dict
        {"code": "CC-9501-002", "name": "2/W- Both AB REFER 24 PHI+2 HN"},
    ],
    "note": "KH cần học T2",
}
```

Nếu `pending_courses` rỗng (edge case không nên xảy ra) → fallback in `Gói: X/Y` như cũ, không in dòng "Còn:".

Nếu list quá dài (>3 courses), in 3 cái đầu + `... (+N gói khác)`.

### 2. BE — Bỏ rate-limit "1 active/PR" → cooldown 15 phút

**File:** `backend/activation_routes.py` — function `create_activation_urgent_reminder`

**Xoá đoạn này:**
```python
existing = sb.table("activation_reminders") \
    .select("id, requested_at, requested_by_name") \
    .eq("payment_request_id", pr_id) \
    .is_("resolved_at", "null") \
    .limit(1).execute()
if existing.data:
    raise HTTPException(429, "Đã có lượt nhắc đang chờ xử lý")
```

**Thay bằng smart cooldown:**
```python
from datetime import datetime, timezone, timedelta

# Cho phép nhắc lại nếu:
#  (a) Reminder gần nhất tạo >15 phút trước, HOẶC
#  (b) Số gói pending hiện tại ÍT HƠN số gói pending lúc nhắc trước
#      (nghĩa là Ops đã xử lý 1 gói, sales được nhắc tiếp ngay)
last = sb.table("activation_reminders") \
    .select("id, requested_at, pending_courses_snapshot") \
    .eq("payment_request_id", pr_id) \
    .is_("resolved_at", "null") \
    .order("requested_at", desc=True) \
    .limit(1).execute()

if last.data:
    last_row = last.data[0]
    last_at = datetime.fromisoformat(last_row["requested_at"].replace("Z", "+00:00"))
    elapsed = datetime.now(timezone.utc) - last_at
    last_pending_count = len(last_row.get("pending_courses_snapshot") or [])
    current_pending_count = len(pending_courses)  # build sau bước parse uids_data

    progress_made = current_pending_count < last_pending_count
    cooldown_elapsed = elapsed >= timedelta(minutes=15)

    if not progress_made and not cooldown_elapsed:
        wait_min = int((timedelta(minutes=15) - elapsed).total_seconds() / 60) + 1
        raise HTTPException(429, f"Đã nhắc gần đây. Đợi ~{wait_min} phút hoặc đợi Ops kích hoạt thêm gói rồi nhắc lại")
```

**Lưu ý hard rule:**
- KHÔNG đụng trigger `fn_auto_resolve_activation_reminders` — vẫn resolve tất cả khi `active_requests.status = 'activated'`. Trigger này đúng cho V2.
- KHÔNG xoá reminder cũ khi tạo mới — để nguyên history, trigger sẽ resolve sau.

### 3. BE — Migration thêm cột `pending_courses_snapshot`

**File mới:** `backend/migrations/2026-06-23-activation-reminders-pending-snapshot.sql`

```sql
ALTER TABLE public.activation_reminders
  ADD COLUMN IF NOT EXISTS pending_courses_snapshot JSONB;

-- Sandbox apply ngay; prod apply cùng migration TOP3 chính
NOTIFY pgrst, 'reload schema';
```

Snapshot lưu list `[{"code", "name"}]` lúc tạo reminder — phục vụ check "progress made" ở cooldown logic. KHÔNG dùng để render UI (UI luôn re-fetch active_request mới nhất).

### 4. BE — Parse pending courses từ `uids_data` trong route

**File:** `backend/activation_routes.py` — trong `create_activation_urgent_reminder`

Sau đoạn `if ar and ar.get("status") == "activated":`, thêm:

```python
pending_courses: list[dict[str, str]] = []
courses_total = 0
courses_activated = 0
if ar and ar.get("uids_data"):
    uids = ar["uids_data"] if isinstance(ar["uids_data"], list) else []
    for uid_block in uids:
        if not isinstance(uid_block, dict):
            continue
        for c in (uid_block.get("courses") or []):
            if not isinstance(c, dict):
                continue
            courses_total += 1
            if (c.get("order_id") or "").strip():
                courses_activated += 1
            else:
                pending_courses.append({
                    "code": c.get("code") or "?",
                    "name": (c.get("name") or "").strip() or "(chưa có tên gói)",
                })

if courses_total > 0 and not pending_courses:
    raise HTTPException(400, "Tất cả gói đã có Order ID — không cần nhắc")
```

Truyền `pending_courses` vào builder + lưu `pending_courses_snapshot` vào reminder row.

**Insert reminder đổi thành:**
```python
reminder = sb.table("activation_reminders").insert({
    "payment_request_id": pr_id,
    "requested_by": actor.user_id,
    "requested_by_name": sale_name,
    "note": note_text or None,
    "pending_courses_snapshot": pending_courses,
}).execute()
```

---

## KHÔNG ĐƯỢC ĐỘNG VÀO

- ❌ FE drawer button `PaymentRequestDetailDrawer.tsx` — điều kiện hiện nút đã đúng (`hasActiveRequest && !allActivated`)
- ❌ FE hook `useActivationRemind` — logic load/remind/error đã đúng
- ❌ FE banner `ActivationTab.tsx` — render `customer_name + requested_by` đủ rồi, KHÔNG thêm course detail vào banner (banner muốn ngắn gọn)
- ❌ Trigger `fn_auto_resolve_activation_reminders` — đúng rồi
- ❌ Bảng `zalo_outbox`, worker, `zalo_team_groups` — không liên quan
- ❌ Schema `activation_reminders` ngoài cột mới `pending_courses_snapshot`
- ❌ KHÔNG refactor route thành class/dataclass — giữ function flat
- ❌ KHÔNG thêm config cho cooldown (`15 phút` hard-code OK)
- ❌ KHÔNG đụng `build_payment_paid_message`, `build_course_activated_message`
- ❌ KHÔNG đụng prod (`jozcvbbypwvzaefteoxn`) — chỉ sandbox

---

## ACCEPTANCE CRITERIA

### Builder
1. Input có `pending_courses=[{code,name}, ...]` → output chứa dòng `Gói: X/Y — Còn: CODE · NAME[, CODE · NAME]...`
2. Input có 4 pending courses → output in 3 cái đầu + ` ... (+1 gói khác)`
3. Input `pending_courses=[]` → fallback in `Gói: X/Y` không có dòng "Còn:"
4. Note có giá trị → append dòng `Note: ...`
5. Note rỗng/None → KHÔNG append dòng Note

### Route POST `/payment-requests/{pr_id}/activation-urgent-remind`
6. PR chưa có AR → 400 `"PR chưa có Active Request"`
7. AR status = `activated` → 400 `"Khóa học đã được kích hoạt"`
8. Tất cả course đã có order_id (edge case AR status chưa update kịp) → 400 `"Tất cả gói đã có Order ID — không cần nhắc"`
9. Reminder gần nhất tạo <15 phút trước VÀ pending count không giảm → 429 với message có chữ "Đợi ~N phút"
10. Reminder gần nhất tạo <15 phút trước NHƯNG pending count đã giảm (Ops xử lý 1 gói) → 200, tạo reminder mới
11. Reminder gần nhất tạo >15 phút trước → 200, tạo reminder mới bất kể pending count
12. Không có reminder unresolved nào → 200, tạo reminder mới
13. Mỗi POST thành công insert đúng 1 row `activation_reminders` với `pending_courses_snapshot` đúng
14. Mỗi POST thành công insert đúng 1 row `zalo_outbox` (trừ trường hợp `is_active=false` → return `zalo: skipped_no_group`)

### Migration
15. Cột `pending_courses_snapshot JSONB` được thêm vào `activation_reminders`, nullable (row cũ V1 = NULL OK)

### E2E sandbox
16. PR có 2 gói, sales nhắc → Zalo nhận `Gói: 0/2 — Còn: CC-XXX-001 · ..., CC-XXX-002 · ...`
17. Ops kích hoạt 1 gói → sales nhắc lại ngay (không đợi 15p) → Zalo nhận `Gói: 1/2 — Còn: CC-XXX-002 · ...`
18. Sales bấm nhắc lần 3 trong vòng 15 phút (không có thay đổi Ops) → bị chặn 429 với message rõ

---

## TEST PLAN

### Manual sandbox (BẮT BUỘC chạy hết)

1. Apply migration sandbox: chạy SQL `ALTER TABLE ... ADD COLUMN pending_courses_snapshot JSONB`
2. Deploy BE: `bash scripts/deploy.sh sandbox`
3. Đợi build live (`mcp__render-sandbox__list_deploys` status=live)
4. Login `test.user@dev` → mở PR-2026-9501 (Phụ huynh A — Demo Referral, 2 gói pending)
5. Bấm nhắc kích hoạt → check nhóm Zalo IH2 nhận tin với format `Gói: 0/2 — Còn: CC-9501-001 · Gói 4/W..., CC-9501-002 · 2/W- Both AB...`
6. SQL manual: `UPDATE active_requests SET uids_data = jsonb_set(uids_data, '{0,courses,0,order_id}', '"FAKE-ORDER-001"') WHERE id = 'AR-2026-9501';` (giả lập Ops kích hoạt 1 gói)
7. Sales bấm nhắc tiếp NGAY → phải PASS (vì pending giảm 2→1), Zalo nhận `Gói: 1/2 — Còn: CC-9501-002 · 2/W- Both AB...`
8. Sales bấm thêm 1 lần nữa ngay → phải bị 429 với "Đợi ~N phút"
9. Reset: `UPDATE active_requests SET uids_data = jsonb_set(uids_data, '{0,courses,0,order_id}', '""') WHERE id = 'AR-2026-9501';` + `DELETE FROM activation_reminders WHERE payment_request_id = 'PR-2026-9501';`

### Type check
```bash
cd backend && python -c "from utils.zalo_message_builder import build_activation_urgent_reminder_message; print(build_activation_urgent_reminder_message({'pr_code':'PR-X','customer_name':'KH','courses_total':2,'courses_activated':1,'pending_courses':[{'code':'CC-1','name':'Gói A'}],'note':'test'},{'display_name':'Sale','team':'Inhouse 2'}))"
```

Expected output: dict với key `message` chứa đúng format trên.

### KHÔNG cần
- ❌ FE test — không đụng FE
- ❌ E2E Playwright — manual đủ
- ❌ Pytest — sandbox manual đủ

---

## ANTI-PATTERNS — đừng làm

1. **ĐỪNG** đụng FE. Tất cả thay đổi BE-only.
2. **ĐỪNG** xoá row `activation_reminders` cũ khi tạo mới — để trigger auto-resolve dọn.
3. **ĐỪNG** thay trigger thành "resolve theo course_code" — V2 vẫn PR-level resolve.
4. **ĐỪNG** lưu pending list vào `note` — note là user input, dùng cột riêng `pending_courses_snapshot`.
5. **ĐỪNG** in pending_courses vào response API — chỉ in vào Zalo message + lưu DB snapshot. FE không cần.
6. **ĐỪNG** sửa builder để return tuple/list — vẫn return `dict {"message", "canonical_team_code"}`.
7. **ĐỪNG** dùng `time.sleep` trong cooldown check — tính bằng `datetime.now() - last_at`.
8. **ĐỪNG** apply migration prod. Chỉ sandbox `pxgybyfiwywksesyogti`.
9. **ĐỪNG** đẻ thêm endpoint `/courses/pending` hay tương tự. Builder đã có data từ AR.
10. **ĐỪNG** quên `from datetime import timezone, timedelta` ở top file nếu chưa có.

---

## FILES TOUCH SUMMARY

| File | Action | LOC delta |
|---|---|---|
| `backend/utils/zalo_message_builder.py` | Sửa `build_activation_urgent_reminder_message` | ~+15 |
| `backend/activation_routes.py` | Sửa `create_activation_urgent_reminder` logic | ~+25, -10 |
| `backend/migrations/2026-06-23-activation-reminders-pending-snapshot.sql` | TẠO MỚI | ~5 |

Total: **3 files, ~35 LOC net.**

---

## ROLLBACK

Nếu V2 gây regression:
1. Revert commit V2
2. Migration KHÔNG cần rollback (cột mới nullable, row cũ vẫn OK)
3. Reminder rows tạo bởi V2 vẫn tương thích V1 (V1 không đọc `pending_courses_snapshot`)
