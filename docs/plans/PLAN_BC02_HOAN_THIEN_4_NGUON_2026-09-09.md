# PLAN — Hoàn thiện BC02 Key Data: tích hợp 4 nguồn dữ liệu (v2)

**Ngày**: 2026-09-09 · **Thay thế**: `PLAN_BC02_HOAN_THIEN_4_NGUON_2026-08-12.md` (v1, đánh dấu SUPERSEDED — v1 viết khi CHƯA có tài liệu thật của chị Thu Hiền, nhiều giả định sai)
**Nguồn**: Lark doc *"Danh sách các nguồn thông tin để hoàn thiện báo cáo Key Data"* (chị Thu Hiền, tải về `Danh sách các nguồn thông tin để hoàn thiện báo cáo Key Data/` cạnh repo) + đọc trực tiếp `backend/revenue_routes.py` (`_build_key_data_pivot`, `BC02_GMV_GROUPS`)
**Người giao việc**: anh Minh (leader) · **Lý do ưu tiên**: 1 trong các chốt chặn cuối để hoàn thiện dự án GMV
**Status**: PLAN — cần anh Minh duyệt hướng + xác nhận vài điểm mở trước khi code (xem mục VI)

---

## 0. Vì sao có bản v2 — khác v1 ở đâu

v1 (12/8) được viết **trước khi có tài liệu thật**, dựa trên phỏng đoán: "chắc Metabase Q12749 cover được cả BI Leads lẫn Trial". Giờ đọc tài liệu chị Hiền viết ra 3 hệ thống **hoàn toàn khác nhau**, không phải 1 Metabase:

