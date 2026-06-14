# Handoff v2: Tích hợp SePay — vòng 2 (sau báo cáo vòng 1 của Giang)

**Người nhận:** Giang (+ Đạt)
**Người giao:** Minh
**Ngày cập nhật:** 11/06/2026
**Trạng thái vòng 1:** ĐẠT — báo cáo trả lời đủ 12 câu, khuyến nghị **"Hướng A cho VCB trước, 3 ngày công; GĐ2 thay PayOS sau khi ổn ≥2 tuần"** được duyệt. Tuy nhiên có **2 mục dùng thông tin sai cần sửa** (mục 1 dưới đây), kèm 5 câu verify mới + 1 spec cần viết.

---

## 0. Cập nhật trạng thái mới nhất (đọc trước khi làm)

- **Tài khoản SePay ĐÃ đăng ký xong** — gói FREE 50 GD/tháng đang active. Khi live sẽ nâng **gói VIP 1.000 GD/tháng** (anh Hiếu đã chọn). Một workspace duy nhất (pháp nhân anh Uy) sẽ nối cả MB + VCB.
- **Ngân hàng CHƯA liên kết:** MB chờ lịch nhập OTP của anh Uy (dự kiến 12/06). VCB: SePay sales đã xác nhận thủ tục = **pháp nhân ký hợp đồng kết nối API với VCB tại chi nhánh mở tài khoản, viện dẫn công văn 9335 ngày 27/05/2026**; VCB cấp **1 số tài khoản con** dành riêng cho kết nối — khách quét QR vào tài khoản con, tiền vẫn đổ về tài khoản chính. → Test trên tài khoản thật phải chờ; **test Sandbox của Cổng thanh toán (Test mode) thì làm được ngay** khi có quyền dashboard.
- **Đã chốt thêm 2 quyết định:** (1) Phương án 1 cho mã thanh toán — backend tự bóc mã từ nội dung CK (lý do mới ở 1.1); (2) GĐ2 thay PayOS cho MB sẽ đi đường **VA chính thức của MB** (mục 3).

## 1. Sửa báo cáo vòng 1 — 2 chỗ sai

### 1.1. Mục 1 báo cáo: format mã thanh toán KHÔNG phải `TT-20260001-001`

- **Format thật:** 5 ký tự base36 (ví dụ `FHB9T`), sinh tại `_transfer_code_hint` — `backend/payment_request_routes.py:843`: từ PR id `PR-YYYY-NNNN` → 2 số năm + 4 số thứ tự PR + 2 số thứ tự lần thanh toán → đổi base36, pad đủ 5 ký tự.
- **Nội dung CK đầy đủ** build tại `_build_payos_transfer_description` (dòng 874): `SĐT (kèm mã quốc gia) + tên ASCII + MÃ` → ví dụ thật: `84989778983 Minh FHB9T`. Tiền tố `CSP...` thấy trên QR hiện tại là mã do PayOS tự gắn, không phải của app.
- **Nguồn sai:** file mock frontend `mockPaymentRequests.ts` (`TT-PR42-001`) — dữ liệu giả để dev UI, không phản ánh hệ thống thật. Lần sau đối chiếu code backend trước.
- **Kết luận PA1 GIỮ NGUYÊN, nhưng đổi lý do:** mã 5 ký tự không có **tiền tố cố định** → bộ tách mã tự động của SePay (cần Prefix + độ dài hậu tố) không bóc được. Và backend **đã có sẵn** hàm khớp mã trong nội dung CK: `payment_request_routes.py:1137–1148` — webhook SePay **tái dùng hàm này**, không viết regex mới.

### 1.2. Mục 9 báo cáo: phí gateway — viết lại theo bảng giá thật

