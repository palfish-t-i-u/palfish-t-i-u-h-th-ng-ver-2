# payment-request — module notes

## QR capture guard (incident 23/6 + 7/7/2026)

- `toBlob` (html-to-image) BẮT BUỘC `includeQueryParams: true` — lib cache resource theo URL đã cắt query; mọi QR vietqr.io chỉ khác nhau ở query → thiếu option này là ảnh chụp thứ 2 trong phiên nhúng bitmap QR cũ.
- Mọi ảnh QR rời app (Chụp mã QR / Copy mã QR) phải qua `qrVerify.ts`: decode (jsqr) + parse EMV (tag 54 amount, 62-08 addInfo) khớp `code` + `amount` của line. Fail-closed: mismatch/unreadable → chặn clipboard/download.
- `<img>` QR giữ `crossOrigin="anonymous"` + `key={url}` + `imgReady` guard (fix 26/6) — các lớp này bảo vệ DOM; qrVerify bảo vệ ảnh output; không thay thế nhau.
- `verifyQrBlob` dùng `qr.code` (5 ký tự, stable) làm `transferCode`, KHÔNG dùng `transferContent` (full string có thể bị normalize).

## Key files

| File | Mục đích |
|------|----------|
| `QrViewModal.tsx` | Modal hiển thị + chụp QR |
| `qrVerify.ts` | EMV TLV parser + QR payload verify (guardrail) |
| `QrViewModal.test.tsx` | Unit tests (GROUP 1-12); GROUP 11 = includeQueryParams regression; GROUP 12 = guard behavior |
| `qrVerify.test.ts` | Unit tests cho EMV parser + verifyQrPayload (8 cases) |
| `e2e/qr-capture.spec.ts` | E2E regression: incident tái hiện + guard fail-closed |
