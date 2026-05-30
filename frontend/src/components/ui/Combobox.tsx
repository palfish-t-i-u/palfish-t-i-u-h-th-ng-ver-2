import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  /** Disable input + dropdown (read-only mode). */
  disabled?: boolean;
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

/** Position for the portal dropdown, anchored to the input element. */
function useAnchorRect(
  inputRef: React.RefObject<HTMLInputElement | null>,
  open: boolean
) {
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !inputRef.current) {
      setRect(null);
      return;
    }
    const update = () => {
      const el = inputRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect({ top: r.bottom + 4, left: r.left, width: r.width });
    };
    update();
    // Reposition on scroll/resize anywhere in the page
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, inputRef]);

  return rect;
}

export default function Combobox({
  value,
  onChange,
  options,
  placeholder = "— Chọn hoặc gõ để tìm —",
  emptyLabel = "— Chọn —",
  className,
  matchDigitsToOrdinal = false,
  disabled = false,
}: Props) {
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selectedLabel = options.find((o) => o.value === value)?.label ?? value;
  const anchorRect = useAnchorRect(inputRef, open);

  useEffect(() => {
    if (!open) setQuery(value ? selectedLabel : "");
  }, [value, selectedLabel, open]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target)) return;
      // Also check if click is inside the portal dropdown
      const portal = document.getElementById(listId);
      if (portal?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [listId]);

  const filtered = useMemo(
    () => filterOptions(options, query, matchDigitsToOrdinal),
    [options, query, matchDigitsToOrdinal]
  );

  const dropdown =
    !disabled && open && filtered.length > 0 && anchorRect
      ? createPortal(
          <ul
            id={listId}
            role="listbox"
            className="fixed z-[9999] max-h-48 overflow-auto rounded-gmv-md border border-gmv-border bg-gmv-canvas py-1 text-sm shadow-gmv-2"
            style={{
              top: anchorRect.top,
              left: anchorRect.left,
              width: anchorRect.width,
            }}
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
          </ul>,
          document.body
        )
      : null;

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        autoComplete="off"
        disabled={disabled}
        aria-disabled={disabled || undefined}
        className={cn(
          "gmv-field w-full min-h-10 rounded-gmv-md border border-gmv-border bg-gmv-canvas px-3 text-sm text-gmv-text-strong",
          disabled && "cursor-not-allowed bg-gmv-row-hover text-gmv-muted opacity-70"
        )}
        placeholder={placeholder}
        value={open ? query : value ? selectedLabel : ""}
        onFocus={() => {
          if (disabled) return;
          setOpen(true);
          setQuery(value ? selectedLabel : "");
        }}
        onChange={(e) => {
          if (disabled) return;
          setQuery(e.target.value);
          setOpen(true);
          const exact = options.find(
            (o) => o.label.toLowerCase() === e.target.value.trim().toLowerCase()
          );
          if (exact) onChange(exact.value);
          else if (!e.target.value.trim()) onChange("");
        }}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Escape") setOpen(false);
          if (e.key === "Enter" && filtered[0]) {
            e.preventDefault();
            onChange(filtered[0].value);
            setOpen(false);
          }
        }}
      />
      {dropdown}
    </div>
  );
}
