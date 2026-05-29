# HANDOFF — Task 8: Kết nối Casso Flow + Tab "Biến động số dư"

> Tạo 29/05/2026 · Codebase: `E:\PalFish\DA\pf-gmv-reconciliation\palfish-t-i-u-h-th-ng-ver-2`
> Stack: FastAPI + Supabase + React/Vite

---

## MỤC TIÊU (non-tech)

Hiện app chỉ "thấy" giao dịch nào do nó tạo QR PayOS. Casso Flow thì thấy **mọi dòng tiền** vào/ra tài khoản ngân hàng (chuyển khoản tay, ATM, QR…). Cần đưa luồng giao dịch Casso vào app, hiển thị 1 tab **"Biến động số dư"** giống màn "Hoạt động" của Casso (xem ảnh): danh sách giao dịch + bộ lọc tài khoản / tiền vào-ra / thời gian / trạng thái. Tab chỉ **System** thấy (anh, Thu Hiền, anh Hiếu, Giang, Đức, Đạt).

## HIỆN TRẠNG

- Casso đã kết nối **MB Bank HN** (gói Standard, Webhook V2 khả dụng). Tài khoản: `MBBank BIZ Official – 1680011668899 – CONG TY TNHH TRUONG QUOC TE PALFISH SINGAPORE – VIETNAM`.
- VCB HCM **chưa kết nối** Casso (Casso báo "Tài khoản NH 1/14").
- Casso webhook gửi cả **tiền vào + tiền ra** (không lọc được 1 chiều — phải lọc ở app).
- ⚠️ MB yêu cầu **ký hợp đồng 3 bên trong 7 ngày** sau khi liên kết.

---

## KIẾN TRÚC TỔNG QUAN

```
Casso Flow
  ├── Webhook V2 (real-time)  ──POST──►  /webhook/casso   ──► bảng bank_transactions
  └── REST API /v2/transactions (backfill lịch sử) ──► sync_casso() ──► bank_transactions
                                                                              │
  FE tab "Biến động số dư"  ◄──GET── /bank-flow/transactions (RBAC system) ◄──┘
```

2 đường nạp dữ liệu (giống PayOS đã làm):
1. **Webhook real-time**: Casso đẩy giao dịch MỚI ngay khi phát sinh → app lưu liền.
2. **REST API backfill**: kéo giao dịch LỊCH SỬ (10 dòng đang có trên Casso) 1 lần khi setup.

Tái dùng pattern webhook PayOS sẵn có: `backend/main.py:1021` (`/webhook/payos`) + `api_pipe/payos_webhook.py`.

---

## PHASE 1 — Backend: bảng dữ liệu + webhook receiver

### Việc cần làm (non-tech)
Tạo "ngăn chứa" giao dịch Casso trong database, và 1 "hộp thư" để Casso gửi giao dịch mới vào real-time.

### Tech

**1.1 Bảng mới `bank_transactions`** — tách riêng khỏi `giao_dich` (bảng cũ gắn với don_hang). Tạo file `docs/supabase_schema_patch_v9_bank_transactions.sql`:
```sql
CREATE TABLE IF NOT EXISTS bank_transactions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casso_id        bigint UNIQUE,              -- id/tid của Casso → dedup
  reference       varchar,                    -- Mã tham chiếu (FT26149...)
  description     text,                       -- Mô tả giao dịch
  amount          bigint NOT NULL,            -- + tiền vào, - tiền ra
  direction       varchar NOT NULL,           -- 'in' | 'out' (suy từ dấu amount)
  running_balance bigint,                     -- Số dư sau giao dịch (cusum_balance)
  transacted_at   timestamptz NOT NULL,       -- Ngày diễn ra (when)
  bank_sub_acc_id varchar,                    -- Số TK (1680011668899)
  bank_name       varchar,                    -- MBBank / VCB
  counterpart_name    varchar,                -- Tên người đối ứng (nếu Casso trả)
  counterpart_account varchar,
  status          varchar DEFAULT 'received',
  raw             jsonb,                      -- Lưu nguyên payload — an toàn về sau
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bank_tx_time ON bank_transactions (transacted_at DESC);
CREATE INDEX IF NOT EXISTS idx_bank_tx_dir  ON bank_transactions (direction, transacted_at DESC);
CREATE INDEX IF NOT EXISTS idx_bank_tx_acc  ON bank_transactions (bank_sub_acc_id);
NOTIFY pgrst, 'reload schema';
```
> `casso_id UNIQUE` = chống trùng (webhook + backfill có thể gửi cùng 1 giao dịch).

