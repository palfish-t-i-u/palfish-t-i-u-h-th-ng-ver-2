# KẾ HOẠCH CÔNG VIỆC — 28/05/2026 (v2)

> Nguồn: Feedback anh Hiếu — checklist mới sau đợt fix 27/05
> Cập nhật: 28/05/2026 — v2 (thêm Task 7, 8)

---

## BẢNG KẾ HOẠCH CHI TIẾT

| # | Việc cần làm | Vấn đề (non-tech) | Cách xử lý cụ thể (tech) | BE/FE | Ưu tiên |
|---|---|---|---|---|---|
| **1** | **Kiểm tra quyền xem & sử dụng theo cấp độ** | Sale chỉ thấy PR của mình, Sale Leader thấy team mình, System thấy all — endpoint `GET /payment-requests` hiện trả về toàn bộ, không filter theo role | **BE:** `payment_request_routes.py:955` — thêm `Authorization` header, gọi `resolve_actor()` rồi `visible_creator_emails()` (rbac.py:164, đã viết sẵn) để filter `query.in_("sale_email", allowed_emails)`. Áp dụng tương tự cho PATCH/DELETE/cancel. **FE:** `MainPage.tsx` — ẩn tab Đối soát, Kích hoạt, Xuất HĐ với role `sale`/`leader`; chỉ show Quản lý thanh toán + Thông tin cá nhân. Dùng `useMe().role` | BE + FE | **P0** |
| **2** | **Kết nối PayOS HCM** | Chỉ nhân sự HCM mới được chọn Bank HCM khi tạo phiếu thanh toán | **BE:** Thêm env `PAYOS_HCM_*` (3 key). `payos_qr.py` — hàm `create_payos_payment_link()` nhận thêm param `bank_alias`, chọn credentials HN/HCM tương ứng. **FE:** `bank.ts` — bỏ comment HCM, điền info bank mới. `CreatePaymentRequestModal` + `PaymentRequestDetailDrawer` — dropdown Bank filter theo `actor.staff.team`: nếu team chứa "HCM" → show cả 2; HN/Store → chỉ HN. `buildVietQrUrl()` nhận thêm `bankAccount` param | BE + FE | **P0** |
| **3** | **Cập nhật dữ liệu thực tế + xoá dữ liệu test** | Dữ liệu test lẫn với thật, gây nhầm lẫn cho sale khi sử dụng | **DB:** Backup → SQL xác định test data (tên "test"/"thử"/"demo", amount 1000/2000, dev emails) → soft-delete `SET deleted_at = now()`. **BE:** Thêm `.is_("deleted_at", "null")` vào mọi query select. **FE:** Đảm bảo mock files chỉ load khi `IS_DEV_MODE`. Kiểm tra `nhan_su_sale` đầy đủ email + role + leader_email | BE + FE | **P0** |
| **4** | **Tạo môi trường Sandbox** | Cần sandbox riêng để dev/test tính năng mới không ảnh hưởng production | **Supabase:** Tạo project `palfish-gmv-sandbox`, clone schema `pg_dump --schema-only`. **BE:** `.env.sandbox` + service Render riêng `palfish-gmv-be-sandbox`. **FE:** `.env.sandbox` + script `dev:sandbox` + Vercel branch `sandbox` auto-preview. Git workflow: `feature → sandbox → test → main` | BE + FE + Infra | **P0** |
| **5** | **Chỉnh UI/UX** | Một số điểm giao diện chưa thân thiện với sale — chờ screenshot cụ thể | Chờ anh Hiếu gửi chi tiết. Dự kiến: responsive, font, color coding trạng thái PR, sort/filter UX. File chính: `PaymentRequestTable.tsx`, `PaymentRequestDetailDrawer.tsx`, `AppShell.tsx` | FE only | **P1 — Chờ input** |
| **6** | **Module thống kê sale / leader / hệ thống** | Sale cần xem hiệu suất cá nhân, Leader xem team, System xem tổng | Chờ wireframe. Dự kiến: BE thêm `/dashboard/sale-stats`, `/dashboard/team-stats`. FE tạo `SalesDashboardTab.tsx` — KPI cards + recharts. Filter data tự động theo role (tái dùng logic từ Task 1) | BE + FE | **P2 — Chờ wireframe** |
| **7** | **Cải thiện tốc độ load trang** | Thời gian load đầu tiên rất lâu (~30-50s), UX kém cho sale | Xem phần **AUDIT TỐC ĐỘ** bên dưới. Nguyên nhân chính: **(1) Render free tier** cold start 30-50s, **(2) BE single-worker uvicorn** không concurrency, **(3) FE không code-split** — toàn bộ recharts+xlsx+jszip load cùng lúc. Giải pháp: nâng Render lên Starter ($7/tháng) hoặc keep-alive cron; thêm `--workers 2` trong Dockerfile; FE lazy-load tabs nặng | BE + FE + Infra | **P1** |
| **8** | **Kết nối Casso Flow — biến động số dư** | PayOS chỉ track giao dịch qua QR nó tạo; cần Casso để xem tất cả dòng tiền vào/ra tài khoản (chuyển khoản tay, ATM, v.v.) | **BE:** Đăng ký Casso business → lấy API key. Tạo `casso_routes.py`: endpoint `/casso/transactions` — proxy Casso API `GET /v2/transactions`. Webhook `/webhook/casso` nhận push real-time. **FE:** Thêm tab "Biến động số dư" trong ReconciliationTab hoặc tab riêng — hiển thị table giao dịch ngân hàng real-time. Đối soát tự động: match `payment_lines.transfer_code` với `description` từ Casso | BE + FE | **P2** |

