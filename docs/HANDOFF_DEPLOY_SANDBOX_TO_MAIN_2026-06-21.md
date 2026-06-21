# Handoff: Đẩy sandbox → main + Production (21/06/2026)

> **Người nhận**: Đạt / Đức / Giang
> **Người giao**: Minh
> **Mục tiêu**: Đưa toàn bộ tính năng sandbox lên production trong ngày 21/06/2026
> **Thời gian dự kiến**: 60–90 phút nếu mọi thứ trơn tru, max 3h nếu gặp issue
>
> **TUYỆT ĐỐI**: đọc xong toàn bộ handoff trước khi bắt đầu. Có 4 môi trường liên quan (Vercel FE, Render BE, Supabase prod, Chrome extension) — sai thứ tự là dễ chết một cái.

---

## ⚠️ HOTFIX 20/6 22:00 — đã deploy main TRƯỚC handoff này

Render prod `palfish-gmv-api` crash OOM (>512MB) lúc 10:12 UTC do FE poll `/sync-pending-payos` liên tục + endpoint không gate `USE_PAYOS` + 8 stale QR lines bám PayOS đã chết. Minh đã hotfix:

- **Commit trên main**: `25ed579 fix(payos): gate sync/webhook theo USE_PAYOS — cứu OOM prod 512MB`
- **Commit gốc trên sandbox**: `91ea780` (cùng nội dung)
- **3 file đụng**: `backend/main.py`, `backend/payment_request_routes.py`, `frontend/src/contexts/PaymentFlowContext.tsx`

**Ảnh hưởng đến deploy mai**:
1. Khi merge `sandbox → main`: 3 file trên CÙNG nội dung 2 nhánh → git auto-merge KHÔNG conflict (no-op cho 3 file đó).
2. Env `USE_PAYOS=false` trên Render BE prod **đã đề cập trong mục 4.1** — vẫn cần verify đã set explicit.
3. Trên prod đang có **8 lần TT QR PayOS pending** thuộc 6 PR — xem mục 6.1 mới.

---

## 0. TL;DR — 4 bước chính

```
1. PRE-MERGE      → verify sandbox xanh, chạy lại test full
2. DB MIGRATION   → chạy 6 file SQL trên Supabase prod (xem bảng mục 2.2)
3. CODE DEPLOY    → merge sandbox→main, push, Render+Vercel auto-deploy
4. POST-DEPLOY    → đổi env prod (USE_PAYOS=false), smoke test
```

Nếu trục trặc bất kỳ bước nào → **STOP**, không bước tiếp. Xem mục **Rollback** ở cuối.

---

## 1. PRE-MERGE — checklist trước khi merge

### 1.1 Verify sandbox đang xanh

```bash
# Pull mới nhất
git fetch origin
git checkout sandbox
git pull origin sandbox

# BE test full
cd backend
C:/Python314/python.exe -m pytest    # Windows
# hoặc: python3 -m pytest             # Mac/Linux
# Phải pass HOÀN TOÀN 242 test

# FE test full
cd ../frontend
npx tsc -b                          # type-check phải 0 lỗi
npm test                            # 170 test phải pass
```

Nếu có 1 test fail → dừng, ping Minh kiểm tra trước khi tiếp.

### 1.2 Verify sandbox URL đang chạy

Mở https://palfish-gmv-manager-sandbox.vercel.app/ → login `test.admin@dev` → check 5 luồng:
- [ ] Tạo PR (B1)
- [ ] Xem giao dịch SePay tự khớp (B2 → Chuyển khoản)
- [ ] Ghép tay GD lệch tiền (B2 → CK ngoài chờ ghép)
- [ ] Kích hoạt khoá học (B3)
- [ ] Cộng buổi referral + bỏ tick có lý do (B3 drawer)

### 1.3 Backup Supabase prod TRƯỚC migration

Supabase Dashboard → Project `project_palfish` (jozcvbbypwvzaefteoxn) → **Database** → **Backups** → bấm "Create backup" → đặt tên `pre-merge-2026-06-21`.

Đợi backup chạy xong (3-5 phút) mới tiếp.

---

## 2. DB MIGRATION — chạy SQL trên Supabase PROD

Project ID prod: **`jozcvbbypwvzaefteoxn`** (KHÔNG phải sandbox `pxgybyfiwywksesyogti`!)

### 2.1 Vào SQL Editor của prod

Supabase Dashboard → project `project_palfish` → **SQL Editor** → **New query**.