**1.2 Module `backend/casso_webhook.py`** (mô phỏng `api_pipe/payos_webhook.py`):
- `verify_secure_token(header_token)` — so với `CASSO_SECURE_TOKEN` trong `.env`.
- `parse_casso_tx(item)` → dict khớp cột bảng. Lưu ý format Webhook V2:
  ```json
  { "id": 12345, "tid": "FT...", "description": "...", "amount": 4940000,
    "cusum_balance": 142875000, "when": "2026-05-29 04:31:00",
    "bank_sub_acc_id": "1680011668899", "bankName": "MBBank",
    "corresponsiveName": "...", "corresponsiveAccount": "..." }
  ```
  - `direction` = `'in' if amount >= 0 else 'out'`
  - Casso V2: tiền ra → amount âm; tiền vào → dương.
- `store_casso_transactions(sb, items)` — upsert theo `casso_id` (on_conflict bỏ qua) → idempotent.

**1.3 Endpoint `POST /webhook/casso`** trong `main.py` (cạnh `/webhook/payos:1021`):
```python
@app.post("/webhook/casso")
async def casso_webhook(payload: dict, secure_token: str | None = Header(None, alias="Secure-Token")):
    if not verify_secure_token(secure_token):
        raise HTTPException(401, "Invalid Casso token")
    sb = _supabase()
    items = payload.get("data") or []
    n = store_casso_transactions(sb, items)
    return {"error": 0, "inserted": n}   # Casso cần {"error": 0} để coi là thành công
```
> Casso chỉ coi webhook OK nếu response có `error: 0` (HTTP 200).

**1.4 Env mới** (`.env` + `render.yaml`):
```
CASSO_API_KEY=<từ Casso → Thiết lập → API key>
CASSO_SECURE_TOKEN=<chuỗi tự đặt, dán vào Casso Webhook V2 config>
```

**1.5 Đăng ký webhook trên Casso:** sau khi deploy, vào Casso → Webhook V2 → URL = `https://palfish-gmv-api.onrender.com/webhook/casso`, chọn ngân hàng MB, gửi "Tất cả", dán `Secure-Token`.

---

## PHASE 2 — Backend: backfill lịch sử qua REST API

### Việc cần làm (non-tech)
Webhook chỉ bắt giao dịch TỪ LÚC bật trở đi. 10 giao dịch đã có trên Casso (và lịch sử) phải kéo về bằng API 1 lần.

### Tech
**`backend/casso_sync.py`** + endpoint `POST /bank-flow/sync-casso` (chỉ System):
```python
# GET https://oauth.casso.vn/v2/transactions?fromDate=2026-01-01&page=1&pageSize=100&sort=ASC
# Header: Authorization: Apikey <CASSO_API_KEY>
```
- Phân trang (`page`/`pageSize`), lặp tới hết.
- Mỗi giao dịch → `parse_casso_tx` → upsert theo `casso_id` (cùng hàm Phase 1) → không trùng với webhook.
- Trả `{fetched, inserted, skipped}`.

> Lưu ý quota gói Standard ("Giao dịch 10/100") — backfill nhiều có thể chạm giới hạn. Kiểm tra gói trước khi kéo lớn.

---

## PHASE 3 — Backend: endpoint danh sách + RBAC System-only

### Tech
`GET /bank-flow/transactions` trong `main.py`:
```python
@app.get("/bank-flow/transactions")
def list_bank_flow(
    authorization: str | None = Header(None),
    direction: str | None = None,      # 'in' | 'out' | None(all)
    from_date: str | None = Query(None, alias="from"),
    to_date: str | None = Query(None, alias="to"),
    bank_sub_acc_id: str | None = None,
    status: str | None = None,
    q: str | None = None,              # search mô tả / mã tham chiếu
    limit: int = Query(100, le=500),
    offset: int = 0,
):
    sb = _sb_or_503(_supabase)
    actor = resolve_actor(sb, authorization)
    require_min_role(actor, "system")          # ← CHỈ System (rbac.py có sẵn require_min_role)
    query = sb.table("bank_transactions").select("*", count="exact")
    if direction in ("in", "out"): query = query.eq("direction", direction)
    if from_date: query = query.gte("transacted_at", from_date)
    if to_date:   query = query.lte("transacted_at", to_date)
    if bank_sub_acc_id: query = query.eq("bank_sub_acc_id", bank_sub_acc_id)
    if q: query = query.or_(f"description.ilike.%{q}%,reference.ilike.%{q}%")
    res = query.order("transacted_at", desc=True).range(offset, offset+limit-1).execute()
    return {"transactions": res.data or [], "total": res.count}
```
> `require_min_role(actor, "system")` đảm bảo chỉ System gọi được (Thu Hiền=Ops→system nên cũng vào được — đúng ý anh).

