import { typeFixxFromRow } from "./typeFixx";

/** Pill style — khớp màu sheet All File Thu Hiền (Payment + Type). */
const PAYMENT_STYLES: Record<string, string> = {
  "1st": "bg-sky-400 text-white",
  "2nd": "bg-emerald-500 text-white",
  "3rd": "bg-amber-400 text-amber-950",
};

const TYPE_RAW_STYLES: Record<string, string> = {
  Booth: "bg-sky-200 text-sky-950",
  Refer: "bg-sky-200 text-sky-950",
  转介绍: "bg-sky-200 text-sky-950",
  Resell: "bg-orange-200 text-orange-950",
  续费: "bg-orange-200 text-orange-950",
  Other: "bg-orange-200 text-orange-950",
  广告: "bg-yellow-100 text-yellow-950",
  PNS: "bg-yellow-100 text-yellow-950",
  Lives: "bg-pink-200 text-pink-950",
  Livestream: "bg-pink-200 text-pink-950",
  KOC: "bg-teal-200 text-teal-950",
  GD: "bg-violet-200 text-violet-950",
  公海: "bg-violet-200 text-violet-950",
  Offline: "bg-slate-200 text-slate-800",
};

const TYPE_FIXX_STYLES: Record<string, string> = {
  广告: "bg-yellow-100 text-yellow-950",
  转介绍: "bg-sky-200 text-sky-950",
  续费: "bg-orange-200 text-orange-950",
  公海: "bg-violet-200 text-violet-950",
  Lives: "bg-pink-200 text-pink-950",
  Offline: "bg-sky-200 text-sky-950",
  KOC: "bg-teal-200 text-teal-950",
  Other: "bg-orange-200 text-orange-950",
};

const DEFAULT_PILL = "bg-slate-100 text-slate-700";

function normalizeKey(value: string): string {
  return (value || "").trim();
}

function lookupStyle(map: Record<string, string>, value: string): string | undefined {
  const key = normalizeKey(value);
  if (!key) return undefined;
  if (map[key]) return map[key];
  const lower = key.toLowerCase();
  for (const [k, style] of Object.entries(map)) {
    if (k.toLowerCase() === lower) return style;
  }
  return undefined;
}

export function paymentMethodCellClass(method: string): string {
  return lookupStyle(PAYMENT_STYLES, method) ?? DEFAULT_PILL;
}

export function typeCellClass(loai: string, loai2: string): string {
  const l1 = normalizeKey(loai);
  const l2 = normalizeKey(loai2);
  return (
    lookupStyle(TYPE_RAW_STYLES, l1) ??
    lookupStyle(TYPE_RAW_STYLES, l2) ??
    TYPE_FIXX_STYLES[typeFixxFromRow(loai, loai2)] ??
    DEFAULT_PILL
  );
}

/** Nhãn Type ngắn trên bảng — ưu tiên loai gốc như sheet. */
export function typeDisplayLabel(loai: string, loai2: string): string {
  const l1 = normalizeKey(loai);
  const l2 = normalizeKey(loai2);
  return l1 || l2 || "—";
}

export const ledgerPillBase =
  "inline-block max-w-full truncate rounded px-2 py-0.5 text-center text-xs font-semibold leading-snug";