**KIỂM TRA TRƯỚC**: xem topbar có chữ `project_palfish` chưa? Đúng prod mới chạy.

### 2.2 Chạy lần lượt 5 file (theo thứ tự)

Mỗi file copy-paste vào SQL Editor → Run → đợi xong rồi sang file tiếp theo.

| Thứ tự | File | Mục đích | Idempotent? |
|--------|------|----------|-------------|
| 1 | `docs/migrations/2026-06-13-sepay-bank-transactions.sql` | Tạo bảng `bank_transactions` (SePay) | ✅ có `IF NOT EXISTS` |
| 2 | `docs/migrations/2026-06-16-fix-sepay-unique-constraint.sql` | Fix unique constraint cho sepay_id | ✅ (đã sửa idempotent 20/6 — DROP CONSTRAINT IF EXISTS trước ADD) |
| 3 | `docs/migrations/2026-06-16-gateway-transactions.sql` | Tạo bảng `gateway_transactions` (mPOS/Payoo) | ✅ |
| 4 | `docs/migrations/2026-06-18-audit-logs.sql` | Tạo bảng `audit_logs` (referral revoke + manual match log) | ✅ |
| 5 | `docs/migrations/2026-06-18-bank-transactions-discrepancy.sql` | Thêm cột `discrepancy_amount` NOT NULL DEFAULT 0 | ✅ có `ADD COLUMN IF NOT EXISTS` |
| 6 | `docs/migrations/2026-06-20-add-manual-matched-status.sql` | Thêm `manual_matched` vào CHECK constraint `match_status` — **BẮT BUỘC**, không có thì kế toán bấm Ghép tay sẽ HTTP 500 | ✅ DROP IF EXISTS |

**Cách kiểm tra trước khi chạy file 5**:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'bank_transactions' AND column_name = 'discrepancy_amount';
```
Nếu trả về 1 dòng → đã chạy rồi, **SKIP file 5**.

### 2.3 Sau mỗi file: reload PostgREST schema cache

```sql
NOTIFY pgrst, 'reload schema';
```

Nếu quên → API trả lỗi `column does not exist` dù đã có cột.

### 2.4 Verify migration thành công

```sql
-- Phải trả về 4 bảng
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('bank_transactions', 'gateway_transactions', 'audit_logs', 'payment_lines')
ORDER BY table_name;

-- Phải có cột discrepancy_amount với DEFAULT 0
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'bank_transactions'
  AND column_name IN ('discrepancy_amount', 'payment_line_id', 'match_status', 'sepay_id');
