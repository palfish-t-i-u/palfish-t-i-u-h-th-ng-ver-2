# Ghi Google Sheet có cột bị bảo vệ (protected range toàn-cột)

**Problem**: Service account đã là Editor cả file, nhưng `values().append(... insertDataOption="INSERT_ROWS")` vẫn trả `400 "You are trying to edit a protected cell or object"`. Dù hàng ghi KHÔNG đặt giá trị nào vào cột bị khóa.

**Trap**:
- Tab có protected range kiểu **toàn cột** (vd `T:T`, `U:U` đặt "Chỉ xem") → mọi thao tác chèn hàng (`INSERT_ROWS`) đều chèn ô mới vào các cột đó = sửa cột protected → bị chặn, kể cả khi value rỗng.
- `append` ghi nguyên 1 dải ô liền kề từ cột gốc tới cột cuối của mảng values. Nếu cột cần ghi (vd Contact ID ở `V`) nằm **sau** cột khóa (`T`,`U`), dải append phủ qua `T`,`U` → chạm ô protected.
- Chia Editor cả file KHÔNG đủ: protected range có danh sách người được sửa RIÊNG. Nhưng bắt chủ sheet thêm SA vào ngoại lệ là phiền + dễ quên khi tạo tab mới.

**Insight**: Né hẳn cột khóa phía code, không đụng tới setting sheet:
1. Đọc `spreadsheets().get(fields="sheets(properties(title),protectedRanges(range(...)))")`, lấy các cột bị khóa toàn-cột (range không giới hạn hàng: `startRowIndex`/`endRowIndex` = None).
2. Cắt hàng thành các **đoạn cột liền kề**, bỏ cột khóa (vd `A..S` + `V`, chừa `T`,`U`).
3. Ghi đoạn đầu bằng `append` nhưng với **`insertDataOption="OVERWRITE"`** (ghi đè hàng trống sẵn dưới bảng, KHÔNG chèn hàng → không chạm cột khóa). Lấy số hàng từ `res["updates"]["updatedRange"]`.
4. Các đoạn còn lại: `values().update` đúng hàng đó (cột V không khóa → OK).

**Rule**: Khi ghi vào GSheet của người khác quản lý mà tab có thể có protected range: (a) dùng `OVERWRITE` thay `INSERT_ROWS`; (b) tự đọc protectedRanges và cắt row né cột khóa; KHÔNG phụ thuộc chủ sheet gỡ/cấp ngoại lệ. Code: `backend/cs_handover_sheet.py` `_protected_cols` / `_row_segments` / `_append_row` (commit f38bc5c).
