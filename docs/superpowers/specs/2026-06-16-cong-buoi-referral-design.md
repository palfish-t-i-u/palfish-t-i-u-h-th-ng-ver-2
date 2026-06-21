# Spec — Cộng buổi cho UID nguồn Referral (Giới thiệu)

- **Ngày:** 2026-06-16
- **Nguồn:** Họp sáng 16/6/2026 — mục "App GMV: Thêm tính năng cộng buổi cho các uid nguồn Referral (Giới thiệu)"
- **Phạm vi:** Frontend mock only (không sửa BE). Field snake_case ở payload, chờ spec BE từ anh Hiếu để nối thật.

## 1. Bối cảnh nghiệp vụ

Khi một khách đến qua kênh **Giới thiệu** (referral), cả người giới thiệu lẫn người được giới thiệu có thể được thưởng buổi học. Tính năng cho phép sale ghi nhận số buổi thưởng ngay tại bước kích hoạt gói học.

### Luồng chuẩn (ví dụ A → B)

1. **T5/2026:** Khách A mua khoá → PR của A, nguồn gốc bất kỳ (vd Quảng cáo). Không dính referral.
2. **T6/2026:** A giới thiệu B. B mua → PR của B, **nguồn B = Giới thiệu** (`gioi_thieu`).
3. Sale kích hoạt khoá của B trong **AR mini-card trên PR của B**. Vì course có nguồn = Giới thiệu → **2 ô cộng buổi hiện ra**.
4. Sale điền:
   - **UID người giới thiệu (A)** — gõ tay (A không nằm trong AR của B).
   - **Buổi cho người được giới thiệu (B)** — vd +2.
   - **Buổi cho người giới thiệu (A)** — vd +2.
   - Tuỳ tình huống: điền 1 trong 2 hoặc cả 2.
5. **UID B** đã biết sẵn (là chủ AR / UID của course) → chỉ hiện nhãn, không nhập.
6. Việc cộng buổi thật vào tài khoản A/B là khâu downstream (ops/BE). FE chỉ **lưu thông tin ghi nhận** trên course.

### Định nghĩa đối tượng

- **Người được giới thiệu** = người mua sau = UID đang kích hoạt gói học (chủ AR). Chính UID này mới mang nguồn Giới thiệu.
- **Người giới thiệu** = khách cũ đã giới thiệu họ. UID khác, sale nhập tay.

## 2. Data model

Thêm 3 field optional vào `ActiveCourse` ([frontend/src/types/paymentRequest.ts](../../../frontend/src/types/paymentRequest.ts)), cạnh `leadSource`/`leadChannel` sẵn có:

| FE (camelCase) | API (snake_case) | Kiểu | Nghĩa |
|---|---|---|---|
| `referrerUid` | `referrer_uid` | `string?` | UID người giới thiệu (A) — sale gõ |
| `bonusSessionsReferee` | `bonus_sessions_referee` | `number?` | Buổi cộng cho người được giới thiệu (B, chủ AR) |
| `bonusSessionsReferrer` | `bonus_sessions_referrer` | `number?` | Buổi cộng cho người giới thiệu (A) |

Round-trip mapping (mirror đúng pattern `lead_source`):
- Đọc API → FE: `fromApiActiveRequest` trong [paymentRequestUtils.ts](../../../frontend/src/components/payment-request/paymentRequestUtils.ts) (~dòng 211-224).
- Ghi FE → API patch: `toActiveRequestPatchUidsData` trong cùng file (~dòng 288-301).
- Cập nhật union type payload trong `types/paymentRequest.ts` (~dòng 228-234) thêm 3 key snake_case.

## 3. UI

### 3.1. Nhập — AR mini-card trong PR detail drawer (sale)

File: [PaymentRequestDetailDrawer.tsx](../../../frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx), component `ActiveRequestMiniCardV2`, block course (~dòng 1159-1219).

