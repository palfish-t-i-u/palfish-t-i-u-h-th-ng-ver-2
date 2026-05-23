# Module 5 — Vận hành Sổ doanh thu (seed, dọn data, deploy)

> **Ai:** Thu Hiền / System / dev có `SUPABASE_SERVICE_ROLE_KEY`.  
> **Spec UI:** `docs/MODULE_SO_DOANH_THU.md`. **Task:** `docs/TODO.md` block M5.

---

## 1. Deploy FE + BE (xem UI mới trên production)

Code Module 5 nằm branch **`ui/ux-anh-minh`**. Production Vercel **không** tự cập nhật khi chỉ push preview — phải **Promote**.

### Bước A — Push code

```powershell
cd e:\PalFish\DA\pf-gmv-reconciliation\palfish-t-i-u-h-th-ng-ver-2
git checkout ui/ux-anh-minh
git add frontend/src/components/SoDoanhThuTab.tsx frontend/src/components/LedgerFormModal.tsx
git commit -m "feat(revenue): modal add/edit + read-only ledger table"
git push origin ui/ux-anh-minh
```

Chỉ commit file FE cần thiết. **Không** commit `backend/.env`, `frontend/.env.local`, `tmp-*.html`.

### Bước B — Vercel Promote (bắt buộc)

1. Vào [Vercel Dashboard](https://vercel.com) → project **`palfish-gmv-manager`** → **Deployments**.
2. Tìm deployment mới nhất: branch **`ui/ux-anh-minh`**, commit message đúng.
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

Seed **không** cần Vercel deploy — ghi thẳng Supabase. Reload tab Sổ sau khi chạy.

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
| Excel lịch sử | `import:HN`, `import:HCM` |
| M3 backfill | `backfill@m3` |
| M3 approve live | email user lúc approve |
| Điền tay app | email Hiền / System |

---

## 4. Smoke test tab Sổ (sau Promote)

| # | Việc | Kỳ vọng |
|---|------|---------|
| 1 | Sidebar **Sales Performance** (không còn "Doanh thu Sale") | Đúng tên mới |
| 2 | Tab **Sổ doanh thu** → **+ Thêm dòng** | Modal form (không còn form inline đầu bảng) |
| 3 | Bảng | Cột: User Name, Phone, UID, Pay Time, Real Pay (VND), Payment method, Type, Sales, Team — **read-only** |
| 4 | VND | Separator `12.875.000` trong bảng |
| 5 | **Chỉnh sửa** | Mở modal, **Lưu** OK |
| 6 | **Xóa** | Chỉ dòng **TAY** |
| 7 | M3 approve đơn mới | Dòng **M3** xuất hiện Sổ (Render phải có route mới) |

---

## 5. Liên kết

- Spec nghiệp vụ + UI Hiếu: `docs/MODULE_SO_DOANH_THU.md`
- Workflow branch UI: `docs/WORKFLOW_UI_UX.md`
- Deploy tổng: `docs/DEPLOY.md`
