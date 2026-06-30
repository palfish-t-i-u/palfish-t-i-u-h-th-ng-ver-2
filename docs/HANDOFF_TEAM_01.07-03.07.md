# Handoff team — 01.07 → 03.07.2026

> Audit 2026-06-30. Migration Zalo bug `2026-06-29-zalo-msg-use-crm-name.sql` đã apply prod xong (`jozcvbbypwvzaefteoxn`). M3-01 đóng (bucket `tax_exports` không cần).
>
> 4 việc còn lại, chia 3 người. Minh không xử lý gì thêm.

---

## ĐỨC — VAC-05: Cleanup fallback 3700 BE

**Bối cảnh:** Bảng `exchange_rates` đã sống (có data, có UI `ExchangeRatesPanel`, BE có `get_rate_for_date()` đọc bảng). Tuy nhiên 3 chỗ BE vẫn fallback cứng 3700 → khi bảng có rate khác, các path này không tôn trọng.

**Fix 3 chỗ:**

1. `backend/revenue_routes.py:776` — `_row_to_ledger()` đang dùng `row.get("ty_gia_vnd_rmb") or 3700`. Đổi sang re-query bảng theo `pay_time` của row khi value rỗng.

2. `backend/revenue_routes.py:1183` — `LedgerCreateBody.tyGiaVndRmb` default = 3700. Đổi default → `None`. Logic create/update đã đúng (line 1415-1418, 1521-1522 tự gọi `get_rate_for_date()` khi `tyGiaVndRmb` không truyền).

3. `backend/dashboard_routes.py:40` — `DEFAULT_EXCHANGE_RATE = 3700`. `_load_exchange_rate()` đã đọc bảng nhưng fallback về const này. Đổi fallback → query lại bảng theo ngày gần nhất.

**Verify:**
- Test: insert row `exchange_rates` rate=3800 ngày X. Tạo ledger ngày X, đọc lại → phải 3800.
- Smoke: `cd backend && pytest tests/` không vỡ.

**Deploy:** `bash scripts/deploy.sh sandbox` test xong rồi `bash scripts/deploy.sh prod`.

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

## Kiểm tra trước khi commit / merge

Toàn team:
- Branch riêng cho mỗi task: `vac-05-rate-cleanup`, `vac-04-sandbox-merge`, `vac-03-installment-validate`, `vac-06-rate-cleanup-fe`.
- Push lên sandbox trước, test, sau đó merge main.
- Render auto-deploy OFF (`memory/render-deploy-hook.md`). Deploy thủ công: `bash scripts/deploy.sh sandbox|prod`.
- Vercel auto theo branch (sandbox → preview, main → prod).

## Liên hệ khi block

- Minh offline 1-3/7. Block nặng → ping anh Hiếu/anh Uy.
- Sau 3/7 Minh review PR + merge.
