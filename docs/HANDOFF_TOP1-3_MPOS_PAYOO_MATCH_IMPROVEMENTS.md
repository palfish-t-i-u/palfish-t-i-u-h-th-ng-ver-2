# HANDOFF — TOP 1.3: Cải thiện gợi ý ghép giao dịch mPOS/Payoo

**Origin:** Feedback họp 27/06/2026 (anh Hiếu — nghiệp vụ kế toán). Phần "Đối soát giao dịch - Quẹt thẻ (mPOS/Payoo)".

**Gộp 4 việc (V3, V4, V5, V6):** cùng đụng `CardReconciliationTab.tsx` + `gateway_routes.py` + type `MatchCandidate`. Làm chung 1 PR.

**Estimated effort:** ~4–5h. **BE** (gateway_routes) + **FE** (CardReconciliationTab + types). KHÔNG migration.

**Quyết định đã chốt (anh Minh 27/6):**
- V4: lần TT đã xác nhận → **mặc định ẩn** khỏi gợi ý; thêm chip **"Tất cả"** để xem lại khi audit/ghép trùng.
- V6: bỏ field "Chi nhánh", **thay bằng tên chủ thẻ** (`cardholder_name`) trên giao dịch; **đẩy tên chủ thẻ lên TRƯỚC field "Loại"** trong panel "Thông tin giao dịch".

---

## Bối cảnh kỹ thuật (ĐÃ verify trong code)

- Drawer ghép nằm ở [`CardReconciliationTab.tsx`](../frontend/src/components/CardReconciliationTab.tsx). Card ứng viên render ở dòng **823–867**, chỉ hiện: `pr_id`, badge "trùng tiền", `pr_name · lần TT`, `amount · created_at`. **KHÔNG có loại hình thanh toán.**
- Type `MatchCandidate` ([mockGatewayTxns.ts:36](../frontend/src/components/card-recon/mockGatewayTxns.ts)) **thiếu** `method`/`installment_platform`/`status`.
- BE endpoint: `GET /api/v1/gateway-txns/{txn_id}/match-candidates` → [`gateway_match_candidates`](../backend/gateway_routes.py) dòng **334–416**:
  - Ghép theo SỐ TIỀN chính xác (`amount_int`) HOẶC search text PR.
  - Comment dòng **349**: *"KHÔNG lọc theo status để không ẩn lần TT đã 'paid'"* → **đây là chỗ phải đảo lại** (V4).
  - Candidate dict build ở dòng **403–415** — chỗ thêm field (V3).
- `payment_lines` CÓ sẵn cột: `method`, `status`, `installment_platform`, `installment_total` (verified ở `_serialize_payment_line` dòng 650–664). An toàn để select + filter.
- mPOS/Payoo chỉ phát sinh giao dịch **quẹt thẻ + trả góp** → gợi ý chỉ nên là lần TT `method ∈ {card, installment}`.
- Pattern filter bar ĐÃ CÓ ở modal "Ghép CK ngoài" ([ReconciliationTab.tsx:1540–1576](../frontend/src/components/ReconciliationTab.tsx)) — **tái dùng pattern này** cho V5 (DateRangeFilter + chip + search), KHÔNG sáng tạo UI mới.
- `endpoints.cardRecon.matchCandidates` ([api.ts:537](../frontend/src/lib/api.ts)) hiện chỉ nhận `{ search? }`.

---

## Scope

### IN scope
- **V3** — Hiện loại hình thanh toán (Quẹt thẻ / Trả góp) trên mỗi card PR gợi ý.
- **V4** — Gợi ý chỉ đề xuất lần TT `method ∈ {card, installment}` VÀ `status = pending` (chưa xác nhận); thêm chip "Tất cả" để bỏ filter status.
- **V5** — Thêm lọc **số tiền** + **ngày tạo lần TT** trong drawer ghép.
- **V6** — Panel "Thông tin giao dịch" của drawer: thêm cell **"Khách hàng / Chủ thẻ"** (`cardholder_name`) đặt **TRƯỚC** cell "Loại"; **bỏ** cell "Chi nhánh" (mPOS); giữ "Ngân hàng" cho Payoo.

### OUT of scope (KHÔNG làm)
- KHÔNG đổi logic match/unmatch, mismatch confirm, sync extension.
- KHÔNG đổi bảng danh sách giao dịch (cột "Chủ thẻ / Thẻ", "Hình thức" giữ nguyên — chỉ sửa **drawer**).
- KHÔNG điều tra lại parser mPOS để đổi ý nghĩa `collector_region` (chỉ bỏ hiển thị field này ở drawer).
- KHÔNG đụng tab "CK ngoài chờ ghép" (bank_transactions) — đó là CK, không phải thẻ.

