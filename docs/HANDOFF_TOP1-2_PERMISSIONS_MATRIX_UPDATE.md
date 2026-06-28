# HANDOFF — TOP 1.2: Cập nhật bảng "Phân quyền sử dụng" cho đủ + đúng module

**Origin:** Feedback họp 25/06/2026 (anh Minh bổ sung 26/06). Bảng phân quyền đang thiếu module mới (Đồng bộ mPOS/Payoo, Zalo OA) và gate "ăn ké" sai key.

**Quyết định (anh Minh chốt):**
- Thêm **3 mục riêng** vào bảng: (1) "Đối soát giao dịch mPOS/Payoo", (2) "Đồng bộ mPOS/Payoo", (3) "Zalo OA".
- KHÔNG thêm mục "Phân quyền sử dụng" (giữ admin-only như hiện tại).
- mPOS/Payoo (cả đối soát lẫn đồng bộ) là việc của **kế toán** → mặc định nhóm Sale = "Không có quyền".

**Estimated effort:** ~3h. FE + BE. KHÔNG cần DB migration (xem mục "Vì sao không cần migration").

**Dependency:** Làm SAU TOP1.1 (TOP1.1 đã tạo view `reconCard` và để `can("reconCard")` tạm map về `reconciliation`; task này tách hẳn key).

---

## Bối cảnh code (đã verify)

Bảng phân quyền lấy danh sách module từ **HAI nguồn phải khớp tay**:
- FE: `frontend/src/types/permissions.ts` → `MODULE_LIST` (13 module) + `DEFAULT_PERMISSIONS`.
- BE: `backend/admin_routes.py` → `MODULE_LIST` (dòng 122, hiện 14 — có thêm `"permissions"`) + `DEFAULT_DEPT_PERMISSIONS` (dòng 142).

Cơ chế tính quyền (`_compute_permissions`, admin_routes.py:237): bắt đầu all-`none` → áp `DEFAULT_DEPT_PERMISSIONS` → overlay row DB `department_permissions` → áp min_role → overlay `permission_overrides`. **system/admin → full hết** (bypass, dòng 240-243).

Gate hiện tại (SAI/ăn ké):
- `MainPage.can()` (dòng 255-256): `gatewaySync` ăn ké key `reconciliation`; `zaloConfig/zaloGroups/zaloOutbox` ăn ké key `permissions` (mà `permissions` không có trong FE MODULE_LIST → bảng không render).
- BE `gateway_routes.py`: 5 endpoint dùng `require_module_access/write(..., "reconciliation")` (dòng 302, 342, 422, 460, 489).
- BE zalo endpoints trong `admin_routes.py` (~1300-1471): dùng `require_min_role(actor, "manager")` — KHÔNG theo module key.

---

## Scope

### IN scope
1. FE `permissions.ts`: thêm 3 module `reconCard`, `gatewaySync`, `zalo` vào `MODULE_LIST` + `DEFAULT_PERMISSIONS`; đổi nhãn `reconciliation` → "Đối soát giao dịch (Chuyển khoản)".
2. BE `admin_routes.py`: thêm 3 key tương ứng vào `MODULE_LIST` + `DEFAULT_DEPT_PERMISSIONS` (KHỚP FE từng chữ).
3. FE `MainPage.can()`: gate đúng key (`reconCard`, `gatewaySync`, `zalo`).
4. BE `gateway_routes.py`: 5 endpoint `reconciliation` → `reconCard`.
5. BE zalo endpoints: `require_min_role(manager)` → `require_module_access/write(zalo)`.

### OUT of scope
- KHÔNG thêm module `permissions` vào FE bảng (giữ admin-only qua `canManageStaff`).
- KHÔNG viết DB migration (defaults tự áp — xem dưới).
- KHÔNG đổi cơ chế `_compute_permissions`, override, min_role downgrade.
- KHÔNG đụng tab SePay `reconciliation` (chỉ đổi LABEL của nó).
- KHÔNG refactor 2 MODULE_LIST thành 1 nguồn (ghi nhận ở mục cuối, để task riêng).

---

## Vì sao KHÔNG cần migration
`_compute_permissions` luôn khởi tạo từ `DEFAULT_DEPT_PERMISSIONS` rồi mới overlay DB. Module mới chưa có row DB → tự lấy default. Bảng FE render theo `MODULE_LIST`; ô chưa có row → hiện `"none"` (hoặc default). Khi admin bấm đổi → `patchPermission` tạo row DB. ⇒ Chỉ cần sửa code 2 nguồn + defaults là đủ.
(Endpoint `seedPermissions` chỉ chạy khi bảng RỖNG hoàn toàn — KHÔNG tự thêm module mới vào DB đã seed; nhưng không sao vì default đã lo.)

---

## Files cần sửa

### 1. `frontend/src/types/permissions.ts`

