# Import Sổ doanh thu từ Google Sheet (All File Thu Hiền)

Pipeline: tab **`SM Hanoi`** + **`HCM REV`** → map schema Sổ → Supabase `so_doanh_thu`.

**Không** import tab pivot `HN Inhouse 1` (chỉ tổng sale×tháng).

Sheet mặc định: [All File Thu Hiền](https://docs.google.com/spreadsheets/d/1sEthbH-zcMavoQ1qi9J_CNnHAJoyt0gfsE-xsMW0LCc/edit)

**Mục đích:** Import **một lần** lịch sử từ All File → Sổ doanh thu. Sau go-live Thu Hiền làm việc trên Sổ; **không** cần sync định kỳ. Nút Sync trên app giữ cho OPS re-import khẩn cấp (append-only dedupe).

**Dòng/cột thu gọn trên UI:** Google Sheets API (`values.get`) trả **toàn bộ ô** trong range — row group (vd. thu gọn dòng 2–13516 tab SM Hanoi) và cột ẩn **không** làm mất dữ liệu khi import.

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

- Load `nhan_su_sale` **một lần** (team cache) — map ~14,6k dòng trong vài giây thay vì query từng dòng
- Parse số VND/GMV: hỗ trợ chuỗi VN `4.978.000` (tab **HCM REV** trả dạng này qua API), US `4,978,000`, và số thuần
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
| Insert Supabase | ~5–10 phút (~14,6k dòng) | ~30s (chủ yếu skip) |

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
| team | cột **AH (TEAM)** trên SM Hanoi | lookup sale / default HCM |

Code: `backend/gsheet_ledger_import.py` — `_parse_sheet_number()` xử lý format số từ API.

---

## Đối chiếu số liệu (2026-05-24)

**Nguồn đối chiếu đúng:** tab giao dịch **`SM Hanoi` + `HCM REV`** (Google Sheet live qua API). **Không** so trực tiếp tab pivot (`HN Inhouse 1` — có thể thiếu sale, xem `BC01_DOI_CHIEU_THU_HIEN.md`).

| Chỉ số | Google Sheet live (map unique) | Sổ doanh thu (prod) |
|--------|-------------------------------:|--------------------:|
| Số dòng | 14.610 | 14.610 |
| Real Pay (VND) | 149.737.229.762 | 149.737.229.762 |
| GMV (RMB) | 42.354.302 | 42.354.302 |

**Cách tự verify (dev):**

```bash
# Dry-run — phải thấy HCM REV ~794 dòng hợp lệ (không phải 2)
python scripts/import_gsheet_so_doanh_thu.py --dry-run

# Chỉ bù tab HCM sau khi sửa parser
python scripts/import_gsheet_so_doanh_thu.py --tab "HCM REV"
```

**Lưu ý khi so với file `.xlsx` tải về:** bản download có thể lệch ~61 dòng / ~1 tỷ ₫ so với sheet live — do dedupe fingerprint giữa 2 tab (`uid + pay_time + so_tien_vnd + sale + sdt`). **Ưu tiên sheet live.**

**Thẻ Sổ vs BC01/BC02:**

| Màn hình | Đơn vị | Lọc ngày |
|----------|--------|----------|
| Thẻ Sổ doanh thu | VND (`so_tien_vnd`) | `pay_time` |
| BC01 / BC02 | RMB (`gmv_rmb`) | Lọc `pay_time`; BC01 **cột tháng** = `ngay_tien_ve` |

**Thẻ Sổ vs tab GMV (All File):**

| Màn hình | Phạm vi team | Lọc ngày |
|----------|--------------|----------|
| Tab **GMV** (cột B) | **Inhouse 1** (ô B1 — COUNTIFS cột AH SM Hanoi) | Pay Time |
| Thẻ Sổ — filter **Inhouse 1** | Inhouse 1 | `pay_time` |
| Thẻ Sổ — **Tất cả teams** | SM Hanoi + HCM (+ M3) | `pay_time` |

→ So GMV tab với Sổ **Tất cả teams** sẽ lệch số đơn Inhouse 2 / HCM. Chi tiết + case 25/05/2026: **`docs/M5_DOI_CHIEU.md`**.

**Audit file gốc vs All File (2026-05-25):** All File mất phần lẻ GMV (SM −460 RMB / 13,9k dòng). Khuyến nghị re-seed từ DingTalk xlsx — `docs/M5_OPERATIONS.md` §2.3, `scripts/seed_dingtalk_ledger.py`.

---

## Lịch tự động (tuỳ chọn — thường không cần sau import lần đầu)

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
- [ ] Import thật + kiểm tra Sổ: ~14.610 dòng, ~149,7 tỷ ₫ (không lọc ngày)
- [ ] Dry-run HCM REV: **794** dòng hợp lệ (không phải ~2)
