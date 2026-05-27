# Handoff Giang / Đức — Feedback Hiếu 27/05/2026

> **Người viết:** Minh · **Cập nhật lần cuối:** 2026-05-27 (tối — sau khi pull `877dbce`)
> **Branch FE:** `ui/ux` (đã merge `877dbce` từ main)
> **Backend repo:** `palfish-gmv-manager` (Render `palfish-gmv-api`)
> **Supabase ref:** `jozcvbbypwvzaefteoxn`

---

## Tóm tắt trạng thái

| Đợt | Việc | Status |
|-----|------|--------|
| **Phase A (FE)** | 8 quick wins + BUG-01 + B1-9 QR modal | ✅ Đã ship `a9c50b7` |
| **Phase A2 (FE)** | 10 fix đợt 2 (F2/F3/F4/F6/F7) | ✅ Đã ship `042f936` |
| **B-01 (BE)** | PATCH `/api/v1/payment-requests/{id}` — lưu edit PR vào DB | ✅ **Đức đã làm xong** `877dbce` |
| **B-02 (BE)** | PATCH AR + `info_confirmed_at` | 🔴 **Tối nay — Đức làm tiếp** (xem chi tiết bên dưới) |
| **Task 2 (FE)** | Mini-window "Kích hoạt khoá học" inline trong PR drawer | 🟡 Code xong, chờ commit |
| **B-06/B-07 (BE)** | Xoá/cancel Active Request + trạng thái chờ xuất HĐ sau khi Ops bấm Xuất HĐ | 🟡 Cần Giang/Đức xử lý theo prompt cập nhật 28/05 |

---

## B-01 đã làm xong — chi tiết để Minh kết nối FE (đã xong tự động)

Đức đã thêm full stack:
- BE `PATCH /api/v1/payment-requests/{pr_id}` accept partial body (cả tên field tiếng Anh và alias tiếng Việt)
- FE `endpoints.paymentRequests.update()` 
- FE `handleUpdatePr` đã optimistic update + rollback on error + spinner "Đang lưu..."

**Đã verify trên runtime**: PATCH request fired thành công khi sửa note PR và bấm "Lưu thay đổi" (request ID 5808.575).

---

## 🔴 B-02 — Việc Đức cần làm tối nay

### Việc cần làm (đơn giản)

Sửa AR trong DB khi:
1. **Thu Hiền bấm "Xác nhận thông tin"** trên một Active Request — phải lưu thời điểm xác nhận vào DB. Sau đó nút "Yêu cầu xuất HĐ B4" mới active.
2. **Thu Hiền đổi tên khách hàng** trên AR (vì tên trên hoá đơn có thể khác tên trong PR — ví dụ KH đăng ký bằng tên gọi nhưng xuất HĐ bằng tên công ty).
3. **Sales/Thu Hiền đổi gói khoá học** của một UID trong AR (ví dụ chọn nhầm gói lúc tạo, đổi sang gói khác).

> Lưu ý: việc **Thu Hiền điền Order ID** từng course đã có sẵn endpoint rồi (`PATCH /active-requests/{ar_id}/courses/{course_code}`), không phải làm lại.

### Cách xử lý (chi tiết)

#### Phần 1 — Schema migration

```sql
-- File: docs/supabase_schema_patch_active_requests_info_confirmed.sql
ALTER TABLE active_requests
  ADD COLUMN IF NOT EXISTS info_confirmed_at timestamptz;
NOTIFY pgrst, 'reload schema';
```

Chạy trên Supabase SQL Editor project `jozcvbbypwvzaefteoxn`.

#### Phần 2 — Endpoint mới `PATCH /api/v1/active-requests/{ar_id}`

File: `backend/activation_routes.py`

