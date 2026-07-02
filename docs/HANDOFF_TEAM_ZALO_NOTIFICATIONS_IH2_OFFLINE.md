# HANDOFF TEAM — Thông báo Zalo tự động cho nhóm báo tiền IH2 & Offline

**Ngày:** 02/07/2026
**Phân công:** Đạt (Workstream A) · Đức (Workstream B) · Giang (Workstream C)
**Nhóm đích:** Nhóm Zalo báo tiền của team **Inhouse 2 (IH2)** và **Offline** (đã map sẵn trong `zalo_team_groups`)

---

## 1. Bối cảnh & yêu cầu

Nhóm Zalo báo tiền IH2/Offline cần 3 loại thông báo tự động:

| # | Thông báo | Trạng thái |
|---|---|---|
| 1 | **Báo tiền về** | ✅ Đã có — **giữ nguyên format, KHÔNG sửa** |
| 2 | **Báo yêu cầu kích hoạt khoá học** (kèm **ảnh bill** + tên khoá học, theo format bàn giao của sale) | ❌ Làm mới |
| 3 | **Báo khoá học đã kích hoạt thành công** | ⚠️ Đã có, cần bổ sung SĐT/UID/gói |

Format bàn giao của sale (mẫu thật trên nhóm Zalo — chị Thu Hiền gửi):

```
SĐT: 84-772333555
UID: 3307542974
Thành Nam 9T, Phil 48+5 fix 2b/tuần
Nguồn: Kho chung - Imperia
Tổng: 8.500.000 VNĐ
[ảnh bill chuyển khoản]
```

---

## 2. Kết quả audit hệ thống hiện tại

Kiến trúc Zalo hiện tại là **outbox + worker**:
sự kiện → insert `zalo_outbox` → `backend/zalo_outbox_worker.py` (poll 30s, retry backoff [30,120,300,900]s, max 4, fatal codes {-213,-214,-215} dead-letter) → `backend/zalo_notifier.py` gọi Zalo OA API (tự refresh token khi hết hạn).

Routing nhóm: `payment_requests.sale_email → nhan_su_sale.team → zalo_team_groups(team_code → group_id)`.

**Chi tiết từng thông báo:**

1. **Báo tiền về** — DB trigger `trg_payment_paid_zalo` trên `payment_lines` (status → `'paid'`), message build bởi SQL fn `build_payment_paid_message` (bản mới nhất: `backend/migrations/2026-06-29-zalo-msg-use-crm-name.sql`). Format: `💰 Đã vào - KH %s | Sale %s · Team %s | %sđ | %s`. **Không đụng vào.**
2. **Báo yêu cầu kích hoạt** — chưa có gì. Không có trigger/enqueue nào khi tạo Active Request.
3. **Báo kích hoạt thành công** — DB trigger `trg_course_activated_zalo` trên `active_requests` (status → `'activated'`, tức mọi course trong `uids_data` đã có `order_id`), SQL fn `build_course_activated_message`. Format hiện tại 1 dòng: `✅ ĐÃ KÍCH HOẠT THÀNH CÔNG GÓI HỌC — KH %s của %s · Team %s với gói %s` — thiếu SĐT/UID.

**Gap lớn nhất:** `zalo_notifier.py` chỉ gửi được **text** (`{"message": {"text": ...}}` — `_send_once` dòng 290-302). Chưa có bất kỳ đường gửi ảnh nào (client, worker, admin UI, API types). Yêu cầu #2 cần ảnh bill → phải xây hạ tầng gửi ảnh (Workstream A).

**Facts kỹ thuật quan trọng (đã verify trong code):**