```

---

## 3. CODE DEPLOY — merge & push

### 3.1 Merge sandbox → main

```bash
# Đảm bảo đang ở local
git checkout main
git pull origin main
git merge --no-ff sandbox -m "Merge sandbox vào main: Sprint 1+2+3 — Referral + SePay + mPOS/Payoo"
```

**Có conflict?** STOP, ping Minh. Sandbox đã được merge main vào trước đó (commit `cce4397`) nên không nên conflict.

**Lưu ý hotfix 20/6**: commit `91ea780` (sandbox) và `25ed579` (main) cùng nội dung — merge sẽ tự skip 3 file đó. Nếu thấy git báo `Already up to date` hoặc skip — đó là expected, không phải lỗi.

### 3.2 Push main

```bash
git push origin main
```

### 3.3 Deploy BE (Render PROD)

Render KHÔNG có Auto-Deploy (tắt theo memory `render-deploy-hook.md`). Phải trigger tay:

```bash
bash scripts/deploy.sh prod
```

⚠️ Cần file `scripts/deploy-hooks.local` chứa `RENDER_DEPLOY_HOOK_PROD=...` (gitignored — Minh đã share riêng cho 3 anh em qua Zalo).

Theo dõi build trên Render dashboard → Service `palfish-gmv-api` → Events. Đợi đến khi status = `Live`.

### 3.4 Deploy FE (Vercel)

Vercel **TỰ DEPLOY** khi `main` push. Vào dashboard Vercel project `palfish-gmv-manager` → Deployments → đợi build xong.

⚠️ Vercel có thể KHÔNG auto-promote sang Production. Nếu thấy deployment ở trạng thái "Preview" → bấm **... → Promote to Production**.

---

## 4. POST-DEPLOY — đổi env + smoke test

### 4.1 Đổi env Render PROD (BẮT BUỘC)

Render Dashboard → service `palfish-gmv-api` (PROD, không phải sandbox) → **Environment** → cập nhật:

| Key | Giá trị mới | Lý do |
|-----|------------|-------|
| `USE_PAYOS` | `false` | **BẮT BUỘC explicit, không dựa default**. Gate 3 chỗ: endpoint sync-pending-payos, FE poll, startup confirm-webhook. Nếu unset → log startup sẽ ghi `[payos] confirm-webhook skipped (USE_PAYOS=false)` — đó là expected. |
| `SEPAY_WEBHOOK_SECRET` | (Minh share riêng — đã rotated 18/6) | Bảo mật webhook |
| `SEPAY_API_TOKEN` | (Minh share riêng) | Cron poll fallback |
| `SEPAY_ALLOWED_IPS` | (để trống tạm — fallback dev mode; sau khi SePay confirm IP whitelist thì điền) | Chống fake webhook |
| `GATEWAY_EXTENSION_INGEST_TOKEN` | (Minh share riêng) | Bảo mật endpoint extension đẩy GD |

Save → Render tự redeploy. Đợi `Live` lại.

### 4.2 Verify healthz

```bash
curl https://<render-prod-url>/healthz
```

Kỳ vọng: `{"status":"ok", "supabase_configured":true, "supabase_project_ref":"jozcvbbypwvzaefteoxn"}`.

Nếu `supabase_project_ref` = sandbox → env Supabase sai, phải sửa.

### 4.2.b Verify PayOS đã tắt (Render logs)

Render Dashboard → service `palfish-gmv-api` → **Logs** → tìm dòng:

```
[payos] confirm-webhook skipped (USE_PAYOS=false)
```

Phải thấy line này trong log startup (sau khi service `Live`). Nếu KHÔNG thấy → `USE_PAYOS` chưa set hoặc set sai value → quay lại 4.1 cập nhật.

**Lưu ý**: KHÔNG có endpoint `/sync-pending-payos`. Endpoint poll fallback của hệ thống là `/api/v1/sepay/sync-pending` (SePay, không phải PayOS). PayOS đã không còn sync chủ động — chỉ webhook bị động (nếu PayOS dashboard vẫn trỏ về và USE_PAYOS=true) hoặc không hoạt động (USE_PAYOS=false).

### 4.3 Cấu hình SePay webhook URL

SePay dashboard (Minh share account riêng) → **Webhook** → URL = `https://<render-prod-url>/webhook/sepay`.

Test bằng nút "Gửi webhook test" của SePay → kiểm tra log Render thấy entry mới.

### 4.4 Cập nhật extension Chrome

Extension `palfish-gateway-sync` đã có 3 anh em cài. **Cấu hình**:
- Mở Extension options (click icon → Settings)
- BE URL = `https://<render-prod-url>` (đổi từ sandbox URL)
- Token = `GATEWAY_EXTENSION_INGEST_TOKEN` vừa set ở 4.1
- Save → mở mpos.vn + portal.payoo.vn → bấm "Sync now" trong extension

### 4.5 Smoke test prod

Mở `https://palfish-gmv-manager.vercel.app/` (prod URL):

| Luồng | Bước | Kỳ vọng |
|-------|------|---------|
| Login | Đăng nhập tài khoản system | Vào được, sidebar đủ menu |
| PR | Tạo PR test 100k | QR sinh ra (không phải PayOS link) |
| SePay | Trigger webhook test từ SePay dashboard | Bảng "Chuyển khoản" → tab "CK ngoài chờ ghép" có dòng mới |
| mPOS | Bấm "Đồng bộ ngay" tab mPOS | Toast xanh "Đồng bộ xong: thêm N giao dịch" |
| Activator | Mở 1 AR → điền Order ID → tick cộng buổi | OK, audit log có entry |
| **Hotfix PayOS** | `curl -X POST https://<render-prod-url>/api/v1/payment-requests/sync-pending-payos -H "Authorization: Bearer <token>"` | 200 + `{"synced":[],"synced_count":0,"errors":[]}` — KHÔNG hit PayOS, KHÔNG log `payos fetch skipped` |
| **Startup log** | Render Events → Deploy live → expand log | Có dòng `[payos] confirm-webhook skipped (USE_PAYOS=false)`. KHÔNG có `-> 20 Webhook url invalid` |

### 4.6 Theo dõi 30 phút sau deploy

- Render logs (`palfish-gmv-api` → Logs): có lỗi nào lặp lại không?
- Supabase Dashboard → Logs → API: error rate có tăng đột biến?
- Sentry / observability nếu có cài

