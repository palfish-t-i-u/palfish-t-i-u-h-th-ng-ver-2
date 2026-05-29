# KẾ HOẠCH CÔNG VIỆC — 28/05/2026 (v3)

> Nguồn: Feedback anh Hiếu — checklist sau đợt fix 27/05
> Cập nhật: 29/05/2026 — v3 (tiến độ theo commit thực tế + audit phân quyền + chi tiết Task 5)

---

## BẢNG KẾ HOẠCH CHI TIẾT

| # | Việc cần làm | Vấn đề (non-tech) | Cách xử lý cụ thể (tech) | BE/FE | Ưu tiên | Tiến độ |
|---|---|---|---|---|---|---|
| **1** | **Kiểm tra quyền xem & sử dụng theo cấp độ** | Sale chỉ thấy PR của mình, Leader thấy team mình, Manager thấy toàn sales, System thấy all | **BE (xong):** `e8bc2bf` — `payment_request_routes.py` đã wire `resolve_actor()` + `visible_creator_emails()` cho list/patch/cancel/create/create-line; `create` tự set `sale_email`; schema patch `sale_email` + index. **FE (xong):** `MainPage.tsx` ẩn tab Đối soát/Kích hoạt/Xuất HĐ với sale/leader. **Còn:** RBAC cho `activation_routes` + reconciliation; xem lại cấp Ops & Manager (mục AUDIT) | BE + FE | **P0** | **~80%** |
| **2** | **Kết nối PayOS HCM** | Chỉ nhân sự HCM mới được chọn Bank HCM | **FE (xong):** `bank.ts` thêm VCB HCM + `getAvailableBanks(team)`; drawer lọc dropdown theo team. **BE (BLOCK):** PayOS **chưa hỗ trợ Vietcombank** → không tạo được payment-link động cho VCB. **Hướng đi:** bank VCB HCM dùng **VietQR tĩnh** (không qua PayOS); đối soát biến động số dư chuyển sang **Casso (Task 8)** | BE + FE | **P0→hold** | **~30%** |
| **3** | **Cập nhật dữ liệu thực tế + xoá dữ liệu test** | Data test lẫn data thật gây nhầm lẫn | **Xoá test (xong):** `ab7aa27`+`ba858cf`+`80d881a` — script `cleanup_task3_uat_data.py` (dry-run + `--apply` + backup JSON), đã xoá 36 PR / 72 line / 36 AR / 9 đơn / 3 GD; có rollback SQL + seed UAT. **Còn:** **chờ file Excel data thật từ anh Hiếu** → viết importer, importer **phải set `sale_email`** cho từng dòng | BE + DB | **P0** | **~70%** (chờ Excel) |
| **4** | **Tạo môi trường Sandbox** | Cần sandbox tách production để dev an toàn | **Code/config xong (Giang `01c9dc4`):** `env_utils.py` (`APP_ENV`/`is_sandbox_env`), `/healthz` báo env, **PayOS confirm-webhook + DingTalk tự tắt trong sandbox** (cách ly an toàn), `.env.sandbox.example` BE+FE, `seed_sandbox_data.py` idempotent (dry-run + `--apply`, seed nhân sự sale/leader/system + PR/line/AR/KPI). **FE (Minh):** banner ⚠️ SANDBOX (đã sửa đọc `VITE_APP_ENV=sandbox`) + script `dev:sandbox`. **Còn (Infra, cần người có quyền):** tạo Supabase sandbox project + migrate schema, thêm service `render.yaml`, deploy Vercel branch `sandbox`, điền secrets thật, chạy seed `--apply` | BE + FE + Infra | **P0** | **~55%** |
| **5** | **Chỉnh UI/UX — redesign tab Kích hoạt khoá học** | Giao diện Kích hoạt khoá học hiện rời rạc, kém trực quan cho sale | **FE only — KHÔNG đổi logic & nút bấm, chỉ sửa giao diện.** Theo mẫu "C · Pulse" (file `Kich hoat khoa hoc - Redesign _standalone_.html` + ảnh): xem mục **CHI TIẾT TASK 5** bên dưới. File: `ActivationTab.tsx` + AR mini-card trong `PaymentRequestDetailDrawer.tsx` | FE only | **P1** | **0% (mới nhận spec)** |
| **6** | **Module thống kê sale / leader / hệ thống** | Sale xem hiệu suất cá nhân, Leader xem team, System xem tổng | Chờ wireframe anh Hiếu. BE thêm `/dashboard/sale-stats`, `/dashboard/team-stats`; FE `SalesDashboardTab.tsx` — KPI cards + recharts. Filter theo role tái dùng `visible_creator_emails` (Task 1) | BE + FE | **P2** | **0% (chờ wireframe)** |
| **7** | **Cải thiện tốc độ load trang** | Load lần đầu rất lâu (~30-50s) | Xem **AUDIT TỐC ĐỘ**. Nguyên nhân chính: Render free tier cold start. Fix nhanh: keep-alive cron (UptimeRobot). Phụ: uvicorn `--workers 2`, FE lazy-load, `staleTime` cho React Query | BE + FE + Infra | **P1** | **0%** |
| **8** | **Kết nối Casso Flow — biến động số dư** | PayOS chỉ thấy giao dịch qua QR của nó; cần Casso xem mọi dòng tiền (CK tay, ATM…) + thay PayOS cho bank VCB | **BE:** đăng ký Casso → `casso_routes.py` proxy `/v2/transactions` + webhook `/webhook/casso`. **FE:** tab "Biến động số dư". Đối soát: match `transfer_code` ↔ `description` Casso. **Liên quan Task 2** (bank VCB HCM dựa vào Casso để đối soát) | BE + FE | **P2** | **0% (đang nghiên cứu)** |
| **9** | **Fix: tạo gói học vượt tiền thực nhận + không xuất được HĐ khi chưa có Order ID** | (a) Sale tạo gói học tổng tiền > số tiền thực nhận → sai nghiệp vụ. (b) Kích hoạt & xuất HĐ là 2 việc độc lập (chỉ dùng chung thông tin), không nên chặn xuất HĐ khi thiếu Order ID | **FE — xem CHI TIẾT TASK 9.** (a) `ActivationTab.tsx`: validate tổng `amount` gói ≤ `pr.received` khi lưu/thêm + **progress bar tiền thực nhận vs đã dùng**. (b) Bỏ gate `disabled={!course.orderId?.trim()}` tại `ActivationTab.tsx:1208` để nút Xuất HĐ luôn bấm được. BE invoice **không** yêu cầu Order ID (đã xác nhận) | FE only | **TOP 3 — P0** | **0%** |

