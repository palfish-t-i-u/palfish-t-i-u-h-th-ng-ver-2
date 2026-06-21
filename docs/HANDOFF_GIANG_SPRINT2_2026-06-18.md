# HANDOFF Giang — Sprint 2 BE (Feedback họp 18/06/2026)

**Phạm vi:** Nhóm 1 — Referral (theo dõi cộng buổi thưởng giới thiệu)
**Ước lượng:** ~2 ngày
**Dependencies:** Không block ai. FE chạy song song UI checkbox + list, chỉ join lúc integrate. Có thể chạy song song với Sprint 1 của Đức.

---

## Bối cảnh nghiệp vụ

Khi 1 phụ huynh giới thiệu phụ huynh khác đăng ký gói học, công ty cộng thêm số buổi học miễn phí cho **cả 2 bên** (người được giới thiệu + người giới thiệu). Hiện tại:

1. Sale nhập số buổi cộng + UID người giới thiệu vào form Active Request (B3).
2. Ops / Manager (chị Thu Hiền hoặc team CRM) **vào CRM cộng buổi thật bằng tay**.
3. **App hiện không có cách nào biết Ops đã cộng buổi chưa.** → Sót case, không trace được, sale cứ giả định Ops làm rồi, Ops giả định sale check, kết quả là nhiều phụ huynh chưa được cộng buổi.

Giải pháp: thêm 2 ô tick "Đã cộng buổi" trong drawer Active Request — 1 cho người được giới thiệu, 1 cho người giới thiệu. Tick = đã làm trong CRM, lưu kèm timestamp + email người tick. Có thêm cột "Thưởng giới thiệu" trong list để Ops biết case nào còn sót. **Sale không được tick** (tránh sale tự xác nhận hộ Ops).

---

## Task list

### T4.1 — Migration: 4 cột credited vào `active_request_courses`

**Bảng:** `active_request_courses` (đã có, mỗi row là 1 course trong 1 active request).

**SQL:**
```sql
ALTER TABLE active_request_courses
  ADD COLUMN referee_credited_at TIMESTAMPTZ,
  ADD COLUMN referee_credited_by TEXT,
  ADD COLUMN referrer_credited_at TIMESTAMPTZ,
  ADD COLUMN referrer_credited_by TEXT;

COMMENT ON COLUMN active_request_courses.referee_credited_at IS
  'Thời điểm Ops xác nhận đã cộng buổi cho người ĐƯỢC giới thiệu (mới đăng ký).';
COMMENT ON COLUMN active_request_courses.referee_credited_by IS
  'Email Ops/Manager tick xác nhận đã cộng cho người được giới thiệu.';
COMMENT ON COLUMN active_request_courses.referrer_credited_at IS
  'Thời điểm Ops xác nhận đã cộng buổi cho người GIỚI THIỆU.';
COMMENT ON COLUMN active_request_courses.referrer_credited_by IS
  'Email Ops/Manager tick xác nhận đã cộng cho người giới thiệu.';
```

Chạy trên cả 2 project Supabase: `jozcvbbypwvzaefteoxn` (prod) + `pxgybyfiwywksesyogti` (sandbox).

**Tại sao 4 cột:** Người được giới thiệu (`referee`) và người giới thiệu (`referrer`) có thể được cộng buổi vào 2 thời điểm khác nhau (vd: Ops vào CRM cộng cho referee trước vì có sẵn UID, còn referrer phải tra cứu thêm). Cho phép tick độc lập.

---

### T4.2 — RBAC: permission `referral.credit`

**File:** `backend/rbac.py`

Thêm permission key `referral.credit` vào permission matrix:
- `sale` = `false` (Sale KHÔNG được tick)
- `leader` = `false` (Leader cũng không — tránh leader tick hộ team)
- `manager` = `true`
- `system` = `true`
- Riêng nhóm `ops` (qua `OPS_EMAILS` env): `true`

Xem pattern các permission đã có (vd: `paymentRequests.write`, `reconciliation.write`) → copy y hệt cấu trúc.

Helper kiểm tra:
```python
def require_referral_credit(sb, actor):
    """Raise 403 nếu actor không có quyền tick 'đã cộng buổi referral'."""
    # Logic: check actor.role + OPS_EMAILS giống các require_* khác
```

FE sẽ check permission qua endpoint `/api/v1/permissions/me` (đã có) — đảm bảo `referral.credit` xuất hiện trong response.

---

### T4.3 — Audit log: 3 action types mới

**Bối cảnh:** Nếu chưa có infrastructure audit log generic (em check `backend/` xem có `audit_logs` table / helper chưa), cần tạo trước:

