# Báo cáo nghiên cứu: Thanh toán quẹt thẻ – trả góp (mPOS, Payoo) & đồng bộ tài khoản ngân hàng (Casso Flow, SePay, VCB)

**Ngày cập nhật:** 11/06/2026
**Phạm vi:** Theo yêu cầu của anh Hiếu — (1) tìm cách nối mPOS và Payoo vào app theo mô hình webhook như PayOS; (2) tìm hiểu Casso Flow; (3) phương án kết nối tài khoản VCB của chi nhánh HCM vào app.

---

## 1. Tóm tắt nhanh (TL;DR)

| # | Câu hỏi | Kết luận |
|---|---------|----------|
| 1 | Nối mPOS & Payoo vào app được không? | **Được, đúng mô hình PayOS đang chạy**: giao dịch xong → họ bắn webhook về app → app tự khớp vào lần thanh toán của PR. Khác biệt duy nhất: phải **ký hợp đồng doanh nghiệp trước**, rồi mới được cấp tài liệu kỹ thuật + môi trường thử nghiệm. |
| 2 | Casso Flow là gì, sao ngưng chạy? | Là "robot" đọc biến động số dư ngân hàng rồi đẩy về app/email/Google Sheets. Đang ngưng vì **gói trả phí hết hạn**. Với VCB, Casso vẫn yêu cầu mật khẩu internet banking → không giải quyết được bài toán HCM. |
| 3 | Tài khoản VCB HCM nối kiểu gì? | Dùng **SePay** — không bao giờ yêu cầu mật khẩu ngân hàng, và vừa **hợp tác chính thức với Vietcombank (VCB OneQR)**, đúng phân khúc tài khoản DigiBiz mà HCM đang dùng. |

> Lưu ý: SePay × VCB có chương trình tặng 6 tháng miễn phí nhưng **chỉ áp dụng cho tài khoản VCB mở mới** → tài khoản DigiBiz có sẵn của HCM không thuộc diện. Chi phí tính theo bảng giá thường (mục 5.3 — có gói miễn phí 50 giao dịch/tháng để chạy thử).

---

## 2. Hiện trạng

App đang thu học phí qua **PayOS**: app tạo link/QR → khách chuyển khoản → PayOS gọi webhook về app (có chữ ký chống giả mạo) → app tự khớp giao dịch vào lần thanh toán của PR tương ứng; khoản nào không khớp được thì rơi vào danh sách giao dịch cần đối soát. Mô hình này là khuôn mẫu để nối thêm các cổng khác.

Hai tài khoản ngân hàng hiện tại thuộc **2 pháp nhân khác nhau**:

| Chi nhánh | Ngân hàng | Loại tài khoản | Pháp nhân | Tình trạng |
|-----------|-----------|----------------|-----------|------------|
| Hà Nội | MB Bank | MB BIZ (doanh nghiệp) | Trần Quốc Uy | Đã nối PayOS; từng nối Casso Flow (nay hết hạn gói) |
| HCM | Vietcombank | VCB DigiBiz | Pháp nhân khác (chưa rõ tên) | **Chưa nối được** — Casso yêu cầu user/pass internet banking |

Lưu ý: **PayOS không hỗ trợ Vietcombank** (chỉ hỗ trợ MB, OCB, BIDV, KienlongBank, ACB, Shinhan) → không thể đi đường PayOS cho tài khoản VCB.

---

## 3. Ưu tiên 1 — Nối mPOS & Payoo vào app (quẹt thẻ + trả góp)

### 3.1. Mô hình chung — giống hệt PayOS

> App tạo yêu cầu thanh toán → khách quẹt thẻ / chọn trả góp tại máy POS hoặc qua link → mPOS/Payoo xử lý với ngân hàng → **bắn webhook báo kết quả về app** → app tự khớp vào lần thanh toán của PR.

| | PayOS (đang dùng) | mPOS (NextPay) | Payoo (VietUnion) |
|---|---|---|---|
| Thủ tục đăng ký | Tự đăng ký online | Ký hợp đồng với NextPay | Ký hợp đồng với VietUnion |
| Hình thức thu | QR chuyển khoản | Máy quẹt thẻ, tap-to-phone, QR | Cổng online, POS, 50.000 điểm thu hộ |
| Trả góp | Không | **0% qua 30+ ngân hàng**, có cả link trả góp online | **Trả góp qua API** (đã chạy với HDBank: 0%, đơn từ 3 triệu, kỳ hạn 3–12 tháng) |
| Báo kết quả về app | Webhook (đang chạy) | Webhook (có REST API cho đối tác) | IPN (bản chất là webhook) |
| Tài liệu kỹ thuật | Công khai | **Chỉ cấp sau khi ký hợp đồng** | Một phần công khai tại developers.payoo.vn |