---

## Files cần sửa

### A. BE — `backend/gateway_routes.py` (V3 + V4)

**1. Thêm Query param `include_all`** vào signature `gateway_match_candidates` (dòng 334–339):
```python
@router.get("/gateway-txns/{txn_id}/match-candidates")
def gateway_match_candidates(
    txn_id: str,
    search: str | None = Query(None),
    amount: int | None = Query(None),          # V5 — lọc theo số tiền tuỳ chọn
    include_all: bool = Query(False),          # V4 — True = hiện cả lần TT đã xác nhận
    authorization: str | None = Header(None),
):
```

**2. Dùng `amount` param nếu có** (V5). Sửa nhánh amount (dòng 372–375):
```python
else:
    # V5: ưu tiên amount client gửi (kế toán lọc tay), fallback amount của txn.
    target_amount = int(amount) if amount else (int(_parse_amount(txn.get("amount"))) or 0)
    line_res = sb.table("payment_lines").select("*").eq("amount", target_amount).limit(100).execute()
    lines = line_res.data or []
```
> Nhánh `search_text` giữ nguyên (tìm theo PR), KHÔNG áp amount.

**3. Lọc method + status** (V4). Thêm NGAY SAU dòng 388 (`lines = [ln for ln in lines if str(ln.get("id")) not in used_line_ids]`):
```python
# V4: mPOS/Payoo chỉ ứng với lần TT quẹt thẻ / trả góp.
ALLOWED_METHODS = {"card", "installment"}
lines = [ln for ln in lines if _clean_text(ln.get("method")).lower() in ALLOWED_METHODS]
# V4: mặc định chỉ gợi ý lần TT CHƯA xác nhận; include_all=True mới hiện lần đã 'paid' (audit).
if not include_all:
    lines = [ln for ln in lines if _clean_text(ln.get("status")).lower() == "pending"]
```
> 🚫 **XOÁ / cập nhật comment dòng 349** ("KHÔNG lọc theo status…") vì nay đã lọc theo quyết định mới. Để comment cũ lại sẽ gây hiểu nhầm cho người sau.

**4. Thêm field vào candidate dict** (V3). Trong vòng lặp dòng 403–415, thêm:
```python
candidates.append(
    {
        "payment_line_id": str(line.get("id") or ""),
        "pr_id": str(line.get("payment_request_id") or ""),
        "pr_name": _clean_text(pr.get("name") or pr.get("ten_khach")),
        "attempt_idx": idx,
        "amount": _parse_amount(line.get("amount")),
        "created_at": _format_dt(line.get("created_at")),
        "uid": _clean_text(pr.get("uid") or pr.get("uid_khach_hang")),
        "has_bill": bool(bill_images),
        "bill_images": bill_images,
        "method": _clean_text(line.get("method")).lower() or None,          # V3
        "installment_platform": line.get("installment_platform") or None,   # V3
        "status": _clean_text(line.get("status")).lower() or "pending",     # V4 (FE hiển thị)
    }
)
```

### B. FE types — `frontend/src/lib/api.ts` + `mockGatewayTxns.ts`

**`MatchCandidate`** ([mockGatewayTxns.ts:36–46](../frontend/src/components/card-recon/mockGatewayTxns.ts)) thêm 3 field optional:
```ts
export interface MatchCandidate {
  payment_line_id: string;
  pr_id: string;
  pr_name: string;
  attempt_idx: number;
  amount: number;
  created_at: string;
  uid: string;
  has_bill: boolean;
  /** V3 — "card" | "installment" (lọc/hiển thị loại hình) */
  method?: "card" | "installment" | string | null;
  /** V3 — "Payoo" | "Mpos" (chỉ có khi trả góp) */
  installment_platform?: string | null;
  /** V4 — "pending" | "paid" | "rejected" */
  status?: string | null;
}
```
> `MatchCandidate` được re-export trong `api.ts` (dòng 38) — không cần sửa thêm.

**`endpoints.cardRecon.matchCandidates`** ([api.ts:537–538](../frontend/src/lib/api.ts)) mở rộng params:
```ts
matchCandidates: (txnId: string, params?: { search?: string; amount?: number; include_all?: boolean }) =>
  api.get<MatchCandidate[]>(`/api/v1/gateway-txns/${txnId}/match-candidates`, { params }),
```

