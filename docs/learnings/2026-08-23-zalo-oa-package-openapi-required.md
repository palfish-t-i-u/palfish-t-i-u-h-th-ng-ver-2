# Nhóm Zalo im lặng — gói OA thiếu OpenAPI (lỗi -224)

**Date:** 2026-08-23
**Commits:** (không code — sự cố vận hành + chẩn đoán)

## Problem

Sáng 23/08 các nhóm Zalo báo tiền đột nhiên không nhận tin "💰 ĐÃ VÀO TK" nữa, dù SePay vẫn ghi nhận giao dịch và app GMV vẫn khớp/xác nhận tiền bình thường. Đồng thời kế toán tưởng "app thiếu đơn" (vấn đề riêng, xem `2026-08-08-ct1-ngay-tien-ve-don-the-paid-at-utc.md` + note internal recon-ck).

## Trap

Dễ đổ lỗi cho token Zalo hết hạn hoặc bug code. **Cả hai đều sai.** Token trong `zalo_oa_credentials` vẫn còn hạn (expires 24/08, refresh loop chạy đều), code không đổi.

Nguyên nhân thật: **gói OA hết hạn + Zalo đổi bậc gói.** OA "Palfish Vietnam" dùng gói cũ **"Nâng cao" (1tr/năm)** — Zalo đã **khai tử** gói này. Anh Hiếu gia hạn nhầm sang **"Tiêu chuẩn" (1tr/năm)** vì cùng giá, nhưng bậc gói mới:

| Gói | Giá/năm | Zalo OpenAPI (gửi nhóm qua app)? |
|-----|---------|----------------------------------|
| Cơ bản | — | ❌ |
| Tiêu chuẩn | 1.000.000đ | ❌ chỉ chat tay + tạo ≤3 nhóm |
| **Tăng trưởng** | 2.500.000đ | ✅ bật Zalo OpenAPI, ZBS Template, 100 req/phút |
| Toàn diện | 6.000.000đ | ✅ 2000 req/phút |

App gọi `send_group_message` qua Zalo OpenAPI → gói Tiêu chuẩn không có API này → mọi tin fail với **`-224` = "The OA needs a plan upgraded to use this feature"**. Nâng lên **Tăng trưởng** thì thông ngay lập tức (không cần đụng token/code).

## Insight

Chẩn đoán 30 giây: query prod `zalo_outbox` xem `last_error`.
- `last_error = 'Zalo send_group_message failed: -224'` → **lỗi GÓI**, không phải token/code. Đi kiểm tra bậc gói OA tại `oa.zalo.me/manage/subscription` (mục "Thông tin gói OA" phải liệt kê "Tích hợp Zalo OpenAPI").
- Mốc chuyển trạng thái rõ: tin cuối gửi OK 22/08 14:31, từ 23/08 03:36 fail toàn bộ = đúng lúc gói hết hiệu lực.

Tin `retries=4, sent_at=null, next_retry_at=null` = chết, worker KHÔNG tự gửi lại sau khi khôi phục gói. Muốn bù: reset `retries=0, last_error=null, next_retry_at=now()` (tin thật không cần prefix TEST). Sự cố này: 9 tin hụt (03:36–11:59) → **QĐ Minh: để yên, không gửi bù** (tránh nhiễu vì kế toán đã xử tay).

## Rule

- Nhóm Zalo im + SePay/app vẫn chạy → **kiểm tra `zalo_outbox.last_error` TRƯỚC**, đừng nhảy vào token/code.
- Gói OA gia hạn **BẮT BUỘC** phải là **Tăng trưởng (2,5tr) trở lên** — đây là bậc rẻ nhất có Zalo OpenAPI để app gửi tin lên nhóm. Gói 1tr (Tiêu chuẩn) KHÔNG dùng được, dù trước đây gói "Nâng cao" 1tr có API.
- Bật "Gia hạn tự động" ở gói Tăng trưởng để không tái diễn khi hết hạn.
