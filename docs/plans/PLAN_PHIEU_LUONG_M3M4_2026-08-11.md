# PLAN M3/M4 — Phiếu lương (11/08/2026)

Nối tiếp M1/M2. Chỉ đưa plan — **chưa build tới khi Minh duyệt** ([[feedback_plan-before-code]]).

## Bối cảnh & phạm vi
- **Phạm vi: CHỈ team HN** (offline HN + Inhouse 1+2 + phần còn lại). **KHÔNG tính HCM.**
  Chốt chị Trang 07/08/2026 (group "PF | App tính lương + Com tự động"): *"trừ HCM, còn lại tính hết"*.
- Nguồn M1/M2 (Chung): 4 bảng `C_view_bang_*` @ `pf-salary.payroll`, **98 NV = 100% HN**.
- Vai: **Minh = M3 (BQ→Sheet) + M4 (module app)**; Chung = giữ view nguồn.

## Nguyên tắc thiết kế (khớp 5 tiêu chí)
- **Hợp đồng cột** — M3/M4 chỉ đọc 1 bảng ổn định `C_view_bang_luong_truoc_thue` (+ bảng sau-thuế khi có); cột mới thuế/NPT/net = **APPEND**. Chốt trong `docs/PHIEU_LUONG_CONTRACT.md`. ⚠ Chung đã đổi tên `C_bang_*`→`C_view_bang_*` 1 lần → đúng lý do cần contract.
- **Pre-fill + chốt tay** — mỗi chỉ số cần xác nhận có cặp cột `[X]_tudong` (BQ đổ) + `[X]_chot` (Trang/Vân điền tay); giá trị dùng = `COALESCE([X]_chot, [X]_tudong)`. Áp cho: công, com, phụ cấp khai tay, NPT.
- **Tách INPUT/COMPUTE** — 2 tab Trang/Vân là input, không dính logic Chung → làm ngay.
- **Không thêm hạ tầng** — BQ→Sheet Google-native (scheduled query / Apps Script) + notify Zalo/email hạ tầng cũ.

## M3 — BQ → Google Sheet
- **G1-T7a** · **Khung Sheet + contract** — 1 dòng/NV (98 HN); cột nhóm [cơ bản | com | trợ cấp | BHXH]; cặp `_tudong`/`_chot` + COALESCE cho công/com/phụ cấp/NPT; chừa cột Thuế/NPT/Net. Viết `docs/PHIEU_LUONG_CONTRACT.md`. *(làm ngay)*
- **G1-T7b** · **2 tab input Trang/Vân** — tab Trang chốt (công / com / NPT ca thiếu năm / quy tắc KPI + com Inhouse 2); tab Vân nhập (phụ cấp xăng-trách nhiệm / bậc thuế). Format đổ-ngược-được. *(làm ngay, không chờ Chung)*
- **G1-T7c** · **Đấu nguồn trước thuế** — đổ `C_view_bang_luong_truoc_thue` vào tab kết quả; cột Thuế/NPT/Net để trống. *(khi Chung chốt contract)*
- **G1-T8** · **Refresh + khoá** — scheduled query / Apps Script kéo BQ→Sheet; khoá vùng auto, mở vùng Trang/Vân. *(sau T7c)*

## M4 — Module phiếu trong app GMV Manager
- **G1-T9** · **Màn phiếu + RBAC + khoá** — route/tab đọc từ contract; 1 phiếu = 1 dòng; RBAC (NV xem phiếu mình, leader/KT xem team); khoá MK; layout nhóm cột như trên. *(sau T7c)*
- **G1-T10** · **2 nút xem-xét / xác-nhận** — "đã xem" / "thắc mắc", lưu trạng thái. *(sau T9)*
- **G1-T11** · **Ghi ngược + thông báo** — phản hồi ghi ngược; phát phiếu Zalo/email (hạ tầng cũ). *(sau T10)*

## Thứ tự + hấp thụ thay đổi từ Chung
| Nhóm | Task | Điều kiện | Mốc |
|---|---|---|---|
| Làm ngay | T7a · T7b | không chờ ai | →13/8 |
| Có nguồn trước thuế (đã có) | T7c · T8 · T9 | Chung giữ contract | sau 13/8 |
| Chờ | cột Thuế/NPT/Net · T10 · T11 | bảng sau-thuế + Vân bậc thuế + Trang NPT | mở |

- Chung đổi view/logic → chỉ sửa `PHIEU_LUONG_CONTRACT.md` + map thêm cột, **không đụng M3/M4 core**.
- Chung ra bảng sau-thuế → contract trỏ sang bảng mới, cột Net tự populate.

## Nguồn hiện có (BQ `pf-salary`)
- `payroll`: `C_view_bang_luong_truoc_thue` (gộp 22 cột, 98 HN) + 3 bảng thành phần (`C_view_bang_luong_co_ban_theo_ngay_cong` / `C_view_bang_thuong_com` / `C_view_bang_tro_cap_bao_hiem`); `C_raw_staff_info_merged` (NPT = `dependent_information`, join `code`); `C_cham_cong`; `C_rate_*`.
- `palfish_gmv_public`: `v_gmv_thang_truoc_theo_nhan_vien`, `v_so_doanh_thu_nhom_loai`. (Com HN đã gộp sẵn vào bảng payroll qua name→code; HCM = import "HCM REV" → **ngoài phạm vi, bỏ**.)

## Chưa có (chờ)
- Thuế TNCN, giảm trừ NPT, lương thực lãnh (net) — cột APPEND khi Chung ra bảng sau-thuế.
- Phụ cấp khai tay (Vân nhập). Breakdown `bonus_com_ban_moi/gioi_thieu/tai_ky` đang null (hỏi Chung).

## 5 tiêu chí ✓
Triệt để (contract + pre-fill/override phủ mọi field) · Không lỗi con (cột APPEND, COALESCE) · Không tăng hạ tầng (Google-native + notify cũ) · Tối ưu token (plan cô đọng) · Bền qua compact (task self-contained, contract là 1 file ngữ cảnh duy nhất).
