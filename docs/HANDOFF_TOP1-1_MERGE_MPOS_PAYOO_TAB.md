# HANDOFF — TOP 1.1: Gộp tab mPOS + Payoo thành 1 tab "Quẹt thẻ"

**Origin:** Feedback họp 25/06/2026. Anh Hiếu: "Gộp 2 tab mpos/payoo làm 1, vẫn tách ra khỏi SePay, vẫn giữ tag phân biệt giao dịch trên 2 nền tảng."

**Quyết định giao diện (anh Minh chốt qua mockup 26/06):** 1 danh sách gộp, mỗi dòng có **badge nguồn** (mPOS / Payoo), thanh lọc có chip **"Tất cả / mPOS / Payoo"**. KHÔNG dùng toggle xem-từng-nguồn-một như cũ.

**Estimated effort:** ~2.5h FE-only. KHÔNG đụng BE. KHÔNG migration.

**Dependency:** Làm TRƯỚC TOP1.2. Task này KHÔNG đổi phân quyền — tab gộp tạm thời vẫn gate bằng key `reconciliation` (TOP1.2 sẽ tách key `reconCard`).

---

## Bối cảnh code hiện tại (đã verify)

- `frontend/src/pages/MainPage.tsx` có **2 sub-tab riêng**: `reconMpos` + `reconPayoo`, cả 2 render `<CardReconciliationTab lockedSource="mpos|payoo" />`. Tab SePay là `reconciliation` (`<ReconciliationTab/>`), nằm riêng — KHÔNG đụng.
- `frontend/src/components/CardReconciliationTab.tsx` đã hỗ trợ 2 nguồn qua state `source: GatewaySource` + `SOURCE_TABS` (mpos/payoo). Khi nhận prop `lockedSource` thì khoá 1 nguồn (dòng 102-107, 492-498).
- BE `GET /api/v1/gateway-txns` (`endpoints.cardRecon.list`) param `source` **optional** — bỏ trống = trả CẢ 2 nguồn (đã verify `backend/gateway_routes.py:305`). Mỗi row có field `source` ("mpos"/"payoo") trong serializer (`_serialize_gateway_txn`, dòng 121).
- Mỗi row đã render khác nhau theo `t.source` ở cột group (dòng 562-578) → render gộp đã sẵn sàng per-row.

---

## Scope

### IN scope (FE only)
1. `MainPage.tsx`: bỏ 2 sub-tab `reconMpos`/`reconPayoo` → 1 sub-tab `reconCard` "Quẹt thẻ (mPOS/Payoo)", render `<CardReconciliationTab onGoToSync=... />` **KHÔNG** truyền `lockedSource`.
2. `CardReconciliationTab.tsx`: khi KHÔNG có `lockedSource` → hiện 3 chip lọc nguồn "Tất cả / mPOS / Payoo" (mặc định "Tất cả"), thêm **cột "Nguồn"** vào bảng với badge phân biệt mPOS/Payoo.
3. Khi "Tất cả": load + đếm + lọc trên cả 2 nguồn.

### OUT of scope (KHÔNG làm)
- KHÔNG xoá prop `lockedSource` khỏi `CardReconciliationTab` (giữ để backward-compat; chỉ MainPage ngừng truyền).
- KHÔNG đụng `ReconciliationTab` (SePay) — vẫn là tab "Chuyển khoản" riêng.
- KHÔNG đụng `GatewaySyncTab` (tab "Đồng bộ mPOS/Payoo").
- KHÔNG đổi BE, KHÔNG đổi `endpoints.cardRecon`.
- KHÔNG đổi phân quyền / key module (để TOP1.2).
- KHÔNG đổi logic ghép (match/candidates/drawer).

---

## Files cần sửa

### 1. `frontend/src/pages/MainPage.tsx`

**1a. Bỏ lazy + preload thừa, thêm view mới.** Dòng 34, 46-47, 54:
- Giữ `const CardReconciliationTab = lazyRetry(...)` (dòng 34) — vẫn dùng.
- Trong `PRELOAD_MAP` (dòng 43-55): xoá 2 dòng `reconMpos`/`reconPayoo` (46-47), thêm:
```ts
  reconCard: () => import("../components/CardReconciliationTab"),
```

**1b. `ViewId` union (dòng 57-77):** xoá `| "reconMpos"` và `| "reconPayoo"`, thêm `| "reconCard"`.

**1c. `can()` mapping (dòng 252-259):** trong TOP1.1 GIỮ gate dưới `reconciliation`. Sửa nhánh:
```ts
// TRƯỚC:
const k = key === "reconMpos" || key === "reconPayoo" || key === "gatewaySync" ? "reconciliation"
  : key === "zaloConfig" || key === "zaloGroups" || key === "zaloOutbox" ? "permissions"
  : key;
// SAU (đổi reconMpos/reconPayoo → reconCard, GIỮ nguyên phần còn lại):
const k = key === "reconCard" || key === "gatewaySync" ? "reconciliation"
  : key === "zaloConfig" || key === "zaloGroups" || key === "zaloOutbox" ? "permissions"
  : key;
```
> ⚠️ TOP1.2 sẽ sửa lại dòng này (reconCard→"reconCard"). TOP1.1 chỉ cần app chạy được như cũ.

