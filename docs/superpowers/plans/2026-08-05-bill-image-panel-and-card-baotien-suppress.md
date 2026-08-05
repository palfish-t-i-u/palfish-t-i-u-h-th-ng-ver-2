# Plan: (A) Hiện ảnh bill ở panel ghép thẻ + (B) Suppress báo tiền thẻ về trước lần TT — 2026-08-05

> **Cho agent thực thi:** 2 Part ĐỘC LẬP (A = FE-only, B = DB-only). Có thể giao 2 agent Sonnet riêng, làm song song hoặc tuần tự — không phụ thuộc nhau. Mỗi Task viết đủ để thực thi kể cả sau context compact: bám đúng path/line/code/SQL nguyên văn dưới đây, đừng đi quét lại codebase.

---

## 5 tiêu chuẩn thiết kế (mọi task phải pass — khung đánh giá của anh Minh)

1. **Triệt để** — sửa tận root cause.
2. **Không lỗi con** — không đẻ bug thứ cấp; fail-mode của chính fix phải xử lý.
3. **Không tăng gánh nặng hạ tầng** — không thêm infra/chi phí (Vercel/Render/Supabase free).
4. **Tối ưu token** — ít task/commit, tái dùng pattern có sẵn, không refactor ngoài scope.
5. **Bền vững qua context compact** — mỗi task self-contained cho 1 agent Sonnet thực thi độc lập kể cả khi mất hội thoại trước (nhúng nguyên văn path+line+code+SQL+expected). Ngoại lệ: task quá phức tạp cần giữ context sống mới được vượt — không task nào ở plan này thuộc diện đó.

**Đánh giá plan theo 5 tiêu chí:** xem mục "Đối chiếu 5 tiêu chuẩn" cuối mỗi Part.

---

## Bối cảnh — 2 vấn đề phát hiện khi điều tra ngày 05/08/2026

**VĐ1 (FE):** Màn "Đối soát giao dịch · Quẹt thẻ" → mở 1 giao dịch mPOS/Payoo chưa ghép → panel bên phải **"ẢNH BILL LẦN THANH TOÁN"** không hiện ảnh thật, chỉ vẽ 1 thẻ chữ "Biên lai · PR-xxxx". Backend ĐÃ trả `bill_images: string[]` cho mỗi candidate rồi, nhưng FE không render.
- Root cause: `CardReconciliationTab.tsx` nhánh `has_bill === true` chỉ dựng card text, không có `<img>`. Type `MatchCandidate` cũng thiếu field `bill_images` nên dữ liệu bị bỏ.
- Tab CK anh em (`ReconciliationTab.tsx`) đã render đúng — copy pattern đó.

