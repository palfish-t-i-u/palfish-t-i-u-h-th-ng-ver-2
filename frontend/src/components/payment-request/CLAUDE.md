# payment-request — module notes

## QR capture guard (incident 23/6 + 7/7/2026)

- `toBlob` (html-to-image) BẮT BUỘC `includeQueryParams: true` — lib cache resource theo URL đã cắt query; mọi QR vietqr.io chỉ khác nhau ở query → thiếu option này là ảnh chụp thứ 2 trong phiên nhúng bitmap QR cũ.
- Mọi ảnh QR rời app (Chụp mã QR / Copy mã QR) phải qua `qrVerify.ts`: decode (jsqr) + parse EMV (tag 54 amount, 62-08 addInfo) khớp `code` + `amount` của line. Fail-closed: mismatch/unreadable → chặn clipboard/download.
- `<img>` QR giữ `crossOrigin="anonymous"` + `key={url}` + `imgReady` guard (fix 26/6) — các lớp này bảo vệ DOM; qrVerify bảo vệ ảnh output; không thay thế nhau.
- `verifyQrBlob` dùng `qr.code` (5 ký tự, stable) làm `transferCode`, KHÔNG dùng `transferContent` (full string có thể bị normalize).

## UID mismatch warning (B1↔B3)

PR và AR lưu UID độc lập. Sale sửa UID ở PR không tự cập nhật AR.
- Logic: `ActivationTab.uidSync.ts` — nằm bên activation/, nhưng liên quan trực tiếp đến PR
- Drawer kích hoạt hiện badge đỏ khi `uids_data.uid != payment_requests.uid`
- KHÔNG bao giờ ghi đè âm thầm (G-UID1 — effect never-overwrite)

## Tạo hộ + chuyển giao PR (22/07)

`payment_requests.sale_email` = cột sở hữu DUY NHẤT — list scope, Zalo/DingTalk, AR embed, sổ doanh thu đều resolve từ nó lúc runtime. Đổi chủ = đổi cột này (qua endpoint transfer, KHÔNG qua PATCH).

- Trục chuyển: sale ↔ leader. Không sale ↔ sale 1 bước (kể cả leader thao tác) — đi 2 bước qua leader, mỗi bước 1 dòng `pr_ownership_log`.
- `is_test` theo CHỦ SỞ HỮU, không theo người bấm; transfer đổi @dev ↔ thật phải sync `payment_lines.is_test` (BE làm sẵn).
- Doanh thu đã chốt không đổi hồi tố: `sync_ledger_from_ar_course` là insert-once (check `crm_order_id` rồi return) — đừng "sửa" điều này khi refactor.
- Nhật ký bắt buộc với transfer: ghi log fail → BE revert sale_email. FE: TransferSaleModal + OwnershipLogSection.

## Báo đơn bổ sung

Append bé/gói vào AR đã tạo (thay vì tạo AR mới). Modal báo đơn bổ sung có SĐT per bé.
- Liên quan: `phoneUtils.ts` (smart-paste, format, normalize SĐT)
- Course code tiếp seq: không trùng code cũ
- Chi tiết flow: xem `activation/CLAUDE.md`

## Key files

| File | Mục đích |
|------|----------|
| `QrViewModal.tsx` | Modal hiển thị + chụp QR |
| `qrVerify.ts` | EMV TLV parser + QR payload verify (guardrail) |
| `QrViewModal.test.tsx` | Unit tests (GROUP 1-12); GROUP 11 = includeQueryParams regression; GROUP 12 = guard behavior |
| `qrVerify.test.ts` | Unit tests cho EMV parser + verifyQrPayload (8 cases) |
| `e2e/qr-capture.spec.ts` | E2E regression: incident tái hiện + guard fail-closed |
| `phoneUtils.ts` | Smart-paste đầu số + normalize + format SĐT quốc tế |
| `phoneUtils.test.ts` | Unit tests cho phone formatting + smart-paste |