- Trang giá trên dashboard SePay (Minh chụp 11/06): SePay bán **quota giao dịch/tháng**; tính năng **"Cổng thanh toán trực tuyến" + Webhook/API nằm TRONG mọi gói** (kể cả FREE). Không có dòng phí % nào trên bảng giá. Vượt quota được phép, tính phí sau (~533đ/GD ở mức STARTUP; trả theo năm −20%, có ưu đãi ngân hàng hợp tác −15%).
- → **Bỏ khẳng định "gateway thu 1–2,5%"** (chưa có nguồn). Khuyến nghị A-trước vẫn đứng vững nhờ các lý do khác đã viết đúng: gateway v1 redirect làm đổi UX, mức ảnh hưởng code trung bình–cao, nguyên tắc không đụng PayOS. Cập nhật lại dòng "Phí giao dịch" trong bảng so sánh.
- Nghi vấn còn lại → Q1 bên dưới.

## 2. Câu hỏi verify vòng 2 (hỏi support SePay / đọc docs — ghi rõ nguồn từng câu)

| # | Câu hỏi |
|---|---------|
| Q1 | Cổng thanh toán: giao dịch **QR chuyển khoản** có thu % không hay chỉ trừ quota gói? Phương thức **thẻ** qua gateway thì có MDR riêng không? |
| Q2 | **VCB OneQR**: QR động có **mã tham chiếu riêng theo từng QR** không (cho phép khớp tầng hạ tầng như PayOS), hay chỉ dựa nội dung CK? |
| Q3 | **VA của MB** qua SePay: có VA "động" (gắn sẵn số tiền + tự hết hạn) hay chỉ VA tĩnh? Nếu tĩnh thì pattern khuyến nghị: VA theo từng lần thanh toán hay theo khách? |
| Q4 | **Quota số lượng VA** theo gói (FREE / STARTUP / VIP)? |
| Q5 | Webhook khi tiền vào VA: field `subAccount` trả về gì (số VA?) — xin **payload mẫu** thực tế. |

> _Cập nhật Q2 (12/06):_ SePay sales cho biết VCB cấp **tài khoản con** riêng cho kết nối OneQR — khách quét vào tài khoản con, tiền về tài khoản chính. Hệ quả cho spec: webhook VCB nhiều khả năng trả `accountNumber` = **số tài khoản con** (không phải số tài khoản chính của công ty) → thiết kế `/webhook/sepay` phải nhận diện tài khoản theo **danh sách cấu hình (env/config)**, không hard-code 1 số; xác nhận lại số thật khi VCB cấp. Câu "QR động có mã tham chiếu per-QR không" vẫn cần trả lời.

## 3. Định hướng GĐ2 đã chốt (đưa vào spec, chưa code)

- **MB thay PayOS → dùng VA chính thức MB qua SePay:** mỗi lần thanh toán 1 VA riêng → webhook khớp theo `subAccount` → độ chắc tương đương PayOS (khách sửa/xóa nội dung CK vẫn khớp đúng).
- **VCB không có VA chính thức trên SePay** → giữ cơ chế khớp 4 lớp: mã 5 ký tự trong `content` (hàm dòng 1137) → đối chiếu `transferAmount` → chống trùng theo `id` SePay → không khớp thì vào **giao dịch cần đối soát** + poll fallback (`GET userapi.sepay.vn/v2/transactions`, Bearer token).

## 4. Deliverable vòng 2

1. **Báo cáo v2:** sửa mục 1 + mục 9 theo phần 1 ở trên; bổ sung trả lời Q1–Q5 (kèm nguồn: link docs / ảnh chat support).
2. **Spec kỹ thuật GĐ1 sẵn sàng code** (file md mới trong `docs/`, để review trước — KHÔNG code vào main):
   - Schema patch bảng `bank_transactions`: unique `sepay_id`, các cột gateway/account_number/sub_account/amount/content/transaction_date, cột trạng thái (`auto_matched` / `needs_review` / `ignored`), cột `raw` jsonb, liên kết `payment_line_id`.
   - Endpoint `/webhook/sepay`: verify HMAC-SHA256 trên **raw body** (`await request.body()` trước mọi parser — rủi ro số 1 báo cáo đã nêu); trả `200` + `{"success": true}` trong 30 giây; luồng khớp tái dùng hàm `payment_request_routes.py:1137`; quy tắc: đúng mã + đúng tiền → `paid`, đúng mã sai tiền → `needs_review`.
   - `sync-pending-sepay` (poll fallback) qua `GET /v2/transactions`.
   - FE `PaymentModal.tsx`: thêm lựa chọn VCB → VietQR tự sinh (STK VCB + amount + nội dung đúng chuẩn `_build_payos_transfer_description`, bỏ phần gọi PayOS).
