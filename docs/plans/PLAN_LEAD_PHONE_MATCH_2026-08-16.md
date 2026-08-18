# PLAN — Lead-phone match: bắt sđt gốc + lý do khi đơn New không khớp lead marketing

**Ngày**: 2026-08-16 · **Status**: CHỜ DUYỆT (chưa code)
**Nguồn yêu cầu**: anh Hiếu (Marketing) — tài liệu `TaiLieu_KyThuat_ChiTiet.md` 15/08/2026. 175 đơn New (~8,2%, ~300tr/tháng) không quy được về kênh quảng cáo vì sđt thanh toán ≠ sđt lead.
**Executor dự kiến**: Sonnet 4.6 — plan này đủ chi tiết để code không cần điều tra lại.

---

## 0. Thuật ngữ (theo spec anh Hiếu — KHÔNG đổi tên)

| Tên | Nghĩa |
|---|---|
| `sdt` | Số khách dùng **lúc thanh toán tạo gói** — sale gõ khi tạo PR (cột `phone` của PR) |
| `sdt_goc` | Số khách để lại **lúc đầu làm lead marketing**. NULL nếu trùng `sdt` |
| Đơn New | `leadSource` ∈ nhóm New (xem §2.3). Referral/Renewal/Kho chung KHÔNG cần check |
| `leads_lookup` | Bảng mới trên Supabase, bản sao rút gọn của `crm_leads.leads_all` (BQ anh Hiếu), sync 1 chiều BQ→Supabase |

## 1. Mục tiêu

1. Khi sale nhập/sửa PR nhóm New: app tra sđt trong kho lead marketing (onBlur). Không thấy → cảnh báo, bắt sale **phản hồi** (nhập `sdt_goc` HOẶC chọn lý do) — không bắt buộc nhập số (nguyên tắc E7: không chặn thao tác).
2. Metadata (6 trường) lưu ở `payment_requests`, chảy xuống `so_doanh_thu` khi B3 kích hoạt, lên BigQuery qua pipeline sync → anh Hiếu sửa view `gmv_new` dùng `sdt_goc` để ghép.
3. Phân biệt được 2 loại "không ghép": lỗi dữ liệu (khách đổi số) vs đơn thật sự không từ quảng cáo.

**KHÔNG thuộc scope plan này**: backfill 175 đơn cũ (Phase 4 — plan riêng sau), ghép lead cho GDB/kho chung, sửa view `gmv_new` (việc anh Hiếu).

## 2. Ground truth (điều tra 16/8 — KHÔNG cần điều tra lại)

### 2.1 Frontend

| Điểm | File:line |
|---|---|
| FormState phone/country | `frontend/src/components/payment-request/CreatePaymentRequestModal.tsx:19-20`, INITIAL `:44-45` |
| handleSubmit build payload | `CreatePaymentRequestModal.tsx:125-160` |
| Phone input + onBlur (normalizeLocalPhone) | `CreatePaymentRequestModal.tsx:213-230`, onBlur `:221-224` |
| leadSource select | `CreatePaymentRequestModal.tsx:277-309` |
| LEAD_SOURCES | `frontend/src/constants/leadSource.ts:12-75`; keys: `quang_cao`(12 kênh), `gioi_thieu`, `offline`(4), `koc`, `gia_han`, `kho_chung`, `khac`(4); `sourceHasChannels:83-86` |
| API client | `frontend/src/lib/api.ts` — axios instance `:48-51`, auth interceptor `:53-58`, `endpoints.paymentRequests.create:132-133` (POST `/api/v1/payment-requests`), `update:134-135` |
| Drawer DraftPr | `frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx:628-648`, state `:1625`, init draft `:1718-1740` |
| Drawer save (onUpdatePr) | `PaymentRequestDetailDrawer.tsx:1958-1991` (call `:1967`) |
| Drawer phone edit + onBlur | `PaymentRequestDetailDrawer.tsx:2175-2201`, onBlur `:2188-2191` |
| phoneUtils | `phoneUtils.ts` — `smartParsePhonePaste:6`, `normalizeLocalPhone:21`, `crmPhoneFormat:32` (→`"84-352334789"`), `formatPhoneIntl:43`, `applySmartPhoneInput:56` |
| Types | `frontend/src/types/paymentRequest.ts:103-104` (phone/country), `:111-112` (leadSource/leadChannel); `CreatePaymentRequestPayload:247-257` |
| Mapper snake→camel | `frontend/src/components/payment-request/paymentRequestUtils.ts:172` `fromApiPaymentRequest`, phone `:185-186`, leadSource `:195-196`; caller `PaymentFlowContext.tsx:169` |

