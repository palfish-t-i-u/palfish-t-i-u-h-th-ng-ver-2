# Đi sâu 3 nền tảng đa kênh: Sobot · Infobip · Sinch

**Ngày:** 13/10/2026 · **Người làm:** Minh · **Bối cảnh:** chị Huyền (CS) cần gom tất cả kênh chat KH — **Zalo + Facebook + WhatsApp + KakaoTalk + Line** — vào một chỗ để trực đồng bộ. Salework (đang dùng) và Pancake đều không đủ kênh. Đây là báo cáo đào sâu 3 ứng viên mạnh nhất.

> **2 sự thật nền (đúng cho CẢ 3 nền tảng, không cái nào gỡ được):**
> - **Zalo** chỉ gom được qua **Zalo OA** (tài khoản chính thức công ty), KHÔNG gom nick cá nhân. Chỉ công ty có pháp nhân VN mới bật được.
> - **KakaoTalk** muốn bật Business Channel cần **giấy phép kinh doanh Hàn Quốc** (hoặc đại lý Kakao ở Hàn). Dù chọn tool nào, vẫn vướng điều kiện này ở phía Kakao.

---

## 1. Sobot

**Gốc:** Công ty **Trung Quốc** (Beijing Sobot / 智齿 Zhichi, lập ~2012-2014; SoftBank Vision Fund 2 rót $100M Series D). → ⚠️ **Đây là điểm cần cân nhắc kỹ nhất**: toàn bộ chat khách (dữ liệu cá nhân KH) sẽ nằm trên hệ của một công ty Trung Quốc. Chưa xác minh được chứng chỉ bảo mật (SOC 2 / ISO 27001) — **phải hỏi + hỏi dữ liệu lưu ở đâu, có host ngoài TQ không**.

**Kênh:** Trang chính thức chỉ liệt kê WhatsApp/Line/Facebook/WeChat/TikTok. NHƯNG **help center có hướng dẫn tích hợp THẬT cho cả Zalo lẫn KakaoTalk** → đây là con **DUY NHẤT trong 3** có tài liệu setup đủ 5 kênh. Zalo = qua Zalo OA (Marketplace → app ID/key → đăng ký API → verify domain → webhook → chọn sự kiện → **định tuyến chat theo CRM tag**).

**Tính năng:** một workbench gộp mọi kênh + dữ liệu KH; nối CRM (Salesforce/Shopify); AI chatbot/assist; báo cáo hiệu suất + CSAT + cân tải nhân viên; định tuyến theo tag; có voice + ticketing; có API docs. ⚠️ Chưa thấy mô tả **giám sát viên nghe/xem realtime hay chấm điểm QA** → hỏi demo.

**Giá:** ~**$20/user/tháng** (khởi điểm) → $70+/agent; có gói free cho đội nhỏ; quảng cáo "all-in-one, không tính phí theo từng kênh" (cần kiểm). Báo giá theo yêu cầu. Capterra ~4.9/5 (~100 review, vendor tự gom). Chê: hơi đắt + hỗ trợ đôi lúc khó gặp.

**Chốt Sobot:** phủ kênh tốt nhất + giá mềm nhất, nhưng **rủi ro dữ liệu (công ty TQ)** + quảng cáo hơi quá → phải verify chiều sâu Zalo/Kakao + bảo mật trong demo.

---

## 2. Infobip

**Gốc:** **Croatia / EU**, CPaaS toàn cầu, hạng doanh nghiệp, tuân thủ/bảo mật mạnh. **Là đối tác chính thức của Zalo tại Việt Nam.**

**Kênh trong hộp thư agent (Conversations):** KakaoTalk ✅ · LINE ✅ · Messenger ✅ · WhatsApp ✅ · Instagram · Viber · Telegram · TikTok · RCS · SMS · Apple Messages · Live Chat · **Open Channel** (cầu API để đổ BẤT KỲ kênh nào vào inbox). → **Zalo KHÔNG phải ô kênh native** trong inbox.

**Zalo ở Infobip:** nằm ở mảng **Zalo Business Solutions (ZBS)** — ZNS/OTP, tin theo template, gửi theo UID + số ĐT; chỉ cho **công ty có pháp nhân VN**. Muốn đưa Zalo vào hộp thư agent thì đi qua **Open Channel** (nối API) — **cần xác nhận với Infobip là làm được 2 chiều trong inbox**.

**Giá:** Conversations **€39/ghế/tháng** (Start, 1 kênh) / **€83/ghế/tháng** (Grow, tất cả kênh); phí tin nhắn từng kênh tính riêng. → 50 CS gói Grow ≈ **€4.150/tháng (~115 triệu/tháng)** + phí tin. **Đắt, hạng enterprise.** (Lưu ý: có nguồn nói Infobip đổi tên sản phẩm 3/2026 — kiểm lại.)

