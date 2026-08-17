# PLAN M4 — Module xem phiếu lương (build trên SANDBOX) — 14/08/2026

Nối tiếp `PLAN_PHIEU_LUONG_M3M4_2026-08-11.md` (mục 🟢 GĐ1). M4 = tầng hiển thị thuần, **không tính lại** (khớp pivot 13/8).

## 🟩 TRẠNG THÁI THỰC THI (branch `feat/m4-payslip`, sandbox `pxgy…`)
- **Milestone A — XONG + test.** `payroll_routes.py` POST `/api/payroll/payslips/receive` (verify `X-Gate-Token`, upsert `code|ky_luong|stage`). Migration `2026-08-14-payslips-m4.sql` (bảng `payslips`, RLS ON) đã áp sandbox. `GATE_TOKEN` user đã set. 6 test pass.
- **Milestone B (backend) — XONG + test.** Migration `2026-08-14-payslips-m4-rbac-audit.sql` (thêm `nhan_su_sale.ma_nv` + bảng audit `payslip_views`) áp sandbox. `rbac.py`: `visible_payslip_codes` + `actor_ma_nv`. Endpoints: GET `/payslips` (list RBAC), GET `/payslips/{id}` (detail + audit), PATCH `/confirm`, PATCH `/review` (auto-khoá mùng 4). 9 test pass. Tổng 15 payroll test pass (full suite: 790 pass; 12 fail+4 err = integration test cần Supabase live, KHÔNG liên quan).
- **CÒN LẠI Milestone B:**
  - **FE (T9c/T10):** React tab — list + render 6 block + 2 nút + đăng ký module "Phiếu lương" vào hệ phân quyền. *(chưa làm)*
  - **Re-auth trước khi xem** (spec) — chưa làm (cần FE modal + verify password).
  - **N2 backfill:** điền `ma_nv` (auto-match email từ BQ `C_raw_staff_info_merged` có sẵn email↔code). *(data task, chưa chạy)*
- **CHƯA COMMIT.**

---

Chỉ đưa plan — **chưa build tới khi Minh duyệt** ([[feedback_plan-before-code]]).

## Spec đã chốt (nguồn — KHÔNG thiết kế lại)
- **Định dạng phiếu:** `docs/PHIEU_LUONG_CONTRACT.md` — 20 cột + **6 block** + thuế/BH + payload JSON + luồng 5 cột trạng thái.
- **Thiết kế module:** `docs/plans/PLAN_PHIEU_LUONG_GD1_KIENTRUC_2026-08-06.md` §2,4,7 — xem phiếu mình, khoá re-auth MK + audit, 2 nút, auto-khoá mùng 4, ghi ngược.
- **Visual master:** Google Doc merge `1Jd0TvdJvh7EwsqvPXKyEoLdCDQHXXC_hjmS0TzIN3hs`.
- **Interface:** payload `PhieuLuongGate` (contract §Contract payload) — đã khóa: `{meta:{code,ky_luong,stage,…}, phieu:{<nhãn cột>:<val>}}`, stage∈{truoc_thue,sau_thue}, khóa idempotent `code|ky_luong|stage`.

**6 block hiển thị:** Lương cơ bản · Thưởng+COM · Phụ cấp · Bảo hiểm · Thuế+Bù tiền · Tổng tiền.

## Môi trường: SANDBOX trước ([[project_deploy-infra-topology]])
- **Supabase sandbox** (`pxgy…`) — chạy migration bảng `payslips`.
- **Render sandbox** — deploy `payroll_routes.py`.
- **Vercel sandbox** (`palfish-gmv-manager-sandbox`) — deploy FE.
- **Branch riêng** `feat/m4-payslip`, KHÔNG đụng main/prod. FE `.env.local` → `VITE_API_BASE_URL` = Render sandbox.

## Milestone A — Backend nhận + lưu (sandbox)
- **G1-T9a · Endpoint nhận phiếu** — `backend/payroll_routes.py` mới; `POST /api/payroll/payslips/receive`; verify header `X-Gate-Token`; **upsert** theo `code|ky_luong|stage`; lưu nguyên payload. Đăng ký `register_payroll_routes(app)` trong `backend/main.py`.
- **G1-T9b · Bảng Supabase `payslips`** — id, code, name, ky_luong, stage, payload_json(jsonb), status(nhap/chot), review_status(none/requested), confirm_status(none/confirmed) + mốc thời gian, received_at, updated_at; UNIQUE(code,ky_luong,stage). Migration → Supabase **sandbox**.
- **G1-N1 · Secret `GATE_TOKEN`** — env BE Render sandbox + `.env` local. KHÔNG commit giá trị.

