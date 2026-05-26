import { Input, Select } from "../ui";
import type { DateFilter, StatusFilter } from "./paymentRequestUtils";

const statusPills: { key: StatusFilter; label: string; dot?: string }[] = [
  { key: "all", label: "Tất cả" },
  { key: "pending", label: "Chưa TT", dot: "bg-gmv-muted" },
  { key: "short", label: "Thiếu", dot: "bg-gmv-danger" },
  { key: "done", label: "Đủ", dot: "bg-gmv-ok" },
  { key: "over", label: "Thừa", dot: "bg-gmv-warn" },
];

export default function PaymentRequestToolbar({
  search,
  status,
  dateFilter,
  counts,
  onSearch,
  onStatus,
  onDateFilter,
}: {
  search: string;
  status: StatusFilter;
  dateFilter: DateFilter;
  counts: Record<StatusFilter, number>;
  onSearch: (value: string) => void;
  onStatus: (value: StatusFilter) => void;
  onDateFilter: (value: DateFilter) => void;
}) {
  return (
    <div className="rounded-gmv-lg border border-gmv-border bg-gmv-canvas p-3 shadow-gmv-1">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[280px] flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gmv-muted">⌕</span>
          <Input
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Tìm theo PR-ID, tên khách, UID hoặc số điện thoại..."
            className="h-9 pl-9 text-sm"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {statusPills.map((pill) => (
            <button
              key={pill.key}
              type="button"
              onClick={() => onStatus(pill.key)}
              className={`inline-flex min-h-[34px] items-center gap-2 rounded-gmv-md border px-3 text-sm font-medium transition ${
                status === pill.key
                  ? "border-gmv-primary bg-gmv-primary-soft text-gmv-primary"
                  : "border-gmv-border bg-gmv-canvas text-gmv-text hover:bg-gmv-bg"
              }`}
            >
              {pill.dot && <span className={`size-2 rounded-full ${pill.dot}`} />}
              <span>{pill.label}</span>
              <span className="rounded-full bg-gmv-bg px-2 py-0.5 text-xs text-gmv-muted">{counts[pill.key]}</span>
            </button>
          ))}
        </div>
        <Select value={dateFilter} onChange={(event) => onDateFilter(event.target.value as DateFilter)} className="h-9 w-[180px]">
          <option value="all">Khoảng thời gian</option>
          <option value="today">Hôm nay</option>
          <option value="7d">7 ngày gần đây</option>
          <option value="30d">30 ngày gần đây</option>
        </Select>
      </div>
    </div>
  );
}

