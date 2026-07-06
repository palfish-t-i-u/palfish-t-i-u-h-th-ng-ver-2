import { useState } from "react";
import Badge from "./ui/Badge";
import { RowCard, RowCardList } from "./ui/RowCard";
import {
  SALE_DETAIL_COLUMNS,
  detailCellValue,
  type SaleDetailRow,
} from "../lib/saleDetailColumns";

const KEY_METRIC_KEYS: readonly string[] = [
  "total_leads",
  "invitation_number",
  "completed_classes",
  "orders",
  "aov_rmb",
  "connection_rate",
];

const HEADER_KEYS: readonly string[] = ["sale_name", "department", "gmv_rmb"];

const GMV_COL = SALE_DETAIL_COLUMNS.find((c) => c.key === "gmv_rmb")!;
const KEY_COLS = SALE_DETAIL_COLUMNS.filter((c) => KEY_METRIC_KEYS.includes(c.key as string));
const EXTRA_COLS = SALE_DETAIL_COLUMNS.filter(
  (c) => !HEADER_KEYS.includes(c.key as string) && !KEY_METRIC_KEYS.includes(c.key as string)
);

function SaleCard({ row }: { row: SaleDetailRow }) {
  const [expanded, setExpanded] = useState(false);
  const cols = expanded ? [...KEY_COLS, ...EXTRA_COLS] : KEY_COLS;
  return (
    <RowCard
      title={row.sale_name}
      value={`${detailCellValue(row, GMV_COL)} RMB`}
      badges={row.department ? <Badge tone="neutral">{row.department}</Badge> : undefined}
      meta={cols.map((c) => ({ label: c.label, value: detailCellValue(row, c) }))}
      actions={
        <button
          type="button"
          className="min-h-[44px] px-1 text-xs font-semibold text-gmv-primary"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Thu gọn" : `Xem đủ ${KEY_COLS.length + EXTRA_COLS.length} chỉ số`}
        </button>
      }
    />
  );
}

export default function SaleDetailCards({ rows }: { rows: SaleDetailRow[] }) {
  return (
    <RowCardList empty="Chưa có data — lấy dữ liệu CRM ở tab Đồng bộ CRM trước">
      {rows.map((r) => (
        <SaleCard key={r.sale_name} row={r} />
      ))}
    </RowCardList>
  );
}
