# Handoff team — 01.07 → 03.07.2026

> Audit 2026-06-30. Migration Zalo bug `2026-06-29-zalo-msg-use-crm-name.sql` đã apply prod xong (`jozcvbbypwvzaefteoxn`). M3-01 đóng (bucket `tax_exports` không cần).
>
> 6 việc còn lại, chia 3 người. Minh không xử lý gì thêm.
> 2 task OOM (VAC-08 + VAC-09) thêm sau khi audit memory backend 30/6: app sập 6 lần vì OOM trên Render Starter 512MB — gốc rễ là CRM backfill concurrency quá cao + 3 endpoint export build payload trong BytesIO.

---

## ĐỨC — VAC-05 + VAC-08 + VAC-09

### VAC-05: Cleanup fallback 3700 BE

**Bối cảnh:** Bảng `exchange_rates` đã sống (có data, có UI `ExchangeRatesPanel`, BE có `get_rate_for_date()` đọc bảng). Tuy nhiên 3 chỗ BE vẫn fallback cứng 3700 → khi bảng có rate khác, các path này không tôn trọng.

**Fix 3 chỗ:**

1. `backend/revenue_routes.py:776` — `_row_to_ledger()` đang dùng `row.get("ty_gia_vnd_rmb") or 3700`. Đổi sang re-query bảng theo `pay_time` của row khi value rỗng.

2. `backend/revenue_routes.py:1183` — `LedgerCreateBody.tyGiaVndRmb` default = 3700. Đổi default → `None`. Logic create/update đã đúng (line 1415-1418, 1521-1522 tự gọi `get_rate_for_date()` khi `tyGiaVndRmb` không truyền).

3. `backend/dashboard_routes.py:40` — `DEFAULT_EXCHANGE_RATE = 3700`. `_load_exchange_rate()` đã đọc bảng nhưng fallback về const này. Đổi fallback → query lại bảng theo ngày gần nhất.

**Verify:** `bash scripts/verify_vac.sh VAC-05`

### VAC-08: Giảm CRM backfill concurrency 8 → 3 (fix OOM)

**Bối cảnh:** App đã sập 6 lần vì OOM trên Render Starter (512MB). Audit memory 30/6 xác định: thủ phạm chính là `crm_routes.py` chạy 8 ngày song song × 5 lần thử header pandas mỗi file → peak 40 DataFrame cùng lúc trong RAM. Workload thực tế (30-80 row/ngày) không cần concurrency cao đến vậy — bottleneck là I/O lên CRM API ngoài, không phải CPU local.

**Fix 1 dòng:**

`backend/crm_routes.py:101`:
```python
# Trước:
BACKFILL_CONCURRENCY_MAX = 8
# Sau:
BACKFILL_CONCURRENCY_MAX = 3
```

Cũng giảm `BACKFILL_CONCURRENCY_DEFAULT` (line 100) từ 5 xuống 3 cho cùng nhịp.

Clamp ở line 938 (`max(1, min(int(concurrency or BACKFILL_CONCURRENCY_DEFAULT), BACKFILL_CONCURRENCY_MAX))`) tự enforce — không cần đụng logic.

**Tác động vận hành:** Backfill 30 ngày chậm hơn ~30-60s. Backfill 2-15 ngày (workload thường) gần như không khác. Đổi lại peak RAM giảm ~60%.

**KHÔNG đụng** `_read_excel_crm` 5-header attempt — đó là defensive cho format CRM API thay đổi (đã từng thay 1 lần, commit `7c958f9`).

**Verify:** `bash scripts/verify_vac.sh VAC-08`

### VAC-09: Refactor 3 endpoint export → tempfile + FileResponse (fix OOM)

**Bối cảnh:** 3 endpoint export đang build full payload trong `io.BytesIO()` rồi wrap `StreamingResponse` — chữ "streaming" gây hiểu lầm vì Python heap đã giữ trọn payload trước khi byte đầu tiên gửi cho client. Mỗi request batch 20-200 row giữ ~3-10MB trong heap + cộng dồn nhiều request đồng thời → OOM.

**3 endpoint cần sửa:**

1. `backend/activation_routes.py:1167` — `_export_b4_tax_batch` (POST /api/v1/invoice-courses/export-batch)
2. `backend/invoice_routes.py:805` — invoice export batch
3. `backend/crm_routes.py:1630` — GET /crm/export-master (Excel writer)

**Pattern fix:**

```python
import tempfile, os
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

# Trước:
zip_buf = io.BytesIO()
with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
    zf.writestr("a.xlsx", excel_a)
    ...
zip_buf.seek(0)
return StreamingResponse(zip_buf, media_type="application/zip", headers=...)

# Sau:
tmp = tempfile.NamedTemporaryFile(prefix="palfish_export_", suffix=".zip", delete=False)
tmp_path = tmp.name
tmp.close()
with zipfile.ZipFile(tmp_path, "w", zipfile.ZIP_DEFLATED) as zf:
    zf.writestr("a.xlsx", excel_a)
    ...
return FileResponse(
    tmp_path,
    media_type="application/zip",
    headers=...,
    background=BackgroundTask(os.unlink, tmp_path),
)
```

openpyxl `Workbook.save(path)` chạy y hệt `save(buf)` → builder functions không phải sửa.

**LƯU Ý CỰC KỲ QUAN TRỌNG — thứ tự DB-vs-file KHÁC NHAU ở 3 endpoint, KHÔNG copy-paste:**

| Endpoint | Thứ tự đúng (giữ nguyên) |
|----------|---------------------------|
| `activation_routes.py:1132-1167` | **RPC ghi tax codes TRƯỚC** → build file → FileResponse |
| `invoice_routes.py:710-805` | **Build ZIP TRƯỚC** → DB upsert sequence → FileResponse (intentional: ZIP fail = no codes consumed) |
| `crm_routes.py:1610-1634` | Live fetch → build Excel → FileResponse (không có DB write) |