---

## 5. ROLLBACK PLAN — nếu prod chết

### 5.1 Triệu chứng cần rollback

- `/healthz` trả 500 hoặc `supabase_configured: false` sau 5 phút
- Người dùng báo lỗi "Cột không tồn tại" / "Tạo PR fail"
- Error rate Render logs > 10% trong 5 phút

### 5.2 Rollback BE (Render)

Render Dashboard → service `palfish-gmv-api` → **Deploys** → tìm deploy CŨ (trước hôm nay) → bấm **Redeploy**. ~3 phút BE về phiên bản cũ.

### 5.3 Rollback FE (Vercel)

Vercel Dashboard → project → **Deployments** → tìm deployment CŨ → **... → Promote to Production**.

### 5.4 Rollback DB (Supabase)

⚠️ **Không rollback migration vội**. DB schema có thể vẫn ổn — chỉ code chưa kịp dùng cột mới.

Nếu BUỘC PHẢI rollback:
- Vào **Database** → **Backups** → restore backup `pre-merge-2026-06-21` đã tạo ở bước 1.3.
- ⚠️ Mất hết dữ liệu PR/payment phát sinh sau backup point. Cân nhắc kỹ.

### 5.5 Ping Minh ngay

Bất kỳ trường hợp rollback nào → ping Minh qua Zalo. Đừng tự thử quá 30 phút.

---

## 6.1. PENDING PAYOS — 8 lần TT QR còn dở từ trước hotfix

Trên prod đang có **8 lần TT QR pending** bám PayOS từ 6 PR distinct, tạo từ 11/6-20/6 trước khi USE_PAYOS bị tắt. Tổng giá trị ~113M VND:

| PR-ID | Khách | Sale | Số tiền | Mã CK cũ |
|-------|-------|------|---------|----------|
| PR-2026-0043 | Anh Lâm | Le Hung Cuong | 8.880.000đ | FHD1Q |
| PR-2026-0043 | Anh Lâm | Le Hung Cuong | 9.080.000đ | FHD1P |
| PR-2026-0034 | Như Ý | Mai Thi Lien | 16.500.000đ | FHCCQ |
| PR-2026-0047 | Khánh Ly | Vu Ho Thanh Huong | 4.550.000đ | FHDCT |
| PR-2026-0042 | Chị Hương | Le Hung Cuong | 32.900.000đ | FHCYY (Minh huỷ xong 20/6) |
| PR-2026-0022 | chị Hương | Ta Thi Thu Phuong | 14.650.000đ | FHBFF |
| PR-2026-0022 | chị Hương | Ta Thi Thu Phuong | 17.650.000đ | FHBFD |
| PR-2026-0019 | Lê Yến | Kieu Lan Anh | 9.050.000đ | FHB71 |

**Anh Minh sẽ ping 5 Sale sáng 21/6** để họ tự thao tác trên app:
1. Mở PR → mở drawer → bấm "Huỷ" trên lần TT QR cũ
2. Bấm "Tạo lần thanh toán" → nhập lại số tiền + tên CK → app dựng QR mới (SePay path)
3. Gửi QR mới cho khách

**Quan hệ với deploy mai**:
- 8 lần TT này **KHÔNG cản trở deploy**. Endpoint sync đã gate USE_PAYOS → không gây OOM dù còn pending.
- **Sale có thể xử trước hoặc sau deploy đều OK**.
- Sau khi 8 lần TT clear hết → có thể chạy cleanup SQL `UPDATE payment_lines SET payos_order_code=NULL WHERE method='qr' AND status='pending';` (defer, không gấp).

---

## 6. GOTCHAS — bẫy thường gặp

