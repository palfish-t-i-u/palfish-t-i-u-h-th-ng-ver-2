# HANDOFF — Đức: BE Đối soát giao dịch mPOS / Payoo

> Tạo: 2026-06-16 · Branch FE đã có: `sandbox` (deploy `palfish-gmv-manager-sandbox.vercel.app`)
> Liên quan: `backend/mpos_import.py` (Giang), `backend/crm_routes.py` (pattern extension), `backend/sepay_routes.py` (pattern ingest/RBAC)

---

## 0. TRẠNG THÁI THỰC THI (cập nhật tối 16/6 — Minh + Đức)

Đức đã push BE core (`37fe208`). Minh review + làm nốt tối 16/6:

**✅ XONG + đã test (8/8 pytest xanh — `backend/tests/test_gateway_routes.py`):**
- Migration 2 bảng `gateway_transactions`/`gateway_settlements` — **đã apply trên Supabase sandbox** (Đức chạy lúc push; verify 2 bảng + schema khớp, hiện 0 dòng).
- API đủ 6 endpoint, shape khớp FE mock (`gateway_routes.py`).
- Parser mPOS map cột thật (alias tuple) — bug map sai cột đã hết.
- **Payoo JSON auto-fetch**: `parse_payoo_orders()` + endpoint `POST /api/v1/gateway-sync/ingest-orders` (nhận mảng `OrderList`). CSV = fallback upload tay.
- Sửa bug header file "Danh sách phiếu chi" (tự dò header dòng 0/1).
- `match-candidates`: ghép theo tiền + **xếp theo độ gần ngày**, KHÔNG ẩn lần TT đã `paid`, loại lần TT đã ghép giao dịch khác. (Verify DB sandbox: 15 line `paid` + 6 `pending` → code cũ lọc `pending` sẽ ẩn mất 15 line paid.)
- Extension (`crm-token-extension/`): logic kéo data thật (Payoo lật trang JSON + mPOS tải file) + `chrome.alarms` 6h + message `gateway-sync-now`.

**⏳ CÒN LẠI (chưa verify được tối nay):**
- **Test extension với phiên mPOS/Payoo thật**: params export mPOS reverse-engineer cần phiên đăng nhập kiểm chứng (Payoo JSON tự tin hơn).
- **Popup nhập `gatewayIngestToken`** + cầu nối nút "Đồng bộ ngay" của app → extension.
- **FE bỏ mock, nối API thật** (`endpoints.cardRecon.*`).
- Xác nhận giao dịch **trả góp** Payoo có lên chung feed `/api/ecom/order/` không.

---

## 1. TỔNG QUAN & PHẠM VI

Thêm **Đối soát giao dịch quẹt thẻ mPOS + thanh toán Payoo** vào app.

- **CHỈ làm đối soát** — KHÔNG đụng luồng tạo lần thanh toán hiện tại. Giữ nguyên.
- Giao dịch từ mPOS/Payoo được kéo về app → kế toán **ghép từng giao dịch với đúng lần thanh toán (payment_line) của PR** (đối chiếu số tiền + ngày + ảnh bill sales gửi).
- mPOS/Payoo **không có API chính thức** → kéo data bằng **tiện ích trình duyệt** (extension), KHÔNG phải server cron (xem mục 3).

**Đơn vị đối soát = 1 giao dịch thẻ** (1 lần quẹt / 1 đơn online) = 1 khách = khớp 1 payment_line. mPOS gom nhiều giao dịch theo "phiếu chi"; phiếu chi chỉ để hiển thị/đối chiếu tổng.

---

## 2. FE ĐÃ XONG (trên `sandbox`, mock data)

| File | Chức năng |
|------|-----------|
| `frontend/src/components/CardReconciliationTab.tsx` | Màn đối soát: bảng giao dịch + drawer ghép (gợi ý ứng viên theo số tiền+ngày, ô ảnh bill), trạng thái Chưa ghép/Đã ghép/Bỏ qua. Prop `lockedSource: 'mpos'|'payoo'`. |
| `frontend/src/components/GatewaySyncTab.tsx` | Tab "Đồng bộ mPOS/Payoo" (mục Dữ liệu): tải tiện ích + hướng dẫn cài + last-sync + nút Đồng bộ ngay. |
| `frontend/src/components/card-recon/mockGatewayTxns.ts` | **Shape dữ liệu mock — BE trả đúng shape này.** |
| `frontend/src/pages/MainPage.tsx` | Nav: "Đối soát giao dịch" = dropdown 3 tab con (Chuyển khoản B2 / **mPOS** / **Payoo**); tab "Đồng bộ mPOS/Payoo" ở Dữ liệu. View id: `reconMpos`, `reconPayoo`, `gatewaySync`. Dùng chung quyền `reconciliation`. |