---

## AUDIT HỆ THỐNG PHÂN QUYỀN (hiện trạng)

Nguồn: `backend/rbac.py`, `frontend/src/lib/roles.ts`.

### Cấp bậc role (khớp với mô tả của anh)
```
sale (1)  →  leader (2)  →  manager (3)  →  system (4)
```
- **`ROLE_RANK = {"sale":1, "leader":2, "manager":3, "system":4}`** (rbac.py:12) — đúng như trí nhớ.
- Phạm vi xem (`visible_creator_emails`, rbac.py:164):
  - `sale` → chỉ email của mình
  - `leader` → lọc theo `team` **+** `sub_team` (đúng cho leader quản lý 1 nhóm 5-15 sale = 1 sub_team)
  - `manager` → lọc theo `team`
  - `system` → thấy tất cả

### ⚠️ 2 điểm cần anh xác nhận / cân nhắc sửa

**1. Ops (Thu Hiền) hiện được nâng lên = System (rank 4).**
`_normalize_role()` (rbac.py:24) map `"ops" → "system"`. Hệ quả: Ops được:
- `canConfirmPayment = True` ✅ (đúng — Thu Hiền cần tick xác nhận tiền)
- `canAccessAdmin = True`, **`canManageStaff = True`** ⚠️ (Thu Hiền có quyền quản lý nhân sự + tài khoản Auth — **có thể quá cao**)
- Xem **toàn bộ** PR (đúng cho nghiệp vụ đối soát)

