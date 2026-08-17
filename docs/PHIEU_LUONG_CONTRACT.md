# PHIẾU LƯƠNG — HỢP ĐỒNG CỘT (CONTRACT) v2

> Nguồn sự thật cho Sheet + module M4. **M3/M4 chỉ đọc theo contract này.** Chung chỉ được **APPEND cột**, không đổi tên/xoá cột, không đổi tên bảng. Đổi gì → sửa file này trước.

- **Sheet:** `1S6CjG8tWzFVYjYJfgT0BfCExIxhCOu_Lw7SU-_jEkBI` ("PalFish - Bảng lương tự động")
- **Phạm vi:** HN only (98 NV). KHÔNG HCM.
- **Nguyên tắc:** output = **1 BẢNG DUY NHẤT y hệt bảng lương chị Trang** + cột Trạng thái ở cuối (giao tiếp app). KHÔNG tách nhiều tab người-đọc. Nhãn tiếng Việt của các chị; tên máy/join/COALESCE nằm ở **tab helper ẩn**.

## Mẫu gốc (mô phỏng 100%)
- Bảng lương IH1 `19iKv3IJ5BT6r5vDprtsN8dosDC02kosVeTFgoFHl390` · IH2 `1GaZQzx-eR-sEVU_OE610F7xcCePjahtPuIh4sdgu8vc`
- Phiếu lương (Doc merge) `1Jd0TvdJvh7EwsqvPXKyEoLdCDQHXXC_hjmS0TzIN3hs`
- Thuế+BH mẫu chị Vân: `Downloads/task phiếu lương/Lương test.xlsx`

## Bảng chính (mirror chị Trang) — cột & nguồn
| # | Cột (nhãn chị Trang) | Nguồn | Pre-fill/Chốt |
|---|---|---|---|
| 1 | STT | tự đánh | auto |
| 2 | Name | BQ `full_name` | auto |
| 3 | Chức danh | BQ `title_job` | auto |
| 4 | **Tổng lương + thưởng** | công thức (headline) | auto |
| 5 | Tổng lương | công thức | auto |
| 6 | Lương cơ bản | BQ `basic_salary` | auto |
| 7 | Công | BQ `tong_cong` | **Trang chốt** |
| 8 | LCB theo ngày công | BQ `luong_co_ban_theo_ngay_cong` | auto (theo Công chốt) |
| 9 | Thưởng COM | BQ `bonus_com` | **Trang chốt** |
| 10 | Bảo hiểm + note | BQ `bao_hiem_xa_hoi` + note | auto |
| 11 | GMV | BQ `gmv_vnd` | auto |
| 11a | GMV bán mới | BQ `gmv_ban_moi` | auto *(Chung bổ sung BQ 12/8)* |
| 11b | GMV giới thiệu | BQ `gmv_gioi_thieu` | auto |
| 11c | GMV tái ký | BQ `gmv_tai_ky` | auto |
| 12 | Hỗ trợ ăn trưa | BQ `tro_cap_an_trua` (660k) | auto |
| 13 | Tiền hỗ trợ máy tính | BQ `tro_cap_may_tinh` (700k) | auto |
| 14 | Hỗ trợ tiền xe + PC trách nhiệm | khai tay | **Vân/Trang nhập** |
| 15 | Khấu trừ thuế | tính (mục Thuế dưới) | **Vân chốt** |
| 16 | Bù tiền | — | **Trang nhập** |
| 17 | Note | — | Trang |
| 18 | KPI | cơ chế level→KPI | auto |
| 19 | Tỉ lệ đạt KPI | GMV thực đạt / KPI | auto |
| 20 | % Com ≥100% | cơ chế level→COM% | auto |

## Cơ chế com theo nhóm (cập nhật 12/8 — trao đổi Chung-Trang)

### Inhouse 1 & 2
Level 1–6 → Lương cứng {8; 9,5; 11,5; 14,5; 16,5; 18,5}tr · KPI {110;160;220;260;320;390}tr · COM {2,5;5;6;6,5;7,5;8}%. Quy tắc: ≥115% KPI→cứng×110% · ≥125%→×120% · <100%→×95% (vẫn hưởng com theo mốc doanh thu đạt). Thử việc: 100% cứng + com 2,5%. ⚠ Còn chốt với Trang: IH2 tính "bán mới" hay "bán mới+refer".

### Sale Leader — NHẬP TAY (⚠ KHÔNG auto)
COM Leader do **Đào Trang** tính toán và gửi HR, HR không tính. KPI/mức COM **thay đổi hàng tháng**, khác cơ chế HR. Ví dụ T8/2026: Team Huongpt (25tr, KPI 1.75 tỷ): 80-99%→1%, 100%→1.5%, 110%→2%, ≥120%→2.5%. → M3: cột COM leader = **ô input vàng** (Đào Trang hoặc Trang điền), không formula.
Cần từ Đào Trang: (1) cơ chế tính COM leader, (2) danh sách sale thuộc từng leader.

