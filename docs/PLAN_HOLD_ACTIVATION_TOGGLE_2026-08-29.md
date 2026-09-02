# Plan: Toggle "Tạo gói học ngay / Chưa tạo gói học" sau báo đơn

**Branch:** `feat/hold-activation-toggle`
**Ngày:** 29/08/2026

## Bối cảnh

Hiện tại khi sale báo đơn, có radio chọn "Tạo gói học ngay" hoặc "Chưa tạo gói học" (cho trường hợp KH chưa muốn học ngay). Nhưng sau khi submit xong, sale không sửa được nữa — chỉ hiện badge read-only. Nếu KH đổi ý, sale phải nhờ admin can thiệp qua database.

**Yêu cầu:** Cho sale tự đổi trạng thái "Tạo gói học ngay ↔ Chưa tạo gói học" ngay trong AR panel (phần Tạo gói học trong PR detail), bằng 2 radio button giống form báo đơn. Chỉ cho sửa khi đơn chưa activated/invoiced.

## Mockup

Radio đặt ngay dưới header AR, trước progress bar:
- Khi chọn "Tạo gói học ngay": nền trắng bình thường, radio xanh
- Khi chọn "Chưa tạo gói học": nền vàng nhạt (amber), radio amber

## BE — `backend/activation_routes.py`

### B1. Thêm field vào model (line 92-96)

```python
# Hiện tại:
class ActiveRequestPatchBody(BaseModel):
    customer_name: str | None = None
    info_confirmed: bool | None = None
    uids_data: list[ActiveRequestPatchUidPayload] | None = None
    expected_updated_at: str | None = None

# Thêm 1 dòng:
class ActiveRequestPatchBody(BaseModel):
    customer_name: str | None = None
    info_confirmed: bool | None = None
    uids_data: list[ActiveRequestPatchUidPayload] | None = None
    expected_updated_at: str | None = None
    hold_activation: bool | None = None
```

### B2. Xử lý trong PATCH handler (line 2307)

Trong hàm `patch_active_request`, sau khi build dict `patch` (line 2334), thêm block xử lý hold_activation. Đặt **trước** dòng `if not patch:` (line 2455):

```python
        # --- hold_activation toggle ---
        if body.hold_activation is not None:
            cur_status = current.get("status", "")
            if cur_status in ("activated", "invoiced"):
                raise HTTPException(400, "Don da kich hoat/xuat HD, khong doi duoc")
            patch["hold_activation"] = body.hold_activation
            patch["hold_note"] = None

        if not patch:
            raise HTTPException(400, "Khong co du lieu de cap nhat")
```

**Tham khảo pattern:** xem cách endpoint append xử lý hold_activation ở line 2665-2672 (cùng file).

## FE — `frontend/src/components/ActivationTab.tsx`

### F1. Thay banner read-only thành radio (line 1201-1216)

Hiện tại đoạn này là banner read-only:
```tsx
{enriched.holdActivation && enriched.status !== "activated" && enriched.status !== "invoiced" && (
  <div style={{...}}>
    <span>⏸</span>
    <div>
      <strong>PH chưa muốn tạo gói học</strong>
      ...
    </div>
  </div>
)}
```

Thay bằng 2 radio "Tạo gói học ngay" / "Chưa tạo gói học":
- Chỉ hiện khi `status !== "activated" && status !== "invoiced"`
- Khi đã activated/invoiced → ẩn radio (hoặc giữ badge read-only)
- Khi sale đổi radio → gọi `PATCH /api/v1/active-requests/{ar_id}` body `{ hold_activation: true/false }` → refetch AR list
- Khi chọn "Chưa tạo gói học": nền section chuyển vàng nhạt (#FFF8E1)

### UI radio

```
Tạo gói học:  (●) Tạo gói học ngay    (○) Chưa tạo gói học
```

Style giống radio trên form báo đơn (cùng file, search "holdActivation" trong phần tạo đơn để tham khảo).

## Guardrail

- **Không đụng** `_derive_status`, `uids_data`, `order_id` — chỉ thêm 1 field vào patch dict
- `hold_note` luôn set `None` khi sửa qua PATCH (không cần ô nhập ghi chú)
- `_maybe_enqueue_ar_edit_dingtalk` đã handle diff tự động — không phát sinh tin thừa

## Verify

1. `cd frontend && npx tsc -b` — phải clean
2. Test thử trên browser: mở PR detail → phần Tạo gói học → thấy radio → đổi → verify trạng thái cập nhật
