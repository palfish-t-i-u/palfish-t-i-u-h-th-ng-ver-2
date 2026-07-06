# PLAN — TVTS-FILTER: Bộ lọc tạm thời theo TVTS ở tab Quản lý thanh toán

> ⚠️ **ĐÃ HOÀN THÀNH — KHÔNG LÀM LẠI**
>
> Tính năng này đã được implement xong và merge vào `main` ngày 06/07/2026
> (merge commit `b70e80f`). Toàn bộ code + test đã chạy trên production.
> Tài liệu này CHỈ giữ làm tham khảo kiến trúc/quyết định thiết kế.
> Nếu bạn là AI được giao task từ file này: DỪNG LẠI, kiểm tra
> `frontend/src/components/payment-request/TvtsFilterDropdown.tsx` đã tồn tại,
> và báo lại người giao task rằng tính năng đã ship.


**Origin:** Yêu cầu Minh 06/07/2026 — "leader/manager lọc ra 1 sale hoặc 1 nhóm sale rồi chỉ xem PR liên quan tới họ, giống bộ lọc tạm thời trên Google Sheet. Bộ lọc CHỈ tạm thời: F5 hoặc thoát app vào lại thì hiện đầy đủ như thường."

**Quyết định đã chốt (Minh 06/07/2026):** Làm dropdown multi-select TVTS trong toolbar của tab Quản lý thanh toán (B1). FE-only, lọc client-side trên data đã load. Không đụng BE.

**Tổng effort ước tính:** ~10h, chia 3 task độc lập tối đa. FE-only. Migration: KHÔNG.

---

## 1. Mô tả tính năng (user-facing)

- Leader/manager/system thấy thêm 1 nút **"TVTS ▾"** trong toolbar (cạnh các chip Tất cả / Chưa TT / Thiếu / Đủ / Thừa).
- Bấm mở panel: danh sách TVTS (tick chọn nhiều), ô tìm nhanh trong panel, nút "Bỏ lọc".
- Chọn 1 hoặc nhiều TVTS → **toàn bộ tab** (4 card KPI, số đếm trên chip, số đếm 3 tab Đang theo dõi / Gói học đã tạo / Đã huỷ, bảng) chỉ phản ánh PR của các TVTS đã chọn — đúng semantics filter Google Sheet: "chỉ xem PR liên quan tới họ".
- Không chọn ai = không lọc (mặc định).
- **Sale thường KHÔNG thấy nút này** (họ chỉ thấy PR của chính mình — lọc vô nghĩa).
- **Bộ lọc là tạm thời:** F5, đóng tab trình duyệt, logout/login lại, hoặc chuyển sang tab khác trong app rồi quay lại → bộ lọc tự về mặc định (hiện đầy đủ).

## 2. Kiến trúc & quyết định kỹ thuật (CHỐT — không relitigate)

| # | Quyết định | Lý do |
|---|---|---|
| C1 | **FE-only, lọc client-side.** Không thêm param API, không sửa BE. | Data đã nằm sẵn trong `PaymentFlowContext` (BE đã scope theo role qua `visible_creator_emails()`). Lọc thêm ở FE = 0 request mới. Thỏa 3 tiêu chí: triệt để (lọc tại tầng data FE), không lỗi con (pure derived state), không tăng gánh nặng hạ tầng. |
| C2 | **State = `useState` thường trong `PaymentRequestsTab`.** KHÔNG localStorage, KHÔNG sessionStorage, KHÔNG module-level cache, KHÔNG URL param. | Spec yêu cầu reset khi F5/thoát app. `useState` reset cả khi chuyển tab trong app — chấp nhận được và **nhất quán với các filter anh em** (search, status, dateRange đều là `useState`, đều mất khi chuyển tab). Đơn giản nhất = ít failure mode nhất. |
| C3 | **Điểm chèn filter: giữa `visibleRequests` và các list dẫn xuất.** `trackingRequests` / `cancelledRequests` / `createdRequests` / `filtered` đổi nguồn từ `visibleRequests` → `tvtsFiltered`. | KPI cards, chip counts, tab counts, bảng đều tự phản ánh filter — không sửa từng chỗ. Khác search (chỉ lọc bảng): TVTS filter là thu hẹp phạm vi, cùng bản chất với `hideTest`. |
| C4 | **Định danh TVTS theo `saleEmail`** (trim + lowercase). `saleEmail` rỗng → bucket `UNKNOWN_TVTS_KEY` label "Không rõ TVTS". Label ưu tiên `saleName`, fallback phần trước `@` của email — cùng fallback với cột TVTS trong bảng (`PaymentRequestTable.tsx:234`). | `saleName` chỉ có ở response danh sách và có thể thiếu (`types/paymentRequest.ts:114`); email ổn định hơn tên. |
| C5 | **Options dẫn xuất từ `visibleRequests`** (sau hideTest, TRƯỚC tvts filter) — panel luôn liệt kê đủ mọi TVTS đang có data, kể cả khi đang lọc. Sort A→Z locale `"vi"`, "Không rõ TVTS" luôn cuối. | Giống dropdown filter GSheet: liệt kê mọi giá trị của cột. |
| C6 | **Selection rỗng = không lọc.** Không auto-prune key đã chọn nhưng biến mất khỏi options (vd bật "Ẩn data test") — bảng hiện rỗng là hành vi đúng, user bấm "Bỏ lọc". | Tránh effect ngầm khó test. Selection sống ngắn (session) nên rủi ro stale thấp. |
| C7 | **Component dropdown mô phỏng `ColumnVisibilityMenu.tsx`** (pattern đã review: outside-click, Escape, controlled) nhưng đặt ở `components/payment-request/` + style bằng class trong `prototype-payments.css` — vì tab B1 là trang prototype-CSS, không phải trang gmv-Tailwind. | Nhất quán visual với toolbar hiện tại (`filter-chip`). |
| C8 | **Toolbar nhận slot `tvtsFilter?: ReactNode`**, render sau block chips, NGOÀI điều kiện `showChips` — tab "Đã huỷ" vẫn lọc được. Logic role (`showTvts`) nằm ở `PaymentRequestsTab`, toolbar không biết role. | Toolbar đổi tối thiểu (2 dòng), không prop-drilling 3 props. |
| C9 | Drawer chi tiết KHÔNG bị ảnh hưởng khi PR đang mở bị filter loại khỏi bảng — `selected` tra từ `requests` gốc (`PaymentRequestsTab.tsx:106-109`), không tra từ list đã lọc. ĐÃ verify, không cần code thêm. | An toàn sẵn có. |

