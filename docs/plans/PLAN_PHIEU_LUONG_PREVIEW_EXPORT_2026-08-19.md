# PLAN — Preview phiếu lương + Xuất Excel theo Team (Task C + Task E)

*Ngày lập: 19/08/2026 · Người thực thi: Sonnet 4.6 · Mã task: `G3-*`*

*Sửa đổi 19/08/2026 (lần 2): chốt lại khoá gom nhóm sau khi đo số liệu thật sheet HRIS.*
*Sửa đổi 19/08/2026 (lần 3): **XOÁ cột `Nhóm gửi`**. Khoá gom = cột `team` đã có sẵn. G3-T5 REMOVED. G3-T6 thu nhỏ còn "thêm `Phòng ban (HRIS)`". Xem mục 1 Q1 mới.*

---

## 0. ĐỌC CÁI NÀY TRƯỚC

**Đang làm gì:** thêm 2 tính năng cho Google Sheet "PalFish - Bảng lương tự động" (`1S6CjG8tWzFVYjYJfgT0BfCExIxhCOu_Lw7SU-_jEkBI`) — (C) xem trước phiếu lương từng người ngay trên Sheet, (E) xuất Excel tách theo **cột `team` đã có sẵn** (KHÔNG thêm cột mới). Cột phụ `Phòng ban (HRIS)` (từ `t.departments` BQ) thêm tùy chọn sau G3-S1b.

**Cho ai:** chị Thu Trang (HR, không phải dev), thao tác 100% qua menu `⚙ Bảng lương`. Quy mô 98 NV HN.

**Code sống ở đâu:** Apps Script bound vào Sheet trên. Repo chỉ là **bản chép tay** tại `docs/apps-script/*.gs` — **KHÔNG có clasp, KHÔNG có CI, KHÔNG chạy test tự động được**. Giao hàng = copy-paste cả file vào Apps Script Editor.

**Nguồn sự thật:**
| Thứ | Ở đâu |
|---|---|
| Layout cột bảng lương | mảng `COLS`, `docs/apps-script/BangLuong.gs:62-96` (29 cột) |
| Hợp đồng payload phiếu | `docs/PHIEU_LUONG_CONTRACT.md` (⚠ có 4 chỗ đã lệch code sống — G3-T13 sửa) |
| Bố cục phiếu mẫu | Google Doc merge `1Jd0TvdJvh7EwsqvPXKyEoLdCDQHXXC_hjmS0TzIN3hs` |
| Nguồn cột `Phòng ban (HRIS)` | **`t.departments` trong `payroll.C_view_bang_luong_truoc_thue`** — view mà `BQ_SQL` (`BangLuong.gs:49`) **đang SELECT**; xác nhận ở `docs/apps-script/bq-schema-baseline.json:73-78`. Bảng nguồn `payroll.C_raw_staff_info_merged` (`:2`) đã **merged** sẵn 7 bảng rời của sheet HRIS ⇒ **KHÔNG đọc sheet HRIS từ Apps Script** |
| Sheet HRIS (chỉ để tra tay, **không** code đọc) | `168xXReeOhfsTB_9mhurmM-WgUElYf6TvLwb1n2P47Fc`. ⚠ **KHÔNG phải một bảng phẳng** — gồm **7 bảng rời nối nhau, cột lệch nhau** (`Departments` ở cột **R** cho T1/T2, **Q** cho T3, **P** cho T4; T2 có dòng banner gộp ô chen giữa; T7 có cột `Bộ phận` dùng từ vựng khác hẳn). Nếu vì lý do nào đó vẫn phải đọc: **cấm hardcode cột R**, phải dò theo **tên header** và **chỉ đọc khối HN**. Chi tiết mục 1b |
| Khoá gom file xuất | Cột **`team`** (`BangLuong.gs COLS[colIndex('team')-1]`, `role:'auto'`, `src:'team'`) — đã có sẵn, KHÔNG thêm cột mới — xem Q1 |
| Chốt họp 17/8 | `docs/plans/TODO_2026-08-17.md:18` (preview) và `:23` (PDF+Excel) |

**Ràng buộc cứng:** Apps Script 6 phút/lần chạy · locale sheet tiếng Việt (công thức dùng `;`) · sheet đang chạy **production thật**, chị Trang đang dùng · mọi task ghi phải chạy trên **bản sao** trước.

**Quy tắc cho model:** làm **từng task một**, theo đúng thứ tự mục 4. Xong task nào → **điền ngay** bảng Nhật ký (mục 9). Nếu mất ngữ cảnh: đọc mục 9 để biết đang ở đâu, rồi đọc đúng khối task đó — mỗi khối tự chứa.

---

## 1. BỐI CẢNH & QUYẾT ĐỊNH ĐÃ CHỐT

Bảng này là **chốt chặn chống thiết kế lại**. Model KHÔNG được đổi các quyết định dưới đây; nếu thấy vấn đề, ghi vào mục 9 và hỏi, không tự đổi.

| # | Quyết định | Chốt gì | Lý do một câu |
|---|---|---|---|
| **Q1** ⭐ | Nguồn khoá gom | **Cột `team`** (`BangLuong.gs:66`, `role:'auto'`, `src:'team'`) — **đã có sẵn**, KHÔNG thêm cột mới. `xlGomNhom_` đọc thẳng giá trị ô cột `team` từ `allVals`. Nếu ô rỗng/null → ép `'Khác'` (COALESCE `:28` chỉ bắt NULL, không bắt `''`). | Ta có bảng lương tổng + cột `team` đã tính từ BQ — đủ thông tin. CASE `:18-28` có bug (nhánh `'47 Nguy%'` chết, `WFH` 0 người) nhưng kết quả thực tế đủ tốt để xuất file; bug CASE sửa riêng. Không cần cột mới, không cần seeding logic, không cần chị Trang làm gì. |
| **Q1e** | `Phòng ban (HRIS)` — tùy chọn | **Chỉ thêm nếu S1b xác nhận `t.departments` có dữ liệu.** Nếu thêm: 1 dòng `"  t.departments,"` vào `BQ_SQL` + cột `{ key:'phong_ban', h:'Phòng ban (HRIS)', role:'auto', src:'departments' }`. **CẤM** xuất hiện trong `xlGomNhom_`. Nếu S1b ra rác → bỏ hoàn toàn. | Thêm 1 field SELECT là zero-risk. Nhưng không bắt buộc — mục đích chỉ là đối chiếu. |
| **Q2** | Vị trí cột phụ (nếu thêm) | `Phòng ban (HRIS)` chèn **ngay sau `employee_type`** (`BangLuong.gs:69`) — **ngoài** vùng freeze. Freeze giữ nguyên (**6**, biểu thức `setFrozenColumns(colIndex('employee_type'))` tự tính). `COL_WIDTH: phong_ban:110`. | Freeze không đổi = không hồi quy UX. |
| **Q3** | Cột phụ có vào phiếu NV không | **KHÔNG.** `gSkipCols_(){ return GATE_COLS.concat(['Phòng ban (HRIS)']); }` — **hàm lazy** (I16), dùng `.concat`, **CẤM `.push`**. `gSkipCols_().length === 6` (5 gate + 1 phụ), hoặc `=== 5` nếu không thêm cột. ⚠ **Tách khỏi hàm lọc cột xuất Excel** — xem Q4f. | `Phòng ban (HRIS)` là dữ liệu vận hành, không phải khoản mục lương. Cột `team` vẫn KHÔNG vào phiếu vì `role:'auto'` không thuộc `GATE_COLS` → đã lọc đúng bởi `gBuildPhieu_`. |
| **Q4a** | Đóng gói export | **2 nút**: (1) ZIP nhiều file, mỗi team 1 file — **nút chính**; (2) 1 file nhiều tab — nút phụ với cảnh báo đỏ "rò lương". | Quyết định bảo mật: file nhóm A không được chứa lương nhóm B. Chị Trang là người nhận toàn bộ rồi tự phân phối cho các leader. |
| **Q4b** | Cơ chế export | **N spreadsheet tạm, mỗi cái 1 tab, export xlsx từng cái.** ⚠ **BỎ HẲN** `export?format=xlsx&gid=` — `gid` chỉ có tác dụng với csv/tsv/pdf, **không thu hẹp xlsx**. Fallback đo được ở G3-S3. | Cơ chế `gid` trả nguyên workbook → file ZIP chứa toàn bộ 98 người, tên file khác nhau. |
| **Q4c** | Guard số nhóm | **Nếu số nhóm `≤ 2` hoặc một nhóm chiếm `> 60%` dân số ⇒ dừng, hỏi** — dấu hiệu cột `team` bị lệch hoặc CASE chết. **Quá 12 nhóm → chia mẻ** (lưu con trỏ ScriptProperties, bấm lần nữa). **TUYỆT ĐỐI không tự đổi sang 1-file-nhiều-tab.** | Số nhóm `team` kỳ vọng là 8–10 (đo ở G3-S1a). Guard hiệu năng không được ghi đè quyết định bảo mật. |
| **Q4d** | Đường về máy | Server dựng file xong → trả về client → client render **thẻ `<a href download>` to, xanh** → **chị Trang tự bấm**. | `window.open` trong `withSuccessHandler` nằm ngoài user-gesture → popup bị chặn câm. |
| **Q4f** | Hai tập "cột bỏ qua" | `gSkipCols_()` (payload phiếu NV) = 5 gate + `Phòng ban (HRIS)` (nếu có) = **5–6**. `xlBoCotXuat_()` (file Excel) = **chỉ 5 cột gate** — file **giữ** `team`, `Phòng ban (HRIS)` (nếu có), `Mã NV`. Hai hàm riêng, **cấm dùng chung một hằng**. | Người nhận file cần thấy nhóm nào (`team`) và phòng ban nào (`Phòng ban HRIS`). NV không cần thấy khoá vận hành nội bộ. |
| **Q5a** | Preview render bằng gì | Modal `showModalDialog` **900×640**. Nạp **toàn bộ bảng 1 lần** khi mở → dropdown `Mã NV — Tên` + nút ◀▶ đổi người **0 RPC**. | Mục đích là lướt kiểm cả phòng trước khi gửi; đóng-mở dialog 98 lần là thiết kế sai. |
| **Q5b** | Bố cục preview | **2 phần, CẢ HAI MỞ SẴN**: (A) thư theo **tag đọc từ Doc mẫu** lúc chạy; (B) "**N cột nữa sẽ gửi sang app**" — badge **đỏ** đếm số, **không thu gọn**. | Doc-driven ⇒ 0 bản sao `PAYSLIP_BLOCKS` trong `.gs`. Phần (B) mở sẵn vì Doc có ~15 tag còn payload có 24 khoản — giấu phần chênh = preview duyệt mù. |
| **Q5c** | Tag Doc ≠ tên cột | Cần bảng `PV_TAG_ALIAS` (vd `'Họ tên'→'Name'`), **điền sau G3-S4**. Tag không khớp cột nào → vào `moCoi[]`, liệt kê đỏ trong modal, không throw. | `docs/plans/PLAN_PHIEU_LUONG_APPSCRIPT_2026-08-17.md:38` đã ghi rõ phải map `"Họ tên"→"Name"`. |
| **Q5d** | Toggle tầng | **KHÔNG có luật ẩn dòng.** 3 nút nguồn: `Bản trên bảng hiện tại` (mặc định) / `Bản đã gửi — trước thuế` / `Bản đã gửi — sau thuế`. Kèm badge lệch + badge tầng suy từ `Khấu trừ thuế` (=0 → trước thuế). | `gEnqueueRow_` (`PhieuLuongGate.gs:136-141`) không lọc theo stage; BE cũng không. 2 tầng khác **giá trị**, không khác **cấu trúc** — viết luật ẩn dòng = phát minh spec bằng code. |
| **Q5e** | Ô trống | Ô `''`/`null` → **BỎ DÒNG**, KHÔNG hiện `—`. | App lọc `""`/`null` ở `PayslipDetail.tsx:106` và `:132` **trước khi** gọi `formatValue` ⇒ `—` không bao giờ hiện. Render `—` = preview hiện thừa dòng. |
| **Q6** | Cấu trúc file | **2 `.gs` + 2 `.html` mới**: `PhieuLuongXem.gs/.html`, `PhongBanXuat.gs/.html`. Không có file "core" thứ ba. Diff vào file cũ giữ ≤ ~25 dòng. | Rollback = xoá 4 file + revert ~25 dòng. `BangLuong.gs` là file "nóng" (Chung đổi view là phải sửa), không nhét thêm vào. |
| **Q7** | Khoá định danh | `code` (Mã NV). **Nhưng phải assert unique và throw nếu trùng** — `TODO_2026-08-17.md:49` đang giao chị Trang "tách 2 dòng case HN0084". | Cả hệ đứng trên `code`: `oldByCode` (`:226`), `_snapshot` (`:421`), `_gate_state` id `code\|ky` (`Gate:300`), `_outbox` id `code\|ky\|stage` (`Gate:134`), BE upsert `code,ky_luong,stage`. Trùng = trộn lương + rò lương qua RBAC. |

---

## 1b. SỐ LIỆU THẬT VỀ NGUỒN PHÒNG BAN (đo ngày 19/08/2026)

> Đọc mục này **thay cho** việc đi đo lại. Mọi con số dưới đây là **đo được** trên sheet HRIS `168xXReeOhfsTB_9mhurmM-WgUElYf6TvLwb1n2P47Fc` (đọc 100% nội dung), trừ chỗ ghi rõ *(ước tính)*.

### 1b.1 Sheet HRIS **không phải một bảng phẳng** — 7 bảng rời, cột lệch nhau *(đo được)*

| Bảng | Số dòng | Mã | Số cột | `Bộ phận Departments` ở cột | Ghi chú |
|---|---|---|---|---|---|
| T1 | 51 | HN | 42 | **R** | `Code`=**C**, `Email`=**G**, `Nơi làm việc Workplace`=**S** |
| T2 | 54 | HN | 41 | **R** | `Code`=**C**. Có **dòng banner gộp ô** chen giữa: `BOD` (dòng 59), `INHOUSE 1` (62), `OFFLINE` (102) — đọc phẳng theo dòng sẽ **nuốt phải** mấy dòng này |
| T3 | 60 | HCM | 40 | **Q** *(lệch 1 cột)* | |
| T4 | 8 | HCM | 39 | **P** *(lệch 2 cột)* | **Trùng lặp** HCM029–036 với T3 |
| T5/T6/T7 | — | — | — | — | Lương cơ bản · con cái · "chưa điền link thông tin". ⚠ T7 có cột `Bộ phận` **RIÊNG, từ vựng khác hẳn** (`Inhouse 1`/`An Bình`/`TP. HCM`/`Linh Đàm`) — **KHÔNG được trộn** |

⇒ **Không thể hardcode "cột R".** Nếu buộc phải đọc sheet này thì phải dò cột theo **tên header** và chỉ đọc **đúng khối HN**. Đây chính là lý do Q1b **bỏ hẳn** việc đọc sheet: `payroll.C_raw_staff_info_merged` (`bq-schema-baseline.json:2`) đã merge sẵn.

### 1b.2 Phân bố `Departments` *(đo được)*

**Phạm vi lương (HN, T1+T2 = 105 dòng):**

| Bộ phận | Số người HN |
|---|---|
| Kinh doanh | **69** |
| Marketing | 7 |
| CS | 5 |
| HR | 3 |
| Accountant | 1 |
| *(trống)* | **20** |

**Toàn bộ (cả HCM, 173 dòng):** Kinh doanh 74 · Marketing 31 · CS 6 · HR 3 · Team Media 2 · `Kinh Doanh` 2 · Accountant 1 · Team EC 1 · Team CS 1 · trống 52.

⚠ **105 dòng HN ≠ 98 dòng bảng lương** — tập HN gồm cả NV `OFF` và mã đặt sẵn `HN0196–HN0204`. Mọi con số suy ra "sẽ có bao nhiêu file" từ bảng này là **ước tính chồng ước tính**. Số dùng được đo ở **G3-S1b**, trên `t.departments` của chính 98 dòng.

⚠ Repo còn một bản đếm **thứ ba, mâu thuẫn**: `PLAN_M4_MODULE_PHIEU_LUONG_2026-08-14.md:54` ghi *"Org thật (payroll 98 NV HN) — 7 phòng ban: Kinh doanh 56 · CS 18 · Marketing 10 · HR 8 · Kế toán 1 · Ban Giám đốc 1 · Học thuật 2 · Kỹ thuật ~4"*. `CS 18≠5`, `HR 8≠3`, và `Ban Giám đốc`/`Học thuật`/`Kỹ thuật` **không tồn tại** trong cột `Departments` của sheet. ⇒ **Không ai biết chắc "phòng ban" của 98 NV là gì** — đó là lý do cột này **không được cầm lái** (Q1e).

### 1b.3 Bẫy dữ liệu đã xác nhận *(đo được)*

- `Kinh Doanh` (chữ **D** hoa) tồn tại — 2 dòng, mã HCM006/HCM008 ⇒ **so sánh phải bỏ phân biệt hoa thường**.
- Ô có **dấu cách thừa cuối**: mã **HN0139** giá trị thật là `"Marketing "` ⇒ **bắt buộc TRIM**.
- `CS` và `Team CS` cùng tồn tại như 2 giá trị riêng; tương tự `Marketing` vs `Team Media`/`Team EC` (đều HCM-only, ngoài phạm vi lương HN).
- 173 dòng nhưng chỉ **165 mã duy nhất** — 8 mã trùng (HCM029–036 có ở cả T3 và T4).
- Trong 20 dòng HN trống bộ phận: phần lớn là NV đã nghỉ (`TRẠNG THÁI = OFF`) hoặc mã đặt sẵn (HN0196–HN0204). Nhưng **HCM014 và HCM034 đang `Status = ON` mà vẫn trống** ⇒ **"trống" KHÔNG đồng nghĩa "đã nghỉ"**. Con số riêng cho HN active **chưa đo được** — trả lời dứt điểm bằng query ở G3-S1b (`C_raw_staff_info_merged` có `work_status` + `last_working_day`, `bq-schema-baseline.json:40-41`).

### 1b.4 **KHÔNG có cột nào chứa IH1/IH2/WFH** *(đo được)*

Thứ gần nhất là `Nơi làm việc Workplace` (T1 cột S):

| Giá trị | Số người |
|---|---|
| `Inhouse 1 - 35 Lê Văn Thiêm, Hà Nội` | 64 |
| `TP. Hồ Chí Minh` | 42 |
| `Inhouse 2 - 143 Nguyễn Tuân, Hà Nội` | 13 |
| `Store An Bình, Hà Nội` | 7 |
| `Store Linh Đàm, Hà Nội` | 6 |
| *(trống)* | 53 |