### Sale Offline — logic NGƯỢC (cập nhật 12/8)
Bảng cơ chế (từ 01/04/2026): Level 1–6 → Salary {8;9;10;11;12;15}tr · KPI {80;100;120;150;200;250}tr · COM KPI {5;6;7;8;9;10}%. Phụ cấp: ăn trưa 660k, máy tính 700k, xe 200k. Đặc điểm:
- GMV = 0 vẫn nhận 8tr (cả thử việc/chính thức), không thưởng không phạt
- **Doanh số tính ngưỡng COM = CHỈ bán mới, KHÔNG gồm gia hạn/renew**
- Part-time: KHÔNG có KPI/COM, chỉ lương giờ + phụ cấp cơ bản

### Telesale / tư vấn viên thử việc (file cơ chế mới Trang gửi)
- <40tr doanh số bán mới → 0% COM
- 40 đến <80tr → 4%
- ≥80tr → 5%
- Doanh số ngưỡng = CHỈ NGUỒN KHÁCH HÀNG MỚI

### Thưởng bổ sung (⚠ Trang chưa chắc, cần xem lại phiếu lương)
- **IH1:** Top GMV (2tr, 1tr) + Top refer (1tr, 500k, 300k)
- **IH2:** Thưởng đạt KPI sớm (2tr, 1tr, 500k — càng sớm trong tháng càng nhiều)
→ M3: **ô nhập tay** cho đến khi Trang xác nhận cơ chế rõ ràng.

## Thuế + BH (mẫu chị Vân → để ra Net)
- Giảm trừ: bản thân **15,5tr** + **6,2tr × số NPT** (NPT = đếm năm sinh `dependent_information`).
- Thu nhập tính thuế = Tổng thu nhập − Tổng giảm trừ − BH. Thuế TNCN lũy tiến (⚠ chốt biểu với Vân). CTV/thử việc: 10% flat.
- BH trừ lương = **BHXH 8% + BHYT 1,5% + BHTN 1%** trên lương đóng BH.
- Cột APPEND (chưa có ở BQ, thêm khi tính): `Tong_thu_nhap`, `Giam_tru_ban_than`, `Giam_tru_NPT`, `Thu_nhap_tinh_thue`, `Thue_TNCN`(=Khấu trừ thuế), `Luong_thanh_toan (Net)`.

## Cột Trạng thái (cuối bảng — quy trình 2 tầng)

**Quy trình gửi phiếu THẬT** (xác nhận qua chat Trang 3–4/8 + họp 6/8):
`Gửi BL trước thuế → NV confirm → Gửi BL sau thuế → NV confirm → KT đi lệnh ngân hàng.`
→ **5 cột checkbox** cuối bảng, **interlock TUẦN TỰ**:

| # | Cột | GĐ1 — bây giờ (app chưa gửi) | M4 — sau (tự động) |
|---|---|---|---|
| 1 | `Xác nhận thông tin` | Trang tick tay (QC data đúng) | Trang tick tay |
| 2 | `Gửi BL trước thuế` | Trang tick tay (≈ gửi Zalo) | app tự gửi phiếu trước thuế |
| 3 | `NV xác nhận trước thuế` | Trang tick tay (theo NV reply Zalo) | app ghi ngược (NV bấm in-app) |
| 4 | `Gửi BL sau thuế` | Trang/KT tick tay | app tự gửi phiếu sau thuế |
| 5 | `NV xác nhận sau thuế` | Trang tick tay | app ghi ngược |

- **Interlock** (`PhieuLuongGate.gs`): (2) chỉ tick được sau (1); (4) chỉ tick được sau (3). Bỏ tick điều kiện → **tự thu hồi** nút gửi phụ thuộc. Trạng thái tick lưu tab ẩn `_gate_state` (SỐNG qua refresh BQ, key mã NV+kỳ).
- **Dual-mode:** cột 3+5 — GĐ1 Trang tick tay theo Zalo; M4 app ghi ngược. **Cùng cột, đổi nguồn** (mimic legacy trước).
- **Đã BỎ "NV đã xem"** — quy trình thật không track "đã mở", chỉ cần **confirm**.
- ⚠ Lệch spec gốc 06/08 ("tick đủ ô → TỰ bắn"): giữ **nút bấm tay** cho an toàn — báo lại Trang/Vân feedback thứ 5.

Nút "Gửi BL ..." tick → xếp phiếu vào `_outbox` (tag `truoc_thue`/`sau_thue`) → `flushOutbox` POST sang app (payload cuối doc). ⚠ `appEndpoint=''` → dry-run tới khi M4 có endpoint. App M4 render phiếu theo mẫu Doc `1Jd0…`.

## Lớp máy (tab helper ẩn)
BQ đổ `C_view_bang_luong_truoc_thue` (+ NPT từ `C_raw_staff_info_merged`) vào tab ẩn `_data` (tên cột máy, khoá `code`). Bảng chính tham chiếu `_data` + cột chốt tay qua `COALESCE(chốt, auto)`. Refresh chỉ ghi tab `_data`, KHÔNG đè ô người nhập.