## 3. Contract giữa 3 task (code theo đúng chữ ký này)

```typescript
// ===== paymentRequestUtils.ts (TVTS-01 — Đạt) =====
export const UNKNOWN_TVTS_KEY = "__unknown_tvts__";
export interface TvtsOption { key: string; label: string; count: number }
export function tvtsKeyOf(r: PaymentRequest): string;
export function tvtsLabelOf(r: PaymentRequest): string;
export function deriveTvtsOptions(requests: PaymentRequest[]): TvtsOption[];
export function applyTvtsFilter(requests: PaymentRequest[], selected: ReadonlySet<string>): PaymentRequest[];
// applyTvtsFilter với selected.size === 0 PHẢI trả về đúng reference mảng đầu vào

// ===== TvtsFilterDropdown.tsx (TVTS-02 — Đức) =====
// components/payment-request/TvtsFilterDropdown.tsx — controlled, không giữ selection state nội bộ
export default function TvtsFilterDropdown(props: {
  options: TvtsOption[];
  selected: ReadonlySet<string>;
  onChange: (next: ReadonlySet<string>) => void;
}): JSX.Element;

// ===== PaymentRequestsTab.tsx + PaymentRequestToolbar.tsx (TVTS-03 — Giang) =====
const [tvtsSelected, setTvtsSelected] = useState<ReadonlySet<string>>(new Set());
const tvtsOptions = useMemo(() => deriveTvtsOptions(visibleRequests), [visibleRequests]);
const tvtsFiltered = useMemo(() => applyTvtsFilter(visibleRequests, tvtsSelected), [visibleRequests, tvtsSelected]);
// PaymentRequestToolbar: thêm prop tvtsFilter?: ReactNode
```

## 4. Chia task & thứ tự merge

| Task | Người | Nội dung | Phụ thuộc | Effort |
|---|---|---|---|---|
| TVTS-01 | **Đạt** | Utils thuần (`tvtsKeyOf`, `tvtsLabelOf`, `deriveTvtsOptions`, `applyTvtsFilter`) + unit test. File test RIÊNG để không conflict. | Không | ~2h |
| TVTS-02 | **Đức** | Component `TvtsFilterDropdown` + CSS + unit test. | Import type từ TVTS-01 (có thể code song song theo contract mục 3, rebase khi 01 merge) | ~3h |
| TVTS-03 | **Giang** | Nối vào `PaymentRequestsTab` + `PaymentRequestToolbar`, integration test (mock context) + E2E spec. | TVTS-01 + TVTS-02 đã merge | ~4-5h |

**Branch flow (chốt Minh 06/07/2026): làm trên `sandbox` trước — KHÔNG merge thẳng main.**

