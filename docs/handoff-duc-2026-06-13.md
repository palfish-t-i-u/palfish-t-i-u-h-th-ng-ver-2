# Handoff Đức — 13/06/2026

> 6 việc BE hôm nay, **chia 2 commits riêng** (vì thuộc 2 PR khác nhau).
> Tổng ước ~5-7h. Tất cả push lên branch `sandbox`.
> Đọc lại context đầy đủ ở [docs/bug-hunt-report-2026-06-13.md](bug-hunt-report-2026-06-13.md).

## 📌 Đính chính (13/06, sau khi anh Minh check UI thực tế)

- **Việc 5 (1F-01 nhắc HĐ)**: priority hạ từ 🔴 xuống **🟡 defense-in-depth**. Bình thường UI đã chặn (nút chỉ hiện khi PR có course activated). Vẫn làm vì code nhỏ + tốt cho edge case sale tăng target sau. Xem chi tiết ở Việc 5.
- Các Việc 1, 2, 3, 4, 6: không thay đổi, vẫn priority gốc.

## Tổng quan 2 commits

| Commit | Thuộc PR | Việc | Thời gian |
|--------|----------|------|-----------|
| **Commit 1** | PR1 (mixed BE+FE) | Endpoint `POST /payment-requests/{id}/restore` (Việc 1) | ~30 phút |
| **Commit 2** | PR2 (toàn BE) | 5 bug đối soát chính xác (Việc 2-6) | ~4-5h |

Khi sandbox merge lên main qua squash-merge, Commit 1 sẽ được squash chung với commit FE của Claude → 1 commit cuối cho PR1. Commit 2 stand-alone = 1 commit cuối cho PR2.

## Setup

```bash
git checkout sandbox
git pull origin sandbox
cd backend && powershell ./run.ps1  # BE sandbox: http://localhost:8000
```

Test bằng Postman/curl với token từ Supabase sandbox (xem [`.env.sandbox`](../backend/.env.sandbox)).

---

## Việc 1 — Endpoint mới `POST /payment-requests/{id}/restore` (PR1)

**Bối cảnh nghiệp vụ**: Hiện nút "Khôi phục PR" trong tab "Đã huỷ" của màn Quản lý thanh toán chỉ là hiệu ứng giả ở FE — không lưu xuống DB → F5 thì PR sống lại cancelled. Cần endpoint BE để restore thật.

**Spec**:
- Method + path: `POST /payment-requests/{payment_request_id}/restore`
- Auth: `require_module_write(sb, actor, "paymentRequests")` (như endpoint cancel)
- Body: không cần
- Logic:
  1. Fetch PR, check tồn tại (404 nếu không)
  2. Check `_can_access_request(sb, actor, pr_row)` (403 nếu không)
  3. Nếu `state != "cancelled"` → raise 400 "PR khong o trang thai cancelled"
  4. Recompute state từ payment_lines (gọi `recompute_payment_request_totals` hoặc tính từ `received` vs `target`):
     - received = 0 → "pending"
     - 0 < received < target → "short"
     - received == target → "done"
     - received > target → "over"
  5. Update PR: `state = <new>`, `cancelled_at = NULL`, `cancelled_reason = NULL`
  6. Return PR đã restore (dùng `_serialize_payment_request_list_item`)

**File**: [`backend/payment_request_routes.py`](../backend/payment_request_routes.py) — thêm sau hàm `cancel_payment_request` (line 1418-1490).

**Test curl**:
```bash
# 1. Tạo PR test, set state = cancelled trong Supabase Studio
# 2. Restore
curl -X POST https://palfish-gmv-api-sandbox.onrender.com/payment-requests/PR-2026-XXXX/restore \
  -H "Authorization: Bearer <sandbox token>"
# Kỳ vọng: 200 + payment_request với state pending/short/done/over (theo received)
# 3. Test restore PR đang pending → kỳ vọng 400
```

---

## Việc 2 — Webhook match exact thay vì substring (Bug 1C-02, PR2)

**Bối cảnh nghiệp vụ**: Khi đối soát giao dịch QR, hệ thống có thể ghi nhận tiền của KH-A vào PR của KH-B do mã chuyển khoản trùng substring (vd code "12345" nằm trong "012345"). → Tiền vào nhầm PR → kế toán mất công sửa.

**Spec fix**: [`backend/payment_request_routes.py:1147-1151`](../backend/payment_request_routes.py:1147) trong hàm `reconcile_payment_line_webhook`:

```python
# TRƯỚC (sai):
for candidate in candidates.data or []:
    code = _clean_text(candidate.get("transfer_code")).upper()
    if code and code in desc:
        line = candidate
        break

# SAU (đúng): match exact word boundary
import re
for candidate in candidates.data or []:
    code = _clean_text(candidate.get("transfer_code")).upper()
    if code and re.search(rf"\b{re.escape(code)}\b", desc):
        line = candidate
        break
```