→ **Đề xuất:** nếu Ops không nên quản lý nhân sự, tách `ops` thành rank riêng (vd rank 3.5) chỉ có `canConfirmPayment` + xem-all, bỏ `canManageStaff`.

**2. Manager hiện chỉ thấy 1 `team`, không phải "toàn bộ team sales".**
Anh mô tả *"Sales Manager quản lý toàn bộ team sales"*, nhưng code lọc manager theo đúng 1 giá trị `team` (rbac.py:182-186). Nếu có nhiều team (Inhouse 1, Inhouse 2, HCM, Store…), manager chỉ thấy team của chính mình.
→ **Đề xuất:** nếu manager = quản lý tất cả → cho manager `return None` (như system) cho phần xem, hoặc định nghĩa rõ manager quản lý những team nào.

### ✅ Quyết định 29/05: dùng mô hình 3 cấp (theo task gốc anh Hiếu)
```
Sale → Sale Leader → System    (ẩn Manager)
```
- **KHÔNG cần viết lại BE.** `visible_creator_emails()` đã xử lý đúng cả 3 cấp:
  - `sale` → chỉ đơn của mình ✅
  - `leader` → đơn của cả team (`team` + `sub_team`) ✅
  - `system` → tất cả ✅
- **Ẩn Manager:** chỉ cần **không gán role `manager`** cho ai + bỏ option `manager` trong dropdown role ở màn Nhân sự Sale (FE). Code rank vẫn giữ, không xoá — an toàn.
- **Cơ chế gán role (đúng như anh nhớ):**
  1. Sale đăng ký lần đầu → nhập **tên CRM** → BE ghép email vào dòng có sẵn trong `nhan_su_sale` bằng `crm_name` (`admin_routes.py:140-160`).
  2. Role lấy từ chính dòng đó (`resolve_actor` đọc `staff.role` mỗi request).
  3. **Đổi `role` trong danh sách Nhân sự Sale → quyền đổi theo ngay** (lần refresh/đăng nhập kế tiếp). Sửa qua `PATCH /admin/sales/{crm_name}` (chỉ System được sửa).
- **Việc cần làm cho Task 1 (gọn lại):** chỉ còn (1) ẩn option Manager ở FE; (2) cân nhắc hạ quyền Ops (bỏ `canManageStaff`); (3) thêm RBAC cho `activation_routes` nếu muốn chặt chẽ (FE đã ẩn tab nên ưu tiên thấp).

---

## CHI TIẾT TASK 9 — Fix 2 lỗi nghiệp vụ (TOP 3)

### Lỗi A — Tạo gói học vượt quá số tiền thực nhận
**Hiện trạng:** `ActivationTab.tsx` chỉ **hiển thị cảnh báo** "Thiếu/Dư" (dòng 828-846) và tính `remaining = pr.target − total` (dòng 596, 620) — dùng `target` (dự kiến) chứ không phải `received` (thực nhận), và **không chặn** việc tạo vượt.

**Cần sửa (FE):**
1. **Chặn theo `received`, không phải `target`:** tổng `amount` các gói học (`total`) **không được vượt `pr.received`**. Khi sale thêm gói / sửa số tiền làm `total > pr.received` → chặn lưu + báo lỗi rõ ("Vượt quá tiền thực nhận, còn lại được tạo: X đ").
2. **Progress bar tiền** (như mẫu Pulse): hiển thị
   - Đã nhận: `pr.received`
   - Đã dùng tạo gói: `total`
   - Còn lại: `pr.received − total`
   - Thanh tiến độ `total / pr.received` (đỏ nếu vượt).
3. Mặc định số tiền gói mới = `Math.max(0, pr.received − total)` (sửa dòng 596/620 từ `target` → `received`).

**File:** `frontend/src/components/ActivationTab.tsx` (logic số tiền dòng ~523-630; summary dòng ~820-846).

