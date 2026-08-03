# Kích hoạt gói học — danh sách phẳng theo khoá (flat per-course list)

**Ngày:** 2026-07-31
**Module:** B3 — Kích hoạt khóa học (`ActivationTab.tsx`, ViewId `module3`)
**Phạm vi:** FE-only. Không sửa BE, không migration. Một commit duy nhất → cherry-pick sang `main`.
**Nguồn yêu cầu:** Minh (PM) + chị Thu Hiền (kế toán vận hành) + anh Hiếu (qua Minh).

---

## 1. Vấn đề

Màn hình **Kích hoạt gói học** hiện liệt kê **1 dòng / 1 Active Request (AR)**. Để copy UID (dán sang CRM) hoặc điền Order ID, chị Hiền phải **mở drawer** từng AR — thêm thao tác. Bảng lại **quá rộng** (10 cột), **không phân trang** (render toàn bộ), **không cuộn ngang** → vỡ layout khi dùng split-screen.

Ba yêu cầu gốc (Zalo chị Hiền, chuyển tiếp bởi Minh):
1. *"Cop UID với điền Ord ID ở ngay chỗ này"* — copy UID + điền Order ID **ngay trên danh sách**, không mở drawer.
2. *"Bấm vào đây chị bị thêm thao tác ấy"* — bỏ bước mở drawer cho tác vụ hàng loạt.
3. *"Nộp gói học với xác nhận đã nộp chị hay thao tác hàng loạt dựa vào tin nhắn báo đơn"* — xử lý tuần tự theo tin báo đơn.

Chỉ đạo anh Hiếu (qua chị Hiền): *"Những hàng hiện ở tab Kích hoạt không gom theo PR-ID nữa mà cho nó xuất hiện theo yêu cầu kích hoạt khoá học."*

---

## 2. Quyết định thiết kế (đã chốt với người dùng)

| # | Quyết định | Nguồn |
|---|------------|-------|
| D1 | **Làm phẳng danh sách: 1 dòng / 1 khoá cần kích hoạt** (per UID + course), không gom theo PR/AR. | anh Hiếu + chị Hiền "phương án B" |
| D2 | **Nút Copy UID inline** trên mỗi dòng. | chị Hiền |
| D3 | **Ô nhập Order ID inline + nút "Lưu" tường minh** trên mỗi dòng (KHÔNG auto-save). | chị Hiền chọn "Nút Lưu tường minh" |
| D4 | **Ẩn Course Code ở màn hình chính**, thay bằng **UID + tên gói** (phân biệt khi 1 UID mua 2 gói). Course Code **vẫn giữ trong drawer AR** để giao tiếp module khác. | chị Hiền + làm rõ 31/7 |
| D5 | **Đếm tab theo khoá** (Chờ điền / Đã kích hoạt / Tất cả = số dòng-khoá). | chị Hiền chọn "Tab theo khoá" |
| D6 | **KPI card giữ theo AR** (relabel để không nhầm với tab). | chị Hiền chọn "KPI giữ theo AR" |
| D7 | **AR nửa vời tách theo khoá qua các tab**: khoá có Order ID → tab "Đã kích hoạt", khoá chưa có → tab "Chờ điền". | chị Hiền chọn "Tách theo khoá" |
| D8 | **Phân trang gói trọn từng AR**: các dòng-khoá của một AR không bao giờ bị cắt qua ranh trang. | Minh (số AR không quá nhiều nhưng 1 AR hiện đủ ô) |
| D9 | **Cuộn ngang** cho split-screen/màn hẹp. | Minh |
| D10 | **Thứ tự cột cố định (9 cột):** AR-ID/PR-ID · Khách hàng · UID · Gói học · Tiền · Order ID · Trạng thái · Thưởng GT · Tạo lúc. | Minh chốt 31/7 |
| D11 | **Cột Khách hàng hiện tên học viên** (`uidName`) nếu có, ngược lại tên khách (`customerName`); dòng phụ `KH: {customerName}` khi khác + `Sale: {saleName}`. | Minh "hiện tên học viên hoặc tên khách" |
| D12 | **Order ID đã lưu = readonly + nút bút chì** mở sửa (không gõ đè thẳng); khoá **đã xuất HĐ** (`invoiced`) khoá cứng, không có bút chì. | Minh chọn "readonly + bút chì" (chống lỡ tay đè số đã ghi doanh thu) |
| D13 | **Giữ vạch màu trái nhóm AR** (palette xoay vòng); AR đang được **nhắc kích hoạt gấp** (reminder) đè vạch cam (giữ tín hiệu urgent hiện có). | Minh "giữ" + không regress reminder |

---

## 3. Kiến trúc dữ liệu (pipeline thuần)

