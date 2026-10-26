# Tổng hợp nghiên cứu công cụ gom tin nhắn chat cho Sale + CS

**Ngày:** 14/10/2026 · **Người làm:** Minh · **Cho:** anh Hiếu + chị Huyền (Kate)

## 1. Nhu cầu đã chốt

Mở rộng cho cả **Sale** lẫn **CS**, cần **2 nền tảng chạy song song**:
- **Nền tảng 1 — Zalo cá nhân là chính** (gom nick Zalo cá nhân của sale/CS để đọc + giám sát). Tích hợp **Messenger cá nhân** nếu được (không có cũng không sao).
- **Nền tảng 2 — kênh quốc tế:** KakaoTalk, WhatsApp, Viber, LINE...
- Nếu có **1 nền tảng ôm hết** thì càng tốt.

## 2. Sự thật kiến trúc — vì sao PHẢI tách 2 nền tảng (và vì sao "1 con ôm hết" bất khả thi)

- **Zalo cá nhân KHÔNG có API chính thức.** Mọi tool gom nick Zalo cá nhân (Salework, ZaloHub, Vpage, WorkGPT, **và cả Pancake ở chế độ Zalo Cá nhân**) đều chạy bằng cách **quét QR chiếm phiên Zalo Web** — không chính thống → **rủi ro khóa nick + hay rớt kết nối**. Đây là bản chất chung, không tool nào thoát.
- **Kakao/WhatsApp/Viber/Line** bắt buộc dùng **tài khoản doanh nghiệp chính thức** (Business API / Official Account) — sạch, chính thống, nhưng khách nhắn vào tài khoản công ty, không phải nick cá nhân.
- **Messenger cá nhân:** gần như **không tool nào gom được tin cậy** (Meta cấm gắt bên thứ ba đọc tin profile cá nhân). Pancake chỉ làm Fanpage. Nhóm "cỏ" (Vpage/Salework) có claim gom FB cá nhân qua extension nhưng rủi ro khóa rất cao → coi như **bỏ qua, đừng kỳ vọng**.
- **→ Kết luận: "1 nền tảng ôm hết" là BẤT KHẢ THI** nếu bắt buộc Zalo **cá nhân**. Lý do: con nào có Kakao (Sobot/Infobip) thì chỉ làm Zalo **OA**, không làm Zalo cá nhân; con làm Zalo cá nhân thì không có Kakao. **Tách 2 nền tảng là đúng.**

## 3. Nền tảng 1 — nhóm Zalo cá nhân (so sánh toàn bộ)

| Tool | Gom Zalo cá nhân | Tin nhắn CŨ | Export dữ liệu | Kênh khác kèm | Giá | Ghi chú |
|---|:--:|:--:|---|---|---|---|
| **Pancake** ⭐ | ✅ (QR) | ✅ **kéo được** | ✅ **API/Webhook/MCP** + Excel | FB Fanpage, WhatsApp, LineOA, IG, TikTok, sàn TMĐT | Theo **số Trang + Nhân viên** (cần báo giá) | **Tốt nhất nhóm** — xem mục 4 |
| **WorkGPT** (Innocom) | ✅ (QR) | — | Excel, tính theo lần | — (chỉ Zalo) | **45–50tr/năm** (per-portal) hoặc ~26,5tr nếu dùng SIM công ty | Báo cáo theo nhân viên tốt; đắt vì mỗi NV 1 portal (phí 19,2tr); ép "ký mai" |
| **Salework** | ✅ | — | — | FB, sàn TMĐT (Shopee/Tiki/Lazada/TikTok) | ~4–33,6tr/năm theo số tài khoản | Có nghe lại log gọi + giám sát tin nhắn; mỗi gói kèm 1 OA + 2 Zalo cá nhân |
| **ZaloHub** (VNPT) | ✅ | — | — | Zalo OA | **~3tr/năm** (rẻ nhất) | ⚠️ "30 profile" = 30 nick, chưa đủ 60+; hỏi gói mở rộng |
| **Vpage** (Nhanh) | ✅ | ❌ **không có tin cũ** | ❌ chỉ nút tải tay | FB, Zalo OA, sàn | ~từ 100k/tháng/page | Tự lưu hội thoại + báo cáo theo NV; **thua ở không có lịch sử + không API** |
| ZMarketing | ✅ | — | — | — | **đắt** → LOẠI | Nặng marketing/spam |
| Zalo360 | ✅ | — | — | — | **~95tr/năm** → LOẠI | Quá đắt |