### 3.2. mPOS (NextPay)

- Máy quẹt chấp nhận mọi loại thẻ (thẻ từ, chip, contactless) của hơn 30 ngân hàng; hỗ trợ tap-to-phone (biến điện thoại thành máy POS) và QR.
- Trả góp 0% liên kết hơn 30 ngân hàng/tổ chức thẻ; có tính năng **tạo link trả góp online** (tương tự link thanh toán PayOS).
- Có API + webhook cho đối tác (tồn tại tài liệu "MPOS Push Payment REST API": app gửi yêu cầu thanh toán sang mPOS → khách quẹt thẻ → mPOS gọi webhook báo kết quả về app). Tài liệu **không công khai**, chỉ cấp khi làm việc trực tiếp.
- **Cách tiếp cận:** đăng ký nhận tư vấn trên mpos.vn (có form), nêu rõ nhu cầu "tích hợp API thanh toán + trả góp vào hệ thống quản lý nội bộ".

### 3.3. Payoo (VietUnion)

- Điểm mạnh riêng: mạng lưới **50.000 điểm thu hộ** tại cửa hàng tiện lợi (Circle K, FamilyMart…) — phụ huynh có thể đóng học phí bằng tiền mặt tại đó, app vẫn nhận thông báo tự động.
- Đã có tiền lệ triển khai **trả góp 0% qua API** với HDBank.
- Lưu ý kỹ thuật (xử lý được, chỉ ghi nhận): chuẩn tích hợp của Payoo hơi cũ (dữ liệu dạng XML, webhook phải phản hồi đúng định dạng quy định) → tốn thêm 1–2 ngày so với PayOS.

**Cách tiếp cận — gọi thẳng sales phụ trách trả góp theo miền** (danh bạ chính thức trên tragop.payoo.vn):

| Khu vực | Đầu mối | Số điện thoại |
|---------|---------|----------------|
| Hà Nội | Mr. Toàn | 0966 556 969 |
| Hà Nội | Ms. Hoa | 0904 263 535 |
| TP.HCM | Mr. Huy | 0904 478 748 |
| TP.HCM | Ms. Hằng | 0907 953 767 |
| TP.HCM | Ms. Thanh | 0975 910 232 |
| TP.HCM | Ms. Quý | 0988 535 258 |

Kênh thay thế: để lại thông tin trên form tại tragop.payoo.vn (Payoo gọi lại) hoặc tổng đài VietUnion **1900 545 478**; có cả Zalo OA "Payoo" để chat.

**Quy trình hợp tác:** gọi sales → tư vấn + báo biểu phí → ký **hợp đồng dịch vụ chấp nhận thanh toán với VietUnion** (đứng tên pháp nhân nhận tiền) → nhận bộ khóa tích hợp (BusinessUsername, ShopID, ChecksumKey) + tài khoản thử nghiệm (sandbox) + tài liệu kỹ thuật → dev nối webhook vào app.

### 3.4. Lưu ý quan trọng do 2 pháp nhân

Hợp đồng merchant (mPOS/Payoo) **đứng tên pháp nhân nhận tiền** — máy quẹt đặt ở miền nào thì tiền về tài khoản pháp nhân miền đó. Nếu cả HN lẫn HCM đều triển khai quẹt thẻ/trả góp thì gần như chắc chắn cần **2 bộ hợp đồng riêng** (phí chiết khấu, đối soát, dòng tiền tách theo từng pháp nhân).

→ **Cần anh Hiếu chốt: miền nào triển khai quẹt thẻ/trả góp trước**, để ký hợp đồng miền đó trước, tránh ôm 2 hợp đồng cùng lúc.

### 3.5. Bộ câu hỏi khi gặp sales (dùng chung cho cả 2 bên)

1. Phí chiết khấu mỗi giao dịch quẹt thẻ (thẻ nội địa / quốc tế / trả góp) là bao nhiêu %? Ai chịu phí trả góp — cửa hàng hay khách?
2. Bao lâu tiền về tài khoản công ty?
3. Có môi trường thử nghiệm (sandbox) và tài liệu API không? Webhook có chữ ký xác thực không?
4. Máy POS thuê hay mua? Phí duy trì hàng tháng?
5. Một hợp đồng dùng được cho nhiều điểm bán / nhiều pháp nhân không?