### 2.2 Backend

| Điểm | File:line |
|---|---|
| `PaymentRequestCreate` / `Patch` models | `backend/payment_request_routes.py:113-139` / `:147-171` |
| `_payment_request_insert_row` | `payment_request_routes.py:1050` — ghi: name, uid, phone, country, address, ward, province, note, email, tax_id, target, child_name, extra_children, customer_type, company_name, lead_source, lead_channel, wants_invoice |
| POST handler | `payment_request_routes.py:2380`, insert `:2396` |
| PATCH handler | `payment_request_routes.py:1936`, `_payment_request_patch_row:1113`, update `:1964-1967` |
| RBAC | `backend/rbac.py` — `resolve_actor:120`, `require_min_role:49`, `ROLE_RANK:14` (sale=1, ops/leader=2, manager=3, system=4). Pattern: inline trong handler, `authorization: str | None = Header(None)` |
| Route registration | `register_payment_request_routes(app, _get_supabase)` `:1808`; gọi từ `backend/main.py:1355` (12 routers `:1353-1364`); Supabase singleton `main.py:270` |
| `resolve_loai_from_lead_source` | `backend/utils/lead_source_map.py:125`; `_SOURCE_TO_LOAI:105-113`: quang_cao→广告, gioi_thieu→转介绍, gia_han→续费, kho_chung→公海, offline→Offline, koc→KOC, khac→Other; exception 300431→Lives `:136-137` |
| sync_ledger payload | `backend/revenue_routes.py:1205-1228`; dedup crm_order_id `:1238-1261` (update_payload `:1251-1259`); loose match `:1263-1289`; fresh insert `:1291` |

### 2.3 Nhóm New — nguồn nào trigger check

Đối chiếu `_SOURCE_TO_LOAI` với bảng phân loại A3 doc anh Hiếu (New = 广告/Offline/Lives/Booth/Other/Livestream/KOC/PNS/FB/KET/Tiktok shop/Tải App):

```
NEW_CHECK_SOURCES = { "quang_cao", "offline", "koc", "khac" }   ← trigger lead check
KHÔNG check: gioi_thieu (Referral), gia_han (Renewal), kho_chung (GDB — chốt với Minh 16/8: chưa làm)
```

### 2.4 Ràng buộc từ plan Fivetran→bq-sync (`docs/plans/PLAN_MIGRATE_FIVETRAN_TO_BQSYNC_2026-08-16.md`, đã duyệt 16/8)

- Pipeline mới `bq-sync/` dùng **explicit SCHEMAS** (không autodetect) → **6 cột mới của `so_doanh_thu` PHẢI thêm vào `SCHEMAS["so_doanh_thu"]`** trong `bq-sync/main.py`, không thì cột không lên BQ (silent drop).
- Nếu cutover chưa xảy ra khi deploy plan này: Fivetran `QUERY_BASED` tự nhận cột mới — không cần làm gì. Checklist Phase 3 dưới có mục điều phối 2 plan.
- Infra Cloud Function + Scheduler của bq-sync **tái dụng** cho job sync leads (BQ→Supabase, chiều ngược): cùng repo `bq-sync/`, thêm entrypoint thứ 2 + 1 Scheduler job (còn trong 3 job free).