**Test**:
- Tạo 2 PR sandbox: PR-A có transfer_code "12345", PR-B có "012345"
- Gửi webhook giả với `description = "Thanh toan 012345"` → kỳ vọng match PR-B (không match PR-A)
- Trước fix: match PR-A trước (sai)

---

## Việc 3 — Webhook idempotent (Bug 1C-03, PR2)

**Bối cảnh nghiệp vụ**: Khi PayOS gửi cùng 1 thông báo 2 lần (do retry tự động do network blip), thời gian "đã thu" có thể nhảy từ 23:59 hôm nay sang 00:01 hôm sau → BC03 ngày hôm nay mất 1 giao dịch, ngày mai bị "thừa".

**Spec fix**: [`backend/payment_request_routes.py:994-1009`](../backend/payment_request_routes.py:994) hàm `_mark_line_paid` — early return nếu line đã paid:

```python
def _mark_line_paid(sb, line_id: str) -> dict[str, Any]:
    # Idempotency: nếu line đã paid → không update paid_at lại
    existing = (
        sb.table("payment_lines")
        .select("status, paid_at, payment_request_id")
        .eq("id", line_id)
        .limit(1)
        .execute()
    )
    if existing.data and _clean_text(existing.data[0].get("status")).lower() == "paid":
        line = existing.data[0]
        totals = recompute_payment_request_totals(sb, str(line["payment_request_id"]))
        return {
            "payment_line": _serialize_payment_line(line),
            **totals,
        }

    # ... phần còn lại như cũ
```

**Test**:
- Tạo PR + line QR pending
- Gửi webhook 2 lần liên tiếp cách nhau 5s
- Kiểm tra `paid_at` lần 2 = lần 1 (không bị thay)

---

## Việc 4 — Chống duplicate Order ID CRM (Bug 1E-01, PR2)

**Bối cảnh nghiệp vụ**: Ops (chị Thu Hiền) có thể vô tình điền cùng 1 order ID CRM (vd "ORD-12345") cho 2 course khác nhau ở 2 PR. → Báo cáo BC03 ghi nhận doanh thu của đơn đó 2 lần.

**Spec fix**: [`backend/activation_routes.py:1234-1280`](../backend/activation_routes.py:1234) hàm `patch_active_request_course` — thêm check duplicate trước khi gọi RPC:

```python
def patch_active_request_course(...):
    # ... existing code đến order_id = str(body.order_id or "").strip()

    if order_id:
        # CHECK DUPLICATE: scan toàn bộ active_requests xem order_id đã dùng chưa
        existing_ar = sb.table("active_requests").select("id, uids_data").execute()
        for ar in (existing_ar.data or []):
            ar_id_existing = str(ar.get("id") or "")
            for uid_block in (ar.get("uids_data") or []):
                for course in (uid_block.get("courses") or []):
                    existing_order = _clean_text(_course_order_id(course))
                    if existing_order == order_id:
                        # Cho phép nếu là chính course đang patch
                        if ar_id_existing == ar_id and course.get("code") == course_code:
                            continue
                        raise HTTPException(
                            409,
                            f"Order ID '{order_id}' da duoc dung cho course {course.get('code')} trong {ar_id_existing}"
                        )
        # ... phần còn lại như cũ (gọi RPC patch_active_request_course_order)
```

**Test**:
- Tạo 2 AR sandbox, mỗi AR có 1 course
- Fill order_id "ORD-TEST-001" cho course 1 → 200
- Fill order_id "ORD-TEST-001" cho course 2 → kỳ vọng 409
- Sửa lại order_id của cùng course 1 = "ORD-TEST-001" (idempotent) → 200

---

## Việc 5 — Chặn nhắc HĐ khi PR chưa thu đủ (Bug 1F-01, PR2)

> ⚠️ **Đính chính 13/06 (sau khi anh Minh check UI)**:
> Priority hạ từ 🔴 chặn go-live xuống **🟡 defense-in-depth**. Lý do: nút "Nhắc xuất HĐ" ở FE chỉ hiện khi `activeSummary.activatedCount > 0` ([`PaymentRequestDetailDrawer.tsx:2000`](../frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx:2000)), nghĩa là PR đã có course activated (đã pass `_assert_pr_paid` lúc tạo AR) → tại thời điểm nút hiện thì PR đã thu đủ.
>
> **Edge case duy nhất còn lại**: Sale tăng "Tổng tiền dự kiến" sau khi AR đã activated → `received < target` trở lại → nút vẫn hiện → có thể nhắc nhầm. Rất hiếm.
>
> **Vẫn làm vì**: code ~3 dòng, defense-in-depth tốt, chặn được edge case. Không tốn thời gian.