### 3.6. Khối lượng kỹ thuật phía app

Mỗi cổng khoảng **2–4 ngày dev** sau khi có tài liệu + sandbox: thêm 1 đầu nhận webhook bên cạnh luồng PayOS hiện có, tái sử dụng toàn bộ khung khớp lần thanh toán & xử lý giao dịch cần đối soát hiện có. Không phải làm lại gì lớn.

---

## 4. Ưu tiên 2 — Casso Flow là gì

- **Bản chất:** robot tự đọc biến động số dư các tài khoản ngân hàng, rồi đẩy thông tin đến nơi mình muốn: webhook về app, email, Google Sheets, chat nhóm…
- **Vì sao đang ngưng:** banner vàng trên màn hình Casso = gói trả phí đã hết hạn hoặc hết lượt giao dịch → Casso ngưng đồng bộ tài khoản MB. Muốn chạy tiếp phải bấm "Gia hạn gói".
- **Giá:** thu **theo năm**, tính trên tổng số giao dịch vào + ra của mọi tài khoản đã kết nối. Giá chi tiết xem tại casso.vn/flow/bang-gia hoặc gọi 1900 8144. Casso đang úp mở việc ra **gói miễn phí không giới hạn giao dịch** — đáng hỏi khi gọi.
- **Hai kiểu kết nối ngân hàng của Casso:**

| Kiểu kết nối | Cần mật khẩu? | Ngân hàng áp dụng |
|--------------|---------------|-------------------|
| API chính thức của ngân hàng | Không | MB (vì vậy lần trước nối MB dễ dàng) |
| "Đăng nhập hộ" (robot dùng user/pass internet banking, cam kết chỉ-đọc, mã hóa) | **Có** | **VCB thuộc nhóm này** → đúng lo ngại đã nêu, không có cách khác trên Casso |

- **Định vị so với PayOS:** Casso và PayOS là **cùng một công ty**. PayOS = xác nhận thanh toán cho từng đơn cụ thể (QR động) — app đang dùng rồi. Casso Flow = nghe *mọi* biến động tài khoản, kể cả khoản khách chuyển tay không qua QR của app.
- **Khuyến nghị:** tạm **chưa gia hạn Casso** — chờ kết quả làm việc với SePay (mục 5). Nếu SePay đáp ứng tốt thì gom cả MB + VCB về 1 mối, không cần duy trì 2 dịch vụ.

---

## 5. Ưu tiên 3 — Tài khoản VCB HCM: khuyến nghị dùng SePay

### 5.1. Vì sao là SePay

SePay là dịch vụ cùng loại với Casso, với 2 khác biệt quyết định:

1. **Không bao giờ yêu cầu mật khẩu internet banking** — chỉ cần số tài khoản + xác thực OTP của chủ tài khoản. Giải quyết đúng vướng mắc khiến VCB HCM chưa nối được.
2. **Vừa hợp tác chính thức với Vietcombank** triển khai **VCB OneQR cho doanh nghiệp/hộ kinh doanh**: QR tĩnh/động + xác nhận thanh toán tự động qua webhook — đúng kiến trúc app đang dùng với PayOS. Tài khoản **VCB DigiBiz của HCM đúng phân khúc** chương trình này nhắm tới.

### 5.2. Kết nối SePay như thế nào — tự đăng ký online, không cần ký hợp đồng giấy

SePay theo mô hình **tự phục vụ giống PayOS** (khác hẳn mPOS/Payoo phải ký hợp đồng). Các bước:

1. **Tạo tài khoản SePay miễn phí** tại my.sepay.vn/register — chỉ cần email, mất vài phút, không cần gặp ai.
2. **Thêm tài khoản ngân hàng** ngay trên trang quản trị:
   - **MB BIZ (Hà Nội):** chọn mục "Doanh nghiệp" → nhập số tài khoản → MB gửi OTP về số điện thoại đã đăng ký với ngân hàng (anh Uy nhập 1 lần) → liên kết xong. **Hoàn toàn tự làm**, không qua nhân viên nào.
   - **VCB DigiBiz (HCM):** kênh VCB OneQR **cần SePay hỗ trợ kích hoạt** → gọi hotline **02873.059.589** hoặc email **info@sepay.vn**, nêu rõ "muốn kết nối tài khoản VCB doanh nghiệp qua VCB OneQR"; người đứng tên pháp nhân HCM phối hợp xác thực theo hướng dẫn của họ.