0. Trước khi team bắt đầu: sync `sandbox` với `main` (merge main → sandbox) để line number trong handoff khớp source. Minh hoặc Giang làm 1 lần.
1. Mỗi task = 1 branch tách từ `sandbox` (vd `feat/tvts-01-utils`), **squash thành 1 commit** `feat(pr-filter): ...`, PR vào **`sandbox`**.
2. Thứ tự merge vào sandbox: **01 → 02 → 03**. Đạt + Đức bắt đầu song song ngay; Giang bắt đầu khi 01+02 đã vào sandbox.
3. Push sandbox → Vercel sandbox tự deploy (https://palfish-gmv-manager-sandbox.vercel.app/). FE-only — KHÔNG cần deploy Render BE.
4. Giang chạy E2E trên sandbox; Minh review từng PR + test tay trên sandbox app.
5. Minh review thấy ổn → Giang merge `sandbox` → `main` (merge commit giữ nguyên, không squash), Vercel prod tự deploy.

**Handoff chi tiết từng task:**
- `docs/HANDOFF_TVTS-01_DAT_FILTER_UTILS.md`
- `docs/HANDOFF_TVTS-02_DUC_DROPDOWN_COMPONENT.md`
- `docs/HANDOFF_TVTS-03_GIANG_INTEGRATION_E2E.md`

## 5. Guardrails chung (áp cho CẢ 3 task)

1. **KHÔNG persist filter dưới mọi hình thức** — không localStorage, sessionStorage, module-level cache, URL param, cookie. Chỉ `useState`.
2. **KHÔNG sửa BE**, không sửa `api.ts`, không sửa `PaymentFlowContext.tsx`.
3. **KHÔNG sửa logic search hiện tại** (`PaymentRequestsTab.tsx:151`) — TVTS filter là tầng riêng.
4. **KHÔNG sửa `PaymentRequestDetailDrawer`** và mọi modal.
5. **KHÔNG thêm npm dependency mới.**
6. Chỉ sửa file trong whitelist của task mình (xem từng handoff). Đụng file ngoài whitelist = dừng, hỏi Minh.
7. Gate bắt buộc trước khi push: `cd frontend && npx tsc -b` PASS + test của task PASS.
8. **Loop budget:** cùng 1 gate fail 2 lần liên tiếp → DỪNG, báo Minh kèm output nguyên văn. Không tự sửa mù lần 3.
9. Thuật ngữ trong UI string/comment: dùng "PR", "lần thanh toán", "TVTS" — KHÔNG dùng "phiếu thu".
10. **KHÔNG push/PR trực tiếp vào `main`** — mọi thứ đi qua `sandbox`; chỉ Giang merge sandbox → main SAU khi Minh duyệt trên sandbox app.

## 6. Test matrix tổng (chi tiết trong từng handoff)

| Tầng | File | Người |
|---|---|---|
| Unit utils | `paymentRequestUtils.tvts.test.ts` (mới) | Đạt |
| Unit component | `TvtsFilterDropdown.test.tsx` (mới) | Đức |
| Integration (mock context, render tab) | `PaymentRequestsTab.tvtsFilter.test.tsx` (mới) | Giang |
| E2E sandbox | `e2e/payment-tvts-filter.spec.ts` (mới) | Giang |

Bất biến quan trọng nhất phải có test ở ≥2 tầng:
- Chọn TVTS → mọi dòng bảng đều thuộc TVTS đã chọn; KPI/chip/tab count co lại tương ứng.
- Bỏ chọn hết → y hệt trạng thái ban đầu.
- Role `sale` → không render nút TVTS.
- F5 (E2E) → filter biến mất.

## 7. Bối cảnh đã verify (06/07/2026 — grep trực tiếp source)

- `PaymentRequestsTab.tsx:46` — `showTvts = (profile?.role ?? "sale") !== "sale"`
- `PaymentRequestsTab.tsx:121-124` — `visibleRequests` memo (nguồn chèn filter)
- `PaymentRequestsTab.tsx:127,131,135,141` — 4 chỗ tiêu thụ `visibleRequests` cần đổi nguồn
- `PaymentRequestsTab.tsx:156-158` — effect reset page (thêm dep `tvtsSelected`)
- `PaymentRequestsTab.tsx:749` — KPI cards nhận `trackingRequests`
- `PaymentRequestsTab.tsx:751-762` — vị trí render Toolbar
- `PaymentRequestToolbar.tsx:45-69` — block chips; slot chèn sau block này
- `paymentRequestUtils.ts:107-142` — `fromApiPaymentRequest`: `saleEmail` default `""` (line 128), `saleName` chỉ set khi BE trả (line 130)
- `PaymentRequestTable.tsx:234` — fallback hiển thị TVTS: `saleName || saleEmail.split("@")[0] || "—"`
- `types/paymentRequest.ts:113-115` — `saleEmail?: string`, `saleName?: string`
- `ui/ColumnVisibilityMenu.tsx` — pattern dropdown tham chiếu (outside-click/Escape)
- `prototype-payments.css:107-156` — `.toolbar` (có `flex-wrap: wrap` line 113), `.filter-chip`; vars: `--surface`, `--surface-2`, `--surface-3`, `--border`, `--primary-700` đều tồn tại
- E2E hiện có: `e2e/auth.setup.ts`, `e2e/auth-role.setup.ts`, `e2e/rbac-visibility.spec.ts`, helpers `e2e/helpers/navigation.ts`
