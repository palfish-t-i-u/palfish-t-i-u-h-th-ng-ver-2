# HANDOFF — Đổi nhãn Sổ doanh thu: "M3 / Tay" → "Tự động / Thủ công"

**Origin:** Minh 30/7 — điều tra tag "M3" trong Sổ doanh thu. Phát hiện "M3" là tên hiển thị cũ (từ thời app còn 5 module) cho loại dòng tự động, giờ vô nghĩa + trùng tên với một luồng code chết (`sync_ledger_from_m3_order` / Module3Tab, không mount) → gây hiểu nhầm nhiều hơn có ích.

**Quyết định đã chốt (Minh 30/7):** Đổi nhãn theo **trục nguồn tin cậy** (máy tính ra vs người khai), không theo kênh nhập:
- `loai_nhap='tu_dong'` → hiển thị **"Tự động"** (app tự ghi khi đơn thu đủ 100% + tới bước Kích hoạt; máy truy vết về PR được).
- `loai_nhap='tay'` → hiển thị **"Thủ công"** (số do người khẳng định — nhập tay HOẶC kéo từ file; hiện gồm cả import All File/DingTalk vì đều ghi `'tay'`).
- Nhãn thứ 3 **"Ghi giảm"** (`loai_nhap='hoan'`) **KHÔNG làm bây giờ** — đợi REV-02 của Đạt lên (`docs/HANDOFF_REV-02_DAT_HOAN_HUY_GHI_GIAM.md`).

**Estimated effort:** ~20 phút. **FE-only. Không migration. Không đụng BE.**

**Xung đột với REV-01..04 (Đức/Đạt): KHÔNG.** Họ toàn BE (`revenue_routes.py`, `report_routes.py`, `gateway_routes.py`, migration). Task này toàn FE display string. 0 file trùng. Không đổi `loai_nhap` DB value nên contract lọc BE (`revenue_routes.py:531/701` lọc `loai_nhap in ("tu_dong","tay")`) nguyên vẹn. Merge lúc nào cũng được, độc lập thứ tự REV-01..04.

---

## Bối cảnh (ĐÃ verify — grep + đọc file 30/7 nhánh `sandbox`; prod jozcvbbypwvzaefteoxn)

**Dữ liệu thật (prod 30/7):** `so_doanh_thu` có 16,336 dòng — **182 `tu_dong`** + **16,154 `tay`** + **0 `import:*`**. Import All File (GSheet) và DingTalk xlsx đều ghi `loai_nhap='tay'` (verify: `gsheet_ledger_import.py:412,455` · `xlsx_ledger_import.py:92`), KHÔNG ghi `import:*`. → badge "Tay" hiện chủ yếu là dòng kéo từ file, không phải gõ tay ⇒ "Thủ công" phản ánh đúng hơn.

**Type FE:** `frontend/src/types/revenue.ts:1` — `export type LoaiNhap = "tu_dong" | "tay";` (giữ nguyên, không sửa).

**Component Badge:** `frontend/src/components/ui/Badge.tsx:20` — `Badge({ children, tone, className })` → **KHÔNG nhận `title`**. Tooltip phải bọc `<span title="…">`, KHÔNG thêm prop vào Badge (dùng chung khắp app).

**Các chỗ hiển thị "M3"/"Tay"/"Điền tay" (ĐÃ verify từng dòng):**

| # | File:line | Chuỗi hiện tại |
|---|---|---|
| 1 | `frontend/src/components/SoDoanhThuTab.tsx:140` | `{row.loaiNhap === "tu_dong" ? "M3" : "Tay"}` (badge desktop) |
| 2 | `frontend/src/components/SoDoanhThuTab.tsx:588` | `<option value="tu_dong">Tự động (M3)</option>` |
| 3 | `frontend/src/components/SoDoanhThuTab.tsx:589` | `<option value="tay">Điền tay</option>` |
| 4 | `frontend/src/components/LedgerRowCards.tsx:50` | `{row.loaiNhap === "tu_dong" ? "M3" : "Tay"}` (badge mobile) |
| 5 | `frontend/src/components/LedgerFormModal.tsx:170` | `{rowMeta.loaiNhap === "tu_dong" ? "Tự động (M3)" : "Điền tay"}` |
| 6 | `frontend/src/components/SoDoanhThuTab.tsx:739` + `:760` | `"Chưa có dòng — bấm Thêm dòng hoặc xác nhận M3."` (2 chỗ GIỐNG HỆT) |
| 7 | `frontend/src/pages/MainPage.tsx:186` | `subtitle: "Pay Time · GMV RMB = VND÷3700 — M3 tự động + điền tay + Sync sheet",` |
| 8 | `frontend/src/components/LedgerRowCards.test.tsx:70` | `expect(screen.getByText("M3")).toBeInTheDocument();` (+ tên test dòng 68) |
| 9 | `frontend/src/content/help/revenueLedger/tao-sua-dong-so.md:7,35` | nhắc "M3" (không chặn merge) |

