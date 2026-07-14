# Handoff — Fix orphan auto-match + Tab Chờ xác nhận redirect non-cash + Scoring ghép CK ngoài

> **Target executor:** Sonnet 4.6 medium hoặc Opus. Plan chi tiết tại `docs/superpowers/plans/2026-07-14-recon-orphan-fix-and-awaiting-tab-redirect.md`.
> **Loại thay đổi:** BE (1 file Python) + FE (3 file tsx, 1 file context). Không migration/DB.
> **Branch:** `sandbox`

---

## Bối cảnh nghiệp vụ

Kế toán Thu Hiền phát hiện 14/7:
1. **Giao dịch CK tự khớp (SePay auto-match) mà vẫn nằm ở tab "CK ngoài chờ ghép"** — do bug BE: `_process_sepay_transaction` revert `match_status` khi recompute/audit throw, nhưng `payment_line` đã paid = orphan.
2. **Tab "Chờ xác nhận" hiện cả lần TT non-cash** (CK ngoài, quẹt thẻ, trả góp) nhưng nút Xác nhận ở đây chỉ update `payment_lines`, không ghép `bank_transactions` → tạo orphan thêm. Thu Hiền đồng ý: tab này chỉ phục vụ tiền mặt.
3. **Kế toán ghép CK ngoài phải dò tay** — không có gợi ý nào candidate nào khớp NDCK.

---

## 3 việc cần làm (đọc plan để lấy code chi tiết)

### A. Fix BE orphan (Plan Task 1)

**File:** `backend/sepay_routes.py:367-396`

**Vấn đề:** 3 operations trong 1 try block:
```
try:
    op1: mark payment_line paid     ← CAN SUCCEED
    op2: recompute_totals           ← CAN THROW  
    op3: log_audit                  ← CAN THROW
except:
    revert bank_transaction.match_status = "needs_review"
    → payment_line VẪN paid = ORPHAN
```

**Fix:** Tách 2 try blocks. Op1 riêng — nếu thành công thì `line_paid_ok = True`. Op2+3 chạy best-effort, fail chỉ log warning, KHÔNG revert match_status. Code đầy đủ trong plan Task 1 Step 1.

**Đã verify DB:** Chỉ 1 case orphan tồn tại (FHQUX/PR-2026-0222), đã fix thủ công trên prod.

---

### B. FE — Nút Xác nhận redirect non-cash (Plan Task 2-5)

**Quy tắc:**
- Nút giữ nguyên icon ✓ và tên "Xác nhận"
- `method === "cash"` → confirm như cũ (handleConfirm + handleReject)
- `method === "qr" || "transfer"` → onClick: `setTab("ckOutside")` (chuyển tab CK ngoài chờ ghép, cùng page)
- `method === "card" || "installment"` → onClick: `navigate("reconCard")` (chuyển sang page mPOS/Payoo)
- Checkbox + bulk confirm: chỉ enable cho `cash`
- **KHÔNG** xoá/ẩn giao dịch non-cash cũ đang trong tab. Để tự nhiên biến mất khi được ghép.

**Files cần sửa (thứ tự):**

1. `frontend/src/contexts/PaymentFlowContext.tsx:50` — thêm `"reconCard"` vào type `PaymentFlowView`
2. `frontend/src/pages/MainPage.tsx:83-88` — thêm `reconCard: "reconCard"` vào `FLOW_VIEW_MAP`
3. `frontend/src/components/ReconciliationTab.tsx:1150-1175` — desktop action column: phân nhánh theo method
4. `frontend/src/components/reconciliation/ReconTxnCards.tsx:80-106` — mobile: thêm props `onRedirectCard` + `onSwitchToCkOutside`, phân nhánh actions
5. `frontend/src/components/ReconciliationTab.tsx:1066-1069` — checkbox: `disabled={... || t.method !== "cash"}`
6. `frontend/src/components/ReconciliationTab.tsx:874-876` — bulk confirm: `.filter(t => t.method === "cash")`

Code đầy đủ cho từng file trong plan Task 2-5.

---

### C. Scoring ghép CK ngoài (Plan Task 6-7)

**BE — `backend/sepay_routes.py`:**

Thêm hàm `_score_candidate(content, candidate, txn_amount)`:
- Parse NDCK (`content`) bằng regex → tìm SĐT (`0\d{9}`), mã TT (transfer_code), tên
- Chấm điểm: mã TT +120, SĐT +100, cùng tiền +50, tên +30
- Trả `(score: int, match_signals: list[str])` — signals là `["code", "phone", "amount", "name"]`
- Loại noise words (tên ngân hàng, họ phổ biến VN) khỏi name matching
- Sửa `bank_txn_match_candidates`: gọi `_score_candidate` cho mỗi candidate, thêm `score` + `match_signals` vào response, sort theo score DESC

**FE — `frontend/src/components/ReconciliationTab.tsx:1690-1734`:**

Thêm dòng badge trên mỗi candidate card trong drawer Ghép:
- `match_signals.includes("code")` → badge "Khớp mã TT" (primary color)
- `match_signals.includes("phone")` → badge "Khớp SĐT" (primary color)
- `match_signals.includes("name")` → badge "Khớp tên" (primary color)
- `exactAmount` → badge "Cùng số tiền" (success color)
- `has_bill` → badge "Có bill" (success) / "Chưa có bill" (warning)

Tất cả badge cùng 1 dòng `flex-wrap`, font 10.5px, padding `1px 6px`, borderRadius 4.

Code đầy đủ trong plan Task 6-7.

---

## Verify checklist

- [ ] `cd frontend && npx tsc -b` pass
- [ ] Tab Chờ xác nhận: cash → ✓ + ✗, non-cash → ✓ redirect đúng chỗ
- [ ] Checkbox chỉ enable cho cash
- [ ] Drawer Ghép CK ngoài: candidate cards có badge scoring, sort đúng score
- [ ] Mobile layout: ReconTxnCards redirect đúng

---

## Lưu ý

- **Đọc plan trước khi code** — plan có code block đầy đủ cho từng step, copy-paste được.
- `setTab("ckOutside")` là function có sẵn trong ReconciliationTab (cùng page, chỉ đổi tab state).
- `navigate("reconCard")` gọi qua `PaymentFlowContext` — cần Task 2 xong trước.
- Scoring regex compile ở module-level (`_PHONE_RE`, `_NOISE_WORDS`) — chạy 1 lần khi import, không per-request.
- `bank_txn_match_candidates` đã fetch `txn.content` (dòng 694-704), chỉ cần đọc `txn.get("content", "")`.
