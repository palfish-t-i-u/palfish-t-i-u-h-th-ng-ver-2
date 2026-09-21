# PLAN — Khép tồn đọng review branch `pr-list-server-pagination`

**Ngày:** 21/9/2026 · **Bàn giao:** Đức & Đạt · **Người review:** anh Minh (+ Claude)
**Branch áp fix:** `feature/pr-list-server-pagination` (áp TRÊN branch này, CHƯA merge main)

---

## 0. Bối cảnh (đọc 30 giây)

Review branch server-pagination phát hiện **2 bug thật** phải sửa **trước khi bật flag `VITE_PR_LIST_MODE=server` ở prod** (bước M4), cộng vài mục dọn dẹp. Flag mặc định **OFF (load-all)** → prod hiện an toàn, các bug chỉ sống khi bật server mode nên **không phải hotfix**, nhưng là **gate M4**.

Các finding đã được kiểm chứng độc lập (9 agent). Kết quả: 2 bug thật (G1), 2 dọn dẹp (G2), vài mục nhẹ/comment (G3). 3 finding khác đã xác minh là **non-issue, KHÔNG sửa** (xem §5).

**Nguyên tắc xuyên suốt (guardrail chung):**
- Mọi thay đổi phải **giữ nhánh load-all (mặc định) y hệt hành vi cũ**. Chỗ nào đụng phải guard bằng `PR_LIST_MODE === "server"` / `isServerMode` nếu chỉ áp cho server mode.
- Sau **mỗi file FE**: `cd frontend && npx tsc -b` = 0 error. Đụng BE: chạy `pytest` file liên quan.
- Không đổi route order, không đụng RPC/migration (đã verify tốt).

---

## Milestone G1 — 2 BUG THẬT (must-fix, gate bật flag prod)

### G1-T1 · badge-counts thiếu `.range()` → PostgREST cắt 1000 (BE)

**File:** `backend/payment_request_routes.py`, hàm `_compute_badge_counts` (dòng **1970–1977**).
**Learning liên quan:** `docs/learnings/filter-after-limit-postgrest.md` (đọc trước khi sửa).

**Vấn đề:** query `payment_requests` KHÔNG có vòng `.range()` → PostgREST mặc định trả tối đa 1000 dòng. Scope admin/ops (`allowed_emails is None`) có ~1657 PR non-cancelled trên prod → `pr_ids` bị cắt còn 1000 → badge sidebar **"Tạo gói học"/"Xuất hóa đơn" đếm thiếu ~40%**. Cùng lỗi này đã được sửa đúng ở endpoint anh em `activation_routes.py:2335-2363` (có comment + sentinel) nhưng bỏ sót ở đây.

**Code hiện tại (old — dòng 1970–1977):**
```python
    pr_query = sb.table("payment_requests").select("id, sale_email").neq("state", "cancelled")
    if allowed_emails is not None:
        pr_query = pr_query.in_("sale_email", allowed_emails)
    try:
        pr_rows = pr_query.execute().data or []
    except Exception as exc:
        raise HTTPException(500, f"Khong doc duoc payment_requests cho badge-counts: {exc}") from exc
    pr_ids = [str(r.get("id") or "") for r in pr_rows if r.get("id")]
```

**Sửa thành (new — mẫu `.range()` loop theo `activation_routes.py:2340-2363`):**
```python
    # PostgREST cắt 1000 dòng/response nếu không .range() — scope admin/ops
    # (~1657 PR non-cancelled trên prod) sẽ ÂM THẦM mất ~40% → badge đếm thiếu.
    # Loop .range() theo trang 1000 tới khi hết (mẫu activation_routes.py:2340).
    pr_rows: list[dict[str, Any]] = []
    try:
        _page_size = 1000
        _off = 0
        _pages = 0
        while True:
            _q = sb.table("payment_requests").select("id, sale_email").neq("state", "cancelled")
            if allowed_emails is not None:
                _q = _q.in_("sale_email", allowed_emails)
            _batch = _q.range(_off, _off + _page_size - 1).execute().data or []
            pr_rows.extend(_batch)
            _pages += 1
            if len(_batch) < _page_size:
                break
            _off += _page_size
        if _pages > 1:
            print(f"[badge-counts] sentinel cap-1000: tai {len(pr_rows)} PR qua {_pages} trang.")
    except Exception as exc:
        raise HTTPException(500, f"Khong doc duoc payment_requests cho badge-counts: {exc}") from exc
    pr_ids = [str(r.get("id") or "") for r in pr_rows if r.get("id")]
```
> `Any` đã được import sẵn ở đầu file (dùng nhiều nơi) — không cần thêm import.

