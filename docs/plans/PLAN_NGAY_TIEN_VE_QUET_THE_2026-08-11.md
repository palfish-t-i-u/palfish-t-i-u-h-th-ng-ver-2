# PLAN — Ngày tiền về + Thực nhận (tab Quẹt thẻ)

**Ngày**: 2026-08-11 · **Người execute**: Sonnet 4.6 · **Đã duyệt**: anh Minh
**Scope**: V-a (cột Ngày tiền về) + V-b (lọc theo ngày tiền về) + V-c (Thực nhận rõ hơn).
**RÀNG BUỘC LỚN NHẤT**: đây là **hiển thị thuần (Nhánh A)**. TUYỆT ĐỐI KHÔNG đụng `so_doanh_thu.ngay_tien_ve`, `stamp_net_fee`, báo cáo BC01/02/03, xuất hoá đơn, GMV BigQuery. Doanh thu vẫn tính theo **ngày quẹt** (đã chốt với chị Thu Hiền — đừng đổi).

---

## Ground truth (đã verify prod 11/8 — KHÔNG cần điều tra lại)

- **"Ngày tiền về" = cột `Ngày nhận tiền` trong `gateway_transactions.raw` (nguồn mPOS)** = ngày tiền thực về TK MB. Verified: luôn ≥ `TG kết toán`, trùng khít `gateway_settlements.created_date`, bank = "NH TMCP QUAN DOI (MB)". Đủ **92/92** đơn mPOS có field này.
- Đơn cùng **Mã phiếu chi** = về cùng 1 ngày (mPOS gom kết toán chi về MB 1 cục).
- **Payoo KHÔNG có ngày tiền về**: order feed `/api/ecom/order/` chỉ có `PurchaseDate` (giờ khách trả), `BillingCode` (chuẩn chi) rỗng. ⟹ `funded_date = NULL` cho mọi đơn Payoo → FE hiện "—".
- Cột "Thời gian" hiện tại (FE) = `paid_at` = **giờ quẹt** (mPOS `Ngày khởi tạo` / Payoo `PurchaseDate`). Giữ nguyên nghĩa, chỉ đổi nhãn.
- List **đã có sẵn** dòng net: `CardReconciliationTab.tsx:732` render `TN {vnd(t.net_amount)}` (màu xám). V-c chỉ làm nó rõ hơn.

## Bẫy — đọc trước khi code

1. **TZ trap (bài học C-T1/BC02)**: `Ngày nhận tiền` là chuỗi naive giờ VN (~02:29 sáng). Dùng type **`date`** + cast `::date` (lấy phần ngày). **KHÔNG** dùng `timestamptz` — sẽ lệch ngày khi PostgREST trả UTC.
2. **`ON CONFLICT (txn_code) DO NOTHING`** ([gateway_routes.py:274](../../backend/gateway_routes.py) `_upsert_rows`, `ignore_duplicates=True`): re-sync **không update** row cũ. ⟹ cần **backfill 1 lần** (G1-T3) + **self-heal** (G1-T4). **KHÔNG** đổi upsert sang `DO UPDATE` toàn bộ — sẽ wipe `match_status`/`payment_line_id`/`matched_at` của đơn đã ghép.
3. **Payoo `funded_date = NULL`**: order phải `NULLS LAST`; FE null → "—".
4. **FE đã live** (không còn mock data) — nhưng type `GatewayTxn` có thể vẫn ở `card-recon/mockGatewayTxns.ts`; grep để chắc trước khi sửa.
5. **2 Supabase project** (prod `jozc...`, sandbox `pxgy...`): migration + backfill chạy **sandbox trước, prod sau** (xem skill `database-and-migrations`).
6. Repo đang ở `main` → **tạo nhánh** `feat/ngay-tien-ve-quet-the` trước, không commit thẳng main.

---

## Milestone G1 — Backend: đưa ngày tiền về vào data

- **G1-T1 · Parser**: `backend/mpos_import.py` — thêm `"funded_date": ("Ngày nhận tiền",)` vào `DETAIL_ALIASES`; trong `_mpos_transaction_from_row` thêm `"funded_date": _date_only(_first(row, DETAIL_ALIASES, "funded_date"))` (helper `_date_only` đã có sẵn). Trong `_payoo_row` và `parse_payoo_orders` set `"funded_date": None`.
- **G1-T2 · Migration**: `docs/migrations/2026-08-11-gateway-funded-date.sql` — `ALTER TABLE gateway_transactions ADD COLUMN funded_date date;` + `NOTIFY pgrst, 'reload schema';`. Apply sandbox → prod.
- **G1-T3 · Backfill**: `UPDATE gateway_transactions SET funded_date = (raw->>'Ngày nhận tiền')::date WHERE source='mpos' AND funded_date IS NULL AND coalesce(raw->>'Ngày nhận tiền','') <> '';` (sandbox → prod). Verify sau: `SELECT count(*) FILTER (WHERE funded_date IS NULL) FROM gateway_transactions WHERE source='mpos';` phải = 0.
- **G1-T4 · Ingest ghi + self-heal**: `gateway_routes.py` — `_txn_insert_row` thêm `"funded_date": record.get("funded_date")`. Sau `_upsert_rows` trong `ingest_gateway_file` **và** `ingest_gateway_orders`, chạy UPDATE có target: với mỗi record có `funded_date`, `UPDATE ... SET funded_date=<val> WHERE txn_code=<code> AND funded_date IS NULL` (chỉ funded_date, **không** động match_status). Xử lý row synced trước khi có tiền về.
- **G1-T5 · Serializer**: `_serialize_gateway_txn` thêm `"funded_date": row.get("funded_date")` (trả chuỗi `YYYY-MM-DD` thô, FE tự format — KHÔNG `_format_dt`).

