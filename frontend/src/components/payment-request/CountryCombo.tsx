import { useEffect, useMemo, useRef, useState } from "react";
import { Icons } from "./Icons";

export interface Country {
  code: string;
  name: string;
  dial: string;
  flag: string;
  exampleLocal: string;
}

export const COUNTRIES: Country[] = [
  { code: "VN", name: "Việt Nam", dial: "+84", flag: "🇻🇳", exampleLocal: "987 654 321" },
  { code: "US", name: "United States", dial: "+1", flag: "🇺🇸", exampleLocal: "202 555 0123" },
  { code: "GB", name: "United Kingdom", dial: "+44", flag: "🇬🇧", exampleLocal: "7911 123456" },
  { code: "CN", name: "China", dial: "+86", flag: "🇨🇳", exampleLocal: "131 2345 6789" },
  { code: "JP", name: "Japan", dial: "+81", flag: "🇯🇵", exampleLocal: "90 1234 5678" },
  { code: "KR", name: "South Korea", dial: "+82", flag: "🇰🇷", exampleLocal: "10 1234 5678" },
  { code: "TH", name: "Thailand", dial: "+66", flag: "🇹🇭", exampleLocal: "81 234 5678" },
  { code: "SG", name: "Singapore", dial: "+65", flag: "🇸🇬", exampleLocal: "8123 4567" },
  { code: "MY", name: "Malaysia", dial: "+60", flag: "🇲🇾", exampleLocal: "12 345 6789" },
  { code: "ID", name: "Indonesia", dial: "+62", flag: "🇮🇩", exampleLocal: "812 345 6789" },
  { code: "PH", name: "Philippines", dial: "+63", flag: "🇵🇭", exampleLocal: "917 123 4567" },
  { code: "IN", name: "India", dial: "+91", flag: "🇮🇳", exampleLocal: "98765 43210" },
  { code: "AU", name: "Australia", dial: "+61", flag: "🇦🇺", exampleLocal: "412 345 678" },
  { code: "NZ", name: "New Zealand", dial: "+64", flag: "🇳🇿", exampleLocal: "21 123 4567" },
  { code: "CA", name: "Canada", dial: "+1", flag: "🇨🇦", exampleLocal: "613 555 0123" },
  { code: "DE", name: "Germany", dial: "+49", flag: "🇩🇪", exampleLocal: "151 2345 6789" },
  { code: "FR", name: "France", dial: "+33", flag: "🇫🇷", exampleLocal: "6 12 34 56 78" },
  { code: "IT", name: "Italy", dial: "+39", flag: "🇮🇹", exampleLocal: "312 345 6789" },
  { code: "ES", name: "Spain", dial: "+34", flag: "🇪🇸", exampleLocal: "612 345 678" },
  { code: "NL", name: "Netherlands", dial: "+31", flag: "🇳🇱", exampleLocal: "6 1234 5678" },
  { code: "CH", name: "Switzerland", dial: "+41", flag: "🇨🇭", exampleLocal: "78 123 45 67" },
  { code: "SE", name: "Sweden", dial: "+46", flag: "🇸🇪", exampleLocal: "70 123 45 67" },
  { code: "NO", name: "Norway", dial: "+47", flag: "🇳🇴", exampleLocal: "406 12 345" },
  { code: "FI", name: "Finland", dial: "+358", flag: "🇫🇮", exampleLocal: "41 234 5678" },
  { code: "DK", name: "Denmark", dial: "+45", flag: "🇩🇰", exampleLocal: "32 12 34 56" },
  { code: "PL", name: "Poland", dial: "+48", flag: "🇵🇱", exampleLocal: "512 345 678" },
  { code: "RU", name: "Russia", dial: "+7", flag: "🇷🇺", exampleLocal: "912 345 6789" },
  { code: "TR", name: "Türkiye", dial: "+90", flag: "🇹🇷", exampleLocal: "532 123 4567" },
  { code: "AE", name: "United Arab Emirates", dial: "+971", flag: "🇦🇪", exampleLocal: "50 123 4567" },
  { code: "SA", name: "Saudi Arabia", dial: "+966", flag: "🇸🇦", exampleLocal: "51 234 5678" },
  { code: "IL", name: "Israel", dial: "+972", flag: "🇮🇱", exampleLocal: "50 123 4567" },
  { code: "EG", name: "Egypt", dial: "+20", flag: "🇪🇬", exampleLocal: "100 123 4567" },
  { code: "ZA", name: "South Africa", dial: "+27", flag: "🇿🇦", exampleLocal: "71 123 4567" },
  { code: "NG", name: "Nigeria", dial: "+234", flag: "🇳🇬", exampleLocal: "802 123 4567" },
  { code: "BR", name: "Brazil", dial: "+55", flag: "🇧🇷", exampleLocal: "11 91234 5678" },
  { code: "AR", name: "Argentina", dial: "+54", flag: "🇦🇷", exampleLocal: "11 2345 6789" },
  { code: "MX", name: "Mexico", dial: "+52", flag: "🇲🇽", exampleLocal: "55 1234 5678" },
  { code: "CL", name: "Chile", dial: "+56", flag: "🇨🇱", exampleLocal: "9 1234 5678" },
  { code: "PE", name: "Peru", dial: "+51", flag: "🇵🇪", exampleLocal: "912 345 678" },
  { code: "CO", name: "Colombia", dial: "+57", flag: "🇨🇴", exampleLocal: "301 234 5678" },
  { code: "HK", name: "Hong Kong", dial: "+852", flag: "🇭🇰", exampleLocal: "5123 4567" },
  { code: "TW", name: "Taiwan", dial: "+886", flag: "🇹🇼", exampleLocal: "912 345 678" },
  { code: "MO", name: "Macao", dial: "+853", flag: "🇲🇴", exampleLocal: "6612 3456" },
  { code: "KH", name: "Cambodia", dial: "+855", flag: "🇰🇭", exampleLocal: "91 234 567" },
  { code: "LA", name: "Laos", dial: "+856", flag: "🇱🇦", exampleLocal: "20 1234 5678" },
  { code: "MM", name: "Myanmar", dial: "+95", flag: "🇲🇲", exampleLocal: "9 212 3456" },
  { code: "BD", name: "Bangladesh", dial: "+880", flag: "🇧🇩", exampleLocal: "1812 345678" },
  { code: "PK", name: "Pakistan", dial: "+92", flag: "🇵🇰", exampleLocal: "301 234 5678" },
  { code: "IR", name: "Iran", dial: "+98", flag: "🇮🇷", exampleLocal: "912 345 6789" },
];

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
