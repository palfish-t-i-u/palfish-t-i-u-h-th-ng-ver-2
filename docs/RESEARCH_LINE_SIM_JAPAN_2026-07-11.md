# Nghiên cứu: Liên hệ lead Nhật qua LINE — SIM ảo & phương án thay thế

**Ngày:** 2026-07-11
**Yêu cầu từ:** Anh Hiếu (GĐ)
**Người thực hiện:** Minh + Claude

---

## 1. Yêu cầu gốc

Sales ở VN không liên hệ được lead Nhật (đầu số +81) bằng các kênh thông thường. Cần tìm cách **chủ động nhắn cho khách qua LINE** — app nhắn tin phổ biến nhất tại Nhật.

Hướng ban đầu: mua SIM ảo số Nhật để dùng LINE.

## 2. Kết luận nghiên cứu

### LINE chặn việc chủ động nhắn người lạ — đây là thiết kế cố ý, không phải thiếu công cụ

- LINE là hệ thống **opt-in**: không cho người lạ tự thêm nhau rồi nhắn. Khách phải **bấm đồng ý kết bạn trước**.
- Muốn **tìm/thêm khách bằng số điện thoại**, tài khoản LINE phải qua **xác thực tuổi** — chỉ chạy với SIM chính chủ docomo/au/SoftBank/Y!mobile (cần thẻ cư trú tại Nhật, không đứng tên công ty).
- Thêm nhiều người lạ dồn dập → LINE **khóa tài khoản** trong vài giờ đến vài ngày.

### Toàn bộ nhà cung cấp SIM Nhật đã khảo sát

| Nhà cung cấp | Giá | Gửi về VN? | Dùng ở VN? | Kết luận |
|---|---|---|---|---|
| **Mobal Voice Lite** | ¥990/tháng (~170k) | Không — VN không trong danh sách ship | Không roaming | Kẹt ở khâu giao nhận |
| **Mobal Voice+Data 5G** | ~$25 setup + $10.4/tháng | Không — VN "Country not listed" | Có roaming | Tương tự, không ship VN |
| **Sakura Mobile Voice** | ¥3.278/tháng + ¥5.500 kích hoạt | Không — chỉ nhận tại Nhật | Không rõ | Cần có mặt ở Nhật |
| **Hanacell** | ~$39/tháng | Ship quốc tế được | Không roaming | Có ship nhưng không dùng ở ngoài Nhật |
| **GTN Mobile** | từ ¥3.278 | Không — nhận tại Nhật | Không rõ | Cần ở Nhật |
| **LINEMO / povo / ahamo** | từ ¥990 | Không | Có roaming | Cần thẻ cư trú Nhật, chặn hoàn toàn người nước ngoài |
| **AVOXI (VoIP)** | từ $7.99/tháng | Dùng online | Có | Chỉ có số cố định, **LINE từ chối số VoIP** |
| **Sim2Go.vn** | 215k–625k | Giao tại VN | Có | **Data only**, không có số điện thoại |

**Kết luận:** Không có nhà cung cấp SIM hợp pháp nào gửi được SIM voice Nhật về VN. Tất cả bị chặn bởi luật Nhật (xác minh danh tính bằng thư vật lý) hoặc bởi LINE (từ chối số VoIP).

### LINE Official Account (OA) — khả năng gọi điện

- Khách gọi cho doanh nghiệp: **CÓ** (voice + video call)
- Doanh nghiệp gọi cho khách: **KHÔNG** (chỉ nhận cuộc gọi, không gọi ra)
- Nhắn tin cho khách đã add: **CÓ**
- Nhắn cho người chưa add: **KHÔNG**

### HLR Lookup — công cụ lọc "số thật / số chết" (bổ trợ, không thay thế LINE)

- Truy vấn thẳng nhà mạng: số hợp lệ? di động hay VoIP? nhà mạng nào? còn active?
- Nhà cung cấp uy tín: Twilio Lookup (~$0.013/số), IPQualityScore (~$0.0005/số), hlr-lookups.com (€0.010/số).
- Lưu ý: nhà mạng Nhật hạn chế trả về "reachable" — chỉ lọc được số rác/sai, không chắc biết "đang online".
- Hợp dùng để **lọc list lead trước khi dồn công outreach**, tiết kiệm thời gian sale.

## 3. Phương án đã chốt

### Phương án A — Nhanh nhất, làm được ngay từ VN ⭐

**Thuê số Nhật thật qua dịch vụ SMS verification → đăng ký LINE → liên hệ khách.**

Các dịch vụ cho thuê số di động Nhật thật (không phải VoIP, đầu 070/080/090) hoạt động công khai, dùng được từ VN:

| Dịch vụ | Giá | Link |
|---|---|---|
| **SMSPVA** | từ ~$0.10/lần (~2.500đ) | smspva.com |
| **PVAPins** | tương đương | pvapins.com/temp-number/japan |
| **1001SMS** | tương đương | 1001sms.com/japan |

**Quy trình (5 phút, từ VN):**
1. Vào SMSPVA → chọn **Japan** → chọn **LINE**
2. Thuê 1 số → hệ thống cấp số +81 thật
3. Mở LINE → Đăng ký tài khoản mới → nhập số vừa thuê
4. LINE gửi SMS xác minh → mã hiện trên trang web dịch vụ → nhập mã
5. Tài khoản LINE tạo xong → dùng LINE bình thường trên điện thoại
6. Lưu số khách vào danh bạ → đồng bộ → kết bạn → nhắn tin

