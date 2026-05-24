# Import Sổ doanh thu từ Google Sheet (All File Thu Hiền)

Pipeline: tab **`SM Hanoi`** + **`HCM REV`** → map schema Sổ → Supabase `so_doanh_thu`.

**Không** import tab pivot `HN Inhouse 1` (chỉ tổng sale×tháng).

Sheet mặc định: [All File Thu Hiền](https://docs.google.com/spreadsheets/d/1sEthbH-zcMavoQ1qi9J_CNnHAJoyt0gfsE-xsMW0LCc/edit)

---

## Bước 1 — Google Cloud: bật Sheets API

1. Mở [Google Cloud Console](https://console.cloud.google.com/)
2. Tạo project (hoặc chọn project có sẵn) — ví dụ `palfish-gmv`
3. **APIs & Services → Library** → tìm **Google Sheets API** → **Enable**
4. **APIs & Services → Credentials → Create credentials → Service account**
   - Tên: `palfish-ledger-import`
   - Role: không bắt buộc (chỉ đọc sheet bên ngoài)
5. Vào service account vừa tạo → tab **Keys → Add key → JSON**
6. Tải file JSON về máy, ví dụ:
   ```
   e:\PalFish\DA\secrets\palfish-gsheet-import.json
   ```
7. Mở JSON, copy email dạng:
   ```
   palfish-ledger-import@palfish-gmv.iam.gserviceaccount.com
   ```

> **Không commit file JSON lên Git.** Thêm vào `.gitignore`.

---

## Bước 2 — Share sheet (Viewer là đủ)

1. Mở Google Sheet **All File Thu Hiền**
2. **Share** → dán email service account ở bước 1
3. Quyền: **Viewer** (xem là đủ)
4. Gửi lời mời — owner sheet (Thu Hiền / Hiếu) phải approve nếu bạn không phải owner

---

## Bước 3 — Cấu hình backend

Thêm vào `backend/.env` (local) và biến môi trường Render/Vercel (prod):

```env
# Google Sheets — All File Thu Hiền
GOOGLE_SHEETS_ID=1sEthbH-zcMavoQ1qi9J_CNnHAJoyt0gfsE-xsMW0LCc
GOOGLE_SERVICE_ACCOUNT_JSON=e:\PalFish\DA\secrets\palfish-gsheet-import.json
```

Trên **Render** (Linux): upload JSON qua secret file hoặc paste nội dung vào biến (nếu dùng cách paste, cần code đọc từ env — hiện tại dùng **đường dẫn file**).

Gợi ý Render:

- Đặt file tại `/etc/secrets/gsheet-sa.json` (Secret File mount)
- `GOOGLE_SERVICE_ACCOUNT_JSON=/etc/secrets/gsheet-sa.json`

Cài dependency:

```bash
cd backend
pip install -r requirements.txt
```

---

## Bước 4 — Chạy thử (dry-run)

```bash
python scripts/import_gsheet_so_doanh_thu.py --dry-run --limit 20
```

Kết quả mong đợi:

- `Fetched` > 0
- Sample in ra ngày, khách, VND, sale, team
- Lỗi thường gặp:
  - `403` → chưa share sheet cho service account
  - `FileNotFoundError` → sai đường dẫn `GOOGLE_SERVICE_ACCOUNT_JSON`
  - `404` → sai `GOOGLE_SHEETS_ID`

---

## Bước 5 — Import thật

```bash
# Cả SM Hanoi + HCM REV
python scripts/import_gsheet_so_doanh_thu.py

# Chỉ Hà Nội
python scripts/import_gsheet_so_doanh_thu.py --tab "SM Hanoi"

# Giới hạn 500 dòng (test)
python scripts/import_gsheet_so_doanh_thu.py --limit 500
```

Logic:

- Load `nhan_su_sale` **một lần** (team cache) — map ~14k dòng trong vài giây thay vì query từng dòng
- Chỉ insert dòng `loai_nhap = tay`, tag `created_by_email = import:gsheet:{tab}`
- **Dedupe** theo `uid + pay_time + so_tien_vnd + sale + sdt` — chạy lại không nhân đôi
- **Không xóa** dòng cũ; **không đè** dòng M3 (`tu_dong`)
- Team: lookup cache `nhan_su_sale`; fallback SM Hanoi → Inhouse 1, HCM REV → HCM (Online)
- **Log tiến độ** (mức A): tải tab, map mỗi 2000 dòng, insert mỗi batch 100

Thời gian ước lượng (mức A — full fetch mỗi lần):

| Bước | Lần đầu (Sổ trống) | Lần sau (dedupe) |
|------|-------------------|------------------|
| Tải 2 tab Google | ~10–20s | ~10–20s |
| Map + team cache | ~5–15s | ~5–15s |
| Insert Supabase | ~5–10 phút (~14k dòng) | ~30s (chủ yếu skip) |

> Nếu import đang chạy **trước** khi có team cache — **Ctrl+C** và chạy lại script mới.

---

## Bước 6 — Import từ app (API / nút Sync)

Trên tab **Sổ doanh thu**, nút **Sync Data** (OPS) gọi endpoint dưới. UI có cảnh báo thời gian chờ 5–15 phút.

Sau khi deploy backend có env Google:

```http
POST /revenue/ledger/sync-gsheet
Authorization: Bearer <token Thu Hiền / System>
Content-Type: application/json

{
  "dryRun": true,
  "limit": 50
}
```

Response: `{ fetched, skippedExisting, inserted, dryRun, ... }`

Chỉ role **OPS** (Thu Hiền / System) gọi được.

---

## Map cột (tóm tắt)

| Sổ doanh thu | HCM REV | SM Hanoi |
|--------------|---------|----------|
| ngay_tien_ve | bank day (A) | bank day (A) |
| pay_time | Pay Time (I) | Pay Time (I) |
| so_tien_vnd | Real Pay (J) | Real Pay (K) |
| gmv_rmb | GMV (K) | GMV (L) |
| loai | Type (M) | Type (O) |
| sale_crm_name | Sales (N) | Sales (V) |
| team | lookup sale / default HCM | lookup sale / default Inhouse 1 |

Code: `backend/gsheet_ledger_import.py`

---

## Lịch tự động (tuỳ chọn)

Cron Render / GitHub Actions chạy hàng ngày:

```bash
python scripts/import_gsheet_so_doanh_thu.py
```

Hoặc gọi `POST /revenue/ledger/sync-gsheet` từ scheduler nội bộ.

---

## Roadmap sync (A → B → C)

| Mức | Trạng thái | Mô tả |
|-----|------------|-------|
| **A** | ✅ | Team cache + progress log; full fetch mỗi lần; append-only dedupe |
| **B** | Kế hoạch | `--since` / watermark — chỉ fetch dòng mới theo ngày |
| **C** | Kế hoạch | Apps Script `onEdit` → webhook upsert/delete realtime |

---

## Checklist nhanh

- [ ] Google Sheets API enabled
- [ ] Service account JSON tải về, **không** commit
- [ ] Sheet share **Viewer** cho email service account
- [ ] `GOOGLE_SHEETS_ID` + `GOOGLE_SERVICE_ACCOUNT_JSON` trong `.env`
- [ ] `pip install -r backend/requirements.txt`
- [ ] `--dry-run --limit 20` OK
- [ ] Import thật + kiểm tra Sổ doanh thu filter `import:gsheet`