Tách logic ra file thuần **`frontend/src/components/activation/activationFlatList.ts`** (có unit test), để `ActivationTab.tsx` chỉ ráp state + render. Đây là yêu cầu từ learning `button-gate-existence-vs-resource` ("tách logic ra helper thuần để test đủ nhánh").

Pipeline (desktop):

```
rows: EnrichedActiveRequest[]                       // đã có (ActivationTab:2004)
  │
  ├─(A) lọc cấp-AR: date / referral / hold / search  // search mở rộng cấp-khoá + normVi
  │        arFiltered
  │
  ├─(B) flatCourseRows(arFiltered)                    // dùng flatCourses() có sẵn
  │        courseRows: CourseRow[]   (1 phần tử / 1 khoá)
  │
  ├─(C) lọc theo tab (cấp-khoá)                        // D5/D7
  │        tabRows
  │
  ├─(D) groupRowsByAr(tabRows)  → groups: {ar, rows}[] // giữ thứ tự
  │
  ├─(E) paginate(groups, page, AR_PER_PAGE)            // reuse helper đã test — D8
  │        pageGroups
  │
  └─(F) pageGroups.flatMap(g => g.rows) → render phẳng // D1 (không header nhóm)
```

### CourseRow (shape)

```ts
type CourseRow = {
  key: string;              // `${arId}::${courseCode}` — React key + draft key (courseCode unique/AR)
  arId: string;
  prId: string | null;
  customerName: string;     // tên người mua (dòng phụ "KH:" khi khác uidName) — D11
  saleName: string | null;
  createdAt: string;
  uid: string;
  uidName: string | null;   // ActiveUidGroup.name (tên học viên/bé) — cột Khách hàng ưu tiên — D11
  courseCode: string;       // GIỮ NGẦM, không render trên danh sách chính (D4)
  packageName: string;
  amount: number;
  orderId: string;          // "" nếu chưa điền
  activated: boolean;       // !!orderId.trim() — cấp khoá (D7)
  invoiced: boolean;        // course.invoiced — khoá cứng ô Order ID (D12)
  referral: ReferralStatus | null;  // cấp-AR (getArReferralStatus), lặp trên mỗi dòng — cột Thưởng GT
  holdActivation: boolean;  // cấp-AR — badge "Chưa muốn KH" ở cột Trạng thái
  holdNote: string | null;  // cấp-AR
};
```

### Helper thuần (đều pure, đều test)

| Hàm | Nhiệm vụ |
|-----|----------|
| `flatCourseRows(ars)` | Map enriched AR[] → CourseRow[] (dùng `flatCourses`, map `uid.name`, `customerName`, `saleName`, `createdAt`, `prId`). |
| `courseRowMatchesTab(row, tab)` | `pending_order` → `!row.activated`; `activated` → `row.activated`; `all` → true. |
| `courseRowMatchesSearch(row, nq)` | `normVi()` trên `[uid, packageName, customerName, arId, prId]`. **Sửa luôn bug dấu tiếng Việt** (learning `2026-07-11-search-normalize-vi`). |
| `groupRowsByAr(rows)` | Gom liên tiếp theo `arId` → `{arId, rows}[]` giữ thứ tự xuất hiện. |
| `applyCourseOrderId(ar, courseCode, orderId)` | Trả **AR mới** chỉ đổi Order ID của đúng khoá đó, các khoá/uid khác **bất biến**. Dùng cho lưu inline. |
| `countCourseTabs(ars)` | `{ all, pending_order, activated }` cấp-khoá (D5). |

`AR_PER_PAGE` = hằng số (khởi điểm **12**; chỉnh 1 dòng). Phân trang theo **số AR/trang** → chặn trên số AR mỗi trang, luôn hiện trọn dòng-khoá của mỗi AR (D8). Reuse `paginate()` + `pageItems()` (`paymentRequestUtils.ts`) — đã có test.

---

## 4. UI danh sách phẳng (desktop)

Thứ tự cột cố định 9 cột (D10). Bảng dùng `min-width` **scoped** (inline `style={{ minWidth: 1180 }}` trên đúng `<table>` này, không đụng `.tbl` chung) để `.tbl-wrap { overflow-x:auto }` cho cuộn ngang (D9). Split-screen sẽ cuộn tới cột Order ID (cột 6) — đánh đổi có ý thức: cái đau chính của chị Hiền là phải mở drawer mỗi dòng, inline đã bỏ hẳn; cuộn 1 lần rồi điền dọc cả cột.