```python
class ActiveRequestPatch(BaseModel):
    # AR-level fields
    customer_name: str | None = None
    info_confirmed: bool | None = None  # True → set info_confirmed_at = now(); False → clear

    # Course-level edits (alternative khi cần đổi gói khoá học)
    # Nếu không truyền thì giữ nguyên uids_data
    uids_data: list[dict] | None = None

@app.patch("/api/v1/active-requests/{ar_id}", tags=["Activation"])
def patch_active_request(ar_id: str, body: ActiveRequestPatch):
    sb = supabase_factory()
    if not sb:
        raise HTTPException(503, "Supabase chưa cấu hình")

    # Đọc row hiện tại
    res = sb.table("active_requests").select("*").eq("id", ar_id).limit(1).execute()
    if not res.data:
        raise HTTPException(404, f"Active Request {ar_id} không tồn tại")
    current = res.data[0]

    patch: dict[str, Any] = {}

    if body.customer_name is not None:
        name = body.customer_name.strip()
        if not name:
            raise HTTPException(400, "customer_name không được rỗng")
        patch["customer_name"] = name

    if body.uids_data is not None:
        if not isinstance(body.uids_data, list):
            raise HTTPException(400, "uids_data phải là array")
        patch["uids_data"] = body.uids_data
        patch["status"] = _derive_status(body.uids_data)

    if body.info_confirmed is not None:
        patch["info_confirmed_at"] = _iso_now() if body.info_confirmed else None

    if not patch:
        raise HTTPException(400, "Không có dữ liệu để cập nhật")

    patch["updated_at"] = _iso_now()

    try:
        upd = sb.table("active_requests").update(patch).eq("id", ar_id).execute()
    except Exception as exc:
        raise HTTPException(500, f"Không cập nhật được active_requests: {exc}") from exc

    saved = (upd.data or [{**current, **patch}])[0]
    merged = {**current, **saved}
    pr_map = _fetch_prs_by_ids(sb, [str(merged.get("pr_id") or "")])
    return _serialize_ar(merged, pr_map.get(str(merged.get("pr_id") or "")))
```

#### Phần 3 — Serializer trả thêm `info_confirmed_at`

Trong `_serialize_ar()` (cùng file), thêm field vào dict trả về:
```python
"info_confirmed_at": row.get("info_confirmed_at"),
```

#### Phần 4 — FE kết nối (Minh sẽ làm sau khi Đức merge)

- `types/paymentRequest.ts`: thêm `info_confirmed_at?: string | null` vào `ActiveRequestApiRow` + `ActiveRequest`
- `lib/api.ts`: thêm `endpoints.activeRequests.update(arId, body)` gọi PATCH
- `PaymentFlowContext.tsx`: 
  - `updateActiveRequest()` chuyển từ local-only → gọi API thật, optimistic + rollback giống `handleUpdatePr` mà Đức đã làm
  - Thêm `confirmActiveRequestInfo(arId)` riêng cho Thu Hiền click "Xác nhận thông tin"

### Cách Đức tự test (curl)

Sau khi deploy lên Render:

```bash
# Test 1: Thu Hiền xác nhận info
curl -X PATCH https://palfish-gmv-api.onrender.com/api/v1/active-requests/AR-2026-0014 \
  -H "Content-Type: application/json" \
  -d '{"info_confirmed": true}'
# Response phải có "info_confirmed_at": "2026-05-27T..."

# Test 2: Đổi tên KH
curl -X PATCH https://palfish-gmv-api.onrender.com/api/v1/active-requests/AR-2026-0014 \
  -H "Content-Type: application/json" \
  -d '{"customer_name": "Tên mới abc"}'

# Test 3: Đổi gói khoá học
curl -X PATCH https://palfish-gmv-api.onrender.com/api/v1/active-requests/AR-2026-0014 \
  -H "Content-Type: application/json" \
  -d '{
    "uids_data": [
      {
        "uid": "12312312",
        "phone": "232131",
        "country": "VN",
        "courses": [
          {"code": "CC-0034-001", "name": "2/W- NEW 96 US-UK+5 HN", "amount": 100000, "order_id": "12312312"}
        ]
      }
    ]
  }'
```

### Ping Minh khi xong

Đức push lên main + Render auto deploy → ping Minh. Minh sẽ:
1. Pull về, kết nối `endpoints.activeRequests.update()` + sửa `updateActiveRequest` trong context
2. Thêm nút "Xác nhận thông tin" trong AR drawer (tab Kích hoạt khoá học của Thu Hiền) — nút B4 "Yêu cầu xuất HĐ" sẽ disable cho đến khi `info_confirmed_at` có giá trị
3. Mở rộng Task 2 mini-window: cho phép Sales đổi gói khoá học inline trong PR drawer

---

## 🟡 Task 2 — Việc Minh đang làm

Mini-window "Kích hoạt khoá học" inline trong PR drawer. Không cần BE mới — dùng `POST /api/v1/payment-requests/{pr_id}/active-requests` đã có sẵn.

**Phụ thuộc:** sau khi Đức xong B-02 trên, Minh thêm phần cho phép Sales chọn lại gói nếu chọn nhầm (gọi PATCH AR mới).

### Cập nhật Minh 2026-05-27 tối — FE đã nối chọn gói, BE đang là blocker lưu DB

