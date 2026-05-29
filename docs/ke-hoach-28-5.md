# KẾ HOẠCH CÔNG VIỆC — 28/05/2026 (v4)

> Nguồn: Checklist anh Hiếu + đối chiếu commit thực tế
> Cập nhật: 29/05/2026 — v4 (cập nhật tiến độ thực tế, Task 7 DONE, Task 8 MB đã kết nối Casso)

---

## BẢNG KẾ HOẠCH CHI TIẾT

| # | Việc cần làm | Vấn đề (non-tech) | Cách xử lý cụ thể (tech) | Người đảm nhiệm | Ưu tiên | Tiến độ |
|---|---|---|---|---|---|---|
| **1** | **Kiểm tra quyền xem & sử dụng theo cấp độ** | Sale chỉ thấy PR của mình, Leader thấy team, System thấy all | **BE (xong):** `e8bc2bf` — filter `sale_email` cho list/patch/cancel/create; `create` tự gắn `sale_email`; schema patch + index. **FE (xong):** `6d123b9` — ẩn tab Đối soát/Kích hoạt/Xuất HĐ với sale/leader. **Quyết định:** mô hình 3 cấp Sale→Leader→System (ẩn Manager). Còn nhỏ: bỏ option `manager` trong dropdown FE + cân nhắc hạ quyền Ops | Đức/Đạt (BE) · Minh (FE) | **TOP 1** | **✅ DONE** |
| **2** | **Kết nối PayOS HCM** | Chỉ nhân sự HCM mới được chọn Bank HCM | **FE (xong):** `bank.ts` thêm VCB HCM (`970436 · 1044914392 · PALFISH CLASS SAI GON`); `getAvailableBanks(team)` lọc theo team. **BE (BLOCK):** PayOS **chưa hỗ trợ VCB** → bank VCB HCM dùng VietQR tĩnh; đối soát qua Casso (Task 8). Khi Casso kết nối VCB xong thì Task 2 hoàn thành | Giang (BE) · Minh (FE) | **TOP 2** | **~35% — BLOCK chờ Casso VCB** |
| **3** | **Xoá data test + cập nhật data thực tế** | Data test lẫn data thật, cần import data thật trước khi sale sử dụng | **Xoá test (xong):** script `cleanup_task3_uat_data.py` đã chạy, xoá 36 PR/72 line/36 AR/9 đơn/3 GD; backup JSON lưu lại. **Còn:** **chờ file Excel data mới từ anh Hiếu** → viết importer, bắt buộc map đúng `sale_email` mỗi dòng (không thì sale không thấy đơn lịch sử) | Đức/Đạt (BE) · Minh (FE) | **TOP 1** | **✅ DONE** (phần xoá) · **⏳ chờ Excel** (phần import) |
| **4** | **Tạo môi trường Sandbox** | Dev tính năng mới không ảnh hưởng production | **Xong:** `env_utils.py` cách ly PayOS/DingTalk trong sandbox; `seed_sandbox_data.py`; `render.yaml` service sandbox (`be2fabc` — Đức); banner ⚠️ SANDBOX; `.env.sandbox` template. **Còn (Infra):** tạo Supabase sandbox project + clone schema; deploy Vercel branch `sandbox`; điền secrets thật trên Render; chạy `seed_sandbox_data.py --apply`. Xem `docs/HANDOFF_DUC_sandbox_provisioning.md` | Giang/Đức (BE·Infra) · Minh (FE) | **TOP 2** | **~70% — chờ provisioning Supabase + Vercel** |
| **5** | **Redesign UI tab Kích hoạt khoá học** | Giao diện rời rạc, kém trực quan — chỉ sửa giao diện, không đổi logic | FE only. Theo mẫu "C · Pulse": progress bar gói đã kích hoạt, avatar tròn, toggle switch thay badge tĩnh, viền trái accent, badge tiền cam. File: `ActivationTab.tsx` + `ActiveRequestMiniCardV2` trong `PaymentRequestDetailDrawer.tsx`. Xem **CHI TIẾT TASK 5** | Minh (FE) | **TOP 3** | **0%** |
| **6** | **Module thống kê sale / leader / hệ thống** | Sale xem hiệu suất cá nhân, Leader xem team, System xem tổng | **Chờ wireframe anh Hiếu.** BE thêm `/dashboard/sale-stats`, `/dashboard/team-stats`; FE `SalesDashboardTab.tsx` + recharts. Filter theo role tái dùng `visible_creator_emails` từ Task 1 | TBD | **P2** | **0% — chờ wireframe** |
| **7** | **Cải thiện tốc độ load trang** | Load lần đầu rất lâu | `ee8011f` (Giang): lazy-load toàn bộ tab nặng trong `MainPage.tsx`; render on-demand (switch-case) thay `display:none` — không mount component khi không cần. Kết quả: **xuống còn ~4s** | Giang (FE·Infra) | **TOP 3** | **✅ DONE (~4s)** |
| **8** | **Kết nối Casso Flow — biến động số dư** | PayOS chỉ thấy giao dịch qua QR của nó; cần xem mọi dòng tiền (CK tay, ATM…) — và là hướng đi cho đối soát VCB HCM | **MB Bank HN đã kết nối Casso ✅.** ⚠️ Cần ký hợp đồng 3 bên với MB Bank trong **7 ngày**. **Còn:** (a) Xác nhận loại TK HN + HCM (xem bên dưới); (b) Kết nối VCB HCM; (c) Code `casso_routes.py` + webhook; (d) FE tab biến động số dư. Lưu ý: Casso ghi cả TIỀN VÀO + TIỀN RA (không lọc được). VCB tạm dừng đồng bộ 22h–5h | Minh (BE·FE) | **TOP 2** | **~25% — MB xong, còn VCB + code + contract** |
| **9** | **Fix: tạo gói học vượt tiền thực nhận + không xuất HĐ khi chưa có Order ID** | (a) Tổng tiền gói học không được > số tiền thực nhận. (b) Xuất HĐ và kích hoạt là 2 việc độc lập — không nên chặn xuất HĐ khi thiếu Order ID | **FE only.** (a) `ActivationTab.tsx`: validate `total ≤ pr.received` khi lưu + progress bar "đã dùng / đã nhận / còn lại". (b) Bỏ `disabled={!course.orderId?.trim()}` tại dòng 1208. BE invoice **không** check Order ID — đã xác nhận. Xem **CHI TIẾT TASK 9** | Minh (FE) | **TOP 3** | **0%** |

