# HANDOFF — TVTS-02: Component TvtsFilterDropdown (Đức)

> ⚠️ **ĐÃ HOÀN THÀNH — KHÔNG LÀM LẠI**
>
> Tính năng này đã được implement xong và merge vào `main` ngày 06/07/2026
> (merge commit `b70e80f`). Toàn bộ code + test đã chạy trên production.
> Tài liệu này CHỈ giữ làm tham khảo kiến trúc/quyết định thiết kế.
> Nếu bạn là AI được giao task từ file này: DỪNG LẠI, kiểm tra
> `frontend/src/components/payment-request/TvtsFilterDropdown.tsx` đã tồn tại,
> và báo lại người giao task rằng tính năng đã ship.


**Origin:** `docs/PLAN_TVTS_FILTER.md` — đọc mục 1, 2, 5 trước khi bắt đầu.

**Quyết định đã chốt (Minh 06/07/2026):** Component dropdown multi-select **controlled** (không giữ selection state nội bộ — chỉ giữ `open` + text search trong panel). Mô phỏng pattern `ui/ColumnVisibilityMenu.tsx` (outside-click, Escape) nhưng style bằng CSS class trong `prototype-payments.css` vì tab B1 là trang prototype-CSS.

**Effort:** ~3h. FE-only. Migration: KHÔNG.

**Phụ thuộc:** import `TvtsOption` từ TVTS-01 (Đạt). Nếu TVTS-01 chưa merge khi bắt đầu: cứ viết import như code mẫu, code song song, rebase khi 01 vào `sandbox`. Chữ ký `TvtsOption` chốt trong PLAN mục 3 — không đổi.

---

## Bối cảnh (ĐÃ verify 06/07/2026)

- `frontend/src/components/ui/ColumnVisibilityMenu.tsx:29-45` — pattern outside-click + Escape để copy (đã qua review, đã có test).
- `frontend/src/components/payment-request/Icons.tsx` — có sẵn `Icons.User` (line 107), `Icons.ChevronDown` (line 94), `Icons.Search` (line 63). KHÔNG cần thêm icon mới.
- `frontend/src/styles/prototype-payments.css:139-156` — class `.filter-chip` + `.filter-chip.active` để trigger button đồng bộ visual với các chip hiện có.
- CSS vars có sẵn trong file đó: `--surface` (#fff), `--surface-2`, `--surface-3`, `--border`, `--text-2`, `--text-3`, `--primary`, `--primary-700`.
- `.toolbar` có `flex-wrap: wrap` (line 113) — dropdown thêm vào không vỡ layout.

## Scope

### IN scope
1. Tạo `frontend/src/components/payment-request/TvtsFilterDropdown.tsx` theo code mẫu dưới.
2. Append block CSS vào cuối `frontend/src/styles/prototype-payments.css`.
3. Tạo test `frontend/src/components/payment-request/TvtsFilterDropdown.test.tsx`.

### OUT of scope (KHÔNG làm)
1. KHÔNG nối component vào `PaymentRequestsTab` / `PaymentRequestToolbar` — đó là TVTS-03 (Giang).
2. KHÔNG sửa `ColumnVisibilityMenu.tsx` (chỉ đọc tham khảo).
3. KHÔNG sửa `Icons.tsx`.
4. KHÔNG dùng Tailwind gmv-* class trong component này (trang này theo prototype CSS).
5. KHÔNG thêm npm package (không headlessui, không radix...).

**Whitelist file được sửa/tạo:** `TvtsFilterDropdown.tsx` (mới), `TvtsFilterDropdown.test.tsx` (mới), `prototype-payments.css` (append cuối).

## Code mẫu component (bám sát, được phép chỉnh nhỏ nếu tsc/test yêu cầu)

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Icons } from "./Icons";
import type { TvtsOption } from "./paymentRequestUtils";

// Gấp dấu tiếng Việt để tìm không phân biệt dấu ("le" khớp "Lê", "nhung" khớp "Nhung")
const foldVi = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");

