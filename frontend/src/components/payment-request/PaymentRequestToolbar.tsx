import type { ReactNode } from "react";
import DateRangeFilter, { type DateRange } from "./DateRangeFilter";
import { Icons } from "./Icons";
import type { StatusFilter } from "./paymentRequestUtils";

interface FilterChip {
  id: StatusFilter;
  label: string;
  count: number;
  color?: string;
}

export default function PaymentRequestToolbar({
  search,
  status,
  dateRange,
  chips,
  showChips,
  hideTest,
  onSearch,
  onStatus,
  onDateRange,
  onHideTestChange,
  tvtsFilter,
}: {
  search: string;
  status: StatusFilter;
  dateRange: DateRange;
  chips: FilterChip[];
  showChips: boolean;
  hideTest?: boolean;
  onSearch: (value: string) => void;
  onStatus: (value: StatusFilter) => void;
  onDateRange: (value: DateRange) => void;
  onHideTestChange?: (value: boolean) => void;
  tvtsFilter?: ReactNode;
}) {
  return (
    <div className="toolbar">
      <div className="search">
        <Icons.Search size={15} stroke="var(--text-3)" />
        <input
          placeholder="Tìm theo PR-ID, tên khách, UID hoặc số điện thoại…"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>
      {showChips &&
        chips.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`filter-chip ${status === c.id ? "active" : ""}`}
            onClick={() => onStatus(c.id)}
          >
            {c.color && status !== c.id && <span className="dot" style={{ background: c.color }} />}
            {c.label}
            <span
              style={{
                fontWeight: 600,
                color: status === c.id ? "var(--primary-700)" : "var(--text-3)",
                background: status === c.id ? "white" : "var(--surface-3)",
                padding: "1px 7px",
                borderRadius: 999,
                fontSize: 11.5,
                marginLeft: 2,
              }}
            >
              {c.count}
            </span>
          </button>
        ))}
      {tvtsFilter}
      <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
        {onHideTestChange && (
          <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--text-2)", cursor: "pointer", userSelect: "none" }}>
            <input
              type="checkbox"
              checked={!!hideTest}
              onChange={(e) => onHideTestChange(e.target.checked)}
              style={{ accentColor: "var(--primary)", cursor: "pointer" }}
            />
            Ẩn data test
          </label>
        )}
        <DateRangeFilter value={dateRange} onChange={onDateRange} />
      </div>
    </div>
  );
}