| # | Cột | Nội dung |
|---|-----|----------|
| 1 | **AR-ID / PR-ID** | AR-ID pill (bấm → mở drawer) + dưới PR-ID pill nhỏ (hoặc "— Standalone —"). D1 không gom theo PR nhưng vẫn để tra cứu. |
| 2 | **Khách hàng** | `uidName` nếu có, else `customerName`; dòng phụ `KH: {customerName}` khi khác + `Sale: {saleName}`. D11 |
| 3 | **UID** | `[⧉ copy]` + UID (mono). D2 |
| 4 | **Gói học** | `packageName`. D4 (thay Course Code) |
| 5 | **Tiền** | `vnd(amount)` (phải) |
| 6 | **Order ID** | `<input>` inline + `[Lưu]`; đã lưu → readonly + bút chì; invoiced → khoá cứng. D3, D12 |
| 7 | **Trạng thái** | chip cấp-khoá: ⏳ Chờ điền (warning) / ✓ Đã kích hoạt (success); + badge "Chưa muốn KH" (AR-level hold). D7 |
| 8 | **Thưởng GT** | chip referral cấp-AR (getArReferralStatus): —/Đã cộng/1 phần/Chưa cộng — mirror render hiện tại |
| 9 | **Tạo lúc** | `formatPaymentDateTime(createdAt)` → date + time |

**Ẩn khỏi danh sách chính:** chỉ **Course Code** (D4) — vẫn hiện trong drawer AR. Mọi cột cũ khác (Thưởng GT, Trạng thái, PR-ID) đều **giữ**, theo chốt Minh 31/7.

**Vạch màu trái nhóm AR (D13):** mỗi group AR trên trang nhận một màu từ palette xoay vòng, gán qua `groupRowsByAr` theo chỉ số group (không random — chỉ số ổn định). Dòng thuộc AR đang được nhắc gấp (`reminderByPrId.get(prId)`) **đè vạch cam** + tooltip như hiện tại (không regress tín hiệu urgent). Render theo group (không `flatMap` thuần) để có chỉ số group cho màu.

**Row click** vẫn mở drawer (`setOpenArId(row.arId)`) cho các tác vụ khác (cộng buổi giới thiệu, thêm gói, địa chỉ, xuất HĐ). Các control inline (input, nút Lưu, nút Copy, nút bút chì) phải `stopPropagation` để không mở drawer khi thao tác.

### Copy UID inline (D2)

Mirror `copyPrId` trong `PaymentRequestTable.tsx`: `navigator.clipboard.writeText` → fallback `execCommand("copy")` → set `copiedKey` (theo `row.key`) + reset sau ~1.4s (đổi icon sang ✓ tạm thời).

### Lưu Order ID inline (D3) — reuse `persistActiveRequest`

State (cấp component chính): `orderIdDrafts: Record<string,string>` (key=`row.key`), `savingArIds: Set<string>`, `editingKeys: Set<string>` (readonly unlock — D12), `copiedKey`/`savedKey` (feedback tạm), `page`.

**3 chế độ ô Order ID (D12):**
- `invoiced` → khoá cứng: hiện `orderId` readonly, **không** bút chì, tooltip "Đã xuất HĐ — không sửa Order ID ở đây".
- `activated && !invoiced && !editing` → readonly + **nút bút chì**; bấm bút chì → thêm key vào `editingKeys` → mở input.
- chưa có orderId, hoặc đang `editing` → input mở + nút **Lưu**.

Input value = `drafts[key] ?? row.orderId`. Nút **Lưu** bật khi: `draft.trim() !== "" && draft.trim() !== row.orderId && !savingArIds.has(arId)`. Khi bấm:
1. **Đọc AR tươi từ state** `activeRequests.find(arId)` (KHÔNG dùng object đã capture lúc render) — chặn ghi đè cũ.
2. `next = applyCourseOrderId(freshAr, courseCode, draft.trim())` (chỉ đổi orderId của đúng khoá, khớp `saveCourseRow` drawer — attribution do BE set, FE không set `orderIdSetBy/At`).
3. `savingArIds.add(arId)` → `await persistActiveRequest(next)` — dùng nguyên đường có sẵn: cùng PATCH `active-requests`, cùng xử lý **409 trùng Order ID** (modal + `apiNote`), cùng `notifyLedgerChanged()` ghi Sổ doanh thu → `savingArIds.delete(arId)`.
4. `ok` → xoá `drafts[key]` + gỡ `editingKeys` (input rơi về giá trị đã lưu, về readonly), set `savedKey` "Đã lưu ✓" tạm ~1.4s. `!ok` → giữ draft, lỗi đã hiển thị sẵn.

**Guard đua same-AR (criterion 2):** `savingArIds: Set<string>`. Khi một khoá của AR đang lưu, **khoá disable nút Lưu của các dòng cùng AR đó** tới khi xong. Lý do: `persistActiveRequest` PATCH **toàn bộ** `uids_data`; nếu 2 dòng cùng AR lưu song song từ cùng snapshot cũ → last-write-wins nuốt Order ID của nhau. Khác AR lưu song song vẫn an toàn (khác record). Phù hợp thao tác thực tế của chị Hiền (điền tuần tự theo tin báo đơn).

