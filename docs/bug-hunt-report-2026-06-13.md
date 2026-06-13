# Bug Hunt Report — 2026-06-13

> Dò lỗi nghiệp vụ toàn app theo luồng. Bắt đầu từ Phase 1 (Sale).
> Mỗi bug ghi 4 mục: **Role / Bước / Kỳ vọng / Thực tế**, kèm mức độ: 🔴 Chặn go-live / 🟠 Quan trọng / 🟡 UX.

## Quyết định nghiệp vụ (xác nhận với anh Minh ngày 13/06)

1. **Sổ doanh thu**: KHÔNG cho sale xem. Chỉ kế toán + ops (chị Thu Hiền) được vào.
2. **Phân quyền chị Thu Hiền** (role ops, nhân sự đặc biệt, quyền linh động):
   - ✅ Full quyền **Đối soát & Hóa đơn** (B2, B4, invoice-remind)
   - ✅ Full quyền **Sổ doanh thu, BC01, BC02, BC03**
   - ✅ View **Thông tin cá nhân** của chính mình
   - ❌ KHÔNG được vào **Tài khoản Auth** + **Phân quyền sử dụng**
3. **Lần TT vượt PR đã đủ**: Chặn cứng + UI hướng dẫn sale tăng "Tổng tiền dự kiến" trước.
4. **Notify khi ops xác nhận AR**: In-app (chấm đỏ trên icon + dropdown).

## Thứ tự ưu tiên fix (theo anh Minh): **Nghiệp vụ → UI/UX → Bảo mật**

## Phân công (cập nhật 13/06)
- **Claude** (em): toàn bộ phần FE (theo nguyên tắc FE-only)
- **Đức** (BE dev): toàn bộ phần BE
- **Anh Minh**: review + chốt nghiệp vụ + setup phân quyền chị Hiền (PR6)

### Việc hôm nay 13/06
- **Đức**: PR2 (5 bug BE đối soát) + endpoint `POST /payment-requests/{id}/restore` cho PR1. Handoff: [docs/handoff-duc-2026-06-13.md](docs/handoff-duc-2026-06-13.md)
- **Claude**: PR1 phần FE (6 bug rollback). FE call restore endpoint sẽ làm sau khi Đức push.