**Mock `MOCK_MATCH_CANDIDATES`** (mockGatewayTxns.ts:136–146): thêm `method`/`status` cho vài dòng để storybook/test không lỗi type (ví dụ `method: "card", status: "pending"`; dòng trả góp `method: "installment", installment_platform: "Payoo"`).

### C. FE — `frontend/src/components/CardReconciliationTab.tsx`

**V3 — chip loại hình trong card ứng viên.** Trong `filteredCandidates.map` (dòng 823–867), thêm sau badge "trùng tiền" (dòng 858):
```tsx
<span style={{
  fontSize: 10.5, padding: "1px 6px", borderRadius: 6,
  background: c.method === "installment" ? "var(--primary-bg, #ede9fe)" : "var(--surface-3)",
  color: c.method === "installment" ? "var(--primary, #7c3aed)" : "var(--text-2)",
  fontWeight: 600,
}}>
  {c.method === "installment" ? `Trả góp${c.installment_platform ? ` · ${c.installment_platform}` : ""}` : "Quẹt thẻ"}
</span>
```

**V5 — filter bar trong drawer.** Thêm state cạnh các state hiện có (dòng ~80):
```tsx
const [candRange, setCandRange] = useState<DateRange>(EMPTY_RANGE);
const [candAmount, setCandAmount] = useState("");
const [candIncludeAll, setCandIncludeAll] = useState(false);
```
Import: `import DateRangeFilter, { EMPTY_RANGE, type DateRange, inDateRange } from "./payment-request/DateRangeFilter";`

⚠️ **CÓ 2 effect fetch candidate — phải sửa CẢ HAI**, nếu không filter sẽ mất tác dụng ở chế độ manual-search.

**(a) Effect chính** (THAY TOÀN BỘ dòng 171–198) — fetch theo `amount`/`include_all`, debounce 350ms khi có `candAmount`:
```tsx
useEffect(() => {
  if (!drawerOpen || !drawerId) return;
  const txn = txns.find((t) => t.id === drawerId);
  if (!txn || txn.match_status === "matched") {
    setCandidates([]);
    setAmountLoaded(false);
    return;
  }
  let alive = true;
  setAmountLoaded(false);
  const run = () => {
    endpoints.cardRecon
      .matchCandidates(drawerId, {
        amount: candAmount ? parseInt(candAmount, 10) : undefined,
        include_all: candIncludeAll || undefined,
      })
      .then(({ data }) => {
        if (!alive) return;
        setCandidates(Array.isArray(data) ? data : []);
        setAmountLoaded(true);
      })
      .catch((err) => {
        console.error("[card-recon] candidates failed", err);
        if (alive) { setCandidates([]); setAmountLoaded(true); }
      });
  };
  // candAmount gõ liên tục → debounce 350ms; mở drawer / đổi chip → fetch ngay.
  const timer = setTimeout(run, candAmount ? 350 : 0);
  return () => { alive = false; clearTimeout(timer); };
}, [drawerOpen, drawerId, txns, candAmount, candIncludeAll]);
```

**(b) Effect manual-search** (dòng 203–249) — **THÊM `include_all`** vào params và vào dependency array:
```tsx
endpoints.cardRecon
  .matchCandidates(drawerId, { search: q, include_all: candIncludeAll || undefined })
  // ...giữ nguyên .then/.catch/.finally
// dependency array: [isManualMode, candSearch, drawerId, candIncludeAll]
```
> 🚫 ĐỪNG quên `candIncludeAll` ở effect (b) — bỏ sót thì khi không có ứng viên trùng tiền, manual-search sẽ luôn ẩn lần đã xác nhận dù bấm "Tất cả".

Lọc ngày **client-side** trong `filteredCandidates` (dòng 251–258):
```tsx
return candidates.filter((c) => {
  if (!inDateRange(c.created_at || "", candRange)) return false;        // V5 ngày
  if (candIncludeAll === false && c.status && c.status !== "pending") return false; // phòng hờ (BE đã lọc)
  // ...giữ filter search cũ
});
```