**BẪY — "M3" trùng chuỗi ở chỗ KHÔNG được đụng:**
- `d="M3 12…"` trong `MainPage.tsx` (100,156) + `payment-request/Icons.tsx` = lệnh vẽ SVG.
- `Module3Tab.tsx` / `Module4Tab.tsx` (`Ngay M3`) / `api.ts` (`getM3Pending`/`approveM3Order`/`saveM3CrmId`) = luồng duyệt hóa đơn M3 (legacy, không mount).
- `lib/ledgerEvents.ts:1` comment "B3 / M3 ghi Sổ".
→ **TUYỆT ĐỐI KHÔNG replace-all "M3".** Sửa tay đúng 9 dòng bảng trên.

---

## Scope

### IN scope
1. Đổi badge/dropdown/form: `tu_dong` → "Tự động", `tay` → "Thủ công" (mục #1–5).
2. Reword chữ "M3" người dùng thấy (mục #6, #7).
3. Tooltip hover cho badge (bọc span title).
4. Sửa test (mục #8).
5. Reword help md (mục #9) — nên làm cho khớp, không chặn merge.

### OUT of scope (KHÔNG làm)
- **KHÔNG** đổi `loai_nhap` DB value hay `value="tu_dong"`/`value="tay"` trong `<option>` — chỉ đổi chữ giữa tag. Đổi value = gãy lọc BE.
- **KHÔNG** đụng `revenue.ts` type, bất kỳ file `backend/`, migration.
- **KHÔNG** thêm prop `title` vào `Badge.tsx` — bọc `<span title>`.
- **KHÔNG** thêm nhãn "Ghi giảm" — đợi REV-02.
- **KHÔNG** replace-all "M3" (xem BẪY).
- **KHÔNG** đổi `tone` badge (giữ `primary`/`neutral`).

---

## Việc cụ thể

### A. Đổi nhãn (5 chỗ)

**#1 — `SoDoanhThuTab.tsx:140`** — badge desktop. Đổi text + bọc tooltip:
```tsx
// TỪ:
<Badge tone={row.loaiNhap === "tu_dong" ? "primary" : "neutral"} className="mt-1">
  {row.loaiNhap === "tu_dong" ? "M3" : "Tay"}
</Badge>
// THÀNH:
<span title={row.loaiNhap === "tu_dong"
  ? "Tự ghi khi đơn đã thu đủ 100% và tới bước Kích hoạt."
  : "Nhập tay hoặc mang từ ngoài vào."}>
  <Badge tone={row.loaiNhap === "tu_dong" ? "primary" : "neutral"} className="mt-1">
    {row.loaiNhap === "tu_dong" ? "Tự động" : "Thủ công"}
  </Badge>
</span>
```

**#2 — `SoDoanhThuTab.tsx:588`**: `Tự động (M3)` → `Tự động` (giữ `value="tu_dong"`).
**#3 — `SoDoanhThuTab.tsx:589`**: `Điền tay` → `Thủ công` (giữ `value="tay"`).

**#4 — `LedgerRowCards.tsx:50`** — badge mobile, đổi text + bọc tooltip:
```tsx
// TỪ:
<Badge tone={row.loaiNhap === "tu_dong" ? "primary" : "neutral"}>
  {row.loaiNhap === "tu_dong" ? "M3" : "Tay"}
</Badge>
// THÀNH:
<span title={row.loaiNhap === "tu_dong"
  ? "Tự ghi khi đơn đã thu đủ 100% và tới bước Kích hoạt."
  : "Nhập tay hoặc mang từ ngoài vào."}>
  <Badge tone={row.loaiNhap === "tu_dong" ? "primary" : "neutral"}>
    {row.loaiNhap === "tu_dong" ? "Tự động" : "Thủ công"}
  </Badge>
</span>
```

**#5 — `LedgerFormModal.tsx:170`**: `"Tự động (M3)" : "Điền tay"` → `"Tự động" : "Thủ công"` (tooltip tùy chọn, không bắt buộc ở modal).

### B. Reword "M3" rải rác

**#6 — `SoDoanhThuTab.tsx:739`+`760`** (2 chỗ giống hệt): Edit `replace_all: true`
```
"Chưa có dòng — bấm Thêm dòng hoặc xác nhận M3."
→ "Chưa có dòng — bấm Thêm dòng để thêm thủ công."
```
(Chừa nguyên dòng filtered 738/759 — không nhắc "M3".)

**#7 — `MainPage.tsx:186`**: `M3 tự động + điền tay` → `Tự động + Thủ công`. Kết quả:
```
subtitle: "Pay Time · GMV RMB = VND÷3700 — Tự động + Thủ công + Sync sheet",
```

### C. Test (#8 — `LedgerRowCards.test.tsx`)
- Dòng 70: `getByText("M3")` → `getByText("Tự động")`.
- Dòng 68 (tên test): `(M3)` → `(Tự động)`.
- (Tùy chọn) thêm 1 test: row `loaiNhap:"tay"` → `getByText("Thủ công")`.

### D. Help md (#9 — `tao-sua-dong-so.md`) — nên làm
- Dòng 7: "đơn không tự đổ từ M3" → "đơn không tự đổ về (Tự động)".
- Dòng 35: "các dòng do M3 tự động đổ về" → "các dòng Tự động đổ về".

---

## Guardrail

1. **Pre-flight grep** (chốt danh sách, tránh sót/lố):
   ```bash
   grep -rn '"M3"\|>M3<\|Tự động (M3)\|Điền tay\|? "M3"' frontend/src --include=*.tsx --include=*.ts
   ```
2. Sửa **tay từng dòng** bảng #1–9. KHÔNG replace-all "M3" (bẫy SVG/Module3/api).
3. **Post-flight grep** — kỳ vọng 0 hit ở 3 file badge:
   ```bash
   grep -rn '>M3<\|? "M3"\|Tự động (M3)\|Điền tay' frontend/src/components/SoDoanhThuTab.tsx frontend/src/components/LedgerRowCards.tsx frontend/src/components/LedgerFormModal.tsx
   ```
4. **Không** đổi `value=` trong `<option>` (giữ `tu_dong`/`tay`).

---

## Acceptance criteria
1. Badge Sổ (desktop + mobile), dropdown "Nguồn dòng", form modal: `tu_dong` hiện **"Tự động"**, `tay` hiện **"Thủ công"**. Không còn "M3"/"Tay"/"Điền tay"/"(M3)" trên UI.
2. Hover badge "Tự động" → tooltip "Tự ghi khi đơn đã thu đủ 100% và tới bước Kích hoạt."; hover "Thủ công" → "Nhập tay hoặc mang từ ngoài vào."
3. Dropdown lọc vẫn chạy: chọn "Tự động" lọc ra đúng dòng `tu_dong` (value không đổi).
4. Empty-state không còn "xác nhận M3".
5. Post-flight grep (guardrail #3) trả 0 hit.
6. `cd frontend && npx tsc -b` PASS; `cd frontend && npm run test` PASS.

## Test plan
```bash
cd frontend && npx tsc -b
cd frontend && npm run test -- src/components/LedgerRowCards.test.tsx src/components/SoDoanhThuTab.columns.test.tsx
```
Manual (sandbox): mở Sổ doanh thu → thấy badge "Tự động"/"Thủ công"; hover ra tooltip; dropdown "Nguồn dòng" lọc đúng; xem trên điện thoại (card) badge cũng đổi.

Commit (1 commit, squash):
```
refactor(revenue-ledger): đổi nhãn M3/Tay → Tự động/Thủ công + tooltip nguồn dòng
```

## Anti-patterns (đừng làm)
1. **Replace-all "M3"** — hỏng icon (`d="M3 …"`), gãy `getM3Pending`/`Module3Tab`. Sửa tay 9 dòng.
2. Đổi `value="tu_dong"`/`value="tay"` — gãy lọc BE (`revenue_routes.py:531/701`).
3. Thêm prop `title` vào `Badge.tsx` — bọc span thay vì sửa component chung.
4. Đổi `loai_nhap` DB / đụng file backend / migration — task này FE-only.
5. Thêm nhãn "Ghi giảm" bây giờ — chưa có `loai_nhap='hoan'`, đợi REV-02.
6. Quên sửa test dòng 70 → đỏ CI.
