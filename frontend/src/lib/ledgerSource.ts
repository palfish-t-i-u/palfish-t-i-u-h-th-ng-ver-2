import type { RevenueLedgerRow } from "../types/revenue";

/** Thứ tự cột Type fixx trên sheet Hiếu. */
export const LEDGER_SOURCE_ORDER = [
  "KOC",
  "Lives",
  "Offline",
  "Other",
  "公海",
  "广告",
  "续费",
  "转介绍",
] as const;

export type LedgerSourceKey = (typeof LEDGER_SOURCE_ORDER)[number] | "(Chưa phân loại)";

const NGUON_TO_LOAI: Record<string, string> = {
  "Bán mới": "广告",
  "Khách giới thiệu": "转介绍",
  "Gia hạn": "续费",
  "Kho chung": "公海",
};

const LOAI2_TO_SOURCE: Record<string, LedgerSourceKey> = {
  KOC: "KOC",
  Offline: "Offline",
  Booth: "Offline",
  Livestream: "Lives",
  Lives: "Lives",
};

const SOURCE_LABEL: Record<string, string> = {
  KOC: "KOC",
  Lives: "Lives",
  Offline: "Offline",
  Other: "Other",
  广告: "Ads - 广告",
  转介绍: "Refer - 转介绍",
  续费: "Renew - 续费",
  公海: "Kho chung - 公海",
  "(Chưa phân loại)": "(Chưa phân loại)",
};

function normalizeLoai(loai: string): string {
  const key = (loai || "").trim();
  return NGUON_TO_LOAI[key] || key;
}

function loai2ToSource(loai2: string): LedgerSourceKey {
  const key = (loai2 || "").trim();
  if (!key) return "Other";
  if (LOAI2_TO_SOURCE[key]) return LOAI2_TO_SOURCE[key];
  const lower = key.toLowerCase();
  if (lower.includes("live")) return "Lives";
  if (lower.includes("offline") || lower.includes("booth")) return "Offline";
  if (lower === "koc") return "KOC";
  return "Other";
}

/** Map 1 dòng Sổ → nguồn Type fixx (sheet Hiếu). */
export function resolveLedgerSource(row: RevenueLedgerRow): LedgerSourceKey {
  const loai = normalizeLoai(row.loai || "");
  if (loai === "广告") return loai2ToSource(row.loai2 || "");
  if ((LEDGER_SOURCE_ORDER as readonly string[]).includes(loai)) {
    return loai as LedgerSourceKey;
  }
  if (!loai) return "(Chưa phân loại)";
  return "(Chưa phân loại)";
}

export function formatSourceLabel(source: string): string {
  const key = (source || "").trim();
  if (!key) return "—";
  return SOURCE_LABEL[key] || key;
}

export interface SourceBucket {
  source: LedgerSourceKey | string;
  gmvVnd: number;
  count: number;
}

export function computeSourceBuckets(rows: RevenueLedgerRow[]): SourceBucket[] {
  const map = new Map<string, { gmvVnd: number; count: number }>();

  for (const row of rows) {
    const key = resolveLedgerSource(row);
    const cur = map.get(key) ?? { gmvVnd: 0, count: 0 };
    cur.gmvVnd += row.soTienVnd || 0;
    cur.count += 1;
    map.set(key, cur);
  }

  const buckets: SourceBucket[] = LEDGER_SOURCE_ORDER.map((source) => ({
    source,
    gmvVnd: map.get(source)?.gmvVnd ?? 0,
    count: map.get(source)?.count ?? 0,
  }));

  const uncategorized = map.get("(Chưa phân loại)");
  if (uncategorized && (uncategorized.gmvVnd > 0 || uncategorized.count > 0)) {
    buckets.push({
      source: "(Chưa phân loại)",
      gmvVnd: uncategorized.gmvVnd,
      count: uncategorized.count,
    });
  }

  return buckets;
}
