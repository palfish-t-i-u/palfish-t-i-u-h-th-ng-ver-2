import { useEffect, useRef, useState } from "react";
import { Icons } from "../payment-request/Icons";

export interface FilterSelectOption<T extends string> {
  id: T;
  label: string;
}

/**
 * Dropdown chọn 1 (single-select) cho bộ lọc list — thay <select> native để
 * panel bo góc + style đồng bộ app (native option list không bo góc được).
 * Quy ước: options[0] = trạng thái "tất cả" → không tô active.
 */
export default function FilterSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: FilterSelectOption<T>[];
  onChange: (next: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Đóng khi click ra ngoài / Escape — cùng pattern ColumnVisibilityMenu.
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

  const current = options.find((o) => o.id === value) ?? options[0];
  const active = value !== options[0]?.id;

  return (
    <div className="filter-field">
      <span>{label}</span>
      <div ref={wrapRef} className="filter-select-wrap">
        <button
          type="button"
          className={`filter-select-btn${active ? " active" : ""}`}
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span className="filter-select-btn__label">{current?.label}</span>
          <Icons.ChevronDown size={13} />
        </button>
        {open && (
          <div className="filter-select__panel" role="listbox">
            {options.map((o) => (
              <button
                key={o.id}
                type="button"
                role="option"
                aria-selected={o.id === value}
                className={`filter-select__item${o.id === value ? " selected" : ""}`}
                onClick={() => {
                  onChange(o.id);
                  setOpen(false);
                }}
              >
                <span>{o.label}</span>
                {o.id === value && <Icons.Check size={14} />}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
