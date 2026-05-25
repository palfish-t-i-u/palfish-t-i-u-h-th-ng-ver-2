import { useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "../../lib/cn";

export type ComboboxOption = { value: string; label: string };

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  emptyLabel?: string;
  className?: string;
  /** Gõ số → gợi ý ordinal (vd. 11 → 11th) */
  matchDigitsToOrdinal?: boolean;
};

function ordinalSuffix(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

function ordinalLabel(n: number): string {
  return `${n}${ordinalSuffix(n)}`;
}

function filterOptions(
  options: ComboboxOption[],
  query: string,
  matchDigitsToOrdinal: boolean
): ComboboxOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return options;

  const digit = q.replace(/\D/g, "");
  const extra: ComboboxOption[] = [];
  if (matchDigitsToOrdinal && digit) {
    const n = parseInt(digit, 10);
    if (n >= 1 && n <= 99) {
      const label = ordinalLabel(n);
      if (!options.some((o) => o.value.toLowerCase() === label.toLowerCase())) {
        extra.push({ value: label, label });
      }
    }
  }

  const matched = options.filter((o) => {
    const v = o.value.toLowerCase();
    const l = o.label.toLowerCase();
    return v.includes(q) || l.includes(q) || (digit && v.startsWith(digit));
  });

  return [...extra, ...matched];
}

export default function Combobox({
  value,
  onChange,
  options,
  placeholder = "— Chọn hoặc gõ để tìm —",
  emptyLabel = "— Chọn —",
  className,
  matchDigitsToOrdinal = false,
}: Props) {
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selectedLabel = options.find((o) => o.value === value)?.label ?? value;

  useEffect(() => {
    if (!open) setQuery(value ? selectedLabel : "");
  }, [value, selectedLabel, open]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const filtered = useMemo(
    () => filterOptions(options, query, matchDigitsToOrdinal),
    [options, query, matchDigitsToOrdinal]
  );

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        autoComplete="off"
        className="gmv-field w-full min-h-10 rounded-gmv-md border border-gmv-border bg-gmv-canvas px-3 text-sm text-gmv-text-strong"
        placeholder={placeholder}
        value={open ? query : value ? selectedLabel : ""}
        onFocus={() => {
          setOpen(true);
          setQuery(value ? selectedLabel : "");
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          const exact = options.find(
            (o) => o.label.toLowerCase() === e.target.value.trim().toLowerCase()
          );
          if (exact) onChange(exact.value);
          else if (!e.target.value.trim()) onChange("");
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          if (e.key === "Enter" && filtered[0]) {
            e.preventDefault();
            onChange(filtered[0].value);
            setOpen(false);
          }
        }}
      />
      {open && filtered.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-gmv-md border border-gmv-border bg-gmv-canvas py-1 text-sm shadow-gmv-2"
        >
          {!query.trim() && (
            <li>
              <button
                type="button"
                className="w-full px-3 py-1.5 text-left text-gmv-muted hover:bg-gmv-row-hover"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
              >
                {emptyLabel}
              </button>
            </li>
          )}
          {filtered.map((o) => (
            <li key={`${o.value}-${o.label}`}>
              <button
                type="button"
                role="option"
                aria-selected={o.value === value}
                className={cn(
                  "w-full px-3 py-1.5 text-left hover:bg-gmv-row-hover",
                  o.value === value && "bg-gmv-primary-soft font-medium text-gmv-text-strong"
                )}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