```sql
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  action TEXT NOT NULL,           -- vd: 'referral.amount_changed'
  actor_email TEXT NOT NULL,
  target_type TEXT,                -- vd: 'active_request_course'
  target_id TEXT,
  payload JSONB,                   -- {old, new, reason, ...}
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_target ON audit_logs(target_type, target_id);
CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_email);
```

**Helper:**
```python
# backend/audit.py (mới)
def log_audit(sb, actor_email: str, action: str, target_type: str, target_id: str, payload: dict | None = None):
    try:
        sb.table("audit_logs").insert({
            "action": action,
            "actor_email": actor_email,
            "target_type": target_type,
            "target_id": target_id,
            "payload": payload or {},
        }).execute()
    except Exception as exc:
        print(f"[audit] log failed: {exc}")  # Không raise — audit không được block business
```

**Action types cần log trong Sprint 2:**
- `referral.amount_changed` — Khi sale sửa số buổi cộng (referee_count / referrer_count) hoặc UID người giới thiệu. Payload: `{old: {referee_count, referrer_count, referrer_uid}, new: {...}}`. Log ngay trong endpoint cập nhật AR course (Giang xác định endpoint đang xử lý field này).
- `referral.credit_confirmed` — Khi Ops tick checkbox "đã cộng buổi". Payload: `{side: "referee"|"referrer", credited_at, credited_by}`.
- `referral.credit_revoked` — Khi Ops untick. Payload: `{side, previous_credited_at, previous_credited_by, reason: <bắt buộc, do FE confirm>}`.

---

### T4.4 — Endpoint `PATCH /api/v1/active-requests/{id}/credit-referral`

**File:** Tạo trong `backend/activation_routes.py` (gần endpoint AR khác) hoặc file riêng nếu cleaner.

**Request body:**
```python
class CreditReferralBody(BaseModel):
    course_id: str           # ID của row trong active_request_courses
    side: Literal["referee", "referrer"]
    credited: bool
    reason: str | None = None  # Bắt buộc khi credited=False (uncheck)
```

**Logic:**
```python
@router.patch("/api/v1/active-requests/{ar_id}/credit-referral")
def credit_referral(ar_id: str, body: CreditReferralBody, authorization: str | None = Header(None)):
    sb = _sb_or_503(get_supabase)
    actor = resolve_actor(sb, authorization)
    require_referral_credit(sb, actor)  # T4.2

    # 1. Lấy course
    course_res = sb.table("active_request_courses").select("*").eq("id", body.course_id).eq("active_request_id", ar_id).limit(1).execute()
    if not course_res.data:
        raise HTTPException(404, "Không tìm thấy course trong active request này")
    course = course_res.data[0]

    # 2. Validate uncheck phải có lý do
    if not body.credited and not (body.reason and body.reason.strip()):
        raise HTTPException(400, "Bỏ tick xác nhận cần kèm lý do")

    # 3. Update field tương ứng
    now = _iso_now()
    if body.side == "referee":
        update_fields = {
            "referee_credited_at": now if body.credited else None,
            "referee_credited_by": actor.email if body.credited else None,
        }
    else:  # referrer
        update_fields = {
            "referrer_credited_at": now if body.credited else None,
            "referrer_credited_by": actor.email if body.credited else None,
        }

    res = sb.table("active_request_courses").update(update_fields).eq("id", body.course_id).execute()
    if not res.data:
        raise HTTPException(500, "Cập nhật thất bại")

    # 4. Audit log
    if body.credited:
        log_audit(
            sb, actor.email, "referral.credit_confirmed",
            "active_request_course", body.course_id,
            {"side": body.side, "credited_at": now}
        )
    else:
        log_audit(
            sb, actor.email, "referral.credit_revoked",
            "active_request_course", body.course_id,
            {
                "side": body.side,
                "previous_credited_at": course.get(f"{body.side}_credited_at"),
                "previous_credited_by": course.get(f"{body.side}_credited_by"),
                "reason": body.reason.strip(),
            }
        )

    return res.data[0]
```

---

### T6.1 — Aggregate `referral_status` cho list AR + list PR

**Bối cảnh:** Ops cần lọc nhanh case nào "chưa cộng đủ buổi" trong list AR. FE sẽ hiện chip ⏳ (chưa cộng) / ✅1/2 (cộng 1 bên) / ✅✅ (cộng đủ 2 bên).

