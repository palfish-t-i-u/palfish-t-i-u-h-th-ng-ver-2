# Đổi date-serial (Excel/Sheets/DingTalk) sang ngày: FLOOR, không round — kẻo lệch +1 ngày chiều/tối

**Related files:** `palfish-internal-notes/gmv-scripts/sync_vn_to_allfile.py` (`ser_to_ymd`), `palfish-internal-notes/gmv-scripts/sync_tail.py` (`ser_to_ymd`, `parse_ymd`)

**Problem:** Sau cutover DingTalk→All File (25/9), 2 đơn HCM ngày **24/9** bị sync ghi thành **25/9** trên sheet → gmv_ledger tính sai sang 25/9.

**Trap:** Hai lớp che nhau. (1) Tưởng lỗi do cutover — sai, bug có từ đầu (tab Auto lệch vậy từ 18/9, cutover chỉ làm lộ lên tab tay). (2) Tưởng chỉ do sale nhập sai — sale CÓ chọn kèm giờ (`bank day` = `2026/9/24 21:43:00`, không phải ngày trơn), nhưng thủ phạm biến 24→25 là **hàm đổi serial của mình**. Ô có giờ → DingTalk API (`dateTimeRenderOption=SERIAL_NUMBER`) trả serial = `D + phần_giờ` (21:43 ≈ D+0,90). `ser_to_ymd` dùng `int(round(serial))` → **làm tròn LÊN** D+1 = 25/9. Mọi ô ngày có giờ ≥ 12:00 (frac ≥ 0,5) đều bị đẩy +1; ngày trơn (frac=0) không sao → chỉ vài dòng sale nhập-kèm-giờ dính nên khó thấy.

**Insight:** Lấy phần NGÀY của một datetime-serial luôn là **floor** (bỏ phần giờ), KHÔNG BAO GIỜ round — round chỉ đúng khi làm tròn PHÚT (`frac_to_hhmm`). `int()` của Python truncate về 0 = floor cho số dương. Thêm `+1e-6` chống sai số float khiến ngày trơn `D` bị biểu diễn thành `D-epsilon` → floor nhầm về D-1; `1e-6` ngày ≈ 0,09 giây, không đủ đẩy giờ tối (0,9) sang hôm sau. Build đọc `FORMATTED_VALUE` (chuỗi hiển thị) nên không dính trực tiếp — sửa ở khâu GHI sheet là build tự đúng theo.

**Rule:** Đổi serial (Excel/Sheets/DingTalk, epoch 1899-12-30) sang ngày: `int(float(n) + 1e-6)`, KHÔNG `int(round(n))`. Áp cho MỌI hàm đọc cột ngày (`ser_to_ymd`, `parse_ymd`, so-khớp "hôm nay"). Giữ `round` cho hàm đổi phần giờ→phút. Song song: nhắc người nhập cột ngày chỉ chọn ngày (vệ sinh input), nhưng ĐỪNG coi đó là chỗ dựa — pipeline phải tự miễn nhiễm vì lỗi người sẽ tái diễn.

**Verify:** `py -c` với 4 mốc cùng ngày 24/9: `21:43`, `23:59` → round ra **25/9** (sai), floor ra **24/9** (đúng); `09:42`, ngày-trơn → cả hai ra 24/9. Sau deploy + re-sync: dòng HCM về đúng 24/9; gmv_ledger ngày 24/9 tăng đúng bằng tổng tiền các đơn dời về (khớp từng đồng), 25/9 giảm tương ứng.