FE đang chạy **dữ liệu mẫu**. Việc của Đức = dựng BE để FE thay mock = API thật (FE tự nối sau khi có endpoint).

---

## 3. KIẾN TRÚC KÉO DATA — EXTENSION (không phải server cron)

mPOS **chỉ cho 1 phiên đăng nhập** (máy 2 login đá máy 1) + không API + không nên lưu mật khẩu. → **Server-side headless login = LOẠI.**

→ **Tiện ích trình duyệt** (fork `crm-token-extension/`) chạy trong máy kế toán, **dùng phiên đăng nhập sẵn** của họ:
- `fetch(export_url, { credentials: 'include' })` → browser tự gắn cookie (kể cả domain `export.mpos.vn`) → lấy file.
- POST file/bytes về backend ingest → parse → upsert.
- Lịch: `chrome.alarms` định kỳ **+ nút "Đồng bộ ngay"**. (Đây là "cron" NẰM TRONG extension, không phải server.)
- Extension **nhét 1 cờ vào trang app** (`window.postMessage` / DOM flag) để app biết "đã cài" → FE đổi nút "Cài tiện ích" ↔ "Đồng bộ ngay".

Luồng: `mPOS/Payoo portal → extension fetch file → POST /ingest → parse → upsert DB → API → FE đối soát`

---

## 4. CODE BE ĐÃ CÓ + ⚠️ CẦN SỬA

### 4.1 `backend/mpos_import.py` (Giang) — đã wire `main.py:1325`
Có sẵn: `parse_mpos_transactions()`, `parse_mpos_settlements()`, contra-entry cho GD "Đảo", `_check_ambiguous_matches()` (>=2 GD trùng tiền+phút → `needs_review`), `COLLECTOR_MAP` (palfish02→HCM, palfish3→HN). Logic tốt, **giữ lại**.

### ⚠️ 4.2 VẤN ĐỀ: parser map theo TÊN CỘT KHÔNG KHỚP file thật
Parser hiện đọc `"Thời gian"`, `"Chi tiết giao dịch"`, `"Trạng thái giao dịch"`, `"Số tiền được nhận"`, `"Mã tham chiếu (Ref No.)"`... — **file export THẬT KHÔNG có mấy cột này**. Phải sửa mapping theo cột thật dưới đây.

**mPOS "Chi tiết phiếu chi" (.xlsx, engine `openpyxl`) — 28 cột, header dòng 0:**
```
Ngày khởi tạo · TG kết toán · Số giao dịch · Số thẻ · Tên chủ thẻ · MID · TID · Nguồn tạo ·
Mã chuẩn chi · Trạng thái giao dịch · Trạng thái Pending · Trạng thái Phiếu chi · Số tiền ·
Loại thẻ · Business name · Phí giao dịch · Số tiền thực nhận · Kỳ hạn · Phí trả góp ·
Phí TG hiện tại · NH Hỗ trợ · Đầu đọc thẻ · TK thanh toán · Mã phiếu chi ·
Số tiền thực nhận(2=tổng phiếu chi) · Ngày nhận tiền · Báo có · Tên cửa hàng
```
- Khóa dedup giao dịch = **`Số giao dịch`** (vd `MPL_MP13531924` / `20260611103699801689`).
- `Mã phiếu chi` (vd `79007437`) = gom nhiều giao dịch.
- `TK thanh toán` = palfish02 (HCM) / palfish3 (HN).
- Trả góp: `Kỳ hạn` + `Phí trả góp` + `NH Hỗ trợ`.