**Bối cảnh nghiệp vụ**: Bình thường UI đã chặn — nút nhắc HĐ chỉ hiện khi PR có course activated. Nhưng nếu sale tăng target sau, BE cần backup chặn.

**Spec fix**: [`backend/payment_request_routes.py:2109-2174`](../backend/payment_request_routes.py:2109) hàm `create_invoice_reminder` — thêm check sau `_can_access_request`:

```python
def create_invoice_reminder(...):
    # ... existing đến _can_access_request

    # CHECK: PR phải thu đủ tiền mới được nhắc HĐ (defense-in-depth)
    target = _parse_amount(current_row.get("target"))
    received = _parse_amount(current_row.get("received"))
    if target > 0 and received < target:
        raise HTTPException(
            400,
            f"PR chua thu du tien ({received}/{target}), khong nhac xuat HD duoc"
        )

    # ... phần còn lại như cũ (throttle 24h, insert)
```

**Test**:
- Tạo PR sandbox target 5tr, đã thu 5tr (đủ)
- Tạo AR + fill order_id (course activated) → nút Nhắc HĐ hiện trên FE
- Sửa PR target lên 10tr (giờ received < target)
- Gọi nhắc HĐ qua curl/Postman (FE vẫn cho bấm) → kỳ vọng **400 với message rõ**
- Nếu test happy path (target 5tr đã thu 5tr, không sửa) → nhắc HĐ vẫn được → 200

---

## Việc 6 — Fail-closed validation course budget (Bug 1D-01, PR2)

**Bối cảnh nghiệp vụ**: Hiện khi tạo course trong Active Request, nếu hệ thống không đọc được các AR khác cùng PR (do mạng/DB lỗi), vẫn cho tạo → course có thể vượt số tiền thực nhận của PR.

**Spec fix**: [`backend/activation_routes.py:463-464`](../backend/activation_routes.py:463) hàm `_validate_course_amounts`:

```python
# TRƯỚC:
try:
    res = sb.table("active_requests").select("id,uids_data").eq("pr_id", pr_id).execute()
    for ar in (res.data or []):
        # ... sum
except Exception:
    pass  # Fail-open: nếu không đọc được AR khác thì không block

# SAU:
try:
    res = sb.table("active_requests").select("id,uids_data").eq("pr_id", pr_id).execute()
    for ar in (res.data or []):
        # ... sum
except Exception as exc:
    raise HTTPException(
        500,
        f"Khong xac dinh duoc budget cua PR (loi doc AR): {exc}"
    ) from exc
```

**Test**:
- Khó test thẳng (cần mô phỏng DB lỗi). Có thể test bằng cách tạm rename table trong sandbox → call create AR → kỳ vọng 500.
- Hoặc skip — chỉ verify code change đúng.

---

## Commit + Push (làm theo thứ tự)

### Commit 1 — PR1 BE (restore endpoint)

Làm Việc 1 xong, commit riêng:

```bash
git add backend/payment_request_routes.py
git commit -m "feat(BE): POST /payment-requests/{id}/restore cho PR1

Hien nut Khoi phuc PR o tab Da huy khong goi BE, chi la hieu ung gia
o FE. Bo sung endpoint restore de FE goi.

- Auth: require_module_write paymentRequests
- Chan neu PR khong o trang thai cancelled (400)
- Recompute state tu received vs target sau khi clear cancelled_at

Bug 1A-02 (phan BE). FE follow-up cua Claude.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

### Commit 2 — PR2 (5 bug đối soát chính xác)

Sau khi xong Việc 2-6, commit gom:

```bash
git add backend/payment_request_routes.py backend/activation_routes.py
git commit -m "fix(BE): đối soát chính xác + chống duplicate order ID (PR2)

- Webhook match exact word boundary thay vi substring (1C-02)
- _mark_line_paid idempotent — khong update paid_at lan 2 (1C-03)
- patch_active_request_course chan duplicate order_id 409 (1E-01)
- create_invoice_reminder chan neu PR chua thu du (1F-01)
- _validate_course_amounts fail-closed khi query AR loi (1D-01)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

### Push cả 2 commit lên sandbox

```bash
git push origin sandbox
```

Push xong báo anh Minh hoặc Claude (qua chat) — Claude sẽ làm phần FE còn lại của PR1.

---

## Cần anh xác nhận trước khi merge `sandbox` → `main`

- [ ] Test luồng `restore` 1 PR thật trên sandbox URL frontend (anh Minh test)
- [ ] Gửi 2 webhook giả liên tiếp → check `paid_at` không đổi
- [ ] Fill cùng order_id ở 2 course → kỳ vọng 409
- [ ] Nhắc HĐ PR chưa thu đủ → kỳ vọng 400 message rõ