- `active_requests.id` là **TEXT** (`AR-2026-0001`) nhưng `zalo_outbox.source_id` là **UUID** → trigger cũ dùng `md5(NEW.id)::uuid`; code Python mới phải làm giống: `str(uuid.UUID(hashlib.md5(ar_id.encode()).hexdigest()))`.
- `zalo_outbox.event_type` có **CHECK constraint** chỉ cho `payment_paid | course_activated | activation_urgent_reminder` → phải ALTER thêm event mới.
- Idempotency: `UNIQUE(source_table, source_id, event_type)` trên `zalo_outbox`.
- Ảnh bill nằm trên `payment_lines.bill_image` (URL mới nhất) / `bill_images` (TEXT[]), bucket Supabase Storage `bills`, public URL. Từ AR: `AR.pr_id → payment_lines(payment_request_id, status='paid')`.
- Nguồn (lead) nằm trên PR: `lead_channel` → fallback `lead_source`.
- Đã có pattern enqueue Python inline mẫu: urgent reminder trong `activation_routes.py:1944-2048`.
- Canonical hoá team: `backend/utils/team_mapper.py` `get_canonical_team()` — `"IH2" → "Inhouse 2"`, `"Offline"` giữ nguyên.
- Cả 2 endpoint tạo AR (`POST /api/v1/payment-requests/{pr_id}/active-requests` và `POST /api/v1/active-requests`) đều đi qua `_save_active_request` (`activation_routes.py:943-999`) → hook 1 chỗ là đủ.

---

## 3. Quyết định thiết kế

| Quyết định | Chọn | Lý do |
|---|---|---|
| Gửi ảnh | Download bill URL → upload Zalo `/v2.0/oa/upload/image` lấy `attachment_id` → gửi group message với attachment media-template. **Text gửi trước, ảnh gửi sau (best-effort)** | Text luôn đến (retry semantics giữ nguyên); ảnh fail → gửi fallback `📎 Bill: {url}` + ghi `image_error`; ảnh không bao giờ làm dead-letter thông báo |
| Cơ chế event #2 | **Python inline** trong `_save_active_request`, không dùng DB trigger | Cần join bill từ `payment_lines` + Nguồn từ PR + parse `uids_data` JSONB — dễ trong Python, khổ trong plpgsql. Chỉ enqueue (worker gửi) nên không chậm API |
| Enrich event #3 | Migration `CREATE OR REPLACE build_course_activated_message` (SQL là live path) + sửa Python mirror builder cho khớp | Giữ đúng kiến trúc hiện tại |
| Routing | Giữ nguyên theo team của sale → `zalo_team_groups`. Skip nếu `is_test` / thiếu team / thiếu group active (log warning) | Chỉ team có group active nhận — hiện đúng là IH2 & Offline; sau này thêm team chỉ cần thêm row |

### Format message #2 — Yêu cầu kích hoạt (theo mẫu bàn giao của sale)

```
🆕 YÊU CẦU KÍCH HOẠT KHOÁ HỌC — AR-2026-0001
SĐT: 84-772333555
UID: 3307542974
Thành Nam 9T, Phil 48+5 fix 2b/tuần
Nguồn: Kho chung - Imperia
Tổng: 8.500.000 VNĐ
Sale: Trần Thị B · Team Inhouse 2
```
(+ ảnh bill gửi kèm ngay sau tin text)

Mapping dữ liệu:
- `SĐT` = `uid_block.phone` → fallback `pr.phone`
- `UID` = `uid_block.uid`
- Dòng gói = `{pr.child_name || ar.customer_name || pr.name}, {course.name}` (mỗi course 1 dòng)
- `Nguồn` = `pr.lead_channel` → `pr.lead_source` → `"?"`
- `Tổng` = sum(`course.amount`) → fallback `pr.target`, format **chấm** phân cách: `8.500.000 VNĐ` (helper mới `_format_vnd_dots` — KHÔNG sửa `_format_vnd` cũ đang dùng dấu phẩy)
- Nhiều UID → nhiều block, cách nhau dòng trống

### Format message #3 — Kích hoạt thành công (enrich)

```
✅ ĐÃ KÍCH HOẠT THÀNH CÔNG GÓI HỌC
KH: {customer} · Sale {sale_name} · Team {team}
SĐT: {phone} · UID: {uid1, uid2…}
Gói: {danh sách tên gói}
```