**mPOS "Danh sách phiếu chi" (.xls, engine `xlrd`) — 17 cột, dòng 0 là title, header dòng 1:**
```
Mã phiếu chi · Ngày khởi tạo · ĐVCNT · Email · Trạng thái · Trạng thái Bank Pending ·
Số tiền · Phí giao dịch · Phí trả góp · Phí chuyển tiền · Hoàn/Thu · Số tiền thực nhận ·
Ngân hàng · Chi nhánh · Chủ tài khoản · Số tài khoản · Tên cửa hàng
```
- Khóa dedup phiếu chi = **`Mã phiếu chi`**.

**Payoo CSV (chỉ dùng cho FALLBACK upload tay — auto-fetch dùng JSON, xem 4.4):**

**Payoo "Trực tuyến" (.csv, UTF-8, header dòng 0):**
```
STT · Mã đơn hàng · Mã thanh toán · Mã cửa hàng · Tên cửa hàng · Số tiền · Hình thức thanh toán ·
Hình thức phát hành thẻ · Ngày thanh toán · Số thẻ · Tên chủ thẻ · Nguồn tiền · Trạng thái ·
... · Phí thanh toán · Số tiền sau phí · Mã chuẩn chi · Số tiền gốc · Loại QR
```

**Payoo "Trả góp" (.csv, header dòng 0):**
```
STT · Mã ĐH/GD trả góp · Kênh thanh toán · Mã cửa hàng · Tên cửa hàng · Mã chuẩn chi · Số tiền ·
Số tiền trả góp · Phí dịch vụ thu KH · Phí trả góp · Phí thanh toán thẻ · Số tiền sau phí · Kỳ hạn ·
Số thẻ · Tên chủ thẻ · Loại thẻ · Ngày cập nhật · Mã ĐKTG · Ngân hàng · Ngày tạo giao dịch ·
Mã đơn hàng đối tác · Ghi chú đối tác · Kết quả chuyển đổi trả góp · ...
```
- Khóa dedup Payoo = **`Mã đơn hàng`** / **`Mã ĐH/GD trả góp`** (vd `8971260616094704777` — 19 số, **đọc dạng string**, đừng để pandas parse thành float).
- ⚠️ Cột `Mã đơn hàng đối tác` / `Ghi chú đối tác` đã kiểm: **KHÔNG chứa mã PR** (chỉ lặp mã Payoo / trống) → Payoo ghép TAY như mPOS, không auto.

### 4.3 Pattern tái dùng
- **Ingest token**: theo `crm_routes.py` — header `X-CRM-EXT-TOKEN` + env `CRM_EXTENSION_INGEST_TOKEN` + `_require_extension_ingest_token()`. Làm tương tự cho gateway ingest.
- **RBAC**: `resolve_actor(sb, authorization)` + `require_module_write(sb, actor, "reconciliation")` (như `mpos_import.py` đang dùng).
- **Upsert chống trùng**: `ON CONFLICT (<dedup_key>) DO NOTHING` (như SePay `sepay_id`).

### 4.4 ⭐ PAYOO AUTO-FETCH = JSON (KHÔNG tải CSV) — đã soi DevTools 16/6

Nút "Xuất file" Payoo chỉ dựng CSV **phía client** từ 1 endpoint JSON. → Extension Payoo gọi **thẳng JSON**, KHÔNG cần tải/parse CSV. CSV (mục 4.2) chỉ còn **fallback khi kế toán upload tay**.

**Endpoint data (soi thật):**
```
GET https://portal.payoo.vn/api/ecom/order/
    ?PageNo=0&PageSize=25
    &From=<epoch_giây>&To=<epoch_giây>
    &ShopID=8971&Query=8971&isSearch=1
```
- Auth = cookie phiên Payoo (`credentials:'include'`). `ShopID=8971` = PALFISH.
- `From`/`To` = **epoch GIÂY** (KHÁC mPOS dùng `DD/MM/YYYY`).
- Response: `{ code:1000, message, data:{ OrderList:[...], TotalItem, TotalMoney } }`.
- **Phân trang**: đọc `data.TotalItem` → loop `PageNo` 0,1,2... tới khi `PageNo*PageSize >= TotalItem`.

