# Nghiên cứu: Tool gom tin nhắn Zalo của sale về một chỗ để theo dõi chất lượng chăm sóc

**Ngày:** 09/10/2026 · **Người làm:** Minh · **Yêu cầu từ:** anh Hiếu

## 1. Bài toán anh Hiếu đặt ra

- Kết nối nhiều tài khoản Zalo của sale (hơn 50 người) vào **một chỗ** để đọc được tin nhắn giữa sale và khách.
- Mục đích: theo dõi cách sale chăm khách → **đánh giá chất lượng chăm sóc** → tối ưu chỉ số vận hành.
- Pancake không hợp vì (1) nó mạnh về quản lý **fanpage** hơn là chat cá nhân sale–khách, (2) số thành viên add vào có hạn, không gánh nổi 50+ sale.
- Anh Hiếu nhớ mang máng một tool quảng cáo: sale **gắn thẻ (tag)** một đoạn chat bất kỳ (ví dụ "công việc") thì đoạn đó **tự nhảy vào kho dữ liệu chung**, giống hệ thống tag của Pancake — nhưng quên tên.

## 2. Sự thật cốt lõi phải nắm trước khi chọn tool

**Zalo cá nhân KHÔNG có API chính thức.** Zalo chỉ mở API cho **Zalo OA (Official Account)** — tài khoản doanh nghiệp. Hệ quả:

- Mọi tool quảng cáo "gom nhiều Zalo **cá nhân** vào một màn hình" đều hoạt động bằng cách **không chính thống** (đăng nhập tự động qua QR, hoặc giả lập trình duyệt/điện thoại). Zalo **không hỗ trợ và không khuyến khích** phần mềm bên thứ ba loại này.
- Rủi ro thật: **khóa nick vĩnh viễn**. Với 50+ nick sale, mất nick = mất toàn bộ lịch sử khách của người đó. Đây là rủi ro lớn nhất của cả hướng này.

→ Vì vậy bài toán tách làm **2 hướng chiến lược**, phải chọn trước khi bàn tool:

| | **Hướng A — Giữ Zalo cá nhân** | **Hướng B — Chuyển sang Zalo OA** |
|---|---|---|
| Giống cách sale đang làm | ✅ Y hệt (khách chat nick riêng của sale) | ❌ Khách chat với OA của công ty, không phải nick sale |
| Tính chính thống | ❌ Bên thứ ba, không chính thống | ✅ Chính thống, có API, có webhook real-time |
| Rủi ro khóa nick | 🔴 Cao | 🟢 Không |
| Giám sát/chia hội thoại/báo cáo | Có (tùy tool) | Có sẵn, mạnh hơn |
| Chi phí | Theo số nick | Gói OA trả phí + phí nền tảng CRM |
| Bền vững lâu dài | Thấp | Cao |

## 3. Các tool cụ thể theo từng hướng

### Hướng A — Gom Zalo cá nhân (các tool VN)

Đây là nhóm **sát nhất** với mô tả của anh Hiếu (giữ nguyên cách sale đang chat):

- **Salework Zalo** — rõ ràng nhất về giám sát: một tài khoản quản trị liên kết nhiều nick sale, phân quyền, **nghe lại log cuộc gọi Zalo + giám sát tin nhắn để đánh giá chất lượng tư vấn**. Bài so sánh nói quản lý được hàng trăm tài khoản nhân viên. Gói cơ bản niêm yết ~6,96 triệu/năm (10 tài khoản, kèm 2 Zalo cá nhân) → cần hỏi giá cho 50+ nick.
- **Vpage (nhanh.vn)** — gom nhiều nick, **tự lưu toàn bộ hội thoại**, xem được cả tin đã xóa/thu hồi. Báo cáo "Chia hội thoại": số hội thoại được chia, đã xử lý, tỷ lệ chốt đơn, thời gian hoạt động từng nhân viên. Tính năng **gắn nhãn hội thoại chưa xác nhận** — phải hỏi trực tiếp.
- **Zalo HUB (VNPT)** — gom cả Zalo cá nhân + OA, phân quyền nhân viên, báo cáo KPI.
- **ZMarketing / WorkGPT ZaloTeam** — phân quyền sale/CSKH, hiển thị hội thoại nhiều nhân viên trên một màn hình, thống kê số tin/tỷ lệ phản hồi/thời gian xử lý theo từng người.