**1a. `MODULE_LIST` (dòng 44-63).** Đổi label `reconciliation` + chèn 3 module:
```ts
// Đổi dòng reconciliation (dòng 49):
{ key: "reconciliation", label: "Đối soát giao dịch (Chuyển khoản)", description: "So khớp chuyển khoản SePay", section: "Đối soát & Hóa đơn" },
// THÊM ngay sau reconciliation:
{ key: "reconCard", label: "Đối soát giao dịch mPOS/Payoo", description: "So khớp giao dịch quẹt thẻ với lần thanh toán", section: "Đối soát & Hóa đơn" },
// THÊM ngay sau module6 (dòng 59), trong section "Dữ liệu":
{ key: "gatewaySync", label: "Đồng bộ mPOS/Payoo", description: "Kéo giao dịch mPOS & Payoo về app qua tiện ích", section: "Dữ liệu" },
// THÊM ngay sau gatewaySync — section MỚI "Quản trị" (đặt TRƯỚC authAccounts để section nằm đúng thứ tự):
{ key: "zalo", label: "Zalo OA", description: "Cấu hình OA, nhóm thông báo, outbox", section: "Quản trị" },
```
> `MODULE_SECTIONS` (dòng 66) tự sinh từ thứ tự `MODULE_LIST` → đặt `zalo` (section "Quản trị") giữa `module6` (Dữ liệu) và `authAccounts` (Tài khoản & Quyền) để section "Quản trị" xuất hiện đúng chỗ.

**1b. `DEFAULT_PERMISSIONS` (dòng 77-106).** Thêm 3 key vào CẢ 4 dept. mPOS/Payoo + Zalo = việc kế toán/back-office (hr):
```ts
// sale:      reconCard: "none", gatewaySync: "none", zalo: "none",
// hr:        reconCard: "full", gatewaySync: "full", zalo: "full",
// marketing: reconCard: "none", gatewaySync: "none", zalo: "none",
// cs:        reconCard: "none", gatewaySync: "none", zalo: "none",
```
(Thêm 3 cặp key:value vào từng object dept. GIỮ nguyên các key cũ — đặc biệt `reconciliation` của sale vẫn `"full"`.)

### 2. `backend/admin_routes.py`

**2a. `MODULE_LIST` (dòng 122-137).** Thêm 3 key (khớp FE):
```python
MODULE_LIST = [
    "dashboard", "paymentRequests",
    "reconciliation", "reconCard",
    "module3", "module4",
    "revenueLedger", "bc01", "bc02", "bc03",
    "module5", "module6", "gatewaySync",
    "zalo",
    "authAccounts", "profile", "permissions",
]
```

**2b. `DEFAULT_DEPT_PERMISSIONS` (dòng 142-171).** Thêm 3 key vào 4 dept, GIỐNG HỆT FE:
```python
# sale:      "reconCard": "none", "gatewaySync": "none", "zalo": "none",
# hr:        "reconCard": "full", "gatewaySync": "full", "zalo": "full",
# marketing: "reconCard": "none", "gatewaySync": "none", "zalo": "none",
# cs:        "reconCard": "none", "gatewaySync": "none", "zalo": "none",
```
> ⚠️ FE `permissions.ts` và BE `admin_routes.py` PHẢI khớp từng key + default. Lệch → matrix hiển thị sai.

### 3. `frontend/src/pages/MainPage.tsx` — `can()` (dòng 252-259)

Sửa mapping cuối cùng (sau TOP1.1):
```ts
const can = (key: string) => {
  const k = key === "zaloConfig" || key === "zaloGroups" || key === "zaloOutbox" ? "zalo"
    : key;
  return isDevMode || (perms[k] ?? "none") !== "none";
};
```
> `reconCard` và `gatewaySync` giờ là key thật → KHÔNG cần map nữa (dùng trực tiếp). Bỏ hẳn nhánh `reconCard/gatewaySync → reconciliation` của TOP1.1.

### 4. `backend/gateway_routes.py` — 5 endpoint

Đổi `"reconciliation"` → `"reconCard"`:
- dòng 302 `require_module_access(sb, actor, "reconciliation")` → `"reconCard"` (GET /gateway-txns)
- dòng 342 → `"reconCard"` (match-candidates)
- dòng 422 `require_module_write(... "reconciliation")` → `"reconCard"` (PATCH /match)
- dòng 460 `require_module_write(... "reconciliation")` → `"reconCard"` (PATCH /status)
- dòng 489 `require_module_access(... "reconciliation")` → `"reconCard"` (GET /gateway-sync/status)

> Lưu ý: `gatewaySync` (tab "Đồng bộ mPOS/Payoo") KHÔNG có endpoint nào gate bằng nó — ingest từ extension dùng token riêng (`X-GATEWAY-EXT-TOKEN`, dòng 224/266), và `/gateway-sync/status` thuộc về tab đối soát (`reconCard`). Vậy key `gatewaySync` ở task này chỉ **gate hiển thị sidebar (FE)**. Đúng và đủ — KHÔNG cần thêm endpoint.