### Lỗi B — Không xuất được HĐ khi chưa có Order ID
**Hiện trạng:** nút Xuất HĐ trong drawer Kích hoạt bị khoá khi thiếu Order ID:
```tsx
// ActivationTab.tsx:1208
disabled={!course.orderId?.trim()}
title={course.orderId ? "Yêu cầu xuất hoá đơn" : "Cần điền Order ID trước"}
```
**Bản chất:** Kích hoạt và Xuất HĐ là 2 nghiệp vụ **độc lập** — chỉ dùng chung thông tin KH để ra 2 đầu ra khác nhau. Order ID không phải điều kiện tiên quyết của xuất HĐ.

**Cần sửa (FE):**
- Bỏ điều kiện `!course.orderId?.trim()` ở `disabled` (dòng 1208) — nút luôn bấm được (vẫn giữ điều kiện thông tin KH đủ name/phone/address nếu cần, theo `isRowComplete` ở `InvoiceRequestTab.tsx:54`).
- Order ID có thể điền sau, không chặn luồng xuất HĐ.
- **BE đã OK:** `invoice_routes.py` chỉ yêu cầu role Ops/System, **không** check Order ID → không cần sửa BE.

---

## CHI TIẾT TASK 5 — Redesign tab "Kích hoạt khoá học"

> **Nguyên tắc:** KHÔNG đổi logic, KHÔNG thêm/bớt nút bấm. Chỉ thay giao diện (layout + style). Mẫu = biến thể **"C · Pulse"** (file HTML đính kèm + ảnh 3).

### So sánh Bản hiện tại → Bản mong muốn

| Thành phần | Hiện tại (ảnh 2) | Mong muốn (ảnh 3 — "Pulse") |
|---|---|---|
| Header | Title + mã AR + badge trạng thái + nút sửa/✓/✗ phẳng | Giữ nguyên các nút, bo tròn icon-button gọn hơn (✏️ / ✓ xanh / ✗ đỏ) |
| Thanh tiến độ | Không có | **Card xanh nhạt: "X/Y gói đã kích hoạt" + progress bar + TỔNG TIỀN** (badge cam bên phải) |
| Khách hàng | Tên + input phẳng | **Avatar tròn (chữ cái đầu) + tên đậm + SĐT có cờ 🇻🇳 +84** |
| Dòng gói học | Input + số tiền + badge "Đã kích hoạt" | **Card có viền trái xanh accent + số tiền cam + toggle switch "Đã kích hoạt"** (thay badge tĩnh) |
| Course code | Text xám nhỏ | Giữ, đặt dưới tên gói |
| Ghi chú cuối | Giữ nguyên text | Giữ nguyên |

### Các thay đổi giao diện cụ thể (CSS/markup, không động logic)
1. **Thanh tiến độ tổng** (mới): tính từ state sẵn có (`doneCount`/`totalCount`, `received`) — chỉ render UI, không thêm API.
2. **Avatar tròn**: lấy chữ cái đầu tên KH (vd "TE"), nền tím nhạt.
3. **Toggle switch**: thay badge "Đã kích hoạt" tĩnh bằng switch — **giữ nguyên handler bật/tắt cũ**, chỉ đổi hình thức hiển thị.
4. **Viền trái accent xanh** cho card gói đã kích hoạt.
5. **Badge tiền** màu cam, font đậm, canh phải.
6. Spacing/bo góc/màu nền theo "Pulse" (xanh-trắng, nhiều khoảng trắng).

### File ảnh hưởng
- `frontend/src/components/ActivationTab.tsx` (tab standalone)
- `frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx` → `ActiveRequestMiniCardV2` (card AR mini trong drawer — cùng style)
- CSS: `frontend/src/styles/prototype-payments.css` (hoặc thêm class mới)

---

## AUDIT TỐC ĐỘ LOAD TRANG (Task 7)

### Nguyên nhân 1: Render Free Tier Cold Start (chính)
- `render.yaml`: `plan: free` → spin down sau 15 phút không request; cold start 30-50s.

| Option | Chi phí | Hiệu quả |
|---|---|---|
| **A. Render Starter** | $7/tháng | Không spin down, cold start ~0s |
| **B. Keep-alive cron** | $0 | Ping `GET /healthz` mỗi 10-14 phút (UptimeRobot/cron-job.org) |
| **C. Vercel Functions** | $0 | Serverless cold start 1-3s nhưng phải refactor BE |

