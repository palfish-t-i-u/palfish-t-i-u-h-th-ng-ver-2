# HANDOFF — TVTS-01: Utils bộ lọc TVTS (Đạt)

> ⚠️ **ĐÃ HOÀN THÀNH — KHÔNG LÀM LẠI**
>
> Tính năng này đã được implement xong và merge vào `main` ngày 06/07/2026
> (merge commit `b70e80f`). Toàn bộ code + test đã chạy trên production.
> Tài liệu này CHỈ giữ làm tham khảo kiến trúc/quyết định thiết kế.
> Nếu bạn là AI được giao task từ file này: DỪNG LẠI, kiểm tra
> `frontend/src/components/payment-request/TvtsFilterDropdown.tsx` đã tồn tại,
> và báo lại người giao task rằng tính năng đã ship.


**Origin:** `docs/PLAN_TVTS_FILTER.md` — đọc mục 1, 2, 5 trước khi bắt đầu.

**Quyết định đã chốt (Minh 06/07/2026):** Thêm 4 hàm + 1 const + 1 interface thuần logic vào `paymentRequestUtils.ts`. Không UI, không state, không side-effect. Đây là nền cho TVTS-02 (Đức) và TVTS-03 (Giang) — **chữ ký hàm phải đúng từng ký tự theo contract dưới đây**, vì 2 người kia code song song dựa trên nó.

**Effort:** ~2h. FE-only. Migration: KHÔNG.

---

## Bối cảnh (ĐÃ verify 06/07/2026)

- `frontend/src/components/payment-request/paymentRequestUtils.ts` — file đích, đã import sẵn `PaymentRequest` type.
- `paymentRequestUtils.ts:128` — `saleEmail: raw.sale_email ?? raw.saleEmail ?? ""` → saleEmail **có thể là chuỗi rỗng**, không phải chỉ undefined.
- `paymentRequestUtils.ts:130` — `saleName` chỉ được set khi BE trả về (endpoint danh sách); PR từ response PATCH/POST **không có** `saleName`.
- `types/paymentRequest.ts:113-115` — `saleEmail?: string; saleName?: string;`
- `PaymentRequestTable.tsx:234` — bảng đang hiển thị TVTS bằng `p.saleName || (p.saleEmail ? p.saleEmail.split("@")[0] : "—")` → label của mình phải cùng logic fallback để user thấy nhất quán.

## Scope

### IN scope
1. Thêm block code dưới đây vào **cuối** `frontend/src/components/payment-request/paymentRequestUtils.ts`.
2. Tạo file test mới `frontend/src/components/payment-request/paymentRequestUtils.tvts.test.ts` (file RIÊNG — không đụng `paymentRequestUtils.test.ts` có sẵn, tránh conflict với task khác).

### OUT of scope (KHÔNG làm)
1. KHÔNG sửa bất kỳ hàm nào đang có trong `paymentRequestUtils.ts`.
2. KHÔNG import gì mới vào file utils (PaymentRequest đã import sẵn).
3. KHÔNG tạo component, không sửa `PaymentRequestsTab.tsx` / `PaymentRequestToolbar.tsx` — đó là TVTS-02/03.
4. KHÔNG thêm npm package.

**Whitelist file được sửa/tạo:** `paymentRequestUtils.ts` (append cuối file), `paymentRequestUtils.tvts.test.ts` (mới).

## Code cần thêm (copy đúng, giữ nguyên comment)

```typescript
// ===== TVTS filter (bộ lọc tạm thời theo TVTS — TVTS-01) =====

/** Bucket cho PR không có sale_email (data cũ / data test). */
export const UNKNOWN_TVTS_KEY = "__unknown_tvts__";

export interface TvtsOption {
  /** saleEmail chuẩn hoá (trim + lowercase), hoặc UNKNOWN_TVTS_KEY */
  key: string;
  /** Tên hiển thị: saleName > phần trước @ của email > "Không rõ TVTS" */
  label: string;
  /** Số PR thuộc TVTS này trong danh sách đang thấy (tính mọi bucket, kể cả Đã huỷ) */
  count: number;
}

/** Key định danh TVTS của 1 PR — dùng saleEmail vì ổn định hơn saleName (saleName chỉ có ở response danh sách). */
export function tvtsKeyOf(r: PaymentRequest): string {
  const email = (r.saleEmail ?? "").trim().toLowerCase();
  return email || UNKNOWN_TVTS_KEY;
}

/** Label TVTS của 1 PR — cùng fallback với cột TVTS trong bảng (PaymentRequestTable). */
export function tvtsLabelOf(r: PaymentRequest): string {
  if (r.saleName) return r.saleName;
  const email = (r.saleEmail ?? "").trim();
  if (email.includes("@")) return email.split("@")[0];
  return email || "Không rõ TVTS";
}

/**
 * Danh sách option cho dropdown lọc TVTS.
 * - Unique theo key; nếu PR đầu tiên gặp thiếu saleName thì lấy saleName từ PR sau (nếu có)
 * - Sort A→Z theo locale "vi"; bucket "Không rõ TVTS" luôn nằm cuối
 */
export function deriveTvtsOptions(requests: PaymentRequest[]): TvtsOption[] {
  const map = new Map<string, { label: string; count: number; hasName: boolean }>();
  for (const r of requests) {
    const key = tvtsKeyOf(r);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { label: tvtsLabelOf(r), count: 1, hasName: !!r.saleName });
    } else {
      existing.count += 1;
      if (!existing.hasName && r.saleName) {
        existing.label = r.saleName;
        existing.hasName = true;
      }
    }
  }
  const options = [...map.entries()].map(([key, v]) => ({ key, label: v.label, count: v.count }));
  return options.sort((a, b) => {
    if (a.key === UNKNOWN_TVTS_KEY) return 1;
    if (b.key === UNKNOWN_TVTS_KEY) return -1;
    return a.label.localeCompare(b.label, "vi");
  });
}

/**
 * Áp bộ lọc TVTS. selected rỗng = không lọc — trả về ĐÚNG reference mảng đầu vào
 * (bất biến quan trọng: giữ ổn định useMemo phía PaymentRequestsTab).
 */
export function applyTvtsFilter(
  requests: PaymentRequest[],
  selected: ReadonlySet<string>
): PaymentRequest[] {
  if (selected.size === 0) return requests;
  return requests.filter((r) => selected.has(tvtsKeyOf(r)));
}
```