**Guardrail:**
- KHÔNG đổi phần tính `reconciliation`/`activation`/`invoice` phía dưới — chúng đã `_chunked(pr_ids, 100)` đúng, chỉ đầu vào `pr_ids` bị cắt.
- Giữ nguyên chữ ký hàm + nhánh `allowed_emails is not None` (scope sale/leader vẫn lọc email đúng).

**Test:** `backend/tests/test_badge_counts.py`
- Thêm case: seed/mờ hóa >1000 PR non-cancelled cho scope ops (allowed_emails=None) → assert count activation/invoice = tổng THẬT, không phải giá trị cắt tại 1000. Nếu khó seed >1000 trong test, mock client trả 2 batch (1000 + phần dư) và assert loop gộp đủ.
- Chạy: `cd backend && python -m pytest tests/test_badge_counts.py -q` → pass.

---

### G1-T2 · Drawer B1 trắng khi refetch nền rớt PR khỏi trang (FE)

**Files:**
- `frontend/src/contexts/PaymentFlowContext.tsx` (thêm `pinPr`/`unpinPr`, expose)
- `frontend/src/components/PaymentRequestsTab.tsx` (`handleSelect` dòng **333–336**)
- `frontend/src/types/paymentRequest.ts` (thêm field vào type context nếu type context nằm ở đây — nếu type value context inline trong file context thì sửa tại chỗ)

**Learning liên quan:** `docs/learnings/ar-edit-local-draft-decouple-global-context.md`, `docs/learnings/drawer-css-close-child-state-survives-entity-switch.md` (đọc trước — refetch nền rất hung hãn: poll 30s + realtime 3 bảng + focus).

**Vấn đề:** mở drawer từ **click dòng lưới** (`handleSelect`, dòng 333) chỉ `setSelectedId` + `setDrawerOpen`, KHÔNG pin/hydrate. `selected = findPr(selectedId)` (dòng 171) tra `pageRows → pinnedRows → requests`. Ở server mode `requests` rỗng; nếu refetch nền thay `pageRows` mà PR đó rớt khỏi trang (VD lọc chip "Chưa TT" rồi PR được thanh toán → pending→done → rớt bucket) → `findPr` trả `null` → **drawer trắng + mất nháp form đang gõ**. Đường nav (`openPrId`, dòng 147–169) đã an toàn vì có `hydratePr` (pin), nhưng đường click lưới thì không → bất đối xứng = sót.

**Sửa 1 — Context: thêm `pinPr`/`unpinPr`** (đặt cạnh `hydratePr`, sau dòng ~400; mẫu `setPinnedRows` đã có ở dòng 174/395/452):
```typescript
  // Ghim 1 PR đã có sẵn (row từ lưới) vào pinnedRows — KHÔNG gọi mạng, chỉ giữ nó
  // "sống" qua refetch nền để findPr không trả null (server mode). updateRequest đã
  // đồng bộ pinnedRows nên snapshot được cập nhật khi có optimistic update.
  const pinPr = useCallback((row: PaymentRequest) => {
    setPinnedRows((prev) => {
      const next = new Map(prev);
      next.set(row.id, row);
      return next;
    });
  }, []);
  const unpinPr = useCallback((id: string) => {
    setPinnedRows((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);
```
Thêm `pinPr`, `unpinPr` vào **type `PaymentFlowContextValue`**, vào **object `value`** và **deps của `useMemo(value)`** (cùng chỗ đã khai báo `hydratePr`/`findPr` — dòng ~118-147 type, ~943 value, ~979 deps trong diff M3).

**Sửa 2 — Tab `handleSelect` (dòng 333–336):**
```typescript
  const handleSelect = (request: PaymentRequest) => {
    if (isServerMode) pinPr(request); // giữ PR sống qua refetch nền — tránh drawer trắng (server mode)
    setSelectedId(request.id);
    setDrawerOpen(true);
  };
```
> `isServerMode` đã có sẵn trong tab (dùng ở dòng 327-331). Destructure thêm `pinPr`, `unpinPr` từ `usePaymentFlow()` (cạnh `findPr`, `hydratePr` — dòng 80-81).

