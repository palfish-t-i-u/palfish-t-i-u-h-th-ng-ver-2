import type { RevenueLedgerRow } from "../types/revenue";
import {
  TYPE_FIXX_ORDER,
  type TypeFixxKey,
  typeFixxFromRow,
  typeFixxLabel,
} from "./typeFixx";

export const LEDGER_SOURCE_ORDER = TYPE_FIXX_ORDER;

export type LedgerSourceKey = TypeFixxKey;

export function resolveLedgerSource(row: RevenueLedgerRow): LedgerSourceKey {
  return typeFixxFromRow(row.loai, row.loai2);
}

export function formatSourceLabel(source: string): string {
  return typeFixxLabel(source);
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