## Mục lục
- [Phase 1A — Sale tạo PR](#phase-1a--sale-tạo-pr) — 11 bug
- [Phase 1B — Sale tạo lần thanh toán](#phase-1b--sale-tạo-lần-thanh-toán) — 7 bug
- [Phase 1C — Đối soát giao dịch + webhook](#phase-1c--đối-soát-giao-dịch--webhook) — 6 bug
- [Phase 1D — Kích hoạt khóa học (Active Request)](#phase-1d--kích-hoạt-khóa-học-active-request) — 4 bug
- [Phase 1E — Ops xác nhận + Order ID CRM](#phase-1e--ops-xác-nhận--order-id-crm) — 4 bug
- [Phase 1F — Nhắc & xuất hóa đơn](#phase-1f--nhắc--xuất-hóa-đơn) — 5 bug
- [Phase 3 — Tài chính / Sổ doanh thu / Báo cáo](#phase-3--tài-chính--sổ-doanh-thu--báo-cáo) — 6 bug
- [Phase 4 — Leader / Manager + Dashboard + RBAC scoping](#phase-4--leader--manager--dashboard--rbac-scoping) — 5 bug
- [Phase 5 — Sync / CRM / GSheet / PayOS poll](#phase-5--sync--crm--gsheet--payos-poll) — 5 bug
- [Phase 6 — Cross-cutting RBAC / Auth / Permissions](#phase-6--cross-cutting-rbac--auth--permissions) — 3 bug

## Tóm tắt mức độ
- 🔴 **Chặn go-live**: 13 bug
- 🟠 **Quan trọng**: 23 bug
- 🟡 **UX / dead code**: 20 bug
- 🛠️ **Cấu hình** (không phải bug): 1 task (phân quyền chị Hiền)
- **Tổng**: ~56 bug + 1 task setup

---

## 🎯 Roadmap fix theo ưu tiên: Nghiệp vụ → UI/UX → Bảo mật

### 1️⃣ NGHIỆP VỤ — Sai số liệu / Sai luồng (làm trước)

| ID | Vấn đề cần giải quyết (nghiệp vụ) | Cách xử lý (kỹ thuật) | PIC |
|----|-----------------------------------|------------------------|-----|
| **1A-03** | Sale bấm "Xác nhận đã thu" lần TT. Khi hệ thống thực ra từ chối (lỗi mạng, hết quyền, line đã reject…), giao diện vẫn hiện "Đã thu". Sale tưởng KH đã trả → KPI doanh thu sai. | `handleMarkPaid` trong [`PaymentRequestsTab.tsx:380`](frontend/src/components/PaymentRequestsTab.tsx:380): bỏ `catch { /* optimistic */ }`, rollback state về pending + alert lỗi. | **FE** |
| **1B-01** | Cùng triệu chứng 1A-03, nhưng xảy ra ở luồng xác nhận tự động (sau khi đối soát). | `confirmTransaction` trong [`PaymentFlowContext.tsx:277-313`](frontend/src/contexts/PaymentFlowContext.tsx:277): xoá nhánh fallback sau catch (line 305-310). Trong catch chỉ setApiNote + return. | **FE** |
| **1A-01** | Sale huỷ PR đã có lần TT thành công. Hệ thống chặn (đúng), nhưng giao diện vẫn hiện "Đã huỷ". F5 → PR sống lại → sale dễ tạo PR trùng. | `handleConfirmCancel` trong [`PaymentRequestsTab.tsx:617-633`](frontend/src/components/PaymentRequestsTab.tsx:617): bỏ optimistic update trước API call. Đợi response → mới đổi state. Catch → alert lỗi BE. | **FE** |
| **1A-02** | Nút "Khôi phục PR" trong tab "Đã huỷ" chỉ là hiệu ứng giả, không lưu BE. F5 là PR lại huỷ. | (1) Thêm endpoint mới `POST /payment-requests/{id}/restore` trong `payment_request_routes.py` — set state=pending, clear cancelled_at/cancelled_reason. (2) FE `handleRestore` gọi endpoint mới thay vì chỉ updateRequest local. | **BE + FE** |
| **1A-04 + 1B-03** | Sale huỷ hoặc từ chối 1 lần TT. Khi BE từ chối, FE vẫn hiện cancelled/rejected → sai trạng thái. | Cùng pattern `catch { /* optimistic */ }` ở `handleCancelPayment` [`PaymentRequestsTab.tsx:301`](frontend/src/components/PaymentRequestsTab.tsx:301) và `rejectTransaction` [`PaymentFlowContext.tsx:315`](frontend/src/contexts/PaymentFlowContext.tsx:315). Gom fix cùng PR với 1A-03 + 1B-01. | **FE** |
| **1B-02** | Sale bấm "Kích hoạt khoá học" lúc mạng lỗi. Hệ thống dựng AR giả trong giao diện, ops không hề thấy → sale chờ mãi không có ai xác nhận. | `handleCreateActiveRequest` trong [`PaymentFlowContext.tsx:337-355`](frontend/src/contexts/PaymentFlowContext.tsx:337): xoá `createLocalActiveRequest(pr, ...)` trong catch. Chỉ setApiNote + throw err để caller hiển thị lỗi rõ. | **FE** |
| **1C-02** | Khi đối soát giao dịch QR, hệ thống có thể ghi nhận tiền của KH-A vào PR của KH-B do mã chuyển khoản trùng substring (vd "12345" nằm trong "012345"). | `reconcile_payment_line_webhook` trong [`payment_request_routes.py:1147-1151`](backend/payment_request_routes.py:1147): đổi `if code in desc` → `if re.search(rf"\b{re.escape(code)}\b", desc)`. Hoặc bỏ luôn nhánh fallback (đã có 2 nhánh order_code + payment_link_id chính xác). | **BE** |
| **1C-03** | Ngân hàng gửi 1 thông báo thanh toán 2 lần (do retry tự động). Hệ thống xử lý lần 2 sẽ cập nhật lại `paid_at` = giờ hiện tại → giao dịch lúc 23:59 thành 00:01 hôm sau → BC03 mất 1 giao dịch hôm nay, ngày mai bị "thừa". | `_mark_line_paid` trong [`payment_request_routes.py:994-1009`](backend/payment_request_routes.py:994): đầu hàm fetch line, nếu `status == "paid"` → return early không update. Giữ idempotent. | **BE** |
| **1E-01** | Ops vô tình điền cùng 1 order ID CRM (vd "ORD-12345") cho 2 course khác nhau ở 2 PR. Báo cáo BC03 ghi nhận doanh thu của đơn đó 2 lần. | `patch_active_request_course` trong [`activation_routes.py:1234-1273`](backend/activation_routes.py:1234): trước khi gọi RPC, query `active_requests` scan toàn bộ `uids_data` cho `order_id` này → nếu đã tồn tại ở AR/course khác → raise 409 "Order ID đã được dùng cho course X trong AR Y". | **BE** |
| **1B-04** | Sale có thể tạo lần TT vượt số PR đã đủ → state "Thừa" → KPI lệch. Cần chặn + hướng dẫn sale tăng "Tổng tiền dự kiến" trước. | **BE**: `create_payment_line` ([`payment_request_routes.py:1559`](backend/payment_request_routes.py:1559)) — nếu `pr.received >= pr.target` → raise 400 với `code="PR_ALREADY_FULL"` + message rõ. **FE**: disable nút "+ Tạo lần thanh toán" khi state ∈ {done, over}; click thử → popup "PR đã nhận đủ tiền…" + nút "Sửa thông tin PR ngay" → mở edit + highlight nhấp nháy 2s ô "Tổng tiền dự kiến" + scroll-into-view. Sau khi save target mới → state recompute → nút enable lại. | **BE + FE** |
| **1E-02** | Sale không biết khi ops đã xác nhận xong AR + điền order CRM, phải tự F5 hoặc chờ ops nhắn → bám KH chậm. | **DB**: tạo bảng `notifications(id, user_email, kind, payload jsonb, created_at, read_at)`, index `(user_email, read_at, created_at desc)`. **BE**: hook insert notification sau `sync_ledger_from_ar_course` ở [`activation_routes.py:1266`](backend/activation_routes.py:1266); 3 endpoint `GET /api/v1/notifications?unread=true`, `POST /api/v1/notifications/{id}/read`, `POST /api/v1/notifications/mark-all-read`. **FE**: component `NotificationBell` ở header, useQuery `refetchInterval: 30000`, badge số unread, dropdown 10 thông báo gần nhất, click → mark read + chuyển tab B3. | **BE + FE** |
| 🟠 **1D-01** | Khi tạo course trong AR, nếu hệ thống không đọc được AR khác cùng PR để check budget, vẫn cho tạo → có thể vượt số tiền thực nhận. | [`activation_routes.py:463-464`](backend/activation_routes.py:463): đổi `except Exception: pass` → `except Exception as e: raise HTTPException(500, "Khong xac dinh duoc budget")`. Fail-closed thay vì fail-open. | **BE** |
| 🟠 **1F-01** | Sale có thể nhắc xuất HĐ cho PR chưa thu đồng nào. Kế toán nhận nhắc nhầm, phải tra cứu lại. | `create_invoice_reminder` trong [`payment_request_routes.py:2109`](backend/payment_request_routes.py:2109): sau khi `_can_access_request`, check `_parse_amount(pr_row.get("received")) >= _parse_amount(pr_row.get("target"))` → nếu chưa đủ raise 400 "PR chua thu du, khong nhac duoc HĐ". | **BE** |
| 🟠 **3-03 + 3-04** | Tỷ giá VND/RMB cố định 3700 cho mọi thời điểm, trong khi tỷ giá thực biến động theo ngày → GMV báo cáo sai vài %. Sửa số tiền của dòng cũ cũng dùng rate cũ → vẫn sai. | **DB**: tạo bảng `exchange_rates(effective_from date pk, rate numeric)`. **BE**: hàm `get_rate_for_date(d)` lookup rate có `effective_from <= d` mới nhất; thay `3700` trong [`revenue_routes.py:1379`](backend/revenue_routes.py:1379) và `:1459`. **FE**: thêm 1 section đơn giản trong tab Phân quyền (hoặc tạo tab Admin) CRUD bảng exchange_rates — chỉ system role thấy. | **BE + FE** |
| 🟠 **3-05** | Kế toán nhập tay 2 lần cùng 1 dòng vào Sổ doanh thu → trùng doanh thu (như 101 dòng 12/6 đã gặp). | `create_ledger` trong [`revenue_routes.py:1371`](backend/revenue_routes.py:1371): trước insert, query `so_doanh_thu` cùng `(uid, ngay_tien_ve, so_tien_vnd, loai_nhap='tay')` → nếu tồn tại raise 409 với link tới dòng đã có. FE catch 409 → hiện confirm "Đã có dòng tương tự, vẫn muốn tạo?". | **BE + FE** |
| 🟠 **5-04** | Khi sync GSheet sang Sổ, 2 KH khác nhau cùng ngày cùng số tiền (vd cả 2 đều 5tr ngày 13/6) bị hệ thống nhầm là cùng 1 dòng "đã điền thêm uid" → bỏ qua 1 dòng → mất doanh thu. | `_loose_fp_blank` trong [`gsheet_ledger_import.py:393-398`](backend/gsheet_ledger_import.py:393): thêm `sdt` hoặc `ten_khach` (đã normalize lowercase + bỏ space) vào key → `f"|{ngay}|{vnd}|{sdt_or_name}"`. Update `_consume_budget` và `_load_existing_loose_fps` tương ứng. | **BE** |

**Gom thành 4 PR**:
- **PR1** — Optimistic-catch pattern FE: 1A-01, 1A-02 (chỉ phần FE), 1A-03, 1A-04, 1B-01, 1B-02, 1B-03 (gồm 1 PR FE + endpoint BE nhỏ cho restore)
- **PR2** — Đối soát chính xác: 1C-02, 1C-03, 1E-01, 1F-01, 1D-01 (toàn BE)
- **PR3** — Chặn lần TT vượt PR + UI guide: 1B-04 (full stack)
- **PR4** — Notify in-app: 1E-02 + 3-03 + 3-04 + 3-05 + 5-04 (lớn nhất, có DB migration)

---

### 2️⃣ UI/UX — Form validation, visual cues, hiển thị

| ID | Vấn đề cần giải quyết (nghiệp vụ) | Cách xử lý (kỹ thuật) | PIC |
|----|-----------------------------------|------------------------|-----|
| **1A-11** | Ô "Chênh lệch" trong PR đã đủ tiền hiện "0 ─æ" thay vì "0 đ" (encoding hỏng). | [`PaymentRequestDetailDrawer.tsx:1434`](frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx:1434): đổi `"0 ─æ"` → `vnd(0)` để dùng helper format thống nhất. | **FE** |
| **1A-09** | MST cá nhân có dấu "-" (vd "0123456789-001") bị hệ thống xoá mất dấu → sai định dạng VN. | [`CreatePaymentRequestModal.tsx:281`](frontend/src/components/payment-request/CreatePaymentRequestModal.tsx:281): đổi regex `replace(/[^\d]/g, "")` → `replace(/[^\d-]/g, "")` cho riêng field MST cá nhân. | **FE** |
| **1A-10** | Sale nhập email sai format (vd "abc@") vẫn tạo PR được → sau này gửi nhắc HĐ sẽ bounce. | [`CreatePaymentRequestModal.tsx:72-97`](frontend/src/components/payment-request/CreatePaymentRequestModal.tsx:72): thêm validation regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` trong `canSubmit` (nếu email không rỗng) và `handleSubmit`. | **FE** |
| **1B-05** | Lần TT tiền mặt không bắt nhập "Người thu" → kế toán không đối soát được. | `AddPaymentForm.submit` ở [`PaymentRequestDetailDrawer.tsx:339`](frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx:339): nếu `method === "cash"` và `cashier` trống → setValidationError. Hoặc default `cashier = profile.displayName` lúc mount form. | **FE** |
| **1B-06** | Lần TT quẹt thẻ không bắt nhập 4 số cuối thẻ → đối soát POS thất bại. | Cùng file, nếu `method === "card"` và `cardLast4.length !== 4` → setValidationError "Nhập đủ 4 số cuối thẻ". | **FE** |
| **1B-07** | Sale gõ nhầm thực nhận lớn hơn tổng trả góp (vd total=5tr, thực nhận=8tr) → đối soát phí nền tảng sai. | Cùng file: nếu `method === "installment"` và `parseInt(saleReceivedDraft) > parseInt(installmentTotal)` → setValidationError "Thực nhận không thể lớn hơn tổng trả góp". | **FE** |
| **1A-08** | Sửa target nhỏ hơn số đã thu → PR tự động chuyển sang "Thừa" mà không cảnh báo, dễ làm KPI lệch. | Trong drawer khi save B1 info, nếu `newTarget < pr.received` → dialog confirm "Tổng tiền dự kiến mới (X) nhỏ hơn số đã nhận (Y). PR sẽ chuyển sang trạng thái Thừa. Vẫn lưu?". | **FE** |
| 🛠️ **4-04** | Chị Thu Hiền hiện có toàn quyền system (sửa được Phân quyền + Auth của bất kỳ ai). Đây không phải bug — chỉ là cấu hình lỏng do role `ops` → `system`. Cần thu hẹp phạm vi theo bảng đã chốt. | (1) **DB**: insert/update rows trong `department_permissions` cho `department='ops'`: B2/B3/B4/Sổ doanh thu/BC01/BC02/BC03 = "full"; Tài khoản Auth = "none"; Phân quyền sử dụng = "none". (2) **BE**: bỏ dòng `if r in ("ops", "admin"): return "system"` ở [`rbac.py:28-29`](backend/rbac.py:28); thêm "ops" vào `ROLE_RANK` với rank=2; sửa `_compute_permissions` ([`admin_routes.py:212`](backend/admin_routes.py:212)) — chỉ role `system` mới full bypass, ops đi nhánh department-based. (3) **Test**: login chị Hiền → sidebar không hiện tab "Tài khoản Auth" + "Phân quyền sử dụng". | **BE + DB config** |

**Gom thành 2 PR**:
- **PR5** — Form validation + visual cues: 1A-08, 1A-09, 1A-10, 1A-11, 1B-05, 1B-06, 1B-07 (toàn FE)
- **PR6** — Setup phân quyền chị Thu Hiền: 4-04 (BE + DB migration)

---

### 3️⃣ BẢO MẬT — Vá lỗ hổng auth/scope (làm sau cùng, không chặn vận hành)

| ID | Vấn đề cần giải quyết (nghiệp vụ) | Cách xử lý (kỹ thuật) | PIC |
|----|-----------------------------------|------------------------|-----|
| **1C-01** | Có endpoint webhook cũ `/payos-webhook` thiếu kiểm tra chữ ký → ai biết URL có thể gửi payload giả để "trả tiền" mà không cần chuyển thật → KPI doanh thu ảo. | (1) Tốt nhất: xoá hẳn `@router.post("/payos-webhook")` ở [`payment_request_routes.py:1637-1643`](backend/payment_request_routes.py:1637) vì đã có `/webhook/payos` ở main.py có verify. (2) Hoặc: thêm `request: Request` vào signature + gọi `_verify_payos_webhook_signature(payload, request)` ngay đầu hàm. | **BE** |
| **5-01** | Endpoint `/crm/sync` cho phép ai cũng trigger không cần đăng nhập → có thể bị abuse cạn rate limit CRM, overwrite data sai. | [`crm_routes.py:1405-1431`](backend/crm_routes.py:1405): thêm `authorization: str \| None = Header(None)` vào signature; đầu hàm `actor = resolve_actor(sb, authorization); require_min_role(actor, "manager")`. | **BE** |
| **5-02** | Endpoint `/crm/sync/backfill` cùng vấn đề 5-01, tệ hơn vì backfill song song nhiều ngày. | [`crm_routes.py:1433-1446`](backend/crm_routes.py:1433): cùng pattern fix với 5-01. | **BE** |
| **5-03** | Endpoint `/crm/token-status` public, ai cũng check được trạng thái hệ thống → lộ "đã có/chưa có token CRM" + thời điểm update. | [`crm_routes.py:1384-1403`](backend/crm_routes.py:1384): thêm `authorization` + `resolve_actor` + `require_min_role(actor, "leader")`. | **BE** |
| **4-01 + 4-02** | User leader/manager mới onboard nhưng chưa được tạo dòng trong bảng `nhan_su_sale` → vô tình có quyền xem toàn bộ data công ty (thay vì chỉ sub-team). | [`rbac.py:230-263`](backend/rbac.py:230) `visible_creator_emails`: nếu role ∈ {leader, manager} mà `staff.get("team")` rỗng → `return [actor.email.lower()]` (degrade về sale-level). [`rbac.py:202-205`](backend/rbac.py:202) `enforce_report_scope`: tương tự, manager không team → raise 403 hoặc force scope self. | **BE** |
| **4-03** | Endpoint `/dashboard/filters` trả về danh sách team + sale + department toàn công ty cho mọi user → sale có thể liệt kê toàn nhân sự. | [`dashboard_routes.py:818-858`](backend/dashboard_routes.py:818): áp filter — chỉ trả `teams` thuộc scope của actor (dùng `visible_creator_emails` hoặc role-based: role >= leader mới thấy full). | **BE** |
| 🟠 **3-01 + 3-02** | Sổ doanh thu không có scope theo actor — nếu admin lỡ cấp quyền cho sale, sale sẽ thấy toàn bộ (hiện chưa exposed vì spec không cấp cho sale, nhưng cần defense-in-depth). | [`revenue_routes.py:1285`](backend/revenue_routes.py:1285) `list_ledger` + [`:1346`](backend/revenue_routes.py:1346) `ledger_summary`: nếu `actor.role in ("sale", "leader")` → force filter `created_by_email = actor.email` bất kể `team_filter` query param. Manager/ops/system full. | **BE** |
| 🟠 **6-01 + 6-02** | Khi Supabase chập chờn, permission check có thể trả 500 cho mọi request hoặc bỏ qua override → user thấy lỗi hoặc mất quyền không log. | [`admin_routes.py:228-235`](backend/admin_routes.py:228): retry 1-2 lần với backoff trước khi raise. [`admin_routes.py:265-266`](backend/admin_routes.py:265): đổi `except Exception: pass` → log warning với `print(f"[permission_overrides] query failed: {exc}")`. | **BE** |

**Gom thành 2 PR**:
- **PR7** — Vá auth: 1C-01, 5-01, 5-02, 5-03 (4 endpoint cần thêm `resolve_actor`)
- **PR8** — Scope leader/manager + dashboard filters + sổ doanh thu defense + permission retry: 4-01, 4-02, 4-03, 3-01, 3-02, 6-01, 6-02

---

## Phase 1A — Sale tạo PR

### 🔴 Bug 1A-01: Huỷ PR ở FE không kiểm tra kết quả BE → PR vẫn "cancelled" trên màn khi BE đã từ chối
- **Role**: Sale (mọi role có quyền cancel)
- **Bước**: Mở PR đã có "lần TT" status=paid hoặc đã received > 0 → bấm Huỷ → nhập lý do → Xác nhận
- **Kỳ vọng**: BE chặn (đúng — code `payment_request_routes.py:1443-1453` đã chặn cả 2 case). FE phải hiện báo lỗi, PR vẫn ở trạng thái cũ.
- **Thực tế**: [`PaymentRequestsTab.tsx:617-633`](frontend/src/components/PaymentRequestsTab.tsx:617) — `handleConfirmCancel` set FE thành `cancelled` **trước** khi gọi API, rồi `catch { /* optimistic */ }` nuốt lỗi. Sale tưởng đã huỷ, nhưng F5 PR sống lại → confusion + có thể trùng PR.
- **Fix**: Bỏ optimistic, hoặc rollback + alert khi catch.

### 🔴 Bug 1A-02: Khôi phục PR đã huỷ không gọi BE — F5 mất
- **Role**: Sale
- **Bước**: Tab "Đã huỷ" → bấm "Khôi phục"
- **Kỳ vọng**: PR trở lại trạng thái cũ trên server.
- **Thực tế**: [`PaymentRequestsTab.tsx:635-642`](frontend/src/components/PaymentRequestsTab.tsx:635) — `handleRestore` chỉ `updateRequest` local, **không gọi endpoint BE nào**. F5 → PR vẫn cancelled. Mà cũng không có route BE để restore (grep `restore` trong `payment_request_routes.py` không có).
- **Fix**: Hoặc ẩn nút Restore, hoặc bổ sung endpoint `POST /payment-requests/{id}/restore`.

### 🟡 Bug 1A-03: `handleMarkPaid` catch im lặng — code smell (chỉ dev mode bấm được)
- **Đính chính 13/06**: Trước ghi 🔴, sau khi anh Minh kiểm tra UI thực tế — **prod không có nút này**. Link "Mô phỏng kế toán xác nhận →" chỉ render khi `import.meta.env.DEV` ([`PaymentRequestDetailDrawer.tsx:254-275`](frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx:254)) — chỉ thấy trên `npm run dev` local.
- **Vẫn nên fix vì**: Code smell — pattern `catch { /* optimistic */ }`. Tương lai nếu mở nút lên prod hoặc dev local lỡ bấm → state lệch BE.
- **Đã fix**: cùng commit `d495f67` với 5 bug optimistic-catch khác.

### 🟠 Bug 1A-04: Huỷ lần TT — BE lỗi vẫn show "cancelled"
- **Role**: Sale
- **Bước**: Bấm "X" trên 1 lần TT
- **Kỳ vọng**: BE có thể từ chối (line đã paid + đã reconcile). FE phải rollback.
- **Thực tế**: [`PaymentRequestsTab.tsx:301-346`](frontend/src/components/PaymentRequestsTab.tsx:301) — `handleCancelPayment` cũng `catch { /* optimistic */ }` không rollback.
- **Fix**: Như 1A-03.

### 🟠 Bug 1A-05: Tạo PR — BE không validate format UID / phone / email
- **Role**: Sale
- **Bước**: Form tạo PR → UID="abc", phone="1", email="not-an-email" → Submit
- **Kỳ vọng**: BE phải reject (ít nhất phone đủ digits, email regex cơ bản).
- **Thực tế**: [`payment_request_routes.py:676-728`](backend/payment_request_routes.py:676) `_payment_request_insert_row` chỉ check non-empty. PR rác chui xuống DB → sau này không match được CRM, không gửi email được. FE [`CreatePaymentRequestModal.tsx:72-75`](frontend/src/components/payment-request/CreatePaymentRequestModal.tsx:72) chỉ check truthy.
- **Fix**: Validate phone length (≥9), email regex, UID format theo CRM (số/độ dài).

### 🟠 Bug 1A-06: Tạo PR trùng — không có guard chống duplicate
- **Role**: Sale (đặc biệt khi 2 sale trùng KH)
- **Bước**: Tạo 2 PR liên tiếp cho cùng UID + cùng amount + cùng ngày
- **Kỳ vọng**: Cảnh báo "đã có PR tương tự" (cho sale lựa chọn dùng PR cũ hay tạo mới).
- **Thực tế**: BE không check, FE không check. Sau này đối soát giao dịch sẽ match nhầm PR.
- **Fix**: Trước insert, query `payment_requests` theo `uid + target + sale_email + created today` → nếu có thì cảnh báo (không hard-block).

### 🟠 Bug 1A-07: Race khi 2 yêu cầu tạo lần TT cùng PR — `transfer_code` đụng độ
- **Role**: Sale (lỡ tay double-click) hoặc multi-tab
- **Bước**: PR-2026-0123, đang có 1 lần TT → bấm "Thêm QR" 2 lần liền (mạng chậm)
- **Kỳ vọng**: BE atomic — mỗi line code khác nhau, PayOS không đụng `order_code`.
- **Thực tế**: [`payment_request_routes.py:1564-1573`](backend/payment_request_routes.py:1564) đọc `line_count` không lock → 2 request đọc cùng count → `_transfer_code_hint` ra cùng kết quả → PayOS có thể trả về cùng `order_code` (vì derive từ description?). Insert 2 line trùng `transfer_code`.
- **Fix**: Disable nút khi đang loading (đơn giản); hoặc dùng RPC atomic kiểu sequence như `_allocate_pr_id`.

### 🟡 Bug 1A-08: Sửa PR — sửa `target` nhỏ hơn `received` không cảnh báo
- **Role**: Sale/Leader
- **Bước**: PR target 5tr, đã received 10tr → leader sửa target xuống 1tr
- **Kỳ vọng**: Cảnh báo hoặc chặn — vì sẽ chuyển state thành "over" không tự nhiên.
- **Thực tế**: [`payment_request_routes.py:773-778`](backend/payment_request_routes.py:773) chỉ check `target > 0`. Recompute sẽ ra "over" → KPI sai.
- **Fix**: Cảnh báo FE: "target mới < số đã thu, PR sẽ chuyển sang Thừa".

### 🟡 Bug 1A-09: Mã số thuế cá nhân — strip dấu gạch ngang
- **Role**: Sale
- **Bước**: Nhập MST cá nhân "0123456789-001" → onChange ép về digits
- **Thực tế**: [`CreatePaymentRequestModal.tsx:281`](frontend/src/components/payment-request/CreatePaymentRequestModal.tsx:281) `replace(/[^\d]/g, "")` xoá dấu "-" → MST còn "0123456789001". Sai format VN.
- **Fix**: Cho phép "-" trong regex của MST cá nhân.

### 🟡 Bug 1A-10: Email field không validate format trước submit
- **Role**: Sale
- **Bước**: Nhập email "abc@" → bấm "Tạo PR-ID"
- **Thực tế**: `<input type="email">` không trigger HTML5 validation khi submit qua button onClick (không phải form submit). Email rác lưu xuống DB → sau này gửi nhắc HĐ sẽ bounce.
- **Fix**: Regex check khi `handleSubmit`.

### 🟡 Bug 1A-11: Hiển thị "Chênh lệch" khi PR đủ tiền — hỏng ký tự "đ" thành "─æ"
- **Role**: Mọi role mở drawer chi tiết PR
- **Bước**: Mở 1 PR đã thanh toán đủ → nhìn card "Chênh lệch" → hiện "0 ─æ" thay vì "0 đ"
- **Nguyên nhân**: [`PaymentRequestDetailDrawer.tsx:1434`](frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx:1434) — string literal hardcode `"0 ─æ"`. Ký tự "đ" bị save sai encoding (Windows-1252 thay vì UTF-8) và commit cứng vào source. Không phải bug runtime, là bug source code.
- **Fix**: Thay literal bằng `vnd(0)` cho nhất quán với các nhánh khác (sẽ ra "0 đ" và format đúng region):
  ```tsx
  {request.state === "done" ? vnd(0) : request.state === "over" ? ... }
  ```

### Cần test tay (anh xác nhận giúp em)
- Sale có quyền `paymentRequests:write` nhưng thuộc team khác chủ PR — bấm sửa được không (`_can_access_request` line 667 dựa `sale_email`).
- Tạo PR khi mất mạng → có hiện lỗi rõ ràng hay treo loading mãi?
- PR-ID có chống trùng race khi 2 sale tạo cùng giây (RPC `next_payment_request_id` atomic — đã có test, nhưng test tay 1 lần).

---

## Phase 1B — Sale tạo lần thanh toán

### 🔴 Bug 1B-01: `confirmTransaction` luôn fallback optimistic — BE từ chối vẫn show "đã thu"
- **Role**: Sale (xác nhận lần TT)
- **Bước**: Lần TT pending → Sale bấm "Xác nhận đã thu" → BE từ chối (không thuộc PR của sale, hay đã rejected)
- **Kỳ vọng**: FE rollback, hiện lỗi.
- **Thực tế**: [`PaymentFlowContext.tsx:277-313`](frontend/src/contexts/PaymentFlowContext.tsx:277) — `try { … } catch { /* fall through optimistic */ }` rồi **sau catch vẫn `updateRequest` set status=paid** (line 305-310). Tức là **dù BE từ chối, FE LUÔN set paid**.
- **Ảnh hưởng**: KPI doanh thu sai, state PR sai (pending → done giả), gây nhầm khi kích hoạt khoá học.
- **Fix**: Trong catch chỉ set apiNote và return, không fallback set paid.

### 🔴 Bug 1B-02: `handleCreateActiveRequest` fail thì tạo AR giả mạo local
- **Role**: Sale (tạo Active Request)
- **Bước**: PR đủ tiền → bấm "Kích hoạt khoá học" → BE lỗi (mạng, 5xx)
- **Kỳ vọng**: Báo lỗi, không tạo AR.
- **Thực tế**: [`PaymentFlowContext.tsx:337-355`](frontend/src/contexts/PaymentFlowContext.tsx:337) — catch tạo `createLocalActiveRequest(pr, ...)` rồi push vào state. Sale tưởng đã tạo, **nhưng ops không thấy, F5 là mất**.
- **Ảnh hưởng**: Sale chờ ops xác nhận mãi không có vì AR không tồn tại trên server.
- **Fix**: Catch → setApiNote → throw err để FE caller báo lỗi rõ.

### 🟠 Bug 1B-03: `rejectTransaction` BE lỗi vẫn show "rejected"
- **Role**: Sale
- **Bước**: Bấm "Từ chối" 1 lần TT → BE từ chối
- **Thực tế**: [`PaymentFlowContext.tsx:315-335`](frontend/src/contexts/PaymentFlowContext.tsx:315) — optimistic trước, `catch { /* silently ignore */ }`. UI và DB lệch nhau.
- **Fix**: Catch → rollback + alert.

### 🔴 Bug 1B-04: BE không chặn lần TT vượt số còn thiếu — đã xác nhận spec chặn cứng
- **Role**: Sale
- **Bước**: PR target 5tr, đã thu 5tr (đủ) → tạo thêm 1 lần TT 10tr
- **Kỳ vọng (theo quyết định anh Minh)**: **Chặn cứng** + hướng dẫn sale sửa Tổng tiền dự kiến trước.
- **Thực tế**: [`payment_request_routes.py:1559-1561`](backend/payment_request_routes.py:1559) chỉ chặn `amount <= 0`. Tạo thoải mái → state = "over" → KPI bị thừa.

**Spec fix chi tiết** (em đề xuất, anh chốt):

**BE** ([`payment_request_routes.py:1534`](backend/payment_request_routes.py:1534) `create_payment_line`):
- Sau khi parse amount, check: `if pr.received >= pr.target: raise 400` với detail rõ:
  ```json
  {
    "code": "PR_ALREADY_FULL",
    "message": "PR đã nhận đủ tiền, cần tăng số tiền dự kiến để tạo thêm lần thanh toán",
    "received": 9850000,
    "target": 9850000
  }
  ```

**FE** ([`PaymentRequestDetailDrawer.tsx`](frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx)):
1. **Disable nút "+ Tạo lần thanh toán"** khi `state in ["done", "over"]`. Hover/tooltip giải thích.
2. **Click nút disabled** → mở popup:
   - Title: "PR đã nhận đủ tiền"
   - Body: "Cần tăng số tiền dự kiến để tạo thêm lần thanh toán. Bạn có thể tăng số tiền dự kiến bằng cách bấm Sửa thông tin khách hàng → ô **Tổng tiền dự kiến**."
   - 2 nút: "Đóng" / "Sửa thông tin PR ngay" (primary)
3. **Bấm "Sửa thông tin PR ngay"** → mở chế độ edit ở section "Thông tin khách hàng (B1)", **highlight** ô "Tổng tiền dự kiến" (border vàng nhấp nháy 2s, scroll-into-view).
4. **Sau khi sale save target mới** → recompute state → nút "+ Tạo lần thanh toán" enable lại.
5. **Visual cue khi PR ở state "Đủ"**: card "Tiến độ" có dòng phụ "PR đã đủ — sửa Tổng tiền dự kiến nếu cần thu thêm".

### 🟡 Bug 1B-05: Method "cash" — người thu để trống vẫn submit được
- **Role**: Sale
- **Bước**: Method = Tiền mặt → bỏ trống "Người thu" → Ghi nhận
- **Thực tế**: [`PaymentRequestDetailDrawer.tsx:339-368`](frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx:339) — không validate `cashier`. Phiếu tiền mặt không biết ai thu → kế toán không đối soát được.
- **Fix**: Required cho cash, hoặc default = tên sale đang đăng nhập.

### 🟡 Bug 1B-06: Method "card" — 4 số cuối thẻ không required
- **Role**: Sale
- **Bước**: Method = Quẹt thẻ → bỏ trống "4 số cuối thẻ" → Ghi nhận
- **Thực tế**: cardLast4 chỉ slice(0,4) nhưng không required → đối soát POS sau này không match được.
- **Fix**: Required hoặc cảnh báo.

### 🟡 Bug 1B-07: Trả góp — không sanity check `sale_received ≤ installment_total`
- **Role**: Sale
- **Bước**: Nền tảng = Payoo, tổng = 5tr, thực nhận = 8tr (lỗi gõ)
- **Thực tế**: BE và FE đều không check sale_received ≤ installment_total. Sai số đối soát phí nền tảng.
- **Fix**: FE check khi submit.

### Cần test tay
- Spam click nút "Tạo QR & mã CK" (modal không disable lúc loading) → có tạo trùng `transfer_code` ở PayOS không? Liên quan 1A-07.
- Mở form Add Payment 2 tab cùng PR → submit gần như đồng thời → behaviour?

---

## Phase 1C — Đối soát giao dịch + webhook

### 🔴 Bug 1C-01: Endpoint `/payos-webhook` cũ KHÔNG verify HMAC signature → ai cũng có thể "trả tiền giả"
- **Role**: Attacker (bên ngoài) — bypass thanh toán
- **Bước**: POST `https://api.../payos-webhook` với JSON `{"data":{"orderCode":"<số đoán được>"}}` không kèm signature
- **Kỳ vọng**: 400 Invalid signature (giống `/webhook/payos` ở `main.py:1100`).
- **Thực tế**: [`payment_request_routes.py:1637-1643`](backend/payment_request_routes.py:1637) — `payos_webhook_v1` **không gọi `_verify_payos_webhook_signature` lần nào**. Match order_code → mark paid → KPI doanh thu nhảy giả.
- **Ảnh hưởng**: Order_code là số sinh tuần tự theo thời gian (`main.py:1028`), brute force ~vài nghìn request là trúng PR pending. Có thể "tự thanh toán" PR mình mà không trả tiền.
- **Fix gấp**: Hoặc xoá endpoint (đã có `/webhook/payos`), hoặc thêm verify signature giống main.py:1100. Test ở `test_audit_other.py` chỉ test `/webhook/payos` nên không phát hiện.

### 🔴 Bug 1C-02: Fallback match `transfer_code in description` — substring khớp nhầm PR
- **Role**: Webhook → mark paid nhầm PR
- **Bước**: Có 2 lần TT pending: PR-A code "12345", PR-B code "012345" (race 1A-07 hoặc tự nhiên). KH thanh toán PR-B, description chứa "012345" → vòng lặp `code in desc` match cả 2, **lấy cái đầu duyệt được** (`break`).
- **Kỳ vọng**: Match exact, hoặc word boundary regex.
- **Thực tế**: [`payment_request_routes.py:1147-1151`](backend/payment_request_routes.py:1147) — `if code and code in desc: line = candidate; break`. Còn dùng `.upper()` hai bên — substring càng dễ nhầm.
- **Fix**: Dùng `re.search(rf"\b{re.escape(code)}\b", desc)` hoặc bỏ fallback (đã có `order_code` + `payment_link_id` là id duy nhất).

### 🔴 Bug 1C-03: `_mark_line_paid` không idempotent — webhook retry đẩy `paid_at` sang ngày khác
- **Role**: System (PayOS retry)
- **Bước**: Webhook tới lần 1 lúc 23:59 → mark paid_at=23:59. PayOS retry lần 2 lúc 00:01 hôm sau (do network blip) → update lại paid_at=00:01.
- **Kỳ vọng**: Idempotent — lần 2 no-op.
- **Thực tế**: [`payment_request_routes.py:994-1009`](backend/payment_request_routes.py:994) — luôn `update` paid_at = now. Dashboard "thu hôm nay" mất 1 giao dịch (về ngày sau), BC03 sai.
- **Fix**: Đầu hàm `_mark_line_paid`, fetch line, nếu `status == "paid"` → return luôn (không update).

### 🟠 Bug 1C-04: KPI "Doanh thu QR" có thể tính sai khi webhook mark paid với amount khác bank
- **Role**: System (đã verify ở commit `ad2a6ad`: KPI chỉ đếm `status=paid` — tốt). Nhưng:
- **Bước**: PayOS mark paid với `amount` không kiểm tra so với `line.amount`
- **Thực tế**: [`_mark_line_paid`](backend/payment_request_routes.py:994) **không validate `webhook.amount == line.amount`** trước khi paid. PayOS bản chất chỉ confirm khi đúng amount, nhưng nếu PayOS gửi payload dirty (hoặc môi trường sandbox), line vẫn ghi `line.amount` (số dự kiến) vào totals → KPI ≠ tiền thực vào bank.
- **Fix**: So sánh `payload.amount == line.amount`, lệch → log warning + (tuỳ policy) reject hoặc lưu `verified_total` riêng.

### 🟠 Bug 1C-05: Webhook description scan chỉ filter `status=pending` — line đã `rejected` nhưng KH vẫn chuyển → không match
- **Role**: System
- **Bước**: Sale tạo lần TT QR rồi reject (nhầm tay). KH đã chuyển. PayOS gửi webhook về.
- **Thực tế**: [`payment_request_routes.py:1142-1146`](backend/payment_request_routes.py:1142) — chỉ scan `status=pending`. Line đã rejected → không match → trả 404 → PayOS retry liên tục lỗi, kế toán phải xử lý tay.
- **Fix**: Cảnh báo riêng — log "line rejected nhưng KH đã chuyển" → kế toán phải đối soát.

### 🟡 Bug 1C-06: `transfer_code` chỉ 5 ký tự base36 — khả năng trùng cao trong tương lai
- **Role**: System (long-term)
- **Bước**: `_int_to_base36_padded(numeric, 5)` — 5 ký tự base36 = 60M combinations. Hiện đủ. Nhưng nếu cùng năm có >100k PR (mỗi PR vài lần TT) → collision substring càng dễ.
- **Fix**: Tăng width lên 7 hoặc 8.

### Cần test tay
- Gửi POST `curl` vào `/payos-webhook` (route cũ) với payload tự chế chứa `orderCode` của 1 PR pending → có mark paid không? Verify bug 1C-01.
- Gửi webhook 2 lần liên tiếp cùng payload → paid_at có thay đổi không? Verify 1C-03.

---

## Phase 1D — Kích hoạt khóa học (Active Request)

### 🟠 Bug 1D-01: `_validate_course_amounts` fail-open khi query DB lỗi → cho phép vượt budget
- **Role**: Sale tạo AR
- **Bước**: Tạo AR thứ 2 cho PR đã có AR khác → mạng/DB lỗi đúng lúc check
- **Kỳ vọng**: Block → "không xác định được budget".
- **Thực tế**: [`activation_routes.py:453-464`](backend/activation_routes.py:453) — `try/except` bao toàn bộ query AR khác, **except: pass** không log, không raise. AR mới tạo thoải mái, tổng course có thể vượt budget thực.
- **Fix**: Fail-closed: nếu query AR khác lỗi → raise 500 để retry, đừng silent bypass.

### 🟠 Bug 1D-02: Patch AR (uids_data) không có `expected_updated_at` → race overwrite
- **Role**: Sale + Ops edit AR cùng lúc
- **Bước**: Sale mở AR sửa danh sách UID. Ops xác nhận order ID cùng lúc → patch sau ghi đè patch trước.
- **Kỳ vọng**: Optimistic concurrency check (đã có RPC `replace_active_request_uids_data_guarded` line 1087-1119), nhưng **chỉ kích hoạt khi FE gửi `expected_updated_at`**.
- **Thực tế**: [`activation_routes.py:1080`](backend/activation_routes.py:1080) — `if body.expected_updated_at:` — FE phải chủ động gửi. Cần verify FE có gửi không, nếu không → race.
- **Fix**: Bắt buộc `expected_updated_at` cho mọi patch uids_data (raise 400 nếu thiếu).

### 🟡 Bug 1D-03: Backwards-compat shim `customer_name` còn sót
- **Role**: System
- **Thực tế**: [`activation_routes.py:702-707`](backend/activation_routes.py:702) — retry insert nếu DB chưa có column `customer_name`. Hiện tại schema chắc đã có (production đã chạy lâu) → shim này dead code.
- **Fix**: Dọn (per CLAUDE.md "no fallbacks for scenarios that can't happen").

### 🟡 Bug 1D-04: `_assert_pr_paid` cho phép pass nếu `trang_thai` đúng dù `received < target`
- **Role**: Edge case khi state stale
- **Thực tế**: [`activation_routes.py:411-422`](backend/activation_routes.py:411) — `paid_by_state OR paid_by_amount`. Nếu webhook chưa kịp recompute totals nhưng `state` đã set "done" (do trigger), AR vẫn được tạo.
- **Fix**: Đổi sang AND, hoặc recompute totals trước khi check.

### Cần test tay
- 2 tab cùng PR → bấm "Kích hoạt khoá học" gần đồng thời → có tạo 2 AR không? (BE không có guard, dựa vào FE check `arByPrId` mà FE state có thể stale).
- Nhập UID rỗng, courses rỗng → validation FE/BE.
- AR với pr_id null (standalone) → có thể bypass `_validate_course_amounts` cố tình?

---

## Phase 1E — Ops xác nhận + Order ID CRM

### 🔴 Bug 1E-01: Không chặn duplicate `order_id` CRM
- **Role**: Ops (Thu Hiền)
- **Bước**: Course A của AR1 đã có order_id "ORD-12345". Nhầm tay nhập "ORD-12345" cho course B của AR2.
- **Kỳ vọng**: BE chặn — order_id phải unique toàn hệ thống (1 order CRM = 1 course).
- **Thực tế**: [`activation_routes.py:1234-1273`](backend/activation_routes.py:1234) `patch_active_request_course` chỉ gọi RPC `patch_active_request_course_order` — **không scan AR khác để check duplicate**. RPC cũng không chặn vì lưu trong JSONB.
- **Ảnh hưởng**: 1 đơn CRM ghi nhận 2 lần ở 2 PR khác nhau → BC03 trùng doanh thu.
- **Fix**: Trước khi patch, scan `active_requests.uids_data` cho `order_id` này → nếu đã tồn tại → 409.

### 🔴 Bug 1E-02: Sale không có thông báo khi ops xác nhận — đã chốt làm in-app
- **Role**: Sale
- **Bước**: Ops fill order_id → backend sync ledger (line 1266-1270) nhưng **không gửi notify/email/realtime gì cho sale**.
- **Kỳ vọng (theo quyết định anh Minh)**: **In-app notification** — chấm đỏ trên icon B3 + dropdown danh sách.

**Spec fix chi tiết**:

**DB** — bảng mới `notifications`:
- `id`, `user_email` (recipient), `kind` (e.g. `ar_confirmed`, `ar_rejected`, `pr_paid_full`)
- `payload` (JSONB: `{ar_id, pr_id, course_code, order_id, customer_name}`)
- `created_at`, `read_at` (null = chưa đọc)
- Index: `(user_email, read_at, created_at desc)`

**BE**:
1. Khi ops fill order_id thành công ([`activation_routes.py:1266`](backend/activation_routes.py:1266) sau `sync_ledger_from_ar_course`):
   - Lookup `sale_email` của PR
   - Insert `notifications` với `kind="ar_confirmed"`
2. Endpoint mới:
   - `GET /api/v1/notifications?unread=true` → list của user hiện tại
   - `POST /api/v1/notifications/{id}/read` → mark 1 đọc
   - `POST /api/v1/notifications/mark-all-read` → mark all

**FE**:
1. **Icon chuông** ở header (cạnh avatar). Badge chấm đỏ kèm số nếu có unread.
2. **Click chuông** → dropdown 10 thông báo gần nhất, format:
   ```
   [Chấm xanh] AR-2026-0123 đã được xác nhận
   KH Phạm Tâm — gói G-001 → CRM order ORD-12345
   2 phút trước
   ```
3. Click 1 thông báo → mark read + chuyển sang tab B3, mở AR tương ứng.
4. **Polling**: useQuery với `refetchInterval: 30s` (chưa cần WebSocket).
5. **Push-to-tray** (optional sprint 2): nếu `Notification.permission === "granted"` → bắn browser notification.

### 🟠 Bug 1E-03: Ops rút lại order_id (clear) — không log lịch sử
- **Role**: Ops
- **Bước**: Đã fill order_id, sau đó xoá → ledger có rollback không? Log có không?
- **Thực tế**: [`activation_routes.py:1274-1280`](backend/activation_routes.py:1274) — gọi `clear_course_order_id_atomic`, **không sync ledger ngược**, không log audit. Sổ doanh thu vẫn ghi giao dịch cũ nhưng course không có order ID → mismatch.
- **Fix**: Khi clear → cũng phải gọi `sync_ledger_from_ar_course` để ledger remove row tương ứng (hoặc set status "cancelled"); log audit.

### 🟡 Bug 1E-04: Order ID không validate format CRM
- **Role**: Ops nhập tay
- **Bước**: Gõ "abc" hoặc "12" → BE nhận tất.
- **Thực tế**: Không có regex check.
- **Fix**: Regex theo format CRM thực tế (chữ + số, độ dài tối thiểu).

### Cần test tay
- Ops xác nhận → đứng từ máy sale F5 ngay → thấy badge "Đã xác nhận" không?
- Ops xác nhận trên AR có 3 course → fill order_id cho 1 course → 2 course còn lại trạng thái gì?
- Sửa order_id từ ID1 → ID2 → ledger có 2 dòng hay 1 dòng update?

---

## Phase 1F — Nhắc & xuất hóa đơn

### 🟡 Bug 1F-01: BE không chặn nhắc HĐ cho PR chưa thu đủ — defense-in-depth
- **Đính chính 13/06**: Trước ghi 🟠, hạ xuống 🟡. Sau khi check UI thực tế: nút "Nhắc xuất HĐ" ở [`PaymentRequestDetailDrawer.tsx:2000`](frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx:2000) chỉ hiện khi `activeSummary.activatedCount > 0` → PR đã có course activated → tại thời điểm đó PR đã pass `_assert_pr_paid` (thu đủ).
- **Edge case duy nhất còn lại**: Sale tăng "Tổng tiền dự kiến" sau khi AR đã activated → `received < target` → nút vẫn hiện trong UI.
- **Vẫn fix vì**: code ~3 dòng, defense-in-depth chặn được edge case + bảo vệ tương lai nếu UI logic đổi.
- **Fix**: [`payment_request_routes.py:2109`](backend/payment_request_routes.py:2109) `create_invoice_reminder` — sau `_can_access_request`, raise 400 nếu `received < target`.

### 🟠 Bug 1F-02: Không có endpoint huỷ reminder — nhắc nhầm phải chờ 24h
- **Role**: Sale (nhấn nhầm)
- **Bước**: Sale nhắc HĐ PR sai → 24h sau mới nhắc lại PR đúng được (theo throttle).
- **Thực tế**: Code không có `DELETE /invoice-reminders/{id}`. Phải đợi `_has_invoice_since` (line 2149) thoả → invoice phải được xuất trước.
- **Fix**: Thêm endpoint DELETE chỉ cho phép requester xoá reminder của mình trong 5-10 phút.

### 🟡 Bug 1F-03: `list_invoice_reminders` không lọc theo team/sub-team
- **Role**: Kế toán
- **Thực tế**: [`payment_request_routes.py:2185-2186`](backend/payment_request_routes.py:2185) — chỉ check `_is_accountant_or_manager` rồi return all. Nếu nhiều team có kế toán riêng → leak reminders chéo team.
- **Fix**: Filter theo `visible_creator_emails(actor)` giống các route khác.

### 🟡 Bug 1F-04: Reminder không gửi notify thực — chỉ ghi DB
- **Role**: Kế toán
- **Thực tế**: Insert vào `invoice_reminders` xong là hết. Không có email/Slack/push. Kế toán phải tự F5 màn list.
- **Fix**: Tích hợp notify khi tạo reminder (email/Slack webhook).

### 🟡 Bug 1F-05: Throttle 24h tính từ DB timestamp — không có warm-up cho timezone
- **Role**: System edge case
- **Thực tế**: [`payment_request_routes.py:2145-2148`](backend/payment_request_routes.py:2145) — `_parse_iso_datetime(last_remind["requested_at"])` so với `datetime.now(timezone.utc)`. Nếu Supabase trả timestamp thiếu tz (column `timestamp` không phải `timestamptz`) → parse ra naive datetime → so sánh với aware → exception khó hiểu.
- **Fix**: Kiểm tra schema `invoice_reminders.requested_at` là `timestamptz`. Cộng defensive `_parse_iso_datetime` ép tz=UTC.

### Cần test tay
- Nhắc HĐ PR ngay sau khi tạo (chưa thu đồng nào) → có chặn không?
- Nhắc rồi đợi 12h, F5 màn KH → có nút nhắc lại được không (đúng ra phải còn 12h cooldown)?
- 2 sale cùng team nhắc cùng 1 PR liên tiếp → có race tạo 2 reminder không?

---

## Phase 3 — Tài chính / Sổ doanh thu / Báo cáo

### 🟠 Bug 3-01: `GET /revenue/ledger` không scope theo actor (defense-in-depth)
- **Tình trạng theo nghiệp vụ**: Đã chốt — Sổ doanh thu chỉ kế toán + ops xem. Sale không có quyền `revenueLedger:read` → bug này chỉ exposed nếu Phân quyền cấp nhầm.
- **Vẫn cần fix vì**: defense-in-depth. Một ngày nào đó admin lỡ cấp quyền nhầm → leak toàn bộ. Code nên scope ở cả 2 layer (permission + actor scope).
- **Thực tế**: [`revenue_routes.py:1285-1344`](backend/revenue_routes.py:1285) — không gọi `enforce_report_scope`.
- **Fix nhẹ**: Vì kế toán + ops cần xem TẤT CẢ team (đối soát cross-team), chỉ cần scope cho role `sale/leader` (nếu có ai được cấp nhầm): khi `actor.role in ("sale", "leader")` → filter `created_by_email = actor.email`. Manager/ops/system full.

### 🟠 Bug 3-02: `GET /revenue/ledger/summary` cũng KHÔNG scope (defense-in-depth)
- Cùng tình trạng 3-01.

### 🟠 Bug 3-03: Tỷ giá VND/RMB hard-code 3700, không có time-period rates
- **Role**: System
- **Bước**: Nhập dòng cho ngày 30/04, tỷ giá thực 3650, nhưng default 3700 → GMV sai 1.4%.
- **Thực tế**: [`revenue_routes.py:1379`](backend/revenue_routes.py:1379) — `rate = Decimal(str(body.tyGiaVndRmb or 3700))`. Memory `project_exchange_rate_config` xác nhận đây là known issue cần config in-app.
- **Fix**: Thêm bảng `exchange_rates(effective_from, rate)`. Lookup theo `ngay_tien_ve`.

### 🟠 Bug 3-04: `PATCH /revenue/ledger/{id}` recompute `gmv_rmb` dùng tỷ giá row cũ
- **Role**: Finance edit row
- **Bước**: Row tạo từ 6/2025 (rate 3650), giờ sửa số tiền VND
- **Thực tế**: [`revenue_routes.py:1458-1460`](backend/revenue_routes.py:1458) — lấy `ty_gia_vnd_rmb` của row hoặc 3700, recompute GMV. Nếu rate row đã sai thì recompute cũng sai.
- **Fix**: Sau khi có bảng exchange_rates → lookup lại theo `ngay_tien_ve`.

### 🟠 Bug 3-05: `POST /revenue/ledger` không chống nhập tay trùng
- **Role**: Finance/Sale nhập tay
- **Bước**: Nhập 1 dòng `uid + ngay_tien_ve + so_tien_vnd` y hệt 2 lần
- **Thực tế**: Không check tồn tại trước insert. Theo memory `project_sodoanhthu_sync_duplicates` đã có lịch sử dedup 101 dòng GSheet, nhập tay cũng có rủi ro.
- **Fix**: Trước insert, query cùng key → cảnh báo.

### 🟡 Bug 3-06: `DELETE /revenue/ledger/{id}` không check ownership — chỉ check `loai_nhap=tay`
- **Role**: Finance team
- **Thực tế**: [`revenue_routes.py:1470-1488`](backend/revenue_routes.py:1470) — ai có `revenueLedger:write` đều xoá được dòng tay của người khác. Có audit log (line 1482) ✅ nên rollback được.
- **Fix**: Tuỳ policy — nếu chỉ creator + manager xoá → thêm check. Nếu finance share xoá → giữ nguyên.

### Cần test tay
- Login sale, gọi trực tiếp `/revenue/ledger?team=OtherTeam` qua F12 → thấy data không (verify 3-01).
- Sửa số tiền 1 dòng cũ 12 tháng trước → GMV recompute có hợp lý không (verify 3-04).
- Filter sổ theo team, switch sang team khác → có cache stale không?

---

## Phase 4 — Leader / Manager + Dashboard + RBAC scoping

### 🔴 Bug 4-01: `visible_creator_emails` — actor chưa link CRM (staff=None) → leader/manager thấy TOÀN BỘ
- **Role**: Leader hoặc Manager mới chưa được tạo dòng trong `nhan_su_sale`
- **Bước**: Login → mở Module 5 (Sổ doanh thu, có PR)
- **Kỳ vọng**: Không có team → chỉ thấy của mình (degrade về sale-level).
- **Thực tế**: [`rbac.py:241-253`](backend/rbac.py:241) — `staff = actor.staff or {}` → `team = None` → các `if team:` không true → query `nhan_su_sale` không filter → trả về **toàn bộ active emails toàn công ty**.
- **Ảnh hưởng**: Leader/manager mới đang chờ link → tạm thời có quyền xem toàn bộ data như system.
- **Fix**: Nếu role leader/manager mà thiếu `team` → return `[actor.email.lower()]` như sale.

### 🟠 Bug 4-02: `enforce_report_scope` — actor manager không team → BC scope thành "all"
- **Role**: Manager chưa link
- **Thực tế**: [`rbac.py:202`](backend/rbac.py:202) — `if role == "manager" and actor_team:` không true → fall through → return `(requested_team, None)` → manager request bất kỳ team → trả về team đó.
- **Fix**: Khi role manager nhưng thiếu team → raise 403 hoặc force scope = email actor.

### 🟠 Bug 4-03: `/dashboard/filters` không scope → leak danh sách team/sale toàn công ty
- **Role**: Sale (có quyền dashboard)
- **Thực tế**: [`dashboard_routes.py:818-858`](backend/dashboard_routes.py:818) — trả về `teams`, `sales`, `departments` không filter theo actor.
- **Ảnh hưởng**: Sale có thể enumerate toàn bộ nhân sự + team công ty.
- **Fix**: Filter theo `visible_creator_emails(actor)` hoặc role >= leader mới thấy full.

### 🛠️ Task 4-04 (KHÔNG phải bug — cấu hình phân quyền cho chị Thu Hiền)
- **Bối cảnh**: Chị Thu Hiền là nhân sự đặc biệt, đảm nhiệm nhiều trách nhiệm (đối soát + ops + xác nhận AR). Hiện code đang nâng role `ops` → `system` cho thuận tiện — anh Minh xác nhận đây không phải bug, chỉ là **cấu hình linh động**.
- **Việc cần làm**: Setup permission cho user Thu Hiền theo bảng dưới để bỏ những module không liên quan (Tài khoản Auth, Phân quyền sử dụng).

**Spec phân quyền chuẩn cho role `ops`** (Thu Hiền):

| Module | Quyền | Lý do nghiệp vụ |
|--------|-------|-----------------|
| Đối soát (B2) | **Full** | Đối soát giao dịch ngân hàng |
| Kích hoạt khoá học (B3) | **Full** | Xác nhận AR, fill order ID CRM |
| Xuất hóa đơn (B4) | **Full** | Xử lý yêu cầu xuất HĐ |
| Sổ doanh thu (M5) | **Full** | Đối soát cuối kỳ |
| Báo cáo BC01 | **Full** | Báo cáo doanh thu |
| Báo cáo BC02 | **Full** | Báo cáo phương thức TT |
| Báo cáo BC03 | **Full** | Báo cáo CRM |
| Thông tin cá nhân | **View self** | Xem thông tin của chính mình |
| Tài khoản Auth | **❌ None** | Không cần — của system |
| Phân quyền sử dụng | **❌ None** | Không cần — của system |
| Quản lý thanh toán (B1) | **View only** (xem PR để đối chiếu) | Không tạo/sửa PR — đó là sale |
| Bảng thông tin / M6 Dashboard Sale | **View** | Đối chiếu hiệu suất khi cần |

**Fix code**:
1. **BE** — bỏ dòng `if r in ("ops", "admin"): return "system"` ở [`rbac.py:28-29`](backend/rbac.py:28). Thêm "ops" vào `ROLE_RANK`: `{"sale": 1, "ops": 2, "leader": 2, "manager": 3, "system": 4}` (ngang leader về rank, khác về scope).
2. **DB** — thêm phòng ban "ops" hoặc gán cho user Thu Hiền 1 set permission_overrides theo bảng trên.
3. **`_compute_permissions`** ([`admin_routes.py:211`](backend/admin_routes.py:211)) — bypass condition cho "ops" để không đi nhánh "system = full".
4. **Migration**: tạo `department_permissions` cho department "ops" với access_level theo bảng trên.
5. **Test**: login chị Hiền → tab Tài khoản Auth + Phân quyền **không hiện** trong sidebar.

### 🟡 Bug 4-05: `/dashboard/today-honors` leaderboard toàn công ty
- **Role**: Mọi user
- **Thực tế**: [`dashboard_routes.py:1270-1297`](backend/dashboard_routes.py:1270) — top 3 không filter. Có thể intended (gamification BXH toàn công ty), nhưng nếu UX muốn BXH theo team thì phải scope.

### Cần test tay
- Tạo 1 user role manager nhưng chưa thêm vào `nhan_su_sale` → đăng nhập, gọi `/payment-requests` → thấy bao nhiêu PR? (verify 4-01)
- Sửa `user_metadata.role` qua Supabase Studio thành "manager" cho 1 sale → có escalation không?

---

## Phase 5 — Sync / CRM / GSheet / PayOS poll

### 🔴 Bug 5-01: `POST /crm/sync` không có authentication
- **Role**: Anonymous attacker hoặc internal abuse
- **Bước**: `curl -X POST https://api.../crm/sync -d '{"sync_date":"2026-06-13"}'`
- **Kỳ vọng**: 401 nếu thiếu token, 403 nếu không phải manager+.
- **Thực tế**: [`crm_routes.py:1405-1431`](backend/crm_routes.py:1405) — signature không có `authorization: Header(None)`, **không gọi `resolve_actor`**. Bất kỳ ai cũng trigger được.
- **Ảnh hưởng**: 
  - Cost: mỗi sync gọi CRM API hàng nghìn request → ăn rate limit CRM, treo sync thực.
  - Data: có thể trigger sync ngày bậy → overwrite data sai (incremental upsert (sale_name, report_date)).
- **Fix gấp**: Thêm `resolve_actor` + `require_min_role(actor, "manager")`.

### 🔴 Bug 5-02: `POST /crm/sync/backfill` cùng lỗi 5-01 — backfill song song N ngày
- **Thực tế**: [`crm_routes.py:1433-1446`](backend/crm_routes.py:1433) — không auth. Attacker gửi range lớn, concurrency=8 → DoS CRM + bill cao.
- **Fix**: Như 5-01.

### 🟠 Bug 5-03: `/crm/token-status` public — lộ trạng thái hệ thống cho người ngoài
- **Thực tế**: [`crm_routes.py:1384-1403`](backend/crm_routes.py:1384) — không auth. Trả `{hasToken, updatedAt}`.
- **Ảnh hưởng**: Attacker biết được khi nào hệ thống có/không token CRM → timing attack hoặc social-engineering window.
- **Fix**: Thêm `resolve_actor` + `require_min_role(actor, "leader")`.

### 🟠 Bug 5-04: Dedup GSheet `_loose_fp_blank` — 2 KH cùng ngày cùng số tiền có thể mất 1 dòng
- **Role**: System (sync)
- **Bước**: Sale A KH-X 5tr ngày 13/6, Sale B KH-Y 5tr ngày 13/6. Đợt sync 1: uid trống cả 2. Đợt sync 2: uid điền đầy đủ.
- **Thực tế**: [`gsheet_ledger_import.py:393-398`](backend/gsheet_ledger_import.py:393) — `_loose_fp_blank` key = `|date|amount` không phân biệt KH → ngân sách count=2 → đợt 2 cả 2 dòng "uid mới" đều bị skip vì loose match.
- **Fix**: Bổ sung thông tin thứ 3 vào loose key (e.g. ten_khach normalized hoặc SĐT) để giảm collision.

### 🟡 Bug 5-05: DingTalk `GMV×1000` — verify auto-fix đang chạy
- **Role**: System
- **Thực tế**: Memory `project_dingtalk_locale_bug` ghi đã có auto-fix. Cần grep verify fix vẫn còn trong code, không bị accident remove.
- **Action**: Em sẽ grep ở pass test tay.

### Cần test tay
- `curl -X POST https://api.../crm/sync -d '{"sync_date":"2026-06-13"}'` không có token → có chạy được không? (verify 5-01)
- 2 dòng cùng ngày cùng số tiền (test với 2 sale) → sync 2 đợt → kết quả?
- Verify `_apply_dingtalk_fix` hoặc tương tự còn trong code không.

---

## Phase 6 — Cross-cutting RBAC / Auth / Permissions

### 🟠 Bug 6-01: `_compute_permissions` exception khi đọc DB → 500 cho user thường
- **Role**: Mọi user
- **Bước**: DB chậm hoặc network lỗi giữa BE và Supabase
- **Thực tế**: [`admin_routes.py:234-235`](backend/admin_routes.py:234) — `except Exception as exc: raise HTTPException(500, ...)`. Một request lỗi → toàn bộ check permission lỗi → user thấy lỗi 500 thay vì retry hoặc fallback.
- **Fix**: Retry 1-2 lần, log cảnh báo, hoặc fallback về role-based default.

### 🟠 Bug 6-02: `permission_overrides` swallow exception → user mất quyền không log
- **Role**: User có override
- **Thực tế**: [`admin_routes.py:265-266`](backend/admin_routes.py:265) — `except Exception: pass` (silent). Nếu query overrides lỗi, user mất quyền cá nhân mà không biết.
- **Fix**: Log warning.

### 🟡 Bug 6-03: `_lookup_staff` exception → fallback metadata role (line 137-138)
- **Role**: User với metadata role
- **Thực tế**: [`rbac.py:103-105`](backend/rbac.py:103) — staff lookup fail print + return None. Sau đó dùng metadata role. Nếu attacker control được `user_metadata.role` → escalation.
- **Verify**: Supabase Auth chỉ admin (service role key) sửa metadata được. Nhưng nếu có client-side `updateUser({data: {role: 'manager'}})` chạy được → escalation. Cần test.

### Cần test tay
- Login làm sale, mở DevTools Console: `supabase.auth.updateUser({data: {role: "system"}})` → có escalate được không?
- Tạo `permission_overrides` row sai schema → user vẫn login được chứ?
- Mạng chập chờn giữa BE và Supabase → permission check có retry không?
