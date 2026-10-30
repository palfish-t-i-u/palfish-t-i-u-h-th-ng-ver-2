# IH2 L8: tự điền GV khi báo đơn + header L8 phải nằm A1:BZ3

**Ngày**: 30/10/2026 · **File**: `backend/cs_l8_order.py` (`gv_label`, `gv_for_course`, `_fill_blanks`), `backend/cs_handover_sheet.py` (`_read_header_cells`) · **Test**: `backend/tests/test_cs_l8_order.py` (TestGvLabel, TestGvFill)

## Problem
Đơn IH2 app ghi vào "Tổng hợp L8" nhưng cột GV (Phil/Native + b/tuần) trống, team điền tay chậm (7/15 đơn app gần nhất còn trống). Cùng ngày có 2 đơn mới (CC-2785, CC-2754) kẹt `not_found`.

## Trap
1. **Header L8 bị dời xuống hàng 1399** (chị Ly kéo hàng, tạo filter view + đóng băng 1399 hàng) → `_read_header_cells` chỉ đọc A1:BZ3 → trả `[]` → app BỎ QUA ghi L8 **im lặng** (không log), đơn kẹt `not_found`. Dấu hiệu trong lịch sử phiên bản: mọi dòng "sửa" cùng 1 phút của 1 người = dời hàng, không phải ghi đè.
2. **Filter view chặn `moveDimension` hàng tiêu đề** ("Bạn không thể di chuyển hàng tiêu đề của bộ lọc") → phải xoá + tạo lại filter view cùng tiêu chí.
3. Bản sao lưu/snapshot có số hàng lệch với sheet đang chạy sau khi dời hàng → báo sai số hàng cho user. Luôn quy đổi theo sheet LIVE.
4. Sheet locale vi: công thức qua API dùng dấu `;`, không `,`.

## Insight
- Tên gói app đã đủ để suy GV: `N/W` = N buổi/tuần, PHI→"Phil", US-UK→"Native". Kiểm chứng 264 đơn IH2 (UID+tiền ±3%): đúng 249; 3 lệch vì khách tăng cường lên 3b/tuần (app chỉ có gói 2/W — sale sửa tay được); 7 chưa điền; 5 tên gói rỗng/tên tay. Gói học `base+bonus` đúng 254/259.
- **Cột GV là công tắc "bàn giao" của IH2**: 14/14 đơn gần đây — có GV ⇔ `handover_raw` (Handover date and time, nguồn `handover_ts` của SOP1) được đóng dấu; GV trống ⇔ không có dấu giờ. Đơn app ghi nhưng GV trống bị trễ dấu giờ tới 6 ngày/không có. Cơ chế đóng dấu CHƯA xác minh (đang khớp tương quan).
- View `v_sop1_sop2_intake_greeting` (BQ cs_operation) KHÔNG đọc GV/Gói học; `row_key = uid|ngày chuyển tiền|số tiền#n` nên sale sửa GV/Gói học không sinh ticket mới. Sửa UID/Số tiền/Ngày chuyển tiền thì đổi row_key.

## Rule
- GV chỉ điền vào ô TRỐNG (append / stamped / ambiguous / cleaned / exists), không bao giờ đè — sale đổi 3b/tuần thì giữ. Nhãn khớp đúng option dropdown cột GV của L8; có dropdown mà không có option → để trống; thiếu `N/W`, thiếu loại PHI/US-UK hoặc CONFLICT → để trống.
- Cấu trúc sheet L8 team: header phải ở A1:BZ3. Team muốn xem đơn mới → dùng filter view trên hàng 1, KHÔNG dời tiêu đề.
- Theo dõi sau deploy: đơn IH2 mới có GV ngay lúc ghi → kiểm `handover_raw` trong `cs_operation.ban_giao_kh_moi_team2` có được đóng dấu không (xác minh cơ chế). Mốc đồng hồ SLA 2h của SOP1 dịch sớm hơn trước (từ lúc báo đơn).