## Milestone G2 — FE hiển thị (cột Ngày tiền về + Thực nhận)

- **G2-T1 · Type**: thêm `funded_date?: string | null` vào type `GatewayTxn` (grep định nghĩa — `card-recon/mockGatewayTxns.ts` hoặc `frontend/src/types`). Đảm bảo `endpoints.cardRecon` (api.ts) không strip field.
- **G2-T2 · Cột list**: `CardReconciliationTab.tsx` — th `:659` "Thời gian" → **"Thời gian quẹt"**; thêm 1 th **"Ngày tiền về"**; render `funded_date` (format `DD/MM/YYYY`, null → "—").
- **G2-T3 · Drawer**: label `:853` "Thời gian" → **"Thời gian quẹt thẻ"**; thêm 1 `info-cell` **"Ngày tiền về"** → `funded_date` (null → "—").
- **G2-T4 · V-c Thực nhận**: dòng `:732` đổi `TN {vnd(t.net_amount)}` → `Thực nhận {vnd(t.net_amount)}`; đổi màu chữ xám → xanh tiền (`var(--money)` hoặc green token trong `gmv-tokens.css`).
- **G2-T5 · Sort mặc định**: `list_gateway_txns` (gateway_routes.py) đổi `.order("paid_at", desc=True)` → `.order("funded_date", desc=True, nullsfirst=False).order("paid_at", desc=True)` (Payoo null xuống cuối).

## Milestone G3 — FE lọc theo ngày tiền về [V-b]

- **G3-T1 · BE params**: `list_gateway_txns` thêm query `funded_from`/`funded_to` → `.gte("funded_date", funded_from[:10])` / `.lte("funded_date", funded_to[:10])`. Giữ nguyên `from`/`to` (paid_at) hiện có.
- **G3-T2 · FE filter**: thêm date-range picker "Ngày tiền về" (reuse `DateRangeFilter` của payment-request nếu dùng chung được) gọi `funded_from`/`funded_to`.

---

## Validation (bắt buộc, cheapest-first)

1. `cd backend && python -m pytest tests/test_mpos_import.py tests/test_gateway_routes.py -v` — thêm/sửa test: parser điền `funded_date` từ "Ngày nhận tiền", Payoo → None, serializer trả field.
2. `cd frontend && npx tsc -b` (Vercel dùng `tsc -b`, không `--noEmit`).
3. `cd frontend && npm run test` (nếu có test CardReconciliationTab).
4. Sandbox: apply migration + backfill + đối chiếu 1 phiếu chi (vd 79386189 → funded_date 2026-08-10 cho các đơn của nó).
5. Prod: migration + backfill + verify null count = 0 + reload FE kiểm cột.

## Deadline (1 dev full-time)

| Milestone | Nội dung | Est |
|---|---|---|
| G1 | Backend data (parser→backfill→ingest→serializer) | 0.5 ngày |
| G2 | FE cột Ngày tiền về + rename + Thực nhận + sort | 0.5 ngày |
| G3 | FE lọc theo ngày tiền về | 0.5 ngày |
| — | Test + apply sandbox→prod | 0.5 ngày |
| **Tổng** | | **~1.5–2 ngày** |

## Đối chiếu 5 tiêu chí

1. **Triệt để**: phủ parser + schema + ingest + backfill + self-heal + serializer + FE(cột/rename/sort/filter/Thực nhận) + test; cover Payoo-null + row-synced-trước-khi-về-tiền.
2. **Không lỗi con**: type `date` né TZ; giữ `DO NOTHING` (không wipe đơn đã ghép), fill funded_date qua backfill/self-heal riêng; Payoo null → "—"/nulls last; **không đụng sổ/báo cáo/HĐ**.
3. **Không tăng hạ tầng**: 1 cột nullable, không bảng/service/dependency mới; backfill 1 lần ~92 dòng.
4. **Tối ưu token**: plan cô đọng, mỗi task chỉ file:line + SQL, không mò lại.
5. **Bền vững/self-contained**: ground truth + bẫy + file:line + SQL đầy đủ trong doc — Sonnet execute không cần đọc lại hội thoại.