**VĐ2 (DB):** Đơn **Thẻ/trả góp** luôn bắn tin Zalo "💰 ĐÃ VÀO TK" kể cả khi tiền quẹt về TRƯỚC lúc sale tạo lần TT (booking hồi tố). Bằng chứng: PR-2026-0906 quẹt 04/08 01:18, lần TT tạo 05/08 14:10 → vẫn gửi tin (outbox #935).
- Root cause: migration `2026-07-20-allow-baotien-card-installment.sql` MIỄN suppress cho `method IN ('card','installment')`. Trigger đang live (`fn_payment_paid_zalo_notify`, bản 2026-07-28) vẫn giữ miễn trừ này.
- Rule PM chốt 05/08: **tiền về trước `created_at` của lần TT → KHÔNG báo, bất kể CK/thẻ/trả góp.** Cột "Thời gian" trên phiếu GD chính là `gateway_transactions.paid_at` = `v_pay_time` trigger dùng.
- Đã verify prod an toàn (xem Task B0 để tái kiểm): mPOS/Payoo `paid_at` có **giây thật** (không làm tròn phút như SePay) → không false-suppress; 0/45 line thẻ nằm trong vùng nguy hiểm [created_at, +60s); 17 line "trước" đều cách 4h–10 ngày = hồi tố thật.

---

# PART A — FE: Panel ghép thẻ hiện ảnh bill thật

**Loại:** Frontend-only. Không đụng backend, DB, không migration, không deploy thủ công (Vercel auto-build khi push — nhưng Part này KHÔNG commit/push, chỉ sửa + verify local; commit gộp ở Task cuối nếu anh Minh duyệt).

**Files đụng đúng 2 file:**
- `frontend/src/components/card-recon/mockGatewayTxns.ts` (type `MatchCandidate`)
- `frontend/src/components/CardReconciliationTab.tsx` (render panel bill)

### ⛔ Guardrails A
1. **Chỉ sửa đúng 2 file trên.** Không tạo file mới, không refactor component khác.
2. **Backend KHÔNG đổi** — endpoint `/gateway-txns/{id}/match-candidates` đã trả `bill_images` (`backend/gateway_routes.py:519`). Không cần verify BE.
3. **Không thêm thư viện** (không lightbox lib) — chỉ `<img>` + `window.open`, y hệt tab CK.
4. **Không đổi 2 nhánh còn lại** của panel (placeholder "chọn 1 lần TT" và cảnh báo "chưa có ảnh bill"). Chỉ đổi nhánh `has_bill === true`.
5. **Gate bắt buộc trước khi coi là xong:** `cd frontend && npx tsc -b` PASS **và** `npm run build` PASS (Vercel chạy `tsc -b && vite build`).

### Task A0: Check learnings (bắt buộc, ~30s)
```bash
grep -rl "CardReconciliation\|bill_images\|match-candidates" docs/learnings/
```
Nếu có hit → đọc trước. (Learning Law trong CLAUDE.md.)

### Task A1: Thêm field `bill_images` vào type `MatchCandidate`

File `frontend/src/components/card-recon/mockGatewayTxns.ts`, trong `interface MatchCandidate` (khoảng dòng 56–72), ngay **sau** dòng:
```ts
  /** Lần thanh toán này đã có ảnh bill sales upload chưa (để kế toán đối chiếu) */
  has_bill: boolean;
```
Thêm:
```ts
  /** URL ảnh bill của lần TT — BE match-candidates trả kèm để hiện trực tiếp ở panel ghép (gateway_routes.py:519). */
  bill_images?: string[];
```

### Task A2: Render ảnh thật thay cho card chữ

File `frontend/src/components/CardReconciliationTab.tsx`. Trong IIFE của panel "Ảnh bill lần thanh toán" (khoảng dòng 1099–1113), nhánh cuối (khi đã qua check `!pc` và `!pc.has_bill`). Thay **nguyên khối** này:

```tsx
                        return (
                          <div style={{ ...box, border: "1px solid var(--border)", background: "var(--surface-2)" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <span style={{ fontSize: 10.5, letterSpacing: "0.05em", color: "var(--text-3)", textTransform: "uppercase", fontWeight: 600 }}>
                                Biên lai · {pc.pr_id}
                              </span>
                              <Icons.Receipt size={15} />
                            </div>
                            <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 2 }}>
                              {pc.pr_name} · lần TT {pc.attempt_idx}
                            </div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: "var(--money)", marginTop: "auto" }}>{vnd(pc.amount)}</div>
                            <div style={{ fontSize: 10.5, color: "var(--text-3)" }}>{pc.created_at}</div>
                          </div>
                        );
```

bằng:

```tsx
                        const imgs = pc.bill_images ?? [];
                        if (imgs.length === 0)
                          return (
                            <div style={{ ...box, border: "1.5px dashed var(--border)", color: "var(--text-3)", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
                              <Icons.Image size={22} />
                              <span>Không tải được ảnh bill</span>
                            </div>
                          );
                        return (
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <div style={{ fontSize: 10.5, letterSpacing: "0.05em", color: "var(--text-3)", textTransform: "uppercase", fontWeight: 600 }}>
                              Biên lai · {pc.pr_id} · {vnd(pc.amount)}
                            </div>
                            {imgs.map((src, i) => (
                              <img
                                key={i}
                                src={src}
                                alt={`bill ${pc.pr_id} ${i + 1}`}
                                onClick={() => window.open(src, "_blank")}
                                style={{ width: "100%", maxHeight: 280, objectFit: "contain", borderRadius: 8, border: "1px solid var(--border)", cursor: "zoom-in", background: "var(--surface-2)" }}
                              />
                            ))}
                          </div>
                        );
```

**Ghi chú thiết kế (đọc để hiểu, đừng đổi):**
- Giữ 1 dòng caption `Biên lai · pr_id · số tiền` để kế toán đối chiếu nhanh (nhãn panel là "đối chiếu ảnh bill"), phần còn lại là ảnh thật — click mở tab mới (y hệt tab CK `ReconciliationTab.tsx:1959–1967`).
- Bỏ `box` (height cố định 150) ở nhánh ảnh vì ảnh cao `maxHeight 280` cần container tự giãn; 2 nhánh placeholder/cảnh báo vẫn dùng `box`.
- `imgs.length === 0` là fail-safe: BE đặt `has_bill = bool(bill_images)` nên has_bill=true ⟺ có ảnh; nhưng vẫn guard để không vỡ nếu dữ liệu lệch (tiêu chí "không lỗi con").
- KHÔNG dùng non-null assertion `pc.bill_images!` (dùng `?? []`) để tránh lỗi lint/strict.

### Task A3: Verify

1. **Type + build (gate cứng):**
```bash
cd frontend && npx tsc -b
```
Expected: không lỗi.
```bash
cd frontend && npm run build
```
Expected: build success.

2. **Grep xác nhận đã render ảnh:**
```bash
grep -n "bill_images" frontend/src/components/CardReconciliationTab.tsx
```
Expected: có dòng `const imgs = pc.bill_images ?? [];` và block `<img ... src={src}`.

3. **Smoke trực quan (best-effort — chỉ khi có `.env.local` + session đăng nhập):** chạy `cd frontend && npm run dev`, mở màn Đối soát giao dịch · Quẹt thẻ → mở 1 GD mPOS chưa ghép có candidate đã up bill → chọn candidate → panel phải hiện **ảnh thật** (không phải card chữ), click ảnh mở tab mới. Nếu không có session/dữ liệu thì bỏ qua bước này — gate cứng là tsc+build (rủi ro còn lại chỉ là CSS, thấp; field name `bill_images` đã xác nhận khớp BE).

### Definition of Done — Part A
- [ ] `MatchCandidate` có `bill_images?: string[]`.
- [ ] Nhánh has_bill render `<img>` thật + caption, có guard `imgs.length === 0`.
- [ ] `npx tsc -b` PASS, `npm run build` PASS.
- [ ] Không đụng file nào ngoài 2 file khai báo.

### Đối chiếu 5 tiêu chuẩn — Part A
| Tiêu chí | Đạt? | Ghi chú |
|---|---|---|
| Triệt để | ✅ | Nối đúng mắt xích đứt (type + render); BE vốn đã trả data. |
| Không lỗi con | ✅ | Guard `imgs.length===0`; không đụng 2 nhánh khác; `?? []` tránh null. |
| Không tăng hạ tầng | ✅ | Không lib, không endpoint mới. |
| Tối ưu token | ✅ | 2 file, copy pattern CK sẵn có, không refactor share component. |
| Context compact | ✅ | Nhúng nguyên văn old/new code + path/line + expected. |

---

# PART B — DB: Suppress báo tiền cho MỌI method khi tiền về trước lần TT

**Loại:** DB-only (Supabase Postgres trigger function). **KHÔNG** sửa Python/TS, KHÔNG deploy Render/Vercel, KHÔNG chạy npm/pytest.

**Bản chất fix:** copy y nguyên function `fn_payment_paid_zalo_notify` bản 2026-07-28, **xoá đúng 1 dòng** miễn trừ card/installment. Giữ nguyên carve-out SePay.

**Supabase projects:**
- Sandbox: `pxgybyfiwywksesyogti`
- Prod: `jozcvbbypwvzaefteoxn`

**Lineage function** (mỗi bản REPLACE toàn bộ bản trước):
1. `2026-06-23-zalo-oa-tables.sql` — gốc + `CREATE TRIGGER trg_payment_paid_zalo`
2. `2026-07-17-suppress-baotien-pay-before-created.sql` — thêm suppress theo thời gian
3. `2026-07-20-allow-baotien-card-installment.sql` — miễn suppress card/installment
4. `2026-07-28-baotien-sepay-no-suppress.sql` — thêm carve-out sepay ← **bản đang live**
5. `2026-08-05-baotien-suppress-card-before-line.sql` — bản mới (plan này) = bản 4 trừ dòng card

### ⛔ Guardrails B (đọc kỹ — vi phạm = DỪNG)
1. **DB-only.** Không sửa file Python/TS. Không deploy. Không npm/pytest.
2. **Chỉ tạo/sửa đúng 4 file:** migration SQL mới, learnings note mới, `docs/learnings/README.md` (1 dòng index), và tick checkbox plan này.
3. **Pre-flight bắt buộc (Task B0):** dump function đang live ở CẢ sandbox + prod, so với bản 2026-07-28 trong repo. Khác logic (không tính whitespace) → **DỪNG, báo user**, không apply. (Bài học prod drift.)
4. **Test chỉ chạy trong `BEGIN; … ROLLBACK;`** trong MỘT lệnh `execute_sql` duy nhất. TUYỆT ĐỐI không COMMIT dữ liệu test. Worker Zalo poll `zalo_outbox` — row chưa commit thì worker không thấy → an toàn cả trên prod.
5. **Không UPDATE/DELETE row thật** trong `zalo_outbox`, `payment_lines`, `payment_requests`, `bank_transactions`, `gateway_transactions`. Test chỉ INSERT row mới rồi rollback.
6. **Thứ tự bất di bất dịch:** sandbox apply → sandbox verify PASS → prod apply → prod verify PASS. Sandbox fail → không đụng prod.
7. **INSERT test fail vì cột NOT NULL thiếu** → thêm đúng cột đó giá trị hợp lý, chạy lại. Lỗi khác (permission/constraint lạ/trigger lạ) → DỪNG, báo user kèm error nguyên văn.
8. **Rollback nếu sự cố sau apply:** chạy lại nguyên văn `backend/migrations/2026-07-28-baotien-sepay-no-suppress.sql` (idempotent, khôi phục hành vi cũ — thẻ báo lại).
9. **Commit:** đúng 1 commit ở cuối (Task B6). Không commit lắt nhắt.

### Task B0: Pre-flight — verify function live không drift + tái xác nhận an toàn

**B0.1 — Dump function ở SANDBOX** (`execute_sql`, project `pxgybyfiwywksesyogti`):
```sql
SELECT pg_get_functiondef('public.fn_payment_paid_zalo_notify'::regproc);
```
**B0.2 — Dump function ở PROD** (`execute_sql`, project `jozcvbbypwvzaefteoxn`): cùng câu trên.

**B0.3 — So logic** với function trong `backend/migrations/2026-07-28-baotien-sepay-no-suppress.sql`. Bỏ qua whitespace. Khối suppress phải đúng là:
```sql
IF v_pay_time IS NOT NULL
   AND v_pay_time < NEW.created_at
   AND COALESCE(NEW.method, '') NOT IN ('card', 'installment')
   AND COALESCE(NEW.confirmed_source, '') <> 'sepay' THEN
```
**Nếu KHÁC logic ở env nào → DỪNG TOÀN BỘ, báo user kèm dump.** (Đã xác nhận prod khớp bản 2026-07-28 ngày 05/08 — nếu lệch nghĩa là có thay đổi mới, phải dừng.)

**B0.4 — Trigger còn gắn** (cả 2 project):
```sql
SELECT tgname, tgenabled FROM pg_trigger
WHERE tgrelid = 'public.payment_lines'::regclass AND tgname = 'trg_payment_paid_zalo';
```
Expected: 1 row, `tgenabled = 'O'` (enabled). Khác → DỪNG.

**B0.5 — Tái xác nhận "không lỗi con" (paid_at thẻ không làm tròn phút)** — chạy trên prod:
```sql
SELECT pl.method,
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE gt.paid_at < pl.created_at) AS pay_before_line,
       COUNT(*) FILTER (WHERE gt.paid_at >= pl.created_at AND gt.paid_at < pl.created_at + interval '60 seconds') AS within_60s_after
FROM public.payment_lines pl
JOIN public.gateway_transactions gt ON gt.payment_line_id = pl.id
WHERE pl.method IN ('card','installment') AND pl.status = 'paid'
GROUP BY pl.method;
```
Expected: `within_60s_after = 0` cho card + installment (không có đơn thẻ sát ranh 60s → bỏ miễn trừ không suppress oan đơn quẹt-sau). **Nếu within_60s_after > 0 → DỪNG, báo user** (có case rủi ro cần bàn lại, có thể cần dùng ngưỡng thời gian thay vì so trực tiếp).

### Task B1: Tạo file migration

**File:** `backend/migrations/2026-08-05-baotien-suppress-card-before-line.sql`

Nội dung CHÍNH XÁC (toàn bộ function bản 2026-07-28, xoá dòng `AND COALESCE(NEW.method, '') NOT IN ('card', 'installment')`):

```sql
-- 2026-08-05: Suppress tin "báo tiền về" cho MỌI phương thức khi tiền về
-- TRƯỚC thời điểm tạo lần TT — bỏ miễn trừ card/installment (migration 2026-07-20).
--
-- Rule (PM chốt 05/08): tiền về trước created_at của lần TT = booking hồi tố,
-- KHÔNG báo, bất kể CK/thẻ/trả góp. Đơn thẻ quẹt-trước-tạo-PR-sau (vd
-- PR-2026-0906: quẹt 04/08 01:18, tạo lần TT 05/08 14:10) không được spam nhóm.
--
-- An toàn (verify prod 05/08): mPOS/Payoo paid_at có giây THẬT (không làm tròn
-- phút như SePay) → không false-suppress do rounding; 0/45 line thẻ nằm trong
-- vùng [created_at, +60s); 17 line "trước" đều cách 4h–10 ngày = hồi tố thật.
--
-- Giữ carve-out SePay (confirmed_source='sepay'): SePay sinh transfer_code cùng
-- lần TT nên tiền không thể về trước thật; pay_time<created_at ở SePay chỉ là ảo
-- do làm tròn phút → vẫn phải báo.
--
-- Idempotent: CREATE OR REPLACE.
-- Reversible: chạy lại backend/migrations/2026-07-28-baotien-sepay-no-suppress.sql

CREATE OR REPLACE FUNCTION public.fn_payment_paid_zalo_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_sale_email TEXT;
  v_sale_team  TEXT;
  v_group_id   TEXT;
  v_message    TEXT;
  v_pay_time   TIMESTAMPTZ;
BEGIN
  IF NEW.status = 'paid' AND (OLD.status IS NULL OR OLD.status != 'paid') THEN

    SELECT LEAST(
      (SELECT min(bt.transaction_date)
         FROM public.bank_transactions bt
        WHERE bt.payment_line_id = NEW.id),
      (SELECT min(gt.paid_at)
         FROM public.gateway_transactions gt
        WHERE gt.payment_line_id = NEW.id)
    ) INTO v_pay_time;

    -- Suppress khi tiền về TRƯỚC lúc tạo lần TT (booking hồi tố) — áp cho MỌI
    -- method (CK ghép tay, thẻ, trả góp). Chỉ SePay-auto được miễn vì
    -- transaction_date làm tròn phút (tiền SePay không thể về trước thật).
    IF v_pay_time IS NOT NULL
       AND v_pay_time < NEW.created_at
       AND COALESCE(NEW.confirmed_source, '') <> 'sepay' THEN
      RAISE NOTICE '[zalo] payment_paid suppressed: pay_time=% < line.created_at=% line_id=% method=% source=%',
        v_pay_time, NEW.created_at, NEW.id, NEW.method, NEW.confirmed_source;
      RETURN NEW;
    END IF;

    SELECT pr.sale_email, ns.team
      INTO v_sale_email, v_sale_team
      FROM public.payment_requests pr
      LEFT JOIN public.nhan_su_sale ns ON ns.email ILIKE pr.sale_email
      WHERE pr.id = NEW.payment_request_id
      LIMIT 1;

    SELECT group_id INTO v_group_id
      FROM public.zalo_team_groups
      WHERE team_code = v_sale_team AND is_active = true
      LIMIT 1;

    IF v_group_id IS NULL THEN
      RAISE WARNING 'No active Zalo group mapping found for team: %', v_sale_team;
      RETURN NEW;
    END IF;

    v_message := public.build_payment_paid_message(NEW);

    INSERT INTO public.zalo_outbox (event_type, source_table, source_id, group_id, message)
    VALUES ('payment_paid', 'payment_lines', NEW.id, v_group_id, v_message)
    ON CONFLICT (source_table, source_id, event_type) DO NOTHING;

    PERFORM public.enqueue_bill_uploaded_zalo(NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;
```

**B1.2 — Đối chiếu diff** với `backend/migrations/2026-07-28-baotien-sepay-no-suppress.sql`: khác biệt DUY NHẤT được phép = (a) header comment, (b) **xoá** dòng `AND COALESCE(NEW.method, '') NOT IN ('card', 'installment')`, (c) comment khối suppress, (d) thêm `method=%` + `NEW.method` vào RAISE NOTICE. Khác chỗ khác → sửa cho khớp.

### Task B2: Apply SANDBOX
`apply_migration`, project `pxgybyfiwywksesyogti`, name `baotien_suppress_card_before_line`, query = toàn bộ nội dung Task B1.
Confirm:
```sql
SELECT pg_get_functiondef('public.fn_payment_paid_zalo_notify'::regproc);
```
Expected: **KHÔNG** còn chuỗi `NOT IN ('card', 'installment')`; VẪN còn `confirmed_source, '') <> 'sepay'`.

### Task B3: Verify SANDBOX bằng test script (BEGIN…ROLLBACK)

6 case:

| # | source | method | pay_time vs created_at | bảng nguồn | Kỳ vọng outbox |
|---|---|---|---|---|---|
| T1 | `sepay` | qr | trước 18s (rounding) | bank_transactions | **CÓ** (carve-out sepay) |
| T2 | `manual` | qr | trước 2 ngày | bank_transactions | **KHÔNG** (rule cũ) |
| T3 | `manual` | qr | sau 3 giờ | bank_transactions | **CÓ** (rule cũ) |
| T4 | `gateway` | card | trước 1 ngày | gateway_transactions | **KHÔNG** ← thay đổi chính (trước là CÓ) |
| T5 | `gateway` | card | sau (tiền về giờ, line tạo 2h trước) | gateway_transactions | **CÓ** (thẻ quẹt-sau vẫn báo) |
| T6 | `gateway` | installment | trước 1 ngày | gateway_transactions | **KHÔNG** (áp cả trả góp) |

Chạy `execute_sql`, project `pxgybyfiwywksesyogti`, TOÀN BỘ trong MỘT lệnh (mở `BEGIN;` đóng `ROLLBACK;`):

```sql
BEGIN;

-- Mượn 1 PR thật có sale map vào Zalo group active (chỉ đọc; mọi INSERT là row mới)
CREATE TEMP TABLE _t_ctx ON COMMIT DROP AS
SELECT pr.id AS pr_id
FROM public.payment_requests pr
JOIN public.nhan_su_sale ns ON ns.email ILIKE pr.sale_email
JOIN public.zalo_team_groups g ON g.team_code = ns.team AND g.is_active = true
WHERE COALESCE(pr.is_test, false) = false
LIMIT 1;

DO $$ BEGIN
  IF (SELECT count(*) FROM _t_ctx) = 0 THEN
    RAISE EXCEPTION 'SETUP FAIL: khong tim duoc PR co sale map vao Zalo group active';
  END IF;
END $$;

-- ===== T1: sepay + trước 18s → PHẢI CÓ =====
INSERT INTO public.payment_lines (id, payment_request_id, method, amount, status, transfer_code, created_at)
SELECT 'aaaaaaaa-0000-4000-8000-000000000001'::uuid, pr_id, 'qr', 1000000, 'pending', 'ZZT1', now() FROM _t_ctx;
INSERT INTO public.bank_transactions (txn_id, amount, content, transfer_content, transaction_date, match_status, payment_line_id, gateway)
VALUES ('bbbbbbbb-0000-4000-8000-000000000001'::uuid, 1000000, 'TEST T1 ZZT1', 'TEST T1 ZZT1',
        now() - interval '18 seconds', 'auto_matched', 'aaaaaaaa-0000-4000-8000-000000000001'::uuid, 'sepay_webhook');
UPDATE public.payment_lines SET status='paid', confirmed_source='sepay', confirmed_by='system:sepay', confirmed_at=now(), paid_at=now()
WHERE id='aaaaaaaa-0000-4000-8000-000000000001'::uuid;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.zalo_outbox WHERE source_id='aaaaaaaa-0000-4000-8000-000000000001'::uuid AND event_type='payment_paid') THEN
    RAISE EXCEPTION 'T1 FAIL: sepay rounding 18s bi suppress (mat carve-out sepay)';
  END IF;
  RAISE NOTICE 'T1 PASS';
END $$;

-- ===== T2: manual + tiền cũ 2 ngày → PHẢI KHÔNG =====
INSERT INTO public.payment_lines (id, payment_request_id, method, amount, status, transfer_code, created_at)
SELECT 'aaaaaaaa-0000-4000-8000-000000000002'::uuid, pr_id, 'qr', 2000000, 'pending', 'ZZT2', now() FROM _t_ctx;
INSERT INTO public.bank_transactions (txn_id, amount, content, transfer_content, transaction_date, match_status, payment_line_id, gateway)
VALUES ('bbbbbbbb-0000-4000-8000-000000000002'::uuid, 2000000, 'TEST T2 ZZT2', 'TEST T2 ZZT2',
        now() - interval '2 days', 'manual_matched', 'aaaaaaaa-0000-4000-8000-000000000002'::uuid, 'sepay_webhook');
UPDATE public.payment_lines SET status='paid', confirmed_source='manual', confirmed_by='test@dev', confirmed_at=now(), paid_at=now()
WHERE id='aaaaaaaa-0000-4000-8000-000000000002'::uuid;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.zalo_outbox WHERE source_id='aaaaaaaa-0000-4000-8000-000000000002'::uuid AND event_type='payment_paid') THEN
    RAISE EXCEPTION 'T2 FAIL: manual tien cu 2 ngay ma van ban tin';
  END IF;
  RAISE NOTICE 'T2 PASS';
END $$;

-- ===== T3: manual + tiền về sau 3h → PHẢI CÓ =====
INSERT INTO public.payment_lines (id, payment_request_id, method, amount, status, transfer_code, created_at)
SELECT 'aaaaaaaa-0000-4000-8000-000000000003'::uuid, pr_id, 'qr', 3000000, 'pending', 'ZZT3', now() - interval '3 hours' FROM _t_ctx;
INSERT INTO public.bank_transactions (txn_id, amount, content, transfer_content, transaction_date, match_status, payment_line_id, gateway)
VALUES ('bbbbbbbb-0000-4000-8000-000000000003'::uuid, 3000000, 'TEST T3 ZZT3', 'TEST T3 ZZT3',
        now(), 'manual_matched', 'aaaaaaaa-0000-4000-8000-000000000003'::uuid, 'sepay_webhook');
UPDATE public.payment_lines SET status='paid', confirmed_source='manual', confirmed_by='test@dev', confirmed_at=now(), paid_at=now()
WHERE id='aaaaaaaa-0000-4000-8000-000000000003'::uuid;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.zalo_outbox WHERE source_id='aaaaaaaa-0000-4000-8000-000000000003'::uuid AND event_type='payment_paid') THEN
    RAISE EXCEPTION 'T3 FAIL: manual tien ve sau lan TT ma khong ban tin';
  END IF;
  RAISE NOTICE 'T3 PASS';
END $$;

-- ===== T4: card + tiền quẹt trước 1 ngày → PHẢI KHÔNG (thay đổi chính) =====
INSERT INTO public.payment_lines (id, payment_request_id, method, amount, status, transfer_code, created_at)
SELECT 'aaaaaaaa-0000-4000-8000-000000000004'::uuid, pr_id, 'card', 4000000, 'pending', 'ZZT4', now() FROM _t_ctx;
INSERT INTO public.gateway_transactions (id, source, category, txn_code, amount, net_amount, paid_at, match_status, payment_line_id)
VALUES ('cccccccc-0000-4000-8000-000000000004'::uuid, 'mpos', 'card', 'ZZGT4', 4000000, 3900000,
        now() - interval '1 day', 'matched', 'aaaaaaaa-0000-4000-8000-000000000004'::uuid);
UPDATE public.payment_lines SET status='paid', confirmed_source='gateway', confirmed_by='test@dev', confirmed_at=now(), paid_at=now()
WHERE id='aaaaaaaa-0000-4000-8000-000000000004'::uuid;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.zalo_outbox WHERE source_id='aaaaaaaa-0000-4000-8000-000000000004'::uuid AND event_type='payment_paid') THEN
    RAISE EXCEPTION 'T4 FAIL: card quet truoc 1 ngay VAN ban tin (mien tru card chua go)';
  END IF;
  RAISE NOTICE 'T4 PASS';
END $$;

-- ===== T5: card + tiền về sau (line tạo 2h trước, quẹt now) → PHẢI CÓ =====
INSERT INTO public.payment_lines (id, payment_request_id, method, amount, status, transfer_code, created_at)
SELECT 'aaaaaaaa-0000-4000-8000-000000000005'::uuid, pr_id, 'card', 5000000, 'pending', 'ZZT5', now() - interval '2 hours' FROM _t_ctx;
INSERT INTO public.gateway_transactions (id, source, category, txn_code, amount, net_amount, paid_at, match_status, payment_line_id)
VALUES ('cccccccc-0000-4000-8000-000000000005'::uuid, 'mpos', 'card', 'ZZGT5', 5000000, 4875000,
        now(), 'matched', 'aaaaaaaa-0000-4000-8000-000000000005'::uuid);
UPDATE public.payment_lines SET status='paid', confirmed_source='gateway', confirmed_by='test@dev', confirmed_at=now(), paid_at=now()
WHERE id='aaaaaaaa-0000-4000-8000-000000000005'::uuid;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.zalo_outbox WHERE source_id='aaaaaaaa-0000-4000-8000-000000000005'::uuid AND event_type='payment_paid') THEN
    RAISE EXCEPTION 'T5 FAIL: card quet SAU lan TT ma khong ban tin (suppress qua da)';
  END IF;
  RAISE NOTICE 'T5 PASS';
END $$;

-- ===== T6: installment + tiền trước 1 ngày → PHẢI KHÔNG =====
INSERT INTO public.payment_lines (id, payment_request_id, method, amount, status, transfer_code, created_at)
SELECT 'aaaaaaaa-0000-4000-8000-000000000006'::uuid, pr_id, 'installment', 6000000, 'pending', 'ZZT6', now() FROM _t_ctx;
INSERT INTO public.gateway_transactions (id, source, category, txn_code, amount, net_amount, paid_at, match_status, payment_line_id)
VALUES ('cccccccc-0000-4000-8000-000000000006'::uuid, 'payoo', 'installment', 'ZZGT6', 6000000, 5820000,
        now() - interval '1 day', 'matched', 'aaaaaaaa-0000-4000-8000-000000000006'::uuid);
UPDATE public.payment_lines SET status='paid', confirmed_source='gateway', confirmed_by='test@dev', confirmed_at=now(), paid_at=now()
WHERE id='aaaaaaaa-0000-4000-8000-000000000006'::uuid;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.zalo_outbox WHERE source_id='aaaaaaaa-0000-4000-8000-000000000006'::uuid AND event_type='payment_paid') THEN
    RAISE EXCEPTION 'T6 FAIL: installment truoc 1 ngay VAN ban tin';
  END IF;
  RAISE NOTICE 'ALL 6 TESTS PASSED';
END $$;

ROLLBACK;
```

**Expected:** chạy hết không exception (MCP không trả NOTICE thì "không error" = pass; exception nào nổi lên = FAIL).
- Fail vì cột NOT NULL thiếu → Guardrail 7: thêm cột đó, chạy lại toàn bộ.
- Fail lý do khác → DỪNG, báo user, KHÔNG apply prod.

**B3.2 — Confirm không rác:**
```sql
SELECT (SELECT count(*) FROM public.payment_lines WHERE transfer_code LIKE 'ZZT%') AS lines_left,
       (SELECT count(*) FROM public.gateway_transactions WHERE txn_code LIKE 'ZZGT%') AS gt_left;
```
Expected: cả 2 = `0`. Khác → DỪNG, báo user (không tự xoá).

### Task B4: Apply + verify PROD
Điều kiện: Task B3 PASS toàn bộ.
**B4.1** `apply_migration`, project `jozcvbbypwvzaefteoxn`, name `baotien_suppress_card_before_line`, query = cùng nội dung Task B1.
**B4.2** Confirm:
```sql
SELECT pg_get_functiondef('public.fn_payment_paid_zalo_notify'::regproc);
```
Expected: KHÔNG còn `NOT IN ('card', 'installment')`; còn `<> 'sepay'`.
**B4.3** Chạy CÙNG test script Task B3 trên prod (project `jozcvbbypwvzaefteoxn`). An toàn vì BEGIN…ROLLBACK.
> ⚠️ Prod có CHECK `bank_txn_gateway_check`: `gateway` ∈ `{sepay_webhook, sepay_poll, mpos_import, manual}`. Script T1–T3 dùng `sepay_webhook` (hợp lệ). `gateway_transactions.source` CHECK ∈ `{mpos, payoo}` — script T4–T6 dùng `mpos`/`payoo` (hợp lệ). Nếu vẫn lỗi constraint lạ → DỪNG.
**B4.4** Confirm không rác (cùng query B3.2) → `0`/`0`.

### Task B5: Learnings note
**File tạo:** `docs/learnings/baotien-suppress-by-time-all-methods.md`
```markdown
# Suppress "báo tiền về" theo THỜI GIAN cho mọi method, không miễn trừ theo method

**Problem:** Đơn thẻ/trả góp quẹt-trước-tạo-PR-sau (PR-2026-0906: quẹt 04/08,
tạo lần TT 05/08) vẫn bắn tin Zalo "ĐÃ VÀO TK" → spam nhóm sale với tiền hồi tố.
Do migration 2026-07-20 MIỄN suppress cho method IN ('card','installment').

**Trap:** Miễn trừ theo method (2026-07-20) được thêm vì tưởng "kế toán ghép mPOS
= luôn cần báo". Nhưng rule đúng của nghiệp vụ là theo THỜI GIAN: tiền về trước
lúc tạo lần TT = booking hồi tố → không báo, bất kể phương thức. Miễn theo method
đã vô hiệu hoá rule thời gian cho cả nhánh thẻ quẹt-trước.

**Insight:** Trước khi tin "so timestamp không đáng tin cho method X", phải đo độ
phân giải nguồn. mPOS/Payoo gateway_transactions.paid_at có GIÂY thật (khác SePay
làm tròn phút) → so trực tiếp paid_at < created_at là chuẩn cho thẻ. Verify prod:
0/45 line thẻ nằm trong [created_at,+60s), 17 line "trước" cách 4h–10 ngày = hồi
tố thật → bỏ miễn trừ an toàn, không suppress oan đơn quẹt-sau. Carve-out SePay
giữ nguyên vì SePay mới thật sự dính rounding.

**Rule:** Rule nghiệp vụ ("cũ/mới theo mốc tạo") nên áp đồng nhất theo dữ liệu
thời gian đã kiểm chứng độ phân giải, thay vì miễn trừ theo loại. Miễn trừ theo
method chỉ dùng khi CHÍNH nguồn thời gian của method đó không tin được (SePay).
Fix: backend/migrations/2026-08-05-baotien-suppress-card-before-line.sql. Liên
quan: [[sepay-minute-rounding-suppress]].
```
**B5.2** Thêm 1 dòng index vào `docs/learnings/README.md` theo format sẵn có.

### Task B6: Commit (1 commit duy nhất)
**B6.1** `git status` — chỉ được có: migration mới, learnings note, README.md learnings, plan này. File lạ → không add.
**B6.2**
```bash
git add backend/migrations/2026-08-05-baotien-suppress-card-before-line.sql docs/learnings/baotien-suppress-by-time-all-methods.md docs/learnings/README.md docs/superpowers/plans/2026-08-05-bill-image-panel-and-card-baotien-suppress.md
git commit -m "fix(zalo): không báo tiền cho thẻ/trả góp khi tiền về trước lần TT

Bỏ miễn trừ card/installment (migration 2026-07-20) khỏi khối suppress:
tiền về trước created_at của lần TT = booking hồi tố → không báo, bất kể
phương thức. Giữ carve-out SePay (làm tròn phút). mPOS/Payoo paid_at có
giây thật nên so trực tiếp chuẩn; verify prod 0/45 line trong vùng rủi ro.
DB-only, apply sandbox+prod, test 6 case BEGIN/ROLLBACK.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
**B6.3** `git push origin main` (BE/FE code không đổi → Vercel build output y hệt; Render auto-deploy OFF → push an toàn).

> Nếu Part A cũng đã xong và anh Minh duyệt gộp: thêm 2 file Part A vào cùng commit, đổi message cho phù hợp. Mặc định Part A và Part B commit riêng.

### Definition of Done — Part B
- [ ] Function sandbox + prod KHÔNG còn `NOT IN ('card', 'installment')`, CÒN `<> 'sepay'`.
- [ ] 6 test case pass ở CẢ 2 env, không rác (`ZZT%`/`ZZGT%` = 0).
- [ ] Learnings note + index committed.
- [ ] 1 commit trên main, đã push. Không file Python/TS nào bị sửa.

### Đối chiếu 5 tiêu chuẩn — Part B
| Tiêu chí | Đạt? | Ghi chú |
|---|---|---|
| Triệt để | ✅ | Sửa đúng root cause (miễn trừ theo method), áp rule thời gian đồng nhất. |
| Không lỗi con | ✅ | Verify prod paid_at có giây thật + 0 line vùng 60s (B0.5); giữ carve-out SePay; T5 chặn suppress-quá-đà; reversible. |
| Không tăng hạ tầng | ✅ | DB-only, 1 CREATE OR REPLACE, không worker/bảng mới. |
| Tối ưu token | ✅ | Copy bản 28/7 trừ 1 dòng; không đụng Python/FE; 1 commit. |
| Context compact | ✅ | Nhúng nguyên văn SQL function + test script + schema constraint + expected. |

---

## Thứ tự thực thi tổng

- **Part A** và **Part B** độc lập hoàn toàn (FE-only vs DB-only) → có thể 2 agent Sonnet chạy song song, hoặc tuần tự A→B / B→A.
- Trong Part B: **bắt buộc tuần tự** B0 → B1 → B2 → B3 → (PASS) → B4 → B5 → B6. Không nhảy cóc, không apply prod khi sandbox chưa PASS.
- Không task nào cần giữ context lớn xuyên suốt → tất cả đạt tiêu chí 5 (self-contained cho Sonnet).

## Xác nhận của anh Minh (05/08) — đã chốt

1. ✅ **Áp cho cả `installment` (trả góp).** Trả góp cũng quẹt qua cổng mPOS/Payoo → cùng bảng `gateway_transactions`, cùng `paid_at` → cùng luật. Gỡ cả `card` lẫn `installment`.
2. ✅ **GIỮ miễn trừ SePay** (`confirmed_source='sepay'` → luôn báo, không so giờ). Đây đúng là fix minute-rounding hồi 28/7 (SePay ghi giao dịch tròn phút, lần TT chính xác tới giây → so giờ sai). "Cứ theo luật hồi đó" = giữ nguyên. Lưu ý: thẻ KHÁC SePay — mPOS/Payoo `paid_at` có giây thật (verify prod) nên không cần miễn trừ, chỉ SePay cần.
3. ✅ **Không cần chờ anh Hiếu.** "Quyết định 20/7" (`2026-07-20-allow-baotien-card-installment.sql`) không phải chính sách nghiệp vụ — nó là bản vá mức dev **đọc nhầm yêu cầu gốc**. Part B chỉ gỡ miếng vá sai, đưa về đúng ý gốc → cứ chạy.

**Nguồn gốc chính xác (anh Minh soát lại chat nhóm "GMV Palfish App tối ưu" ngày 20/07):** yêu cầu gốc là *"giao dịch quẹt thẻ/trả góp có tin báo tiền về Zalo — nhưng CHỈ khi thanh toán SAU lúc tạo lần TT; khách quẹt trước cả khi tạo lần TT thì không báo."* Bản vá 20/7 hiểu nhầm thành "**luôn** báo" (gỡ hẳn điều kiện thời gian cho thẻ) → sinh mâu thuẫn phát hiện 05/08. Part B khôi phục đúng điều kiện thời gian gốc.

**Không đụng tin DingTalk "Bàn giao":** đơn tín dụng có 2 tin tách biệt — (1) DingTalk "Bàn giao" bắn NGAY lúc khách quẹt (event AR-created, `dingtalk_outbox`, trigger riêng) và (2) Zalo "báo tiền về" khi kế toán xác nhận tiền (`fn_payment_paid_zalo_notify`). Part B chỉ `CREATE OR REPLACE` hàm (2). Tin (1) KHÔNG bị ảnh hưởng — khách quẹt vẫn có tin bàn giao ngay như cũ.
