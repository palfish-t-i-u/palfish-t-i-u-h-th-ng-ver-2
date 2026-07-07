import { fmtRate, safeDivide } from "./metrics";
import type { DashboardLiveSummary } from "../types/order";

export type SaleDetailRow = DashboardLiveSummary["top_sales"][number];

export type DetailColKind = "text" | "num" | "rate" | "rmb" | "minutes" | "aov";

export const SALE_DETAIL_COLUMNS: {
  label: string;
  key: keyof SaleDetailRow | "aov_rmb";
  kind: DetailColKind;
  sticky?: boolean;
}[] = [
  { label: "Bộ phận", key: "department", kind: "text" },
  { label: "Họ và tên Sale", key: "sale_name", kind: "text", sticky: true },
  { label: "Lead chạy Ads", key: "ad_leads", kind: "num" },
  { label: "Lead lên tay", key: "ad_leads_manual", kind: "num" },
  { label: "Lead giới thiệu", key: "referral_leads", kind: "num" },
  { label: "Tổng Leads", key: "total_leads", kind: "num" },
  { label: "Leads kho chung", key: "gd_leads", kind: "num" },
  { label: "Số lượng hẹn", key: "invitation_number", kind: "num" },
  { label: "Lịch hẹn", key: "scheduled_classes", kind: "num" },
  { label: "Tỷ lệ xem trước", key: "preview_rate", kind: "rate" },
  { label: "Học thử thành công (Trials)", key: "completed_classes", kind: "num" },
  { label: "Tỷ lệ hoàn thành", key: "completion_rate", kind: "rate" },
  { label: "Số đơn chốt", key: "orders", kind: "num" },
  { label: "Doanh thu CRM (RMB)", key: "gmv_rmb", kind: "rmb" },
  { label: "AOV (RMB)", key: "aov_rmb", kind: "aov" },
  { label: "Tổng thời lượng gọi", key: "total_call_time", kind: "minutes" },
  { label: "Tổng cuộc gọi", key: "total_dials", kind: "num" },
  { label: "Tổng kết nối", key: "total_connections", kind: "num" },
  { label: "Tỷ lệ kết nối", key: "connection_rate", kind: "rate" },
  { label: "Cuộc gọi > 3 phút", key: "over_3min_connections", kind: "num" },
  { label: "Tỷ lệ cuộc gọi > 3 phút", key: "over_3min_rate", kind: "rate" },
];

function fmt(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n);
}

function cellText(v: unknown): string {
  if (v == null || v === "") return "—";
  return String(v);
}

function cellNum(v: unknown): string {
  const n = Number(v);
  if (v == null || v === "" || Number.isNaN(n)) return "0";
  return fmt(n);
}

export function detailCellValue(
  row: SaleDetailRow,
  col: (typeof SALE_DETAIL_COLUMNS)[number]
): string {
  if (col.key === "aov_rmb") {
    const gmv = row.gmv_rmb ?? row.total_amount ?? 0;
    const orders = row.orders ?? 0;
    const aov = row.avg_price ?? safeDivide(gmv, orders);
    return cellNum(aov);
  }
  const raw = row[col.key as keyof SaleDetailRow];
  switch (col.kind) {
    case "text":
      return cellText(raw);
    case "num":
      return cellNum(raw);
    case "rate":
      return fmtRate(Number(raw ?? 0));
    case "rmb":
      return cellNum(raw);
    case "minutes": {
      const n = Number(raw);
      if (raw == null || Number.isNaN(n)) return "0 phút";
      return `${n.toFixed(1)} phút`;
    }
    default:
      return cellText(raw);
  }
}