## Edge case: Trần Thị Nhung (HN1000) — NV ảo
Tách ra từ lương Đào Thị Trang (HN0001). Không có trong HRIS, chỉ bảng thuế. Thuế = NV bình thường. Tổng Nhung + Trang = lương thực Trang. Phụ cấp: Trang (xe 3tr, ĐT 3tr), Nhung (xe 1tr, ĐT 1tr). → M3: cần dòng riêng cho Nhung trên bảng thuế, phần lương pre-fill từ giá trị Trang tách.

## 5 case sai lệch dữ liệu (Trang đối chiếu — 12/8)
1. Đào Phương Thảo (IH1): công 23.5 vs 24 (lỗi làm tròn)
2. Phan Thị Hương: công 25 → đáng ra 24
3. Vũ Thu Thuỷ: HRIS "chính thức" vs IH "thử việc" → lương sai
4. Mai Thị Liên (IH2): file leader 75tr < 80tr nhưng hệ thống ghi vượt (⚠ nghi đẩy số)
5. Kim Thương (IH1): GMV 255tr vs 261tr → lệch level COM
→ Trang HR đối chiếu. Hệ thống cần cơ chế so 2 nguồn (Phase 3 data warning).

## Quyết định còn mở
1. **IH1/IH2:** gộp 1 bảng (thêm cột Team) hay giữ 2 tab như chị Trang? (đề xuất: 1 bảng + cột Team)
2. **Thuế:** app tự tính lũy tiến (pre-fill, Vân chốt) hay Vân giữ sheet riêng rồi nhập số? (đề xuất: tự tính pre-fill)
3. Biểu thuế lũy tiến + quy tắc com IH2 → chốt với Vân/Trang.
4. **Cơ chế COM Leader:** chờ Đào Trang cho cơ chế + danh sách sale/leader.
5. **Thưởng IH1/IH2 bổ sung:** Trang xem lại mức thưởng chính xác.

## Cổng gửi phiếu sang app (G1-T8) — `PhieuLuongGate.gs`

Xây SẴN cổng, **chưa nối** (app M4 chưa có). Pattern = OUTBOX (giống DingTalk/Zalo).

**Luồng:** Trang tick `Xác nhận thông tin` → tick `Gửi phiếu` → installable `onEdit` (handler `guiPhieuOnEdit`) enqueue 1 dòng vào tab ẩn `_outbox` (idempotent theo `code|kỳ`) → `flushOutbox()` POST sang `GATE_CFG.appEndpoint`.

**Trạng thái CHƯA NỐI:** `GATE_CFG.appEndpoint=''` → flush chạy **dry-run** (giữ `pending`, không gọi mạng). Khi M4 xong: điền `appEndpoint` + `gateToken` → flush bắn thật, **không đổi gì khác**.

**Cài/vận hành:** menu ⚙ Bảng lương → `🔌 Cài đặt cổng gửi phiếu` (1 lần) · `📤 Gửi phiếu đang chờ` (flush) · `📋 Xem hàng đợi gửi`. Mỗi kỳ đặt `GATE_CFG.kyLuong='YYYY-MM'` (trống = tháng trước).

**Contract payload (POST JSON) — M4 phải nhận đúng dạng này:**
```json
{
  "meta": { "source":"sheet-gate", "version":1, "code":"HN0001", "ky_luong":"2026-07",
            "stage":"truoc_thue", "stage_label":"trước thuế", "enqueued_at":"<ISO>", "sheet_id":"<id>" },
  "phieu": { "<Nhãn cột chị Trang>": <giá trị>, "...": "... (toàn bộ cột bảng chính, TRỪ 5 cột trạng thái)" }
}
```
- `meta.stage` = `truoc_thue` | `sau_thue` (2 tầng phiếu). M4 render view theo tầng.
- Header `X-Gate-Token: <gateToken>` để endpoint verify.
- **Idempotency key = `meta.code + meta.ky_luong + meta.stage`** → M4 phải **upsert** (gửi lại không tạo trùng; mỗi NV/kỳ có 2 bản: trước & sau thuế).
- Trả **2xx** = nhận thành công (outbox → `sent`); khác 2xx = `failed` (retry tối đa 5 lần).
- **Chiều ngược (M4 → sheet, chưa build):** khi NV bấm confirm in-app, app ghi ngược cột `NV xác nhận trước thuế` / `NV xác nhận sau thuế` theo `stage`.

**Việc M4 (app) phải làm khi build:**
1. Endpoint `POST /api/payroll/payslips/receive` (hoặc URL bất kỳ, khớp `appEndpoint`) nhận contract trên, verify token, upsert theo key idempotent, render phiếu theo mẫu Doc `1Jd0…`.
2. (G1-T11) Ghi ngược `NV đã xem` / `NV phản hồi` lên Sheet — chiều app→sheet, chưa làm.

---
*v3 — thêm cổng gửi phiếu G1-T8 (outbox, chưa nối app). v2: bám mẫu thật chị Trang/Vân.*