### Contract chung (chốt ngay ngày 1, các workstream code song song)

1. Row outbox mới: `{event_type: 'activation_request_created', source_table: 'active_requests', source_id: md5-uuid(ar_id), group_id, message, image_url (nullable)}`
2. Chữ ký: `send_image_to_group(group_id, image_url, *, caption=None, sb=None) -> message_id`, raise `ZaloAPIError` (có `zalo_error` để worker detect fatal code)
3. Chữ ký builder: `build_activation_request_created_message(ar_data, pr_data, sale_info) -> {"message", "canonical_team_code"}`
4. Cột mới trên `zalo_outbox`: `image_url TEXT`, `image_sent_at TIMESTAMPTZ`, `image_error TEXT`

---

## 4. 🔵 ĐẠT — Workstream A: Hạ tầng gửi ảnh Zalo

> Nền tảng cho cả team. **Migration của A phải merge ĐẦU TIÊN.**

### A1. Spike Zalo API (timebox 0.5 ngày, làm đầu tiên)
Docs Zalo bị login-wall — test thật với OA + nhóm staging xem payload nào gửi ảnh được qua `POST https://openapi.zalo.me/v3.0/oa/group/message`:
- **Variant 1 (chính):** upload trước — multipart `POST https://openapi.zalo.me/v2.0/oa/upload/image` (header `access_token`) → `data.attachment_id`, rồi gửi group message với `message.attachment = {"type":"template","payload":{"template_type":"media","elements":[{"media_type":"image","attachment_id":"..."}]}}` (thử kèm `message.text` làm caption chung 1 payload).
- **Variant 2 (dự phòng):** element `{"media_type":"image","url":"<public bill URL>"}` không cần upload.