| Vấn đề | Triệu chứng | Fix |
|--------|------------|-----|
| Render env chưa save khi redeploy | Code mới + env cũ → 503 | Render → Environment → **Save** → bấm **Manual Deploy** |
| PostgREST cache chưa reload | API trả "column does not exist" dù DB có cột | Chạy `NOTIFY pgrst, 'reload schema';` trong SQL Editor |
| Vercel deployment "Preview" thay vì "Production" | Domain prod vẫn trỏ deploy cũ | Vercel Deployments → **Promote to Production** |
| Extension Chrome vẫn dùng URL sandbox | mPOS/Payoo sync không thấy data | Options extension → đổi BE URL → reload tab mpos.vn |
| SePay webhook IP whitelist chặn | Webhook log Render trả 403 | Tạm để `SEPAY_ALLOWED_IPS=` (trống — dev mode) cho đến khi SePay confirm IP list |
| PayOS vẫn sinh QR PayOS dù `USE_PAYOS=false` | Render env chưa save / chưa redeploy | Save lại env, Manual Deploy. Verify `/healthz` → `payos_configured` |
| Test fail trên CI sau merge | CI dùng version Python khác | CI yêu cầu Python 3.14 + pandas. Sandbox đang test trên cả 3.11 & 3.14. |
| `test_payos_transfer` fail | Test cũ assert limit 25, code đã đổi 40 | Đã fix trong commit `0c88151`. Nếu CI vẫn fail → check branch CI đang test có commit này không |

---

## 7. NHỮNG GÌ ĐÃ THAY ĐỔI — tóm tắt thay đổi sandbox vs main

### Backend
- **SePay webhook** (`sepay_routes.py`): nhận webhook biến động số dư, tự khớp `transfer_code` → payment_line. HMAC verification + IP whitelist + anti-replay.
- **mPOS/Payoo parser** (`mpos_import.py`, `gateway_routes.py`): xử lý CSV settlement, JSON OrderList Payoo, contra-entry cho GD Đảo.
- **Referral credit** (`activation_routes.py`): endpoint `PATCH /credit-referral`, chặn cộng khi chưa có Order ID, revoke yêu cầu lý do.
- **PayOS gate** (`payment_request_routes.py`): bọc tất cả call PayOS sau check `os.getenv("USE_PAYOS") == "true"`.
- **VietQR fallback** khi USE_PAYOS=false: tự sinh QR qua `img.vietqr.io`, mã `transfer_code` Base36 5 ký tự.

### Frontend
- **Tab Đối soát** chia 3: Chuyển khoản / mPOS / Payoo (sidebar dropdown).
- **CK ngoài chờ ghép** tab nội bộ trong Chuyển khoản — kế toán ghép tay GD lệch tiền.
- **Referral form** trong drawer PR + section "Cộng buổi giới thiệu" trong drawer AR.
- **Nút "Đồng bộ ngay" + "Hướng dẫn đồng bộ"** trong 2 tab mPOS/Payoo (cập nhật theo feedback 20/6 sáng nay).

### Database (migration)
- 5 file SQL liệt kê ở mục 2.2.
- Bảng mới: `bank_transactions`, `gateway_transactions`, `audit_logs`.
- Cột mới: `payment_requests.lead_source`, `payment_requests.lead_channel`, `bank_transactions.discrepancy_amount`.

### Test coverage
- BE: 242 test (61 mới: referral 10 + SePay 14 + mPOS/Payoo 37)
- FE: 170 test (17 mới: contract referral 5 + recon 12)
- E2E Playwright: 10 spec mới (5 referral + 5 recon)

### Files thay đổi
- 68 files
- +10,297 dòng
- -146 dòng

---

## 8. CONTACT & ESCALATION

| Tình huống | Ping ai | Channel |
|-----------|---------|---------|
| Migration lỗi, Supabase prod down | Minh | Zalo (urgent) |
| Render build fail | Minh / Đạt | Zalo |
| Vercel deploy fail | Đức | Zalo |
| SePay không bắn webhook | Minh (kiểm tra SePay dashboard) | Zalo |
| Extension không sync | Đức (chủ extension) | Zalo |
| Anh Hiếu hỏi | Minh trả lời | Zalo group |

---

## 9. SAU KHI DEPLOY XONG

- [ ] Update memory: `pending-migration-prod-discrepancy.md` → mark resolved
- [ ] Update `docs/PROJECT.md` mục "Tiến độ" — đánh dấu Sprint 1+2+3 done
- [ ] Tag release: `git tag v3.0-sprint3 && git push origin v3.0-sprint3`
- [ ] Ping anh Hiếu trên Zalo: "Deploy xong, đã smoke test. Anh xác nhận UAT prod được không?"
- [ ] Theo dõi prod 24h đầu, có gì lạ ping Minh ngay

---

## 10. CHECKLIST TỔNG (in ra/check khi làm)

