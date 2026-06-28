# HANDOFF (Backend) — Gói task Backend App GMV — Feedback họp 25/06/2026

**Dành cho:** 1 BE dev bất kỳ (Giang / Đức / Đạt — ai nhận cũng được, làm trọn gói).

Gộp các phần **Backend** của 2 task để làm 1 mạch. Phần FE giao FE dev (handoff riêng).

| Phần | Nội dung | File chính | Phụ thuộc |
|---|---|---|---|
| **A** | TOP1.2-BE: Tách quyền mPOS/Payoo + Zalo trong phân quyền | `gateway_routes.py`, `admin_routes.py` | Khớp FE `permissions.ts` (FE dev) + ship cùng |
| **B** | TOP2.2: Tin Zalo báo thanh toán thêm Sale + Team | migration SQL + `utils/zalo_message_builder.py` | Độc lập, làm bất kỳ lúc nào |

> Chi tiết đầy đủ + bối cảnh từng task: [TOP1.2](HANDOFF_TOP1-2_PERMISSIONS_MATRIX_UPDATE.md) và [TOP2.2](HANDOFF_TOP2-2_ZALO_MESSAGE_SALE_TEAM.md). File này là bản BE-only tự đủ để code.

KHÔNG cần DB migration cho Phần A (default tự áp). Phần B có 1 migration SQL.

---

# PHẦN A — TOP1.2-BE: Tách quyền (mPOS/Payoo đối soát, mPOS/Payoo đồng bộ, Zalo OA)

## Vấn đề nghiệp vụ
Bảng "Phân quyền sử dụng" đang thiếu/ăn ké key:
- Đối soát + Đồng bộ mPOS/Payoo đang dùng chung quyền với SePay (`reconciliation`) → không cấp tách được.
- Zalo OA đang gate bằng `require_min_role(manager)` (mọi phòng) → không theo bảng phân quyền.

Cần 3 key riêng: `reconCard` (đối soát quẹt thẻ), `gatewaySync` (đồng bộ mPOS/Payoo), `zalo` (Zalo OA). mPOS/Payoo = việc kế toán → mặc định Sale = none.

## A1. `backend/admin_routes.py` — `MODULE_LIST` (dòng 122-137)
Thêm 3 key (PHẢI khớp y hệt FE `permissions.ts` mà FE dev thêm):
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

## A2. `backend/admin_routes.py` — `DEFAULT_DEPT_PERMISSIONS` (dòng 142-171)
Thêm 3 key vào CẢ 4 dept (khớp FE):
```python
# sale:      "reconCard": "none", "gatewaySync": "none", "zalo": "none",
# hr:        "reconCard": "full", "gatewaySync": "full", "zalo": "full",
# marketing: "reconCard": "none", "gatewaySync": "none", "zalo": "none",
# cs:        "reconCard": "none", "gatewaySync": "none", "zalo": "none",
```
GIỮ nguyên key cũ — đặc biệt `reconciliation` của sale vẫn `"full"` (SePay sale vẫn làm).

## A3. `backend/gateway_routes.py` — 5 endpoint: `reconciliation` → `reconCard`
- dòng 302 `require_module_access(sb, actor, "reconciliation")` → `"reconCard"` (GET /gateway-txns)
- dòng 342 → `"reconCard"` (GET match-candidates)
- dòng 422 `require_module_write(... "reconciliation")` → `"reconCard"` (PATCH /match)
- dòng 460 `require_module_write(... "reconciliation")` → `"reconCard"` (PATCH /status)
- dòng 489 `require_module_access(... "reconciliation")` → `"reconCard"` (GET /gateway-sync/status)

> `gatewaySync` KHÔNG có endpoint nào — ingest từ extension dùng token riêng (`X-GATEWAY-EXT-TOKEN`). Key `gatewaySync` chỉ để FE ẩn/hiện sidebar. KHÔNG thêm endpoint.

## A4. `backend/admin_routes.py` — endpoint Zalo: `require_min_role(manager)` → module key `zalo`
Tìm hết:
```
grep -n "@app\.\(get\|post\|patch\|delete\).*zalo\|require_min_role" backend/admin_routes.py
```
Đã biết các endpoint zalo: `zalo-groups` (list/create/get/patch/delete ~1300-1365), `zalo-outbox` (GET 1370, retry POST 1379), `zalo-config` (GET 1401, POST 1436, test POST 1460). Tất cả đang `require_min_role(actor, "manager")`.

Đổi theo quy tắc:
- GET (đọc): `require_min_role(actor, "manager")` → `require_module_access(sb, actor, "zalo")`
- POST/PATCH/DELETE/retry/test (ghi): `require_min_role(actor, "manager")` → `require_module_write(sb, actor, "zalo")`

(2 hàm này định nghĩa sẵn trong `admin_routes.py`. `require_module_write` đòi level `full`.)

> ⚠️ **Đổi hành vi (test kỹ):** trước đây mọi manager+ (mọi phòng) vào được Zalo; sau đổi chỉ theo bảng phân quyền (mặc định `hr` full). Manager phòng Sale MẤT Zalo trừ khi admin cấp/override. Đây là chủ ý.