**Điểm chung rủi ro cả nhóm:** chiếm phiên Zalo Web → đừng mở chat.zalo.me song song; nick có thể bị khóa; kéo dữ liệu đôi lúc chập chờn phải reconnect.

## 4. ĐÀO SÂU PANCAKE — đáp ứng tới đâu

**Kết nối Zalo cá nhân: ✅ CÓ** (xác nhận từ docs chính thức). Cách: Bảng điều khiển → Kết nối → Zalo → tab "Zalo Cá nhân" → quét QR bằng app Zalo trên điện thoại. (Vài blog cũ nói "Pancake không nối Zalo cá nhân" là **lỗi thời** — tính năng này mới ~2025.)

**Hơn hẳn Vpage/WorkGPT ở 2 chỗ quan trọng:**
1. **Kéo được tin nhắn CŨ** — có mục "Đồng bộ tin nhắn cũ từ điện thoại lên Pancake" (Cài đặt → Công cụ → Đồng bộ ngay). Vpage **không** làm được việc này.
2. **Có API/Webhook/Pancake MCP thật** (mục "For Developer" trong docs) → **đổ chat về BigQuery chạy chấm điểm `ai_scores` được** (giống pipeline ghi âm→ASR). WorkGPT chỉ xuất Excel thủ công.

**Có sẵn hệ thống giám sát anh Hiếu cần:** Thẻ hội thoại (tag) + Lọc thẻ; Chế độ xoay vòng (chia hội thoại cho NV); Thống kê **theo Nhân viên** (số hội thoại/tin/tương tác); Phân quyền; Trợ lý AI; Tổng đài/cuộc gọi.

**Kèm thêm nhiều kênh:** FB **Fanpage**, Instagram, TikTok, **WhatsApp**, **LineOA**, Telegram, Threads, Youtube, Website chat, Google, sàn TMĐT, Email (Beta).

**Hạn chế:**
- **Messenger cá nhân: ❌ KHÔNG** — Pancake chỉ làm FB **Fanpage** (login FB cá nhân chỉ để xác thực). Nếu CS/sale chăm khách qua nick FB cá nhân → Pancake không gom. Qua Fanpage → OK.
- **KakaoTalk, Viber: ❌ KHÔNG** → cần nền tảng 2.
- Cùng rủi ro khóa nick Zalo như cả nhóm.
- **Giá:** tính theo **số Trang (mỗi nick/ kênh = 1 Trang) + số Nhân viên + thời hạn**. Chưa có giá chính thức cho 60–80 nick — **cần lấy báo giá Pancake** (các gói nhỏ ~0,55–4,2tr; quy mô 60–80 nick phải hỏi sales).

**→ Verdict Pancake:** **lựa chọn số 1 cho Nền tảng 1.** Làm được mọi thứ nhóm Zalo-cá-nhân làm, **cộng**: kéo tin cũ + API thật (phục vụ chấm điểm) + gánh luôn FB Fanpage/WhatsApp/Line. Thiếu đúng Messenger cá nhân (vốn gần như bất khả thi) + Kakao/Viber (để nền tảng 2 lo).

**✅ Đã TEST THỰC TẾ (14/10, tài khoản Minh):**
- **Zalo cá nhân nối THÀNH CÔNG** — Bảng điều khiển hiện tab Zalo (1): "Phạm Anh Minh – 0353748121" bên cạnh 4 Fanpage FB. → khẳng định Pancake gom được nick Zalo cá nhân.
- **Mô hình giá xác nhận = Số Trang + Số Nhân viên** (mỗi FB page / mỗi nick Zalo = 1 "trang"). Test đang nối 5 trang (4 FB + 1 Zalo).
- **Bẫy UX:** vào Hội thoại khi **chưa tạo gói cước** → lỗi "Có lỗi xảy ra 121 – không tìm thấy gói cước". Phải tạo 1 gói (Dùng thử miễn phí hoặc trả phí) ở pancake.vn/account → Gói cước → Tạo mới, rồi Hội thoại mới chạy. **Không phải Pancake không nối được Zalo cá nhân.**