Đây chính là cột mà `CASE ... AS team` (`BangLuong.gs:18-28`) đang đọc gián tiếp qua BQ. Ba hệ quả **đã xác nhận**, dùng làm căn cứ cho Q1c:
- Nhánh `'47 Nguy%'` (`:20`) **chết** — địa chỉ Inhouse 2 nay là **143** Nguyễn Tuân.
- Nhánh `'Work from home%'` (`:27`) khớp **0 người**.
- Nhánh `'Store%'` (`:21`) thiếu `UPPER` trong khi `:20`/`:26` có; và nó gộp **An Bình (7) + Linh Đàm (6)** thành **một** `Offline` — hai cửa hàng, gần như chắc chắn hai người quản.

### 1b.5 Vì sao khoá gom **không** phải một cột suy ra từ dữ liệu

Gom thuần theo `Departments` ra 5 nhóm, trong đó `Kinh doanh` chứa **69/105** người HN — gần cả công ty trong một file, đúng cái Q4a nói phải tránh. Gom theo `team` thì `Inhouse 1` ≈ **50%** dân số, và 13 người `Inhouse 2` sẽ **nhảy file trong một đêm** nếu HR chuẩn hoá lại chuỗi địa chỉ (đã có tiền lệ: nhánh `'47 Nguy%'`).

⇒ "Ai nhận file lương của người này" là **một sự kiện tổ chức**, đổi vài lần một năm, **luôn do người quyết**. Suy nó ra từ `title_job`/`workplace`/`departments` là biến **nhiễu nhập liệu** thành **tái phân hoạch việc phát lương**. Kết luận: máy **mồi một lần**, người **giữ vĩnh viễn** (Q1 + Q1d).

---

## 2. BẤT BIẾN KHÔNG ĐƯỢC PHÁ

| # | Bất biến | Tự kiểm bằng gì |
|---|---|---|
| **I1** | `main.getMaxColumns() >= COLS.length` **và** `_data.getMaxColumns() >= số cột BQ` trước **mọi** lần ghi | `ensureGridWidth_` gọi ở **2 chỗ**: ngay sau `BangLuong.gs:219`, và dòng đầu `writeRaw_` (`:413`). ⚠ **Không** đặt ở `:250` — `:243` `getRange(2,1,n,Math.max(...))` nổ trước |
| **I2** | Hàng 1 có đúng `COLS.length` nhãn, **không nhãn nào trùng, không nhãn nào rỗng** | `plAssertHeadersUnique_(headers)` đầu **mọi** entry point. Lý do: `gHeaderMap_` (`Gate:331`) lấy nhãn **TRÁI**, `phieu[h]=` (`Gate:140`) lấy **PHẢI** ⇒ trùng = payload sai âm thầm |
| **I3** | **Mã NV duy nhất** trên bảng lương | `plAssertCodesUnique_(rows)` trong `capNhatTuBigQuery`, **throw** kèm danh sách mã trùng. Thà refresh chết còn hơn trộn lương |
| **I4** | Sau 2 lần refresh liên tiếp (kể cả khi layout đổi), mọi ô chị Trang gõ đè ở `Thưởng COM` / `Xe+PC` / `Bù tiền` / `Note` **giữ nguyên byte-for-byte** | Kịch bản tay G3-T2 bước 5 + `test_refreshGiuOInputTay` (C1) |
| **I5** | `GATE_COLS.length === 5` và `gSkipCols_() !== GATE_COLS` (khác object, length **5 hoặc 6**) | Assert đầu `guiPhieuOnEdit` và `gEnqueueRow_`. Nếu `.push` nhầm: `Gate:72` cho qua ô khoá vận hành → rơi nhánh (C) `Gate:116-117` → toast sai |
| **I6** | `payload_json` **không chứa khoá `"Phòng ban (HRIS)"`** (nếu thêm cột) và **không chứa `"team"`**, tập khoá còn lại giống hệt trước khi thêm cột | Tick gửi 1 NV test → mở `_outbox` cột 11 → `JSON.parse(...).phieu['Phòng ban (HRIS)'] === undefined` **và** `...['team'] === undefined` (team là `role:'auto'`, lọc đúng bởi `gBuildPhieu_` theo `gSkipCols_()`) |
| **I7** | Không checkbox nào ở dòng > số NV; không data validation nào ngoài 5 cột gate | `.clearDataValidations()` phải có ở **cả 3 khối clear**: `:244-245` (đã có), `:307` (đã có), **`:313` (THIẾU — phải thêm)**, `:319-321` (đã có) |
| **I8** | Mỗi NV xuất hiện **đúng 1 lần trong đúng 1 file** | `Σ(số dòng mỗi nhóm team) === xlMauSo_(bang)` — **một hàm đếm duy nhất**, dialog và assert cùng gọi. Lệch → **throw, không tải** |
| **I9** | Mọi blob xuất ra là file Excel thật | 4 byte đầu `= 0x50 0x4B 0x03 0x04` (`PK\x03\x04`). HTTP 200 **không phải** bằng chứng — thiếu scope Drive thì endpoint trả **trang HTML đăng nhập** kèm 200 |
| **I10** | File nhóm A không chứa dữ liệu nhóm B | Ghi tên nhóm vào ô A1 → `Utilities.unzip(blob)` → tìm tên nhóm trong `sharedStrings.xml`. Không thấy → **throw, không tải** |
| **I11** | Ô trong file xuất là **VALUE**, không phải FORMULA | Dùng `getValues()` (không `getFormulas()`); assert không ô nào `typeof==='string' && charAt(0)==='='`. Lý do: 2 cột `role:'calc'` (`:71-72`) trỏ ô **cùng dòng**, sang file khác số dòng là trỏ sai |
| **I12** | Không file tạm nào sống sót trên Drive | 3 lớp: `try/finally` trash · ghi id vào `ScriptProperties` **ngay sau `create`** · quét prefix `__PL_TMP_` đầu mỗi lần chạy |
| **I13** | Không giá trị nào trả về client có kiểu `Date` hoặc `undefined` | `plSerialize_()` bọc **mọi** `return` của hàm client-callable. `google.script.run` **cấm** `Date` → request fail **câm** |
| **I14** | **0 bản sao** của `PAYSLIP_BLOCKS` / `KEY_NORMALIZE` / `PREFIX_KEYS` trong bất kỳ file `.gs` nào | `grep -n "PAYSLIP_BLOCKS\|KEY_NORMALIZE\|PREFIX_KEYS" docs/apps-script/*.gs` → **0 kết quả** |
| **I15** | Mọi hàm ghi vào tab `Bảng lương` phải giữ document lock | `capNhatTuBigQuery`, `dinhDangBangLuong`, `xlTaiZip` cùng gọi `LockService.getDocumentLock().tryLock(0)`. Lock một chiều còn tệ hơn không lock |
| **I16** | Không hằng số top-level nào phụ thuộc biến của file `.gs` khác | Apps Script nối mọi `.gs` thành 1 global scope, **thứ tự nạp không đảm bảo**. `var X = GATE_COLS.slice()` ở top-level → `TypeError` **lúc nạp** → menu biến mất, trigger chết, cả sheet ngừng chạy. Dùng **hàm lazy**: `function gSkipCols_(){ return GATE_COLS.concat(['Phòng ban (HRIS)']); }` |
| **I17** | Mọi hàm mới có **≥1 call site** | `grep` đếm. Tiền lệ: `restoreGateTicks_` (`Gate:227`) tồn tại nhưng **grep toàn repo = 0 chỗ gọi** — hàm chết 0 ai biết |
| **I18** | ~~REMOVED — đã xoá cột `Nhóm gửi`~~ | Không còn cột nhóm gửi. Khoá gom = `team`. |
| **I19** | ~~REMOVED~~ | — |
| **I20** | ~~REMOVED~~ | — |
| **I21** | **Ô `team` rỗng/null ép về `'Khác'`** trong `xlGomNhom_` | `COALESCE(t.workplace,'Khác')` (`:28`) **chỉ bắt NULL, không bắt `''`** ⇒ lớp ép `String(v||'').trim() || 'Khác'` ở `xlGomNhom_` là **bắt buộc**. `test_gomNhom()` có ca ô rỗng |
| **I22** | **`capNhatTuBigQuery` không mở spreadsheet nào ngoài chính nó** | `grep -n "openById\|SpreadsheetApp.open" docs/apps-script/PhongBanXuat.gs` → **0 kết quả**. Trong `BangLuong.gs`, `openById` chỉ được phép còn ở `taoTabNhapTay` (`:154`), **không** ở đường refresh |
| **I23** | **Hai tập "cột bỏ qua" là hai hàm riêng** | `gSkipCols_().length===5 hoặc 6` · `xlBoCotXuat_().length===5` · `gSkipCols_() !== xlBoCotXuat_()` (khác object) · `gSkipCols_() !== GATE_COLS` · `GATE_COLS.length===5` |
| **I24** | ⭐ **Nhãn `team` chưa nằm trong `CASE :19-28` phải hiển thị VÀNG trong dialog xuất** | `Set(CANON(team)) \ Set(['bod','inhouse 1','inhouse 2','offline','cskh','back office','mkt','head quarter','wfh','khac'])`. Nhãn lạ → dialog cảnh báo *"Team không nhận dạng được: 'xyz' (N người)"*. Chỉ cảnh báo, không chặn. |
| **I25** | **Tên tab và tên file là hai phép chuẩn hoá khác nhau** | `test_tenTabVaFile()`: `xlTenTab_('Kế toán & Hành chính')` **giữ dấu**, ≤31; `xlTenFile_` cùng chuỗi ra `Ke-toan-Hanh-chinh`, ≤60; `xlTenFile_('A/B')` ≠ `xlTenFile_('A:B')` (khử trùng `~2`); `xlKiemBlob_` tìm **nhãn A1 có dấu**, không tìm slug |
| **I26** | **`CANON` của `xlGomNhom_` gộp RỘNG HƠN HOẶC BẰNG `xlTenFile_`** | `test_gomNhom()`: `Inhouse 1` / `inhouse-1` / `inhouse 1` ra **1 nhóm**. Ngược lại (2 nhóm → 1 tên file → cứu bằng `~2`) là ca người nhận có 2 file trông y hệt, **không cách nào biết mở cái nào** |

---

## 3. DANH SÁCH TASK

Thứ tự thực thi từ trên xuống. Task ghi `[song song]` có thể làm bất kỳ lúc nào sau khi phụ thuộc xong.

---

### G3-T0 — Đồng bộ repo với editor sống + manifest + README

**Mục tiêu:** làm cho repo trở thành bản phản chiếu trung thực của Apps Script project, để mọi anchor trong plan này có ý nghĩa.

**File & vị trí:**
- `docs/apps-script/BangLuong.gs`, `docs/apps-script/PhieuLuongGate.gs` (ghi đè)
- `docs/apps-script/appsscript.json` (**tạo mới** — hiện KHÔNG tồn tại trong repo)
- `docs/apps-script/README.md` (**tạo mới**)

**Việc phải làm:**
1. **Mở Apps Script Editor của Sheet `1S6CjG8t…`.** Copy nội dung **thật** của từng file `.gs` → dán đè file tương ứng trong `docs/apps-script/`. Chạy `git diff` — nếu có khác biệt, **đó là bằng chứng repo đã lệch**; ghi vào mục 9.
2. **Project Settings → tick "Show `appsscript.json` manifest file"** → copy nội dung → lưu thành `docs/apps-script/appsscript.json`. (Chỉ copy, **CHƯA đổi scope** — việc đó là G3-S2.)
3. **Liệt kê mọi file `.gs` trong editor.** Nếu editor có file mà repo không có, hoặc ngược lại → ghi rõ vào README.
4. **Viết `docs/apps-script/README.md`** (~15 dòng) gồm:
   - Bảng: file `.gs` → thuộc Apps Script project nào → gắn vào Sheet nào.
   - Cảnh báo **va chạm namespace đã biết**: `BangThue.gs` và `BangTinhThue.gs` định nghĩa **trùng** hàng loạt tên (`THUE_CFG`, `SQL_THUE`, `C_`, `NUM_COLS`, `capNhatBangThue`, `queryBQ_thue_`, `writeRaw_t_`, …) với logic **khác nhau**; `onOpen` có ở cả `BangLuong.gs:98` và `DoiSoatSoDoanhThu.gs`; `toNum_` có ở cả `DoiSoatLuong.gs` và `DoiSoatSoDoanhThu.gs`. → **hai file này KHÔNG được nằm chung một project.**
   - Quy tắc: **cấm hằng số top-level tham chiếu biến của file khác** (xem I16).
5. Commit thẳng `main`: `chore(apps-script): sync tu editor + them manifest & README`.

**Không được đụng:** không sửa logic bất kỳ file `.gs` nào ở task này. Chỉ sync + tạo 2 file mới.

**Tiêu chí đạt:**
- `git status` sạch sau commit; `docs/apps-script/appsscript.json` tồn tại trong git.
- README nêu đủ 3 nhóm va chạm namespace ở trên.
- Chạy `git diff HEAD~1 -- docs/apps-script/*.gs` → nếu có thay đổi, mục 9 phải ghi rõ chỗ nào lệch.

**Bẫy đã biết:**
- `docs/plans/PLAN_PHIEU_LUONG_APPSCRIPT_2026-08-17.md:93-104` tự khai đã code xong `Tổng trước thuế`, `income_col_u`, `an_ca_van` — **nhưng `COLS` hiện có 29 mục và KHÔNG có cột nào tên đó**, `BQ_SQL` **không** SELECT `income_col_u`. Tức plan cũ là ước vọng hoặc editor khác repo. **Đây chính là lý do task này tồn tại.**
- Sau khi sync, **mọi số dòng trong plan này phải verify lại**. Nếu lệch, ưu tiên **neo bằng text** (tên hàm, đoạn code) hơn số dòng.

**Phụ thuộc:** không có. **Đây là blocker tuyệt đối — không task nào được bắt đầu trước khi task này xong.**

---

### G3-T1 — Chuyển `gateToken` + `kyLuong` sang ScriptProperties

**Mục tiêu:** dán lại `PhieuLuongGate.gs` không bao giờ xoá mất token thật và kỳ lương.

**File & vị trí:** `docs/apps-script/PhieuLuongGate.gs:34` (`kyLuong`) và `:36` (`gateToken`); `kyLuongHienTai_()` `:317-323`; `flushOutbox` `:189`.

**Việc phải làm:**
1. Thêm helper:
   ```js
   function gProp_(key, def){
     var v = PropertiesService.getScriptProperties().getProperty(key);
     return (v === null || v === '') ? (def || '') : v;
   }
   ```
2. `GATE_CFG.gateToken` và `GATE_CFG.kyLuong` → **xoá khỏi object literal**. Mọi nơi dùng đổi thành `gProp_('GATE_TOKEN')` / `gProp_('KY_LUONG')`. Cụ thể: `flushOutbox` `:189` và `kyLuongHienTai_()` `:318`.
3. Thêm menu item `🔑 Đặt token & kỳ lương` (`BangLuong.gs` `onOpen`, cuối nhóm cổng gửi phiếu) mở 2 `ui.prompt` → ghi vào ScriptProperties. Trống = giữ nguyên giá trị cũ.
4. **Trên editor thật:** Project Settings → Script Properties → đặt `GATE_TOKEN` = giá trị Render env `GATE_TOKEN`, `KY_LUONG` = kỳ đang chạy (`YYYY-MM`) hoặc để trống.

**Không được đụng:** `appEndpoint` (`:35`) giữ nguyên trong code — nó không phải secret. `OUTBOX_HEADERS`, `STATE_HEADERS`, `SEND_STEPS`, `GATE_COLS`.

**Tiêu chí đạt:**
- `grep -n "gateToken" docs/apps-script/PhieuLuongGate.gs` → chỉ còn trong comment.
- Chạy `flushOutbox` khi outbox rỗng → toast "Hàng đợi trống", không lỗi.
- Đặt `KY_LUONG='2026-08'` qua menu → `kyLuongHienTai_()` trả `'2026-08'`.
- **Dán đè lại cả file `PhieuLuongGate.gs` từ repo vào editor → chạy `flushOutbox` → vẫn dùng đúng token** (không 401).

**Bẫy đã biết:**
- ⚠ **`appEndpoint` hiện KHÔNG rỗng** — `PhieuLuongGate.gs:35` trỏ thẳng `https://palfish-gmv-api.onrender.com/api/payroll/payslips/receive` (production). `gateToken` rỗng ⇒ `flushOutbox` **POST thật với header rỗng** ⇒ BE trả **401** ⇒ outbox `failed`, `attempts++`, quá 5 lần → `skipped` **vĩnh viễn** (`Gate:182`). **Trước khi làm gì, kiểm tab `_outbox` xem đã có dòng `failed` nào chưa** — nếu có, ghi vào mục 9.
- `docs/PHIEU_LUONG_CONTRACT.md:92` và `:121` viết `appEndpoint=''` → **contract đã STALE so với code sống**. G3-T13 sửa.

**Phụ thuộc:** G3-T0.

---

### G3-T2 — Vá nền `BangLuong.gs` (CHƯA thêm cột)

**Mục tiêu:** vá 7 lỗ hổng nền để việc thêm cột ở G3-T6 không nuốt ô nhập tay của chị Trang.

**File & vị trí:** `docs/apps-script/BangLuong.gs` — các anchor dưới đây.

**Việc phải làm** (7 vá, làm đủ cả 7):

