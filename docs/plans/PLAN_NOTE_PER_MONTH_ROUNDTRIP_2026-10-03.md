# PLAN — Note bảng lương sống 1 tháng (phương án A: clear thủ công)

**Ngày:** 2026-10-03 · **Dự án:** gmv · **File script:** `docs/apps-script/BangLuong.gs`
**Người duyệt:** Minh (đã chọn phương án A)

---

## ĐỌC TRƯỚC KHI LÀM

File phải mở lại: `docs/apps-script/BangLuong.gs` — 2 vị trí: `BQ_SQL` (dòng 15-61), `COLS` note (dòng 99), logic `capNhatTuBigQuery()` (dòng 301-329).

Invariant TOP:
- **KHÔNG đụng 5 cột status gate** (`xn_tt`, `gui_truoc`, `nv_xn_truoc`, `gui_sau`, `nv_xn_sau`, dòng 102-106) — khớp GATE_COLS PhieuLuongGate.gs.
- **Thứ tự triển khai bắt buộc:** Chung bơm `note` vào bảng build C_view TRƯỚC khi đổi script. Đổi script trước = 7 note hiện có bị XÓA SẠCH ngay lần refresh đầu (xem Guardrail G1).

## STOP conditions
- Nếu `C_view_bang_luong_truoc_thue` CHƯA có cột `note` (Chung chưa làm) → DỪNG, không đổi script.
- Nếu test cho thấy note tháng cũ không clear hoặc note mới bị mất → DỪNG, báo Minh.

---

## 0. TL;DR

Hiện: note `src:null` → cơ chế tự-giữ (đọc lại sheet cũ) khiến note dính vĩnh viễn, không reset theo tháng. Sai ý: note phải sống 1 tháng → lưu BQ → sang tháng clear ô.

Phương án A = nối note theo đúng vòng BQ (giống cột Bù tiền đã làm 13/8), bỏ tự-giữ. Clear = **thủ công**: đầu tháng chị Trang xóa note ở tab Nhập tay. Lưu lịch sử = bấm nút "💾 Lưu dữ liệu lương tháng này" mỗi tháng (đã có sẵn, ghi `M_bang_luong_archive` theo kỳ).

## 1. Hiện trạng (ground truth đã verify)

- `C_imput_bao_hiem_tro_cap`: 102 dòng = 1 dòng/NV, **KHÔNG có cột kỳ lương**. Có cột `note` STRING, 7 giá trị khớp sheet. → note đè liên tục, không lưu theo tháng ở bảng input.
- `C_view_bang_luong_truoc_thue` (bảng build script đọc): **CHƯA có cột `note`**. Có `ghi_chu_thuong_nong`. → note kẹt ở bảng input, không lên sheet qua BQ.
- `BangLuong.gs` BQ_SQL (dòng 15-61): SELECT từ C_view, **không chọn note**.
- `BangLuong.gs` COLS dòng 99: `{ key:'note', h:'Note', role:'input', src:null }`.
- `capNhatTuBigQuery()` dòng 307-310 — nhánh `if(!col.src)`: LUÔN giữ giá trị tay (`cur` đọc từ sheet cũ), snapshot='' → đây là cơ chế chặn reset.
- Tiền lệ: cột Bù tiền 13/8 đã đổi `src:null → src:'bu_tien'` + thêm `COALESCE(t.bu_tien,0)` vào SQL → vòng BQ hoạt động (payroll-pivot-2026-08-13).
- Archive: `luuArchiveBangLuong()` (nút "💾 Lưu…") ghi WRITE_APPEND vào `M_bang_luong_archive` keyed `ky_luong`, note map STRING. Chạy tay.

## 2. Guardrails (PHẢI GIỮ)

| # | Quy tắc | Nguồn | Cách kiểm |
|---|---------|-------|-----------|
| G1 | Chung bơm note vào C_view TRƯỚC khi đổi script. Nếu C_view.note rỗng lúc refresh đầu → autoVal='' đè 7 note hiện có = mất data | logic dòng 312-315 (`prevAuto===undefined` → push autoVal) | Query C_view.note có đủ 7 giá trị trước khi switch |
| G2 | KHÔNG đụng 5 cột status gate | khớp PhieuLuongGate.gs | diff chỉ chạm BQ_SQL + dòng 99 |
| G3 | Chạy "💾 Lưu…" (archive) TRƯỚC khi Trang clear Nhập tay mỗi tháng — nếu không, note tháng cũ mất khỏi history | luuArchiveBangLuong keyed ky_luong | quy trình vận hành, ghi doc |
| G4 | Note sửa tay thẳng trên Bảng lương (không qua Nhập tay) sẽ bị BQ đè khi refresh | smart-merge dòng 314 | dặn Trang chỉ sửa note ở Nhập tay |

