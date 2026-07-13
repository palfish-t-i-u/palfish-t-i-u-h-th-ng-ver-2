# HANDOFF — Đạt · Feedback 13/7: Recon dead-candidates (T1/T2/T3) + Referral regression (T7)

**Origin:** Feedback 13/07/2026 — chị Thu Hiền + anh Hiếu (ghép CK ngoài hiện lần TT chết) + regression từ modal kích hoạt đổi 12/7 (gói Refer mất field).

**Quyết định đã chốt (anh Hiếu 13/7):** Top 1 — làm trước, không chờ review. Top 2/Top 3 chờ anh Hiếu review sau.

**Estimated effort:** T1+T2+T3 ~4h (BE). T7 ~5–7h (FE+BE, ghép trọn cho Đạt). **Migration: KHÔNG.**

**Chi tiết code + TDD từng bước:** `docs/superpowers/plans/2026-07-13-feedback-9-tasks-recon-ar.md` — **Task 1** (T1/T2/T3) + **Task 3** (T7). Handoff này = assignment + guardrail + line-ref; code đầy đủ nằm trong plan.

---

## Bối cảnh (ĐÃ verify — grep 13/7, source chưa đổi)

### T1/T2/T3 — `backend/sepay_routes.py`
- `bank_txn_match_candidates` — dòng **684**. Query lấy candidate dòng **707–718**: `.in_("status", ["pending","paid"])` + amount, **KHÔNG loại** dòng chết.
- PR lookup dòng **722–732** — select `id,name,uid,phone,child_name,sale_email` (thiếu `state`).
- Đối chiếu: `gateway_match_candidates` (`backend/gateway_routes.py:388–400`) ĐÃ có anti-join `used_line_ids` — bản bank thiếu.
- `cancel_payment_request` (`backend/payment_request_routes.py:1849`) chỉ set `payment_requests.state="cancelled"`, **KHÔNG** đụng `payment_lines.status` → line PR huỷ vẫn `pending`.
- ⚠️ **ĐÍNH CHÍNH 13/7 (Đạt phát hiện, đã verify DB sandbox+prod):** **KHÔNG có cột `payment_lines.cancelled`**. `line.get("cancelled")` ở `payment_request_routes.py:2187` là dead check (luôn None). Vòng đời line chỉ qua `status` (prod: paid 185 / pending 65 / rejected 7). Huỷ QR = `status="rejected"` → base filter `status in(pending,paid)` **đã loại sẵn**. "QR đã xóa còn hiện" thực chất = **34 line `pending` thuộc PR đã huỷ** (verify prod) → **T3 gộp hẳn vào T2**.

### T7 — modal kích hoạt + referral
- Modal "Chọn gói học để kích hoạt": `frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx:2597–2645` — mỗi dòng chỉ có Gói/Số tiền/UID.
- Type `ArDraftRow` (`frontend/src/types/paymentRequest.ts:254`) = `{childName,uid,packageName,amount}` — không leadSource/referral.
- `buildCreateActiveRequestPayload` (`frontend/src/components/payment-request/paymentRequestUtils.ts:337`) gửi course `{name,amount}` only.
- BE `_assign_course_codes` (`backend/activation_routes.py:234–242`) whitelist course → `code/name/amount/order_id/invoiced` — **drop lead_source**.
- Editor referral cũ VẪN còn: `PaymentRequestDetailDrawer.tsx:1323` gate `editing && c.leadSource === "gioi_thieu"`; leadSource dropdown ở `:1262`. Course tạo qua modal có `leadSource=undefined` → panel referral không hiện = "mất sạch".

---

## Scope

### IN scope
1. **T1** — bank candidate loại lần TT đã ghép `bank_transaction` khác (anti-join, mirror gateway `used_line_ids`).
2. **T2** — loại lần TT thuộc PR `state="cancelled"` (bắt luôn 34 line "QR đã xóa" của T3).
3. **T3** — KHÔNG cần code riêng: QR huỷ = `status="rejected"` đã bị base filter loại; các case còn lại = PR huỷ (T2). Chỉ cần **verify** sau khi T2 xong.
4. **T7-BE** — `_assign_course_codes` passthrough `lead_source`/`lead_channel` khi có.
5. **T7-FE** — modal auto-set `lead_source="gioi_thieu"` cho gói tên chứa "REFER" (helper `isReferralPackage`) + hint nhắc điền referral sau khi tạo.