> Khuyến nghị: B ngay (0 cost) + A khi có budget.

### Nguyên nhân 2: BE single worker
`Dockerfile`: `uvicorn main:app` → 1 worker. Fix: thêm `--workers 2`.

### Nguyên nhân 3: FE bundle lớn
`xlsx`(~1.2MB) + `recharts`(~400KB) + `jszip` load ngay trang chủ. Fix: lazy-load tab nặng trong `MainPage.tsx` (một phần đã lazy-load — kiểm tra mở rộng).

### Nguyên nhân 4: API không cache
Set `staleTime: 5*60*1000` cho `useQuery` data ít đổi.

---

## THỨ TỰ THỰC HIỆN (cập nhật)

```
TOP 3 — LÀM TRƯỚC
├── Task 9 — Fix tạo gói vượt tiền + xuất HĐ ko cần Order ID  [FE ~2-3h]
├── Task 5 — Redesign Kích hoạt khoá học                       [FE ~2-4h]
└── (Task 1 finalize: ẩn Manager + hạ quyền Ops)               [FE ~30m]

ĐANG LÀM / VỪA XONG
├── Task 1 — Phân quyền        [BE xong | FE xong] → chốt mô hình 3 cấp, ẩn Manager
├── Task 2 — Bank HCM          [FE xong | BE hold vì PayOS ko hỗ trợ VCB → Casso]
└── Task 3 — Xoá test data     [xong] → chờ Excel thật từ anh Hiếu để import

TIẾP THEO — P1
└── Task 7 — Tốc độ (keep-alive)          [Infra ~30m]

P0 hạ tầng còn nợ
└── Task 4 — Sandbox: code xong (Giang), CHỜ provisioning infra [Infra ~1-2h]
    ├─ Supabase sandbox project + migrate schema
    ├─ Render service sandbox (thêm vào render.yaml)
    ├─ Vercel deploy branch sandbox + điền env
    └─ chạy seed_sandbox_data.py --apply

P2 — chờ input
├── Task 6 — Module thống kê   ← chờ wireframe
└── Task 8 — Casso Flow        ← đang nghiên cứu (liên quan Task 2)
```

---

## GHI CHÚ

- **Task 1 — backfill `sale_email`:** **KHÔNG cần** backfill data hiện tại vì toàn bộ PR/AR/giao dịch/HĐ trên app đang là **admin tạo để test UAT** (đã/đang xoá ở Task 3). Khi vận hành thật: (a) PR mới do sale tạo tự set `sale_email` (đã có ở `create` endpoint ✅); (b) **khi import Excel data thật (Task 3) thì importer bắt buộc map `sale_email` đúng cho từng dòng** — nếu không, sale sẽ không thấy đơn lịch sử của mình.
- **Task 2:** PayOS không hỗ trợ Vietcombank → bank VCB HCM dùng VietQR tĩnh; đối soát qua Casso (Task 8). FE đã sẵn sàng, chỉ chờ hướng BE.
- **Task 3:** chờ **file Excel data mới nhất từ anh Hiếu**. Backup DB bắt buộc trước mọi thao tác xoá/ghi đè.
- **Task 4:** cân nhắc Supabase Branching (beta) thay vì tạo project mới. **Convention env đã thống nhất = `APP_ENV`/`VITE_APP_ENV=sandbox`** (theo Giang); banner FE đã sửa khớp. Cần align file `frontend/.env.sandbox` (Minh tạo trước) với key trong `.env.sandbox.example` của Giang (thêm `VITE_APP_ENV=sandbox`). Phần còn lại của Task 4 là **provisioning hạ tầng** — cần người có quyền Supabase/Render/Vercel (Giang hoặc anh), không phải việc code.
- **Task 7:** UptimeRobot miễn phí ping `/healthz` mỗi 10 phút = fix cold start ngay.
- **Commit message lệch:** `61c7196` ghi "remove deprecated database integration service" nhưng thực ra xoá 2 file SQL UAT — nhắc team đặt message đúng.