---

## AUDIT TỐC ĐỘ LOAD TRANG (Task 7)

### Nguyên nhân 1: Render Free Tier Cold Start (chính)
- **`render.yaml` dòng 8: `plan: free`** — Render free tier tự spin down service sau 15 phút không có request
- Cold start mất **30-50 giây** để pull Docker image + khởi động Python + uvicorn
- Đây là nguyên nhân **số 1** khiến trang load lâu lần đầu

**Giải pháp:**
| Option | Chi phí | Hiệu quả |
|---|---|---|
| **A. Nâng Render Starter** | $7/tháng | Không spin down, cold start ~0s |
| **B. Keep-alive cron** | $0 | Gửi `GET /healthz` mỗi 10-14 phút bằng cron-job.org hoặc UptimeRobot — giữ service luôn warm |
| **C. Chuyển Vercel Functions** | $0 (Hobby) | Serverless, cold start ~1-3s (nhanh hơn Docker) nhưng cần refactor BE |

> **Khuyến nghị:** Option B ngay lập tức (0 cost) + Option A khi có budget

### Nguyên nhân 2: BE Single Worker
- **`Dockerfile` dòng 16:** `uvicorn main:app` — chỉ 1 worker, 1 request tại một thời điểm
- Nếu nhiều sale truy cập đồng thời, các request xếp hàng chờ

**Giải pháp:** Sửa `Dockerfile`:
```dockerfile
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
```

### Nguyên nhân 3: FE Bundle Size
- **`xlsx` (~1.2MB)**, **`recharts` (~400KB)**, **`jszip` (~100KB)** — tất cả load ngay trang chủ
- `vite.config.ts` không có code splitting config
- Sale chỉ dùng tab Quản lý thanh toán nhưng phải tải cả module báo cáo

**Giải pháp:** Lazy-load các tab nặng trong `MainPage.tsx`:
```tsx
const ReportsHub = React.lazy(() => import('./ReportsHub'));
const SoDoanhThuTab = React.lazy(() => import('./SoDoanhThuTab'));
// ... wrap trong <Suspense>
```

### Nguyên nhân 4: API Calls Không Cache
- `api.ts` dòng 33: `timeout: 60000` — 60s timeout nhưng không cache
- Mỗi lần chuyển tab lại gọi lại API từ đầu

**Giải pháp:** TanStack Query đã có — kiểm tra `staleTime` trong các `useQuery` calls, set `staleTime: 5 * 60 * 1000` cho data ít thay đổi.

---

## THỨ TỰ THỰC HIỆN

```
BUỔI SÁNG — P0 (song song)
├── Task 1 — Phân quyền              [BE: ~2h] [FE: ~1h]
├── Task 2 — PayOS HCM               [BE: ~2h] [FE: ~1h]
├── Task 3 — Cleanup test data       [BE+DB: ~1h]
└── Task 4 — Sandbox env             [Infra: ~2h]

BUỔI CHIỀU — P1
├── Task 7 — Tốc độ (keep-alive)     [Infra: ~30m] [FE lazy-load: ~1h]
└── Task 5 — UI/UX                   [FE: ~1-3h] ← chờ anh Hiếu

TUẦN SAU — P2
├── Task 6 — Module thống kê         [BE+FE: ~4-6h] ← chờ wireframe
└── Task 8 — Casso Flow              [BE+FE: ~4-6h] ← cần đăng ký Casso
```

---

## GHI CHÚ

- **Task 1** là nền tảng: logic `visible_creator_emails()` tái dùng cho Task 6
- **Task 2**: Cần PayOS credentials HCM (Client ID / API Key / Checksum Key) — lấy từ PayOS Dashboard
- **Task 3**: **Backup DB bắt buộc** trước khi xoá. Review kết quả SQL với anh Hiếu trước khi thực thi
- **Task 4**: Supabase Branching (beta) có thể dùng thay tạo project mới
- **Task 7**: Đăng ký UptimeRobot miễn phí tại uptimerobot.com → monitor `GET /healthz` mỗi 10 phút là fix được cold start ngay lập tức
- **Task 8**: Casso business plan cần xác nhận chi phí với anh Hiếu trước khi đăng ký. API docs: https://docs.casso.vn