## A5. Phối hợp FE (FE dev làm, BE dev biết để khớp)
- FE thêm 3 key giống hệt vào `frontend/src/types/permissions.ts` (`MODULE_LIST` + `DEFAULT_PERMISSIONS`) và sửa `MainPage.can()` map `zaloConfig/zaloGroups/zaloOutbox → "zalo"`, `reconCard`/`gatewaySync` thành key thật.
- **2 nguồn MODULE_LIST (FE + BE) lệch nhau là vỡ bảng** → BE dev + FE dev so key/default trước khi merge.
- **Deploy cùng nhau**: nếu BE đổi gate sang `reconCard`/`zalo` mà FE chưa lên (chưa có key + chưa được cấp) → user mất quyền (403) tới khi FE lên + admin cấp. Ship BE+FE TOP1.2 chung 1 đợt, sau TOP1.1.

## A6. Test phần A
```bash
cd backend && python -m pytest tests/test_gateway_routes.py -q
```
Manual (sandbox): admin → bảng phân quyền có 3 dòng mới + default đúng; cấp Sale `reconCard`=Chỉ xem → Sale thấy tab Quẹt thẻ (chỉ xem), không thấy Đồng bộ/Zalo; gọi thẳng `GET /api/v1/gateway-txns` bằng tài khoản không quyền → 403; SePay (`reconciliation`) của Sale vẫn full.

---

# PHẦN B — TOP2.2: Tin Zalo báo thanh toán thêm tên Sale + tên team

## Bối cảnh QUAN TRỌNG
Tin "💰 Đã vào..." build bằng **Postgres function** `public.build_payment_paid_message` (gọi bởi trigger `fn_payment_paid_zalo_notify` → chèn `zalo_outbox` → worker gửi). **KHÔNG** phải hàm Python. Hàm Python `utils/zalo_message_builder.py` là bản song song không chạy runtime (chỉ test) — sửa để khỏi lệch.
Function đã SELECT sẵn `ns.team` (`v_sale_team`) + `ns.display_name` (`v_sale_name`); tên sale đã in, **thiếu team**.

## B1. MỚI `backend/migrations/2026-06-26-zalo-msg-add-sale-team.sql`
`CREATE OR REPLACE` 2 function (trigger KHÔNG đổi). Nội dung đầy đủ ở [HANDOFF_TOP2-2](HANDOFF_TOP2-2_ZALO_MESSAGE_SALE_TEAM.md) mục "Files cần tạo / sửa → 1". Tóm tắt thay đổi format:
```sql
-- build_payment_paid_message:
RETURN format(
  '💰 Đã vào - KH %s | Sale %s · Team %s | %sđ | %s',
  COALESCE(v_customer, '?'),
  COALESCE(v_sale_name, v_sale_email, '?'),
  COALESCE(NULLIF(v_sale_team, ''), '?'),
  v_amount_fmt,
  COALESCE(v_time_fmt, '?')
);
-- build_course_activated_message: thêm '· Team %s' với COALESCE(NULLIF(v_sale_team,''),'?')
```
> Nếu anh Hiếu gửi "format thống nhất" → chỉ đổi literal trong `format(...)`, giữ thứ tự tham số.

## B2. Áp migration: SANDBOX trước → PROD sau
- Sandbox `palfish-gmv-sandbox` (ref `pxgybyfiwywksesyogti`) → chạy SQL → test.
- Prod `project_palfish` (ref `jozcvbbypwvzaefteoxn`) → chạy y hệt.
`CREATE OR REPLACE` idempotent, không đụng trigger/outbox đang chạy. Tin cũ giữ nguyên, tin mới có team.

## B3. Đồng bộ hàm Python + test
- `utils/zalo_message_builder.py` `build_payment_paid_message` (dòng 115-118): thêm team:
```python
team_display = _clean(sale_info.get("team")) or canonical_team or "?"
message = (
    f"💰 PAID — KH {customer} | {amount} "
    f"| sale {sale_name} · team {team_display} | {method} | {time_str}"
)
```
(tương tự `build_course_activated_message` nếu muốn parity)
- Cập nhật assert trong `backend/tests/test_zalo_notifier.py` / `test_zalo_integration.py` cho khớp + thêm case có/không team.

## B4. Test phần B
```bash
cd backend && python -m pytest tests/test_zalo_notifier.py tests/test_zalo_integration.py -q
```
SQL nhanh trên sandbox:
```sql
SELECT public.build_payment_paid_message(pl.*)
FROM public.payment_lines pl
JOIN public.payment_requests pr ON pr.id = pl.payment_request_id
JOIN public.nhan_su_sale ns ON ns.email ILIKE pr.sale_email
LIMIT 1;   -- kỳ vọng chuỗi có "Team <tên>"
```

---

# Anti-patterns toàn gói (đừng làm)
1. ĐỪNG để FE↔BE MODULE_LIST lệch (phần A). So key + default trước merge.
2. ĐỪNG thêm `permissions` vào FE bảng; ĐỪNG đổi default `reconciliation` của Sale.
3. ĐỪNG để sót endpoint zalo còn `require_min_role` (grep kiểm).
4. ĐỪNG tưởng sửa hàm Python là xong phần B — đường thật là **Postgres function**.
5. ĐỪNG áp migration thẳng prod khi chưa test sandbox.
6. ĐỪNG deploy BE phần A lệch nhịp FE (kẻo user 403).
7. ĐỪNG ship khi `pytest` chưa pass.
