# Google Sheets tự parse chuỗi "YYYY-MM" thành Date khi ghi vào ô → so sánh kỳ gãy

**Related files:** `docs/apps-script/PhieuLuongGate.gs` (`restoreGateTicks_`, `gSaveState_`, `guiPhieuOnEdit`), `docs/apps-script/BangLuong.gs` (`capNhatTuBigQuery`)

**Problem:** Tick 5 cột trạng thái gate trên "Bảng lương" rồi bấm "Cập nhật bảng lương" → tick bị mất, dù cơ chế lưu (`_gate_state`) + khôi phục (`restoreGateTicks_`) đã có và trigger `guiPhieuOnEdit` chạy 0% lỗi.

**Trap:** Suy từ code thì mọi thứ đúng (state có ghi, restore có gọi, cùng `kyLuongHienTai_()`), dễ đổ cho "trigger chưa cài" hoặc "restore không chạy". Sự thật chỉ lộ ra khi **dump `_gate_state` thật**: cột `ky` được ghi bằng chuỗi `"2026-08"` nhưng đọc lại ra **Date `Wed Jul 01 2026 ...`** — Google Sheets **tự nhận diện `"YYYY-MM"` là ngày tháng** (auto-parse) khi `setValues`/`appendRow`. `restoreGateTicks_` so `String(data[i][2]) !== ky` = `"Wed Jul 01 2026..." !== "2026-08"` → **luôn true → skip mọi dòng → byCode rỗng → return sớm → không tick lại gì**. Cột `id` (`code|ky`, VD "HN0002|2026-07") KHÔNG bị parse (có chữ + `|`) nên trông vẫn đúng — càng dễ nhầm.

**Insight:** Bất kỳ giá trị dạng `"YYYY-MM"` (hoặc `"YYYY-MM-DD"`, số thuần, `"TRUE"`) ghi vào ô Sheets đều có thể bị coerce sang Date/number/boolean khi đọc lại bằng `getValues()`. So sánh kỳ phải **chuẩn hoá cả 2 vế về cùng kiểu** trước khi `!==`. Fix tại chỗ đọc (đủ, vì `restoreGateTicks_` là consumer DUY NHẤT của cột `ky`):
```js
var rowKy = data[i][2];
rowKy = (rowKy instanceof Date)
  ? rowKy.getFullYear() + '-' + ('0' + (rowKy.getMonth() + 1)).slice(-2)
  : String(rowKy).slice(0, 7);
if (rowKy !== ky) continue;
```

**Rule:** Khi so khoá-kỳ đọc từ ô Sheets, LUÔN chuẩn hoá `Date → "YYYY-MM"` (không `String(Date)` trần). Muốn chặn tận gốc thì hoặc (a) đọc kỳ từ cột `id` `code|ky` (chuỗi, không bị parse), hoặc (b) format cột kỳ là plain-text `@` trước khi ghi. Đừng dựng giả thuyết từ code — **dump giá trị thật + kiểm KIỂU (`instanceof Date`)** khi so sánh "trông giống nhau mà không khớp".

**Verify:** `grep -n "instanceof Date" docs/apps-script/PhieuLuongGate.gs` — phải có trong `restoreGateTicks_`. Test: tick 1 ô gate → "Cập nhật bảng lương" → ô tự tick lại (nháy 1 nhịp do bảng dựng lại rồi restore).

**Liên quan:** Lệch kỳ còn 1 nguồn khác — `kyLuongHienTai_()` mặc định = tháng-trước-theo-lịch (`kyLuong: ''`), trôi theo ngày. Nếu kỳ xử lý kéo dài qua tháng sau thì ghim `GATE_CFG.kyLuong = 'YYYY-MM'`.