3. **(Khi được cấp quyền dashboard)** bật Test mode Cổng thanh toán: chạy simulator, **chụp lại payload IPN mẫu** đưa vào spec. Webhook biến động số dư thật thì chờ ngân hàng liên kết xong.

**Hẹn:** mục (1)+(2) trong **1–1,5 ngày làm việc**; mục (3) theo tiến độ liên kết ngân hàng. Vướng gì ping Minh sớm.

## 5. Trạng thái các đầu việc phía Minh (cập nhật tối 11/06)

- **Quyền dashboard SePay:** Giang/Đạt gửi cho Minh: **họ và đệm + tên + email** (email sẽ là user đăng nhập) → Minh tạo người dùng trên SePay với mật khẩu tạm (đăng nhập xong tự đổi), vai trò "Người dùng bình thường". Đăng nhập vào mà **không thấy mục Webhook / API Access / Test mode** thì báo Minh nâng vai trò.
- **Liên kết MB (OTP anh Uy):** Minh đã nhắn anh Hiếu, dự kiến giải quyết trong **12/06**.
- **3 câu hỏi với SePay support — ĐÃ CÓ KẾT QUẢ (12/06):** (a) Thủ tục OneQR cho tài khoản có sẵn: pháp nhân liên hệ **chi nhánh VCB nơi mở tài khoản**, đề nghị mở OneQR kết nối SePay **theo công văn 9335 ngày 27/05/2026**, ký hợp đồng kết nối API; VCB cấp tài khoản con. (b) Là **kết nối API chính thức** (không phải kiểu đọc thông báo điện thoại) → kỳ vọng realtime như MB; số đo độ trễ cụ thể xác nhận khi chạy thật. (c) Nâng gói VIP: **mua online, quét QR thanh toán là xong, không cần giấy tờ** (589k/th nếu trả theo tháng; chọn chu kỳ năm còn ~471k/th). Còn mở: Q1 (phí % gateway) và vế per-QR của Q2.
- **Việc mới — thủ tục chi nhánh VCB:** chờ anh Hiếu/anh Uy thu xếp người đại diện pháp nhân làm việc với chi nhánh (mang GPĐKKD). Giang **không bị block**: sandbox + spec làm trước được.
- **Môi trường nhận webhook khi test:** mặc định dùng **ngrok** từ máy dev cho giai đoạn thử tay (nhanh, không đụng production). Nếu cần một bản backend staging riêng trên Render để test bền hơn, Giang/Đạt đề xuất — Minh duyệt.

## 6. Tài liệu & ràng buộc (không đổi so với v1)

- Docs: https://developer.sepay.vn/vi/ — các trang chính: `cong-thanh-toan/bat-dau`, `cong-thanh-toan/API/tong-quan`, `cong-thanh-toan/IPN`, `sepay-webhooks/tich-hop-webhook`, `sepay-webhooks/tai-khoan-ngan-hang`; user docs: https://docs.sepay.vn/
- Bối cảnh đầy đủ: `docs/bao-cao-tich-hop-thanh-toan.md` + báo cáo vòng 1 của Giang.
- Ràng buộc giữ nguyên: PayOS chạy song song không downtime; test nhỏ trước live (chỉ đạo anh Hiếu); thuật ngữ **PR / lần thanh toán / giao dịch cần đối soát**; SePay đã chốt — không so sánh lại nhà cung cấp.