---

## PHASE 4 — Frontend: tab "Biến động số dư"

### Việc cần làm (non-tech)
Thêm 1 mục menu mới trong nhóm "Đối soát & Hóa đơn", chỉ System thấy, hiển thị bảng giao dịch + bộ lọc giống Casso.

### Tech

**4.1 RBAC hiển thị tab** — `frontend/src/pages/MainPage.tsx`:
- Thêm cờ: `const showBankFlow = profile?.canManageStaff ?? isDevMode;` (`canManageStaff` = rank ≥ system — đúng nhóm System anh liệt kê).
- Thêm `ViewId` `"bankFlow"`, thêm NavItem trong nhánh `if (showReconciliation)` HOẶC nhánh riêng `if (showBankFlow)` với `section: "Đối soát & Hóa đơn"`.
- Thêm `case "bankFlow": return showBankFlow ? <BankFlowTab /> : null;` (theo pattern render on-demand mới của `ee8011f`).
- Lazy load: `const BankFlowTab = lazy(() => import("../components/BankFlowTab"));`

**4.2 Component `frontend/src/components/BankFlowTab.tsx`** — bố cục theo ảnh Casso:
- **Filter bar trái/đầu:** Tài khoản (dropdown từ bank_sub_acc_id), Loại (Tất cả / Tiền vào / Tiền ra), Thời gian (30 ngày / Tháng này / Tháng trước / custom — tái dùng `DateRangeFilter` đã có ở payment-request), Search box.
- **Bảng:** cột Ngày diễn ra · Mã GD · Mã tham chiếu · Mô tả · Giá trị (xanh nếu vào, đỏ nếu ra) · Số dư · Trạng thái (✓).
- **Footer:** Tổng số GD + tổng giá trị (như Casso "Tổng (10) … 142,875,000").
- Gọi `endpoints.bankFlow.list({direction, from, to, q})`.

**4.3 API client** — `frontend/src/lib/api.ts`: thêm
```ts
bankFlow: {
  list: (params) => api.get("/bank-flow/transactions", { params }),
  sync: () => api.post("/bank-flow/sync-casso"),
}
```

---

## PHASE 5 (về sau) — Đối soát tự động

Khi đã có `bank_transactions`, match với `payment_lines`/`payment_requests`:
- So `description` (chứa transfer_code / nội dung CK) ↔ `payment_lines.transfer_code`.
- Tự gắn cờ "đã nhận tiền" thay cho thao tác tay của Thu Hiền.
- → Đây là phần thay thế việc PayOS không bao quát hết dòng tiền.

---

## THỨ TỰ LÀM + BE/FE

| Phase | Nội dung | BE/FE | Phụ thuộc |
|---|---|---|---|
| 1 | Bảng `bank_transactions` + `/webhook/casso` + đăng ký webhook Casso | BE | Casso API key + Secure token |
| 2 | Backfill REST API `/bank-flow/sync-casso` | BE | Phase 1 |
| 3 | Endpoint list + RBAC system | BE | Phase 1 |
| 4 | Tab "Biến động số dư" + filters | FE | Phase 3 |
| 5 | Đối soát tự động (sau) | BE+FE | Phase 1-4 |

---

## CẦN ANH CHUẨN BỊ / XÁC NHẬN

1. **Casso API key** (Casso → Thiết lập → API) + tự đặt **Secure-Token**.
2. **VCB HCM**: khi nào kết nối VCB vào Casso? (hiện mới có MB). VCB Casso ngừng đồng bộ 22h–5h — cần note trong UI.
3. **Ký hợp đồng 3 bên MB trong 7 ngày** (deadline đang chạy).
4. Xác nhận loại TK: HN = MBBank BIZ Official (DN) ✓ thấy trên ảnh; HCM = VCB DigiBiz hay iB@nking?
5. Quota gói Standard (100 giao dịch?) — đủ cho backfill + real-time không, hay cần nâng gói?

---

## FILE THAM KHẢO TRONG REPO

- Webhook pattern: `backend/main.py:1021` (`/webhook/payos`), `api_pipe/payos_webhook.py`
- List + RBAC pattern: `backend/main.py:1042` (`/payos/transactions`), `backend/rbac.py` (`require_min_role`, `resolve_actor`)
- Nav + RBAC FE: `frontend/src/pages/MainPage.tsx` (cờ `showStaffCrm`/`showAuthAccounts`, render on-demand)
- Filter component tái dùng: `frontend/src/components/payment-request/DateRangeFilter.tsx`
- Schema patch mẫu: `docs/supabase_schema_patch_v8_*.sql`