| # | Anchor | Sửa gì |
|---|---|---|
| 1 | Cuối file, thêm hàm mới | `function ensureGridWidth_(sh, n){ var m = sh.getMaxColumns(); if(m < n) sh.insertColumnsAfter(m, n - m); }` |
| 2 | Cuối file, thêm hàm mới | `plAssertHeadersUnique_(headers)` — throw tiếng Việt nếu có nhãn trùng hoặc nhãn rỗng, message **nêu đúng nhãn nào** |
| 3 | Cuối file, thêm hàm mới | `plAssertCodesUnique_(rows)` — gom `String(r.code\|\|'').trim()`, throw nếu trùng, message liệt kê mã trùng |
| 4 | Ngay sau `:219` (`const headers = COLS.map(c=>c.h);`) | `plAssertHeadersUnique_(headers); plAssertCodesUnique_(rows); ensureGridWidth_(main, headers.length);` — ⚠ **phải trước** khối `layoutChanged` `:240-247`, vì `:243` `getRange(2,1,n,Math.max(oldHdr.length, headers.length))` nổ trước `:250` |
| 5 | Dòng đầu `writeRaw_` (`:413`, sau `if(!rows.length) return;`) | `var keys = Object.keys(rows[0]); ensureGridWidth_(sh, keys.length);` — `_data` tạo bằng `insertSheet` (grid mặc định 26 cột), BQ_SQL hiện trả **24** cột; Chung append 2 cột nữa là nổ, và nổ ở `:217` **trước mọi thứ** |
| 6 | **`:246`** — `snapMap = {};` | **XOÁ dòng này.** Thay bằng comment: `// KHÔNG reset snapMap — readSnap_ map theo code + TÊN key (:423), độc lập vị trí cột. Reset = nuốt Thưởng COM / Xe+PC / Bù tiền.` |
| 7 | **`:313`** — `main.getRange(rows.length+2, 1, lastRow-rows.length-1, COLS.length).clear();` | Nối thêm `.clearDataValidations()` cho **cùng range**. `.clear()` KHÔNG xoá data validation ⇒ checkbox ma sống ở dòng thừa |
| 8 | `:264` — `const r = i+2, d = rows[i], code = d.code;` | Đổi thành `code = String(d.code\|\|'').trim();` — `oldByCode` khoá đã `.trim()` (`:229`) nhưng tra cứu dùng `d.code` thô ⇒ BQ trả `'HN0084 '` là mất sạch override, im lặng |
| 9 | Đầu `capNhatTuBigQuery` (`:207`) và đầu `dinhDangBangLuong` (`:376`) | `var lk = LockService.getDocumentLock(); if(!lk.tryLock(0)){ ss.toast('Đang có thao tác khác chạy, chờ chút.','Bảng lương',5); return; } try{ …toàn bộ thân hàm… } finally { lk.releaseLock(); }` |

**Không được đụng:** mảng `COLS` (chưa thêm cột ở task này) · `BQ_SQL` · `formatSheet_` · `COL_WIDTH` · `MONEY_KEYS` · bất kỳ file nào ngoài `BangLuong.gs`.

**Tiêu chí đạt** (chạy trên **bản sao**, không phải sheet thật):
1. `Tệp → Tạo bản sao` (tick "sao chép cả trang tính ẩn"). Ghi lại 3 con số nhập tay của 3 NV (`Thưởng COM`, `Xe+PC`, `Bù tiền`) + tick 3 checkbox `Xác nhận thông tin` ở 3 dòng khác.
2. **Ép layout đổi** — tạm đổi 1 nhãn trong `COLS` (vd `'Note'` → `'Note '`), chạy `capNhatTuBigQuery`, kiểm **cả 9 thứ còn nguyên**, rồi trả nhãn về và chạy lại. ⚠ Nếu không ép layout đổi thì nhánh `snapMap={}` **không chạy** và test pass kể cả khi chưa vá gì.
3. Xoá bớt còn 5 dòng NV trên bản sao → refresh → **0 checkbox ở dòng > 6**.
4. `main.deleteColumns(21, 9)` (còn 20 cột lưới) và thu `_data` còn 10 cột → refresh → chạy xong không lỗi, cả 2 sheet có `getMaxColumns() >= ` số cột cần.
5. Tạm sửa BQ trả 2 dòng cùng `code` (hoặc gọi `plAssertCodesUnique_` với fixture) → **throw**, message liệt kê mã trùng.
6. Mở `capNhatTuBigQuery` lần 2 khi lần 1 đang chạy → lần 2 toast "Đang có thao tác khác chạy".

**Bẫy đã biết:**
- Vá #4 đặt **sai một dòng là vô hiệu**: `:243` nổ trước `:250`. Neo bằng text `const headers = COLS.map(c=>c.h);`.
- `writeSnap_` (`:432`) làm `snap[code][k]` — nếu `undefined` lọt vào `setValues` sẽ **throw SAU khi bảng đã ghi ở `:299`** ⇒ bảng nhìn đúng nhưng snapshot vẫn là bản cũ ⇒ tháng sau nuốt override. Thêm coerce `(v===undefined||v===null) ? '' : v`.
- Dấu hiệu duy nhất báo refresh chạy trọn vẹn là toast **"Đã cập nhật N NV"** (`:326`). Không thấy toast ⇒ coi như hỏng dù bảng trông đúng.

**Phụ thuộc:** G3-T0.

---

### G3-T3 — Bộ test tự kiểm (`PhieuLuongTest.gs`) — khung + nhóm thuần + baseline

**Mục tiêu:** có harness chạy được từ dropdown Run, để mọi task sau nghiệm thu bằng máy thay vì bằng mắt.

**File & vị trí:** `docs/apps-script/PhieuLuongTest.gs` (**tạo mới**, file `.gs` thứ 5 dán vào editor).

**Việc phải làm:**
1. **Harness.** Hàm test **tên KHÔNG có `_` cuối** (hàm kết thúc `_` là private, không hiện trong dropdown Run). Mỗi assert bọc `try/catch`, gom kết quả rồi in một lần — 1 lỗi không được che 20 lỗi. In `Logger.log` + ghi tab ẩn `_test_log` (1 dòng/assert: `thời gian | mã | ĐẠT/HỎNG | mô tả | kỳ vọng | thực tế`).
2. **Guard ghi:**
   ```js
   var PROD_SS_ID = '1S6CjG8tWzFVYjYJfgT0BfCExIxhCOu_Lw7SU-_jEkBI';
   function tGuardBanSao_(){
     if (SpreadsheetApp.getActiveSpreadsheet().getId() === PROD_SS_ID)
       throw 'TEST GHI — CẤM chạy trên sheet production. Tệp → Tạo bản sao rồi chạy trên bản sao.';
   }
   ```
   Gọi ở dòng đầu **mọi** test có ghi.
3. **Runner:** `chayTestThuan()` (nhóm A, <3s, an toàn mọi lúc) và `chayTestDocThat()` (nhóm B, chỉ đọc, an toàn trên production). Nhóm C (có ghi) **chạy từng hàm một** — trần 6 phút.
4. **Nhóm A — thuần, 0 I/O** (viết ngay task này những cái không phụ thuộc code chưa có):
   - `test_layoutCOLS()` — 11 assert: `COLS.length` đúng (**30** nếu thêm `Phòng ban (HRIS)` / **29** nếu không) · không nhãn `h` trùng · không `key` trùng · `COLS.slice(-5).map(c=>c.h)` deep-equal `GATE_COLS` · **`GATE_COLS.length === 5`** · **`gSkipCols_().length === 5 hoặc 6`** và **`gSkipCols_() !== GATE_COLS`** (khác object) · **`xlBoCotXuat_().length === 5`** · **`COLS[colIndex('phong_ban')-1].role === 'auto'`** (nếu cột được thêm) · mọi `k` trong `MONEY_KEYS` tồn tại trong `COLS` · mọi khoá `COL_WIDTH` tồn tại trong `COLS` · với mọi `role:'calc'`, `col.f(5)` trả chuỗi bắt đầu `'='` và mọi `C(...)` bên trong không throw · số cột `role:'input'` khớp số cột `_snapshot`.
   - `test_kyLuong()` — `kyLuongHienTai_()` ở biên năm: `KY_LUONG` trống + hôm nay 1/1 → `'2025-12'` (nhờ `setDate(1)` trước `setMonth`, `Gate:320-321`).
   - `test_serialize()` — `plSerialize_` không để lọt `Date`/`undefined`/`NaN`.
5. **Baseline:**
   - `test_chupBaseline()` → ghi tab ẩn `_test_baseline` dạng **bảng** (không nhồi JSON 1 ô): `COLS.length` + mảng nhãn hàng 1 · số NV + danh sách mã đã sort · **15 tổng cột `MONEY_KEYS`** (đã `Math.round`) · mọi ô `role:'input'` khác rỗng (`mã|nhãn = giá trị`) · mọi ô tick `true` (`mã|nhãn`) · nhãn hàng 1 của `_snapshot` · danh sách `id` `_outbox` + số khoá `payload.phieu` · `matchPct`+`bqCount` của `doiSoatLuong()` gần nhất.
   - `test_soSanhBaseline()` → tính lại, in diff theo 7 mục trên.
   ⚠ **ĐẠT không phải là "diff rỗng"** mà là **"diff đúng bằng danh sách kỳ vọng của task"** — bảng kỳ vọng ở mục 4.3.
6. **Nhóm B — đọc thật:** `test_toanVenBang()` (9 assert, xem mục 4.5) và **`test_demTheoTeam()`** (G3-S1a — đếm phân bố cột `Team` của 98 dòng, chỉ đọc, an toàn trên production). Các test B khác thêm ở task tương ứng.
7. **Menu ẩn:** `onOpen` chỉ thêm mục `🧪 Chạy test` khi `PropertiesService.getScriptProperties().getProperty('PL_DEV') === '1'`. Chị Trang không bao giờ thấy.

**Không được đụng:** không sửa logic nghiệp vụ ở task này. Chỉ thêm file mới + 3 dòng menu ẩn trong `onOpen`.

**Tiêu chí đạt:**
- Mở `PhieuLuongTest.gs` trong editor → dropdown Run liệt kê `chayTestThuan`, `chayTestDocThat`, `test_chupBaseline`, `test_soSanhBaseline`.
- `chayTestThuan()` in `[ĐẠT] × N`, chạy < 3 giây.
- `test_chupBaseline()` tạo tab `_test_baseline` có 98 dòng dữ liệu.
- Chạy `test_soSanhBaseline()` ngay sau `test_chupBaseline()` → diff **rỗng**.

**Bẫy đã biết:**
- Dropdown Run chỉ liệt kê hàm của **file đang mở** ⇒ mọi test phải nằm trong **1 file duy nhất**.
- Test **không viết công thức** vào sheet — locale tiếng Việt dùng `;` không phải `,`.
- Không mock `SpreadsheetApp`, không test API Google, không test màu/pixel (giữ tiêu chí tối ưu token).

**Phụ thuộc:** G3-T2.

---

### G3-S1 — [spike, 15'] Đo phân bố nhóm (S1a) + đo `departments` trong BQ (S1b)

> ⚠ **Đã thay hẳn phần khảo cổ sheet HRIS.** Lý do: `payroll.C_view_bang_luong_truoc_thue` — view mà `BQ_SQL` (`BangLuong.gs:49`) **đang SELECT** — **đã có cột `departments`** (`bq-schema-baseline.json:73-78`), và bảng nguồn `C_raw_staff_info_merged` (`:2`) chứng minh 7 bảng rời của sheet HRIS **đã được merge từ trước**. Số liệu đã đo của sheet HRIS nằm ở **mục 1b** — không đo lại.
>
> **Tính năng xuất KHÔNG phụ thuộc kết quả spike này.** Nếu S1b ra rác, ship xuất theo `team` không cần cột phụ.

**File & vị trí:** `PhieuLuongTest.gs` — `test_demTheoTeam()` (nhóm B, **giữ vĩnh viễn**). S1b chạy trực tiếp trên BigQuery console.