3 request `/api/setting/table/101/export` (GET đọc + PUT lưu) = **CHỈ cấu hình cột mẫu xuất** (`export_setting[]` + `file:"csv"`), KHÔNG phải data → bỏ qua cho auto-fetch. (`101` = mã báo cáo "Thanh toán trực tuyến".)

**Field map `OrderList[i]` → `gateway_transactions`:**
| JSON | → DB | Ghi chú |
|------|------|---------|
| `OrderNo` `"8971260616094704777"` | `txn_code` (dedup) | **TEXT** 19 số (Payoo trả sẵn string) |
| `OrderID` `926173103` | id nội bộ (optional) | số |
| `MoneyAmount` `17820000` | `amount` | |
| `TransactionFeeEcomer` `376420` | `fee` | |
| `MoneyAmountAfterFee` `17443580` | `net_amount` | = amount − fee ✓ |
| `OriginalAmount` `17820000` | gốc (optional) | = MoneyAmount (online) |
| `PurchaseDate` `"16/06/2026 11:10:14"` | `paid_at` | ⚠️ **CHUỖI `DD/MM/YYYY HH:mm:ss`** — parse, KHÔNG epoch |
| `CardNumber` `"VISA***4763"` | `card_masked` | brand + 4 cuối |
| `PaymentCustomerName` `"ton thi my kieu"` | `cardholder_name` | TÊN ĐẦY ĐỦ (không che) NHƯNG = người quẹt thẻ (có thể là phụ huynh ≠ học viên) + sales đặt tên KH trên app tự do ("c Trang" vs "Trang Huyen Thi Nguyen") → **chỉ hiển thị tham khảo, KHÔNG làm khóa ghép** |
| `BankCardHolderName` `"***KIEU"` | — | che gần hết, bỏ (dùng PaymentCustomerName) |
| `CustomerPhone` `"0903690047"` | `customer_phone` (col mới, optional) | ⚠️ PII đầy đủ — lưu hạn quyền, KHÔNG log raw |
| `BankName` `"VISA"` | `bank` | brand thẻ |
| `CardIssuanceTypeName` `"BankTransaction_CardIssuanceType_1"` | `card_type` | i18n key → map nhãn |
| `PaymentMethod` `"PaymentMethod_2"` | method (optional) | i18n key |
| `BillingCode` `""` | `settlement_code` | mã chuẩn chi (online thường rỗng) |
| `AuthorizationNo` `"293736"` | mã duyệt NH (optional) | |
| `TransactionStatus` `7` / `TransactionStatusName` `"TransactionStatus_5"` | status | i18n key → cần bảng map; lọc GD thành công |
| `InstallmentBankName`/`InstallmentPeriod`/`InstallmentMoneyTotal` | trả góp | rỗng = online; có giá trị = trả góp |
| `Description` `"<div>Hthp</div>"` | ghi chú (optional) | ⚠️ dính HTML → strip tag |

Lưu nguyên record vào `raw jsonb`.

⚠️ **Trả góp**: record mẫu là online (`InstallmentBankName=""`). Khoảng ngày test KHÔNG có GD trả góp → **chưa xác nhận** trả góp lên chung `/api/ecom/order/` (Installment* populated) hay cần param/endpoint khác. Volume trả góp cực thấp (~1 GD từ 7/2025) → ưu tiên thấp, xử lý sau khi Minh có mẫu.

---

## 5. VIỆC CẦN LÀM — THEO THỨ TỰ

### B1. DB — bảng lưu giao dịch gateway
Tạo migration `docs/migrations/`. Đề xuất 2 bảng (KHÔNG tái dùng `bank_transactions` của SePay — shape khác hẳn):

`gateway_transactions`:
- `id uuid pk`
- `source text` ('mpos' | 'payoo'), `category text` ('Quẹt thẻ'|'Trực tuyến'|'Trả góp')
- `txn_code text UNIQUE` ← dedup (Số giao dịch / Mã đơn hàng)
- `settlement_code text` (Mã phiếu chi / Mã chuẩn chi)
- `cardholder_name text`, `card_masked text`, `card_type text`
- `amount numeric`, `fee numeric`, `net_amount numeric`
- `installment_term int null`, `bank text null`, `collector_region text null` (HCM/HN)
- `paid_at timestamptz`
- `match_status text CHECK ('pending'|'matched'|'ignored'|'needs_review')`
- `payment_line_id uuid null FK → payment_lines`
- `matched_by text null`, `matched_at timestamptz null`
- `raw jsonb`, `imported_at timestamptz default now()`
- `parent_txn_id uuid null` (contra-entry cho GD "Đảo")

