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
