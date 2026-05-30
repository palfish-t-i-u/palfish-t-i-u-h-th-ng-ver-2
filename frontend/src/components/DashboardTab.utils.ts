import type { RevenueLedgerRow } from "../types/revenue";

export interface DashboardSaleRow {
  rank: number;
  sale_crm_name: string;
  team: string;
  gmv_vnd: number;
  order_count: number;
  initials: string;
}

type RevenueLikeRow = Partial<RevenueLedgerRow>;

function readString(row: RevenueLikeRow, camelKey: keyof RevenueLedgerRow, snakeKey: string) {
  const value = row[camelKey] ?? readSnake(row, snakeKey);
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(row: RevenueLikeRow, camelKey: keyof RevenueLedgerRow, snakeKey: string) {
  const value = row[camelKey] ?? readSnake(row, snakeKey);
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function readSnake(row: RevenueLikeRow, key: string) {
  return (row as Record<string, unknown>)[key];
}

function readDate(row: RevenueLikeRow) {
  const value = readString(row, "ngayTienVe", "ngay_tien_ve") || readString(row, "payTime", "pay_time");
  return value.slice(0, 10);
}

function toRankRows(rows: RevenueLikeRow[], datePredicate: (date: string) => boolean): DashboardSaleRow[] {
  const map = new Map<string, Omit<DashboardSaleRow, "rank" | "initials">>();

  rows.forEach((row) => {
    const date = readDate(row);
    const saleName = readString(row, "saleCrmName", "sale_crm_name");
    if (!saleName || !datePredicate(date)) return;

    const current = map.get(saleName) ?? {
      sale_crm_name: saleName,
      team: readString(row, "team", "team") || readString(row, "teamPivotLabel", "team_pivot_label"),
      gmv_vnd: 0,
      order_count: 0,
    };

    current.gmv_vnd += readNumber(row, "soTienVnd", "so_tien_vnd");
    current.order_count += 1;
    if (!current.team) {
      current.team = readString(row, "team", "team") || readString(row, "teamPivotLabel", "team_pivot_label");
    }
    map.set(saleName, current);
  });

  return Array.from(map.values())
    .sort((a, b) => b.gmv_vnd - a.gmv_vnd || a.sale_crm_name.localeCompare(b.sale_crm_name, "vi"))
    .map((row, index) => ({
      ...row,
      rank: index + 1,
      initials: getInitials(row.sale_crm_name),
    }));
}

export function buildDashboardSalesData(rows: RevenueLikeRow[], todayIso: string) {
  const monthKey = todayIso.slice(0, 7);
  return {
    today: toRankRows(rows, (date) => date === todayIso),
    month: toRankRows(rows, (date) => date.startsWith(monthKey)),
  };
}

export function getInitials(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "--";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[parts.length - 1][0] ?? ""}${parts[parts.length - 2][0] ?? ""}`.toUpperCase();
}

export function formatVndCompact(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) {
    return `${formatCompactNumber(value / 1_000_000_000)} tỷ`;
  }
  if (abs >= 1_000_000) {
    return `${formatCompactNumber(value / 1_000_000)} tr`;
  }
  if (abs >= 1_000) {
    return `${formatCompactNumber(value / 1_000)}k`;
  }
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(value);
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    maximumFractionDigits: value >= 10 ? 0 : 1,
  }).format(value);
}

export function todayIso() {
  return localIsoDate(new Date());
}

export function monthDateRange(date = new Date()) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  return {
    from: localIsoDate(first),
    to: localIsoDate(date),
  };
}

function localIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