---

## ⚠️ VIỆC CẦN LÀM NGAY — Task 8 Casso

### Câu hỏi chờ xác nhận từ anh Hiếu / tài chính

| Chi nhánh | Câu hỏi | Ảnh hưởng |
|---|---|---|
| **HN (MB Bank)** | Tài khoản DN hay cá nhân? Loại **MB Bank Official** hay **MB Bank BIZ Official**? | Xác định đúng loại để Casso kết nối đúng + ký hợp đồng 3 bên đúng mẫu |
| **HCM (VCB)** | Tài khoản DN hay cá nhân? Loại **VCB DigiBiz** hay **VCB iB@nking**? | DigiBiz = DN; iB@nking = cá nhân. Casso hỗ trợ cả 2 nhưng flow khác nhau |

### Ràng buộc kỹ thuật đã biết
- **MB Bank:** sau khi liên kết → phải ký hợp đồng 3 bên MB Bank **trong 7 ngày** (⚠️ deadline đang chạy)
- **VCB:** Casso mặc định **dừng đồng bộ 22h–5h sáng** (VCB có tỷ lệ chèn giao dịch lạ khung giờ này)
- Casso Flow ghi nhận **cả TIỀN VÀO + TIỀN RA** — không filter được chỉ tiền vào. Code FE cần hỗ trợ hiển thị và lọc theo chiều giao dịch

### Bước kỹ thuật tiếp theo (sau khi xác nhận loại TK)
1. Kết nối VCB HCM vào Casso
2. BE: tạo `backend/casso_routes.py` — proxy `GET /v2/transactions?bankAccountId=...`, webhook `POST /webhook/casso`
3. FE: tab "Biến động số dư" trong ReconciliationTab (hoặc tab riêng) — filter theo ngân hàng, chiều tiền vào/ra, date range
4. Đối soát auto: match `description` từ Casso ↔ `transfer_code` trong `payment_lines`

---

## CHI TIẾT TASK 5 — Redesign "Kích hoạt khoá học"

> **Nguyên tắc:** KHÔNG đổi logic, KHÔNG thêm/bớt nút bấm. Chỉ thay giao diện. Mẫu = "C · Pulse".