Minh đã pull `main` commit `6376820` vào `ui/ux`, sau đó thêm FE cho Sales chọn/gõ tìm gói học ngay trong mini-window Active Request ở drawer Payment Request:

- File FE đã sửa: `PaymentRequestDetailDrawer.tsx`, `PaymentRequestsTab.tsx`, `PaymentFlowContext.tsx`, `paymentRequestUtils.ts`, `lib/api.ts`, `types/paymentRequest.ts`
- Test thêm: `frontend/src/components/payment-request/paymentRequestUtils.test.ts`
- FE hiện gọi `PATCH /api/v1/active-requests/{ar_id}` với body `uids_data` snake_case khi đổi gói.
- Đã verify FE: `npm test` pass 2 files / 6 tests; `npm run build` pass.

Runtime hiện tại: Sales chọn/gõ được gói học, nhưng reload/thoát tab vào lại thì gói biến mất. FE hiện thông báo:

```text
Đã đổi gói tạm trên giao diện; máy chủ chưa lưu được thay đổi gói học.
```

Kết luận cập nhật sau commit Đức `8a853d8`: BE đã có `PATCH /api/v1/active-requests/{ar_id}` để lưu `uids_data`. Minh đã chỉnh FE thành flow có nút **Lưu** trong mini-window: Sales chọn gói trước, bấm **Lưu** mới gọi PATCH.

#### Request shape FE đang gửi cho Đức verify

```json
{
  "uids_data": [
    {
      "uid": "test738",
      "phone": "764131233",
      "country": "VN",
      "courses": [
        {
          "code": "CC-0047-001",
          "name": "2/W- NEW 48 US-UK+2 HN",
          "amount": 10000,
          "order_id": "",
          "invoiced": false
        }
      ]
    }
  ]
}
```

Acceptance cho Đức:

1. `PATCH /api/v1/active-requests/{ar_id}` nhận `uids_data`.
2. Update `active_requests.uids_data` trong DB.
3. Trả về Active Request đã serialize giống `GET /active-requests`.
4. Reload tab Payment Request vẫn thấy gói đã chọn.
5. Tab "Kích hoạt khóa học" chính cũng thấy cùng gói đó trong AR tương ứng.

---

## Cập nhật 28/05 — Feedback test Mini-window Active Request trong Payment Request

### Plan triển khai theo block liên quan và thứ tự ưu tiên

#### P0 — Block Payment Request drawer / Mini-window "Kích hoạt khóa học" (Minh FE, có 1 blocker BE)

**Trạng thái FE 28/05:** Minh đã triển khai trong `frontend/src/`. Test code thuần đã chạy: `npm test -- paymentRequestUtils.test.ts paymentFlowUtils.test.ts` pass 7 tests; `npm run build` pass.

Mục tiêu: Sales nhìn đúng trạng thái và thao tác được nhiều UID / nhiều gói ngay trong Payment Request, không cần thoát tab để hiểu dữ liệu.

1. Hiển thị đủ thông tin từng khóa trong mini-window:
   - UID.
   - Số điện thoại đúng format đầu số quốc gia + đuôi số, ví dụ `+84 9323 232 333`.
   - Tên gói học.
   - Số tiền của gói học.
2. Đổi wording trạng thái trong Payment Request:
   - Sau khi Sales bấm "Kích hoạt khóa học" và AR mới được tạo, nút không được hiện "Đã kích hoạt khóa học" nữa.
   - Khi AR đã tạo nhưng chưa đủ Order ID: hiện "Chờ kích hoạt khóa học".
   - Khi mọi course đã có Order ID do Ops lưu: hiện "Đã kích hoạt khóa học".
   - Badge course trong mini-window đổi từ "Chờ Order ID" sang "Chờ kích hoạt"; khi có Order ID thì hiện "Đã kích hoạt" màu xanh, không cần show Order ID cho Sales.
3. Thêm flow nhiều UID / nhiều gói:
   - Cho Sales chọn UID đã có trong AR.
   - Cho Sales thêm gói học mới cho UID đã chọn.
   - Cho Sales thêm UID mới nếu 1 PR mua gói cho nhiều học viên.
   - Khi lưu, FE gửi lại `uids_data` snake_case qua `PATCH /api/v1/active-requests/{ar_id}`.
4. Sửa cụm action gói học cho gọn:
   - Icon bút = bật sửa thông tin gói học.
   - Icon tick xanh vuông = lưu thông tin.
   - Icon X đỏ vuông = xoá Active Request.
   - Icon X đỏ tròn nằm trong ô chọn gói = xoá tên gói học đang chọn.
