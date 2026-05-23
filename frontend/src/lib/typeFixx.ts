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

/** Pivot Type (5 cột) — gom Type fixx về nhóm sheet đối chiếu ngày. */
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

/** Lấy Type gốc từ dòng Sổ — 广告 + loai2 thì lấy kênh con (KOC, Livestream…). */
export function typeGocFromRow(loai: string, loai2: string): string {
  const l1 = (loai || "").trim();
  const l2 = (loai2 || "").trim();
  const l1Fixed = applyTypeFixx(l1);
  if (l1Fixed === "广告" && l2) return l2;
  return l1 || l2;
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