```
[ ] 1.1 BE test 242 pass
[ ] 1.1 FE tsc -b clean
[ ] 1.1 FE test 170 pass
[ ] 1.2 Smoke test 5 luồng trên sandbox
[ ] 1.3 Backup Supabase prod
[ ] 2.2 Chạy 5 file SQL (skip file 5 nếu đã có cột)
[ ] 2.3 NOTIFY pgrst reload schema
[ ] 2.4 Verify bảng + cột tồn tại
[ ] 3.1 Merge sandbox→main không conflict
[ ] 3.2 Push main
[ ] 3.3 bash scripts/deploy.sh prod — Render Live
[ ] 3.4 Vercel build xong + Promote to Production
[ ] 4.1 Render PROD env: USE_PAYOS=false + SEPAY_* + GATEWAY_*
[ ] 4.2 /healthz OK + supabase_project_ref = jozcvbbypwvzaefteoxn
[ ] 4.3 SePay webhook URL trỏ prod
[ ] 4.4 Extension Chrome đổi BE URL + token
[ ] 4.5 Smoke test 5 luồng trên prod
[ ] 4.5 Hotfix verify: POST /sync-pending-payos → empty result
[ ] 4.5 Startup log có "confirm-webhook skipped (USE_PAYOS=false)"
[ ] 4.6 Theo dõi 30 phút logs (đặc biệt: KHÔNG còn "payos fetch skipped" + "Ran out of memory")
[ ] 9 Tag release + update PROJECT.md + ping anh Hiếu
```

---

**Last updated**: 2026-06-20 22:30 (Minh, sau hotfix payos OOM 20/6 22:00)
**Branch source**: `sandbox` (commit cuối: `91ea780` hotfix payos gate USE_PAYOS)
**Target**: `main` → prod deploy (main đã có cherry-pick `25ed579` hotfix)

---

## 11. CODE REVIEW FINDINGS (20/6, đã FIX trước handoff)

Trước khi viết handoff, code-reviewer subagent đã review toàn bộ 50 commit sandbox vs main. Tìm thấy 4 critical:

| # | Vấn đề | Đã fix |
|---|--------|--------|
| **C1** | CHECK constraint `bank_transactions.match_status` thiếu `manual_matched` → kế toán bấm Ghép tay sẽ HTTP 500 | ✅ Migration #6 `2026-06-20-add-manual-matched-status.sql` |
| **C2** | `payment_lines.status='paid'` mark TRƯỚC khi INSERT `bank_transactions` → race condition có thể leave payment_line=paid mà không có bank record | ✅ `sepay_routes.py` đảo thứ tự: INSERT trước, chỉ mark paid khi `is_new=True` |
| **C3** | PayOS webhook không gate USE_PAYOS | ✅/⚠️ **Partial fix bằng hotfix 20/6** — endpoint `/sync-pending-payos` đã gate USE_PAYOS, startup `confirm-webhook` đã gate USE_PAYOS. Webhook handler `POST /webhook/payos` vẫn nhận request (signature verify chặn payload giả nhưng vẫn tốn CPU parse). Defer fix toàn bộ sau khi PayOS hoàn toàn vô hiệu hoá. **Phải đảm bảo `PAYOS_CHECKSUM_KEY` STILL SET trên prod env**. |
| **C4** | HMAC verify silently skip khi `SEPAY_WEBHOOK_SECRET` empty | ✅ `sepay_routes.py` thêm guard: APP_ENV=production + empty secret → 503 |

Đã thêm 1 test mới: `test_production_chan_khi_secret_empty` (243 tests pass).

Các finding "Important" còn lại (I1 race lock, I2 mPOS không mark paid, I3 ADD CONSTRAINT non-idempotent, I4 X-Forwarded-For bypass) — **không fix trong scope tonight**, ghi nhận và fix sau khi deploy ổn:
- **I1**: 2 manager đồng thời tick credit-referral → last-writer-wins. Probability thấp (manager team nhỏ), fix sau bằng Postgres advisory lock.
- **I2**: `match_gateway_txn` không update `payment_lines.status='paid'`. Cần xác nhận với anh Hiếu: mPOS/Payoo có cần auto-close PR không hay chỉ là ledger reconciliation. Hỏi anh Hiếu trước khi fix.
- **I3**: File `2026-06-16-fix-sepay-unique-constraint.sql` không idempotent. Sandbox đã chạy thành công nên prod chạy LẦN ĐẦU sẽ OK. **Đặt biết để KHÔNG chạy lại** file này.
- **I4**: X-Forwarded-For bypass khi `SEPAY_ALLOWED_IPS` empty. Hiện env này empty → IP check skip — tạm chấp nhận, fix khi SePay confirm IP list chính thức.