| Thành phần | Hiện tại | Mong muốn |
|---|---|---|
| Header | Title + mã AR + badge trạng thái phẳng | Bo tròn icon-button gọn (✏️ / ✓ xanh / ✗ đỏ) |
| Thanh tiến độ | Không có | Card xanh nhạt: "X/Y gói đã kích hoạt" + progress bar + **TỔNG TIỀN** cam |
| Khách hàng | Input phẳng | **Avatar tròn** (chữ cái đầu, nền tím nhạt) + tên đậm + SĐT +84 |
| Dòng gói học | Badge "Đã kích hoạt" tĩnh | **Card viền trái xanh** + tiền cam + **toggle switch** (giữ handler cũ) |
| Course code | Text xám nhỏ | Giữ, đặt dưới tên gói |

**File:** `ActivationTab.tsx` + `ActiveRequestMiniCardV2` trong `PaymentRequestDetailDrawer.tsx`

---

## CHI TIẾT TASK 9 — Fix 2 lỗi nghiệp vụ

### Lỗi A — Tạo gói học vượt tiền thực nhận
**Vấn đề:** code dùng `pr.target` (dự kiến), không phải `pr.received` (thực nhận) + **không chặn** việc tạo vượt.

**Fix FE (`ActivationTab.tsx`):**
1. Chặn `total > pr.received` khi thêm/lưu gói → báo: *"Vượt quá tiền thực nhận. Còn lại: X đ"*
2. Thêm progress bar: **Đã dùng `total` / Đã nhận `pr.received`** (đỏ nếu vượt)
3. Sửa dòng 596/620: default số tiền gói mới = `Math.max(0, pr.received − total)` (thay `pr.target`)

### Lỗi B — Chặn xuất HĐ khi chưa có Order ID
**Vấn đề:** `ActivationTab.tsx:1208` — `disabled={!course.orderId?.trim()}`.

**Fix FE:** Bỏ điều kiện đó. BE `invoice_routes.py` không yêu cầu Order ID — đã xác nhận. Order ID điền sau được.

---

## THỨ TỰ THỰC HIỆN

```
⚡ NGAY BÂY GIỜ
└── Task 8: Ký hợp đồng 3 bên MB Bank (deadline 7 ngày từ lúc kết nối)

TOP 3 — LÀM TIẾP (FE · Minh)
├── Task 9 — Fix 2 lỗi nghiệp vụ         [~2-3h]
├── Task 5 — Redesign Kích hoạt khoá học  [~2-4h]
└── Task 1 — Bỏ option Manager (FE nhỏ)   [~30m]

TOP 2 — SONG SONG
├── Task 8 — Casso: xác nhận loại TK → kết nối VCB → code routes
└── Task 4 — Provisioning Supabase + Vercel sandbox (Đức, xem handoff)

⏳ CHỜ INPUT
├── Task 3 — Import Excel data thật (chờ file từ anh Hiếu)
└── Task 6 — Module thống kê (chờ wireframe)
```

---

## GHI CHÚ

- **Task 1 — DONE.** Chỉ còn nhỏ: bỏ option `manager` trong dropdown Nhân sự Sale (FE). Cơ chế: đổi `role` trong bảng `nhan_su_sale` → quyền đổi ngay lần request kế tiếp.
- **Task 3 — DONE (xoá).** Khi có Excel: importer **bắt buộc set `sale_email`** đúng mỗi dòng — nếu không sale sẽ không thấy đơn lịch sử.
- **Task 4 — Provisioning:** xem `docs/HANDOFF_DUC_sandbox_provisioning.md`. Convention env: `APP_ENV=sandbox` (BE) / `VITE_APP_ENV=sandbox` (FE). File `.env.sandbox` đã gitignore. render.yaml service sandbox đã thêm (`be2fabc`).
- **Task 7 — DONE.** Giang: lazy-load + render on-demand. Nếu cold start vẫn còn thấy > 4s ở lần đầu → cần thêm UptimeRobot ping `/healthz` mỗi 10 phút (free, 0 code).
- **Task 8 — ⚠️ deadline MB contract 7 ngày.** Sau khi xác nhận loại TK HN/HCM thì kết nối VCB và bắt đầu code. VCB ngừng 22h–5h cần note trong UI.