**1d. `reconChildren` (dòng ~285-293).** TRƯỚC:
```ts
const reconChildren: NavChildItem[] = [];
if (can("reconciliation"))
  reconChildren.push({ id: "reconciliation", label: "Chuyển khoản", subtitle: "PayOS / SePay" });
if (can("reconMpos"))
  reconChildren.push({ id: "reconMpos", label: "mPOS", subtitle: "Quẹt thẻ tại máy" });
if (can("reconPayoo"))
  reconChildren.push({ id: "reconPayoo", label: "Payoo", subtitle: "Thanh toán online" });
```
SAU:
```ts
const reconChildren: NavChildItem[] = [];
if (can("reconciliation"))
  reconChildren.push({ id: "reconciliation", label: "Chuyển khoản", subtitle: "SePay" });
if (can("reconCard"))
  reconChildren.push({ id: "reconCard", label: "Quẹt thẻ", subtitle: "mPOS / Payoo" });
```

**1e. activeView guards (dòng ~358).** Tìm `activeView === "reconMpos" ||` (và bất kỳ ref `reconPayoo`) trong khối tính layout/active → thay bằng `activeView === "reconCard"` (gộp 2 thành 1).

**1f. Render switch (dòng 376-377).** TRƯỚC:
```ts
case "reconMpos": return <CardReconciliationTab lockedSource="mpos" onGoToSync={() => setActiveView("gatewaySync")} />;
case "reconPayoo": return <CardReconciliationTab lockedSource="payoo" onGoToSync={() => setActiveView("gatewaySync")} />;
```
SAU:
```ts
case "reconCard": return <CardReconciliationTab onGoToSync={() => setActiveView("gatewaySync")} />;
```

> Sau khi sửa: chạy `grep -rn "reconMpos\|reconPayoo" frontend/src` → phải KHÔNG còn match nào (trừ file test cũ nếu có — xử lý theo mục cuối).

### 2. `frontend/src/components/CardReconciliationTab.tsx`

**2a. Thêm type + cập nhật SOURCE_TABS (dòng 22-25).**
```ts
type SourceFilter = "all" | GatewaySource;
const SOURCE_FILTERS: { id: SourceFilter; label: string }[] = [
  { id: "all", label: "Tất cả" },
  { id: "mpos", label: "mPOS" },
  { id: "payoo", label: "Payoo" },
];
const SOURCE_LABEL: Record<GatewaySource, string> = { mpos: "mPOS", payoo: "Payoo" };
```
Giữ `SOURCE_TABS` cũ NẾU còn chỗ dùng cho locked mode; nếu không, thay hết bằng SOURCE_FILTERS.

**2b. State.** Dòng 62 hiện: `const [source, setSource] = useState<GatewaySource>(lockedSource ?? "mpos");`
Thêm state filter:
```ts
const [sourceFilter, setSourceFilter] = useState<SourceFilter>(lockedSource ?? "all");
```
(Giữ `source` cho locked mode + `groupCol`. Khi locked, `sourceFilter === lockedSource`.)

**2c. `loadTxns` (dòng 77-88):** load theo filter, "all" → không truyền source.
```ts
const loadTxns = useCallback(async () => {
  setLoading(true);
  try {
    const params = sourceFilter === "all" ? {} : { source: sourceFilter };
    const { data } = await endpoints.cardRecon.list(params);
    setTxns(Array.isArray(data) ? data : []);
  } catch (err) {
    console.error("[card-recon] load txns failed", err);
    setTxns([]);
  } finally {
    setLoading(false);
  }
}, [sourceFilter]);
```
Effect `useEffect(() => { loadTxns(); }, [loadTxns]);` giữ nguyên (đã re-run khi sourceFilter đổi).

**2d. `bySource` → `visible` (dòng 127).** TRƯỚC: `const bySource = useMemo(() => txns.filter((t) => t.source === source), [txns, source]);`
SAU:
```ts
const visible = useMemo(
  () => (sourceFilter === "all" ? txns : txns.filter((t) => t.source === sourceFilter)),
  [txns, sourceFilter],
);
```
Đổi mọi tham chiếu `bySource` còn lại (`counts` dòng 133, `filtered` dòng 143) → `visible`.

**2e. Tabs render (dòng 490-514).** Thay khối `lockedSource ? (...) : (...)` bằng: locked → giữ 1 tab; không locked → render `SOURCE_FILTERS` với `sourceFilter`/`setSourceFilter`:
```tsx
{lockedSource ? (
  <div className="tabs">
    <div className="tab active">
      {SOURCE_LABEL[source]}
      <span className="tab-count">{loading ? "…" : visible.length}</span>
    </div>
  </div>
) : (
  <div className="tabs">
    {SOURCE_FILTERS.map((s) => {
      const isActive = sourceFilter === s.id;
      const n = s.id === "all" ? txns.length : txns.filter((t) => t.source === s.id).length;
      return (
        <div key={s.id} className={`tab ${isActive ? "active" : ""}`} onClick={() => setSourceFilter(s.id)}>
          {s.label}
          <span className="tab-count">{loading ? "…" : n}</span>
        </div>
      );
    })}
  </div>
)}
```