Tham khảo: [zalo-oa-api-wrapper](https://github.com/nh4ttruong/zalo-oa-api-wrapper), [eSMS Zalo image docs](https://developers.esms.vn/en/esms-api/send-sms-api/send-zalo-message-with-attached-photo), [zalo-php-sdk](https://github.com/zaloplatform/zalo-php-sdk).

### A2. Migration mới — `backend/migrations/2026-07-02-zalo-outbox-image-and-ar-created-event.sql`

```sql
-- 1. Hỗ trợ ảnh trên outbox
ALTER TABLE public.zalo_outbox
  ADD COLUMN IF NOT EXISTS image_url     TEXT,
  ADD COLUMN IF NOT EXISTS image_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS image_error   TEXT;

-- 2. Event type mới
ALTER TABLE public.zalo_outbox DROP CONSTRAINT IF EXISTS zalo_outbox_event_type_check;
ALTER TABLE public.zalo_outbox ADD CONSTRAINT zalo_outbox_event_type_check
  CHECK (event_type = ANY (ARRAY[
    'payment_paid'::text, 'course_activated'::text,
    'activation_urgent_reminder'::text, 'activation_request_created'::text]));
```

### A3. `backend/zalo_notifier.py`
- `ZALO_UPLOAD_IMAGE_URL = "https://openapi.zalo.me/v2.0/oa/upload/image"`
- `_fetch_image_bytes(image_url) -> tuple[bytes, str]` — httpx GET public bill URL
- `_upload_image(image_bytes, filename, access_token) -> str` — trả `attachment_id`
- Refactor `_send_once` → `_send_group_payload_once(payload, access_token)` (nhận payload bất kỳ)
- `send_image_to_group(group_id, image_url, *, caption=None, sb=None) -> str` — cùng cấu trúc refresh-once-retry-once như `send_text_to_group` (dòng 312-333)
- ⚠️ **KHÔNG đổi hành vi `send_text_to_group`** — báo tiền về phải giữ nguyên 100%.

### A4. `backend/zalo_outbox_worker.py`
Trong vòng lặp row, **sau khi text gửi thành công và row đã mark sent**:

```python
image_url = (row.get("image_url") or "").strip()
if image_url:
    try:
        await asyncio.to_thread(send_image_to_group, group_id, image_url, sb=sb)
        # update image_sent_at
    except Exception as img_exc:
        # fallback: gửi text "📎 Bill: {image_url}" (best-effort), ghi image_error
```
Quy tắc: ảnh chỉ **1 lần best-effort**, không đụng `retries`/`next_retry_at`/`sent_at`, không đổi retry/fatal/dead-letter semantics hiện có.

### A5. `backend/admin_routes.py` — test send kèm ảnh
- Thêm `image_url: str | None = None` vào `ZaloTestMessagePayload` (dòng ~117)
- `test_zalo_config` (dòng ~1481): nếu có `image_url` → gọi `send_image_to_group` sau text

### A6. Tests
- `backend/tests/test_zalo_notifier.py`: mock httpx — upload happy path; shape payload attachment; auth error → refresh → retry; upload fail raise `ZaloAPIError`
- `backend/tests/test_zalo_outbox_worker.py`: row có `image_url` thành công (set `image_sent_at`); ảnh fail (gửi fallback link + set `image_error`, row vẫn `sent_at`); không có `image_url` → hành vi y hệt hiện tại

---

## 5. 🟢 ĐỨC — Workstream B: Event "yêu cầu kích hoạt khoá học"

> Code song song với A theo contract mục 3. **Merge/test integration sau khi migration A đã apply.**

### B1. Builder mới — `backend/utils/zalo_message_builder.py`

```python
def build_activation_request_created_message(
    ar_data: dict,    # {id, customer_name, uids_data}
    pr_data: dict,    # {id, name, child_name, phone, lead_source, lead_channel, target}
    sale_info: dict,  # {display_name, crm_name, team}
) -> dict[str, str]:  # {"message": ..., "canonical_team_code": ...}
```
- Theo convention module: **không bao giờ raise**, thiếu field → `logger.warning` + default an toàn, canonical team qua `get_canonical_team`
- Format + mapping theo mục 3. Helper mới `_format_vnd_dots(n)` → `"8.500.000 VNĐ"`

### B2. Enqueue — `backend/activation_routes.py`
Helper mới `_enqueue_activation_request_created_zalo(sb, saved_ar, pr) -> None`, gọi cuối `_save_active_request` (trước `return` dòng 999), **bọc `try/except Exception: log`** — không bao giờ được làm fail API tạo AR. Cover cả 2 endpoint tạo AR.

Logic (mirror urgent reminder dòng 1944-2048):
1. Skip (log warning) nếu: `pr is None` / `pr.is_test` hoặc `saved_ar.is_test` / sale không có team / không có row `zalo_team_groups` active cho `get_canonical_team(team)`
2. Sale info: `nhan_su_sale` where `email ILIKE pr.sale_email` → `{team, display_name, crm_name}`
3. Bill: `payment_lines` where `payment_request_id = pr.id AND status = 'paid'` order `paid_at desc` → `bill_image` (fallback `bill_images[-1]`); không có → gửi text-only (image_url = None)
4. Insert outbox:

```python
source_uuid = str(uuid.UUID(hashlib.md5(saved_ar["id"].encode()).hexdigest()))
sb.table("zalo_outbox").insert({
    "event_type": "activation_request_created",
    "source_table": "active_requests",
    "source_id": source_uuid,
    "group_id": group_id,
    "message": result["message"],
    "image_url": bill_url,  # nullable
}).execute()  # duplicate key (UNIQUE constraint) → swallow, idempotent
```

### B3. Tests
- `tests/test_zalo_builder.py`: output đúng template với data đủ; multi-UID nhiều block; thiếu phone/uid/nguồn; format tiền `8500000 → "8.500.000 VNĐ"`; team `"IH2"` → canonical `"Inhouse 2"`
- `backend/tests/test_zalo_integration.py`: tạo AR → enqueue row đúng contract kèm `image_url`; skip khi `is_test`; skip khi thiếu group; duplicate insert = no-op; exception trong enqueue không làm hỏng response endpoint

---

## 6. 🟡 GIANG — Workstream C: Enrich kích hoạt thành công + Admin UI + E2E

> C1/C2 độc lập hoàn toàn với A/B. C3 code song song (contract cột đã chốt). C4 chạy CUỐI.

### C1. Migration mới — `backend/migrations/2026-07-02-zalo-course-activated-enrich.sql`
`CREATE OR REPLACE FUNCTION public.build_course_activated_message(ar_row public.active_requests)` — lấy base từ bản `2026-06-29-zalo-msg-use-crm-name.sql` (dòng 47-91). Format mới theo mục 3:
- Extract phone/uid trong loop `jsonb_array_elements(ar_row.uids_data)` sẵn có (`v_uid_block->>'phone'`, `v_uid_block->>'uid'`)
- Phone fallback từ `payment_requests.phone` (join PR đã có sẵn trong fn)
- Trigger, routing, event_type **giữ nguyên**

### C2. Python mirror parity
- Sửa `build_course_activated_message` trong `backend/utils/zalo_message_builder.py` (dòng 179-213) khớp format mới (thêm input `uids_data`/phone)
- Cập nhật expectations trong `tests/test_zalo_builder.py`
- Thêm docstring note: SQL là live path, 2 format phải sync

### C3. Admin UI
- `frontend/src/lib/api/zaloAdmin.ts`: `ZaloTestPayload.image_url?: string`; `ZaloOutboxRow` += `image_url`, `image_sent_at`, `image_error` (nullable)
- `ZaloConfigTab.tsx`: input "Ảnh (URL)" optional trong form test send
- `ZaloOutboxTab.tsx`: label tiếng Việt cho event `activation_request_created` + cột 📎: đã gửi (`image_sent_at`) / lỗi→đã fallback link (`image_error`) / không có ảnh

### C4. E2E / UAT script trên staging (sau khi A+B deploy staging)
1. Trỏ group staging vào `team_code = 'Inhouse 2'` trong `zalo_team_groups`
2. PR đã thanh toán + có bill → tạo AR → nhóm nhận **text trước, ảnh bill sau**; check row outbox (`event_type`, `image_url`, `image_sent_at`)
3. Xoá bill / URL hỏng → nhận fallback `📎 Bill: {url}` + `image_error` được ghi
4. PATCH đủ `order_id` các gói → nhận message ✅ format mới (có SĐT/UID)
5. **Regression gate yêu cầu #1**: mark 1 `payment_line` paid → message 💰 **giống hệt trước** (không đổi 1 ký tự)

---

## 7. Thứ tự merge & phụ thuộc

```
Ngày 1:  Chốt contract (mục 3) → cả 3 code song song
A (Đạt):  spike → migration → notifier/worker  ──► migration merge ĐẦU TIÊN
B (Đức):  builder + enqueue + tests            ──► merge sau migration A
C (Giang): C1+C2 độc lập, merge lúc nào cũng được
           C3 song song · C4 chạy CUỐI trên staging
```

## 8. Checklist nghiệm thu

- [ ] Nhóm IH2/Offline nhận đủ 3 loại thông báo
- [ ] Thông báo yêu cầu kích hoạt có ảnh bill + đúng format bàn giao (SĐT/UID/gói/Nguồn/Tổng)
- [ ] Ảnh fail → vẫn có text + link bill, không mất thông báo
- [ ] Báo tiền về không đổi format (regression)
- [ ] `is_test` không bắn thông báo
- [ ] Duplicate AR/retry không bắn trùng (UNIQUE constraint)
- [ ] Unit tests pass: `pytest tests/ backend/tests/`
- [ ] Frontend: `npx tsc -b` + `npm run test` pass
- [ ] ZaloOutboxTab hiển thị event mới + trạng thái ảnh; test send kèm ảnh hoạt động
