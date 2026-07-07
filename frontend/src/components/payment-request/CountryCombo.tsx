import { useEffect, useMemo, useRef, useState } from "react";
import { Icons } from "./Icons";
import { COUNTRY_DIAL_CODES, type CountryDialCode } from "../../data/countryDialCodes";

export type Country = CountryDialCode;

// Nguồn dữ liệu: frontend/src/data/countryDialCodes.ts (generated —
// xem scripts/build-country-dial-codes.mjs). Không khai báo tay ở đây nữa để
// tránh 2 nơi lệch nhau khi bổ sung quốc gia mới.
export const COUNTRIES: Country[] = [...COUNTRY_DIAL_CODES];

export function findCountry(code: string | undefined | null): Country {
  return COUNTRIES.find((c) => c.code === (code || "VN")) || COUNTRIES[0];
}

export default function CountryCombo({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [focusIdx, setFocusIdx] = useState(0);
  const ref = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const country = findCountry(value);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setFocusIdx(0);
      const id = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(id);
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter(
      (c) => c.name.toLowerCase().includes(q) || c.dial.includes(q) || c.code.toLowerCase().includes(q)
    );
  }, [query]);

  const pick = (c: Country) => {
    if (disabled) return;
    onChange(c.code);
    setOpen(false);
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusIdx((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[focusIdx]) pick(filtered[focusIdx]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="cc-combo" ref={ref}>
      <button
        type="button"
        className={`cc-trigger ${open ? "open" : ""}`}
        onClick={() => {
          if (disabled) return;
          setOpen(!open);
        }}
        disabled={disabled}
        style={disabled ? { opacity: 0.65, cursor: "not-allowed" } : undefined}
      >
        <span style={{ fontSize: 16, lineHeight: 1 }}>{country.flag}</span>
        <span className="cc-dial">{country.dial}</span>
        <Icons.ChevronDown size={14} stroke="var(--text-3)" />
      </button>
      {open && !disabled && (
        <div className="cc-pop">
          <div className="cc-search">
            <Icons.Search size={14} stroke="var(--text-3)" />
            <input
              ref={inputRef}
              placeholder="Tìm theo tên hoặc đầu số (VD: viet, 84)"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setFocusIdx(0);
              }}
              onKeyDown={onKey}
            />
          </div>
          <div className="cc-list">
            {filtered.length === 0 && (
              <div style={{ padding: 12, color: "var(--text-3)", fontSize: 12, textAlign: "center" }}>
                Không tìm thấy quốc gia.
              </div>
            )}
            {filtered.map((c, i) => (
              <div
                key={c.code}
                className={`cc-opt ${i === focusIdx ? "focused" : ""} ${c.code === value ? "focused" : ""}`}
                onMouseEnter={() => setFocusIdx(i)}
                onClick={() => pick(c)}
              >
                <span style={{ fontSize: 16, lineHeight: 1 }}>{c.flag}</span>
                <span className="cc-opt-name">{c.name}</span>
                <span className="cc-opt-dial">{c.dial}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