`gateway_settlements` (mPOS phiếu chi — optional, để hiển thị tổng theo phiếu chi):
- `settlement_code text UNIQUE`, `created_date date`, `gross/fee/net numeric`, `bank/branch/account text`, `raw jsonb`

Nhớ `NOTIFY pgrst, 'reload schema';`.

### B2. Sửa parser (mục 4.2) + thêm parser Payoo CSV
- Sửa `mpos_import.py` map theo cột thật (cả .xlsx detail + .xls list). Chú ý engine: `.xlsx`→openpyxl, `.xls`→xlrd, `.csv`→pandas read_csv `dtype=str` cho mã đơn.
- Payoo: parser CHÍNH = map JSON `OrderList[]` (mục 4.4) → rows. `parse_payoo_csv()` chỉ làm **fallback upload tay** (ưu tiên thấp). Giữ logic contra-entry + ambiguous.

### B3. Endpoint ingest cho extension
`POST /api/v1/gateway-sync/ingest` — auth = ext token (không phải JWT user).
- Body: **mPOS** = multipart `file` (.xlsx/.xls); **Payoo** = JSON `{ orders: OrderList[] }` (extension gọi `/api/ecom/order/` rồi đẩy mảng về). Query `source` ('mpos'|'payoo') + `kind` ('detail'|'settlement'|'online'|'installment').
- Parse → upsert `ON CONFLICT (txn_code) DO NOTHING` → trả `{ inserted, skipped, total }`.
- Ghi `last_sync_at`.

### B4. Extension (fork `crm-token-extension/`)
- `host_permissions`: `mpos.vn/*`, **`export.mpos.vn/*`**, `portal.payoo.vn/*`, + backend URL.
- mPOS export (đã reverse-engineer — **GET**, host `export.mpos.vn`):
  - Danh sách phiếu chi: `/merchant/transfer/transfer-list/exportCSV`
  - Chi tiết phiếu chi: `/merchant/transfer/export-withdraw-transaction`
  - Query: `?formSession=false&` + `$(withdrawSearchForm).serialize()` + `&withdrawGroup=NORMALY`
  - Form fields điều khiển: `start`/`end` (ngày **DD/MM/YYYY**), `withdrawStatus`, `money`, `withdrawNumber`, `isQuick`, `storeName`. Auth = cookie `JSESSIONID`.
- Payoo: **KHÔNG tải file** — gọi thẳng JSON `GET portal.payoo.vn/api/ecom/order/` (xem 4.4), lật trang theo `TotalItem`, POST mảng `OrderList` (JSON) về ingest. Auth = cookie phiên Payoo.
- **Cửa sổ ngày** (mPOS+Payoo giới hạn tìm tối đa **31 ngày**):
  - Định kỳ: cửa sổ trượt **14 ngày** (`start`=nay−14, `end`=nay). Dedup lo chồng lấn.
  - Backfill: chia **theo tháng** (1/4–30/4, 1/5–31/5...), mỗi cửa sổ ≤31 ngày.
- `chrome.alarms` định kỳ + nút Sync now + nhét cờ "đã cài" vào trang app.

### B5. API cho FE (khớp shape mock `mockGatewayTxns.ts`)
| Method | Path | Trả về |
|--------|------|--------|
| GET | `/api/v1/gateway-txns?source=&status=&q=&from=&to=` | `GatewayTxn[]` (xem shape mục 6) |
| GET | `/api/v1/gateway-txns/{id}/match-candidates` | `MatchCandidate[]` — payment_line gợi ý theo **số tiền + ngày gần**, kèm `has_bill` + `bill_images[]` |
| PATCH | `/api/v1/gateway-txns/{id}/match` | body `{ payment_line_id }` → set matched + `matched_by/at` |
| PATCH | `/api/v1/gateway-txns/{id}/status` | body `{ match_status, payment_line_id? }` → unmatch/ignore |
| GET | `/api/v1/gateway-sync/status` | `{ last_sync_at, ext_connected, counts }` |