**Rủi ro phải biết:**
- Số thuê tạm (thường 20 phút). Nếu không giữ/gia hạn, số có thể bị gán cho người khác → người đó đăng ký LINE bằng số đó → **tài khoản LINE của mình bị đá ra**.
- **Bắt buộc thuê dài hạn** (gia hạn giữ số) nếu muốn dùng LINE lâu dài — đừng dùng số tạm.
- Vi phạm điều khoản LINE (không phạm luật hình sự), rủi ro bị khóa tài khoản nếu LINE phát hiện.
- Thêm nhiều người lạ dồn dập vẫn bị khóa — phải làm thủ công, rải chậm.

### Phương án B — Nhờ người ở nước ngoài nhận SIM Mobal

Nếu công ty có người ở **Nhật, Singapore, Hong Kong, Đài Loan, Hàn, Mỹ, UK, Úc, Trung Quốc**:
- Đặt Mobal Voice Lite (¥990/tháng ~170k) tại mobal.com/japan-esims
- Người đó nhận thư → chụp mã eSIM → gửi về VN cài
- Ưu điểm: số sạch, ổn định, không lo mất số
- Nhược điểm: phụ thuộc người ở nước ngoài

### Phương án C — Bền vững, scale được (triển khai sau)

**Funnel SMS → mời khách kết bạn LINE Official Account.**

- Gửi SMS tới số +81 kèm link "Kết bạn LINE" → khách bấm → thành bạn → sale nhắn thoải mái
- Hợp pháp, không bị khóa, làm lớn được
- Cần: LINE Official Account + dịch vụ gửi SMS quốc tế (Twilio)
- Chi phí ước tính: chưa tính (cần biết số lượng lead/tháng)

### Bổ trợ — HLR Lookup lọc số chết

- Chạy list qua Twilio Lookup / IPQS trước khi outreach
- Bỏ số rác, dồn công vào số sống
- Chi phí: ~300đ–3.000đ/số tuỳ nhà cung cấp

## 4. Việc cần làm

### Ngay bây giờ
- [ ] **Phương án A:** Thử thuê số Nhật qua SMSPVA/PVAPins → đăng ký LINE → test liên hệ vài khách
- [ ] Nếu thuê số tạm thành công → gia hạn giữ số dài hạn để không mất tài khoản LINE
- [ ] Hỏi anh Hiếu: công ty có ai ở Nhật / SG / HK / TW / Hàn / Úc / Mỹ / UK không? (cho phương án B)

### Sau khi test
- [ ] Ghi nhận kết quả: đăng ký LINE thành công? bao nhiêu khách kết bạn được? bị khóa không?
- [ ] Nếu phương án A ổn → nhân rộng cho sale, mỗi người 1 số thuê dài hạn
- [ ] Nếu không ổn → triển khai Phương án C (SMS → LINE OA)

### Tuỳ chọn bổ sung
- [ ] Đăng ký trial Twilio Lookup / IPQS để test HLR trên ~200 số JP
- [ ] Viết script Python lọc list số (tích hợp vào backend nếu cần)

## 5. Nguồn tham khảo

- [LINE Help — Xác thực tuổi bắt buộc để tìm bằng SĐT](https://help.line.me/line/smartphone/sp?contentId=20018132&lang=en)
- [Mobal — eSIM Voice có số Nhật, không cần thẻ cư trú](https://www.mobal.com/japan-esims/)
- [Mobal — không xác thực tuổi LINE nhưng kết bạn bằng danh bạ/QR được](https://helpdesk.mobal.com/support/solutions/articles/205000042815-line-app-age-verification-issue)
- [Sakura Mobile — không xác thực tuổi LINE](https://support.sakuramobile.jp/hc/en-us/articles/4406084937869)
- [Luật chống lạm dụng ĐTDĐ Nhật — SIM nghe gọi phải chứng minh cư trú](https://eng.blogfromamerica.com/archives/43)
- [Twilio Lookup — Line Type Intelligence + Line Status](https://www.twilio.com/docs/lookup/v2-api/line-status)
- [IPQualityScore — Phone Validation / HLR](https://www.ipqualityscore.com/solutions/phone-validation)
- [hlr-lookups.com — Enterprise HLR, pricing](https://www.hlr-lookups.com/en/pricing)
- [respond.io — LINE Official Account: DN không thể cold-add, khách phải opt-in](https://respond.io/blog/line-business)
- [LINE Help — LINE Call: OA chỉ nhận cuộc gọi, không gọi ra](https://help.line.me/line/?contentId=20017541)
- [AVOXI — số VoIP Nhật, LINE từ chối](https://www.avoxi.com/japan-virtual-phone-numbers/)
- [SMSPVA — thuê số Nhật thật cho LINE verification](https://blog.smspva.com/verify-line-japan-rented-phone-number/)
- [Từ 04/2026 Nhật siết kiểm tra danh tính SIM](https://www.visasupdate.com/post/foreigners-japan-now-face-stricter-id-checks-data-sim-april-2026)