**Khi gặp nhà cung cấp ở hướng này, bắt buộc hỏi 4 câu:**
1. Cơ chế đăng nhập nick là gì — QR chính thức hay giả lập?
2. Có cơ chế chống checkpoint/chống khóa không?
3. **Có chịu trách nhiệm nếu nick bị khóa không?** (hỏi bằng văn bản)
4. Dữ liệu hội thoại khách lưu ở đâu, có xuất ra được không (API/Excel)?

### Hướng B — Zalo OA + nền tảng CRM đa kênh (chính thống)

Nhóm này gom Zalo OA + Facebook + web + email vào một hộp thư, chia hội thoại cho sale, có báo cáo giám sát rõ:

- **Caresoft** — mạnh nhất về chia & giám sát hội thoại: chia theo luật xoay vòng/kỹ năng, chuyển hội thoại giữa các sale, báo cáo miss-chat/thời gian xử lý (AHT), có cả gọi Zalo. Đồng bộ 7 ngày tin gần nhất khi tích hợp. Có bản Zalo cá nhân cho DN nhỏ (vẫn dính rủi ro khóa nick).
- **Subiz** — gom Zalo OA + Zalo cá nhân + FB + web + email + tổng đài vào một màn hình. Gói ~3,99–7,83 triệu/năm, không giới hạn agent. **Lưu ý: từ 01/06/2026 phải mua thêm gói OA Tăng trưởng/Toàn diện mới tích hợp được.**
- **StringeeX** — mạnh về tổng đài (ghi âm, giám sát viên nghe/chen ngang cuộc gọi), đổ thông báo chat Zalo OA về phần mềm, có API mở nối CRM/ERP.
- **CloudGO / NextX CRM** — hợp nhất hội thoại nhiều OA về CRM, lưu lịch sử theo từng hồ sơ khách, giám sát nhân viên.

**Giám sát chất lượng trên Zalo OA:** API OA cho phép **đọc lại lịch sử + lấy danh sách/chi tiết hội thoại**, nhận tin real-time qua **webhook**. Giao diện OA Manager (gói Tiêu chuẩn trở lên) có: **chỉ định nhân viên phụ trách từng khách, lọc hội thoại theo nhân viên, báo cáo thống kê chat + lịch sử thao tác nhân viên**. Chưa có sẵn chấm điểm chất lượng agent — phần đó **phải tự xây**.

### Tool quốc tế (respond.io, Sleekflow...)

- **respond.io: xác nhận KHÔNG hỗ trợ Zalo** (chỉ WhatsApp, Messenger, Telegram, Viber, LINE, WeChat, SMS, email). Sleekflow chưa xác minh được.
- → Các nền tảng omnichannel quốc tế **không phải lối tắt** cho Zalo. Tuyến "chính thống" thực tế ở VN là **Zalo OA + CRM nội địa**.

## 4. Tool "gắn tag → kho chung" anh Hiếu thấy quảng cáo — ứng viên hàng đầu

**Ứng viên số 1: Biglead (Social AI CRM, biglead.live / biglead.vn).** Khớp gần như hoàn hảo mô tả anh Hiếu:
- Gom **Zalo cá nhân + Zalo OA + Facebook Messenger + Instagram** vào **một hộp thư** — tự quảng cáo là "một trong số ít phần mềm kết nối được Zalo cá nhân".
- **Gắn tag hội thoại** theo nguồn vào / nhu cầu / hành vi / tình trạng chăm sóc; có "thẻ sale" và "thẻ chat"; quảng cáo "tự động gom tương tác và phân loại". → Đây chính là cơ chế "tag → kho chung giống Pancake".
- **Báo cáo chất lượng theo nhân viên**: số cuộc trò chuyện, thời gian phản hồi TB, số liệu theo tag/nhân viên/trạng thái.
- Giá niêm yết blog: ~99k / 299k / 699k / 1.099k đồng/tháng (gói Cá nhân/Basic/Pro/Business), theo số page + nền tảng + số người dùng → rẻ hơn hẳn nhóm còn lại, nhưng phải hỏi giá thật cho 50+ sale.
- ⚠️ Vẫn là Zalo cá nhân qua bên thứ ba → **giữ nguyên rủi ro khóa nick** (mục 2). Chưa rõ tag là tự động bằng AI đọc nội dung hay gắn tay — phải xem demo. Chưa rõ xuất dữ liệu ra BQ được không.