3. **Chuyển khoản thử** một khoản nhỏ vào tài khoản vừa liên kết để kiểm tra SePay đã nhận được giao dịch.
4. **Trỏ webhook về app:** khai báo địa chỉ nhận của app trên trang quản trị SePay + bật xác thực — từ đó mọi giao dịch mới tự chảy về app (phần này dev làm, ~1 ngày).

Tóm lại: **MB tự đăng ký 100%; riêng VCB phải liên hệ SePay** vì đi qua chương trình hợp tác chính thức với Vietcombank.

### 5.3. Chi phí

| Gói | Giá | Giao dịch/tháng | Ghi chú |
|-----|-----|-----------------|---------|
| FREE | 0đ | 50 | Đủ để chạy thử |
| STARTUP | 120.000đ/tháng | 180 | Đầy đủ tính năng, có API/webhook |
| SHOP | 99.000đ/tháng | Không giới hạn | Chỉ cho cửa hàng, **không có API** — không phù hợp với app |

→ Rẻ hơn đáng kể so với gia hạn Casso theo năm.

### 5.4. MB Bank cũng nối SePay được (gom 1 mối)

- SePay là **đối tác Open Banking chính thức của MB Bank**. Kết nối tài khoản MB BIZ doanh nghiệp chỉ qua **OTP gửi về số điện thoại đã đăng ký với ngân hàng** — không mật khẩu, không giấy tờ.
- Tính năng cộng thêm đáng giá: **tài khoản ảo (VA)** cho MB BIZ — tạo nhiều số tài khoản ảo trỏ về cùng tài khoản thật, ví dụ mỗi team sale một số riêng, tiền vào tự phân loại nguồn mà không cần dò nội dung chuyển khoản. Rất hợp với cấu trúc 12 team trong app.

### 5.5. Tổ chức tài khoản SePay khi có 2 pháp nhân

| Phương án | Mô tả | Ưu / nhược |
|-----------|-------|------------|
| A — 1 tài khoản SePay nối cả 2 ngân hàng | Cần SePay xác nhận có cho phép 2 tài khoản ngân hàng thuộc 2 pháp nhân khác nhau chung 1 workspace không; hóa đơn dịch vụ xuất cho ai | Gọn nhất về phí và quản lý |
| B — Mỗi pháp nhân 1 tài khoản SePay | HCM tận dụng ưu đãi OneQR (6 tháng miễn phí); HN dùng gói FREE hoặc **chưa cần** (PayOS đang chạy ổn cho MB) | Chắc chắn hợp lệ; thêm 1 đầu mối quản lý |

Dù chọn phương án nào, **phía app không thay đổi**: webhook từ mọi nguồn đều đổ về cùng hệ thống, app phân biệt theo số tài khoản nhận tiền → tự gắn giao dịch về đúng chi nhánh HN/HCM (khung đối soát + chống trùng đã có sẵn).

### 5.6. Phương án dự phòng cho VCB (nếu SePay không đạt)

1. **VCB CashUp / H2H Open API** — kênh chính ngạch ký thẳng với Vietcombank, an toàn tuyệt đối, nhưng nhắm đến doanh nghiệp lớn, thủ tục nặng và triển khai lâu.
2. **Mở thêm tài khoản MB/OCB/BIDV cho HCM** rồi nối qua PayOS y như Hà Nội (workaround, không cần dịch vụ mới).
3. Casso với VCB (kiểu đăng nhập hộ) — **loại**, vì phải chia sẻ mật khẩu ngân hàng.

---

## 6. Tác động của việc 2 pháp nhân (tổng hợp)

| Hạng mục | Ảnh hưởng | Việc cần làm |
|----------|-----------|--------------|
| Kết nối ngân hàng vào SePay | Xác minh bằng OTP gửi về SĐT đăng ký của **từng** tài khoản | Anh Uy nhập OTP cho MB; người đứng tên pháp nhân HCM thao tác + đăng ký OneQR cho VCB (mỗi bên 1 lần duy nhất) |
| Hợp đồng mPOS / Payoo | Ký theo pháp nhân nhận tiền → có thể cần 2 hợp đồng | Chốt miền triển khai trước; chuẩn bị giấy tờ pháp nhân tương ứng |
| Phía app | **Không ảnh hưởng** | Chỉ thêm đầu nhận webhook; phân biệt giao dịch theo số tài khoản |

---

## 7. Kế hoạch hành động đề xuất