5. BE blocker trong block này:
   - FE đã có PATCH để lưu `uids_data` và đã gửi thêm nhiều UID / nhiều gói bằng shape JSONB hiện tại.
   - FE đã gắn nút xoá AR bằng optimistic `DELETE /api/v1/active-requests/{ar_id}`.
   - Cần BE thêm endpoint xoá/cancel Active Request để nút "Xoá active request" persist thật.

#### P1 — Block tab "Kích hoạt khóa học" / Active Request drawer (Minh FE + Giang/Đức BE)

**Trạng thái FE 28/05:** Minh đã triển khai nút **Lưu Order ID**, bỏ save-on-blur, và đổi FE derive status để AR mới không vào `ready_invoice`. FE dùng field per-course `invoice_requested_at` khi Ops bấm "Xuất HĐ" để đẩy sang B4.

Mục tiêu: Ops thấy đúng backlog "Chờ tạo đơn", lưu Order ID rõ ràng, và chỉ đẩy sang xuất hóa đơn khi Ops bấm nút Xuất HĐ.

1. Sửa trạng thái tab:
   - AR mới tạo phải nằm ở tab "Chờ tạo đơn".
   - Không tự nhảy sang "Sẵn sàng xuất HĐ" chỉ vì AR có course nhưng chưa có Order ID.
2. Thêm nút "Lưu" rõ ràng cho Ops khi điền Order ID:
   - Hiện tại FE lưu bằng `onBlur`, dễ gây hiểu nhầm.
   - Đổi sang draft Order ID, bấm "Lưu" mới gọi PATCH.
3. Tách trạng thái "đã kích hoạt" và "sẵn sàng xuất HĐ":
   - Khi Ops nhập Order ID và bấm Lưu: Payment Request được coi là "Đã kích hoạt khóa học"; course badge chuyển "Đã kích hoạt".
   - Chỉ khi Ops bấm nút "Xuất HĐ" màu tím trong Active Request thì course/AR mới được tính vào tab "Sẵn sàng xuất HĐ".
4. BE blocker trong block này:
   - Cần BE chấp nhận/persist `invoice_requested_at` trong `uids_data.courses[]` khi FE PATCH AR.
   - Không nên dùng `order_id` làm điều kiện duy nhất cho `ready_invoice`, vì Order ID chỉ chứng minh đã kích hoạt khóa học, chưa chứng minh Ops đã yêu cầu xuất hóa đơn.

#### P2 — Cleanup / nghiệm thu

1. FE chạy `cd frontend && npm test`.
2. FE chạy `cd frontend && npm run build`.
3. Test tay 3 flow:
   - PR đủ tiền → tạo AR → Payment Request hiển thị "Chờ kích hoạt khóa học".
   - Sales thêm/sửa/xóa tên gói trong mini-window → reload vẫn giữ dữ liệu.
   - Ops nhập Order ID + bấm Lưu → Payment Request hiển thị "Đã kích hoạt khóa học"; chỉ sau khi bấm "Xuất HĐ" mới vào "Sẵn sàng xuất HĐ".

### Prompt handoff cho Giang/Đức