### 5. `backend/admin_routes.py` — endpoint Zalo

Tìm tất cả endpoint Zalo:
```
grep -n "zalo" backend/admin_routes.py | grep -i "@app\.\|require_min_role"
```
Đã biết: `zalo-groups` (GET list / POST create / GET one / PATCH / DELETE, ~1300-1365), `zalo-outbox` (GET 1370, POST retry 1379), `zalo-config` (GET 1401, POST 1436, POST test 1460). Tất cả đang `require_min_role(actor, "manager")`.

Đổi theo quy tắc:
- Endpoint **đọc** (GET): `require_min_role(actor, "manager")` → `require_module_access(sb, actor, "zalo")`
- Endpoint **ghi** (POST/PATCH/DELETE/retry/test): `require_min_role(actor, "manager")` → `require_module_write(sb, actor, "zalo")`

(`require_module_access`/`require_module_write` đã import sẵn — chúng định nghĩa cùng file. `require_module_write` yêu cầu level `full`.)

> ⚠️ **Thay đổi hành vi (cần biết khi test):** Trước đây BẤT KỲ manager+ nào (mọi phòng ban) đều vào được Zalo. Sau khi đổi, Zalo theo matrix: mặc định chỉ `hr` = full. Manager phòng Sale sẽ MẤT quyền Zalo trừ khi admin cấp qua bảng phân quyền hoặc override cá nhân. Đây là chủ ý ("đúng nhất"). Nếu cần giữ ai đó → admin cấp trong tab Phân quyền.

---

## Acceptance criteria

1. Mở tab "Phân quyền sử dụng" (login `test.admin@dev`) → bảng có thêm 3 dòng: **Đối soát giao dịch mPOS/Payoo**, **Đồng bộ mPOS/Payoo** (mục "Dữ liệu"), **Zalo OA** (mục "Quản trị"). Dòng SePay đổi tên thành "Đối soát giao dịch (Chuyển khoản)".
2. KHÔNG có dòng "Phân quyền sử dụng" trong bảng.
3. Mặc định: nhóm "Bán hàng" = "Không có quyền" ở cả 3 module mới; nhóm "Nhân sự & Quản trị" = "Toàn quyền".
4. Bấm đổi ô (vd cho Sale `reconCard` = Chỉ xem) → lưu OK (`PATCH /admin/permissions`), reload giữ giá trị.
5. Tài khoản Sale (KHÔNG được cấp) → sidebar KHÔNG thấy "Quẹt thẻ", "Đồng bộ mPOS/Payoo", "Zalo OA"; gọi thẳng API `GET /api/v1/gateway-txns` → 403.
6. Tài khoản hr/admin → thấy đủ + dùng được.
7. `cd frontend && npx tsc -b` PASS. `cd backend && python -m pytest` các test liên quan PASS.

---

## Test plan

```bash
cd frontend && npx tsc -b
cd backend && python -m pytest tests/test_gateway_routes.py -q
```
Manual (sandbox):
1. `test.admin@dev` → Phân quyền → confirm 3 dòng mới + nhãn SePay + default đúng.
2. Cấp Sale `reconCard`=Chỉ xem → login `test.user@dev` (Sale) → thấy tab "Quẹt thẻ" chỉ xem, KHÔNG thấy "Đồng bộ mPOS/Payoo"/"Zalo OA".
3. Thu quyền lại → tab biến mất.
4. Regression: SePay (`reconciliation`) của Sale vẫn full như cũ.

---

## Anti-patterns (đừng làm)
1. ĐỪNG để FE `permissions.ts` lệch BE `admin_routes.py` (key + default phải KHỚP).
2. ĐỪNG thêm `permissions` vào FE MODULE_LIST.
3. ĐỪNG viết migration drop/insert (default tự lo).
4. ĐỪNG đổi default `reconciliation` của Sale (vẫn full) — chỉ THÊM `reconCard`=none.
5. ĐỪNG để sót endpoint zalo nào còn `require_min_role` (grep kiểm).
6. ĐỪNG quên: `gatewaySync` không cần endpoint BE — chỉ sidebar.
7. ĐỪNG ship khi `tsc -b` hoặc pytest chưa pass.

## Out-of-scope catch / nợ kỹ thuật
- 2 `MODULE_LIST` (FE+BE) trùng lặp tay = nguồn lỗi lệch. Đề xuất task riêng: BE expose 1 endpoint trả MODULE_LIST cho FE đọc, hoặc thêm 1 test so khớp 2 list. KHÔNG làm trong task này.
- Nếu phát hiện chỗ khác còn hard-code `"reconciliation"` cho mPOS/Payoo (vd revenue_routes, report_routes) → kiểm tra ngữ cảnh; chỉ đổi nếu đúng là đối soát quẹt thẻ.