UI filter bar — đặt ngay dưới `<h4>Ghép với lần thanh toán</h4>` (dòng 778), copy layout từ [ReconciliationTab.tsx:1540–1576](../frontend/src/components/ReconciliationTab.tsx):
```tsx
<div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
  <div className="field" style={{ minWidth: 150 }}>
    <input inputMode="numeric" placeholder="Lọc theo số tiền…" value={candAmount}
      onChange={(e) => setCandAmount(e.target.value.replace(/[^\d]/g, ""))} />
  </div>
  <button type="button" className={`filter-chip ${!candIncludeAll ? "active" : ""}`}
    onClick={() => setCandIncludeAll(false)}>Chưa xác nhận</button>
  <button type="button" className={`filter-chip ${candIncludeAll ? "active" : ""}`}
    onClick={() => setCandIncludeAll(true)} title="Hiện cả lần TT đã xác nhận — dùng khi audit/ghép trùng">Tất cả</button>
  <DateRangeFilter value={candRange} onChange={setCandRange} />
</div>
```
> Reset `candRange/candAmount/candIncludeAll` về mặc định trong `openDrawer` (dòng 260–265).

**V6 — panel "Thông tin giao dịch" của drawer** (dòng 718–751). Thứ tự cell mới:
1. **Thêm cell ĐẦU TIÊN** (trước "Loại"):
```tsx
<div className="info-cell">
  <div className="info-label">Khách hàng / Chủ thẻ</div>
  <div className="info-value">{drawerTxn.cardholder_name || "—"}</div>
</div>
```
2. Giữ "Loại", "Thẻ", "Số tiền", "Thực nhận", "Thời gian", "Mã phiếu chi", "Mã giao dịch".
3. **Sửa cell cuối** (dòng 747–750, đang là "Chi nhánh"/"Ngân hàng"): **bỏ Chi nhánh cho mPOS**, chỉ giữ Ngân hàng cho Payoo:
```tsx
{drawerTxn.source === "payoo" && (
  <div className="info-cell">
    <div className="info-label">Ngân hàng</div>
    <div className="info-value">{drawerTxn.bank || "—"}</div>
  </div>
)}
```
> Header drawer (dòng 698–703) ĐÃ hiện `cardholder_name` — giữ nguyên, không trùng vấn đề vì anh Minh muốn nó cả ở panel.

---

## Acceptance criteria

1. Mở drawer 1 giao dịch mPOS/Payoo `pending`: mỗi card PR gợi ý hiện chip **"Quẹt thẻ"** hoặc **"Trả góp · Payoo/Mpos"**.
2. Gợi ý mặc định **không** chứa lần TT đã xác nhận (`status=paid`) và **không** chứa lần TT `qr`/`cash`. Bấm chip **"Tất cả"** → hiện lại lần đã xác nhận.
3. Gõ số tiền vào ô "Lọc theo số tiền" → danh sách đổi theo số tiền đó (không phải số tiền của txn).
4. Chọn khoảng ngày → chỉ còn lần TT tạo trong khoảng.
5. Panel "Thông tin giao dịch": dòng đầu là **"Khách hàng / Chủ thẻ"**; **không còn** dòng "Chi nhánh" (mPOS); Payoo vẫn có "Ngân hàng".
6. `cd frontend && npx tsc -b` PASS; `npm run test` PASS. BE: `match` / `unmatch` vẫn chạy đúng (smoke test ghép 1 giao dịch).

---

## Test plan
```bash
cd frontend && npx tsc -b && npm run test
cd backend && powershell ./run.ps1   # smoke API match-candidates
```
Manual (sandbox `test.admin@dev`, tab Đối soát thẻ):
1. mPOS giao dịch quẹt thẻ → mở drawer → card gợi ý có chip "Quẹt thẻ"; không thấy lần TT qr/đã xác nhận.
2. Bấm "Tất cả" → xuất hiện thêm lần đã xác nhận.
3. Nhập số tiền khác → list đổi; chọn ngày → list co lại.
4. Giao dịch trả góp Payoo → chip "Trả góp · Payoo".
5. Drawer: dòng đầu "Khách hàng / Chủ thẻ", không còn "Chi nhánh".

---

## Anti-patterns (đừng làm)
1. 🚫 ĐỪNG để lại comment cũ dòng 349 BE ("KHÔNG lọc theo status") — phải sửa, nếu không người sau hiểu nhầm.
2. ĐỪNG gọi `matchCandidates` mỗi keystroke ô số tiền — phải debounce 350ms.
3. ĐỪNG hard-code "Quẹt thẻ"/"Trả góp" dựa trên `category` của **txn** cho card ứng viên — dùng `method` của **lần TT** (candidate), vì đang ghép theo lần TT.
4. ĐỪNG bỏ luôn "Ngân hàng" của Payoo khi xoá "Chi nhánh" — chỉ mPOS mới bỏ.
5. ĐỪNG đổi bảng danh sách / cột "Hình thức" — chỉ sửa drawer.
6. ĐỪNG ship khi `tsc -b` chưa pass.