---

## 5. Đếm & phân trang

- **Tab counts (cấp-khoá, D5):** `countCourseTabs(rows)` — số dòng-khoá theo trạng thái, tính trên **toàn bộ** rows (bỏ qua search/date để **giữ hành vi hiện tại** của `counts` AR-level; tránh đổi ngầm ngữ nghĩa). Dòng phụ dưới tab: *"Mỗi dòng = 1 khoá cần kích hoạt"* để tách bạch với KPI.
- **KPI cards (cấp-AR, D6):** giữ nguyên `counts.all / pending_order / activated / invoiced` (AR-level). Relabel nhẹ để không nhầm với tab cùng chữ:
  - "Chờ điền Order ID" (KPI) → sub đổi thành *"AR chưa điền đủ Order ID"* (rõ đơn vị AR).
  - "Đã kích hoạt" (KPI) → giữ, sub *"{vnd} sẵn sàng xuất HĐ"* (đã là AR).
- **Phân trang (D8):** `page` state, reset về 1 khi đổi `[tab, search, dateRange, referralFilter, holdFilter]`. Footer `.pagi` mirror `PaymentRequestTable.tsx` (Trang trước/sau + `pageItems`). Hiển thị: `Trang X · {n} AR · {m} dòng khoá`.

---

## 6. Phạm vi & ranh giới

**Trong phạm vi:** bảng **desktop** của `ActivationTab.tsx` (flatten + copy + inline save + tab counts + pagination + cuộn ngang), 1 file util mới + test, chỉnh CSS tối thiểu (inline min-width; không đổi `.tbl` chung).

**Ngoài phạm vi (giữ nguyên):**
- **Mobile** (`ActivationRowCards`) giữ cấp-AR, sửa Order ID qua drawer. Chị Hiền dùng desktop split-screen — inline mobile để lần sau, tránh phình scope/commit.
- **Drawer AR** (`ActivationDetailDrawer`) không đổi — vẫn hiện Course Code, cộng buổi GT, thêm gói, xuất HĐ.
- **BE / bảng / endpoint / migration:** không đụng.

---

## 7. Đánh giá theo 4 tiêu chí

1. **Triệt để:** giải quyết cả 3 yêu cầu (copy UID + điền Order ID + bỏ mở drawer) đúng mô hình "theo khoá" của anh Hiếu; tiện thể sửa bug search dấu tiếng Việt. Không chắp vá.
2. **Không lỗi con:** reuse `persistActiveRequest` (giữ nguyên 409/ledger/optimistic); đọc state tươi + serialize lưu cùng-AR chặn nuốt Order ID; helper thuần test đủ nhánh (flatten / tab split / search / group / applyCourseOrderId bất biến khoá khác); drawer + mobile không đụng.
3. **Không tăng gánh hạ tầng / không giảm hiệu năng:** FE-only, 0 request BE mới, 0 migration. Flatten là memo O(số khoá). Phân trang **giảm** số DOM row render (trước: toàn bộ; sau: ≤ 1 trang) → nhanh hơn khi list lớn. Reuse `paginate` đã test.
4. **Tiết kiệm quota:** một commit, sửa surgical 1 file chính + 1 util + 1 test + CSS nhỏ; không fan-out subagent.

---

## 8. Kế hoạch test (Vitest)

`frontend/src/components/activation/activationFlatList.test.ts`:

- **flatten:** AR 2 uid × (1,2 khoá) → 3 rows; map đúng `uid/uidName/packageName/amount/customerName`.
- **tab split (D7):** AR có c1(orderId) + c2(rỗng) → `all`=2, `pending_order`=1 (c2), `activated`=1 (c1).
- **search normVi:** "nhu y"↔"Như Ý", "dang"↔"Đặng", khớp uid & packageName & prId; rỗng/null-safe.
- **group + pagination (D8):** với `AR_PER_PAGE` nhỏ, mọi dòng-khoá của một AR nằm trọn 1 trang (không cắt); tổng số trang đúng.
- **countCourseTabs (D5):** đếm cấp-khoá khớp.
- **applyCourseOrderId (criterion 2):** set c2 KHÔNG xoá c1; AR gốc bất biến (không mutate); courseCode sai → no-op an toàn.

Validation loop (skill `activation-and-invoicing`): `npx tsc -b` → `npm run test -- activationFlatList` → `npm run test -- ActivationTab.invoiceBlockers` (không regress) → `npm run build`.

---

## 9. Giao hàng

Một commit duy nhất trên `sandbox` → cherry-pick sang `main` (sandbox còn task khác chưa tiện live prod). Không kèm migration.
