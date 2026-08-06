import { useEffect, useRef, useState } from "react";
import { Icons } from "./Icons";

export interface DateRange {
  from: string;
  to: string;
  preset: string;
}

export const EMPTY_RANGE: DateRange = { from: "", to: "", preset: "all" };

const PRESETS: Array<[string, string]> = [
  ["today", "Hôm nay"],
  ["7d", "7 ngày"],
  ["30d", "30 ngày"],
  ["thismonth", "Tháng này"],
  ["all", "Toàn bộ"],
];

function fmt(s: string) {
  return s ? s.split("-").reverse().join("/") : "";
}

export function localIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function presetRange(preset: string, today: Date = new Date()): DateRange {
  if (preset === "today") {
    const t = localIso(today);
    return { from: t, to: t, preset };
  }
  if (preset === "7d") {
    const from = new Date(today);
    from.setDate(today.getDate() - 6);
    return { from: localIso(from), to: localIso(today), preset };
  }
  if (preset === "30d") {
    const from = new Date(today);
    from.setDate(today.getDate() - 29);
    return { from: localIso(from), to: localIso(today), preset };
  }
  if (preset === "thismonth") {
    const from = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: localIso(from), to: localIso(today), preset };
  }
  return { from: "", to: "", preset: "all" };
}

export default function DateRangeFilter({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (next: DateRange) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const hasFilter = !!(value?.from || value?.to);

  const setPreset = (preset: string) => {
    onChange(presetRange(preset));
  };

  return (
    <div style={{ position: "relative" }} ref={ref}>
      <button type="button" className={`date-filter ${hasFilter ? "active" : ""}`} onClick={() => setOpen(!open)}>
        <Icons.Clock size={13} />
        {!hasFilter && "Khoảng thời gian"}
        {hasFilter && `${fmt(value.from) || "…"} → ${fmt(value.to) || "nay"}`}
        <Icons.ChevronDown size={13} />
      </button>
      {open && (
        <div className="date-pop">
          <div className="info-label">Khoảng nhanh</div>
          <div className="quick-row">
            {PRESETS.map(([k, label]) => (
              <button
                key={k}
                type="button"
                className={`quick ${value?.preset === k ? "active" : ""}`}
                onClick={() => setPreset(k)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="info-label" style={{ marginTop: 6 }}>
            Tuỳ chỉnh
          </div>
          <div className="range-inputs">
            <input
              type="date"
              value={value?.from || ""}
              onChange={(e) => onChange({ ...value, from: e.target.value, preset: "custom" })}
            />
            <input
              type="date"
              value={value?.to || ""}
              onChange={(e) => onChange({ ...value, to: e.target.value, preset: "custom" })}
            />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => onChange(EMPTY_RANGE)}>
              Xoá lọc
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(false)}>
              <Icons.Check size={13} /> Áp dụng
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function inDateRange(dateStr: string, range: DateRange): boolean {
  if (!range || (!range.from && !range.to)) return true;
  if (!dateStr) return false;
  const normalized = dateStr.includes("T") ? dateStr : dateStr.replace(" ", "T");
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return true;
  if (range.from && d < new Date(range.from + "T00:00:00")) return false;
  if (range.to && d > new Date(range.to + "T23:59:59")) return false;
  return true;
}