| # | Việc | Ai | Thời điểm |
|---|------|-----|-----------|
| 1 | Cung cấp đầu mối pháp nhân HCM (ai đứng tên TK VCB, ai nhập OTP/đăng ký OneQR) | Anh Hiếu | Tuần này |
| 2 | Chốt miền nào triển khai quẹt thẻ/trả góp trước | Anh Hiếu | Tuần này |
| 3 | Gọi SePay (02873.059.589): hỏi 3 câu — (a) thủ tục kích hoạt OneQR cho TK VCB DigiBiz có sẵn gồm những gì? (b) 2 pháp nhân chung 1 workspace được không? (c) webhook VCB có tức thời như MB không? | Team DA | Tuần này |
| 4 | Đăng ký tư vấn mPOS (form trên mpos.vn) + gọi sales Payoo theo miền (danh bạ mục 3.3), mang theo bộ câu hỏi mục 3.5 | Team DA / anh Hiếu | Tuần này |
| 5 | Khi có tài liệu/hợp đồng: nối webhook vào app — SePay ~1 ngày; mPOS/Payoo ~2–4 ngày mỗi cổng | Dev | Sau khi ký |
| 6 | Quyết định số phận Casso: gom về SePay hay gia hạn | Anh Hiếu | Sau khi test SePay |

---

## 8. Nguồn tham khảo

**mPOS / NextPay**
- Giải pháp thanh toán thẻ: https://mpos.vn/giai-phap-thanh-toan-the
- Tạo link trả góp 0% online: https://mpos.vn/tin-tuc/mpos-bo-sung-tinh-nang-tao-link-tra-gop-0-online
- Tài liệu MPOS Push Payment REST API (bản lưu hành nội bộ, tham khảo): https://www.studocu.vn/vn/document/truong-dai-hoc-su-pham-ky-thuat-thanh-pho-ho-chi-minh/thanh-toan-quoc-te/mpos-push-payment-integration-1/109610780

**Payoo / VietUnion**
- Trang trả góp + danh bạ sales theo miền: https://tragop.payoo.vn/
- Tài liệu tích hợp: https://developers.payoo.vn/docs/PayooPGW_IntegrationDocument_GooglePay.pdf
- Quy trình tích hợp Payoo Gateway (JAYbranding): https://jaybranding.com/en/tich-hop-payoo-gateway-ket-noi-50000-diem-thanh-toan-offline/
- Payoo × HDBank trả góp 0% qua API: https://www.payoo.vn/tin-tuc/payoo-va-hd-bank-lan-dau-ap-dung-phuong-thuc-api-trong-hop-tac-trien-khai-dich-vu-tra-gop-0.html

**Casso**
- Giới thiệu Casso Flow: https://casso.vn/flow/
- Bảng giá: https://casso.vn/flow/bang-gia/
- Tin gói miễn phí sắp ra: https://casso.vn/casso-flow-sap-co-goi-mien-phi-giao-dich-khong-gioi-han/

**PayOS**
- Ngân hàng hỗ trợ: https://payos.vn/

**SePay**
- Hướng dẫn đăng ký tài khoản: https://docs.sepay.vn/dang-ky-sepay.html
- API ngân hàng (cam kết không cần mật khẩu): https://sepay.vn/api-ngan-hang.html
- Hợp tác Vietcombank VCB OneQR + ưu đãi: https://sepay.vn/blog/sepay-hop-tac-cung-vietcombank-trien-khai-vcb-oneqr-cho-doanh-nghiep-ho-kinh-doanh/
- Bảng giá: https://sepay.vn/bang-gia.html
- Đối tác chính thức MB Open Banking: https://sepay.vn/mb.html
- Hướng dẫn kết nối MB doanh nghiệp (OTP): https://docs.sepay.vn/ket-noi-mb-api.html
- Tài khoản ảo (VA) cho MB: https://sepay.vn/blog/sepay-ra-mat-tinh-nang-tao-va-tinh-cho-mb-bank-qua-api/
- Ngân hàng hỗ trợ webhook: https://developer.sepay.vn/vi/sepay-webhooks/tai-khoan-ngan-hang

**Vietcombank**
- VCB DigiBiz: https://portal.vietcombank.com.vn/Corporate/SMEs/Digital-banking/Pages/VCB-DigiBiz.aspx
- H2H / Open API (VCB CashUp): https://www.vietcombank.com.vn/en/To-Chuc/Doanh-Nghi%E1%BB%87p/Gi%E1%BA%A3i-ph%C3%A1p/KHTC---Ngan-hang-so/KHTC---Ket-noi-he-thong
