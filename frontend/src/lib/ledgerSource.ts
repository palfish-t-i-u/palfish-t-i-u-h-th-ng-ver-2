import type { RevenueLedgerRow } from "../types/revenue";
import { pivotTypeFromRow, pivotTypeLabel } from "./typeFixx";

/** Thứ tự cột Type pivot trên sheet Hiếu (đối chiếu ngày). */
export const LEDGER_SOURCE_ORDER = [
  "Other",
  "公海",
  "广告",
  "续费",
  "转介绍",
] as const;

export type LedgerSourceKey = (typeof LEDGER_SOURCE_ORDER)[number];

export function resolveLedgerSource(row: RevenueLedgerRow): LedgerSourceKey {
  const pivot = pivotTypeFromRow(row.loai, row.loai2);
  if ((LEDGER_SOURCE_ORDER as readonly string[]).includes(pivot)) {
    return pivot as LedgerSourceKey;
  }
  return "Other";
}

export function formatSourceLabel(source: string): string {
  return pivotTypeLabel(source);
}

export interface SourceBucket {
  source: LedgerSourceKey;
  gmvVnd: number;
  count: number;
}

export function computeSourceBuckets(rows: RevenueLedgerRow[]): SourceBucket[] {
  const map = new Map<LedgerSourceKey, { gmvVnd: number; count: number }>();

  for (const row of rows) {
    const key = resolveLedgerSource(row);
    const cur = map.get(key) ?? { gmvVnd: 0, count: 0 };
    cur.gmvVnd += row.soTienVnd || 0;
    cur.count += 1;
    map.set(key, cur);
  }

  return LEDGER_SOURCE_ORDER.map((source) => ({
    source,
    gmvVnd: map.get(source)?.gmvVnd ?? 0,
    count: map.get(source)?.count ?? 0,
  }));
}