### B6. RBAC
Dùng chung quyền `reconciliation` (FE đã map `reconMpos`/`reconPayoo`/`gatewaySync` → `reconciliation`). Hoặc thêm key riêng nếu muốn tách quyền.

---

## 6. SHAPE DỮ LIỆU (FE ĐANG MOCK — BE TRẢ ĐÚNG)

Nguồn chuẩn: `frontend/src/components/card-recon/mockGatewayTxns.ts`.

`GatewayTxn`: `id, source('mpos'|'payoo'), category, txn_code, settlement_code, cardholder_name, card_masked, card_type, amount, fee, net_amount, installment_term, bank, collector_region, paid_at, match_status('pending'|'matched'|'ignored'), payment_line_id, matched_label`

`MatchCandidate`: `payment_line_id, pr_id, pr_name, attempt_idx, amount, created_at, uid, has_bill` (+ `bill_images[]` để FE hiện ảnh đối chiếu).

**Ảnh bill** đã có sẵn ở payment_line: type `bill_images?: string[]` + endpoint `payment-lines/{id}/bills/download` (`lib/api.ts:160`). → Match-candidates trả kèm `bill_images` là FE hiện được, **không cần field/bảng mới**.

---

## 7. RÀNG BUỘC / GOTCHAS

- **PII**: file chứa số thẻ (mask), tên chủ thẻ. KHÔNG log raw, KHÔNG commit file mẫu (đã có `.gitignore` cho `backend/backups/`, `*.xls`). Lưu `card_masked` thôi.
- **mPOS 1 phiên** → bắt buộc extension (mục 3), không server login.
- **Mã đơn Payoo 19 số** → đọc string, tránh float làm tròn.
- **Dedup**: `txn_code` UNIQUE + `ON CONFLICT DO NOTHING` → import lại trùng kỳ = no-op.
- **GD "Đảo" (refund)**: tạo contra-entry số tiền âm (parser Giang đã có), không xoá cứng.
- **Payoo ngày = chuỗi** `DD/MM/YYYY HH:mm:ss` (parse tay); `From`/`To` trên URL mới là epoch giây. mPOS ngày = `DD/MM/YYYY`.
- **Ghép = số tiền + ngày + ảnh bill (CHÍNH).** `match-candidates` xếp hạng theo **tiền + ngày**, KHÔNG theo tên. `PaymentCustomerName`/`CustomerPhone` chỉ HIỂN THỊ cho người soát mắt thường — tên KHÔNG tin cậy (sales đặt tên KH tự do; người quẹt có thể là phụ huynh ≠ học viên). `CustomerPhone` = PII → lưu hạn quyền, không log raw.
- **Payoo status / card-type = i18n key** (`TransactionStatus_5`, `BankTransaction_CardIssuanceType_1`) → cần bảng map nhãn; chỉ đối soát giao dịch thành công.

---

## 8. CẦN CHỐT (đang chờ)

1. ✅ **URL Payoo — ĐÃ TÓM** (16/6, mục 4.4): `GET portal.payoo.vn/api/ecom/order/` trả JSON (KHÔNG phải CSV). Còn chờ: xác nhận giao dịch **trả góp** có lên chung feed này không (chưa có mẫu trong khoảng test).
2. **Anh Hiếu duyệt UI** trên sandbox (đang chờ) — có thể đổi cột/luồng → ảnh hưởng nhẹ API.
3. Xác nhận chạy extension trên máy nào (kế toán + chị Thu Hiền).

---

## 9. THAM CHIẾU

- FE preview: `palfish-gmv-manager-sandbox.vercel.app` → "Đối soát giao dịch" → mPOS/Payoo; "Dữ liệu" → "Đồng bộ mPOS/Payoo".
- Parser: `backend/mpos_import.py`. Pattern ingest token: `backend/crm_routes.py`. Pattern RBAC/ingest: `backend/sepay_routes.py`.
- Extension mẫu: `crm-token-extension/` (manifest v3 + background.js + popup).
- mPOS export reverse-engineer: hàm `exportFile(param, urlExport)` → `window.open('https://export.mpos.vn'+urlExport+'?formSession=false&'+param)`.