**💰 GIÁ THẬT (lấy trực tiếp từ Gói tùy chỉnh, 14/10):**
- **Quy tắc quan trọng:** **Số nhân viên BẮT BUỘC ≥ Số trang.** Chọn 60 trang thì tối thiểu 60 nhân viên (chỉ chọn lên). Nghĩa là **mỗi nick Zalo (1 trang) kèm 1 ghế vận hành** → chi phí gắn chặt với số nick, không "mua ít ghế cho rẻ" được. (60 sale × 1 nick + 1 tài khoản = 60 trang + 60 NV; thêm quản lý thì chọn lên.)
- **Bảng giá (gói sẵn tối đa chỉ 6 trang/10 NV → quy mô mình phải dùng Gói tùy chỉnh):**

| Cấu hình | 6 tháng | **12 tháng (/năm)** |
|---|--:|--:|
| **60 trang + 60 NV** | 12,07tr | **23,19tr** |
| **100 trang + 100 NV** | 19,77tr | **37,94tr** |

(12 tháng giảm ~12%. Giá hiển thị là số cần thanh toán.)

**⭐ SO SÁNH DỨT ĐIỂM Pancake vs WorkGPT (quy mô 60 nick):**
| | Pancake (60+60) | WorkGPT (60 Zalo) |
|---|--:|--:|
| Năm 1 | **23,19tr** | 45,26tr |
| Gia hạn | ~23,19tr | ~25tr |
| Kèm | 60 ghế người dùng + FB/WA/Line + API/MCP + kéo tin cũ + tag + thống kê NV | chỉ Zalo + export Excel tính lần |

→ **Pancake ≈ 1/2 giá WorkGPT năm đầu, gia hạn vẫn rẻ hơn, cho nhiều hơn hẳn. CHỐT Pancake cho Nền tảng 1, loại WorkGPT.**

## 5. Nền tảng 2 — kênh quốc tế: ĐÍNH CHÍNH LỚN theo thực tế công ty (14/10)

**⚠️ Thông tin mới từ chị Huyền (quyết định lại toàn bộ nền tảng 2):** WhatsApp/Viber/Line/Kakao bên mình là **nhân viên dùng TÀI KHOẢN CÁ NHÂN (trên SIM công ty)** — KHÔNG phải tài khoản doanh nghiệp/official.

→ **Hệ quả: Infobip / Sobot / respond.io / Sinch LOẠI (ở hiện trạng).** Mấy nền tảng này chỉ nối **tài khoản chính thức** (WhatsApp Business API, LINE Official Account, Kakao Business Channel, Viber Business) — **không gom được nick cá nhân**. Nhận định "nền tảng 2 = Infobip/Sobot" ở bản trước là SAI vì lúc đó tưởng là tài khoản công ty.

**Thực tế gom nick CÁ NHÂN từng kênh (tra lại 14/10):**
| Kênh (cá nhân) | Gom tập trung được không? | Ghi chú |
|---|---|---|
| **WhatsApp** | 🟡 Có, qua tool "cỏ" quét QR (TimelinesAI, ControlHippo, DragApp) | Nối nick cá nhân bằng QR "Linked Devices", hộp thư chung + chia hội thoại. **Vi phạm ToS WhatsApp, rủi ro khóa.** |
| **Viber** | 🔴 Gần như KHÔNG | Không có tool gom nhiều nick Viber cá nhân; QR Viber chỉ cho tài khoản Business/thêm bạn |
| **LINE** | 🔴 KHÔNG tìm thấy | Không có tool gom nick LINE cá nhân nhiều người |
| **KakaoTalk** | 🔴 KHÔNG | Kakao **cấm gắt nhất**: không API đọc hộp thư cá nhân, tin Plus Friend "không rút ra khỏi Kakao được", PC chỉ đăng nhập 1 máy/lúc, tự khóa khi thấy bất thường |

**⚠️ Cảnh báo "bẫy":** Rambox / Ferdium / MultiMessenger / All-in-One Messenger **KHÔNG giải quyết bài toán giám sát.** Chúng chỉ nhét nhiều phiên web vào các tab trên **MÁY của 1 người** (tiện cho 1 nhân viên ôm nhiều nick) — **không phải hộp thư tập trung cho quản lý xem chat của 50 nhân viên**, không lịch sử/không phân quyền/không export. Đừng nhầm.