export default function TvtsFilterDropdown({
  options,
  selected,
  onChange,
}: {
  options: TvtsOption[];
  selected: ReadonlySet<string>;
  onChange: (next: ReadonlySet<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Đóng khi click ra ngoài / Escape — cùng pattern ColumnVisibilityMenu
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const visibleOptions = useMemo(() => {
    const q = foldVi(query.trim());
    if (!q) return options;
    return options.filter((o) => foldVi(o.label).includes(q));
  }, [options, query]);

  const toggle = (key: string) => {
    // Không mutate Set từ props — luôn tạo Set mới
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(next);
  };

  return (
    <div ref={wrapRef} className="tvts-filter">
      <button
        type="button"
        className={`filter-chip ${selected.size > 0 ? "active" : ""}`}
        onClick={() => setOpen((v) => !v)}
        disabled={options.length === 0}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <Icons.User size={13} /> TVTS
        {selected.size > 0 && <span className="tvts-filter__count">{selected.size}</span>}
        <Icons.ChevronDown size={12} />
      </button>
      {open && (
        <div className="tvts-filter__panel">
          <div className="tvts-filter__head">
            <input
              placeholder="Tìm TVTS…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button
              type="button"
              className="tvts-filter__clear"
              disabled={selected.size === 0}
              onClick={() => onChange(new Set())}
            >
              Bỏ lọc
            </button>
          </div>
          <div className="tvts-filter__list">
            {visibleOptions.length === 0 && (
              <div className="tvts-filter__empty">Không có TVTS</div>
            )}
            {visibleOptions.map((o) => (
              <label key={o.key} className="tvts-filter__item">
                <input
                  type="checkbox"
                  checked={selected.has(o.key)}
                  onChange={() => toggle(o.key)}
                />
                <span className="tvts-filter__label">{o.label}</span>
                <span className="tvts-filter__badge">{o.count}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

## CSS append vào cuối `prototype-payments.css`

```css
/* ===== TVTS filter dropdown (TVTS-02) ===== */
.gmv-prototype .tvts-filter { position: relative; display: inline-block; }
.gmv-prototype .tvts-filter__count {
  font-weight: 600; background: white; color: var(--primary-700);
  padding: 1px 7px; border-radius: 999px; font-size: 11.5px; margin-left: 2px;
}
.gmv-prototype .tvts-filter__panel {
  position: absolute; left: 0; top: calc(100% + 4px); z-index: 60;
  min-width: 250px; max-width: 320px;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 10px; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.14);
  padding: 8px 0;
}
.gmv-prototype .tvts-filter__head {
  display: flex; align-items: center; gap: 8px;
  padding: 0 10px 8px; border-bottom: 1px solid var(--border);
}
.gmv-prototype .tvts-filter__head input {
  flex: 1; min-width: 0; border: 1px solid var(--border); border-radius: 8px;
  padding: 5px 9px; font-size: 12.5px; background: var(--surface-2); outline: none;
}
.gmv-prototype .tvts-filter__head input:focus { border-color: var(--primary); background: var(--surface); }
.gmv-prototype .tvts-filter__clear {
  border: none; background: none; color: var(--primary-700);
  font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap;
}
.gmv-prototype .tvts-filter__clear:disabled { opacity: 0.4; cursor: not-allowed; }
.gmv-prototype .tvts-filter__list { max-height: 260px; overflow-y: auto; padding-top: 4px; }
.gmv-prototype .tvts-filter__item {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 12px; font-size: 12.5px; color: var(--text-2); cursor: pointer;
}
.gmv-prototype .tvts-filter__item:hover { background: var(--surface-2); }
.gmv-prototype .tvts-filter__item input { accent-color: var(--primary); cursor: pointer; }
.gmv-prototype .tvts-filter__label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gmv-prototype .tvts-filter__badge {
  font-size: 11px; color: var(--text-3); background: var(--surface-3);
  padding: 1px 7px; border-radius: 999px;
}
.gmv-prototype .tvts-filter__empty { padding: 10px 12px; font-size: 12.5px; color: var(--text-3); }
```

Lưu ý z-index: panel dùng `z-index: 60` — trên sticky header bảng, dưới drawer/modal (modal bill dùng z-[120]). Nếu thấy panel bị che khi test tay: báo Minh, KHÔNG tự nâng lên >100.

## Test plan — `TvtsFilterDropdown.test.tsx`

Render với `@testing-library/react` (xem `ColumnVisibilityMenu.test.tsx` làm mẫu setup). Fixture options:

```typescript
const OPTIONS: TvtsOption[] = [
  { key: "trinh@pf.vn", label: "Le Thi Thuy Trinh", count: 5 },
  { key: "nhung@pf.vn", label: "Le Thuy Nhung", count: 3 },
  { key: "__unknown_tvts__", label: "Không rõ TVTS", count: 1 },
];
```

Test case BẮT BUỘC:

```
✓ "render nút TVTS, chưa chọn ai thì không có badge count"
✓ "selected.size > 0 → nút có class active + badge đúng số"
✓ "options rỗng → nút disabled"
✓ "click nút → mở panel, hiện đủ option kèm count"
✓ "tick 1 option → onChange nhận Set mới chứa key đó, KHÔNG mutate Set cũ"
     // giữ ref set ban đầu, expect(originalSet.has(key)).toBe(false) sau khi tick
✓ "bỏ tick option đang chọn → onChange nhận Set không còn key đó"
✓ "click 'Bỏ lọc' → onChange nhận Set rỗng"
✓ "'Bỏ lọc' disabled khi chưa chọn gì"
✓ "gõ 'trinh' vào ô tìm → chỉ còn option Trinh (không phân biệt dấu: 'le' khớp cả 2 option Le)"
✓ "gõ text không khớp → hiện 'Không có TVTS'"
✓ "mousedown ra ngoài → panel đóng"
✓ "nhấn Escape → panel đóng"
```

## Acceptance criteria

1. Component controlled 100%: mọi thay đổi selection đi qua `onChange`, không có state selection nội bộ.
2. Props đúng contract PLAN mục 3 (`options`, `selected`, `onChange`).
3. `git diff --stat` chỉ hiện 3 file whitelist.
4. `cd frontend && npx tsc -b` PASS.
5. `cd frontend && npm run test -- src/components/payment-request/TvtsFilterDropdown.test.tsx` PASS toàn bộ.

## Anti-patterns (đừng làm)

1. **Đừng giữ selection trong state nội bộ rồi sync bằng useEffect** — controlled component thuần, selection là props.
2. **Đừng mutate `selected` từ props** (`selected.add(...)` sẽ crash — ReadonlySet — và sai design). Luôn `new Set(selected)`.
3. **Đừng dùng `click` event cho outside-close** — dùng `mousedown` (cùng ColumnVisibilityMenu; `click` bị race với checkbox toggle).
4. **Đừng render panel bằng portal** — không cần, toolbar không có `overflow: hidden`.
5. **Đừng thêm nút "Chọn tất cả"** — chốt C6: selection rỗng = hiện tất cả, nút "Chọn tất cả" thừa và gây nhầm semantics.
6. Đừng tự đổi tên class CSS — TVTS-03 (Giang) viết E2E selector dựa trên đúng các class này (`.tvts-filter__item`, `.tvts-filter__label`, `.tvts-filter__count`...).

## Branch & commit

- Branch tách từ **`sandbox`**: `feat/tvts-02-dropdown`.
- PR vào **`sandbox`**, KHÔNG vào main. Minh review trên sandbox trước; Giang merge sandbox → main sau khi Minh duyệt.
- 1 commit duy nhất: `feat(pr-filter): TvtsFilterDropdown component + tests (TVTS-02)`
