import type { RevenueLedgerRow } from "../types/revenue";

/** ISO date/datetime → dd/mm/yyyy. Chuỗi không parse được trả nguyên văn. */
export function fmtPayTime(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

/** Ưu tiên Order ID CRM, fallback mã đơn hàng nội bộ. */
export function orderIdDisplay(row: RevenueLedgerRow): string {
  return row.crmOrderId || row.maDonHang || "—";
}