### 2.5 Business rules module (từ `payment-request/CLAUDE.md`)

- `sync_ledger_from_ar_course` là **insert-once** theo `crm_order_id` — dòng `loai_nhap` ∈ (tay, hoan) match được thì CHỈ trả id, không update. Không phá điều này.
- `sale_email` là cột sở hữu duy nhất; không đụng.

## 3. Thiết kế dữ liệu

### 3.1 Migration `backend/migrations/2026-08-XX-lead-phone-match.sql`

```sql
-- 1) 6 cột metadata trên payment_requests (nguồn nhập)
ALTER TABLE public.payment_requests
  ADD COLUMN IF NOT EXISTS sdt_goc           TEXT,          -- số lead, NULL nếu trùng phone
  ADD COLUMN IF NOT EXISTS lead_matched      BOOLEAN,       -- NULL = chưa check; true/false = kết quả lúc lưu
  ADD COLUMN IF NOT EXISTS lead_id           TEXT,          -- id lead đã ghép (leads_lookup.lead_id)
  ADD COLUMN IF NOT EXISTS lead_matched_by   TEXT,          -- 'sdt' | 'sdt_goc' | 'uid' | 'manual'
  ADD COLUMN IF NOT EXISTS ly_do_khong_ghep  TEXT,          -- enum §3.3
  ADD COLUMN IF NOT EXISTS lead_check_at     TIMESTAMPTZ;   -- thời điểm check gần nhất

-- 2) 6 cột y hệt trên so_doanh_thu (đích, chảy lên BQ)
ALTER TABLE public.so_doanh_thu
  ADD COLUMN IF NOT EXISTS sdt_goc           TEXT,
  ADD COLUMN IF NOT EXISTS lead_matched      BOOLEAN,
  ADD COLUMN IF NOT EXISTS lead_id           TEXT,
  ADD COLUMN IF NOT EXISTS lead_matched_by   TEXT,
  ADD COLUMN IF NOT EXISTS ly_do_khong_ghep  TEXT,
  ADD COLUMN IF NOT EXISTS lead_check_at     TIMESTAMPTZ;

-- 3) Bảng leads_lookup — bản sao rút gọn leads_all, full-reload mỗi lần sync
CREATE TABLE IF NOT EXISTS public.leads_lookup (
  lead_id    TEXT PRIMARY KEY,   -- md5(phone || '|' || date_leads_appeared || '|' || ec) — khoá TỰ NHIÊN ổn định qua các lần full-reload (KHÔNG dùng GENERATE_UUID: đổi mỗi lần sync → payment_requests.lead_id thành mồ côi)
  phone_key  TEXT NOT NULL,      -- RIGHT(digits, 9)
  phone      TEXT,               -- số gốc để hiển thị
  name       TEXT,
  uid        TEXT,
  lead_date  DATE,
  crm_code   TEXT,               -- CRM_code_2 đã lọc rác
  ads_nation TEXT,
  ec         TEXT,               -- mã sale phụ trách lead
  status     TEXT,               -- L1..L8
  synced_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_leads_lookup_phone_key ON public.leads_lookup (phone_key);
CREATE INDEX IF NOT EXISTS idx_leads_lookup_uid       ON public.leads_lookup (uid) WHERE uid IS NOT NULL AND uid <> '';

-- 4) RLS: bật, KHÔNG tạo policy → chỉ service-role đọc/ghi (BE + job sync). FE không bao giờ query trực tiếp.
ALTER TABLE public.leads_lookup ENABLE ROW LEVEL SECURITY;
```

Chạy sandbox trước, prod sau (quy trình `database-migration` skill).

### 3.2 Ngữ nghĩa 6 trường (thứ tự ưu tiên ghi)

