# Module 5 — Vận hành Sổ doanh thu (seed, dọn data, deploy)

> **Ai:** Thu Hiền / System / dev có `SUPABASE_SERVICE_ROLE_KEY`.  
> **Spec UI:** `docs/MODULE_SO_DOANH_THU.md`. **Task:** `docs/TODO.md` block M5.

---

## 1. Deploy FE + BE (xem UI mới trên production)

Code Module 5 nằm branch **`ui/ux`**. Production Vercel **không** tự cập nhật khi chỉ push preview — phải **Promote**.

### Bước A — Push code

```powershell
cd e:\PalFish\DA\pf-gmv-reconciliation\palfish-t-i-u-h-th-ng-ver-2
git checkout ui/ux
git add frontend/src/components/SoDoanhThuTab.tsx frontend/src/components/LedgerFormModal.tsx
git commit -m "feat(revenue): modal add/edit + read-only ledger table"
git push origin ui/ux
```

Chỉ commit file FE cần thiết. **Không** commit `backend/.env`, `frontend/.env.local`, `tmp-*.html`.

### Bước B — Vercel Promote (bắt buộc)

1. Vào [Vercel Dashboard](https://vercel.com) → project **`palfish-gmv-manager`** → **Deployments**.
2. Tìm deployment mới nhất: branch **`ui/ux`**, commit message đúng.
3. Bấm **`⋯`** → **Promote to Production**.
4. Đợi badge **Current** chuyển sang deployment đó.
5. Mở `https://palfish-gmv-manager.vercel.app` → **Ctrl+Shift+R** (hard refresh).

**Lưu ý:** Một số gói Vercel **không** có mục đổi Production Branch trong Settings → Git. Khi đó **Promote** là cách duy nhất đưa preview lên prod.

**Preview URL** (`…vercel.app` dài): login Google có thể quay về **production URL** (Supabase Site URL = prod). Đừng dùng preview để kết luận UI prod — luôn kiểm tra sau Promote.

### Bước C — Render (khi có thay đổi backend)

Route M5: `GET/POST/PATCH/DELETE /revenue/ledger`, `GET /revenue/pivot`.

1. Render → service **`palfish-gmv-api`** → kiểm tra repo **`palfish-t-i-u-h-th-ng-ver-2`**, branch **`main`** (hoặc branch team thống nhất).
2. **Manual Deploy** nếu auto-deploy chưa chạy.
3. Kiểm tra: `https://palfish-gmv-api.onrender.com/docs` — phải thấy `/revenue/ledger`.

Thiếu route → nút **Xóa** / load Sổ báo lỗi dù FE đã Promote.

### Bước D — Supabase SQL (một lần)

Chạy trên SQL Editor (prod): **`docs/supabase_schema_patch_v7_so_doanh_thu.sql`**.  
Chọn **Run without RLS**. Cuối file có `NOTIFY pgrst, 'reload schema'`.

**Không** chạy lại v6 nếu DB đã có cột M3/M4 (v6 có `DROP TABLE`).

---

## 2. Seed / backfill dữ liệu Sổ

Script: **`scripts/seed_so_doanh_thu.py`**. Cần `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` trong **`backend/.env`**.

```powershell
cd e:\PalFish\DA\pf-gmv-reconciliation\palfish-t-i-u-h-th-ng-ver-2
pip install supabase openpyxl python-dotenv
```

### 2.1 Backfill đơn M3 đã approve (trước khi có Module 5)

Hook tự động chỉ chạy khi **M3 approve mới**. Đơn cũ cần backfill:

```powershell
python scripts/seed_so_doanh_thu.py --backfill-m3
```

An toàn chạy lại — bỏ qua dòng đã có (`loai_nhap=tu_dong` + `don_hang_id`).

### 2.2 Import lịch sử Excel Hiếu (`HNxHCM GMV.xlsx`)

File mẫu: `e:\PalFish\DA\HNxHCM GMV.xlsx` (ngoài repo). Đọc sheet **HN** + **HCM**. Tag `created_by_email`: `import:HN` / `import:HCM`.

**Dry-run (không ghi DB):**

```powershell
python scripts/seed_so_doanh_thu.py --xlsx "e:\PalFish\DA\HNxHCM GMV.xlsx" --limit 10 --dry-run
```

**Import thật (thử 500 dòng):**

```powershell
python scripts/seed_so_doanh_thu.py --xlsx "e:\PalFish\DA\HNxHCM GMV.xlsx" --limit 500
```

Import full (~14k dòng): bỏ `--limit` — mất vài phút. **Chạy lại = trùng dòng** — không dedupe.

**Import full sau khi đã seed `--limit 500`:**

```powershell
python scripts/cleanup_so_doanh_thu.py --all --dry-run
python scripts/cleanup_so_doanh_thu.py --all
python scripts/seed_so_doanh_thu.py --xlsx "e:\PalFish\DA\HNxHCM GMV.xlsx"
python scripts/seed_so_doanh_thu.py --backfill-m3
```

Seed **không** cần Vercel deploy — ghi thẳng Supabase. Reload tab Sổ sau khi chạy.

### 2.3 Re-seed từ file gốc DingTalk (khuyến nghị thay All File)

Audit 25/05/2026: All File **SM Hanoi** thiếu ~461 RMB GMV (mất phần thập phân khi copy từ DingTalk). Seed lịch sử nên lấy **file gốc**, không tab All File.

| Tab | File gốc | Sheet | Dòng | Tag mới |
|-----|----------|-------|------|---------|
| SM Hanoi | `SM HANOI daily report.xlsx` | **INCOME** | 2 → 13.943 | `import:dingtalk:SM Hanoi` |
| HCM REV | `HCM Revenue statement.xlsx` | **REVENUE** | 2 → 798 | `import:dingtalk:HCM REV` |

Script: **`scripts/seed_dingtalk_ledger.py`** — mapper `backend/xlsx_ledger_import.py` (`map_sm_income_row` cho INCOME, layout +2 cột so với All File).

```powershell
# Xem trước — không ghi DB
python scripts/seed_dingtalk_ledger.py --dry-run --confirm

# Production: xóa import cũ (import:gsheet:*) + seed — CẦN backup Supabase trước
python scripts/seed_dingtalk_ledger.py --purge-gsheet --confirm
```

**Giữ lại khi purge:** `loai_nhap=tu_dong` (M3), dòng tay Ops nhập sau go-live.  
**Xóa:** mọi dòng `created_by_email` like `import:gsheet:%`.

Dry-run mẫu: **14.644** dòng, SUM GMV ≈ **42,46M** RMB. Báo cáo audit: `E:\PalFish\DA\Report\ket-luan-doi-chieu-sm-hanoi-so-doanh-thu.md`, `ket-luan-doi-chieu-hcm-rev-so-doanh-thu.md`. Quy trình: `E:\PalFish\DA\Report\quy-trinh-seed-so-dingtalk.md`.

**Chưa chạy trên prod** — cần approve Ops sau backup.

---

## 3. Dọn data test (trước import Excel thật)

Script: **`scripts/cleanup_so_doanh_thu.py`**.

| Lệnh | Tác dụng |
|------|----------|
| `--all --dry-run` | Xem sẽ xóa hết Sổ |
| `--all` | Xóa toàn bộ Sổ (trước import lần đầu) |
| `--keep-import-only --dry-run` | Xóa test, **giữ** dòng `import:HN` / `import:HCM` |
| `--keep-import-only` | Thực thi xóa test |
| `--before 2026-06-01` | Xóa dòng `created_at` trước ngày go-live |

**Luôn chạy `--dry-run` trước.**

Phân loại test vs thật theo `created_by_email`:

| Nguồn | `created_by_email` |
|-------|-------------------|
| Excel lịch sử (HNxHCM) | `import:HN`, `import:HCM` |
| Google Sheet All File | `import:gsheet:SM Hanoi`, `import:gsheet:HCM REV` |
| DingTalk xlsx (re-seed) | `import:dingtalk:SM Hanoi`, `import:dingtalk:HCM REV` |
| M3 backfill | `backfill@m3` |
| M3 approve live | email user lúc approve |
| Điền tay app | email Hiền / System |

### 3.1 Xóa dòng M3 test khỏi Sổ

Dòng **`loai_nhap = tu_dong`** (tag **M3** trên UI) **không** có nút Xóa và API trả **403** (`DELETE /revenue/ledger/{id}` chỉ cho `tay`).

**Cách hiện tại (Ops, Supabase SQL Editor):** xác nhận đúng dòng test rồi xóa:

```sql
-- Ví dụ: 2 đơn test 25/05/2026 — chỉnh WHERE nếu cần
DELETE FROM so_doanh_thu
WHERE loai_nhap = 'tu_dong'
  AND so_tien_vnd = 2000
  AND pay_time >= '2026-05-25T00:00:00'
  AND pay_time <= '2026-05-25T23:59:59'
  AND ten_khach IN ('abc', 'dfafasfa');
```

Reload tab Sổ. Đơn trên tab M3 (Kích hoạt khóa học) vẫn có thể còn — chỉ gỡ dòng Sổ. Backlog: cho Ops xóa `tu_dong` qua UI (`TODO.md` M5-14).

---

## 4. Smoke test tab Sổ (sau Promote)

| # | Việc | Kỳ vọng |
|---|------|---------|
| 1 | Sidebar **Sales Performance** (không còn "Doanh thu Sale") | Đúng tên mới |
| 2 | Tab **Sổ doanh thu** → **+ Thêm dòng** | Modal form (không còn form inline đầu bảng) |
| 3 | Bảng | Cột: User Name, Phone, UID, Pay Time, Real Pay (VND), **Nội dung CK**, **ID đơn hàng**, Payment method, Type (sau fixx), Sales, Team — **read-only** |
| 3b | Thẻ tổng hợp | Tổng GMV + Số đơn; 5 thẻ Type pivot; mặc định **hôm nay** |
| 3c | Type fixx | Range **22/05/2025–22/05/2026** — 7.522 đơn, tổng GMV **80.461.641.552** + từng bucket khớp sheet Hiếu; tháng 05/2026 vẫn đúng |
| 3d | Lọc ngày | Filter theo **Pay Time** (`pay_time`), không `ngay_tien_ve` |
| 4 | VND | Separator `12.875.000` trong bảng |
| 5 | **Chỉnh sửa** | Mở modal, **Lưu** OK |
| 6 | **Xóa** | Chỉ dòng **TAY** |
| 7 | M3 approve đơn mới | Dòng **M3** xuất hiện Sổ (Render phải có route mới) |

---

## 5. Liên kết

- Spec nghiệp vụ + UI Hiếu: `docs/MODULE_SO_DOANH_THU.md`
- Import All File Thu Hiền (Google Sheet): `docs/M5_GSHEET_IMPORT.md`
- Đối chiếu GMV tab / DingTalk / thẻ tổng hợp: `docs/M5_DOI_CHIEU.md`
- Workflow branch UI: `docs/WORKFLOW_UI_UX.md`
- Deploy tổng: `docs/DEPLOY.md`
