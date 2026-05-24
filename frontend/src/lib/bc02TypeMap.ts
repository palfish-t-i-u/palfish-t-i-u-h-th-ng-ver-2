/**
 * BC02 — Key Data of Sales Process.
 * Map Type gốc → nhóm tiếng Việt (sheet GMV tab, Hiếu).
 * Giữ logic typeGocFromRow tương thích typeFixx.ts (loai + loai2 khi Quảng cáo).
 */
import { applyTypeFixx } from "./typeFixx";

export const BC02_TYPE_ORDER = [
  "Quảng cáo",
  "Giới thiệu",
  "KOC",
  "Gia hạn",
  "Biển công cộng",
  "Lives",
  "Offline",
  "Other",
] as const;

export type Bc02Type = (typeof BC02_TYPE_ORDER)[number];

const ALIAS_TO_BC02: Record<string, Bc02Type> = {
  广告: "Quảng cáo",
  PNS: "Quảng cáo",
  "Bán mới": "Quảng cáo",
  转介绍: "Giới thiệu",
  Refer: "Giới thiệu",
  "Khách giới thiệu": "Giới thiệu",
  KOC: "KOC",
  续费: "Gia hạn",
  Resell: "Gia hạn",
  "Gia hạn": "Gia hạn",
  公海: "Biển công cộng",
  GD: "Biển công cộng",
  "Kho chung": "Biển công cộng",
  Lives: "Lives",
  Livestream: "Lives",
  Offline: "Offline",
  Booth: "Offline",
  Other: "Other",
  KFT: "Other",
  KET: "Other",
  "Nguồn khác": "Other",
};

const AD_SOURCES = new Set(["Quảng cáo", "广告", "PNS", "Bán mới"]);

export function mapToBc02Type(raw: string): Bc02Type {
  const key = (raw || "").trim();
  if (!key) return "Other";
  if (ALIAS_TO_BC02[key]) return ALIAS_TO_BC02[key];
  const lower = key.toLowerCase();
  for (const [alias, category] of Object.entries(ALIAS_TO_BC02)) {
    if (alias.toLowerCase() === lower) return category;
  }
  return "Other";
}

/** Chuẩn hoá loai trước khi lấy gốc — dùng applyTypeFixx để khớp Sổ. */
function bc02TypeGoc(loai: string, loai2: string): string {
  const l1 = (loai || "").trim();
  const l2 = (loai2 || "").trim();
  const l1Fixed = applyTypeFixx(l1);
  const l1Bc02 = mapToBc02Type(l1Fixed === l1 ? l1 : l1Fixed);
  if (AD_SOURCES.has(l1Bc02) || AD_SOURCES.has(l1Fixed) || AD_SOURCES.has(l1)) {
    if (l2) return l2;
  }
  return l1 || l2;
}

export function bc02TypeFromRow(loai: string, loai2: string): Bc02Type {
  const goc = bc02TypeGoc(loai, loai2);
  return mapToBc02Type(goc);
}