Đọc kỹ block code hiện tại trước khi refactor.

**Verify:** `bash scripts/verify_vac.sh VAC-09`

Test kiểm tra: source code không còn `StreamingResponse(zip_buf|output)` + có import `FileResponse` + có import `BackgroundTask` để cleanup temp file (không có cleanup → temp file rò trên `/tmp`).

**Deploy:** `bash scripts/deploy.sh sandbox` test cả 3 endpoint export (B4 tax, B1 invoice, CRM export-master) rồi `bash scripts/deploy.sh prod`.

---

## GIANG — VAC-04: Merge sandbox → main

12 commits trên `sandbox` chưa lên `main`. Phần lớn là address static JSON migration + handoff docs.

**Trước khi mở PR:**
```bash
cd frontend
npx tsc -b           # phải pass (Vercel dùng tsc -b strict hơn --noEmit)
npm run build        # phải pass
npm run test         # phải pass
```

Mở PR: `gh pr create --base main --head sandbox --title "Merge sandbox: addr static JSON + handoff docs (T6/30)"`.

Sau merge: deploy prod BE nếu có thay đổi BE — `bash scripts/deploy.sh prod`.

---

## ĐẠT — VAC-03 + VAC-06

### VAC-03: BE installment validate `sale_received ≤ installment_total`

**Bối cảnh:** Bug 1B-07 trong `docs/bug-hunt-report-2026-06-13.md:269`. BE không validate ràng buộc → kế toán nhập sai (số nhận > tổng trả góp) vẫn lưu.

**Fix:** Trong `backend/payment_request_routes.py` chỗ tạo/update `PaymentLine` với `method=installment`:
```python
if payload.method == "installment":
    if payload.sale_received and payload.installment_total:
        if payload.sale_received > payload.installment_total:
            raise HTTPException(400, "sale_received vượt installment_total")
```
+ unit test trong `backend/tests/`.

### VAC-06: Cleanup fallback 3700 FE

`frontend/src/components/Module6Tab.tsx:254` — đang có `?? 3700` hard-code. Sửa: lấy tỷ giá từ API `endpoints.exchangeRates.list()` thay vì hard-code. Reference `ExchangeRatesPanel.tsx` để biết cách gọi.

---

## VAC-07: Onboarding team Inhouse 1 (Stellar Garden) đầu T7

**Ai làm:** Bất kỳ Đạt/Đức/Giang ai rảnh tại thời điểm yêu cầu. Worst case Minh tự làm từ mobile khi đi nghỉ về (UI dùng được trên phone, chỉ scroll ngang bảng).

**Bối cảnh:** 56 sale Inhouse 1 đã có đủ trong `nhan_su_sale` (verify: Auth Accounts → CRM Link Modal, filter team=Inhouse 1 → 56 nhân sự). Không cần sync lại, không cần gửi danh sách tên CRM cho sale (anh Hiếu đã hướng dẫn).

### Việc 1: Map Zalo group cho Inhouse 1 (làm TRƯỚC 1/7)

Hiện zalo_team_groups chỉ map team `Inhouse 2`. Tạm dùng chung group "IH2 & OFF - Báo tiền" cho IH1 (chưa tạo group riêng vì tốn phí, sẽ tính sau khi sale của IH2/OFF vào nhóm chính thức).

Cách 1 — qua UI: Tab admin **Zalo Groups** → "Thêm nhóm" → `team_code = "Inhouse 1"`, `group_id` paste từ row IH2, `is_active = true`.

Cách 2 — SQL prod:
```sql
INSERT INTO zalo_team_groups (team_code, group_id, group_name, is_active)
SELECT 'Inhouse 1', group_id, group_name, true
FROM zalo_team_groups WHERE team_code = 'Inhouse 2';
```

**Verify:** Sau khi map, payment_paid/course_activated event của sale IH1 phải đẩy vào group đó. Check tab **Zalo Outbox** sau giao dịch đầu của IH1.

### Việc 2: Kích hoạt tài khoản khi sale IH1 đăng ký

Khi 1 sale IH1 đăng ký tại `/signup` → status "Chờ kích hoạt" → kế toán/admin nhận yêu cầu (qua chat hoặc check Auth Accounts tab tab "Chờ kích hoạt"):

1. Mở tab **Auth Accounts** → row của sale → drawer mở.
2. Toggle "Đã kích hoạt".
3. Bấm "Liên kết CRM" → chọn đúng tên trong danh sách (filter team Inhouse 1 + sub-team) → "Xác nhận liên kết".
4. Nếu là leader sub-team → đổi vai trò sang **Leader** (mặc định User).

**Lưu ý:** Nếu tên sale điền lúc signup không khớp với crm_name trong nhan_su_sale → link sẽ báo "Không tìm thấy". Bảo sale sửa Họ tên trong profile cho đúng CRM, hoặc admin tự edit field "Họ tên trên CRM" trong drawer rồi link lại.

---

## Kiểm tra trước khi commit / merge

Toàn team:
- Branch riêng cho mỗi task: `vac-05-rate-cleanup`, `vac-04-sandbox-merge`, `vac-03-installment-validate`, `vac-06-rate-cleanup-fe`.
- Push lên sandbox trước, test, sau đó merge main.
- Render auto-deploy OFF (`memory/render-deploy-hook.md`). Deploy thủ công: `bash scripts/deploy.sh sandbox|prod`.
- Vercel auto theo branch (sandbox → preview, main → prod).

## Liên hệ khi block

- Minh offline 1-3/7. Block nặng → ping anh Hiếu/anh Uy.
- Sau 3/7 Minh review PR + merge.