| Trường hợp lúc lưu PR | `lead_matched` | `lead_matched_by` | `lead_id` | `sdt_goc` | `ly_do_khong_ghep` |
|---|---|---|---|---|---|
| `sdt` khớp lead | true | `sdt` | id lead chọn | NULL | NULL |
| `sdt` không khớp, sale nhập số lead → khớp | true | `sdt_goc` | id lead chọn | số sale nhập | NULL |
| Khớp qua UID (lookup phụ) | true | `uid` | id lead | NULL | NULL |
| Không khớp, sale chọn lý do | false | NULL | NULL | số sale nhập (nếu có, dù không khớp) | enum |
| Không phải nhóm New / phone trống / API lỗi | NULL | NULL | NULL | NULL | NULL |

`lead_check_at`: BE gán `now()` server-side mỗi khi payload có nhóm trường lead (không tin giờ client).

### 3.3 Enum `ly_do_khong_ghep` (khớp doc E4, FE + BE dùng chung list)

```
khach_tu_tim_den | nguoi_quen_gioi_thieu | khach_cu_quay_lai | so_khac_khong_nho | khac
```
Nhãn tiếng Việt: Khách tự tìm đến, không qua quảng cáo · Người quen giới thiệu · Khách cũ mua lại · Khách dùng số khác nhưng không nhớ · Khác (ghi chú vào ô note PR).

## 4. Backend

### 4.1 API lookup — file MỚI `backend/leads_routes.py`

```
GET /api/v1/leads/lookup?phone=<bất kỳ định dạng>&order_date=<YYYY-MM-DD, optional>&uid=<optional>
```

- RBAC: `resolve_actor` + `require_min_role(actor, "sale")` — mọi staff đăng nhập gọi được (đọc-only, không lộ gì ngoài lead của công ty).
- Logic (theo doc E5):
  1. `phone_key = RIGHT(regexp_replace(phone,'\D',''), 9)`; nếu < 9 số → trả `{"matched": false, "count": 0, "leads": []}` luôn.
  2. Query `leads_lookup WHERE phone_key = :pk AND (lead_date IS NULL OR lead_date <= :order_date)` — `order_date` default hôm nay.
  3. Nếu bước 2 rỗng và có `uid` → thử `WHERE uid = :uid` (matched_by `uid`).
  4. Sort `lead_date DESC NULLS LAST`, limit 10.
- Response:

```json
{ "matched": true, "count": 2, "matched_by": "sdt",
  "leads": [ { "lead_id": "...", "name": "...", "phone": "0912...", "lead_date": "2026-07-15",
               "crm_code": "300281", "ads_nation": "Nhật Bản", "ec": "EC001", "status": "L4" } ] }
```