**S1a — đếm `team` trên bảng lương (10', chỉ đọc, an toàn trên production).**
`test_demTheoTeam()` đọc cột `Team` của 98 dòng, in `giá trị → số người` sort giảm dần, `|Set(team)|`, số ô rỗng, `max/98`. Đây là **phân bố nhóm sau khi mồi**, đo được **ngay bây giờ**, 0 phụ thuộc.

| Kết quả | Quyết |
|---|---|
| `\|Set\|` 6–12, nhóm lớn nhất ≤ 60%, 0 ô rỗng | **GO** — mồi bằng `team` |
| nhóm lớn nhất > 60% | GO nhưng ghi vào HDSD: chị Trang **nên** chia nhỏ nhóm đó bằng cách gõ ô vàng ngay ở lần mồi đầu |
| có ô `Team` rỗng | xác nhận lỗ `COALESCE` (`:28` chỉ bắt NULL) ⇒ lớp ép `'' → 'Khác'` là **bắt buộc** (I21) |
| xuất hiện `team` ngoài 9 giá trị của `CASE :19-28` | điều tra — `workplace` đã đổi cách ghi |

**S1b — một query BQ (5').**
```sql
SELECT departments, COUNT(*) FROM `pf-salary.payroll.C_view_bang_luong_truoc_thue`
GROUP BY 1 ORDER BY 2 DESC;

SELECT COUNT(*) FROM `pf-salary.payroll.C_raw_staff_info_merged`
WHERE COALESCE(TRIM(departments),'')='' AND work_status='ON';
```
Query 2 trả lời dứt điểm câu **"trống ≠ đã nghỉ"** bằng **số**, không bằng suy đoán từ 2 mã HCM (mục 1b.3). `work_status` + `last_working_day` có ở `bq-schema-baseline.json:40-41`.

**Không được đụng:** không ghi gì vào sheet nào. Chỉ đọc.

**Tiêu chí đạt:**
- S1a in đủ: bảng `team → số người`, `|Set|`, số ô rỗng, tỷ lệ nhóm lớn nhất. Ghi vào mục 9.
- S1b in bảng `departments → số người` của **98 dòng bảng lương** (khác tập với 105 dòng HN của sheet, mục 1b.2) + số NV `ON` mà trống bộ phận.
- **Cổng:** `departments` rỗng/rác ⇒ **bỏ cột `Phòng ban (HRIS)`** khỏi plan này (xoá Q1e + dòng `t.departments` trong `BQ_SQL`), ship xuất theo `team` không cần cột phụ. Ghi quyết định vào mục 9.
- Trả lời riêng: **`HN1000` (Trần Thị Nhung) có xuất hiện trong 98 dòng BQ không?**
- **Nếu `HN1000` KHÔNG có trên bảng lương** → mọi ca mẫu HN1000 trong plan này vô hiệu; thay bằng một mã thật, ghi vào mục 9.

**Bẫy đã biết:**
- `PHIEU_LUONG_CONTRACT.md:97-98`: HN1000 là **NV ảo tách từ HN0001**, *"Không có trong HRIS, chỉ bảng thuế"* → khả năng cao không có dòng trên Bảng lương.
- Bản đếm `departments` của BQ có thể **khác cả hai bản đếm đã biết** (sheet HRIS mục 1b.2, và `PLAN_M4_MODULE_PHIEU_LUONG_2026-08-14.md:54`). Khác **không phải lỗi** — đó chính là lý do cột này chỉ để đối chiếu (Q1e), không cầm lái.
- Mã trùng: luật **dòng cuối thắng**, nhưng **phải đếm và in ra**, không im lặng. Nay áp cho `_snapshot`, không cho HRIS.

**Phụ thuộc:** G3-T3. **[song song với S2, S3, S4]**

---

### G3-S2 — [spike, 30'] OAuth scopes + cấp quyền lại

**Mục tiêu:** khai tường minh scope để export và đọc Doc chạy được, và **khôi phục trigger sau khi grant bị huỷ**.

**File & vị trí:** `docs/apps-script/appsscript.json` (đã có từ G3-T0).

**Việc phải làm:**
1. Sửa manifest:
   ```json
   "timeZone": "Asia/Ho_Chi_Minh",
   "oauthScopes": [
     "https://www.googleapis.com/auth/spreadsheets",
     "https://www.googleapis.com/auth/drive",
     "https://www.googleapis.com/auth/documents",
     "https://www.googleapis.com/auth/script.external_request",
     "https://www.googleapis.com/auth/bigquery",
     "https://www.googleapis.com/auth/script.container.ui"
   ]
   ```
2. Chạy 1 hàm bất kỳ → Google hỏi cấp quyền → chị Trang bấm Cho phép.
3. **Chạy lại `installGateTriggers`** — đây là bước dễ quên nhất và bỏ qua = cổng gửi phiếu chết cả kỳ.
4. Tick 1 ô `Xác nhận thông tin` ở dòng NV test → phải thấy toast.
5. Tick `Gửi BL trước thuế` cùng dòng → mở `📋 Mở hàng đợi` → phải có **dòng mới**.
6. Commit manifest vào git.

**Không được đụng:** không thêm scope ngoài 6 cái trên. Không sửa `.gs` nào.

**Tiêu chí đạt:**
- Dialog cấp quyền liệt kê **Drive + Docs + BigQuery + kết nối bên ngoài**. Chỉ hỏi Spreadsheets ⇒ manifest chưa nhận, kiểm lại JSON.
- Bước 5 tạo dòng mới trong `_outbox` trong ≤5 giây. **Không có dòng mới ⇒ DỪNG TOÀN BỘ PLAN** — cổng gửi phiếu chết là sự cố production.

**Bẫy đã biết:**
- ⚠ **Đổi scope làm MẤT HIỆU LỰC grant hiện tại ⇒ installable trigger `guiPhieuOnEdit` NGỪNG CHẠY** cho tới khi cấp quyền lại **và** chạy lại `installGateTriggers`. → **Làm task này NGOÀI cửa sổ chốt lương** (đề xuất ngày 8–20 hàng tháng; hạn phiếu là 23:59 mùng 4 theo `TODO_2026-08-17.md:22`).
- `Utilities.formatDate` lấy timezone từ manifest — thiếu `"timeZone"` là lệch ngày.
- Lập luận "quyền đã có sẵn vì `openById` (`BangLuong.gs:154`) đã chạy production" **chỉ đúng cho đọc spreadsheet**. `UrlFetchApp.fetch` tới URL bất kỳ **không tự kéo theo scope Drive** ⇒ token Bearer thiếu quyền ⇒ endpoint export trả **trang HTML đăng nhập kèm HTTP 200**.

**Phụ thuộc:** G3-T0. **[song song với S1, S3, S4]**

---

### G3-S3 — [spike, 45'] Đo cơ chế export + đường tải file

**Mục tiêu:** trả lời 3 câu hỏi có/không **trước khi** viết 6 hàm export.

**File & vị trí:** hàm tạm trong `PhieuLuongTest.gs`.

**Việc phải làm — 3 thí nghiệm, ghi kết quả vào mục 9:**

**(a) Tải file về máy — đúng hình dạng UI sẽ dùng.** Mở `showModalDialog` chứa **thẻ `<a>` do server sinh, người dùng TỰ BẤM**:
```html
<a href="data:text/plain;base64,SGVsbG8gVFQ=" download="test.txt">Tải file thử (10 byte)</a>
```
Bấm trên máy **chị Trang**. → File có rơi vào thư mục Tải xuống không?
⚠ **KHÔNG** test bằng `window.open()` trong `withSuccessHandler` — đó là hình dạng sẽ **fail production mà spike vẫn pass**.

**(b) Đo thời gian N-spreadsheet.** Tạo 11 spreadsheet tạm, mỗi cái 1 tab 10 dòng, `fetch('.../export?format=xlsx')` (**không** kèm `gid`) + `Authorization: Bearer ScriptApp.getOAuthToken()`, trash hết. → Tổng bao nhiêu giây?

**(c) Kiểm blob thật.** Lưu 1 blob ra Drive → **mở bằng Excel** (không phải Google Sheets). → Excel mở được, hay báo "định dạng hỏng"?

**Không được đụng:** không chạm dữ liệu bảng lương. Mọi file tạo ra phải trash trước khi kết thúc.

**Tiêu chí đạt — 3 câu trả lời rõ ràng + quyết định nhánh:**

| Kết quả | Quyết định |
|---|---|
| (a) tải được | Dùng data URI + thẻ `<a>`. |
| (a) KHÔNG tải được | Nhánh B: ghi file vào folder Drive → server trả `getUrl()` → client render `<a href="<url>" target="_blank">`, **chị tự bấm**. **Không bao giờ** trả URL export kèm OAuth token ra client. |
| (b) ≤ 150s | Cơ chế chính = **N spreadsheet tạm**, xlsx đúng định dạng. Guard: >12 nhóm → **chia mẻ** (lưu con trỏ `ScriptProperties`, dialog báo "Đã xuất 12/18 nhóm, bấm lần nữa"). |
| (b) > 150s | Fallback: **CSV per nhóm** — `export?format=csv&gid=<gid>` trên **1 SS nhiều tab** (`gid` **CÓ** tác dụng với csv), blob phải có **BOM UTF-8** (`﻿`) để Excel đọc đúng tiếng Việt. Mất định dạng/freeze, đổi lấy tốc độ. Ghi rõ trade-off vào mục 9. |
| (c) Excel báo hỏng / mở ra là trang HTML | Quay lại G3-S2 — token thiếu scope Drive. **Không đi tiếp.** |

**Bẫy đã biết:**
- ⚠ **`export?format=xlsx&gid=…` KHÔNG thu hẹp về 1 tab** — `gid` chỉ có tác dụng với `csv`/`tsv`/`pdf`. Vì thế Q4b đã **bỏ hẳn** cơ chế đó. Nếu ai đó đề xuất lại: hậu quả là mọi file trong ZIP chứa **toàn bộ 98 người**, tên file khác nhau, và không invariant nào đếm-mảng bắt được.
- ⚠ **Tuyệt đối không** dùng vòng lặp "1 SS dùng lại: `clearContents` → ghi nhóm mới → `flush()` → fetch **cùng một URL**". Endpoint export cache theo revision, revision lan chậm hơn `flush()` ⇒ fetch lần 2 có thể trả nội dung lần 1 ⇒ file tên "Inhouse 2" chứa lương "Inhouse 1", số file đúng, tổng dòng đúng.
- `SpreadsheetApp.create()` vừa xong mà fetch ngay có thể gặp race Drive chưa index → blob rỗng/HTML. Nếu (c) thất bại không ổn định, thêm `Utilities.sleep(1500)` sau `create` và đo lại.

**Phụ thuộc:** G3-S2. **[song song với S1, S4]**

---

### G3-S4 — [spike, 20'] Đọc tag từ Doc phiếu mẫu

**Mục tiêu:** in ra **danh sách tag thật** của Doc mẫu — không có nó thì G3-T8/T9 không tự chứa được.

**File & vị trí:** hàm tạm trong `PhieuLuongTest.gs`; Doc `1Jd0TvdJvh7EwsqvPXKyEoLdCDQHXXC_hjmS0TzIN3hs`.

**Việc phải làm:**
1. Quét **cả 3 vùng**, mỗi vùng có thể `null`:
   ```js
   var doc = DocumentApp.openById(PX_DOC_ID);
   var parts = [doc.getBody(), doc.getHeader(), doc.getFooter()];
   var txt = parts.map(function(p){ return p ? p.getText() : ''; }).join('\n');
   var raw = txt.match(/<<([^>]+)>>/g) || [];
   var tags = raw.map(function(s){ return s.slice(2, -2).trim(); });
   ```
2. In: danh sách tag **theo đúng thứ tự trong Doc**, tag nào ở header/footer, tag nào **không khớp** nhãn cột nào trong `COLS`.
3. **Dán danh sách tag thật vào mục 9 của file plan này** — G3-T8 sẽ đọc từ đó.
4. Điền hằng `PV_TAG_ALIAS` (map tag → nhãn cột), ví dụ `{'Họ tên':'Name'}`.

**Không được đụng:** không sửa Doc ở task này (việc sửa tag lỗi là bước tay riêng, xem mục 7 câu hỏi #4).

**Tiêu chí đạt:**
- Log in ≥10 tag. Danh sách được dán vào mục 9.
- Xác định rõ tag `<<Khấu trừ thuế tháng 05>>` còn tồn tại không (`PHIEU_LUONG_CONTRACT.md` nhắc đây là tag lỗi).
- Với mỗi tag mồ côi, ghi nhãn cột tương ứng vào `PV_TAG_ALIAS`, hoặc đánh dấu "không có cột tương ứng".

**Bẫy đã biết:**
- ⚠ `DocumentApp.Body.getText()` **KHÔNG** bao gồm header/footer/footnote. Phiếu lương mẫu rất hay để tháng/tên/logo ở header ⇒ bỏ sót là preview thiếu dòng **và** PDF ship `<<Tháng>>` sống nguyên trên đầu trang.
- ⚠ `String.prototype.match` với cờ `g` **bỏ capture group** — trả `["<<Họ tên>>"]` chứ không phải `["Họ tên"]`. Bắt buộc `.slice(2,-2)`.
- ⚠ `docs/plans/PLAN_PHIEU_LUONG_APPSCRIPT_2026-08-17.md:38` ghi rõ phải map `"Họ tên"→"Name"` ⇒ **tag Doc ≠ tên cột ngay từ tag đầu tiên**. Đừng giả định chúng khớp.

**Phụ thuộc:** G3-S2 (cần scope `documents`). **[song song với S1, S3]**

---

### G3-T4 — [song song] Fix FE `PayslipDetail.tsx` (P0, độc lập Sheet)

**Mục tiêu:** sửa 3 lỗi hiển thị đang xảy ra trên **98 phiếu production ngay lúc này**.

**File & vị trí:** `frontend/src/components/payslip/PayslipDetail.tsx` — `PAYSLIP_BLOCKS:9-22`, `HEADER_KEYS:24`, `KEY_NORMALIZE:26-42`, `PREFIX_KEYS:44`, `formatValue:66-70`.

**Việc phải làm (4 sửa, KHÔNG đụng `PAYSLIP_BLOCKS`):**

1. **`KEY_NORMALIZE` `:26-42`** — thêm dòng:
   ```ts
   "Tổng lương + thưởng (Net)": "Tổng lương + thưởng",
   ```
   *Truy vết lỗi:* header sống là `"Tổng lương + thưởng (Net)"` (`BangLuong.gs:71`) → `KEY_NORMALIZE` chỉ có biến thể **không dấu** `"Tong luong + thuong"` và `"Luong_thanh_toan (Net)"` → block 6 (`:21`) khớp `===` với `"Tổng lương + thưởng"` → không khớp → `PREFIX_KEYS` chỉ có `"Khấu trừ thuế"` → rơi khối **"Khác"** (`:130-150`), tức ô xám cuối phiếu, **dưới cả "Tổng tiền"**. Sửa ở `KEY_NORMALIZE` (không ở `PAYSLIP_BLOCKS`) để **payload cũ đã lưu trong DB vẫn render đúng**.

2. **`HEADER_KEYS` `:24`** — thêm `"Mã NV"`, `"Team"`, `"Loại NV"` (hiện chỉ có `STT`, `Name`, `Chức danh` → 3 cột kia đang lộ ở "Khác").

3. **`PREFIX_KEYS` `:44`** — thêm `"Ghi chú"` để `"Ghi chú thưởng nóng"` (`BangLuong.gs:89`) vào block "Thuế + Bù tiền".

4. **`formatValue` `:66-70`** — giữ thập phân **theo whitelist khoá**, KHÔNG theo kiểu dữ liệu:
   ```ts
   const KEEP_DECIMAL = new Set(["Công", "Tỉ lệ đạt KPI", "% Com ≥100%"]);
   function formatValue(val: unknown, key?: string): string {
     if (val === null || val === undefined || val === "") return "—";
     if (typeof val === "number") {
       if (key && KEEP_DECIMAL.has(key)) return val.toLocaleString("vi-VN");
       return formatVndNumber(val) || String(val);
     }
     return String(val);
   }
   ```
   Truyền `r.dataKey` / `k` vào từ 2 call site (`:121` và `:143`).
   ⚠ **KHÔNG** dùng `Number.isInteger(val)` làm điều kiện — `LCB theo ngày công` = `luong_co_ban/24*cong`, với `cong=23.5` ra số **không nguyên** ⇒ mọi cột tiền lẻ sẽ hiện `11.260.416,667` thay vì `11.260.417`, trên **cả phiếu cũ**.

**Không được đụng:** `PAYSLIP_BLOCKS` (đổi nó là đổi bố cục phiếu production) · `vndFormat.ts` (`formatVndNumber` dùng nhiều nơi khác) · backend.

**Tiêu chí đạt:**
- `cd frontend && npx tsc -b` không lỗi (⚠ dùng `tsc -b`, **không** `--noEmit` — Vercel chạy `tsc -b`).
- `cd frontend && npm run test` pass như trước.
- Mở 1 phiếu **đã gửi** trong app: `Tổng lương + thưởng (Net)` nằm trong khối **"Tổng tiền"**; khối "Khác" **không hiển thị**.
- Mở phiếu **Đào Phương Thảo** (công 23.5, `PHIEU_LUONG_CONTRACT.md:101`): ô `Công` hiện **`23,5`**; ô `LCB theo ngày công` vẫn hiện số nguyên có dấu chấm.
- Phiếu có `Ghi chú thưởng nóng` → nằm trong khối "Thuế + Bù tiền".

**Bẫy đã biết:**
- `formatVndNumber` (`vndFormat.ts:11-14`) làm `Math.trunc` **và** trả `""` khi `n` falsy → `formatVndNumber(0)` trả `""`, được `|| String(val)` cứu thành `"0"`. Giữ nguyên chuỗi `|| String(val)`.
- Nhánh `if (!("Note" in raw)) result["Note"] = "—"` (`:52`) là **nhánh chết** — header sống là `Bảo hiểm` (`BangLuong.gs:78`) chứ không phải `Bảo hiểm + note`. Đừng dựa vào nó.
- `formatValue` trả `"—"` nhưng **không bao giờ chạy tới** với `""`/`null`, vì `:106` và `:132` đã lọc trước. Đây là căn cứ của Q5e.

**Phụ thuộc:** G3-T0. **[song song với mọi task Sheet]**

---

### G3-T5 — ~~REMOVED~~ Khởi tạo `PhongBanXuat.gs` — config + hàm tiện ích

> **⚠ THAY ĐỔI (lần 3):** `nhMoi_` (logic mồi `Nhóm gửi`) không còn cần — khoá gom là `team` đã có sẵn. Task này thu nhỏ còn **tạo file + hàm tiện ích dùng chung**.

**Mục tiêu:** tạo `PhongBanXuat.gs` với config, hàm NORM/CANON, `plSerialize_`, và hai hàm lọc cột riêng biệt.

**File & vị trí:** `docs/apps-script/PhongBanXuat.gs` (**tạo mới**).

**Việc phải làm:**

1. **Config — hàm lazy, KHÔNG hằng số top-level tham chiếu file khác** (I16):
   ```js
   var PB_CFG = {
     khac:      'Khác',
     tmpPrefix: '__PL_TMP_',
     propKey:   'PL_TMP_IDS',
   };
   // HAI hàm RIÊNG — cấm dùng chung một hằng (Q4f / I23)
   function gSkipCols_(){  return GATE_COLS.concat(['Phòng ban (HRIS)']); } // payload phiếu — 6 (hoặc 5 nếu không thêm PB)
   function xlBoCotXuat_(){ return GATE_COLS.slice(); }                      // file Excel — 5 (giữ team, Phòng ban, Mã NV)
   ```

2. **Hai hàm chuẩn hoá** (đặt tên có prefix `pb` để tránh va chạm namespace):
   ```js
   function pbNorm_(s){ return String(s==null?'':s).replace(/\u00a0/g,' ').trim().replace(/\s+/g,' '); }
   function pbCanon_(s){
     return pbNorm_(s).replace(/[-_\/]+/g,' ').replace(/\s+/g,' ').toLowerCase()
       .normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\u0111/g,'d');
   }
   ```
   ⚠ `\u0300-\u036f` là dải combining diacritics (Unicode escape, không ký tự tổ hợp literal). `d` với gạch ngang (`\u0111` = đ) là base char, NFD không tách ⇒ phải thay riêng.

3. **`plSerialize_(o)`** — đệ quy: `Date` → `Utilities.formatDate(v,'Asia/Ho_Chi_Minh','dd/MM/yyyy')`, `undefined`/`NaN` → `null`. ⚠ **CẤM** `date.toISOString()` (ra UTC → lệch −7h).

**Không được đụng:** `BangLuong.gs` · `PhieuLuongGate.gs` · `COLS`.

**Tiêu chí đạt:**
- `grep -n "openById\|SpreadsheetApp.open" docs/apps-script/PhongBanXuat.gs` → **0 kết quả** (I22).
- `grep -n "^var .*=.*GATE_COLS" docs/apps-script/PhongBanXuat.gs` → **0 kết quả** (I16).
- `gSkipCols_().length===5 hoặc 6` · `xlBoCotXuat_().length===5` · `gSkipCols_() !== xlBoCotXuat_()` (I23).
- `test_serialize()` pass.

**Phụ thuộc:** G3-T3.

---

### G3-T6 — Chèn cột `Phòng ban (HRIS)` vào `COLS` (tùy chọn, sau G3-S1b)

> **⚠ THAY ĐỔI (lần 3):** Bỏ hoàn toàn cột `Nhóm gửi`. Task này chỉ thêm `Phòng ban (HRIS)` — **chỉ làm nếu G3-S1b xác nhận `t.departments` có dữ liệu tốt**. Nếu S1b ra rác → bỏ qua task này, xuất theo `team` không cần cột phụ.

**Mục tiêu:** `Phòng ban (HRIS)` xuất hiện trên bảng nền **trắng**, chỉ để đối chiếu, không tham gia bất kỳ logic chia file nào.

**File & vị trí:** `docs/apps-script/BangLuong.gs` — `BQ_SQL:29`, `COLS:69`, `COL_WIDTH:330-333`.

**Việc phải làm:**

| Anchor | Sửa |
|---|---|
| **`BQ_SQL`**, sau dòng field cuối cùng trước `FROM` | Thêm `"  t.departments,"`. **Chỉ thêm 1 field SELECT**, không đụng `CASE ... AS team` (:18-28), không đụng `ORDER BY` (:52). `queryBigQuery_:390-398` map theo tên field động ⇒ zero-risk |
| `COLS` — ngay sau `{ key:'employee_type' }` (`:69`) | Chèn `{ key:'phong_ban', h:'Phòng ban (HRIS)', role:'auto', src:'departments' },` — **ngoài** vùng freeze |
| `COL_WIDTH` | Thêm `phong_ban:110` |
| `PhieuLuongGate.gs:54` | Đổi `gSkipCols_()` thành `function gSkipCols_(){ return GATE_COLS.concat(['Phòng ban (HRIS)']); }` — **hàm lazy** (I16). Comment: `// ⚠ CẤM .push lên GATE_COLS` |

**Không được đụng:** `CASE ... AS team` (`:18-28`) · `ORDER BY` (`:52`) · `GATE_COLS` · mọi logic `_snapshot` · `MONEY_KEYS`.

**Tiêu chí đạt** (trên **bản sao** trước):

| # | Kiểm | ĐẠT khi |
|---|---|---|
| 1 | `test_chupBaseline()` trước, refresh, `test_soSanhBaseline()` sau | Diff **chỉ có**: `+1 header ('Phòng ban (HRIS)')`. **0 ô input tay đổi, 0 tick mất, 15/15 tổng tiền không đổi** |
| 2 | Nhìn cột `Phòng ban (HRIS)` | Nền **TRẮNG** (role:'auto'). Vàng = đặt nhầm role:'input' — **dừng** |
| 3 | Freeze | **6 cột** (không đổi — `colIndex('employee_type')` động) |
| 4 | Tick `Xác nhận thông tin` + `Gửi BL trước thuế` → `_outbox` | `JSON.parse(...).phieu['Phòng ban (HRIS)'] === undefined` |
| 5 | `doiSoatLuong()` so `matchPct` với baseline | **Bằng chính xác** |

**Bẫy đã biết:**
- ⚠ Thêm cột kích hoạt `layoutChanged` (:240-241) ⇒ nếu G3-T2 chưa vá `snapMap={}` (:246) thì lần refresh đầu **nuốt sạch** `Thưởng COM`/`Xe+PC`/`Bù tiền`. **Phụ thuộc G3-T2 là cứng.**
- ⚠ `gSkipCols_()` phải là hàm lazy `.concat`, **không** `.push` lên `GATE_COLS` (I5).

**Phụ thuộc:** **G3-T2 (cứng)**, G3-T5, G3-S1b.

---

### G3-T7 — Tách `gBuildPhieu_` khỏi `gEnqueueRow_`

**Mục tiêu:** có hàm thuần dựng dict phiếu, dùng chung cho enqueue + preview + export, không đổi một byte payload.

**File & vị trí:** `docs/apps-script/PhieuLuongGate.gs:136-141`.

**Việc phải làm:**
1. Thêm hàm **thuần, 0 I/O**, **nhận mảng — KHÔNG nhận `(sh, row)`**:
   ```js
   function gBuildPhieu_(headers, vals, skipCols){
     var phieu = {};
     for (var c = 0; c < headers.length; c++) {
       var h = String(headers[c] || '').trim();
       if (!h || skipCols.indexOf(h) >= 0) continue;
       phieu[h] = vals[c];
     }
     return phieu;
   }
   ```
   ⚠ Chữ ký nhận mảng vì export 98 người bằng `(sh,row)` tốn ~300 lời gọi `getRange`.
2. `gEnqueueRow_` `:136-141` → thay bằng `var phieu = gBuildPhieu_(headers, vals, gSkipCols_());` — ⚠ truyền **hàm gọi ra mảng mới**, KHÔNG truyền hằng top-level (I16).
3. Thêm assert `if (GATE_COLS.length !== 5) throw 'GATE_COLS bị đổi độ dài — kiểm tra .push nhầm';` ở đầu `guiPhieuOnEdit` (`:62`) **và** đầu `gEnqueueRow_` (`:124`).

**Không được đụng:** `payload` object (`:142-149`) · `meta` · logic upsert `:151-159` · `OUTBOX_HEADERS`.

**Tiêu chí đạt:**
- **Trước** refactor: tick gửi 1 NV test → copy ô `payload_json` ra file tạm.
- Sau refactor: xoá dòng `_outbox` đó, tick gửi lại **cùng NV** → chuỗi mới.
- So 2 chuỗi phải **byte-identical**. (So bằng ô `=EXACT(A1;B1)` — ⚠ locale tiếng Việt, dấu `;`.)
- `test_dictPhieu()` (nhóm A) pass: không khoá nào ∈ `GATE_COLS` · không khoá `'Phòng ban (HRIS)'` · header rỗng `''` không tạo khoá · `'Tổng lương + thưởng (Net)' in phieu` · `JSON.stringify(phieu)` === golden string hằng.

**Bẫy đã biết:**
- `gHeaderMap_` (`Gate:331`) `if (h && !(h in m))` lấy nhãn **TRÁI** khi trùng; `gBuildPhieu_` gán `phieu[h]=` lấy **PHẢI**. Nhãn trùng = payload sai âm thầm ⇒ `plAssertHeadersUnique_` (G3-T2) là chốt chặn.
- `gHeaderAt_` (`:336`) duyệt `hmap` ⇒ cột trùng nhãn thứ hai trả `null` ⇒ `guiPhieuOnEdit` return im lặng ⇒ **checkbox gate ở cột đó chết câm**. Rủi ro tồn dư, ghi vào mục 6.

**Phụ thuộc:** G3-T6.

---

### G3-T8 — Preview: phần server (`PhieuLuongXem.gs`)

**Mục tiêu:** một lời gọi nạp đủ dữ liệu cho modal preview, không trả `Date`, không trả row index.

**File & vị trí:** `docs/apps-script/PhieuLuongXem.gs` (**tạo mới**).

**Việc phải làm:**

| Hàm | Chữ ký | Trách nhiệm |
|---|---|---|
| `xemTruocPhieuLuong` | menu | `plAssertHeadersUnique_` → `showModalDialog(HtmlService.createTemplateFromFile('PhieuLuongXem'), 900, 640)`; truyền `code` của dòng đang chọn (`getActiveRange().getRow()`); dòng không hợp lệ → lấy NV đầu bảng, **không alert chặn** |
| `pvNapDuLieu` | `() → {ky, tags, tagsOk, tagNguon, alias, danhSach, duLieu, daGuiIndex}` | **1 `getValues()`** toàn bảng + `pvDocTags_()` + đọc `_outbox` **chỉ cột 1-6** (id, code, name, ky, stage, status) — **KHÔNG** đọc `payload_json` ở đây (nặng). Mọi giá trị qua `plSerialize_` |
| `pvDocTags_` | `() → {tags, ok, tagNguon}` | Quét `getBody()` + `getHeader()` + `getFooter()` (mỗi cái có thể `null`), regex `/<<([^>]+)>>/g`, `.slice(2,-2).trim()`. Lỗi → `{tags:[], ok:false}` |
| `pvDungPhieu_` | `(tags, alias, headers, vals) → {dong, conLai, moCoi, boTrong, fallback}` | **HÀM THUẦN.** `dong` theo **đúng thứ tự tag Doc**; tag không khớp cột → `moCoi`; cột không có tag → `conLai`; ô `''`/`null` → `boTrong` (không render); 5 cột gate không xuất hiện ở đâu cả; `'Phòng ban (HRIS)'` vào `conLai`. `tags=[]` → `fallback:true`, `dong` = mọi cột không rỗng theo thứ tự `COLS` |
| `pvFmt_` | `(val, key) → String` | Đồng bộ với `formatValue` sau G3-T4: `Date`→`dd/MM/yyyy`; số trong `KEEP_DECIMAL` → `toLocaleString('vi-VN')`; số khác → `#.###`; `''`/`null` → trả cờ **BỎ DÒNG** |
| `pvBanDaGui` | `(id) → {phieu, status, sentAt}` | ⚠ Nhận **`id` (`code\|ky\|stage`)**, tra bằng `gOutboxIndex_()` (`Gate:360`), đọc đúng 1 ô `payload_json`. Gọi **lười** (chỉ khi bấm nút) |
| `PV_TAG_ALIAS` | hằng | Map tag Doc → nhãn cột, điền từ G3-S4 |

**Không được đụng:** `BangLuong.gs` (trừ 2 dòng menu ở G3-T13) · `PhieuLuongGate.gs` · không GHI gì vào sheet.

**Tiêu chí đạt:**
- `test_docTagPhieuMau()` (nhóm B) in danh sách tag theo thứ tự Doc + danh sách `moCoi`.
- `test_dungPhieuTheoTag()` (nhóm A) 8 assert, đặc biệt **định luật bảo toàn**: `|dong| + |conLai| + |boTrong| + 5 === COLS.length`.
- `pvNapDuLieu()` chạy < 6 giây với 98 NV.
- `JSON.stringify(pvNapDuLieu())` không chứa chuỗi `"T00:00:00"` (bằng chứng không lọt ISO/UTC).
- `test_soSanhBaseline()` sau khi gọi `pvNapDuLieu()` → diff **rỗng** (preview không được GHI vào bảng).

**Bẫy đã biết:**
- ⚠ **CẤM truyền row index qua ranh giới client/server.** Menu `📋 Mở hàng đợi` (`Gate:276-280`) **hiện tab `_outbox` cho chị Trang** — chị xoá 1 dòng `failed` cho gọn là dialog đang mở đọc nhầm dòng ⇒ **hiện phiếu lương của người khác**, không dấu hiệu gì.
- ⚠ `google.script.run` **cấm kiểu `Date`** ⇒ request fail **câm** (không lỗi, không callback). Mọi return phải qua `plSerialize_`.
- ⚠ `getBody()` không bao gồm header/footer (xem G3-S4).
- Nhãn "Bản đã gửi" phải theo `status`: `sent` → `đã gửi <ngày>`; `pending` → `đang chờ gửi`; `failed` → `gửi lỗi — CHƯA tới NV`. Hiện `gateToken` rỗng ⇒ nhiều dòng có thể là `failed`.

**Phụ thuộc:** G3-T7, G3-S4.

---

### G3-T9 — Preview: phần client (`PhieuLuongXem.html`)

**Mục tiêu:** modal chị Trang lướt được 98 phiếu, thấy đủ mọi thứ sẽ gửi đi.

**File & vị trí:** `docs/apps-script/PhieuLuongXem.html` (**tạo mới**).

**Việc phải làm:**
1. **Vỏ:** modal 900×640. Thanh trên: dropdown `Mã NV — Tên` + nút ◀ ▶. Đổi người = **0 RPC** (dữ liệu đã nạp sẵn).
2. **Phần A — thư theo phiếu mẫu:** tiêu đề tháng · "Kính gửi Anh/Chị {Name}" · bảng 2 cột theo `dong` (đúng thứ tự tag Doc) · footer HR (`Ms. Thu Trang – 0988.934.163 / palfishrecruitment@gmail.com`, theo `TODO_2026-08-17.md:21`).
3. **Phần B — MỞ SẴN, badge đỏ:** `⚠ N cột NỮA sẽ gửi sang app mà phiếu mẫu không hiện` + bảng `conLai`. **Không thu gọn mặc định** (Q5b). Cho nút thu gọn nếu chị muốn.
4. **3 nút nguồn:** `Bản trên bảng hiện tại` (mặc định) / `Bản đã gửi — trước thuế` / `Bản đã gửi — sau thuế`. Chưa gửi → nút **xám, không bấm được**.
5. **Badge lệch:** khi xem bản live cạnh bản đã gửi, so 2 dict → `⚠ N ô đã đổi sau khi gửi` + tô vàng dòng lệch.
6. **Badge tầng suy từ dữ liệu:** `Khấu trừ thuế` = 0/trống → *"Bản này đang là TRƯỚC THUẾ"*; khác 0 → *"SAU THUẾ"*.
7. **Cảnh báo tag mồ côi:** nếu `moCoi.length` → dòng đỏ liệt kê: *"N mục trong phiếu mẫu không khớp cột nào: `<<...>>`"*.
8. **Fallback Doc lỗi:** `tagsOk===false` → banner vàng *"Không đọc được phiếu mẫu, đang hiện toàn bộ cột theo thứ tự bảng"* + vẫn render đủ.
9. **An toàn:** render 100% bằng `document.createElement` + **`textContent`**. ⚠ **CẤM `innerHTML`** — ô `Note` là chị Trang gõ tay, có `<`, `&`, `"` là vỡ layout hoặc tệ hơn.

**Không được đụng:** không thêm thư viện ngoài (CSP + không có CDN trong Apps Script sandbox). Không gọi RPC khi đổi người.

**Tiêu chí đạt:**

| # | Kiểm | ĐẠT khi |
|---|---|---|
| 1 | Bấm 1 ô ở dòng NV → menu `👁 Xem trước phiếu lương` | Modal mở đúng NV đang chọn |
| 2 | Bấm ◀▶ 5 lần | Đổi người **tức thì**, không spinner (có spinner ⇒ đang gọi RPC, sai thiết kế) |
| 3 | NV có ô `Note` trống | **Không có dòng "Note"** (KHÔNG hiện `Note —`) |
| 4 | NV có `Bù tiền = 0` | Hiện `Bù tiền  0` (số 0 không bị lọc như rỗng) |
| 5 | NV Đào Phương Thảo | `Công` hiện `23,5` |
| 6 | Gõ `<b>xin chào</b> & "test"` vào ô `Note` → mở preview | Hiện **nguyên văn** cả thẻ |
| 7 | Phần B | Badge đỏ hiện số cột dư, bảng **mở sẵn**. `|dong| + |conLai|` = số cột trong `payload_json` của cùng NV |
| 8 | NV **đã gửi** → bấm `Bản đã gửi — trước thuế` | Hiện dữ liệu đông cứng lúc gửi + nhãn ngày gửi |
| 9 | Sửa 1 ô tiền của NV đó → mở lại | Badge `⚠ 1 ô đã đổi sau khi gửi` + dòng tô vàng |
| 10 | NV **chưa gửi** | 2 nút "Bản đã gửi" **xám**, không lỗi |
| 11 | Đổi quyền Doc thành không xem được → mở preview | Banner vàng + **vẫn hiện phiếu**. (Nhớ trả lại quyền Doc) |
| 12 | Cross-check X3 (mục 4.2) trên 98 NV | `P_xem ≡ P_bảng` 98/98 |

**Bẫy đã biết:**
- ⚠ Doc có ~15 tag nhưng payload gửi app có **24 khoản** (`COLS.length 31 − 7 skip`). Nếu phần B bị thu gọn, chị lướt 98 phiếu sẽ **không bao giờ mở nó** ⇒ cột như `Ghi chú thưởng nóng` (`BangLuong.gs:89`, từ BQ, có thể chứa *"trừ 500k do đi muộn"*) lọt sang NV mà chị không thấy. Đây chính là sự cố preview sinh ra để chặn.
- Doc có tag **trùng** (vd `<<Tổng lương>>` 2 lần) → `dong` phải có **2 mục cùng nhãn**, khớp hành vi `replaceText` của PDF ở G3-T12.
- JS trong `.html` không chạy được từ dropdown Run ⇒ mọi logic chọn dòng/format đã tách sang `.gs` ở G3-T8 để test được.

**Phụ thuộc:** G3-T8, G3-T4 (để `pvFmt_` đồng bộ với app).

---

### G3-T10 — Export: phần server (`PhongBanXuat.gs`)

**Mục tiêu:** dựng được ZIP nhiều file xlsx (hoặc file gộp), đúng nội dung, không rác Drive.

**File & vị trí:** `docs/apps-script/PhongBanXuat.gs` (nối tiếp file đã tạo ở G3-T5).

**Việc phải làm:**

| Hàm | Chữ ký | Trách nhiệm |
|---|---|---|
| `xlDocBang_` | `() → {headers, rows, mauSo}` | 1 `getValues()`; bỏ cột thuộc **`xlBoCotXuat_()`** (⚠ **5 cột gate**, KHÔNG phải `gSkipCols_()` — file **giữ** `team`, `Phòng ban (HRIS)`, `Mã NV`; xem Q4f/I23); bỏ dòng thiếu Mã NV; **guard**: ô MONEY nào là chuỗi bắt đầu `'#'` (`#REF!`/`#N/A`) → throw *"Công thức chưa tính xong, chờ vài giây rồi bấm lại"* |
| `xlMauSo_` | `(bang) → Int` | **Hàm đếm DUY NHẤT.** Dialog và assert cùng gọi nó — cấm đếm 2 đường (I8) |
| `xlGomNhom_` | `(bang) → [{ten, canon, rows}]` | ⭐ **Khoá gom = cột `team`** (`BangLuong.gs:66`, `role:'auto'`). Đọc thẳng từ `allVals`, không có logic mồi. Ô rỗng/null → `String(v||'').trim()||'Khác'` (COALESCE `:28` chỉ bắt NULL — phải bịt ở tầng app). `CANON` = `trim` + gộp khoảng trắng trong + **`-`/`_`/`›`/`>`/`/` → khoảng trắng** + `toLowerCase` + bỏ dấu + `đ→d` (I26). Nhãn hiển thị = biến thể **NORM** xuất hiện **nhiều nhất**; thứ tự = **lần xuất hiện đầu trên bảng** (cột `team` ORDER BY `:52` → nhóm nằm **liền khối** ⇒ thứ tự file = thứ tự chị đang nhìn); ô rỗng ép về `(Chưa phân nhóm)`, luôn **cuối**, **ĐỎ**, **kỳ vọng 0 dòng** (I21). Nếu 1 khoá canonical có >1 nhãn gốc → trả cờ cảnh báo |
| `xlKiemTeam_` | `(bang) → [{giaTri, soNguoi}]` | Đọc `Set(team)`, so với **9 giá trị** của `CASE :19-28`. Giá trị ngoài set → **cảnh báo vàng** (X8). Không chặn — nếu Chung sửa CASE thêm nhánh mới, chỉ cảnh báo để cập nhật kiểm thử |
| `xlTenTab_` | `(ten, daDung[]) → String` | ⭐ **GIỮ DẤU** (xlsx là XML UTF-8) · thay `[ ] * ? / \ :` · **cắt 31 ký tự** (giới hạn tên **tab** của Excel, **không phải 100**) · cấm rỗng / `History` / `'` ở biên · khử trùng `~2` |
| `xlTenFile_` | `(ten, daDung[]) → String` | ⭐ **BỎ DẤU**: `.normalize('NFD').replace(/[̀-ͯ]/g,'')` ⚠ **escape, KHÔNG ký tự tổ hợp literal** · `.replace(/đ/g,'d').replace(/Đ/g,'D')` (đ là base char, NFD không tách) · mọi run ngoài `[A-Za-z0-9-]` → **một** `-` · **cắt 60** · khử trùng `~2`. ⚠ 31 là giới hạn tên **tab**, plan cũ áp nhầm cho cả tên file (I25) |
| `xlDungGoi_` | `(nhom[], ky, mode) → {tmpIds, tabs, blobs}` | Cơ chế theo kết quả G3-S3. **Ghi VALUES** (`getValues()`, không `getFormulas()`) · A1 = `<kỳ> — <tên nhóm>` (**nhãn có dấu**) · header `#0b5394` chữ trắng, freeze row 1 · `#,##0` theo `MONEY_KEYS` · STT đánh lại 1..n · **giữ cột `team`, `Phòng ban (HRIS)`, `Mã NV`** · **bỏ màu role** (file gửi ra ngoài) |
| **Tên file ZIP** ⭐ MỚI | — | `BL_<ky>_<NN>_<slug>.xlsx`, `NN` = **thứ hạng nhóm 2 chữ số** ⇒ File Explorer sort alphabet ra **đúng thứ tự bảng**. Ví dụ `BL_2026-08_02_Inhouse-1.xlsx`. **Lý do bắt buộc:** ngăn ca rò lương do **đính kèm nhầm file** — mọi tên file phải phân biệt được **ở 12 ký tự đầu sau tiền tố**, cấm nhiều file cùng tiền tố dài (`BL_2026-08_Kinh-doanh_*` × 5 là thiết kế hỏng) |
| `xlKiemBlob_` | `(blob, tenNhom) → void` | ① 4 byte đầu `= PK\x03\x04` (I9) ② `Utilities.unzip(blob)` → tìm `sharedStrings` → phải chứa **nhãn hiển thị lấy từ A1 (giữ dấu)**, **KHÔNG** tìm slug ASCII — tìm slug thì nhóm có dấu luôn trượt (I10+I25). Sai → **throw, KHÔNG tải** |
| `xlDonRac_` | `() → Int` | 3 lớp: `try/finally` trash · id ghi vào **`ScriptProperties`** (⚠ **không** `UserProperties` — file Drive thuộc người *chạy script*, rác của người này người kia không dọn được) · quét `DriveApp.searchFiles("title contains '__PL_TMP_'")`. Trả số file đã dọn |
| `xlThongKe` | `() → {ky, tong, soNhom, nhom:[{ten,so,cheo}], nhanMoi, canhBao}` | Client-callable, qua `plSerialize_`. `cheo` = bảng chéo `team × Phòng ban (HRIS)` của nhóm đó (chỉ hiển thị, **không chặn**) |
| `xlTaiZip` / `xlTaiMotFile` | `(ky, batch) → {filename, dataUri \| driveUrl, conLai}` | `LockService.getDocumentLock().tryLock(0)` đầu hàm; blob **phải `setName(xlTenFile_(ten, daDung) + '.xlsx')`** trước khi zip, theo khuôn `BL_<ky>_<NN>_<slug>.xlsx` |

**Không được đụng:** không GHI gì vào tab `Bảng lương` · không đụng `_outbox`/`_gate_state` · không đụng `COLS`.

**Tiêu chí đạt:**
- `test_gomNhom()` (nhóm A): 6 fixture × 5 assert — bảo toàn dòng, không trùng NV, `(Chưa phân nhóm)` cuối, thứ tự = lần xuất hiện đầu, `'Back office'`/`'Back Office '`/`'back office'` gộp **1 nhóm**, và **thêm** `'Back-office'` gộp **cùng nhóm đó** (I26). Fixture dùng giá trị `team` **thật** đo ở G3-S1a.
- `test_tenTabVaFile()` (nhóm A): 12 ca biên (mục 4.6) + **I25**: `xlTenTab_('Kế toán & Hành chính')` **giữ dấu** ≤31 · `xlTenFile_` cùng chuỗi ra `Ke-toan-Hanh-chinh` ≤60 · **va chạm sau sanitize** `'A/B'` vs `'A:B'` → **2 tên riêng** (khử trùng `~2`).
- `test_xuatDuDong()` (nhóm C, bản sao): cross-check **X1 + X2** (mục 4.2) toàn ĐẠT.
- Lưu ZIP ra Drive tay, giải nén, mở từng file **bằng Excel** (không phải Google Sheets):
  - Số file = số nhóm · **tổng dòng = 98** · header hàng 1 · freeze row 1
  - **Tên file sort alphabet ra đúng thứ tự bảng** và phân biệt được ở 12 ký tự đầu sau `BL_<ky>_`
  - Bôi đen cột `Tổng lương + thưởng (Net)` → Excel hiện **`Sum`** ở thanh dưới (tiền là **số**, không phải text)
  - **Không có** 5 cột gate · **có** cột `team`, `Phòng ban (HRIS)`, `Mã NV` · A1 có kỳ + tên nhóm (nhãn có dấu)
- Drive: `__PL_TMP_` → **0 kết quả**.
- Chạy export **ngay sau** `capNhatTuBigQuery` (công thức chưa tính) → báo lỗi actionable, **không** tạo file chứa `#REF!`.
- Gọi `xlTaiZip` 2 lần lồng nhau → lần 2 báo "Đang xuất, chờ chút", **không** tạo SS tạm thứ 2.

**Bẫy đã biết:**
- ⚠ `Utilities.zip` trên blob **không tên** → nhiều entry trùng tên → trình giải nén chỉ hiện 1 file. Và tên tiếng Việt → ZIP của Apps Script không set cờ UTF-8 ổn định → **File Explorer Windows hiện `PhÃ²ng kinh doanh.xlsx`**. Bắt buộc `setName(<đã bỏ dấu>+'.xlsx')`.
- ⚠ 2 cột `role:'calc'` (`BangLuong.gs:71-72`) là công thức trỏ ô **cùng dòng** (`=I5+L5`). Copy sang file khác số dòng là trỏ sai. Dấu hiệu: cross-check X2 ra `S_xuất(tong_lt)=0` trong khi `S_bảng(tong_lt)≠0`.
- ⚠ HTTP 200 **không** là bằng chứng thành công — thiếu scope Drive thì endpoint trả trang HTML login kèm 200, `Utilities.zip` chạy ngon, ZIP tải về đúng tên, và Excel báo "file hỏng" **ở máy leader**, không ở máy chị Trang.
- Guard >12 nhóm → **chia mẻ**, ⚠ **TUYỆT ĐỐI không** tự chuyển sang chế độ 1-file-nhiều-tab (Q4c).
- Nếu số nhóm **`≤ 2`** **hoặc** **một nhóm chiếm `> 60%` dân số** ⇒ **dừng, hỏi trước khi xuất** — cả hai đều là dấu hiệu cột `team` bị lệch hoặc CASE chết. Dialog phải hiện **số nhóm** to bằng số người. *(Bỏ vế "tỷ lệ khớp HRIS < 50%" — không còn HRIS trong đường chạy.)*

**Phụ thuộc:** G3-T6, G3-S3.

---

### G3-T11 — Export: dialog (`PhongBanXuat.html`)

**Mục tiêu:** chị Trang tự xuất được ZIP đúng kỳ mà không hỏi ai.

**File & vị trí:** `docs/apps-script/PhongBanXuat.html` (**tạo mới**).

**Việc phải làm:**
1. Modal ~580×540, gồm:
   - **Ô nhập kỳ lương to**, mặc định `kyLuongHienTai_()`, có nút **Xác nhận kỳ**. Nút tải **khoá** cho tới khi bấm xác nhận.
   - ⭐ **KHỐI ĐỎ TRÊN CÙNG, TRƯỚC CẢ DANH SÁCH** — thời điểm rò lương xác suất cao nhất, phải nằm trước mắt chị **đúng lúc bấm tải**: ① **giá trị `team` bất thường** không thuộc 9 nhánh `CASE` đã biết (từ `xlKiemTeam_`, kèm số người và giá trị lạ): *"Team lạ: '143 Nguyễn Tuân' (13 người) — Chung có sửa CASE?"* ② **người mới (NV tháng đầu)** — điểm rò xác suất cao nhất; **không chặn nút**, chỉ in đỏ.
   - Danh sách nhóm + số người theo **cột `team`**, sắp theo **thứ hạng `ORDER BY :52`** (khớp thứ tự file trong ZIP), có **nút đổi sang alphabet** để soi 2 nhãn gần giống nằm cạnh nhau. `(Chưa phân nhóm)` **cuối, chữ đỏ, kỳ vọng 0 người**.
   - ⭐ Mỗi dòng nhóm kèm **bảng chéo `Phòng ban (HRIS)`**: `Inhouse 1 — 46 người (Kinh doanh 39 · Marketing 3 · trống 4)`. **Chỉ hiển thị, không chặn** — thấy ngay "mồi sai" hoặc "HRIS sai".
   - Dòng tổng: `Tổng: 98 người / 8 nhóm` — con số lấy từ **`xlMauSo_`**, cùng nguồn với assert (I8).
   - Cảnh báo **vàng** khi một nhóm chiếm **> 60%** dân số (Q4c).
   - Cảnh báo tự động khi 1 khoá canonical có >1 nhãn gốc: *"'Back Office' (1 người) đã gộp vào 'Back office'"*.
   - ⭐ Danh sách **`ℹ Team bất thường`** (từ `xlKiemTeam_`) — giá trị `team` không thuộc 9 nhánh CASE đã biết. **Đặt đúng lúc chị sắp gửi file** là chỗ duy nhất chị thật sự đọc. Không nguy hiểm — nhóm lạ vẫn xuất bình thường, nhưng tên nhóm trong file sẽ là giá trị BQ thô.
2. **2 nút:** `📦 Tải ZIP — mỗi nhóm 1 file` (**nổi bật**) và `📄 Tải 1 file — nhiều tab` (phụ), kèm **chữ đỏ** dưới nút phụ: *"⚠ File này chứa lương TẤT CẢ các nhóm. Gửi nhầm là rò lương."*
3. **Đường tải theo Q4d:** bấm nút → server dựng (60–170s, hiện thanh chờ) → success handler **KHÔNG mở gì**, chỉ render thẻ `<a href="..." download="..." target="_blank">` to, xanh: *"Tải file (2,1 MB)"* → **chị Trang tự bấm**.
4. Dòng cuối: *"File nằm trong thư mục Tải xuống của máy."*
5. Nếu chia mẻ: sau khi tải mẻ 1, hiện *"Đã xuất 12/18 nhóm. Bấm lần nữa để lấy 6 nhóm còn lại."*

**Không được đụng:** không `window.open` trong callback · không tự động `.click()` thẻ `<a>` · không đếm lại số người ở client.

**Tiêu chí đạt:**
- Menu `📥 Xuất Excel theo Team` → modal có đủ: ô kỳ · **khối đỏ team-lạ + người-mới** · danh sách nhóm + số + bảng chéo · tổng · 2 nút · chữ đỏ · dòng "thư mục Tải xuống".
- Cộng tay số người trong danh sách = 98.
- ⭐ **Chị Trang chỉ đúng được file nào gửi cho ai mà KHÔNG cần mở file.**
- Chưa xác nhận kỳ → nút tải **khoá**.
- Sửa kỳ thành `2026-08` → xác nhận → tải ZIP → **tên file chứa `2026-08`** và **A1 mỗi tab** cũng là `2026-08`.
- File rơi vào thư mục Tải xuống.
- Cross-check X7: 2 nút cho **cùng tập `tabs[]`** (cùng tên nhóm, cùng số dòng).
- **Chị Trang tự làm 1 lượt, không ai hướng dẫn** → ra được ZIP đúng kỳ. Chị hỏi quá 1 câu ⇒ dialog chưa đủ tự giải thích.

**Bẫy đã biết:**
- ⚠ `kyLuongHienTai_()` (`Gate:317-323`) trả **tháng trước** trừ khi `KY_LUONG` được đặt. Bảng lương **không có cột kỳ** ⇒ quên đặt là gửi leader file tên `2026-07` chứa dữ liệu tháng 8, **không gì trong hệ thống bắt được**. Vì thế kỳ phải xuất hiện **2 nơi độc lập**: tên file **và** A1 mỗi tab.
- ⚠ `window.open` trong `withSuccessHandler` chạy sau 60–170s ⇒ ngoài user-gesture ⇒ **popup bị chặn**, và thanh cảnh báo của Chrome hiện ở thanh địa chỉ **trang Sheet**, không trong iframe dialog ⇒ chị Trang không nhìn thấy gì cả.
- **Bác** ý tưởng "hộp xác nhận bắt buộc trước export" — chị sẽ bấm OK theo phản xạ. Hiển thị số ngay trong dialog hiệu quả hơn modal chặn.

**Phụ thuộc:** G3-T10.

---

### G3-T12 — [mở rộng] PDF từng phiếu

**Mục tiêu:** nút trong modal preview xuất 1 phiếu ra PDF theo đúng Doc mẫu.

**File & vị trí:** `docs/apps-script/PhieuLuongXem.gs` (thêm hàm) + `PhieuLuongXem.html` (thêm nút).

**Việc phải làm:**
1. `pvTaiPDF(code) → {filename, dataUri}`: `DriveApp.getFileById(PX_DOC_ID).makeCopy('__PL_TMP_pdf_'+code)` → mở bằng `DocumentApp` → `replaceText` cho **cả `getBody()`, `getHeader()`, `getFooter()`** theo **cùng danh sách tag của G3-T8** → `saveAndClose()` → `getAs('application/pdf')` → trash trong `finally`.
2. Nút `📄 Tải PDF phiếu này` trong modal, đi qua **cùng đường thẻ `<a>`** của G3-T11.
3. **1 phiếu/lần**, không hàng loạt (trần 6 phút).

**Không được đụng:** Doc gốc `1Jd0…` — chỉ `makeCopy`, không sửa bản gốc.

**Tiêu chí đạt:**
- PDF mở được; tìm chuỗi `<<` trong PDF → **0 kết quả**.
- So PDF ↔ preview cùng NV: **cùng danh sách dòng, cùng thứ tự, cùng số** (cả hai đọc cùng `tags`).
- Ca `Công 23.5` → PDF hiện `23,5`.
- Drive: tìm `__PL_TMP_pdf_` → 0 kết quả.

**Bẫy đã biết:** `replaceText` trên `getBody()` **không** chạm header/footer ⇒ PDF gửi cho nhân viên có `<<Tháng>>` sống nguyên trên đầu trang.

**Phụ thuộc:** G3-T9, G3-T11.

---

### G3-T13 — Menu + Docs + Contract

**Mục tiêu:** chị Trang thấy 2 mục menu mới; contract không còn nhãn nào lệch code sống.

**File & vị trí:** `docs/apps-script/BangLuong.gs:98-113` (`onOpen`) · `docs/PHIEU_LUONG_CONTRACT.md` · `MODULES.md` (root).

**Việc phải làm:**

1. **Menu** — chèn 2 mục **không đánh số** (để không tạo cảm giác bắt buộc tuần tự), ngay sau mục (2):
   ```
   🔄 (1) Cập nhật bảng lương
   📋 (2) Đối soát với bảng lương mẫu
   ──────────
   👁 Xem trước phiếu lương (dòng đang chọn)     ← MỚI
   📥 Xuất Excel theo Team                        ← MỚI
   ──────────
   🎨 Định dạng lại · 📊 Cập nhật bảng tính thuế
   ──────────
   🧾 Tạo tab Nhập tay · 🗓️ Tạo tab Chấm công
   ──────────
   🔌 Cài đặt cổng gửi phiếu · 📤 Gửi phiếu đang chờ · 📋 Mở hàng đợi · 🔑 Đặt token & kỳ lương
   ```

2. **`PHIEU_LUONG_CONTRACT.md`** — sửa **6 chỗ đã lệch code sống**:

| Chỗ | Hiện ghi | Phải sửa thành |
|---|---|---|
| `:20` | `Tổng lương + thưởng` | `Tổng lương + thưởng (Net)` (nhãn thật, `BangLuong.gs:71`) |
| `:26` | `Bảo hiểm + note` | `Bảo hiểm` (nhãn thật, `BangLuong.gs:78`) |
| bảng cột | thiếu | Bổ sung `Mã NV`, `Team`, `Loại NV`, `Ghi chú thưởng nóng`, **`Phòng ban (HRIS)`** |
| `:92`, `:121` | `appEndpoint='' → dry-run` | **SAI** — `PhieuLuongGate.gs:35` đang trỏ production Render. Ghi đúng trạng thái thật + `gateToken` nay đọc từ ScriptProperties |
| `:130` | "toàn bộ cột bảng chính, TRỪ 5 cột trạng thái" | "…TRỪ 5 cột trạng thái **và 1 cột vận hành nội bộ (`Phòng ban (HRIS)`)**" |
| mới | — | Ghi: *"Nguồn sự thật bố cục phiếu = Doc `1Jd0…`. Preview và PDF đều đọc tag từ Doc lúc chạy — không hardcode nhãn."* |

3. **Một dòng mới trong contract:**
   - **`Phòng ban (HRIS)`** — nguồn = `t.departments` trong `payroll.C_view_bang_luong_truoc_thue`; `role:'auto'`; **CHỈ ĐỌC**, không tham gia bất kỳ biểu thức chia file nào; **KHÔNG vào payload**. Cột `team` (`role:'auto'`, `src:'team'`) là khoá gom file — đã có sẵn từ trước, không cần thêm vào contract.

4. **`MODULES.md`** — thêm 4 file mới vào bản đồ module.

5. **HDSD 1 trang cho chị Trang** (trong contract hoặc file riêng), gồm:
   - Refresh **chỉ coi là xong** khi thấy toast **"Đã cập nhật N NV"**. Không thấy toast = coi như hỏng dù bảng trông đúng.
   - **Paste/kéo-thả tick hàng loạt KHÔNG xếp hàng gửi** (`Gate:66` bỏ qua vùng >1 ô). Phải tick **từng ô một**.
   - ⭐ **Cột `team` quyết định NV vào file nào** — do máy tính từ BigQuery, chị Trang không cần làm gì. Nếu muốn chia mịn hơn (vd tách `Inhouse 1` thành 3 nhóm) ⇒ **nhắn Chung sửa `CASE ... AS team`** trong BQ, sau đó bấm "Cập nhật bảng lương".
   - ⭐ **`Phòng ban (HRIS)` chỉ để xem** — không quyết định ai vào file nào, chỉ hiện thêm thông tin bên cạnh cột `team` để đối chiếu.
   - ⭐ **Bảng `nhóm → người nhận`** để chị điền tay (plan không biết đường nhận file — xem câu hỏi #8/#9 mục 6).
   - ⭐ Dòng `ℹ Team bất thường` trong dialog — giá trị `team` không nằm trong 9 nhánh đã biết của `CASE`. Thường nghĩa là Chung vừa sửa code BQ. Nhóm lạ vẫn xuất bình thường; nếu tên file trông lạ, nhắn Chung cập nhật `CASE`.

6. **Grep call site** cho mọi hàm mới (I17): `ensureGridWidth_`, `plAssertHeadersUnique_`, `plAssertCodesUnique_`, `plSerialize_`, `restoreGateTicks_`, `gBuildPhieu_`, `gSkipCols_`, `xlBoCotXuat_`, `xlMauSo_`, `xlGomNhom_`, `xlKiemTeam_`, `xlTenTab_`, `xlTenFile_`, `xlKiemBlob_`, `xlDonRac_`, `pvDungPhieu_`, `pvDocTags_` — **mỗi cái ≥1 call site**.

7. Commit thẳng `main` (quy ước docs của repo).

**Không được đụng:** không đổi logic ở task này.

**Tiêu chí đạt:**
- Mở menu trên sheet: thấy đúng 2 mục mới, đúng vị trí.
- `grep` 17 hàm mới → mỗi cái ≥1 call site.
- Đọc contract: không còn nhãn nào khác nhãn trong `COLS`.
- `grep -n "PAYSLIP_BLOCKS\|KEY_NORMALIZE\|PREFIX_KEYS" docs/apps-script/*.gs` → **0 kết quả** (I14).

**Phụ thuộc:** G3-T6, G3-T9, G3-T11.

---

## 4. KẾ HOẠCH KIỂM THỬ

### 4.1 Phân bố `team` — ca biên `xlGomNhom_` (test A2 `test_gomNhom()`, dùng nghiệm thu G3-T10)

Khoá gom là cột **`team`** (`role:'auto'`, `src:'team'`, `BangLuong.gs:66`). Giá trị đọc thẳng từ bảng, không có logic mồi. `xlGomNhom_` nhận mảng `allVals` (tất cả dòng) và trả danh sách nhóm.

| Ca | Giá trị `team` ô | **Kết quả** | Vì sao |
|---|---|---|---|
| a | `'Inhouse 1'` | nhóm `Inhouse 1` | bình thường |
| b | `'  inhouse 1 '` | gộp vào `Inhouse 1` | NORM chuẩn hoá, CANON khớp |
| c | `'Back office'` / `'Back Office '` / `'back office'` / `'Back-office'` | **1 nhóm** | I26: `-`/`_`/`/` → khoảng trắng trước CANON |
| d | `''` / `null` | `'Khác'` — cuối, **ĐỎ** | COALESCE `:28` chỉ bắt NULL ⇒ `String(v\|\|'').trim()\|\|'Khác'` ở tầng app |
| e | `'143 Nguyễn Tuân'` (Chung sửa CASE) | nhóm mới hiện bình thường + **X8 cảnh báo vàng** trong dialog | team không còn quyền đổi file ai đang nằm — chỉ cảnh báo |

> Ca **c/d** là 2 ca quyết định. `xlGomNhom_` không tracking gì từ kỳ trước — thứ tự nhóm là lần xuất hiện đầu trên bảng (ORDER BY `:52` → liền khối).

### 4.2 Cross-check — 7 phép đối chiếu chéo (không cần biết đáp án đúng trước)

| Mã | Phép | Bắt được gì |
|---|---|---|
| **X1** | `N_bảng = getLastRow()-1` ; `N_xuất = Σ nhóm.rows.length` ; `S_mã = |Set(mọi mã)|` → **cả 3 bằng nhau** | `N_xuất < N_bảng` = mất người; `N_xuất > S_mã` = **1 NV nằm 2 file = rò lương** |
| **X2** | Với mỗi `k ∈ MONEY_KEYS` (15 cột): `|Σ_bảng(k) − Σ_xuất(k)| ≤ 1` | `Σ_xuất(tong_lt)=0` ⇒ **đang ghi FORMULAS thay VALUES**; lệch đúng 1 dòng = mất/nhân đôi NV; lệch 1 cột = lệch vị trí sau khi chèn cột |
| **X3** | `P_bảng` (đọc thẳng hàng NV, trừ `gSkipCols_()` — 5 gate + tùy chọn `Phòng ban (HRIS)`) ≡ `P_xem` (`dong ∪ conLai`); và số ô lệch `P_gửi` vs `P_bảng` === số badge ⚠ preview hiện | Preview nói dối. Chạy 98 NV mất ~5s |
| **X4** | `tong_luong_tính = LCB + ăn trưa + máy tính + xe_PC − bảo hiểm + bù tiền − khấu trừ thuế` (đúng `BangLuong.gs:72`); `tong_lt_tính = tong_luong_tính + thưởng COM` (`:71`) → lệch ≤1 cho **cả 98 dòng** | Chèn cột làm lệch tham chiếu `C()` → đỏ 98/98 ngay; công thức bị ghi đè số cứng → đỏ vài dòng |
| **X5** | `D` (ô `team` trống) `=== 0` · số nhóm `|Set(team)|` ≥ 3 và ≤ 12 · nhóm lớn nhất ≤ 60% · `Set(CANON(team))` ⊆ **9 giá trị CASE đã biết** **hoặc** đã hiển thị **cảnh báo vàng** trong dialog | Cột `team` rỗng ⇒ nhóm `(Chưa phân nhóm)` — X1/X2 vẫn xanh vì tổng dòng không đổi. Giá trị lạ (CASE chết) sinh **nhóm ma với tên BQ thô** trong ZIP — chỉ X5 bắt được |
| **X6** | `matchPct` + `bqCount` của `doiSoatLuong()` **trước** và **sau** khi thêm cột → **bằng chính xác** | Nguồn sự thật **thứ ba, độc lập** (file xlsx chị Trang). Lệch 1% = có cột đọc sai vị trí dù `COMPARE_COLS` join theo tên |
| **X7** | `tabs[]` của nút ZIP === `tabs[]` của nút 1-file (cùng tên nhóm, cùng số dòng) | 2 nút lệch dữ liệu |
| **X8** ⭐ MỚI | `Set(team)` ⊆ **9 giá trị** của `CASE :19-28` | Phép **duy nhất** bắt được ca Chung/Minh sửa `CASE ... AS team`. ⚠ Nay chỉ là **cảnh báo** (mức nhỏ, R24) — `team` không còn quyền đổi file của ai, chỉ mồi NV mới và nuôi cột đối chiếu |

### 4.3 `test_soSanhBaseline()` — diff kỳ vọng theo task

| Task | Diff kỳ vọng | Mọi diff khác = **HỎNG** |
|---|---|---|
| G3-T2 | **rỗng** (kể cả khi ép `layoutChanged`) | bất kỳ thay đổi nào |
| G3-T6 | `+1 header ('Phòng ban (HRIS)')` — chỉ làm nếu S1b xác nhận. `_snapshot` không đổi (không có `role:'input'` mới) | tổng tiền đổi · ô nhập tay đổi · tick mất · mã NV mất |
| G3-T7 | rỗng (trừ 1 `id` outbox test) | số khoá `payload.phieu` đổi |
| G3-T8/T9/T10/T11/T12 | **rỗng** (chỉ đọc) | bất kỳ thay đổi nào ⇒ preview/export đang **GHI** vào bảng — lỗi nghiêm trọng |

### 4.4 Bộ hồi quy R — chạy sau **bất kỳ** thay đổi nào đụng `COLS` (~6 phút)

| # | Chạy | Bảo vệ |
|---|---|---|
| R-1 | `chayTestThuan()` | layout, alias gate, **gom nhóm theo `team` (Q1)**, `xlGomNhom_` ca biên, format số |
| R-2 | `chayTestDocThat()` | bảng thật, HRIS, outbox, snapshot, Doc |
| R-3 | `test_soSanhBaseline()` | ô nhập tay, tick, tổng tiền, dân số |
| R-4 | X4 | công thức không lệch sau khi chèn cột |
| R-5 | `doiSoatLuong()` → so `matchPct` (X6) | module đối soát còn đúng |
| R-6 | Tick gửi 1 NV test → so `payload_json` với golden | hợp đồng cổng gửi phiếu còn nguyên |
| R-7 | Mở preview 1 NV + xuất ZIP 1 lần | 2 tính năng mới còn chạy |

**Ba mốc bắt buộc chạy đủ bộ R:** ① sau khi Chung append cột vào view BQ (`PHIEU_LUONG_CONTRACT.md:3` cho phép rõ ràng) ② sau khi thêm/xoá/di chuyển bất kỳ phần tử nào của `COLS` ③ đầu mỗi kỳ lương, **trước** khi chị Trang tick cột đầu tiên.

### 4.5 `test_toanVenBang()` — 9 assert đọc `Bảng lương` (nhóm B)

| # | Assert | Bắt bẫy |
|---|---|---|
| B2.1 | Hàng 1 không nhãn trùng, không nhãn rỗng | I2 |
| B2.2 | `getMaxColumns() >= COLS.length` cho **cả** `Bảng lương` **và** `_data` | I1 — `writeRaw_` nổ ở `:217` trước mọi thứ |
| B2.3 | Nhãn hàng 1 khớp `COLS.map(c=>c.h)` **từng vị trí** | ai đó chèn cột tay giữa bảng |
| B2.4 | Số dòng = số mã NV **duy nhất**; mọi mã khớp `/^HN\d+$/` | I3 |
| B2.5 | Cột **`team`** **0 ô trống sau BQ refresh** (I21). Cột `Phòng ban (HRIS)` **được phép trống** — **không assert** | `team` rỗng ⇒ nhóm `(Chưa phân nhóm)` trong file xuất. `departments` trống là chuyện bình thường của HRIS (mục 1b.3), không phải lỗi |
| B2.6 | 0 ô MONEY là chuỗi bắt đầu `'#'` | `#REF!`/`#N/A` lọt vào file gửi leader |
| B2.7 | Mọi ô 5 cột gate là `boolean` | ô text `'x'`/`'TRUE'` ⇒ interlock đọc sai |
| **B2.8** | **Đếm data validation kiểu CHECKBOX ngoài 5 cột gate === 0** | ⭐ bẫy `.clear()` không xoá validation |
| B2.9 | 0 checkbox ở dòng > số NV | checkbox ma tháng ít người hơn |

### 4.6 Ca biên bắt buộc phủ

**Nhân sự:** NV ảo (`HN1000` — xác minh có trên bảng lương không ở G3-S1) · công `23.5` (Đào Phương Thảo, `CONTRACT:101`) · **mã trùng trên bảng lương** (throw, không tải) · NV mới (giá trị `team` tính từ BQ, tự có) · NV nghỉ 1 tháng rồi quay lại (team tự tính lại từ BQ) · HR sửa `workplace` của NV (⇒ Chung cần cập nhật `CASE` để phản ánh ⇒ **X8 cảnh báo vàng**).

**Nhóm (cột `team`):** 1 nhóm 1 người · tất cả 98 cùng 1 nhóm (⇒ **dừng, hỏi** — Q4c) · một nhóm > 60% dân số (⇒ cảnh báo vàng) · `(Chưa phân nhóm)` (⇒ **kỳ vọng 0 dòng**, đỏ nếu có) · tên có dấu `Kế toán & Hành chính` · ký tự cấm `Sale/Marketing`, `R&D: Data`, `Store [HN]`, `Ca * đêm`, `A?B` · **va chạm sau sanitize** `A/B` vs `A:B` · tên >31 ký tự (tab) và >60 (file) · chỉ khác hoa-thường-khoảng-trắng · `Back office` vs `Back-office` vs `Back_office` (⇒ **1 nhóm**, I26) · bắt đầu bằng `=` hoặc `'` · chứa xuống dòng · **giá trị lạ** `143 Nguyễn Tuân` (⇒ **cảnh báo vàng trong dialog**, X8) · 13 nhóm (> ngưỡng 12) · 5 nhóm **cùng tiền tố dài** (⇒ tên file phải phân biệt ở 12 ký tự đầu sau `BL_<ky>_`).

**Dữ liệu ô:** bảng rỗng (BQ 0 dòng → `:209` dừng; export báo "Không có dữ liệu", **không tạo SS tạm**) · đúng 1 NV · 98 NV (baseline hiệu năng: export <150s, mở preview <6s, đổi người <0,2s) · ô `#REF!`/`#N/A` · `Bù tiền` âm · giá trị `0` (**hiện `0`**, không bị lọc như rỗng) · `Note` chứa `<b>`, `&`, `"` · `Ghi chú thưởng nóng` 500 ký tự · ô kiểu `Date`.

**Kỳ & nguồn ngoài:** `KY_LUONG` trống + hôm nay 1/1 → `2025-12` · quên đặt kỳ (dialog cho sửa) · `t.departments` rỗng/rác toàn bộ (⇒ cột `Phòng ban (HRIS)` trống, **KHÔNG ảnh hưởng chia file**) · Chung sửa `CASE ... AS team` (⇒ **X8 cảnh báo**, không ai đổi file — R24) · Doc mất quyền · Doc có tag trùng · Doc có tag mồ côi · chị paste hàng loạt tick 5 ô. *(Bỏ 3 ca HRIS-sheet: mất quyền / đổi tên cột / header dòng 2-3 — không còn code đọc sheet HRIS.)*

---

## 5. RỦI RO & PHƯƠNG ÁN DỰ PHÒNG

| # | Rủi ro | Mức | Dấu hiệu nhận biết | Phương án B |
|---|---|---|---|---|
| R1 | **Mã NV không unique** (`TODO_2026-08-17.md:49` đang giao "tách 2 dòng HN0084") ⇒ vỡ override, snapshot, `_gate_state`, `_outbox`, BE upsert, **RBAC cho 2 NV đọc lương của nhau** | **chặn** | `plAssertCodesUnique_` throw | Đề xuất chị Trang **cấp mã riêng** thay vì tách 2 dòng cùng mã (tiền lệ HN1000 tách từ HN0001 đã dùng mã riêng). Nếu buộc phải trùng: khoá thật = `code + '\|' + suffix`, phải sửa **cả 8 điểm** đã liệt kê ở Q7 |
| R2 | **Hằng số top-level xuyên file** (`var X = GATE_COLS.slice()`) → `TypeError` **lúc nạp** → menu biến mất, trigger chết, cả sheet lương ngừng chạy | **chặn** | Mở sheet không thấy menu `⚙ Bảng lương` | Đổi mọi hằng phụ thuộc thành **hàm lazy** (I16). Đã có bằng chứng namespace hỗn loạn: `BangThue.gs`/`BangTinhThue.gs` trùng ~15 tên với logic khác nhau |
| R3 | **Repo ≠ editor sống** ⇒ Sonnet sửa đúng số dòng vào file sai | **chặn** | `git diff` sau G3-T0 có thay đổi | G3-T0 sync bắt buộc; sau đó anchor **bằng text** (tên hàm/đoạn code), không bằng số dòng |
| R4 | **Dán file repo vào editor xoá `gateToken`/`kyLuong`** ⇒ 98 phiếu 401 im lặng, id outbox/state lệch kỳ | **chặn** | `_outbox` đầy dòng `failed` với `HTTP 401` | G3-T1 chuyển sang `ScriptProperties`. **Làm trước mọi task đụng `PhieuLuongGate.gs`** |
| R5 | **Preview hiện ít hơn phiếu thật** (Doc ~15 tag vs payload 24 khoản) ⇒ chị duyệt mù | **chặn** | Đếm `\|dong\| + \|conLai\|` ≠ số khoá `payload_json` | Q5b: phần "Cột khác" **mở sẵn + badge đỏ**. Nghiệm thu G3-T9 #7 |
| R6 | **`gid` không thu hẹp xlsx** ⇒ mọi file trong ZIP chứa 98 người | **chặn** | Byte-size các blob **gần bằng nhau** dù số dòng chênh lớn | Đã bỏ khỏi thiết kế (Q4b). Cơ chế chính = N-spreadsheet. Nếu >150s → CSV+BOM per nhóm qua `format=csv&gid=` |
| R7 | **`window.open` ngoài user-gesture** ⇒ popup bị chặn, chị không thấy gì | **chặn** | Thanh chờ xong rồi không có file | Q4d: server trả, client render thẻ `<a>`, **chị tự bấm**. G3-S3 test đúng hình dạng này |
| R8 | **Token Bearer thiếu scope Drive** ⇒ blob là trang HTML login kèm HTTP 200 | nghiêm trọng | Excel báo "định dạng hỏng" — **ở máy leader**, không ở máy chị Trang | G3-S2 khai `oauthScopes` tường minh; `xlKiemBlob_` kiểm magic bytes `PK` (I9) |
| R9 | **Re-authorize giết trigger `guiPhieuOnEdit`** giữa kỳ ⇒ cổng gửi phiếu chết câm | nghiêm trọng | Tick checkbox không có toast, `_outbox` không có dòng mới | G3-S2 làm **ngoài kỳ chốt lương** + chạy lại `installGateTriggers` + tick test bắt buộc |
| R10 | **Khoá một chiều** — `capNhatTuBigQuery` không giữ lock ⇒ export đọc bảng đang bị `clear()` | nghiêm trọng | ZIP ra 1 file `(Chưa phân nhóm)` 0 dòng, hoặc 40 dòng nửa cũ nửa mới | G3-T2 vá #9: cả 3 hàm cùng `tryLock(0)` (I15) |
| R11 | **Preview khoá `_outbox` theo row index**, mà tab đó chị Trang **mở và sửa được** (`Gate:276-280`) | nghiêm trọng | Bấm "Bản đã gửi" hiện phiếu người khác, **không dấu hiệu gì** | G3-T8: truyền `id`, tra bằng `gOutboxIndex_` |
| R12 | **Giá trị `team` lạ từ BQ** — `CASE` trả `'Back Office '` (trailing space) hoặc workplace mới chưa có nhánh ⇒ file ngoài 9 nhóm chuẩn. I8 vẫn pass | nhỏ | `xlKiemTeam_` cảnh báo vàng X8 khi `Set(team)` chứa giá trị ngoài 9 nhánh `CASE` (`:19-28`); `xlGomNhom_` chuẩn hoá `CANON` (gộp `-`/`_`) trước khi chia file |
| ~~R13~~ | ~~**HRIS đọc OK nhưng không thấy cột** ⇒ 98 NV thành `(Chưa phân phòng)`~~ | — | — | **XOÁ** — không còn nguồn ngoài nào trong đường tối quan trọng (Q1b). `departments` đến từ chính lô `SELECT`; sheet HRIS không được đọc từ Apps Script nữa |
| R14 | **`restoreGateTicks_` tick lại ô mà `_outbox` không có dòng** ⇒ chị tin đã gửi, NV không nhận, phát hiện cuối tháng | nghiêm trọng | Toast in `M > 0` ("bỏ qua M tick") | Fail-closed: chỉ tick khi `_gate_state` **và** `_outbox status='sent'` cùng xác nhận |
| R15 | **Bản vá `formatValue` bằng `Number.isInteger`** làm mọi cột tiền lẻ hiện thập phân trên **cả phiếu cũ** | nghiêm trọng | Phiếu hiện `11.260.416,667` | Whitelist theo **khoá** (`KEEP_DECIMAL`), không theo kiểu (G3-T4 #4) |
| R16 | **`Tổng lương + thưởng (Net)` đang nằm ở khối "Khác"** của 98 phiếu, **trên production ngay lúc này** | nghiêm trọng | Mở 1 phiếu đã gửi, con số quan trọng nhất nằm ô xám cuối phiếu | G3-T4 #1. **P0, độc lập Sheet, làm được ngay** |
| R17 | **Tên kỳ lương sai** trên file gửi ra ngoài | nghiêm trọng | Không có — hệ thống không bắt được | Dialog bắt xác nhận kỳ; kỳ vào **tên file VÀ A1 mỗi tab** (2 nơi độc lập) |
| R18 | **Entry ZIP trùng tên + mojibake Windows** | nhỏ | File Explorer hiện `PhÃ²ng kinh doanh.xlsx`, hoặc ZIP chỉ hiện 1 file | `blob.setName(<bỏ dấu>+'.xlsx')` bắt buộc |
| R19 | **Tên tab xlsx giới hạn 31 ký tự** (không phải 100 của Google Sheets) | nhỏ | Excel báo file hỏng | Cắt 31 + khử trùng `~2` |
| R20 | **Rác Drive** tích tụ sau lần crash; `UserProperties` per-user không dọn chéo được | nhỏ | Toast in số file `__PL_TMP_` đã dọn > 0 liên tục | `ScriptProperties` + quét prefix |
| R21 | **Nhãn trùng làm gate chết câm** — `gHeaderAt_` (`Gate:336`) trả `null` ⇒ checkbox cột đó không phản hồi | nhỏ | Tick checkbox không có toast, không lỗi | Tồn dư chấp nhận được. `plAssertHeadersUnique_` bắt ca do `COLS`, không bắt ca chị tự thêm cột tay. Ghi vào HDSD |
| R22 | **`Date` qua `google.script.run` fail câm** | nhỏ | Dialog quay mãi không có callback | `plSerialize_` bọc mọi return (I13) |
| R23 | **Rollback "Tạo bản sao" không phải rollback thật** — bản sao không mang trigger, không mang authorization, và `_outbox` đầy dòng `sent`; bấm `flushOutbox` trên đó = **gửi lại phiếu**, BE upsert đè payload đang đúng | nghiêm trọng | — | Rollback thật = ① tải Bảng lương về xlsx làm bản chụp ② xoá cột `Phòng ban (HRIS)` khỏi `COLS`, refresh, kiểm 3 ô input từ `_snapshot` ③ **CẤM chạy `flushOutbox` trên bất kỳ bản sao nào** — ghi cảnh báo vào `moHangDoi` |
| **R24** MỚI | **`CASE ... AS team` (`BangLuong.gs:18-28`) bị sửa** — Chung/Minh đổi nhánh, `workplace` đổi cách ghi | **nhỏ** | X8: `Set(team)` có giá trị ngoài 9 nhánh của `:19-28` | **Chỉ ảnh hưởng NV mới (mồi) và cột đối chiếu — KHÔNG tái phân hoạch ai** (I19). Đó chính là lý do hạ mức từ *nghiêm trọng* xuống *nhỏ*. Task riêng ngoài plan này: `ELSE COALESCE(NULLIF(TRIM(t.workplace),''),'Khác')` + `UPPER` cho nhánh `Store` |
| ~~**R25**~~ | ~~**`Nhóm gửi` trôi khỏi thực tế**~~ | — | **ELIMINATED** | Nhóm nay từ cột `team` (BQ), cập nhật mỗi lần `capNhatTuBigQuery`. NV chuyển chỗ → `workplace` đổi → `team` đổi ngay kỳ sau — không cần ai sửa tay. Rủi ro dịch chuyển sang R24 (CASE sai) |
| ~~**R26**~~ | ~~**`Nhóm gửi` là nguồn sự thật chỉ tồn tại trong một spreadsheet**~~ | — | **ELIMINATED** | Nguồn sự thật nay là `CASE ... AS team` trong `BQ_SQL` (`:18-28`) — sống trong BQ, versioned, không phụ thuộc spreadsheet. Backup = BQ view. R26 đóng |

---

## 6. CẦN NGƯỜI CHỐT

| # | Câu hỏi | Hỏi ai | Mặc định nếu không ai trả lời |
|---|---|---|---|
| 1 | **HN0084 — tách 2 dòng cùng mã hay cấp mã riêng?** (`TODO_2026-08-17.md:49`) Tách cùng mã ⇒ vỡ 8 điểm đứng trên `code`, có thể làm 2 NV đọc được lương của nhau qua RBAC. | chị Trang + anh Hiếu | **Cấp mã riêng** (như HN1000 tách từ HN0001). Nếu chưa trả lời: `plAssertCodesUnique_` throw, refresh dừng — **cố ý**, để buộc quyết |
| 2 | **Nhóm trong file xuất** (cột `team` từ BQ) **có phù hợp thực tế không?** Hiện theo `workplace` → `Inhouse 1 / Inhouse 2 / Offline / MKT / BOD / ...`. Bug đã biết: `'47 Nguy%'` chết, `WFH` 0 người (mục 1b.4). | chị Trang | **Đủ dùng cho lần đầu** — chia mịn sửa sau. Chị Trang không cần làm gì ngoài bấm `📥 Xuất Excel theo Team`. Muốn chia lại: nhắn Chung sửa `CASE ... AS team` trong BQ |
| 3 | **2 cột mới có vào phiếu NV nhận không?** Cho vào = đổi nội dung phiếu production giữa kỳ, và tạo bất nhất giữa phiếu đã gửi (`status='sent'` không re-send, `Gate:154-156`) với phiếu gửi sau. | chị Trang | **KHÔNG, cả hai** (Q3) |
| 4 | **Ai sửa Doc `1Jd0…`** (tag `<<Khấu trừ thuế tháng 05>>` → `<<Khấu trừ thuế>>`, và mọi tag mồ côi khác mà G3-S4 tìm ra)? Đây là blocker của **cả G3-T9 lẫn G3-T12**. | chị Trang | Minh sửa, chị Trang duyệt lại bằng mắt |
| 5 | **Đặt lịch G3-S2 (đổi scope + cấp quyền lại) ngày nào?** Trong lúc chờ cấp quyền, **cổng gửi phiếu ngừng chạy**. | chị Trang | Ngày **8–20** hàng tháng (ngoài cửa sổ chốt lương và trước hạn 23:59 mùng 4 theo `TODO_2026-08-17.md:22`) |
| 6 | **Ở thời điểm gửi tầng 1, `Khấu trừ thuế` đã có số chưa** (chị Vân đã chốt thuế chưa)? Nếu "trước thuế" cần **luật ẩn dòng** chứ không chỉ khác dữ liệu, thì phải thêm cột `Tổng lương (trước thuế)` vào `COLS` **và** sửa app ⇒ scope Task C gấp đôi, G3-T6 phải làm lại. | chị Trang / chị Vân | **Không có luật ẩn dòng** (Q5d). Banner vàng ghi rõ 2 tầng khác *giá trị* không khác *cấu trúc* + badge tầng suy từ `Khấu trừ thuế` |
| 7 | **`_outbox` hiện có bao nhiêu dòng `failed` với HTTP 401** (do `gateToken` rỗng mà `appEndpoint` trỏ production)? Nếu có dòng đã `attempts>=5` thì đã `skipped` **vĩnh viễn** — cần reset tay. | Minh kiểm, báo chị Trang | Kiểm ở G3-T1, ghi vào mục 9. Nếu có → reset `status`/`attempts` sau khi đặt token thật |
| **8** ⭐ | **File Excel này gửi cho ai?** `TODO_2026-08-17.md:23` chỉ ghi *"để chị Trang gửi tay nhóm ngoài app"*, `:20` ghi *"Ai không lên app … chị Trang gửi qua kênh cá nhân"*. Toàn bộ khái niệm **"leader phòng A nhận file" chỉ tồn tại trong plan này** — grep repo không ra nguồn nào khác. Nếu người nhận là **chính nhân viên** thì đơn vị chia đúng là **1 file/người** (= nút PDF G3-T12 đã có), và "theo phòng ban" chỉ là **thùng chứa cho chị dễ tìm** — bài toán **tiện dụng**, không phải bài toán **bảo mật**, và Q4a phải hạ cấp. | **chị Trang** (5 phút, một câu) | **Giữ Q4a**, vì chia theo `team` (BQ) có chi phí ≈ 0 và luôn cập nhật theo thực tế. Ghi vào mục 9 rằng Q4a là **giả định chưa xác nhận** — **CẤM** dùng để biện minh chi phí kỹ thuật lớn hơn hiện tại |
| **9** | **Danh sách nhóm nhận thật, viết ra giấy.** Cụ thể: Store **An Bình (7)** và Store **Linh Đàm (6)** — chung một người nhận hay hai? (`CASE :21` đang gộp cả hai thành `Offline`.) `Inhouse 1` (~46–50) — một leader hay nhiều? | chị Trang + anh Hiếu | **Dùng `team` từ BQ rồi để nguyên.** Ghi HDSD: chia mịn hơn = **nhắn Chung sửa `CASE ... AS team` trong BQ** — cập nhật tự động kỳ sau, 0 thao tác tay trong app |
| **10** | **`t.departments` trong `C_view_bang_luong_truoc_thue` có dữ liệu thật không, và có khớp bản đếm "7 phòng ban" ở `PLAN_M4_MODULE_PHIEU_LUONG_2026-08-14.md:54` không?** (Kinh doanh 56 · CS 18 · Marketing 10 · HR 8 · Kế toán 1 · BGĐ 1 · Học thuật 2 · Kỹ thuật 4 — **lệch hẳn** cột `Departments` của sheet HRIS: CS 5, HR 3, mục 1b.2.) Ai đúng? | **Chung** (1 query) | Đo ở **G3-S1b**. Nếu rỗng/rác ⇒ **bỏ cột `Phòng ban (HRIS)`** khỏi plan này, ship xuất theo `team` không cần cột phụ (Q1e). **Tính năng xuất KHÔNG bị chặn** |
| **11** | **Ba nhánh mục trong `CASE ... AS team` (`BangLuong.gs:18-28`) có sửa không?** `'47 Nguy%'` (`:20`) chết vì địa chỉ đã thành 143 Nguyễn Tuân · `'Work from home%'` (`:27`) khớp 0 người · `'Store%'` (`:21`) thiếu `UPPER` trong khi `:20`/`:26` có · `LIKE '%@%' THEN 'MKT'` (`:24`) là **bản vá cho ô email-làm-chức-danh** (`PLAN_M4…:56`). | Chung | **KHÔNG sửa trong plan này.** Sau khi khoá gom hết phụ thuộc `team` (chỉ còn mồi NV mới), mấy lỗ này hạ từ *nghiêm trọng* xuống *nhỏ* (R24). Mở **task riêng**: `ELSE COALESCE(NULLIF(TRIM(t.workplace),''),'Khác')` + `UPPER` cho nhánh `Store` |
| **12** | **`CASE ... AS team` ở BQ có nên migrate sang cột riêng trong HRIS không?** Hiện `team` hoàn toàn tính từ `workplace` — HR đổi địa chỉ là CASE chết. Đã có tiền lệ: tab `Nhập tay` → Chung nối ngược lên BQ (`BangLuong.gs:118-120`). | Chung | **Giữ CASE trong plan này**, ghi vào mục 9 là nợ kỹ thuật. Sửa CASE khi cần là sửa 1 chỗ (BQ), không phải sửa 98 ô sheet |

---

## 7. ƯỚC LƯỢNG

| Task | Công sức | Ưu tiên | Ghi chú |
|---|---|---|---|
| **G3-T0** Sync repo + manifest + README | 45' | **P0** | Blocker tuyệt đối |
| **G3-T1** ScriptProperties token/kỳ | 45' | **P0** | Chống mất token mỗi lần dán file |
| **G3-T2** Vá nền `BangLuong.gs` (9 vá) | 90' | **P0** | Không có = G3-T6 nuốt ô nhập tay |
| **G3-T3** Test harness + baseline | 150' | **P0** | Mọi task sau nghiệm thu bằng nó |
| **G3-S1** Đo phân bố nhóm (S1a) + `departments` BQ (S1b) | **15'** | **P0** | song song S2/S3/S4. ⬇ từ 30' — bỏ khảo cổ sheet HRIS |
| **G3-S2** Scopes + re-authorize | 30' | **P0** | Ngoài kỳ chốt lương |
| **G3-S3** Spike export + tải file | 45' | **P0** | Quyết định cơ chế G3-T10 |
| **G3-S4** Spike đọc tag Doc | 20' | **P0** | Không có = G3-T8 không tự chứa |
| **G3-T4** Fix FE `PayslipDetail.tsx` | 45' | **P0** | Bug production đang xảy ra; **độc lập, làm được ngay** |
| **G3-T5** Khởi tạo `PhongBanXuat.gs` (config + hàm tiện ích) | **30'** | **P1** | ⬇ từ 120' (lần 1) — xoá `nhMoi_` + seeding logic; chỉ còn config, NORM/CANON, serialize |
| **G3-T6** Chèn cột `Phòng ban (HRIS)` (tùy chọn, sau S1b) | **60'** | **P1** | ⬇ từ 140' — 1 cột tùy chọn + 1 dòng `BQ_SQL` + 2 test; nếu S1b ra rác → bỏ qua |
| **G3-T7** Tách `gBuildPhieu_` | 20' | **P1** | Refactor thuần |
| **G3-T8** Preview server | 120' | **P1** | |
| **G3-T9** Preview client | 150' | **P1** | Task C giao được sau bước này |
| **G3-T10** Export server | 180' | **P1** | |
| **G3-T11** Export dialog | 90' | **P1** | Task E giao được sau bước này |
| **G3-T12** PDF từng phiếu | 90' | **P2** | Mở rộng, xếp sau |
| **G3-T13** Menu + docs + contract | 45' | **P1** | |
| | | | |
| **Tổng P0** | **~7,25 giờ** | | Nền + spike + bug production |
| **Tổng P0+P1** | **~16,75 giờ** | | Giao được cả Task C và Task E |
| **Tổng tất cả** | **~18,25 giờ** | | Gồm PDF |

**Tổng giảm ~2h45'** so với bản plan lần 1 (S1 −15', T5 −90', T6 −60', loại test 11-ca `nhMoi_`).

**Đường găng:** `G3-T0 → G3-T1 → G3-T2 → G3-T3 → (S2+S3) → G3-T5 → G3-T6 → G3-T10 → G3-T11`.
⚠ **G3-S1 không còn nằm trên đường găng** — G3-T5 đã bỏ phụ thuộc vào nó, và tính năng xuất không phụ thuộc kết quả S1b.
**Làm song song được:** G3-T4 (FE, độc lập hoàn toàn) · 4 spike (sau khi có G3-T0/S2) · G3-T8/T9 song song với G3-T10/T11 sau khi G3-T6 xong.

**Cắt được nếu gấp** (theo thứ tự, biết rõ mất gì):
1. G3-T12 PDF — chốt họp xếp nó sau Excel.
2. Test C6 khoá chống bấm 2 lần — mất: chị bấm nhanh 2 lần tạo 2 SS tạm.
3. Cross-check X7 — mất: 2 nút export có thể lệch dữ liệu.

**KHÔNG được cắt dù gấp:** `plAssertCodesUnique_` (R1) · assert alias `gSkipCols_()` (I5+I23) · ca biên `xlGomNhom_` (mục 4.1, đặc biệt c/d) · X1+X2 (bảo toàn dòng/tiền) · **cảnh báo team lạ `xlKiemTeam_` (X8)** · `xlKiemBlob_` (I9+I10). Sáu cái này chặn đúng sáu cách mà tính năng có thể hỏng **mà không ai nhìn thấy** — chỉ lộ ra khi phiếu lương sai đã đến tay 98 người, hoặc file lương nhóm A đã nằm trong tay người của nhóm B.

---

## 8. NHẬT KÝ THỰC THI

> **Chỉ dẫn cho model:** cập nhật bảng này **ngay sau khi xong mỗi task**, trước khi bắt đầu task tiếp. Nếu bị mất ngữ cảnh giữa chừng, đọc bảng này trước tiên để biết đang ở đâu, rồi đọc đúng khối task đó ở mục 3 — mỗi khối tự chứa đủ thông tin.
> Cột **Ghi chú** bắt buộc ghi: số dòng thật nếu lệch so với plan · kết quả spike (con số) · thứ bị chặn · quyết định đã đổi.

| Task | Trạng thái | Ngày | Ghi chú |
|---|---|---|---|
| G3-T0 Sync repo + manifest + README | ⬜ chưa làm | | |
| G3-T1 ScriptProperties token/kỳ | ⬜ chưa làm | | *(ghi: `_outbox` có bao nhiêu dòng `failed`/401?)* |
| G3-T2 Vá nền BangLuong (9 vá) | ⬜ chưa làm | | |
| G3-T3 Test harness + baseline | ⬜ chưa làm | | |
| G3-S1 Đo phân bố nhóm (S1a) + `departments` BQ (S1b) | ⬜ chưa làm | | *(ghi: bảng `team → số người`, `\|Set\|`, số ô rỗng, tỷ lệ nhóm lớn nhất · bảng `departments → số người` của 98 dòng · số NV `ON` trống bộ phận · HN1000 có trên bảng lương không? · **cổng: có giữ cột `Phòng ban (HRIS)` không?**)* |
| G3-S2 Scopes + re-authorize | ⬜ chưa làm | | *(ghi: ngày làm — phải ngoài kỳ chốt lương)* |
| G3-S3 Spike export + tải file | ⬜ chưa làm | | *(ghi: (a) tải được? (b) bao nhiêu giây? (c) Excel mở được?)* |
| G3-S4 Spike đọc tag Doc | ⬜ chưa làm | | *(ghi: **DÁN DANH SÁCH TAG THẬT VÀO ĐÂY** + `PV_TAG_ALIAS`)* |
| G3-T4 Fix FE PayslipDetail | ⬜ chưa làm | | |
| G3-T5 Khởi tạo `PhongBanXuat.gs` (config + hàm tiện ích) | ⬜ chưa làm | | *(ghi: `gSkipCols_().length`? `xlBoCotXuat_().length`? `test_serialize()` pass?)* |
| G3-T6 Chèn cột `Phòng ban (HRIS)` (tùy chọn, sau S1b) | ⬜ chưa làm | | *(ghi: S1b có dữ liệu không? đã chạy trên bản sao? diff chỉ `+1 header`?)* |
| G3-T7 Tách gBuildPhieu_ | ⬜ chưa làm | | *(ghi: payload byte-identical? có/không)* |
| G3-T8 Preview server | ⬜ chưa làm | | |
| G3-T9 Preview client | ⬜ chưa làm | | |
| G3-T10 Export server | ⬜ chưa làm | | *(ghi: cơ chế cuối cùng dùng — N-SS hay CSV?)* |
| G3-T11 Export dialog | ⬜ chưa làm | | *(ghi: chị Trang tự làm được không? hỏi mấy câu?)* |
| G3-T12 PDF từng phiếu | ⬜ chưa làm | | |
| G3-T13 Menu + docs + contract | ⬜ chưa làm | | |

**Câu hỏi đã gửi người chốt** *(điền khi gửi, cập nhật khi có trả lời)*

| # | Câu hỏi | Gửi ai | Ngày gửi | Trả lời | Ngày trả lời |
|---|---|---|---|---|---|
| 1 | HN0084 tách dòng hay cấp mã riêng | Trang + Hiếu | | | |
| ~~2~~ | ~~Chị Trang tự gõ `Nhóm gửi` ô vàng?~~ | — | — | **ĐÓNG** — cột xoá, nhóm lấy từ `team` BQ tự động | — |
| 3 | 2 cột mới có vào phiếu NV? | Trang | | | |
| 4 | Ai sửa tag Doc `1Jd0…` | Trang | | | |
| 5 | Lịch đổi scope (G3-S2) | Trang | | | |
| 6 | Khấu trừ thuế đã có số lúc gửi tầng 1? | Trang / Vân | | | |
| 7 | `_outbox` có dòng 401 nào không | Minh kiểm | | | |
| **8** ⭐ | **File Excel gửi cho AI?** (leader hay chính NV) — Q4a đứng/sập theo câu này | Trang | | | |
| **9** | Danh sách nhóm nhận thật: An Bình vs Linh Đàm chung/riêng? Inhouse 1 mấy leader? | Trang + Hiếu | | | |
| **10** | `t.departments` có dữ liệu thật? khớp bản đếm M4:54 không? | Chung | | | |
| **11** | Có sửa `CASE ... AS team` (`:18-28`) không? | Chung | | | |
| ~~**12**~~ | ~~`Nhóm gửi` lâu dài sống ở đâu? (nợ kỹ thuật R26)~~ | — | — | **ĐÓNG** — R26 eliminated; `CASE ... AS team` trong BQ là nguồn sự thật dài hạn | — |