## Test plan — `paymentRequestUtils.tvts.test.ts`

Fixture: viết helper `makePr(overrides: Partial<PaymentRequest>): PaymentRequest` trả về PR tối thiểu hợp lệ (copy shape từ fixture trong `paymentRequestUtils.test.ts` có sẵn, chỉ cần các field bắt buộc + `saleEmail`/`saleName`).

Các test case BẮT BUỘC (đặt tên đúng như sau):

```
describe("tvtsKeyOf")
  ✓ "chuẩn hoá email: trim + lowercase"            // "  Nhung@PF.vn " → "nhung@pf.vn"
  ✓ "saleEmail rỗng hoặc undefined → UNKNOWN_TVTS_KEY"
describe("tvtsLabelOf")
  ✓ "ưu tiên saleName khi có"
  ✓ "fallback phần trước @ khi thiếu saleName"      // "nhung@pf.vn" → "nhung"
  ✓ "không có gì → 'Không rõ TVTS'"
describe("deriveTvtsOptions")
  ✓ "unique theo key, count đúng số PR mỗi TVTS"
  ✓ "cùng email khác hoa thường → gộp 1 option"     // "A@pf.vn" + "a@pf.vn" → 1 option count 2
  ✓ "PR đầu thiếu saleName, PR sau có → label lấy saleName"
  ✓ "sort A→Z locale vi, UNKNOWN luôn cuối"         // ["Ánh","Bình","Không rõ TVTS"] — Ánh phải đứng trước Bình
  ✓ "mảng rỗng → []"
describe("applyTvtsFilter")
  ✓ "selected rỗng → trả về ĐÚNG reference đầu vào" // expect(result).toBe(input) — toBe, không phải toEqual
  ✓ "lọc 1 key → chỉ PR của TVTS đó"
  ✓ "lọc nhiều key → union các TVTS"
  ✓ "UNKNOWN_TVTS_KEY lọc được PR thiếu saleEmail"
  ✓ "key không tồn tại trong data → mảng rỗng"      // hành vi chốt C6: không auto-prune
```

## Acceptance criteria

1. 4 hàm + const + interface export đúng chữ ký contract (mục 3 của PLAN).
2. `applyTvtsFilter([], new Set())` và mọi case selected rỗng trả về đúng reference đầu vào (`toBe`).
3. Không sửa dòng nào ngoài phần append + file test mới (`git diff --stat` chỉ hiện 2 file).
4. `cd frontend && npx tsc -b` PASS.
5. `cd frontend && npm run test -- src/components/payment-request/paymentRequestUtils.tvts.test.ts` PASS toàn bộ.
6. `cd frontend && npm run test -- src/components/payment-request/paymentRequestUtils.test.ts` PASS (không phá test cũ).

## Anti-patterns (đừng làm)

1. **Đừng key theo `saleName`** — tên có thể trùng/thiếu; email mới là định danh. Đã chốt C4.
2. **Đừng trả mảng mới khi selected rỗng** (`[...requests]`) — phá memo stability, gây re-render dây chuyền.
3. **Đừng mutate mảng input trong `deriveTvtsOptions`** — dùng `[...map.entries()]` rồi sort bản copy (code mẫu đã đúng, đừng "tối ưu" lại).
4. **Đừng dùng `sort()` mặc định** cho tên tiếng Việt — phải `localeCompare(b.label, "vi")`.
5. **Đừng thêm logic UI/React** vào file utils này.
6. Đừng sửa file test cũ `paymentRequestUtils.test.ts` — file test mới hoàn toàn tách biệt.

## Branch & commit

- Branch tách từ **`sandbox`** (sync main trước — xem PLAN mục 4 bước 0): `feat/tvts-01-utils`.
- PR vào **`sandbox`**, KHÔNG vào main. Minh review trên sandbox trước; Giang merge sandbox → main sau khi Minh duyệt.
- 1 commit duy nhất (squash nếu lỡ nhiều): `feat(pr-filter): TVTS filter utils + unit tests (TVTS-01)`