```text
Context:
- Minh chỉ làm FE trong `frontend/src/`, không sửa backend.
- Feedback sau test Mini-window Active Request trong Payment Request cho thấy FE cần 2 khả năng BE mới/ổn định:
  1. Xoá hoặc cancel Active Request.
  2. Tách trạng thái "đã kích hoạt khóa học" khỏi "sẵn sàng xuất HĐ".
- BE hiện đã có `PATCH /api/v1/active-requests/{ar_id}` nhận `uids_data` và serialize Active Request giống `GET /active-requests`.

Việc cần Giang/Đức làm:

1. Thêm endpoint xoá/cancel Active Request
- Đề xuất API:
  - Ưu tiên: `DELETE /api/v1/active-requests/{ar_id}` nếu xoá cứng được nghiệp vụ chấp nhận.
  - Nếu cần giữ audit: `POST /api/v1/active-requests/{ar_id}/cancel` hoặc `PATCH /api/v1/active-requests/{ar_id}` với `{ "status": "cancelled" }`.
- Response trả về `{ "ok": true, "id": "AR-..." }` hoặc Active Request đã cập nhật.
- Điều kiện an toàn đề xuất:
  - Không cho xoá/cancel nếu có course đã `invoiced = true`.
  - Nếu đã có `order_id`, nên trả 409 hoặc yêu cầu confirm nghiệp vụ trước.

2. Tách trạng thái invoice-ready khỏi trạng thái đã có Order ID
- Vấn đề hiện tại: AR có course nhưng chưa có Order ID đang có thể bị FE/BE derive thành `ready_invoice`; yêu cầu mới là AR mới phải ở `pending_order`.
- Khi Ops điền Order ID và bấm Lưu:
  - Course được coi là đã kích hoạt.
  - Không tự đưa vào tab "Sẵn sàng xuất HĐ".
- Khi Ops bấm nút "Xuất HĐ" màu tím trong Active Request:
  - Mới set course/AR vào trạng thái đủ điều kiện B4.
- Đề xuất schema nhẹ:
  - Thêm field per-course trong `uids_data.courses[]`: `invoice_requested_at?: string | null`.
  - Hoặc thêm field tương đương nếu Đức muốn quản lý ở table riêng.
- Đề xuất status derive:
  - Không có Order ID nào: `pending_order`.
  - Có một phần Order ID: `partial_order`.
  - Tất cả course có Order ID nhưng chưa bấm Xuất HĐ: vẫn không vào tab "Sẵn sàng xuất HĐ" của B4.
  - Course/AR chỉ vào `ready_invoice` khi đã có `invoice_requested_at` hoặc flag tương đương.
  - Tất cả course đã `invoiced = true`: `invoiced`.

Acceptance:
1. FE gọi xoá/cancel AR xong, reload `GET /api/v1/active-requests` không còn hiện AR đó, hoặc hiện trạng thái cancelled nếu backend chọn soft-delete.
2. PR vừa tạo AR mới luôn nằm ở tab "Chờ tạo đơn".
3. Ops nhập Order ID + lưu xong, Payment Request có thể hiển thị "Đã kích hoạt khóa học", nhưng tab B4 chưa nhận course.
4. Ops bấm "Xuất HĐ" trong Active Request xong, course/AR mới xuất hiện ở "Sẵn sàng xuất HĐ".
5. Các response vẫn dùng snake_case và giữ shape serialize hiện tại để FE không phải đổi mapper lớn.
```

## Việc còn lại sau tối nay

| ID | Việc | Người làm | Trạng thái |
|----|------|-----------|-----------|
| B-03 | Multi-bill upload (schema `bill_images text[]` + endpoint upload N file) | Giang + Đức | ⏸ Hold đến sau preview với team |
| B-04 | Confirm account HCM cho dropdown bank | Hiếu | Đợi input |
| B-05 | `payment_lines.downloaded_at` track file thuế đã tải | Giang | P2 backlog |
| BUG-02 | Nút "Xác nhận thông tin" cho Thu Hiền | Minh | Sẽ làm sau khi B-02 xong |
| B-06 | Xoá/cancel Active Request | Giang/Đức | Cần BE endpoint để FE gắn nút X đỏ vuông |
| B-07 | Tách `order_id` khỏi trạng thái `ready_invoice` | Giang/Đức | Cần flag/schema cho hành động Ops bấm "Xuất HĐ" |

---

## SQL patches cần chạy prod tối nay

| # | SQL | Ai chạy | Mục đích |
|---|-----|---------|---------|
| 1 | `ALTER TABLE active_requests ADD COLUMN IF NOT EXISTS info_confirmed_at timestamptz; NOTIFY pgrst, 'reload schema';` | Đức (kèm B-02) | Thu Hiền xác nhận thông tin |

> Phải `NOTIFY pgrst, 'reload schema'` sau mỗi ALTER thì PostgREST mới thấy cột mới.

---

## Files quan trọng để Đức tham khảo khi làm B-02

| File | Lý do |
|------|-------|
| `backend/activation_routes.py:834-901` | Tham khảo `patch_active_request_course` đã có sẵn — pattern dùng RPC + Python fallback |
| `backend/activation_routes.py:522` | `_save_active_request` — helper insert/update, có thể dùng lại |
| `backend/activation_routes.py` (`_derive_status`) | Hàm tính `status` từ uids_data — cần gọi lại khi update uids_data |
| `backend/activation_routes.py` (`_serialize_ar`) | Serializer — thêm `info_confirmed_at` ở đây |
| `backend/payment_request_routes.py:735-790` (commit `877dbce`) | Tham khảo pattern PATCH PR mà Đức vừa làm — có optimistic + recompute totals |

---

## Communication tối nay

1. Đức xong B-02 → push lên `main` → ping Minh
2. Minh pull về, kết nối FE (`updateActiveRequest` → API thật) → push lên `ui/ux`
3. Demo cho Hiếu/Thu Hiền vào preview Vercel sau khi Vercel auto deploy