**Sửa 3 (dọn Map, tùy chọn nhưng nên có) — unpin khi đóng drawer:** tại handler đóng drawer (prop `onClose`/`onOpenChange(false)` của `PaymentRequestDetailDrawer`, quanh dòng 952 + chỗ `setDrawerOpen(false)`), gọi `if (isServerMode && selectedId) unpinPr(selectedId);` **trước** khi `setDrawerOpen(false)`.

**Guardrail:**
- Guard `if (isServerMode)` để **load-all KHÔNG đổi hành vi** (load-all đã giữ `requests` đầy đủ nên không cần pin).
- KHÔNG đổi keying/props của `PaymentRequestDetailDrawer` (tránh learning `drawer-css-close-child-state`).
- `findPr` giữ nguyên thứ tự `pageRows → pinnedRows → requests` — pin chỉ thêm fallback, không đè pageRows (pageRows vẫn ưu tiên khi PR còn trong trang → luôn tươi nhất).

**Test:** `frontend/src/contexts/PaymentFlowContext.serverMode.test.tsx`
- Case mới: mount provider (server mode) → `pinPr(prA)` → set `pageRows` = danh sách KHÔNG chứa `prA` (mô phỏng refetch rớt) → assert `findPr(prA.id)` vẫn trả `prA` (non-null).
- Case: `unpinPr(prA.id)` sau đó → `findPr` trả null (dọn đúng).
- Chạy: `cd frontend && npx vitest run PaymentFlowContext.serverMode` → pass.

---

## Milestone G2 — Dọn dẹp NÊN làm (không chặn flag)

### G2-T1 · `PAGE_SIZE=50` trùng 3 chỗ → 1 nguồn sự thật (FE)

**Vấn đề:** `PAGE_SIZE_SERVER=50` (`PaymentRequestsTab.tsx:84`, dùng tính `totalPages` dòng 330) tách rời `page_size: 50` hardcode trong `PaymentFlowContext.tsx:267`. Đổi 1 chỗ → `totalPages` lệch số trang thật. Hiện cả 2 =50 nên đúng; đây là foot-gun bảo trì (learning `country-dial-map-triplicated.md`).

**Sửa (cách đơn giản — hằng số chung, khớp idiom repo `PR_PAGE_SIZE`/`BANK_TXN_PAGE_SIZE`):**
- `frontend/src/lib/prListMode.ts`: thêm `export const PR_SERVER_PAGE_SIZE = 50;`
- `PaymentFlowContext.tsx:267`: `endpoints.paymentRequests.listPage({ ...listQuery, page_size: PR_SERVER_PAGE_SIZE })` (import từ `prListMode`).
- `PaymentRequestsTab.tsx`: xóa `const PAGE_SIZE_SERVER = 50;` (dòng 84), import `PR_SERVER_PAGE_SIZE`, thay 2 chỗ dùng (dòng 327 `effectivePageSize`, dòng 330 `totalPages`).

**Guardrail:** giá trị vẫn =50 → `PaymentFlowContext.serverMode.test.tsx:101` (assert query gửi `page_size=50`) vẫn xanh. Chạy lại test đó xác nhận.
**Test:** test hiện tại cover. `npx tsc -b` clean.

---

## Milestone G3 — Rất nhẹ / phòng thủ / comment (tùy chọn, làm luôn thể)

### G3-T1 · 3 handler B3/B4 dùng `updateActiveRequest` (phòng thủ, FE)
**File:** `PaymentFlowContext.tsx` dòng **829** (`patchCourseOrderId`), **868/874** (`requestInvoiceForCourse`), **889** (`issueInvoiceForCourse`).
Các dòng này `setActiveRequests(...)` đơn lẻ (chỉ mảng full). Đổi sang `updateActiveRequest(arId, () => <ar_object>)` để set **đồng thời** `activeRequests` + `pageActiveRequests` (nhất quán phòng thủ). Verify agent kết luận hiện KHÔNG với tới lỗi (B1 unmount lúc op chạy) → **tùy chọn**, không bắt buộc. Nếu làm: giữ nguyên object AR truyền vào, chỉ đổi setter.