**Editing mode:** ngay sau ô chọn Nguồn, nếu `course.leadSource === "gioi_thieu"` → render sub-block inline (full-width, `gridColumn: "1 / -1"`):

```
Thưởng giới thiệu
[ UID người giới thiệu (A) ]   [ Buổi: người được giới thiệu ]   [ Buổi: người giới thiệu ]
Nhãn: "Người được giới thiệu: <UID của course> (B)"
```

- Lưu qua `mutate()` → `onActiveRequestSave` (đường lưu AR sẵn có, mock).
- Disable khi `courseLocked` (đã có orderId / đã invoiced), giống các field khác.

**Read-only mode:** nếu course có bất kỳ field referral nào → 1 dòng tóm tắt (cạnh dòng "Nguồn:" sẵn có, ~dòng 1149-1158):

> `Giới thiệu: +X buổi cho người được giới thiệu · +Y buổi cho người giới thiệu (UID A)`

(Chỉ hiện phần có giá trị > 0.)

### 3.2. Hiển thị read-only — Tab Kích hoạt khoá học (B3)

File: [ActivationTab.tsx](../../../frontend/src/components/ActivationTab.tsx), course row trong `ActivationDetailDrawer` (~dòng 1128-1281).

- **Chỉ read-only** (chị Thu Hiền không sửa). Nếu course có field referral → thêm 1 dòng nhỏ dưới course row với cùng nội dung tóm tắt như mục 3.1 read-only.

## 4. Validation (FE)

- `bonusSessionsReferee`, `bonusSessionsReferrer`: số nguyên ≥ 0; để trống = 0. Cả 2 đều optional ("1 trong 2 hoặc cả 2").
- `referrerUid`: **bắt buộc khi** `bonusSessionsReferrer > 0` (cộng cho ai thì phải biết UID). Phải **khác** UID người được giới thiệu (UID của course). Nếu vi phạm → chặn lưu + báo lỗi ở **banner cấp-card** (tái dùng kiểu `allocationError` đang render ở `PaymentRequestDetailDrawer.tsx:923`, không phải lỗi per-row).

## 5. Phạm vi & ràng buộc

- **FE mock only.** Không sửa backend. Mock thêm 1 course `gioi_thieu` có sẵn 3 field referral trong [mockActiveRequests.ts](../../../frontend/src/components/payment-request/mockActiveRequests.ts) (`MOCK_ACTIVE_REQUESTS`) để demo cả nhập lẫn read-only. **Mock dùng camelCase** (shape FE `ActiveCourse`: `referrerUid`, `bonusSessionsReferee`, `bonusSessionsReferrer`, `leadSource: "gioi_thieu"`), không phải snake_case.
- Cộng buổi thật vào tài khoản học viên = khâu downstream, ngoài phạm vi.
- `tsc -b` phải xanh trước khi push.

## 6. Files chạm

| File | Thay đổi |
|---|---|
| `frontend/src/types/paymentRequest.ts` | +3 field `ActiveCourse`; +3 key snake_case ở union payload |
| `frontend/src/components/payment-request/paymentRequestUtils.ts` | Map 3 field ở `fromApiActiveRequest` + `toActiveRequestPatchUidsData` |
| `frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx` | Sub-block nhập (editing) + dòng tóm tắt (read-only) trong `ActiveRequestMiniCardV2` |
| `frontend/src/components/ActivationTab.tsx` | Dòng tóm tắt read-only trong `ActivationDetailDrawer` course row |
| `frontend/src/components/payment-request/mockActiveRequests.ts` | Mock data demo (`MOCK_ACTIVE_REQUESTS`, camelCase) |

## 7. Ngoài phạm vi (YAGNI)

- Tính/cộng buổi thực tế vào tài khoản học viên.
- Lịch sử / audit cộng buổi.
- Báo cáo thống kê referral.
- Tự động suy ra UID người giới thiệu từ CRM (sale gõ tay).