### OUT of scope (KHÔNG làm)
- **KHÔNG** đụng `gateway_routes.py` (T8/T9 gateway NET = Top 2, chờ Hiếu review — vẫn assign Đạt nhưng HOÃN).
- **KHÔNG** đụng notification/Zalo/DingTalk (T5 = Đức).
- **KHÔNG** thêm bill images vào bank candidate (T4 = Top 3, chờ).
- **KHÔNG** thêm sale_name vào AR list (T6 = Top 2, chờ).
- **KHÔNG** nhân đôi form referral vào modal — chỉ auto-set leadSource để editor cũ hiện lại (plan G6).

---

## Files (chi tiết code trong plan Task 1 + Task 3)

| File | Việc |
|------|------|
| `backend/sepay_routes.py` | T1/T2: +`state` vào PR select, +anti-join `used_line_ids`, +filter `_line_is_dead` (PR state=cancelled + used-line; fail-open). **KHÔNG select `cancelled`** (không tồn tại) |
| `backend/tests/test_sepay_match_candidates.py` | +rows (line-used/cancel-pr/rejected) + `test_candidates_exclude_dead_lines` |
| `backend/activation_routes.py` | T7-BE: `_assign_course_codes` +passthrough `lead_source`/`lead_channel` |
| `backend/tests/test_ar_lead_source_passthrough.py` | MỚI — assert lead_source giữ, gói thường không gắn |
| `frontend/src/types/paymentRequest.ts` | +`lead_source?` vào `CreateActiveRequestCoursePayload` |
| `frontend/src/components/payment-request/paymentRequestUtils.ts` | +`isReferralPackage()` + wiring trong `buildCreateActiveRequestPayload` |
| `frontend/src/components/payment-request/paymentRequestUtils.referral.test.ts` | MỚI |
| `frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx` | Hint gói REFER trong modal |

---

## Acceptance criteria
1. `test_candidates_exclude_dead_lines` PASS; 2 test cũ trong `test_sepay_match_candidates.py` VẪN xanh (line lành `line-1` vẫn là candidate).
2. Ghép CK ngoài trên sandbox: CK trùng số tiền với 1 PR đã huỷ / 1 line đã ghép → **không** còn hiện trong đề xuất.
3. `test_ar_lead_source_passthrough.py` + `paymentRequestUtils.referral.test.ts` PASS.
4. Sandbox: tạo AR với gói tên chứa "REFER" → thẻ kích hoạt hiện panel referral (điền được UID người giới thiệu + số buổi); gói thường không hiện panel.
5. `cd backend && python -m pytest tests/ -q` PASS.
6. `cd frontend && npx tsc -b` PASS; `cd frontend && npm run test` PASS.

## Test plan
```bash
cd backend && python -m pytest tests/test_sepay_match_candidates.py tests/test_ar_lead_source_passthrough.py tests/test_pr_multi_child.py -v
cd frontend && npx vitest run src/components/payment-request/paymentRequestUtils.referral.test.ts
cd frontend && npx tsc -b && npm run test
```
Manual sandbox: (2) mở drawer "Ghép CK ngoài" trên CK khớp PR huỷ → xác nhận biến mất; (4) modal kích hoạt gói REFER → tạo → bấm Sửa thẻ AR → panel referral hiện.

## Anti-patterns (đừng làm)
1. **Đừng** dùng `.or_(...)` cho anti-join — làm bằng Python filter sau khi fetch (FakeSB mock hỗ trợ; plan G12 giải thích rủi ro `.or_`).
2. **Đừng** select cột `cancelled` — KHÔNG tồn tại (query sẽ lỗi). Chỉ thêm `state` vào PR select. Filter fail-open khi thiếu PR (coi như không chết).
3. **Đừng** sửa `_mark_line_paid` hay logic cancel PR — T1/T2/T3 chỉ là loại-trừ ở *đọc* candidate.
4. **Đừng** nhân đôi form referral vào modal — chỉ set `lead_source` để editor `ActiveRequestMiniCardV2` (đã test) hiện panel.
5. **Đừng** gửi `lead_source` cho gói thường — payload gói không-REFER phải y hệt cũ (plan G7).

## Điều phối
- **Nhánh riêng từ `sandbox`** (vd `dat/recon-referral-13-7`). Ship **T1+T2+T3 trước** (chị Hiền đang chờ), commit riêng; T7 commit riêng.
- **Đụng nhẹ `activation_routes.py` với Đức (T5)**: bạn sửa `_assign_course_codes` (~234); Đức sửa guard enqueue (~1100, ~2485). Cách xa ~900 dòng → merge sạch; ai merge sau `git rebase sandbox`.
- Squash mỗi task thành 1 commit trước khi merge (T1/2/3 = 1, T7 = 1).