### G3-T2 · Comment giải thích (FE, chống hiểu nhầm lần sau)
- `PaymentRequestsTab.tsx` chỗ gate search `>= 2` (dòng ~114): thêm comment "min-length search gate: 1 ký tự trả gần toàn bộ + tránh trgm scan vô ích; chủ đích theo plan M3-T3" (F6 — đã đúng, chỉ thiếu comment).
- `PaymentRequestsTab.tsx` effect push listQuery (dòng ~106-119): thêm comment "đổi filter ở page>1 push listQuery 2 lần (page cũ→1); seq-guard `loadDataSeqRef` loại kết quả cũ, chỉ tốn 1 request thừa — chấp nhận" (F5 — vô hại nhờ seq-guard).

### G3-T3 · Comment cảnh báo rbac cache single-worker (BE)
`backend/Dockerfile` cạnh dòng `CMD [... uvicorn ...]`: thêm comment "cache RBAC in-process (rbac.py `_TTL_CACHE`) giả định 1 worker; nếu bật `--workers N`/scale >1 instance phải đổi sang shared cache (Redis) kẻo roster stale tới TTL" (F4 — hiện đúng vì 1 worker).

---

## 5. KHÔNG làm (đã xác minh — ghi để khỏi ai đụng lại)

- **F2 (render `state`/`received` thô):** non-issue. FE `normalizeRequest` re-derive từ `payments` (tính từ lines), không đọc cột thô. Không sửa. *(Riêng vệ sinh dữ liệu PR-2026-0222 đã nằm trong M0-T7, độc lập.)*
- **F8 (QR 30d window):** non-issue. FE `hasPendingQrPayments` đã có `PENDING_QR_POLL_WINDOW_DAYS=30` sẵn (cả trên main) → khớp RPC tuyệt đối. Không sửa.
- **F9(b) (page-fetch "thừa" khi ở B3/B4):** ~1% overhead, đã ghi là giải pháp tạm. **Defer** tới khi migrate B3/B4 sang `pageRows`/`findPr` (M4-T8), không làm trong đợt này.

---

## 6. Đánh giá 5 tiêu chí

1. **Triệt để** — ✅ Khép cả 2 bug thật + dọn foot-gun; non-issue được ghi rõ để không lặp.
2. **Không lỗi con** — ✅ G1-T1 tái dùng mẫu `.range()` đã kiểm chứng; G1-T2 guard `isServerMode` giữ load-all bất biến; đều kèm test.
3. **Không tăng gánh nặng hạ tầng** — ✅ 0 migration, 0 dịch vụ mới; G1-T1 vẫn O(trang) (loop 1000 chỉ chạy khi >1000 PR, thường 2 trang).
4. **Tối ưu token** — ✅ Sửa cục bộ, không refactor rộng; delegate được cavecrew-builder từng task.
5. **Bền vững qua context compact** — ✅ Plan self-contained: path:line + code old/new nguyên văn + test + guardrail; không tham chiếu "như đã bàn".

---

## 7. Phân bổ thực thi & thứ tự

| Task | File | Ước lượng | Gợi ý người / agent |
|---|---|---|---|
| **G1-T1** badge-counts `.range()` | BE `payment_request_routes.py` | ~1.5h (gồm test) | Đạt · cavecrew-builder (Sonnet) |
| **G1-T2** drawer pin | FE context + tab + test | ~2h | Đức · cavecrew-builder (Sonnet) |
| **G2-T1** PAGE_SIZE const | FE 3 file | ~0.75h | Đức |
| **G3-T1/T2/T3** phòng thủ + comment | FE + BE | ~0.75h | ai rảnh |

**Thứ tự:** G1-T1 và G1-T2 độc lập (BE vs FE) → làm song song. G2/G3 sau. Mỗi task self-contained cho Sonnet — KHÔNG cần Opus.

**Gate hoàn thành trước khi bật flag=server ở prod (M4):**
1. `cd frontend && npx tsc -b` = 0 error.
2. `npx vitest run` (FE) pass, gồm test mới G1-T2.
3. `cd backend && python -m pytest tests/test_badge_counts.py -q` pass, gồm case mới G1-T1.
4. Bổ sung assertion parity **3 badge sidebar** (reconciliation/activation/invoice) vào smoke test M4-T1 (hiện chỉ kiểm 5 chip/3 tab/4 KPI — bỏ sót badge-counts, chính là chỗ để lọt F1).