| # | Nguồn | Hệ thống thật (từ tài liệu) | v1 tưởng là gì |
|---|---|---|---|
| 1 | BI Leads | BI dashboard riêng `sea.pri.ibanyu.com/picture-bi` (giao diện tiếng Trung, nút tải .csv/.xlsx/**.json**) | Metabase Q12749 |
| 2 | Chatpage | 3 Google Sheet log thô (đếm dòng SĐT theo ngày, KHÔNG phải 1 ô tổng có sẵn) | Google Sheets API — đúng hướng, nhưng đơn giản hoá quá mức |
| 3 | Trial | **"PalFish Class CRM" — trang "Thống kê TVTS"**, có nút "Xuất file Excel" riêng | Metabase Q12749 (SAI — đây là hệ thống khác hẳn) |
| 4 | Budget ADS | Google Sheet "Daily Report", có công thức trừ chéo HN = Tổng VN − HCM | Google Sheets API — đúng hướng |

Metabase (Q12749/Q14385) **không xuất hiện trong quy trình thủ công thật** của chị Hiền — nó là phát hiện thêm của anh Minh, chưa xác nhận có trùng dữ liệu với 2 nguồn trên hay không. Vì vậy **M0 giờ phải điều tra ít nhất 2 hệ thống chưa biết** (BI dashboard, PalFish Class CRM), không chỉ Metabase.

**Kết luận quan trọng nhất của bản v2**: đây không phải bài toán "gọi 1 API thay 1 thao tác tay" — có **công thức trừ chéo giữa 2 vùng** (CRM Leads = Tổng − FB HN − FB HCM; Budget HN = Tổng VN − Budget HCM) và **case đếm dòng thủ công** (Chatpage) mà bất kỳ hướng tự động nào cũng phải tái tạo đúng, nếu không số sẽ lệch với báo cáo chị Hiền đang làm tay và không ai tin số mới.

---

## 0-bis. Phát hiện mới khi soát lại — ảnh bìa tài liệu KHÔNG phải trang trí

Ảnh đầu tài liệu (`image 3.png`) từng bị bỏ qua vì tưởng là ảnh bìa/thumbnail. Đọc kỹ lại: đây là **screenshot màn hình BC02 thật đang chạy trên app**, có dòng mô tả kỹ thuật hardcode ngay trong code (đã verify tại `frontend/src/components/reports/BC02KeyDataReport.tsx:81-82`):

> *"BC02 — GMV theo ngày và loại nguồn (tab GMV sheet Hiếu). Team lọc theo cột **TEAM** trên SM Hanoi (cột AH) — khớp COUNTIFS tab GMV, không theo roster sale hiện tại."*

Hai điều rút ra:

1. **⚠️ "sheet Hiếu" ≠ "chị Thu Hiền" — 2 người/2 sheet khác nhau, dễ nhầm vì tên gần giống nhau.** Đã verify: `frontend/src/lib/typeFixx.ts:4` ghi rõ *"sheet Hiếu Trang tính5"* — đây là sheet của **anh Hiếu** (một người khác, cũng là chủ 1 trong 2 tài khoản Metabase `hoanghieuw00617@ipalfish.com` ở Phụ lục — trùng tên "Hiếu"!), dùng cho logic phân loại "loại nguồn" (Type fixx, GMV tab/COUNTIFS) — khác hẳn **"All File Thu Hiền"** (chứa tab SM Hanoi + HCM REV, nguồn của `so_doanh_thu` qua `gsheet_ledger_import.py`) là sheet của **chị Thu Hiền** — người viết tài liệu 4-nguồn đang dùng làm ground truth cho plan này. **Khi trao đổi với anh Minh/chị Hiền/anh Hiếu, luôn nói rõ đang nhắc tới sheet nào** — nhầm 2 sheet này là nhầm 2 người, 2 nguồn dữ liệu khác nhau hoàn toàn.

2. **Xác nhận (không phải lo ngại mới) — cột `team`/`team_pivot_label` trên `so_doanh_thu` là snapshot LỊCH SỬ tại thời điểm import từ cột AH sheet SM Hanoi, KHÔNG re-derive theo roster sale hiện tại** (`backend/gsheet_ledger_import.py:44` + `:359` xác nhận y hệt dòng mô tả trên UI). Điều này ĐÃ được app tự document rõ ràng — không phải phát hiện mới, nhưng **liên quan trực tiếp mục IV**: 8 cột GMV hiện có của BC02 group theo `team` lịch sử này, còn 4 nhóm cột MỚI (`bc02_daily_metrics.region`) sẽ đến từ pull trực tiếp ở nguồn ngoài (BI dashboard tự gắn nhãn team/channel, Trial CRM tự lọc theo team chọn tay, Budget/Chatpage Sheet tách sẵn theo HN/HCM) — **2 trục "team" này KHÔNG cùng nguồn gốc dữ liệu**, dù cùng hiển thị trên 1 bảng. Rủi ro thực tế thấp (vì nguồn mới không tính từ so_doanh_thu nên không bị vấn đề "lịch sử vs hiện tại"), nhưng cần lưu ý khi có ai hỏi "sao dòng GMV theo team A mà cột Lead lại theo vùng B" — câu trả lời là 2 trục đo độc lập, không phải bug.

**Giá trị dùng được**: ảnh này còn là bằng chứng UI thật khớp 100% với `BC02_GMV_GROUPS` đã đọc từ code (đúng 8 cột QUẢNG CÁO/OFFLINE/GIỚI THIỆU/KHO CHUNG/GIA HẠN/KOC/KHÁC/LIVESTREAM) — dùng làm ảnh tham chiếu trực tiếp cho M4 (FE) thay vì phải mường tượng.

---

## I. Bối cảnh nghiệp vụ (tóm tắt từ tài liệu chị Hiền)

- BC02 hiện tại (`_build_key_data_pivot` trong `backend/revenue_routes.py:433`) chỉ có **1 nguồn**: `so_doanh_thu`, pivot theo ngày × 8 nhóm loại nguồn (Quảng cáo/Offline/Giới thiệu/Kho chung/Gia hạn/KOC/Other/Livestream — xem `BC02_GMV_GROUPS` dòng 117), ra số đơn + GMV. Đây là bản mô phỏng lại tab "In-house" của sheet **All File Thu Hiền** (ảnh trong tài liệu khớp 100% với các cột này).
- Thiếu 4 nhóm số liệu chị Hiền đang phải **tổng hợp tay mỗi ngày** từ 4 nguồn khác nhau, deadline **trước 10h ngày N+1** cho báo cáo ngày N.
- **Điểm cần làm rõ với anh Minh trước khi code**: 4 số liệu này (Leads/Chatpage/Trial/Budget) là chỉ số **funnel/marketing theo vùng HN-HCM**, khác hẳn trục "loại nguồn GMV" hiện có của BC02 — cần thêm **1 khối cột mới song song**, không trộn vào 8 cột hiện tại.
- **Vênh granularity team**: app hiện có 6 team canonical (`Inhouse 1`, `Inhouse 2`, `HCM (Online)`, `Linh Dam (Store)`, `Offline`, `An Binh (Store)` — `backend/utils/team_mapper.py`), nhưng báo cáo tay chị Hiền chỉ chia **2 vùng: HN / HCM**. 4 nguồn mới đo theo vùng (HN gộp cả Inhouse 1+2+Linh Đàm+Offline+**An Bình** (5 team — `backend/admin_routes.py:406` ghi rõ "HN Offline Store: các store con (An Bình, Linh Đàm…)"), HCM = HCM Online) — cần map rõ 6→2 khi hiển thị khối cột mới, không áp nhầm số HN cho từng team con.

---

## II. 4 nguồn dữ liệu — ground truth chi tiết từ tài liệu

### Nguồn 1 — BI Leads

- **Hệ thống**: BI dashboard nội bộ, URL `https://sea.pri.ibanyu.com/picture-bi/picinter1v1/picinter-leadsapply?dashboard=1386` (giao diện tiếng Trung "国际化业务数据 / leads分配 / 分渠道leads情况"). Cần VPN.
- **Cột thật** (soi từ ảnh chụp màn hình + file xuất mẫu): `in_crm_time, service_type, source_name, channel_name, channel (mã số kênh), team_name, spend, actual_leads, cpl, D0/D1/D2 拨打人数 (số lượt gọi)...`
- **Bộ lọc**: date range, `业务线` (business line) = `本地化-越南` (localized-Vietnam).
- **Có nút tải trực tiếp .csv / .xlsx / .json** ngay trên UI (khoanh đỏ trong ảnh) — đây là manh mối quan trọng: rất có thể có **share-link hoặc API token** phía sau nút này (nhiều BI tool dạng "拼BI"/FineBI expose 1 endpoint `export` nhận `dashboard_id` + `card_id` + token). **Chưa xác nhận** — nằm trong M0.
- **Công thức chị Hiền dùng** (KHÔNG phải đọc thẳng 1 cột):
  - Sheet HN cột E "Facebook Leads-300265" = `actual_leads` tại dòng có `channel = 300265` (team = 越南河内 / Vietnam Hà Nội).
  - Sheet HN cột B "CRM Leads" = `SUM(actual_leads toàn bộ ngày đó)` − cột E (FB 300265 HN) − cột J sheet HCM (FB leads HCM). **Đây là số trừ chéo — bắt buộc phải tổng hợp đúng theo đúng công thức, không được suy diễn.**
  - Sheet HCM: nhiều kênh riêng biệt, mỗi kênh đổ vào **1 cột khác nhau** (không gộp 1 cột như HN). Ảnh chị Hiền liệt kê 1 phần danh sách kênh HCM: `300461=Offline booth, 300471=Sales develop, 1032=Refer, 1035=Other, 1036=MP kindergarten` — **danh sách này bị cắt trong ảnh, chưa đủ** — cần xin chị Hiền bảng đầy đủ mã kênh↔cột trước khi code mapping.

### Nguồn 2 — Chatpage

- **Hệ thống**: 3 Google Sheet riêng (KHÔNG phải Metabase):
  - Chatpage HN: `1h58XWvtuH8fvX88EFanzyVjTJlIbLVNAOJy90Mw5uv0` (tab "Trực page")
  - Chatpage Linh Đàm: `1rC-rNeGthzK1mwuMCpHNA1BrwPR1TN3t-k8ko3vCk88` (tab "Data tổng")
  - Chatpage HCM: `14kfCV7p3WrBBK2UQDv4akcGnVkYIKVD9T_x5gWhjXxo` (tab "Data từ chatpage")
- **Bản chất dữ liệu**: đây là **log thô** — mỗi dòng là 1 SĐT khách nhắn vào page, có cột ngày + cột TVTS + nhiều cột khác (ảnh cho thấy bảng dài nhiều dòng, không phải bảng tổng hợp sẵn). Chị Hiền **đếm số dòng khớp ngày lọc** (và với Inhouse 1 phải **trừ dòng nào thuộc HCM nếu bị lẫn**) rồi cộng Inhouse 1 + Linh Đàm → điền HN cột O; HCM đếm riêng → cột R.
- ⚠️ Đây KHÔNG phải phép đọc `SUM()` 1 ô — là `COUNT(rows WHERE ngày = X [AND not-HCM])`. Script pull Sheets API phải áp đúng bộ lọc này, không lấy nhầm 1 ô tổng có sẵn (không có ô tổng sẵn theo ngày).

### Nguồn 3 — Trial

- **Hệ thống**: trang riêng **"PalFish Class CRM" → mục "Thống kê TVTS"** (`销售统计` = "Thống kê bán hàng" / tab "销售业绩数据"), **KHÔNG phải Metabase, không phải CRM sync (`crm_routes.py`) mà app đang dùng**. Cần đăng nhập CRM này (không rõ có chung tài khoản Metabase hay khác — cần hỏi).
- **Thao tác**: chọn khoảng ngày (1 ngày), chọn nhóm nghiệp vụ "国际化业务" → chọn team cụ thể (`越南河内团队` = Vietnam Hà Nội, `越南胡志明团队` = Vietnam HCM) — double-click để filter đúng team.
- **UI có nút "导出Excel" / "Xuất file Excel"** — giống BI Leads, có khả năng có network request đứng sau (cần bắt bằng DevTools khi có VPN+login để biết có phải gọi 1 REST endpoint đơn giản hay không).
- **2 số cần lấy** (khoanh đỏ trong ảnh, cột trong bảng "Tình hình học thử"):
  - **"Mời học thử"** (`总邀约数` — tổng số mời) — VD 133.
  - **"L4 đã học thử"** (`总完课数` — tổng số hoàn thành đến buổi L4 thử) — VD 80.
  - Các cột khác trong bảng (Refers, Leads, Sẽ lên lớp, Kho chung, tỉ lệ %...) hiện KHÔNG nằm trong yêu cầu báo cáo Key Data — chỉ lấy đúng 2 số trên, đừng tự ý lấy thêm.

### Nguồn 4 — Budget ADS

- **Hệ thống**: Google Sheet "Daily Report", ID `15hbb2Qr7QolqpJzre-AZ4FkDS9U_cMw66ysA8JfKhr8`, tab `越南总` ("Việt Nam tổng").
- **B1**: tab `越南总` có 1 hàng tổng theo tháng (VD "8月汇总") + các hàng theo ngày, cột "投放成本 Cost of Ads USD" (ảnh: cột AA) = tổng chi phí QC ngày đó cho toàn VN (HN+HCM gộp). Ghi chú thao tác gốc nói "COPY nhấp đúp để lấy đủ số lẻ" — tức đây là **giá trị tính toán** (có công thức/số thập phân dài), không phải số nguyên hiển thị — khi pull qua Sheets API cần lấy **giá trị đã tính** (`valueRenderOption=UNFORMATTED_VALUE`), không lấy text hiển thị đã làm tròn.
- **B2**: cột AF của **sheet HCM riêng** (không phải sheet `越南总`) — sum lũy kế đến **ngày N-1** (KHÔNG phải ngày N) → điền vào cột AQ sheet HCM của báo cáo Key.
- **B3**: `Sheet HN ô AN2 = Sheet 越南总 ô AA2 − Sheet HCM ô AQ2` — **lại là công thức trừ chéo**, giống hệt pattern ở Nguồn 1. HN không đo trực tiếp, luôn là phần dư sau khi trừ HCM khỏi tổng VN.
- ⚠️ **Soát lại lần 2 (xem kỹ ảnh gốc) — phát hiện thêm 1 lớp mơ hồ, KHÔNG tự giải quyết được, làm câu hỏi #1 (mục VI) cấp bách hơn**: trong file mẫu chị Hiền đính kèm, ô **AA2** của tab `越南总` **không phải dòng ngày** — nó là dòng **"8月汇总" (tổng gộp tháng 8) = 26.026**, nằm ở hàng 2 ngay dưới header, TÁCH RIÊNG khỏi khối các dòng theo-từng-ngày (2026/8/11=2.338, 2026/8/10=2.294...) nằm ở các hàng bên dưới. Nếu đúng vậy thì công thức B3 (`AN2 = AA2 − AQ2`) là phép trừ giữa **tổng lũy kế cả tháng** (AA2) và **lũy kế HCM tới ngày N-1** (AQ2, theo đúng B2) → ra kết quả gần giống "lũy kế HN tới N-1", KHÔNG PHẢI số của riêng ngày N. Trong khi đó, hướng dẫn B2 (đoạn "COPY số liệu... **từng ngày**...") lại mô tả 1 bảng khác — copy giá trị **của từng ngày riêng lẻ** (không lũy kế) vào bảng pivot chính. → **Rất có thể đây là 2 cách tính cho 2 vị trí khác nhau trong báo cáo** (1 ô tổng-tháng-để-đối-chiếu vs 1 cột daily-pivot), nhưng chỉ đọc ảnh + text không đủ chắc chắn — **không nên tự suy diễn thêm, cần chị Hiền xác nhận trực tiếp ô nào dùng công thức nào khi ngồi cùng xem file thật**, tránh code sai 1 trong 2 công thức mà không ai phát hiện vì cả 2 đều "chạy được", chỉ ra số sai.

### Phụ lục — Metabase (do anh Minh phát hiện thêm, KHÔNG có trong quy trình tay của chị Hiền)

- `https://metabase.ibanyu.com/question/12749-leads-status-update` — tài liệu mô tả là "Báo cáo trạng thái khách hàng (để lấy trials)".
- `https://metabase.ibanyu.com/question/14385-referral-details-vn` — "Báo cáo khách hàng giới thiệu (để lấy referral)".
- Tài khoản (⚠️ đã đọc thấy plaintext trong tài liệu chị Hiền — **KHÔNG paste lại vào bất kỳ file nào trong repo, không commit**): `hoanghieuw00617@ipalfish.com` hoặc `lethianhtuyetw01384@ipalfish.com`. Lưu ở chỗ quản lý secrets riêng (1Password/Bitwarden của team), script đọc qua biến môi trường lúc chạy.
- VPN: OpenVPN Connect (Windows) / Tunnelblick (macOS), profile `ipalfish(HK)2025.ovpn`. Hướng dẫn cài: link Lark trong tài liệu.
- **Việc cần làm**: xác nhận Q12749/Q14385 có ĐÚNG bằng số trên "Thống kê TVTS" (Trial) và số Refer hay không. Nếu khớp → dùng Metabase API (đã biết REST endpoint `/api/session` + `/api/card/{id}/query/json`, không cần bắt network request) thay vì phải tự động hoá click UI PalFish Class CRM (khó hơn nhiều vì UI đó chưa biết có API hay không).

**Nguyên tắc quan trọng từ research của anh Minh (v1, giữ nguyên):** *"VPN chỉ là lớp mạng, KHÔNG phải barrier logic — script gọi API bình thường sau khi connect VPN."* Đúng và đã kiểm chứng **cho Metabase** (REST API công khai của Metabase, biết chắc endpoint). ⚠️ Nhưng **chưa đúng hiển nhiên cho 2 hệ thống còn lại**: BI dashboard `sea.pri.ibanyu.com` và PalFish Class CRM có VPN rồi vẫn chưa chắc *expose* API dùng được — đó chính là nội dung M0-T3. Đừng suy ra "có VPN = auto được cả 3".

- **Credentials dùng chung**: theo v1, cùng bộ tài khoản dùng cho cả VPN lẫn Metabase → chỉ cần quản lý 1 secret pair (nhưng vẫn nên tách account bot, xem mục Bảo mật).

**Bonus phát hiện khi đối chiếu v1 với `dashboards-and-reports` skill:** v1 liệt kê Metabase question thứ 3 — `14393 remaining-lesson-vn` — và đánh dấu "không liên quan BC02". Đúng là không liên quan BC02, **nhưng** skill `dashboards-and-reports` ghi rõ: `docs/team_hierarchy.json` hiện được tạo bằng cách **export tay** chính question `remaining-lesson-vn` này rồi convert JSON rồi commit, và nút "Sync Metabase now" trong app **không phải pull live** — chỉ đọc lại file JSON đã commit. Suy ra 2 điều:
1. **Team đã có đường truy cập Metabase hoạt động thật** (có người đang export tay định kỳ) → giảm rủi ro cho hướng Metabase API của BC02.
2. Nếu M2-T1 dựng được puller Metabase, **tái dùng ngay để tự động refresh `team_hierarchy.json`** → dẹp luôn một việc tay đang tồn tại. Chi phí thêm ~0.25 ngày, nên gộp vào cùng lúc (không phải scope BC02 nhưng là "combo" rẻ).

---

## III. Đánh giá lại mức độ tự động hoá khả thi (khác v1)

v1 giả định tất cả 4 nguồn đều auto được ngay (Phương án B+). Sau khi đọc kỹ, đánh giá lại theo **độ tin cậy giảm dần**:

| Nguồn | Khả năng tự động | Vì sao |
|---|---|---|
| **Budget ADS** | ✅ Cao — Google Sheets API (Service Account), chỉ cần đọc đúng ô + áp công thức trừ | Không phụ thuộc VPN, không phụ thuộc hệ thống lạ, chỉ cần quyền view Sheet cho Service Account |
| **Chatpage** | ✅ Cao — Google Sheets API, nhưng phải viết logic đếm dòng lọc ngày (không phải đọc 1 ô) | Cần xác nhận cấu trúc cột log thật (ngày ở cột nào, cách phân biệt HCM lẫn trong Inhouse 1) |
| **BI Leads** | 🟡 Trung bình — PHỤ THUỘC M0 tìm được API/share-link đứng sau nút tải; nếu không có, phải Selenium/Playwright login+click+tải file rồi parse — nặng hơn nhiều và giòn (dễ vỡ khi UI đổi) | Cần VPN; hệ thống lạ, tiếng Trung, chưa rõ có auth API riêng hay dùng chung SSO nào |
| **Trial** | 🟡→🔴 Thấp đến trung bình — PHỤ THUỘC (a) Metabase Q12749 có khớp số "Thống kê TVTS" hay không, (b) nếu không khớp thì phải tự động hoá 1 UI hoàn toàn chưa biết ("PalFish Class CRM"), rủi ro cao nhất trong 4 nguồn | Nếu Metabase khớp → dễ (đã có REST API xác nhận). Nếu không khớp → đây là nguồn khó nhất, có thể phải chấp nhận bán tự động |

**Luồng tự động (cập nhật từ sơ đồ v1 — v1 vẽ 1 nhánh Metabase, thực tế có 3 hệ thống + nhánh dự phòng):**

```
                    ┌─ [cần VPN] Metabase API ──── Trial? (nếu M0-T2 khớp) ─┐
                    │            /api/card/{id}/query/json                   │
[cron N+1 sáng] ────┼─ [cần VPN] BI dashboard ──── BI Leads ────────────────┤
                    │            (API? — chờ M0-T3; nếu không có → Playwright/tay)
                    │                                                        ├─→ transform
                    ├─ [không VPN] Google Sheets API ── Chatpage (đếm dòng) ─┤   (áp 2 công thức
                    │                                └─ Budget ADS ──────────┘    trừ chéo HN=Tổng−HCM)
                    │                                                             │
                    └─ [fallback] form nhập tay trong app (source='manual') ──────┤
                                                                                  ▼
                                                          upsert bc02_daily_metrics (report_date, region)
                                                                                  │
                                                          _build_key_data_pivot() ghép thêm khối regionMetrics
                                                                                  ▼
                                                                        BC02 UI hiện cột mới
```

**Khuyến nghị**: làm **Budget ADS + Chatpage trước** (ít rủi ro, có thể ship M1 trong vài ngày, chị Hiền thấy kết quả ngay), song song chạy M0 điều tra BI Leads + Trial. Không nên cam kết "auto 100% cả 4 nguồn" trước khi M0 xong — nếu Trial/BI Leads không có API, phương án thực tế nhất là: vẫn tự động hoá 2 nguồn dễ, còn 2 nguồn khó tạm giữ **form nhập tay trong app** (nhanh, không phá deadline 10h N+1) và tiếp tục điều tra automation sau — tốt hơn là block toàn bộ task chờ có full-auto.

> ⚠️ **ĐIỂM NÀY ĐẢO NGƯỢC 1 QUYẾT ĐỊNH ĐÃ CHỐT CỦA v1 — CẦN ANH MINH DUYỆT LẠI, KHÔNG TỰ Ý LÀM.**
> v1 (12/8) ghi rõ: *"~~Phương án A (form nhập tay)~~ — **BỎ**. Mục tiêu dự án là tự động hóa, để Hiền nhập tay = không giải quyết gốc."*
> v2 đề xuất cho phép **form nhập tay như đường lùi TẠM THỜI cho 1-2 nguồn khó**, vì lý do mới xuất hiện sau khi có tài liệu thật: nguồn Trial nằm ở "PalFish Class CRM" — hệ thống mà lúc viết v1 chưa ai biết là tồn tại, và chưa có bằng chứng nào cho thấy nó có API.
> **Hai lựa chọn để anh Minh chốt:**
> - **(a) Giữ nguyên tinh thần v1** — không nhập tay, chấp nhận BC02 thiếu cột Trial/BI Leads cho tới khi M0 tìm được đường auto (deadline không xác định, phụ thuộc kết quả điều tra).
> - **(b) Theo v2** — nhập tay tạm cho nguồn chưa auto được, có gắn cờ `source='manual'` + badge trên UI, và giữ vé nợ kỹ thuật để auto hoá sau.
> Em nghiêng về (b) vì chị Hiền vẫn đang nhập tay 100% cho cả 4 nguồn — (b) là giảm từ 4 xuống 1-2 nguồn ngay tuần này, còn (a) là giữ nguyên 4 cho tới khi điều tra xong. Nhưng đây là quyết định của anh, không phải của em.

---

## IV. Schema (cập nhật theo granularity vùng HN/HCM, không phải 6-team)

⚠️ **Sửa 1 lỗi thiết kế trong lần soát trước**: bản trước có 1 cột `source` DUY NHẤT cho cả dòng, nhưng 4 nhóm số liệu đến từ **3 hệ thống độc lập** — thực tế rất dễ xảy ra "Budget ADS pull xong (sheets_api), Trial pull lỗi (chưa có data)" trong CÙNG 1 dòng report_date+region. Một cột `source` không diễn tả được trạng thái hỗn hợp đó. Sửa: tách source-tracking theo TỪNG NHÓM số liệu.

```sql
CREATE TABLE bc02_daily_metrics (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  report_date date NOT NULL,
  region text NOT NULL CHECK (region IN ('HN', 'HCM')),  -- vùng theo báo cáo chị Hiền, KHÔNG phải 6 team canonical
                                                            -- (map 6→2 SỐNG Ở backend/utils/team_mapper.py, KHÔNG duplicate
                                                            -- bảng map ở nơi khác — quy ước bắt buộc của file này)

  -- Nguồn 1: BI Leads
  fb_leads integer,
  fb_leads_source text CHECK (fb_leads_source IN ('bi_dashboard_api', 'manual')),
  crm_leads integer,             -- CHỈ áp dụng HN — công thức trừ chéo; NULL cho HCM (không phải 0)
  leads_by_channel jsonb,        -- HCM: breakdown từng kênh {channel_code: actual_leads}

  -- Nguồn 2: Chatpage
  chatpage_sdt integer,
  chatpage_source text CHECK (chatpage_source IN ('sheets_api', 'manual')),

  -- Nguồn 3: Trial
  trial_invited integer,         -- "Mời học thử" (总邀约数)
  trial_l4_completed integer,    -- "L4 đã học thử" (总完课数)
  trial_source text CHECK (trial_source IN ('metabase_api', 'crm_scrape', 'manual')),

  -- Nguồn 4: Budget ADS
  budget_ads_usd numeric(12,2),  -- HN = trừ chéo (Tổng VN − HCM); HCM = đo trực tiếp (sum cột AF đến N-1)
  budget_ads_source text CHECK (budget_ads_source IN ('sheets_api', 'manual')),

  -- Metadata chung
  raw_fetch_meta jsonb,           -- {"fb_leads": {"pulled_at": ..., "url_or_qid": ...}, ...} — vết pull TỪNG nhóm, không gộp 1 field
  last_synced_at timestamptz,     -- lần pull gần nhất (bất kể thành/bại) — dùng cho rolling re-pull ở M3
  created_by text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE (report_date, region)
);

ALTER TABLE bc02_daily_metrics ENABLE ROW LEVEL SECURITY;

-- ⚠️ Sửa 1 câu giải thích SAI về RLS ở lần soát trước — đã verify lại
-- (`backend/main.py:287,668` dùng `SUPABASE_SERVICE_ROLE_KEY`, và skill
-- `database-and-migrations` xác nhận rõ: "SUPABASE_SERVICE_ROLE_KEY — backend
-- only; BYPASSES RLS"). Nghĩa là: BE gọi bảng này bằng service_role key thì
-- RLS/POLICY dưới đây HOÀN TOÀN KHÔNG ảnh hưởng gì tới BE — có policy hay
-- không, BE vẫn đọc/ghi được như thường. Câu cũ ("không có POLICY sẽ chặn cả
-- service role") là sai. Lý do THẬT để vẫn nên có policy: phòng xa trường hợp
-- SAU NÀY ai đó (FE, script khác) dùng anon/authenticated key đụng thẳng vào
-- bảng — không phải yêu cầu để M1-T3 hoạt động (M1-T3 dùng BE/service_role
-- nên chạy được ngay cả khi bỏ policy dưới, chỉ ENABLE cũng đủ). Viết policy
-- cho khớp convention repo (các bảng permissive khác như `exchange_rates`,
-- `notifications` dùng `FOR ALL USING (true)`), không phải vì bắt buộc:
CREATE POLICY bc02_daily_metrics_service_role ON bc02_daily_metrics
  FOR ALL USING (true);

NOTIFY pgrst, 'reload schema';  -- BẮT BUỘC cuối file, thiếu là PostgREST không thấy bảng mới (quy ước toàn repo)
```

**Khác bản trước**: (1) tách `*_source` theo từng nhóm số liệu thay vì 1 cột `source` chung — cho phép trạng thái hỗn hợp (2 nhóm auto, 2 nhóm manual cùng 1 dòng); (2) `region` map 6→2 phải sống trong `team_mapper.py` (theo đúng comment đầu file đó: *"Every backend module MUST import from here. Do NOT duplicate these mappings"*), plan này không được tự vẽ bảng map riêng; (3) thêm `last_synced_at` cho cơ chế pull-lại (M3); (4) viết RLS policy thật, không chỉ `ENABLE` suông; (5) `raw_fetch_meta` đổi thành object lồng theo từng nhóm để debug đúng nhóm nào lệch.

---

## V. Milestones (cập nhật)

### M0 — Điều tra 3 hệ thống (CHẶN CODE — làm trước tất cả)

- **M0-T1**: Bật VPN, login Metabase, chạy script dưới đây (nâng cấp từ script v1: đọc credential qua biến môi trường thay vì hardcode, và in thêm dải ngày + số dòng để biết question có filter sẵn theo ngày hay trả cả lịch sử).

```python
# scripts/probe_metabase_bc02.py — CHỈ ĐỌC, không ghi gì. Chạy sau khi bật VPN.
# Chạy: METABASE_USER=... METABASE_PASS=... python scripts/probe_metabase_bc02.py
import os, json, requests
from collections import Counter

BASE = "https://metabase.ibanyu.com/api"
user, pwd = os.environ["METABASE_USER"], os.environ["METABASE_PASS"]  # KHÔNG hardcode

tok = requests.post(f"{BASE}/session", json={"username": user, "password": pwd}, timeout=30).json()["id"]
H = {"X-Metabase-Session": tok}

for qid, name in [(12749, "leads-status-update"), (14385, "referral-details-vn"), (14393, "remaining-lesson-vn")]:
    r = requests.get(f"{BASE}/card/{qid}/query/json", headers=H, timeout=120)
    print(f"\n===== Q{qid} {name} — HTTP {r.status_code} =====")
    if r.status_code != 200:
        print(r.text[:500]); continue
    rows = r.json()
    print(f"Tổng số dòng: {len(rows)}")
    if not rows:
        continue
    print("CỘT:", list(rows[0].keys()))
    # dải ngày: tìm cột nào trông giống ngày để biết question có sẵn filter ngày không
    for k, v in rows[0].items():
        if any(t in k.lower() for t in ("date", "time", "day", "ngay")):
            vals = [str(r_.get(k)) for r_ in rows if r_.get(k) is not None]
            print(f"  cột ngày '{k}': min={min(vals)} max={max(vals)} (mẫu: {vals[:3]})")
    # phân bố team để biết có tách HN/HCM sẵn không
    for k in rows[0]:
        if "team" in k.lower() or "channel" in k.lower():
            print(f"  phân bố '{k}':", Counter(str(r_.get(k)) for r_ in rows).most_common(10))
    print("3 DÒNG MẪU:")
    for r_ in rows[:3]:
        print("  ", json.dumps(r_, ensure_ascii=False)[:400])
```
- **M0-T2**: So sánh output Q12749 với 2 số "Mời học thử"/"L4 đã học thử" trên "Thống kê TVTS" **cùng 1 ngày cùng 1 team** — khớp thì dùng Metabase cho Trial, không khớp thì đánh dấu Trial = rủi ro cao (mục III).
- **M0-T3**: Mở DevTools (Network tab) khi bấm nút tải .json trên BI dashboard `sea.pri.ibanyu.com` và nút "导出Excel" trên PalFish Class CRM — xem request thật là gọi API JSON hay chỉ generate file phía server không có param công khai. Ghi lại: method, URL, headers auth, body params.
- **M0-T4**: Xin chị Hiền bảng đầy đủ mã kênh↔cột cho sheet HCM (ảnh trong tài liệu hiện bị cắt, chỉ thấy 5 kênh).
- **M0-T5**: Xác nhận cấu trúc cột thật của 3 Google Sheet Chatpage (tên cột ngày, cột đánh dấu HCM-lẫn-trong-Inhouse1) — mở trực tiếp bằng Service Account đọc thử vài dòng.
- **M0-T6**: Chốt hướng cho từng nguồn (auto full / auto 1 phần / tạm nhập tay) dựa trên T1-T5, cập nhật lại mục III + IV nếu có phát sinh.
- **M0-T7 · Timezone — chặn quyết định giờ chạy cron (M3), dễ bị bắt lỗi nếu bỏ qua**:
  - BI dashboard `sea.pri.ibanyu.com` ghi rõ *"每日10点、15点、17点、19点刷新"* (refresh 4 lần/ngày lúc 10h/15h/17h/19h). **Chưa xác nhận đây là giờ Bắc Kinh (UTC+8) hay giờ VN (UTC+7)** — lệch 1 tiếng quyết định pull sau lần refresh nào. Xác nhận bằng cách: pull cùng 1 giờ 2 ngày liên tiếp, so số với báo cáo tay chị Hiền cùng ngày.
  - Cột `in_crm_time` trong file xuất mẫu có dạng số nguyên `20260811` (YYYYMMDD, không phải date/timestamp chuẩn) — parse thủ công `str(v)[:4]-[4:6]-[6:8]`, KHÔNG dùng `pd.to_datetime` mặc định (repo đã có bug y hệt kiểu này ở `docs/learnings/sheets-auto-parses-yyyy-mm-to-date.md`, và bug timezone khác ở `docs/learnings/timestamp-vs-date-funded-date-gateway.md` — đọc cả 2 trước khi viết parser, đúng theo Learning Law của CLAUDE.md).
  - Kết luận T7 quyết định giờ cron ở M3 (phải chạy SAU lần refresh cuối cùng trong ngày N+1 liên quan tới dữ liệu ngày N, không phải cứ 7h sáng là an toàn như v1 giả định).

**Bảng ghi kết quả M0 — điền thẳng vào đây khi chạy xong** (format kế thừa từ v1, mở rộng theo 3 hệ thống):

| Nguồn | Hệ thống | Có API dùng được? | Endpoint/cách gọi thật | Khớp số tay? | Kết luận |
|---|---|---|---|---|---|
| BI Leads | `sea.pri.ibanyu.com` | ⬜ chờ M0-T3 | | ⬜ | |
| Chatpage | Google Sheets ×3 | ✅ (Sheets API) | `spreadsheets.values.get` | ⬜ chờ M0-T5 | |
| Trial | PalFish Class CRM | ⬜ chờ M0-T3 | | ⬜ so với Q12749 (M0-T2) | |
| Trial (đường thay thế) | Metabase Q12749 | ✅ (REST đã biết) | `/api/card/12749/query/json` | ⬜ chờ M0-T2 | |
| Budget ADS | Google Sheets | ✅ (Sheets API) | `spreadsheets.values.get` | ⬜ | |
| *(bonus)* team_hierarchy | Metabase Q14393 | ✅ | `/api/card/14393/query/json` | n/a | tự động hoá luôn nếu tiện |

### M1 — Backend: bảng + 2 puller ít rủi ro trước (Budget ADS, Chatpage)

- **M1-T1 · Migration** — repo này KHÔNG có CLI runner, migration áp **thủ công qua Supabase SQL Editor**, 2 project riêng (sandbox `pxgybyfiwywksesyogti` / prod `jozcvbbypwvzaefteoxn`), sandbox trước rồi mới prod (đã đọc skill `database-and-migrations`, không đoán):
  - File: `backend/migrations/2026-XX-XX-bc02-daily-metrics.sql` (đây là layer "canonical cho prod" theo skill — KHÔNG đặt ở `docs/migrations/` hay `docs/sql/`, 2 chỗ đó là legacy/out-of-sequence và dễ bị quên khi reset sandbox).
  - **Bắt buộc kết thúc file bằng `NOTIFY pgrst, 'reload schema';`** — thiếu dòng này thì PostgREST không thấy bảng mới, endpoint mới sẽ 404/lỗi dù bảng đã tạo thành công.
  - Sau khi thêm file: **cập nhật thủ công danh sách thứ tự migration trong `docs/PROJECT.md` (dòng ~150)** — quy ước bắt buộc của repo, bỏ bước này thì lần sau ai đó reset sandbox sẽ thiếu bảng này mà không biết (đúng bẫy đã từng xảy ra thật với `docs/migrations/2026-06-09-top1-02-installment-fields.sql`, ghi trong Gotchas của skill).
  - Verify sau khi áp: `SELECT to_regclass('public.bc02_daily_metrics');` phải khác NULL, và `SELECT column_name FROM information_schema.columns WHERE table_name='bc02_daily_metrics';` khớp đủ cột.
- **M1-T2 · Google Sheets puller**: 1 module dùng chung Service Account (đã có sẵn credential pattern trong repo cho GSheet ledger import — tái dùng `backend/gsheet_ledger_import.py`'s auth helper thay vì viết mới), 2 hàm: `pull_budget_ads(date)` (áp đúng công thức trừ chéo mục II.4) và `pull_chatpage(date)` (đếm dòng theo 3 sheet). **Ghi kết quả bằng `INSERT ... ON CONFLICT (report_date, region) DO UPDATE`** (đúng UNIQUE constraint ở mục IV) — không phải insert-fail-nếu-trùng, vì M3-T4 (rolling re-pull) sẽ gọi lại cùng ngày nhiều lần và PHẢI đè lên giá trị cũ, không tạo dòng trùng hoặc báo lỗi conflict.
- **M1-T3 · Endpoint GET**: `/revenue/bc02-metrics?from=&to=` cho FE — trả `bc02_daily_metrics` theo range, kèm field nào NULL (chưa auto được) để FE biết hiện trạng thái "chưa có data" khác "auto ra 0". **Bắt buộc theo đúng pattern endpoint BC02 hiện có** (đã đọc `revenue_pivot_key_data` thật trong `backend/revenue_routes.py:1927-1949`): `resolve_actor` → `require_module_access(sb, actor, "bc02")` → `enforce_report_scope(actor, team_filter)` → nếu có `sub_team` thì lọc tiếp bằng `scope_sale_names`. Endpoint mới KHÔNG được bỏ qua bước này dù dữ liệu là "region" chứ không phải "team" — nếu không, 1 sale bị giới hạn xem team mình vẫn đọc được budget/lead toàn công ty qua endpoint mới. Trả lời câu hỏi #3 (mục VI) sẽ quyết định độ chặt của RBAC này (ai được thấy budget).
- **M1-T4 · Merge pivot**: sửa `_build_key_data_pivot()` — thêm khối `regionMetrics` per-date (2 dòng con HN/HCM) alongside `categories` hiện có, KHÔNG trộn vào 8 cột GMV cũ. **Key ngày để join phải khớp CHÍNH XÁC**: 8 cột GMV hiện tại bucket theo `dk = _row_pay_date(r).isoformat()` (dòng 446), và `_row_pay_date()` → `ky_doanh_thu()` → đọc cột **`ngay_tien_ve`** của `so_doanh_thu` (đã verify trực tiếp `backend/revenue_routes.py:321-323`, comment gốc: *"Kỳ doanh thu chuẩn = ngay_tien_ve"*) — **không phải `pay_time`**. `bc02_daily_metrics.report_date` phải join đúng vào key `dk` này (tức phải hiểu `report_date` chị Hiền ghi trong báo cáo tay tương ứng với khái niệm `ngay_tien_ve` của app, không phải ngày quẹt thẻ theo nghĩa đen — 2 khái niệm này được xác nhận là tương đương trong ngữ cảnh Sổ/BC01/BC02 theo `docs/learnings/2026-09-04-b3-tien-ve-funded-not-quet.md`, khác với B3/BC04 dùng `funded_date`/`transaction_date`). Nếu 2 ngày lệch nhau dù 1 ngày, dòng dữ liệu mới sẽ không khớp dòng GMV cũ — bảng hiện trống ở 1 bên dù cả 2 đều "có data".

### M2 — Backend: puller cho nguồn rủi ro cao (theo kết quả M0)

- Nếu Metabase khớp Trial: **M2-T1** viết `pull_metabase(question_id)` dùng session token, cache trong giờ chạy.
- Nếu BI dashboard có API/share-link: **M2-T2** viết `pull_bi_leads(date)` (áp công thức trừ chéo + mapping kênh HCM từ M0-T4).
- Nếu 1 trong 2 nguồn KHÔNG có đường auto: **M2-T3** — thêm form nhập tay trong FE BC02 cho đúng field đó (giữ nguyên schema, `source='manual'`), không chặn toàn bộ task.

### M3 — Automation: cron

- **M3-T1**: Chọn nền chạy — **quyết định phụ thuộc M0-T3** (nếu BI Leads/Trial cần Playwright login UI thật thay vì gọi API thuần, ưu tiên máy có VPN + trình duyệt hơn GitHub Actions headless, vì nhiều BI tool chặn IP lạ/yêu cầu MFA). Bảng ưu/nhược kế thừa v1, bổ sung cột rủi ro mới:

| Hướng | Cách | Ưu | Nhược |
|---|---|---|---|
| GitHub Actions cron | `.ovpn` + credentials → GitHub Secrets; workflow chạy ~7h30 VN hằng ngày | Tự động 100%, không phụ thuộc máy ai bật hay tắt | Phải upload `.ovpn` vào Secret; **repo PUBLIC → log workflow công khai, rò rỉ nếu lỡ `print()` token/response**; IP GitHub runner có thể bị BI/CRM chặn |
| Script local + Task Scheduler | Python trên máy đã có VPN sẵn (máy anh Minh) | Đơn giản nhất, gần như 0 setup, IP nội bộ quen thuộc | Máy phải bật đúng giờ; ai nghỉ/đổi máy là gãy; không có log tập trung |
| *(bổ sung v2)* Render cron job | Chạy cùng hạ tầng backend đang có | Cùng chỗ với BE, log tập trung sẵn | **Không có VPN trên Render** → chỉ dùng được cho nguồn Google Sheets, không dùng được cho BI/Metabase |

→ Gợi ý thực tế: **tách đôi** — nguồn Google Sheets (Budget, Chatpage) chạy trên Render cron (không cần VPN, ổn định); nguồn cần VPN (Metabase/BI/CRM) chạy GitHub Actions hoặc máy local. Đừng ép cả 4 nguồn vào một chỗ chạy.
- **M3-T2**: Secrets cho VPN + Metabase + Google SA + (nếu cần) session cookie BI dashboard/PalFish Class CRM. Lưu ý riêng cho `GOOGLE_SERVICE_ACCOUNT_JSON`: `backend/gsheet_ledger_import.py:478` đọc biến này như **đường dẫn tới file** (`from_service_account_file`), KHÔNG phải nội dung JSON inline. Nếu chạy trên GitHub Actions (không có file sẵn) → step đầu workflow phải `echo "$SECRET" > /tmp/sa.json` rồi trỏ biến môi trường vào đường dẫn đó, không thể gán thẳng secret vào biến và gọi hàm hiện có.
- **M3-T3 · Retry trước deadline**: cron 7h/7h30 chỉ có ý nghĩa nếu có người xử lý khi fail — 3 tiếng đệm tới 10h vô nghĩa nếu không ai trực. Thêm lịch retry tự động: fail ở lần chạy đầu → thử lại 8h, 9h (backoff đơn giản, không cần phức tạp); vẫn fail ở 9h → alert DingTalk **kèm mức độ khẩn** (gần deadline) + nút "chạy lại" thủ công trong FE BC02 (gọi trigger endpoint riêng cho admin).
- **M3-T4 · Rolling re-pull, không chỉ pull 1 lần**: Google Sheet log (Chatpage) và số liệu BI có thể bị sửa/refresh sau khi cron đã chạy (BI refresh 4 lần/ngày — M0-T7). Cron mỗi lần chạy nên **pull lại toàn bộ cửa sổ 7 ngày gần nhất** (không chỉ ngày N-1) và upsert đè, dùng `last_synced_at` để biết lần cập nhật gần nhất — nếu không, số của N-3, N-5 có thể vĩnh viễn sai dù nguồn gốc đã được sửa sau đó.
- **M3-T5**: Alert khi pull fail hoặc số lệch bất thường so với hôm trước (>50% biến động) — DingTalk, tái dùng outbox pattern có sẵn (`docs/learnings` đã có nhiều bài học outbox, xem `backend/dingtalk_outbox_worker.py`).

### M4 — Frontend: mở rộng bảng BC02

- **M4-T1**: Thêm khối cột mới (Leads/Chatpage/Trial/Budget) vào `BC02KeyDataReport.tsx`, tách biệt trực quan khỏi 8 cột GMV hiện có (ví dụ nhóm màu khác, giống cách `_build_key_data_pivot` đã tách `categories` khỏi `grandTotal`).
- **M4-T2**: Badge trạng thái theo field: `auto` (source=metabase_api/bi_dashboard_api/sheets_api) vs `manual` vs `chưa có` (NULL) — để chị Hiền/kế toán biết ngày nào cần bổ sung tay.
- **M4-T3**: Nếu M2-T3 cần form nhập tay — thêm modal nhập nhanh (giống pattern `LedgerFormModal.tsx`).

### M5 — Validate + deploy

- **M5-T1 · Test cụ thể (không phải "test chung chung")**:
  - Công thức trừ chéo BI Leads: `crm_leads = tổng − fb_leads(HN) − fb_leads(HCM)`, kèm case tổng < 2 số trừ (âm) → phải raise/log rõ, không âm thầm ghi số âm.
  - Công thức trừ chéo Budget: `budget_ads_usd(HN) = tổng_VN − budget_ads_usd(HCM)`, cùng case âm.
  - Parse `in_crm_time` dạng `20260811` → đúng `date(2026,8,11)`, kèm case giá trị lạ (thiếu số/None) không crash cả batch.
  - Đếm dòng Chatpage: đúng ngày lọc, đúng loại trừ dòng HCM lẫn trong Inhouse 1 (dùng file mẫu thật nếu chị Hiền cung cấp được 1 ngày đã chốt số).
  - `UNFORMATTED_VALUE` lấy đúng số thập phân đầy đủ, không bị Sheets API trả về text đã format.
  - Idempotent: chạy puller 2 lần liên tiếp cùng dữ liệu nguồn → ra đúng 1 dòng (không tạo dòng trùng, không cộng dồn).
  - NULL ≠ 0: field chưa pull được phải là NULL trong response, không phải 0 — test cả BE serialize lẫn FE render (badge "chưa có" phải khác badge "0").
  - Partial failure: giả lập 2/4 nhóm fail, 2/4 thành công trong cùng 1 dòng — verify từng cột `*_source` đúng theo từng nhóm, không bị 1 cột chung ghi đè.
  - FE: mở rộng `BC02KeyDataReport.test.tsx` hiện có (đã tồn tại trong repo) thay vì viết file test mới tách rời — giữ coverage cũ (8 cột GMV) không hồi quy khi thêm khối cột mới.
- **M5-T2**: `tsc -b` + `npm run build` + backend `pytest` pass (chạy full suite, không chỉ file mới — theo đúng thói quen đã áp dụng cho các task trước trong repo này).
- **M5-T3 · Chạy song song — có tiêu chí nghiệm thu rõ, không mơ hồ "chạy vài ngày rồi xem"**:
  - Chạy tối thiểu 3 ngày liên tiếp, đối chiếu số auto vs số chị Hiền làm tay CÙNG NGÀY, cho từng field riêng (không gộp "đúng hết" chung chung).
  - **Đạt** = field đó khớp 100% cả 3 ngày (đây là số đếm/tiền, không phải ước lượng — sai lệch dù 1 đơn vị cũng phải điều tra lại công thức, không chấp nhận "gần đúng").
  - Field nào đạt → chuyển badge `auto` chính thức, chị Hiền ngừng nhập tay field đó. Field nào KHÔNG đạt sau 3 ngày → giữ `manual`, không tự ý kéo dài thêm ngày chờ "may ra khớp" — quay lại điều tra root cause.
  - Không tắt quy trình tay CẢ 4 field cùng lúc — tắt dần theo từng field đã đạt (tránh lặp bug outbox/dedup từng gặp trong repo khi tắt nguồn cũ quá sớm).
- **M5-T4**: Deploy sandbox → prod.

---

## V-bis. ⚠️ Bảo mật — repo này là PUBLIC (v1 có ghi, v2 suýt bỏ sót)

Đã kiểm chứng 09/9: `curl -s -o /dev/null -w "%{http_code}" https://api.github.com/repos/palfish-t-i-u/palfish-t-i-u-h-th-ng-ver-2` → **200 khi KHÔNG đăng nhập** ⇒ repo công khai. Mọi thứ commit vào đây (kể cả chính file plan này) ai cũng đọc được.

**Hệ quả bắt buộc tuân thủ:**

1. **Không bao giờ commit**: mật khẩu Metabase/CRM (đang nằm plaintext trong Lark doc đã tải về `Danh sách các nguồn thông tin…/` — thư mục này nằm NGOÀI repo, **giữ nguyên như vậy**, đừng copy vào repo), file `.ovpn`, file JSON Service Account, session cookie.
2. **Cân nhắc lại việc để 4 Google Sheet ID trong file plan công khai.** Nếu bất kỳ sheet nào đang share ở chế độ "anyone with the link", thì công khai ID = công khai dữ liệu lead/budget công ty. → Việc cần làm: kiểm tra chế độ share của 4 sheet; nếu là "anyone with link", hoặc đổi sang "restricted + share cho Service Account", hoặc bỏ ID khỏi file public và để trong secret store.
3. **GitHub Actions trên repo public: log công khai.** Cấm `print()` response thô/token trong job cron. Chỉ log số dòng + trạng thái. (Secret của Actions vẫn được mã hoá và tự động che trong log, nhưng dữ liệu *nội dung* trả về từ API thì không được che.)
4. **Tài khoản đang dùng là account cá nhân của anh Hiếu / chị Tuyết** (v1 note: credentials dùng chung cho cả VPN lẫn Metabase). Đề nghị: xin account riêng cho automation; nếu buộc dùng account cá nhân thì tối thiểu phải đổi mật khẩu sau khi dự án xong, vì mật khẩu đã đi qua nhiều kênh chia sẻ.
5. Thêm vào `.gitignore` (phòng nhầm lẫn): `*.ovpn`, `*service-account*.json`, `Danh sách các nguồn thông tin*/`.

---

## V-ter. Ánh xạ milestone v1 → v2 (tránh nói chuyện lệch nhau)

Anh Minh đang track task bằng ID milestone trong memory/note riêng ("chặn bởi M0", "N4 đang xử lý"). v2 chèn thêm 1 milestone nên **số bị dịch** — bảng đối chiếu để 2 bên không hiểu nhầm:

| v1 | v2 | Nội dung |
|---|---|---|
| M0 | **M0** | Điều tra (v1: chỉ Metabase · v2: 3 hệ thống) — *ID không đổi* |
| M1 | **M1 + M2** | v1 gộp mọi puller làm 1; v2 tách: M1 = nguồn dễ (Sheets), M2 = nguồn khó (Metabase/BI/CRM, phụ thuộc kết quả M0) |
| M2 (automation) | **M3** | cron/scheduler |
| M3 (frontend) | **M4** | mở rộng bảng BC02 |
| M4 (test+deploy) | **M5** | test + chạy song song đối chiếu + deploy |

*(Ghi chú: "N4" trong note của anh Minh = Lark doc của chị Thu Hiền — chính là tài liệu đã tải về và dùng làm ground truth cho v2 này.)*

---

## VI. Cần anh Minh / chị Hiền xác nhận trước khi bắt đầu code

*(#1, #6 không chặn M0 — có thể bắt đầu điều tra song song trong lúc chờ trả lời. #2–5, #7–8 chặn M1 trở đi.)*

1. **Budget ADS: số từng ngày hay lũy kế từ đầu tháng?** Soát lần 2 phát hiện thêm nghi vấn cụ thể: ô `AA2` trong file mẫu trỏ vào dòng **"8月汇总" (tổng tháng)**, không phải dòng theo ngày — trong khi hướng dẫn B2 lại nói "COPY... từng ngày". Có thể là 2 công thức cho 2 ô khác nhau trong báo cáo (1 ô daily-pivot, 1 ô tổng-tháng-đối-chiếu) — cần chị Hiền xác nhận trực tiếp trên file thật, không tự suy diễn thêm vì cả 2 cách hiểu đều "chạy được" nhưng ra số khác nhau, sai sẽ không ai phát hiện ngay.
2. **Bảng đầy đủ mã kênh↔cột sheet HCM** (M0-T4) — ảnh trong tài liệu hiện bị cắt, mới thấy 5 kênh (300461, 300471, 1032, 1035, 1036).
3. **Ai được xem Budget ADS trong BC02?** — **dữ kiện quan trọng vừa verify** (`backend/admin_routes.py:167-172`, `DEFAULT_DEPT_PERMISSIONS`): mặc định BC02 hiện đang **"read" cho CẢ department "sale" (nhân viên sale thường, không chỉ leader/manager) LẪN "marketing"** — nghĩa là nếu không thêm chặn riêng, mọi sale rep + marketing đều thấy được ngân sách quảng cáo công ty ngay khi cột Budget ADS lên UI. Cần anh Minh chốt: giữ nguyên mức "read" chung như hiện tại (chấp nhận sale/marketing thấy budget), hay tách quyền riêng cho khối cột mới (VD chỉ hiện Budget/Lead cho leader trở lên, ẩn với sale — cần thêm field-level permission, phức tạp hơn module-level đang có)?
4. **Khi user lọc 1 team con (VD Inhouse 1) thì khối Lead/Chatpage/Trial/Budget nên ẩn hay hiện kèm nhãn "toàn HN"?** Vì 4 nhóm này đo theo vùng, không theo từng team con.
5. **Tài khoản PalFish Class CRM** ("Thống kê TVTS") — có chung với Metabase (2 email trong Phụ lục) hay là hệ thống đăng nhập riêng? Cần biết trước khi làm M0-T3.
6. **Giờ refresh BI dashboard (10h/15h/17h/19h) là giờ Bắc Kinh hay giờ VN?** (M0-T7) — quyết định giờ chạy cron ở M3, không chặn code nhưng chặn M3.
7. **Xin được account riêng cho automation trên Metabase/BI/PalFish CRM, hay buộc dùng account cá nhân anh Hiếu/chị Tuyết?** (mục V-bis điểm 4) — nếu dùng account cá nhân, cần thống nhất đổi mật khẩu sau khi xong vì đã đi qua nhiều kênh chia sẻ (bao gồm cả tài liệu Lark, hiện đã tải plaintext về máy này).
8. **Referral (Metabase Q14385) có nằm trong phạm vi task BC02 lần này không?** — BC02 đã có sẵn cột "Giới thiệu" từ `so_doanh_thu`, cần làm rõ Q14385 là bổ sung/đối chiếu hay ngoài phạm vi.
9. **Chị Hiền có cần ghi ngược số liệu tự động lên Google Sheet/All File sau khi app tính xong không, hay chỉ cần app hiện đúng số là đủ, chị bỏ hẳn quy trình tay?** Nếu cần ghi ngược → thêm hẳn 1 milestone ghi-ngược, tăng đáng kể khối lượng.
10. **Xác nhận scope "HN"** trong báo cáo tay chị Hiền = đúng gộp Inhouse 1 + Inhouse 2 + Linh Đàm + Offline + An Bình (5 team canonical trong app — xem `TEAM_TO_CANONICAL` trong `backend/utils/team_mapper.py`), không phải chỉ Inhouse 1 — mục I đang giả định, cần chốt.
11. **Chấp nhận hướng "auto trước 2 nguồn dễ, 2 nguồn khó chờ M0" + cho phép nhập tay tạm thời** (mục III, đảo ngược 1 phần quyết định "bỏ nhập tay" của v1 — xem callout ở mục III) thay vì chờ auto đủ cả 4 nguồn mới ship.

## VII. Ước lượng thời gian (đã điều chỉnh, không còn "3.5 ngày cố định" như v1)

| Việc | Ước lượng | Ghi chú |
|---|---|---|
| M0 điều tra 3 hệ thống | 1 ngày | Rộng hơn v1 (v1 chỉ tính Metabase) |
| M1 — 2 nguồn dễ (Budget+Chatpage) auto | 1.5 ngày | |
| M2 — nguồn khó (tuỳ M0) | 0.5–2.5 ngày | Biên độ lớn vì phụ thuộc có API hay phải làm form tay/Playwright |
| M3 — cron | 0.5 ngày | |
| M4 — FE | 1 ngày | Khối cột mới + badge trạng thái |
| M5 — chạy song song đối chiếu + deploy | 3-5 ngày chạy song song (không full-time) + 0.5 ngày dev | Không rút ngắn — đây là bước tin cậy số liệu |
| **Tổng dev thuần** | **~4.5–6.5 ngày** | Rộng hơn v1 vì v1 đánh giá thấp độ phức tạp thật |

**Vì sao đội lên so với v1 (3.5 ngày) — giải trình từng khoản, không phải cộng phòng hờ:**

| Khoản | v1 | v2 | Lý do thay đổi |
|---|---|---|---|
| M0 điều tra | 0.5 | 1.0 | v1 chỉ điều tra 1 hệ thống (Metabase). v2 phải điều tra 3 (thêm BI dashboard + PalFish Class CRM) và xin bảng mã kênh HCM còn thiếu |
| Puller | 1.5 | 2.0–4.0 | v1 tưởng 1 nguồn Metabase là xong. Thực tế 4 nguồn ở 3 hệ thống + **2 công thức trừ chéo** + logic **đếm dòng** chatpage. Biên trên 4.0 là kịch bản BI/CRM không có API, phải Playwright |
| FE | 0.5 | 1.0 | v1 tưởng thêm cột vào `columnGroups` sẵn có. Thực tế `columnGroups` là cấu trúc **cặp count+gmv**, metric mới là **giá trị đơn** → phải thêm nhánh render riêng + badge trạng thái NULL/manual/auto |
| Test + deploy | 0.5 | 0.5 dev + 3–5 ngày chạy song song | v1 không có bước đối chiếu song song. Không rút ngắn được: đây là bước để chị Hiền tin số |

Nếu anh Minh cần con số cam kết cho sếp: **ship được 2 nguồn dễ (Budget + Chatpage) trong ~2.5 ngày kể từ khi có quyền Service Account**, phần còn lại phụ thuộc M0.

## Đối chiếu 5 tiêu chí (giữ nguyên khung v1, cập nhật nội dung)

1. **Triệt để**: auto tối đa nguồn có API xác nhận được ở M0; nguồn chưa xác nhận có form tay tạm thời (KHÔNG bỏ trắng, KHÔNG block cả task chờ 1 nguồn khó nhất).
2. **Không lỗi con**: upsert UNIQUE(report_date, region); `raw_fetch_meta` lưu vết nguồn để debug lệch số; chạy song song đối chiếu trước khi tắt quy trình tay (M5-T3).
3. **Không tăng hạ tầng quá mức**: tái dùng Service Account pattern đã có (`gsheet_ledger_import.py`), tái dùng DingTalk outbox cho alert, không thêm server/DB mới.
4. **Tối ưu token/thời gian**: M0 điều tra trước, plan self-contained kèm ground-truth thật (không đoán mò như v1).
5. **Bền vững**: schema tách `region` rõ ràng khỏi 6-team canonical của app (tránh nhầm lẫn khi ai đó sau này thêm team mới); `leads_by_channel jsonb` linh hoạt khi HCM đổi/thêm kênh mà không cần migration.
