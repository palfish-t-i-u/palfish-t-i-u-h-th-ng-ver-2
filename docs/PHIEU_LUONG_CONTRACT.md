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
| 12 | Hỗ trợ ăn trưa | BQ `tro_cap_an_trua` (660k) | auto |
| 13 | Tiền hỗ trợ máy tính | BQ `tro_cap_may_tinh` (700k) | auto |
| 14 | Hỗ trợ tiền xe + PC trách nhiệm | khai tay | **Vân/Trang nhập** |
| 15 | Khấu trừ thuế | tính (mục Thuế dưới) | **Vân chốt** |
| 16 | Bù tiền | — | **Trang nhập** |
| 17 | Note | — | Trang |
| 18 | KPI | cơ chế level→KPI | auto |
| 19 | Tỉ lệ đạt KPI | GMV thực đạt / KPI | auto |
| 20 | % Com ≥100% | cơ chế level→COM% | auto |

## Cơ chế com (từ sheet IH1 chị Trang)
Level 1–6 → Lương cứng {8; 9,5; 11,5; 14,5; 16,5; 18,5}tr · KPI {110;160;220;260;320;390}tr · COM {2,5;5;6;6,5;7,5;8}%. Quy tắc: ≥115% KPI→cứng×110% · ≥125%→×120% · <100%→×95% (vẫn hưởng com theo mốc doanh thu đạt). Thử việc: 100% cứng + com 2,5%. ⚠ Còn chốt với Trang: IH2 tính "bán mới" hay "bán mới+refer".

## Thuế + BH (mẫu chị Vân → để ra Net)
- Giảm trừ: bản thân **15,5tr** + **6,2tr × số NPT** (NPT = đếm năm sinh `dependent_information`).
- Thu nhập tính thuế = Tổng thu nhập − Tổng giảm trừ − BH. Thuế TNCN lũy tiến (⚠ chốt biểu với Vân). CTV/thử việc: 10% flat.
- BH trừ lương = **BHXH 8% + BHYT 1,5% + BHTN 1%** trên lương đóng BH.
- Cột APPEND (chưa có ở BQ, thêm khi tính): `Tong_thu_nhap`, `Giam_tru_ban_than`, `Giam_tru_NPT`, `Thu_nhap_tinh_thue`, `Thue_TNCN`(=Khấu trừ thuế), `Luong_thanh_toan (Net)`.

## Cột Trạng thái (cuối bảng — giao tiếp app)
| Cột | Ai | Nghĩa |
|---|---|---|
| `Xác nhận thông tin` (tick) | Trang/Leader | dòng data đã đúng, sẵn sàng |
| `Gửi phiếu` (tick/nút) | Trang → app | phát hành phiếu lương |
| `NV đã xem` | app ghi ngược | nhân viên đã mở phiếu |
| `NV phản hồi` | app ghi ngược | Đồng ý / Thắc mắc |

→ thay 4 cột `merged-doc` cũ; app M4 tự sinh + gửi phiếu theo mẫu Doc `1Jd0…`.

## Lớp máy (tab helper ẩn)
BQ đổ `C_view_bang_luong_truoc_thue` (+ NPT từ `C_raw_staff_info_merged`) vào tab ẩn `_data` (tên cột máy, khoá `code`). Bảng chính tham chiếu `_data` + cột chốt tay qua `COALESCE(chốt, auto)`. Refresh chỉ ghi tab `_data`, KHÔNG đè ô người nhập.

## Quyết định còn mở
1. **IH1/IH2:** gộp 1 bảng (thêm cột Team) hay giữ 2 tab như chị Trang? (đề xuất: 1 bảng + cột Team)
2. **Thuế:** app tự tính lũy tiến (pre-fill, Vân chốt) hay Vân giữ sheet riêng rồi nhập số? (đề xuất: tự tính pre-fill)
3. Biểu thuế lũy tiến + quy tắc com IH2 → chốt với Vân/Trang.

---
*v2 — bám mẫu thật chị Trang/Vân. Chờ Minh duyệt trước khi sinh Apps Script.*