**2f. Thêm cột "Nguồn" vào bảng.** Trong `<thead>` (dòng 519-526) thêm `<th style={{ width: 90 }}>Nguồn</th>` ngay sau cột "Thời gian". Trong `<tbody>` mỗi row (sau `<td>` thời gian, dòng ~550) thêm:
```tsx
<td>
  <span className={`badge ${t.source === "mpos" ? "is-info" : "is-purple"}`} style={{ fontWeight: 600 }}>
    {SOURCE_LABEL[t.source as GatewaySource] ?? t.source}
  </span>
</td>
```
> Dùng class badge sẵn có trong `prototype-payments.css`. Nếu chưa có `.is-purple`/`.is-info` thì dùng inline style 2 màu phân biệt (mPOS = `var(--primary-bg)`/`var(--primary)`, Payoo = `var(--success-bg)`/`var(--success-text)` — đồng bộ với GatewaySyncTab dòng 219-224).
- Sửa `colSpan` của row "empty" (dòng 531) từ `6` → `7` (đã thêm 1 cột).

**2g. KPI subtitle (dòng 441, 465).** `SOURCE_TABS.find((s) => s.id === source)?.label` → khi "all" cần nhãn "Tất cả". Thay bằng:
```ts
const filterLabel = SOURCE_FILTERS.find((s) => s.id === sourceFilter)?.label ?? "Tất cả";
```
rồi dùng `{filterLabel}` ở 2 chỗ subtitle.

**2h. `groupCol` (dòng 355).** Khi "all" cột group lẫn mpos+payoo → header generic:
```ts
const groupCol = sourceFilter === "mpos" ? "Phiếu chi" : sourceFilter === "payoo" ? "Kênh / Mã đơn" : "Phiếu chi / Mã đơn";
```

**2i. `useEffect` đồng bộ lockedSource (dòng 102-107).** Khi vẫn còn prop, set cả `source` lẫn `sourceFilter`:
```ts
useEffect(() => {
  if (lockedSource) {
    setSource(lockedSource);
    setSourceFilter(lockedSource);
    setDrawerOpen(false);
  }
}, [lockedSource]);
```

---

## Acceptance criteria

1. Sidebar "Đối soát giao dịch" còn **2 con**: "Chuyển khoản" (SePay) + "Quẹt thẻ" (mPOS/Payoo). KHÔNG còn 2 mục mPOS, Payoo tách rời.
2. Vào "Quẹt thẻ" → mặc định chip **"Tất cả"** active, bảng hiện CẢ giao dịch mPOS lẫn Payoo, mỗi dòng có **badge Nguồn**.
3. Bấm chip "mPOS" → chỉ còn dòng mPOS; chip "Payoo" → chỉ Payoo; "Tất cả" → cả 2. Số đếm trên chip đúng.
4. Mở 1 dòng → drawer ghép lần thanh toán vẫn chạy y như cũ (match/candidates/ignore/unmatch).
5. Nút "Đồng bộ ngay" vẫn kéo cả 2 nguồn, sau sync bảng reload.
6. `npx tsc -b` PASS. KHÔNG còn ref `reconMpos`/`reconPayoo` trong `frontend/src` (trừ test cũ đã xử lý).

---

## Test plan

```bash
cd frontend && npx tsc -b      # PHẢI pass
cd frontend && npm run test    # unit
```
Manual (sandbox https://palfish-gmv-manager-sandbox.vercel.app/, login `test.admin@dev`):
1. Đối soát giao dịch → Quẹt thẻ → confirm chip "Tất cả" + badge nguồn mỗi dòng.
2. Lọc từng nguồn → đếm đúng.
3. Ghép thử 1 giao dịch → OK.
4. Tab "Chuyển khoản" (SePay) không bị ảnh hưởng.

---

## Anti-patterns (đừng làm)
1. ĐỪNG xoá prop `lockedSource` (giữ backward-compat).
2. ĐỪNG gộp tab SePay (`reconciliation`) vào đây — chỉ gộp mPOS+Payoo.
3. ĐỪNG sửa BE / endpoints / logic ghép.
4. ĐỪNG đổi key phân quyền ở task này (để TOP1.2). `can("reconCard")` tạm map về `reconciliation`.
5. ĐỪNG quên sửa `colSpan` row empty (6→7) sau khi thêm cột Nguồn.
6. ĐỪNG ship khi `tsc -b` chưa pass.

## Out-of-scope catch
Nếu có file test cũ ref `reconMpos`/`reconPayoo` hoặc snapshot tab mPOS/Payoo → cập nhật cho khớp cấu trúc mới (1 tab `reconCard`). Nếu test kiểm tra `lockedSource` behavior → giữ vì prop vẫn còn.