- Đăng ký: `register_leads_routes(app, _get_supabase)` theo pattern `payment_request_routes.py:1808`; thêm dòng gọi vào `backend/main.py` cạnh `:1355`.
- Không cache, không rate-limit (bảng ~70k dòng, index phone_key → <5ms).
- KHÔNG áp ràng buộc `ec = sale hiện tại` (nguyên nhân #3 doc D5 — ràng buộc ec quá chặt là lý do mất match; app không lặp lại sai lầm đó).

### 4.2 Nhận field mới ở PR routes (`backend/payment_request_routes.py`)

1. `PaymentRequestCreate` (`:113`) + `PaymentRequestPatch` (`:147`) thêm:
   ```python
   sdt_goc: str | None = None
   lead_matched: bool | None = None
   lead_id: str | None = None
   lead_matched_by: str | None = None   # validate ∈ {sdt, sdt_goc, uid, manual} hoặc None
   ly_do_khong_ghep: str | None = None  # validate ∈ enum §3.3 hoặc None
   ```
2. `_payment_request_insert_row` (`:1050`): copy 5 field vào row; nếu bất kỳ field lead nào non-null → `row["lead_check_at"] = datetime.now(timezone.utc).isoformat()`.
3. `_payment_request_patch_row` (`:1113`): tương tự — patch semantics: field gửi lên thì ghi đè, không gửi thì giữ. FE khi re-check phải gửi **đủ nhóm** (5 field) để tránh state lai (VD matched=true nhưng ly_do còn sót từ lần trước → FE gửi `ly_do_khong_ghep: null` tường minh).
4. Validate nhẹ (không chặn cứng): giá trị ngoài enum → 422.

### 4.3 Propagate xuống `so_doanh_thu` (`backend/revenue_routes.py`)

1. Payload dict (`:1205-1228`) thêm 6 key, đọc từ `pr` row:
   ```python
   "sdt_goc": (pr or {}).get("sdt_goc"),
   "lead_matched": (pr or {}).get("lead_matched"),
   "lead_id": (pr or {}).get("lead_id"),
   "lead_matched_by": (pr or {}).get("lead_matched_by"),
   "ly_do_khong_ghep": (pr or {}).get("ly_do_khong_ghep"),
   "lead_check_at": (pr or {}).get("lead_check_at"),
   ```
2. Nhánh update `loai_nhap="tu_dong"` (`update_payload :1251-1259`): thêm 6 key y hệt (re-sync sau khi sale bổ sung sdt_goc ở PR → dòng sổ tự cập nhật).
3. Nhánh `loai_nhap ∈ (tay, hoan)` (`:1249-1250`): GIỮ NGUYÊN return-only — không retro-update (rule CLAUDE.md).

### 4.4 Job sync leads BQ→Supabase (trong repo `bq-sync/`, sau khi plan Fivetran Phase 1 dựng khung)

- Entrypoint thứ 2 `sync_leads` cùng `main.py` (hoặc file riêng `leads.py`): 
  1. Query BQ (job chạy ở project `pf-salary`, đọc `daily-report-smai-to-openclaw.crm_leads.leads_all` — cần SA được cấp **BigQuery Data Viewer trên dataset `crm_leads`**, xem §7):
     ```sql
     SELECT TO_HEX(MD5(CONCAT(IFNULL(phone,''),'|',IFNULL(date_leads_appeared,''),'|',IFNULL(ec,'')))) AS lead_id,
            RIGHT(REGEXP_REPLACE(phone, r'[^0-9]',''), 9) AS phone_key,
            phone, name, uid,
            SAFE.PARSE_DATE('%Y-%m-%d', date_leads_appeared) AS lead_date,
            CRM_code_2 AS crm_code, ads_nation, ec, status
     FROM `daily-report-smai-to-openclaw.crm_leads.leads_all`
     WHERE CRM_code_2 IS NOT NULL
       AND CRM_code_2 NOT IN ('#N/A','#REF!','Mã CRM')
       AND LENGTH(REGEXP_REPLACE(phone, r'[^0-9]','')) >= 9
     ```
     (SQL gốc của anh Hiếu, thay `GENERATE_UUID()` bằng MD5 tự nhiên — lý do ở §3.1. Trùng khoá MD5 → dedup giữ dòng đầu.)
  2. Ghi Supabase qua psycopg2, full-reload atomic: `BEGIN; TRUNCATE leads_lookup; INSERT (batch 5k, execute_values); COMMIT;` (~70k dòng, vài MB, <30s).
  3. DSN Supabase ghi-được-1-bảng: tạo role Postgres `leads_sync` chỉ GRANT `TRUNCATE, INSERT, SELECT ON leads_lookup` — lưu Secret Manager, KHÔNG dùng service_role key.
- Scheduler job thứ 2: cron `0 * * * *` (1h/lần theo khuyến nghị doc E6). Job 2/3 free tier.
- **Interim khi chưa có job** (test Phase 2-3): anh Minh chạy tay SQL trên BQ console (quyền cá nhân đã xin) → export CSV → import vào `leads_lookup` qua Supabase dashboard. Đủ cho sandbox test.

## 5. Frontend

### 5.1 Shared: hook mới `frontend/src/components/payment-request/useLeadCheck.ts`

Gom logic dùng chung cho Create modal + Detail drawer:

```ts
type LeadCheckStatus = "idle" | "skipped" | "loading" | "matched" | "none" | "error";
interface LeadHit { leadId: string; name: string; phone: string; leadDate: string | null;
                    crmCode: string; adsNation: string; ec: string; status: string; }
interface LeadCheckState {
  status: LeadCheckStatus;
  matchedBy: "sdt" | "sdt_goc" | "uid" | null;
  leads: LeadHit[];              // ≤10, sale chọn khi >1 (mặc định chọn leads[0])
  selectedLeadId: string | null;
  sdtGoc: string;                // ô nhập số lead
  reason: string;                // enum §3.3 hoặc ""
  checkedPhone: string;          // phone đã check lần cuối (chống re-check thừa)
}
```

- `runCheck(phoneIntl, uid?)`: gọi `endpoints.leads.lookup` (thêm vào `api.ts`: `GET /api/v1/leads/lookup`). Debounce không cần (onBlur). `phoneIntl` = `crmPhoneFormat(form.phone, country)` — gửi dạng đầy đủ `"84-3523..."`, BE tự chuẩn hoá.
- API lỗi/timeout → `status = "error"` → **fail-open**: không hiện cảnh báo, không chặn lưu, log console.warn. (Không để network hỏng chặn nghiệp vụ.)
- `runCheckSdtGoc(sdtGocRaw)`: khi sale nhập số gốc rồi blur → lookup lại bằng số đó; khớp → `matchedBy="sdt_goc"`, hiện xanh.
- Trigger conditions: `NEW_CHECK_SOURCES.has(leadSource)` && phone ≥ 9 số. Đổi leadSource từ non-New → New: re-run. Đổi từ New → non-New: reset state về `skipped`, các field lead gửi null.
- Export `buildLeadPayload(state): {sdt_goc, lead_matched, lead_id, lead_matched_by, ly_do_khong_ghep}` — luôn trả **đủ 5 key** (null tường minh) theo rule §4.2.3.
- Const mới `frontend/src/constants/leadSource.ts`: `export const NEW_CHECK_SOURCES = new Set(["quang_cao","offline","koc","khac"])` + `export const LY_DO_KHONG_GHEP = [...]` (value+label, §3.3).

### 5.2 CreatePaymentRequestModal.tsx

1. Thêm `useLeadCheck` instance; wire vào onBlur phone hiện có (`:221-224` — sau normalizeLocalPhone, gọi `runCheck`).
2. UI block đặt **ngay dưới hàng phone input** (`:213-230`):
   - `loading`: spinner nhỏ "Đang tra lead…"
   - `matched`: badge xanh `✓ Khớp lead: {name} · {leadDate} · kênh {crmCode}`. Nếu `leads.length > 1`: list radio ≤10 dòng cho sale chọn (mặc định dòng đầu — lead_date gần nhất).
   - `none`: box vàng (UI visibility principle — warning box nổi bật, KHÔNG text mờ):
     > ⚠ Không tìm thấy số này trong dữ liệu marketing. Khách có dùng số khác khi đăng ký không?
     - Ô nhập "SĐT khách dùng lúc đăng ký (nếu khác)" → onBlur `runCheckSdtGoc`; khớp → đổi badge xanh `✓ Khớp qua số gốc: {name}…`
     - Select "Hoặc chọn lý do" — 5 options §3.3
   - `error`/`skipped`/`idle`: không render gì.
3. **Submit gate** (trong `handleSubmit :125-160`, trước `onSubmit`): nếu `status === "none"` && `sdtGoc` trống && `reason` trống → `setError("Chọn lý do hoặc nhập SĐT gốc trước khi lưu")`, return. Mọi trạng thái khác (kể cả `error`) → cho lưu.
   - Chú ý: sdtGoc **có nội dung nhưng không khớp** vẫn cho lưu (lead_matched=false, sdt_goc giữ giá trị, reason optional) — đúng E7: bắt phản hồi, không bắt kết quả.
4. Payload: spread `...buildLeadPayload(state)` vào object `onSubmit` (`:125-160`); types thêm vào `CreatePaymentRequestPayload` (`paymentRequest.ts:247-257`): 5 field snake_case optional.

### 5.3 PaymentRequestDetailDrawer.tsx

1. **View mode** — section "Thông tin khách hàng (B1)": thêm 2 hàng hiển thị (theo ý anh Minh — nằm trong mục thông tin có nút Sửa):
   - "SĐT lead": `sdt_goc ?? "— (trùng SĐT thanh toán)"` + badge trạng thái: xanh `Đã khớp lead` (lead_matched=true) / vàng `Chưa khớp — {label lý do}` (false) / xám `Chưa kiểm tra` (null)
   - Chỉ render block này khi `NEW_CHECK_SOURCES.has(pr.leadSource)`.
2. **Edit mode**: thêm vào `DraftPr` (`:628-648`): `sdtGoc, leadMatched, leadId, leadMatchedBy, lyDoKhongGhep`; init từ `request` trong `handleOpenEditForTarget` (`:1718-1740`). Render cùng UI block §5.2.2 dưới phone edit input (`:2175-2201`), tái dụng `useLeadCheck` (seed state từ draft). Đổi phone/sdt_goc trong edit → re-check.
3. Save handler (`:1958-1991`): spread lead fields vào `onUpdatePr({...})`; gate giống §5.2.3.
4. Mapper `fromApiPaymentRequest` (`paymentRequestUtils.ts:172`): map 6 field snake→camel; `PaymentRequest` type (`paymentRequest.ts`) thêm `sdtGoc?, leadMatched?, leadId?, leadMatchedBy?, lyDoKhongGhep?, leadCheckAt?`.

### 5.4 Edge cases phải xử lý

| Case | Hành vi |
|---|---|
| Phone trống / <9 số khi blur | Không check, state `idle` |
| leadSource chưa chọn lúc blur phone | Không check; khi chọn leadSource ∈ New sau đó → run check với phone hiện tại |
| Sale sửa phone sau khi đã matched | `checkedPhone` khác → re-check, reset sdtGoc/reason |
| API lỗi / leads_lookup rỗng (chưa sync) | `error` → fail-open, lưu bình thường, field lead = null |
| PR non-New đổi thành New qua PATCH | Drawer edit re-check theo trigger conditions |
| Multi-match (vợ/chồng chung số) | Radio list, sale chọn; mặc định lead_date gần nhất |
| Khách OV số nước ngoài | Chuẩn hoá 9 số cuối như VN — hạn chế đã biết (doc D2), chấp nhận |

## 6. Tests

### 6.1 Backend (`backend/tests/`)

- `test_leads_lookup.py` (MỚI): chuẩn hoá phone (các format `+84 912…`, `0912…`, `84-912…`, `81-70…` → 9 số); filter `lead_date <= order_date`; NULL lead_date vẫn trả; uid fallback khi phone miss; sort desc + limit 10; phone <9 số → matched=false; RBAC 401 khi thiếu token.
- `test_pr_lead_fields.py` (MỚI): POST PR với 5 field lead → row có đủ + `lead_check_at` server-set; PATCH gửi đủ nhóm null → clear; giá trị ngoài enum → 422.
- Mở rộng test sync_ledger hiện có (cạnh `test_ar_lead_source_passthrough.py`): PR có lead fields → payload insert `so_doanh_thu` chứa 6 field; nhánh update tu_dong cập nhật 6 field; nhánh tay/hoan không đụng.

### 6.2 Frontend (Vitest)

- `useLeadCheck.test.ts` (MỚI): matched/none/error states; fail-open khi API reject; buildLeadPayload trả đủ 5 key null tường minh; re-check khi phone đổi; runCheckSdtGoc đổi matchedBy.
- `CreatePaymentRequestModal` test bổ sung: submit gate chặn khi none+trống cả 2; cho qua khi có reason; cho qua khi status=error.
- `npx tsc -b` phải pass (KHÔNG `--noEmit` — rule repo).

## 7. Phases + dependency

```
Phase 1 (code app — làm ngay, không chờ ai)
  1.1 Migration §3.1 → sandbox
  1.2 BE: models + insert/patch row (§4.2)
  1.3 BE: leads_routes.py + đăng ký main.py (§4.1)
  1.4 BE: propagate sync_ledger (§4.3)
  1.5 FE: useLeadCheck + constants (§5.1)
  1.6 FE: Create modal (§5.2)
  1.7 FE: Detail drawer (§5.3)
  1.8 Tests §6 + tsc -b
Phase 2 (test sandbox)
  2.1 Seed leads_lookup sandbox: anh Minh export tay từ BQ (SQL §4.4.1, quyền cá nhân) → CSV → import
  2.2 E2E tay: tạo PR quang_cao với số có/không trong lookup → verify 6 field ở payment_requests + so_doanh_thu sau kích hoạt
Phase 3 (prod + điều phối)
  3.1 Migration prod + deploy BE/FE (squash-merge main theo workflow sandbox-disposable)
  3.2 Job sync leads trong bq-sync/ (§4.4) — SAU khi plan Fivetran Phase 1 xong khung; cần anh Hiếu cấp SA quyền Data Viewer dataset crm_leads
  3.3 Nếu bq-sync đã cutover: thêm 6 cột vào SCHEMAS["so_doanh_thu"] (§2.4) — nếu chưa: Fivetran tự nhận
  3.4 Báo anh Hiếu: cột đã chảy lên BQ → anh Hiếu sửa view gmv_new dùng sdt_goc (việc của anh Hiếu, ngoài scope)
Phase 4 (sau, plan riêng)
  4.1 Backfill 175 đơn New cũ: batch cross-check so_doanh_thu × leads_lookup → màn hình bổ sung cho sale/kế toán
```

**Chặn ngoài**: (a) anh Hiếu approve quyền BQ cá nhân anh Minh (đã gửi request 16/8 — cần cho Phase 2.1); (b) anh Hiếu cấp SA `gmv-bq-sync@pf-salary` Data Viewer trên `crm_leads` (cần cho Phase 3.2).

## 8. Rollback

- FE/BE: revert commit — field mới đều nullable, không breaking.
- Migration: cột mới nullable, không cần drop khi rollback code (vô hại nằm im).
- `leads_lookup`: bảng độc lập, drop được bất kỳ lúc nào không ảnh hưởng gì khác.
- Fail-open design: leads_lookup rỗng/cũ → app chạy như trước khi có tính năng (không cảnh báo), zero rủi ro nghiệp vụ.

## 9. Quyết định thiết kế đã chốt trong plan (executor không cần hỏi lại)

1. Tên cột theo spec anh Hiếu nguyên văn (`sdt_goc`, `ly_do_khong_ghep`…) — chốt với Minh 16/8.
2. API route BE (không cho FE query Supabase trực tiếp) — chốt với Minh 16/8.
3. `lead_id` = MD5 tự nhiên, không GENERATE_UUID (ổn định qua full-reload).
4. Fail-open mọi lỗi hạ tầng; chỉ gate duy nhất: none + trống cả sdt_goc lẫn reason.
5. Không ràng buộc `ec` trong lookup (tránh lặp sai lầm doc D5 #3).
6. GDB/kho_chung không check (chốt với Minh 16/8).
7. Job sync đặt trong `bq-sync/` tái dụng infra plan Fivetran (SA no-key, $0).

## 10. Câu hỏi mở — ĐÃ CHỐT 16/8

- **Sync leads 1h/lần**: ✅ OK — cron `0 * * * *`, $0.
- **`khac` có check không**: ✅ CÓ — doc A3 anh Hiếu xếp `Other` vào New "Cần ghép nguồn? Có — ưu tiên cao nhất", không ngoại lệ.
- **Backfill Phase 4**: để sau, plan riêng khi rõ hơn nhu cầu.