## 3. Việc cần làm

### Task 1 — Chung (BQ, KHÔNG phải Minh) — PHỤ THUỘC, làm TRƯỚC
Thêm cột `note` vào bảng build `C_view_bang_luong_truoc_thue` (JOIN/lấy từ `C_imput_bao_hiem_tro_cap` theo `code`). Verify: `SELECT code, note FROM C_view_bang_luong_truoc_thue WHERE note IS NOT NULL` trả đúng 7 dòng khớp sheet.

### Task 2 — Script BangLuong.gs (Minh, inline — cơ học, 2 sửa)
**(a) BQ_SQL** — thêm 1 dòng SELECT note (sau dòng 52 `t.ghi_chu_thuong_nong,`):
```
"  t.note,",
```
**(b) COLS dòng 99** — đổi src:
```javascript
{ key:'note', h:'Note', role:'input', src:'note' },
```
Không sửa gì khác. Logic dòng 311-316 tự xử lý (note thành nhánh `else` smart-merge giống bù_tiền).

### Task 3 — Quy trình vận hành (doc cho Trang, không code)
Đầu mỗi kỳ lương: (1) bấm "💾 Lưu dữ liệu lương tháng này" lưu kỳ cũ; (2) xóa cột Note ở tab Nhập tay; (3) bấm "🔄 Cập nhật bảng lương" → ô Note trống cho tháng mới. Note chỉ sửa ở Nhập tay, không gõ thẳng Bảng lương.

## 4. Test plan

Chạy trên sheet SANDBOX (copy sheet lương) hoặc kỳ test, KHÔNG trực tiếp prod lần đầu.

1. **Regression giữ data (G1):** C_view.note có 7 giá trị → chạy capNhat → 7 note vẫn hiện đúng trên Bảng lương. (nếu C_view.note rỗng → phải thấy note bị xóa = chứng minh G1 đúng, KHÔNG chạy prod trạng thái này.)
2. **Clear sang tháng:** C_view.note của 1 NV đổi về rỗng (giả lập Trang xóa Nhập tay) → chạy capNhat → ô Note NV đó trống. Các NV khác giữ nguyên.
3. **Smart-merge (G4):** sửa tay 1 note trên Bảng lương khác giá trị BQ → chạy capNhat → giá trị tay bị BQ đè (xác nhận hành vi đã dặn Trang).
4. **Archive (G3):** bấm "💾 Lưu…" → query `M_bang_luong_archive WHERE ky_luong='<kỳ>'` có note đúng.
5. **Gate nguyên (G2):** 5 cột status vẫn ở đúng vị trí, checkbox còn.

## 5. Rollback
Revert 2 dòng BangLuong.gs (bỏ `t.note,` + đổi lại `src:null`) → về cơ chế tự-giữ cũ. Chung giữ cột note ở C_view không hại (script không đọc nếu src:null).

## 6. Definition of Done
- [ ] Chung xác nhận C_view.note đủ 7 giá trị (G1 pass)
- [ ] 2 sửa BangLuong.gs áp + dán lại Apps Script Editor
- [ ] Test 1-5 pass trên sandbox
- [ ] Doc quy trình Task 3 gửi Trang
- [ ] 5 cột gate nguyên vẹn

## 7. Bảng 5-criteria

| Tiêu chí | Đạt | Ghi chú |
|----------|-----|---------|
| 1. Triệt để (gốc rễ) | ✅ | Nối đúng vòng BQ, bỏ cơ chế tự-giữ gây dính |
| 2. Không lỗi con | ✅ | Giống tiền lệ bù_tiền đã chạy ổn; G1-G4 canh |
| 3. Không tăng gánh hạ tầng | ✅ | 1 cột BQ + 2 dòng script; archive/clear dùng nút có sẵn |
| 4. Token economy | ✅ | Sửa cơ học inline, không subagent |
| 5. Reversible | ✅ | Revert 2 dòng |

**4.5/5** — trừ nhẹ: clear phụ thuộc Trang thao tác tay (G3/G4). Chấp nhận theo phương án A Minh chọn.
