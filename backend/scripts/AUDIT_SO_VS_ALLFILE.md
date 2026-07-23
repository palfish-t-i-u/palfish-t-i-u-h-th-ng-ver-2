# Runbook A1 — Đối chiếu Sổ doanh thu ↔ All File Thu Hiền

Script: `backend/scripts/audit_so_vs_allfile.py` — **READ-ONLY**, không ghi/xóa gì
trên Supabase. An toàn chạy trên prod.

Mục đích: ra báo cáo "Sổ doanh thu khớp All File bao nhiêu %, lệch dòng nào, vì sao"
— phục vụ Mạch A1 trong kế hoạch hoàn thành App GMV (docs Lark 23/7).

## Điều kiện trước khi chạy

`backend/.env` phải có (đã có sẵn nếu máy từng chạy import/dedup):

- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` — **kiểm tra URL trỏ PROD**
  (`jozcvbbypwvzaefteoxn`), vì All File là dữ liệu thật. Trỏ sandbox thì kết quả vô nghĩa.
- `GOOGLE_SERVICE_ACCOUNT_JSON` — path tới file JSON service account (đọc GSheet).
- `GOOGLE_SHEETS_ID` — optional, script có default đúng spreadsheet All File.

## Chạy

```bash
cd backend
# 1. Test logic (không cần mạng/creds) — phải in SELFTEST PASS
python scripts/audit_so_vs_allfile.py --selftest

# 2. Đối chiếu kỳ mặc định T6–T7/2026
python scripts/audit_so_vs_allfile.py

# 3. (Tùy chọn) toàn bộ lịch sử
python scripts/audit_so_vs_allfile.py --start 2026-01-01 --end 2026-07-31
```

Thời gian chạy dự kiến: 1–3 phút (đọc sheet + phân trang bảng).

## Kết quả

Console in báo cáo + thư mục `backend/backups/audit_so_vs_allfile_<tag>/`:

| File | Nghĩa | Ưu tiên xử lý |
|---|---|---|
| `summary.md` | Báo cáo 1 trang — **paste thẳng lên Lark doc** | — |
| `sheet_only.csv` | File có, app THIẾU | #1 |
| `dup_suspect.csv` | Nghi sheet trùng (uid+ngày+tiền y hệt dòng DB đã khớp) — chờ người quyết, KHÔNG tự nạp | #1b |
| `amount_mismatch.csv` | Cùng khách + ngày, lệch số tiền | #2 |
| `db_only.csv` | App có, file không có (cột `loai_nhap`: `tu_dong` = app tự bắt → khả năng FILE thiếu, là điểm cộng app — xác nhận với Thu Hiền) | #3 |
| `matched_weak.csv` | Khớp chỉ bằng ngày+tiền (không UID) — spot-check 10 dòng | #4 |

Ngưỡng ĐẠT (in sẵn trong summary): khớp ≥99,5% theo số tiền VÀ ≤10 dòng lệch tiền.

## Sau khi chạy

1. Copy `summary.md` vào Lark doc "Kế hoạch hoàn thành GMV" (mục Mạch A) hoặc doc mới.
2. Báo kết quả cho Minh: % khớp, top nguyên nhân lệch từ 3 CSV đầu.
3. KHÔNG tự sửa dữ liệu — A2 (sửa lệch) là bước riêng, cần Minh duyệt từng nhóm nguyên nhân.

## Danang REV

Chi nhánh đã đóng, tab chỉ còn 49 dòng 2024–2025. KHÔNG thêm vào import.
Quyết định Minh 23/7/2026.

## Troubleshooting

- `Thiếu GOOGLE_SERVICE_ACCOUNT_JSON` → điền path trong `backend/.env` (bọc ngoặc kép nếu path có dấu cách).
- Sheet đọc về 0 dòng → tab đổi tên? Mặc định đọc `SM Hanoi` + `HCM REV` — xác nhận với Thu Hiền.
- Lỗi mạng Supabase giữa chừng → chạy lại, script không để lại trạng thái dở.
- Số dòng sheet ít bất thường → sheet có thể bị lọc/ẩn dòng; script đọc raw values nên không ảnh hưởng filter view, nhưng nếu Thu Hiền tách file mới thì cần `--spreadsheet-id <id mới>`.