**Logic tính `referral_status` cho 1 row AR:**
- Duyệt qua tất cả `active_request_courses` của AR đó **có** `referrer_uid IS NOT NULL` (tức là có referral).
- Với mỗi course có referral, đếm trạng thái:
  - `referee_credited_at IS NOT NULL` AND `referrer_credited_at IS NOT NULL` → `full`
  - Cả 2 NULL → `none`
  - Còn lại → `partial`
- Tổng hợp toàn AR: `none` nếu mọi course chưa cộng gì, `full` nếu mọi course đã đủ, `partial` ngược lại. Nếu AR không có course nào có referral → `referral_status = null` (FE không hiện chip).

**Implement:**
- Endpoint list AR (`backend/activation_routes.py`, tên function khả năng `list_active_requests`): khi serialize mỗi AR, fetch luôn courses và compute. Hoặc nếu list query đã join courses → compute inline.
- Endpoint list PR (`backend/payment_request_routes.py`, function `list_payment_requests`): với mỗi PR, tra AR liên quan (nếu có) → lấy `referral_status`. Nếu PR không link AR → `null`.

**Response field:** thêm `referral_status: "none" | "partial" | "full" | null` vào mỗi row của 2 list endpoint này.

**Performance:** Batch query courses theo `active_request_id IN (...)` rồi group ở Python, đừng query từng row.

---

## Test plan

### Unit/integration
1. **T4.1 migration:** confirm 4 cột tồn tại sau migration, default NULL.
2. **T4.2 RBAC:** test với JWT của sale → endpoint trả 403. Với manager/ops email → 200.
3. **T4.4 endpoint:**
   - Tick referee → DB lưu `referee_credited_at`, `referee_credited_by`. Audit log có row `referral.credit_confirmed`.
   - Untick không có reason → 400.
   - Untick với reason → DB null cả 2 field, audit log `referral.credit_revoked` có reason trong payload.
4. **T6.1 aggregate:**
   - AR có 1 course referral, cả 2 NULL → `referral_status = "none"`.
   - 1 bên có timestamp → `"partial"`.
   - Cả 2 có → `"full"`.
   - AR không có course referral → `null` (FE không hiện chip).

### Smoke
- Deploy sandbox: `bash scripts/deploy.sh sandbox`.
- FE sẽ tích hợp UI checkbox + list filter sau, anh Minh test e2e cùng.

---

## Lưu ý chung

- **Backward compat:** Tất cả field mới đều nullable / optional. Tick/untick không ảnh hưởng business logic khác (vd: status AR, kích hoạt course...).
- **Audit log không block business:** `log_audit` phải swallow exception, không raise. Nếu audit table chưa tồn tại trên prod thì endpoint chính vẫn chạy được.
- **Sale có thể vẫn sửa số buổi:** T4.2 chỉ chặn `referral.credit` (tick "đã cộng"). Sale vẫn được phép sửa `referrer_count`, `referee_count`, `referrer_uid` qua endpoint AR update hiện tại — chỉ log audit thêm `referral.amount_changed`.

---

## Files cần đụng

| File | Lý do |
|---|---|
| Migration SQL | T4.1 (4 cột) + T4.3 (table `audit_logs` nếu chưa có) |
| `backend/rbac.py` | T4.2 (permission `referral.credit` + helper `require_referral_credit`) |
| `backend/audit.py` (mới) | T4.3 (helper `log_audit`) |
| `backend/activation_routes.py` | T4.4 (endpoint credit-referral) + T6.1 (list AR thêm `referral_status`) + T4.3 (log `referral.amount_changed` trong endpoint update AR course) |
| `backend/payment_request_routes.py` | T6.1 (list PR thêm `referral_status`) |

---

## Câu hỏi cần xác nhận trước khi code

1. **Schema `active_request_courses` hiện tại:** Có field `referrer_uid`, `referee_count`, `referrer_count` chưa? Hay nằm trong JSONB của `active_requests.uids_data`? Nếu nằm JSONB → migration / RBAC / aggregate phải xử lý kiểu khác. Em đọc schema trước khi viết SQL.
2. **Bảng `audit_logs`:** Đã tồn tại chưa? Test code `backend/tests/test_audit_other.py` có gợi ý — em check xem có insert mẫu nào không.
3. **`OPS_EMAILS` vs role `manager`:** Anh Hiếu / chị Thu Hiền dùng email nào? Email đó có nằm trong `OPS_EMAILS` env không? Xác nhận để gán permission đúng.
4. **Endpoint cập nhật course (cho `referral.amount_changed`):** Endpoint nào hiện đang cho sale sửa `referrer_uid` / số buổi? Em cần log audit ngay trong endpoint đó.

Hỏi anh Minh / Đức trước khi bắt đầu nếu chưa rõ.