**→ Sự thật phũ: với nick CÁ NHÂN, không có tool nào gom được trọn WhatsApp + Viber + Line + Kakao để giám sát tập trung.** WhatsApp thì gượng ép được (rủi ro); Viber/Line/Kakao gần như bất khả thi — nhất là Kakao.

### Phạm vi CS (xác nhận 14/10)

CS **phục vụ TẤT CẢ khách của công ty** — khách VN ở VN lẫn khách ở nước ngoài. → Kakao/Line/Viber/WhatsApp **đều thực sự cần** (khách đa quốc gia), không kênh nào bỏ được về nguyên tắc. Điều này càng làm Đường B (chuyển sang tài khoản doanh nghiệp) đáng cân nhắc, vì chỉ đường đó mới gom + giám sát được đủ các kênh quốc tế (nhất là Kakao).

### Hai đường đi cho nền tảng 2 — ⏳ CHƯA CHỌN (ghi lại cả hai)

**Đường A — Giữ nick cá nhân:** chấp nhận chỉ gom được WhatsApp (tool cỏ QR, rủi ro khóa); Viber/Line/Kakao **không giám sát tập trung được** → CS vẫn xử lý tay trên máy/điện thoại, giám sát chỉ kiểu kiểm tra điểm. Rẻ nhưng chắp vá + rủi ro + không bền.

**Đường B — Chuyển số SIM-công-ty sang TÀI KHOẢN DOANH NGHIỆP (khuyến nghị):** vì **công ty đang SỞ HỮU các số SIM** → đăng ký lại các số đó thành WhatsApp Business API / LINE Official Account / Viber Business / Kakao Business Channel. Khi đó **Infobip / respond.io / Sobot gom + giám sát + export sạch, không rủi ro khóa, bền lâu**. Đánh đổi: khách thấy là tài khoản doanh nghiệp (không phải nick cá nhân); Kakao vẫn cần pháp nhân/đối tác Hàn. **Đây là đường đúng về lâu dài, và khả thi vì mình nắm số.**

## 6. Khuyến nghị chốt (cập nhật 14/10)

- **Nền tảng 1 (Zalo cá nhân) = Pancake.** Giữ nguyên — lấy báo giá 60–80 nick + nhân viên, so với WorkGPT.
- **Nền tảng 2 (kênh quốc tế):**
  - **Khuyên đi Đường B:** chuyển số SIM-công-ty → tài khoản doanh nghiệp, rồi dùng **respond.io** (có WhatsApp/Line/Viber, rẻ, API mạnh — nếu **không cần Kakao**) hoặc **Infobip/Sobot** (nếu **cần Kakao**).
  - Nếu buộc giữ nick cá nhân (Đường A): chỉ gom được WhatsApp (tool cỏ, rủi ro); Viber/Line/Kakao để tay.
- **Bỏ:** WorkGPT (đắt per-portal), ZMarketing/Zalo360 (quá đắt), Sinch (không Zalo).

## 7. 3 câu còn cần chốt (quyết định cuối)

1. CS phục vụ KH **nước nào** → Kakao/Line/Viber có thật sự bắt buộc đủ, hay chỉ 1-2 kênh (vd chỉ WhatsApp là chính)?
2. Công ty có sẵn sàng **chuyển số SIM sang tài khoản doanh nghiệp** (Đường B) không? (Quyết định A hay B.)
3. Có **pháp nhân/đối tác ở Hàn** cho Kakao không? (Không → Kakao phải để riêng/bỏ dù đường nào.)

## 8. Bước tiếp đề xuất
- Lấy **báo giá Pancake** (60–80 nick + nhân viên) → so 1-1 với WorkGPT.
- Làm rõ với chị Huyền: khối lượng từng kênh quốc tế (kênh nào chính, kênh nào phụ) + có chịu chuyển sang tài khoản doanh nghiệp không.
- Nếu đi Đường B: lấy báo giá **respond.io** (không Kakao) hoặc **Infobip/Sobot** (có Kakao) theo số agent thật.
- Trả lời Kim Tuyến (WorkGPT): giữ cửa, không bị ép "ký mai".

*Nguồn: docs chính thức Pancake (Zalo cá nhân + Gói cước + For Developer), 2 báo giá WorkGPT/Innocom (60 & 100 user), respond.io/llms.txt, docs Infobip/Sobot/Sinch, trang Salework/ZaloHub/Vpage. Phần lớn là trang nhà cung cấp — kiểm lại khi làm việc chính thức.*
