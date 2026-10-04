# PLAN: Archive bảng lương tháng vào BigQuery

**Ngày**: 2026-08-24  
**Trạng thái**: CHỜ DUYỆT

## ĐỌC TRƯỚC KHI LÀM

- `docs/apps-script/BangLuong.gs` — file duy nhất cần sửa
- `docs/apps-script/PhieuLuongGate.gs:324` — `kyLuongHienTai_()` trả `YYYY-MM`
- KHÔNG đụng `capNhatTuBigQuery()`, COLS, `formatSheet_()`, hay bất kỳ function hiện có
- KHÔNG dùng `bq` CLI — chỉ dùng `BigQuery.Jobs.insert()` (Apps Script Advanced Services)

## Context

Mỗi tháng chị Trang HR chạy "Cập nhật bảng lương" → BQ data ghi đè lên sheet. Tháng sau chạy lại → bảng lương tháng trước mất. Cần nút "Lưu archive" ghi snapshot đã chốt vào BQ table `pf-salary.payroll.M_bang_luong_archive`, append theo kỳ lương.

## 5-criteria

```
TC1 Triệt để:      ✅ Lưu vĩnh viễn vào BQ, không mất khi cập nhật tháng sau
TC2 Không lỗi con:  ✅ Read-only từ sheet, function mới, không đụng logic cũ
TC3 Hạ tầng/perf:   ✅ BQ storage rẻ (~60 rows/tháng), ghi 1 lần/tháng
TC4 Token economy:  ✅ Single-file edit, inline, không cần subagent
TC5 Task-model:     ✅ Specs rõ, single-file
→ 5/5 Recommend
```

## Guardrails

| # | Quy tắc | Kiểm tra |
|---|---------|----------|
| G1 | Không sửa function hiện có | Diff chỉ thêm code mới + 1 dòng menu |
| G2 | Dùng `BigQuery.Jobs.insert()` (load job) | Code review |
| G3 | Chỉ ghi 1 lần/tháng, hỏi xác nhận nếu trùng | UI confirm dialog khi `ky_luong` đã tồn tại |
| G4 | Đọc sheet không query BQ lại | Dùng `main.getDataRange().getValues()` |

## Thay đổi

### 1. Menu item — `onOpen()` (BangLuong.gs:100–129)

Thêm 1 dòng vào menu "⚙ Bảng lương", sau `.addItem('📊 Cập nhật bảng tính thuế...')` (line 110):

```js
.addItem('💾 Lưu dữ liệu lương tháng này', 'luuArchiveBangLuong')
```

### 2. Function `luuArchiveBangLuong()` — cuối file

Flow:
1. **Lock** — `LockService.getDocumentLock().tryLock(0)`
2. **Đọc sheet** — `ss.getSheetByName('Bảng lương').getDataRange().getValues()`
   - Header = row[0], data = row[1..n]
   - Bỏ dòng không có Mã NV (code rỗng)
   - Nếu 0 dòng data → toast lỗi, return
3. **Lấy kỳ** — `ky = kyLuongHienTai_()`
4. **Check trùng** — `BigQuery.Jobs.query()`: `SELECT COUNT(*) AS cnt FROM payroll.M_bang_luong_archive WHERE ky_luong = '{ky}'`
   - Nếu cnt > 0 → `ui.alert(YES_NO)` hỏi ghi đè
   - Nếu user chọn NO → return
   - Nếu YES → chạy `DELETE FROM payroll.M_bang_luong_archive WHERE ky_luong = '{ky}'`
5. **Map data** — với mỗi dòng sheet, tạo JSON object:
   - `ky_luong`: ky
   - Với mỗi COLS[i]: `COLS[i].key`: giá trị cell tương ứng (đã tính formula, boolean cho checkbox)
6. **JSON Lines** — `rows.map(JSON.stringify).join('\n')`
7. **BigQuery.Jobs.insert()** với:
   ```
   configuration.load:
     destinationTable: {projectId:'pf-salary', datasetId:'payroll', tableId:'M_bang_luong_archive'}
     sourceFormat: 'NEWLINE_DELIMITED_JSON'
     writeDisposition: 'WRITE_APPEND'
     createDisposition: 'CREATE_IF_NEEDED'
     schema.fields: [ky_luong STRING, ...COLS mapped to types]
   ```
8. **Toast** — "Đã lưu {n} dòng kỳ {ky} vào BigQuery."

### BQ Schema (`M_bang_luong_archive`)

| Field | Type | Từ COLS key |
|-------|------|-------------|
| `ky_luong` | STRING | Thêm mới |
| `stt` | INTEGER | auto |
| `code` | STRING | auto |
| `team` | STRING | auto |
| `name` | STRING | auto |
| `chuc_danh` | STRING | auto |
| `employee_type` | STRING | auto |
| `phong_ban` | STRING | auto |
| `tong_lt` | INTEGER | calc (sheet value) |
| `tong_luong` | INTEGER | calc (sheet value) |
| `luong_cb` | INTEGER | auto |
| `cong` | FLOAT | auto |
| `lcb_ngay_cong` | INTEGER | auto |
| `thuong_com` | INTEGER | input |
| `bao_hiem` | INTEGER | auto |
| `gmv` | INTEGER | auto |
| `gmv_ban_moi` | INTEGER | auto |
| `gmv_gioi_thieu` | INTEGER | auto |
| `gmv_tai_ky` | INTEGER | auto |
| `an_trua` | INTEGER | auto |
| `may_tinh` | INTEGER | auto |
| `xe_pc` | INTEGER | input |
| `khau_tru_thue` | INTEGER | auto |
| `bu_tien` | INTEGER | input |
| `note` | STRING | input |
| `gc_thuong_nong` | STRING | auto |
| `xn_tt` | BOOLEAN | status |
| `gui_truoc` | BOOLEAN | status |
| `nv_xn_truoc` | BOOLEAN | status |
| `gui_sau` | BOOLEAN | status |
| `nv_xn_sau` | BOOLEAN | status |

### 3. MODULES.md — section 13

Thêm 1 dòng sau "M3 Apps Script: `docs/apps-script/BangLuong.gs`":
```
- Archive: `luuArchiveBangLuong()` trong BangLuong.gs → ghi `pf-salary.payroll.M_bang_luong_archive`
```

## Verification

1. Mở Apps Script Editor → chạy `luuArchiveBangLuong()` thủ công
2. BQ Console: `SELECT * FROM pf-salary.payroll.M_bang_luong_archive WHERE ky_luong = '2026-07' LIMIT 5`
3. Chạy lần 2 cùng kỳ → confirm dialog phải hiện, chọn No → không ghi đè
4. Chọn Yes → dòng cũ bị xóa, dòng mới ghi vào

## Rollback

Revert commit. Nếu đã ghi BQ: `DELETE FROM pf-salary.payroll.M_bang_luong_archive WHERE ky_luong = 'YYYY-MM'`.

## STOP Conditions

- Nếu COLS array đã thay đổi so với ground truth (27 cột) → dừng, kiểm tra
- Nếu `kyLuongHienTai_()` không tồn tại trong project → dừng, báo

## Checklist

- [ ] T1: Thêm menu item vào `onOpen()`
- [ ] T2: Thêm function `luuArchiveBangLuong()`
- [ ] T3: Cập nhật MODULES.md section 13
- [ ] Commit vào branch sandbox
