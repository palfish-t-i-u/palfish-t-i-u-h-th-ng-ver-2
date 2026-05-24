/**
 * Type fixx — sheet Hiếu Trang tính5 (cột C → D).
 * Chuẩn hoá giá trị Type gốc trước khi pivot.
 */
const TYPE_FIXX: Record<string, string> = {
  广告: "广告",
  转介绍: "转介绍",
  续费: "续费",
  公海: "公海",
  KOC: "KOC",
  Lives: "Lives",
  Booth: "Offline",
  Refer: "转介绍",
  Resell: "续费",
  GD: "公海",
  Offline: "Offline",
  Other: "Other",
  PNS: "广告",
  Partnership: "广告",
  FB: "广告",
  KFT: "Other",
  KET: "Other",
  Livestream: "Lives",
  // Nguồn app Tab 1 (VN)
  "Bán mới": "广告",
  "Khách giới thiệu": "转介绍",
  "Gia hạn": "续费",
  "Kho chung": "公海",
  "Nguồn khác": "Other",
};

/** loai2 dưới 广告 có cột Type fixx riêng — còn lại (PNS, FB, Partnership…) gom 广告. */
const AD_LOAI2_OWN_COLUMN = new Set([
  "KOC",
  "Lives",
  "Livestream",
  "Offline",
  "Booth",
  "KFT",
  "KET",
]);

/** Pivot Type (5 cột) — chỉ dùng khi cần gom ngắn; KHÔNG dùng cho thẻ Sổ. */
const FIXX_TO_PIVOT: Record<string, string> = {
  KOC: "广告",
  Lives: "广告",
  Offline: "广告",
  广告: "广告",
  公海: "公海",
  续费: "续费",
  转介绍: "转介绍",
  Other: "Other",
};

/** Thứ tự cột Type fixx trên sheet Hiếu (đối chiếu ngày). */
export const TYPE_FIXX_ORDER = [
  "Lives",
  "Offline",
  "Other",
  "公海",
  "广告",
  "续费",
  "转介绍",
  "KOC",
] as const;

export type TypeFixxKey = (typeof TYPE_FIXX_ORDER)[number];

const FIXX_LABEL: Record<string, string> = {
  Lives: "Lives",
  Offline: "Offline",
  Other: "Other",
  公海: "Kho chung - 公海",
  广告: "Quảng cáo - 广告",
  续费: "Gia hạn - 续费",
  转介绍: "Giới thiệu - 转介绍",
  KOC: "KOC",
};

export function applyTypeFixx(typeGoc: string): string {
  const key = (typeGoc || "").trim();
  if (!key) return "Other";
  if (TYPE_FIXX[key]) return TYPE_FIXX[key];
  const lower = key.toLowerCase();
  for (const [from, to] of Object.entries(TYPE_FIXX)) {
    if (from.toLowerCase() === lower) return to;
  }
  return "Other";
}

/** Lấy Type gốc từ dòng Sổ — 广告 + loai2: chỉ tách cột riêng (KOC, Lives…). */
export function typeGocFromRow(loai: string, loai2: string): string {
  const l1 = (loai || "").trim();
  const l2 = (loai2 || "").trim();
  const l1Fixed = applyTypeFixx(l1);
  if (l1Fixed === "广告" && l2) {
    const l2Fixed = applyTypeFixx(l2);
    if (AD_LOAI2_OWN_COLUMN.has(l2) || (l2Fixed !== "广告" && l2Fixed !== "Other")) {
      return l2;
    }
    return l1 || l2;
  }
  return l1 || l2;
}

export function typeFixxFromRow(loai: string, loai2: string): TypeFixxKey {
  const goc = typeGocFromRow(loai, loai2);
  const fixed = applyTypeFixx(goc);
  if ((TYPE_FIXX_ORDER as readonly string[]).includes(fixed)) {
    return fixed as TypeFixxKey;
  }
  return "Other";
}

export function typeFixxLabel(fixx: string): string {
  const key = (fixx || "").trim();
  return FIXX_LABEL[key] ?? key ?? "—";
}

export function pivotTypeFromRow(loai: string, loai2: string): string {
  const goc = typeGocFromRow(loai, loai2);
  const fixed = applyTypeFixx(goc);
  return FIXX_TO_PIVOT[fixed] ?? "Other";
}

export function pivotTypeLabel(pivot: string): string {
  const labels: Record<string, string> = {
    Other: "Other",
    广告: "Ads - 广告",
    转介绍: "Refer - 转介绍",
    续费: "Renew - 续费",
    公海: "Kho chung - 公海",
  };
  return labels[pivot] ?? pivot;
}