**Ứng viên khác cùng kiểu:** Digi Omnichannel (nhiều Zalo OA + CRM + đánh giá chăm sóc); và **chính Pancake** — tài liệu chính thức docs.pancake.biz có mục "Zalo Cá nhân - Zalo Business" + hệ thống "Thẻ hội thoại" + Botcake tự gắn tag + Pancake Extension V2 đồng bộ Zalo gần real-time. (Có nguồn bên thứ ba nói Pancake cá nhân không kết nối trực tiếp — mâu thuẫn, phải hỏi Pancake support.)

**Việc cần làm để chốt đúng con anh Hiếu thấy:** xem demo Biglead trước (sát nhất); đồng thời anh Hiếu cho thêm manh mối (quảng cáo chạy nền tảng nào, tiếng Việt/Anh, logo/từ khóa) để loại trừ.

## 5. Nhận định & khuyến nghị (phần quan trọng nhất)

**Reframe bài toán:** mục tiêu cuối không phải là "một cái hộp thư đẹp", mà là **có được nguồn dữ liệu chat sale–khách một cách hợp pháp và ổn định, để đưa vào kho dữ liệu (BigQuery) và chạy chấm điểm chất lượng** — y hệt cách ta đang làm với **ghi âm cuộc gọi → ASR → ai_scores** ở Việc 4-5. Ta **đã có sẵn pipeline đánh giá chất lượng**; cái thiếu chỉ là **nguồn chat**.

→ Vì vậy tiêu chí chọn tool nên ưu tiên theo thứ tự:
1. **Xuất được dữ liệu ra ngoài** (API/webhook/Excel) để nối vào BQ — quan trọng hơn giao diện.
2. **An toàn nick / tính chính thống** — tránh rủi ro mất dữ liệu 50 sale.
3. Chia hội thoại + báo cáo theo nhân viên.
4. Chi phí theo quy mô 50+.

**Khuyến nghị cụ thể:**
- **Nếu ưu tiên bền vững & chất lượng dữ liệu:** đi **Hướng B (Zalo OA)** — lấy chat qua API/webhook đổ thẳng về BQ, chạy ai_scores sẵn có. Nhưng phải chấp nhận thay đổi: khách chat với OA, không phải nick sale. Đây là thay đổi vận hành lớn, cần anh Hiếu quyết.
- **Nếu bắt buộc giữ nick cá nhân sale:** chọn **1 tool Hướng A có cam kết an toàn nick + xuất dữ liệu được** (ưu tiên hỏi kỹ Salework và Vpage), **chạy thử trên 2–3 nick trước** 1–2 tuần: kiểm tra đồng bộ tin có đúng không, xuất dữ liệu được không, nick có bị cảnh báo không — rồi mới mở rộng.

**Lưu ý pháp lý/nhân sự (nhắc 1 lần):** chat chứa dữ liệu cá nhân khách + giám sát nhân viên → cần thông báo rõ cho sale là tài khoản công việc bị giám sát, quy định phạm vi, và kiểm tra nghĩa vụ bảo vệ dữ liệu cá nhân hiện hành.

## 6. Câu hỏi chốt lại cho anh Hiếu

1. **Giữ nick Zalo cá nhân của sale, hay sẵn sàng chuyển khách sang chat OA công ty?** (Quyết định này chọn Hướng A hay B, mọi thứ khác phụ thuộc vào đây.)
2. Thêm manh mối về tool quảng cáo (mục 4) để em tìm đúng con đó.
3. Ngân sách tạm tính cho 50+ sale?

---
*Nguồn tham khảo (tự kiểm chứng trước khi mua — phần lớn là trang của chính nhà cung cấp):*
*Salework, Vpage/nhanh.vn, Zalo HUB (minhvnpt), WorkGPT; Subiz, Caresoft (doc.caresoft.vn), StringeeX, CloudGO, NextX; respond.io (FAQ/help center); Zalo for Developers (API OA + webhook), oa.zalo.me (quản lý hội thoại).*
