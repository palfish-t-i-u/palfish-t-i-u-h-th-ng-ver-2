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

---

## Việc còn lại sau tối nay

| ID | Việc | Người làm | Trạng thái |
|----|------|-----------|-----------|
| B-03 | Multi-bill upload (schema `bill_images text[]` + endpoint upload N file) | Giang + Đức | ⏸ Hold đến sau preview với team |
| B-04 | Confirm account HCM cho dropdown bank | Hiếu | Đợi input |
| B-05 | `payment_lines.downloaded_at` track file thuế đã tải | Giang | P2 backlog |
| BUG-02 | Nút "Xác nhận thông tin" cho Thu Hiền | Minh | Sẽ làm sau khi B-02 xong |

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