**Chốt Infobip:** **đáng tin nhất** + Kakao/Line/WhatsApp/FB native trong một inbox + đối tác Zalo chính thức ở VN (nhưng Zalo vào inbox qua Open Channel, không phải ô sẵn). Hợp nếu CS làm nghiêm túc, đa quốc gia, cần tuân thủ. **Giá cao.**

---

## 3. Sinch

**Gốc:** **Thụy Điển**, CPaaS toàn cầu, niêm yết. Uy tín.

**Kênh:** SMS/MMS/RCS/WhatsApp/Viber/**KakaoTalk ✅**/**LINE ✅**/**Messenger ✅**/Instagram/Telegram. Kakao thêm từ 2022, hỗ trợ brand quốc tế (tài liệu + support tiếng Anh). → **Zalo KHÔNG thấy trong danh sách** (điểm yếu lớn nhất với mình).

**Sản phẩm:** 2 nhánh — **Conversation API** (cho dev, phải tự dựng giao diện agent) và **Sinch Engage** (hộp thư sẵn, tiền thân MessengerPeople) + **Sinch Contact Pro** (contact center). **Sinch Engage KHÔNG hỗ trợ Zalo.**

**Giá:** Sinch Engage gói phẳng ~$49–$799/tháng, số ghế cố định, kênh social cộng thêm ~$10/kênh.

**Chốt Sinch:** mạnh Kakao/Line/WhatsApp, nhưng **Zalo là lỗ hổng** — mà Zalo lại là kênh lõi của PalFish VN → **hợp kém nhất trong 3** cho nhu cầu này.

---

## Bảng so nhanh

| | **Sobot** | **Infobip** | **Sinch** |
|---|---|---|---|
| Gốc / độ tin | 🇨🇳 TQ — ⚠️ rủi ro dữ liệu | 🇭🇷 EU — rất tin | 🇸🇪 Thụy Điển — tin |
| Zalo | ✅ có guide (OA) | ⚠️ qua Open Channel (đối tác Zalo VN) | ❌ không thấy |
| KakaoTalk | ✅ có guide | ✅ native inbox | ✅ native |
| Line / WhatsApp / FB | ✅✅✅ | ✅✅✅ | ✅✅✅ |
| Hộp thư agent sẵn | ✅ | ✅ | Engage ✅ / API phải tự dựng |
| Giá (ước) | ~$20-70/agent/th | €39-83/ghế/th (đắt) | $49-799/th gói phẳng |
| Phù hợp | Phủ kênh tốt + rẻ, nhưng verify bảo mật | Nghiêm túc + tuân thủ, ngân sách lớn | Kém nhất (thiếu Zalo) |

## Kết luận & khuyến nghị

1. **Xếp hạng cho đúng nhu cầu (Zalo lõi + Kakao/Line/WhatsApp/FB):**
   - **① Sobot** — phủ kênh tốt nhất (con duy nhất có cả Zalo + Kakao), giá mềm. **Rào:** công ty TQ → phải làm rõ dữ liệu KH lưu ở đâu + chứng chỉ bảo mật trước khi giao chat khách.
   - **② Infobip** — an toàn + chuẩn doanh nghiệp nhất; Kakao/Line/WhatsApp/FB native; Zalo qua Open Channel (đối tác Zalo VN). **Rào:** đắt + Zalo không phải ô sẵn.
   - **③ Sinch** — loại cho nhu cầu này vì thiếu Zalo.

2. **Hai lựa chọn thực tế:**
   - **Ưu tiên phủ kênh + chi phí:** demo **Sobot**, ép làm rõ bảo mật/dữ liệu + chiều sâu Zalo OA & Kakao.
   - **Ưu tiên an toàn dữ liệu + bền:** **Infobip**, chấp nhận giá cao + xác nhận Zalo vào inbox qua Open Channel.

3. **3 câu vẫn cần chị Huyền trả lời** (quyết định có cần đủ 5 kênh không):
   - CS phục vụ KH **nước nào** → Kakao (Hàn) / Line (Nhật-Thái) có thật sự bắt buộc?
   - Các kênh đó là **tài khoản chính thức công ty** hay nick cá nhân? (CS gần như chắc = chính thức → hợp mô hình cả 3 tool.)
   - Công ty có **pháp nhân / đối tác ở Hàn** cho Kakao không? (Nếu không → Kakao có thể bất khả thi ở MỌI tool, phải để riêng.)

*Nguồn: trang chính thức Sobot (omnichannel + help center Zalo/Kakao guide), Infobip (docs Conversations digital-channels + Zalo Business Solutions), Sinch (Omnichannel Connector + Engage pricing) — tự kiểm lại khi làm việc chính thức với nhà cung cấp.*
