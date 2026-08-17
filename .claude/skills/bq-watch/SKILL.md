---
name: bq-watch
description: Chạy bq-schema-watch.js để phát hiện thay đổi schema BigQuery (cột thêm/xoá/đổi kiểu) so với baseline. Nếu phát hiện drift, tự đề xuất sửa scripts Apps Script tương ứng.
---

## Overview

Chung quản lý bảng/view BQ payroll và thường xuyên thêm/xoá/đổi cột mà không báo trước.
Scripts Apps Script (BangLuong, BangTinhThue, DoiSoatLuong) bám TÊN CỘT trong SQL →
mỗi lần đổi cột là nguy cơ crash. Skill này chạy watcher rồi phân tích kết quả.

## When to use

- User nói "check BQ", "Chung đổi gì chưa", "schema có gì mới không", "bq watch"
- User gọi `/bq-watch`
- Sau khi Chung báo đã cập nhật bảng BQ

## Procedure

### 1. Set CLOUDSDK_PYTHON và chạy watcher

Chạy bằng **PowerShell** (bq CLI cần Python thật, Windows Store stub bị chặn):

```powershell
$env:CLOUDSDK_PYTHON = "C:\Users\Anh Minh\AppData\Local\Programs\Python\Python310\python.exe"; node "D:\File làm việc\automation\palfish-gmv-reconciliation-v2\docs\apps-script\bq-schema-watch.js"
```

### 2. Phân tích kết quả

**Nếu "Không có thay đổi"** → báo user, xong.

**Nếu có drift** → với MỖI cột thay đổi:

1. **Cột XOÁ**: Grep tên cột trong 4 file script (`docs/apps-script/*.gs`) → liệt kê dòng nào dùng cột đó → đề xuất thay thế hoặc xoá reference.

2. **Cột THÊM**: Báo user cột mới, hỏi có cần thêm vào script không (thường là không, trừ khi cột mới thay thế cột cũ).

3. **Cột ĐỔI KIỂU**: Kiểm tra script có SAFE_CAST hay parse nào phụ thuộc kiểu cũ không.

### 3. Sửa script (nếu cần)

- Đọc file script liên quan
- Sửa SQL query / column reference
- Validate SQL qua bq CLI (dry-run):
  ```powershell
  $env:CLOUDSDK_PYTHON = "..."; bq query --use_legacy_sql=false --dry_run "SELECT ..."
  ```

### 4. Cập nhật baseline

Sau khi sửa xong scripts, lưu baseline mới:

```powershell
$env:CLOUDSDK_PYTHON = "C:\Users\Anh Minh\AppData\Local\Programs\Python\Python310\python.exe"; node "D:\File làm việc\automation\palfish-gmv-reconciliation-v2\docs\apps-script\bq-schema-watch.js" --save
```

### 5. Báo cáo

Format ngắn gọn:

```
## BQ Schema Watch — [ngày]

**Drift:** [số cột thay đổi] | **Scripts sửa:** [danh sách file]

| Bảng | Cột | Thay đổi | Script ảnh hưởng | Fix |
|------|-----|----------|-----------------|-----|
| ... | ... | XOÁ/THÊM/ĐỔI | BangLuong.gs:42 | đổi sang cột X |

**Baseline:** đã cập nhật / chưa (chờ user confirm)
```

## Files

- Watcher: `docs/apps-script/bq-schema-watch.js`
- Baseline: `docs/apps-script/bq-schema-baseline.json`
- Scripts theo dõi: `docs/apps-script/BangLuong.gs`, `BangTinhThue.gs`, `DoiSoatLuong.gs`, `PhieuLuongGate.gs`
- Bảng BQ theo dõi (5): xem mảng `WATCH` trong `bq-schema-watch.js`