## Milestone B — Frontend hiển thị + xác nhận (sandbox)
- **G1-N2 · Cầu user ↔ mã NV** — ⚠ GAP: app định danh qua email → `nhan_su_sale` (`rbac.py:106`), có role/team/leader/manager nhưng **KHÔNG có mã NV** (HN0001). **CHỐT hướng (c):** thêm cột `nhan_su_sale.ma_nv`, điền mã NV/người. Chuỗi: login(email)→dòng nhan_su_sale→ma_nv→`payslips WHERE code=ma_nv`. Migration + backfill. *(app-side, không cần Trang.)*
- **G1-T9c · Màn phiếu + RBAC + khoá** — route/tab đọc `payslips`; render **6 block** theo mẫu Doc `1Jd0…` (map nhãn cột→block, chừa cột APPEND); **RBAC self-view:** module "Xem phiếu của tôi" **tự giới hạn → bật cho TẤT CẢ nhóm** (ai cũng chỉ thấy code mình); nhóm/team chỉ dùng khi leader/manager/ops xem người khác, system xem hết; **re-auth mật khẩu trước khi mở phiếu** + **audit log** (ai xem, lúc nào); hiển thị cả 2 tầng trước/sau thuế.
- **G1-T10 · 2 nút (khớp quy trình thật, BỎ "đã xem")** — **Yêu cầu xem xét lại** + **Xác nhận** per tầng; `PATCH /api/payroll/payslips/{id}/review|confirm`; **auto-khoá nút "Yêu cầu xem xét lại" từ mùng 4** (trước ngày trả lương mùng 5).

## Milestone C — Kiểm thử + thông báo (sandbox)
- **G1-N4 · Test E2E payload giả** — curl/script POST payload mẫu (cả 2 stage) → verify upsert + render 6 block + review/confirm. Không cần Sheet thật.
- **G1-T11a · Notify phát phiếu** — Zalo/DingTalk khi phiếu tới (tái dùng notifier cũ).

## HOLD — chờ Trang / prod
- **Ghi ngược app→Sheet** 2 cột "NV xác nhận" (chiều app→Gate) — chờ nối Gate.
- **Nối Gate thật:** điền `appEndpoint`+`gateToken` trong `PhieuLuongGate.gs` (Sheet Trang) → go-live.
- **Deploy prod** (sau khi sandbox chạy sạch + đối soát chu kỳ lệch = 0).
- **Bảng landing BQ + đẩy app→BQ** (GĐ2).

## Coverage & onboarding — DỰ KIẾN TƯƠNG LAI (M4 KHÔNG đảm nhiệm)
> Ghi lại để không quên. M4 hiện tại **chỉ hiển thị phiếu cho người đã có tài khoản app**. Phủ hết công ty = giai đoạn sau, ngoài scope M4.
- **Org thật (payroll 98 NV HN) — 7 phòng ban:** Kinh doanh 56 · CS 18 · Marketing 10 · HR 8 · Kế toán 1 · Ban Giám đốc 1 · Học thuật 2 · **Kỹ thuật** ~4. App hiện chỉ có **4 nhóm** (Bán hàng, Nhân sự & Quản trị, Marketing, CS).
- **Thiếu để phủ hết:** (1) tài khoản cho NV chưa đăng ký (CS/chatpage/giáo viên…); (2) mã NV cho mỗi tài khoản; (3) *nếu cần* thêm nhóm Học thuật/Kỹ thuật — nhưng self-view bật all-group thì thường **KHÔNG cần**.
- **Data bẩn cần làm sạch trước khi dùng nguồn:** `title_job`/`departments` trùng hoa-thường + khoảng trắng; có ô **email làm chức danh** (= team chatpage/Page admin bị gán sai nhãn).
- **Nguyên tắc:** thêm phòng ban vào RBAC = thay đổi TOÀN hệ thống (16 module × nhóm), tách khỏi M4. M4 chỉ cần tài khoản + mã NV.

## Thứ tự + ước lượng (độc lập Trang; khớp GD1 M4 ~3,5 ngày)
| Milestone | Task | Phụ thuộc | Ước lượng |
|---|---|---|---|
| A | T9a · T9b · N1 | không | ~1–1,5 ngày |
| B | N2 → T9c → T10 | sau A | ~2 ngày |
| C | N4 · T11a | sau B | ~0,5–1 ngày |

Tổng ~4 ngày-dev trên sandbox. Go-live (Gate bật + prod) mới chờ Trang.

## 5 tiêu chí ✓
Triệt để (M4 chạy độc lập, spec đã chốt) · Không lỗi con (render 6 block + upsert idempotent + RBAC + re-auth) · Không tăng hạ tầng (FastAPI + Supabase + notifier cũ, sandbox sẵn có) · Tối ưu token (plan cô đọng, trỏ spec 1 chỗ) · Bền qua compact (path + khóa + shape + nguồn spec ghi rõ mỗi task).

*v1 (14/8) — gom spec từ contract + GD1 kiến trúc + Doc mẫu; build sandbox-first.*
