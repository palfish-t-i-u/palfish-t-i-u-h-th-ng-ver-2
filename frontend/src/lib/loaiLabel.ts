/**
 * Nhãn hiển thị Type / loai — Chinese - English (cosmetic only).
 * Giá trị lưu DB (`loai`, `loai_2`) không đổi; pivot/BC01/BC02 dùng typeFixx.ts.
 */
const LOAI_BILINGUAL: Record<string, string> = {
  广告: "广告 - Ads",
  转介绍: "转介绍 - Refer",
  续费: "续费 - Renew",
  公海: "公海 - Kho chung",
  Other: "Other",
  KOC: "KOC",
  Lives: "Lives",
  Livestream: "Lives",
  Offline: "Offline",
  Booth: "Offline",
  Refer: "转介绍 - Refer",
  Resell: "续费 - Renew",
  PNS: "广告 - Ads",
  FB: "广告 - Ads",
  Partnership: "广告 - Ads",
  GD: "公海 - Kho chung",
  KFT: "Other",
  KET: "Other",
  "Bán mới": "Bán mới - Ads",
  "Khách giới thiệu": "Khách giới thiệu - Refer",
  "Gia hạn": "Gia hạn - Renew",
  "Kho chung": "公海 - Kho chung",
  "Nguồn khác": "Nguồn khác - Other",
};

/** Giá trị gửi API — khớp sheet Hiếu + Tab 1. */
export const LEDGER_LOAI_OPTIONS = [
  "广告",
  "转介绍",
  "续费",
  "公海",
  "Bán mới",
  "Khách giới thiệu",
  "Gia hạn",
  "Kho chung",
  "Nguồn khác",
  "Refer",
  "Resell",
  "PNS",
  "Partnership",
  "FB",
  "KOC",
  "Lives",
  "Offline",
  "Other",
] as const;

/** loai_2 khi loai = Quảng cáo / 广告 — kênh con (typeFixx AD_LOAI2_OWN_COLUMN + sheet). */
export const LEDGER_LOAI2_OPTIONS = [
  "KOC",
  "Lives",
  "Livestream",
  "Offline",
  "Booth",
  "KFT",
  "KET",
  "PNS",
  "FB",
  "Partnership",
] as const;

/** Lần thanh toán — sheet All File Thu Hiền. */
export const LEDGER_PAYMENT_OPTIONS = ["1st", "2nd", "3rd"] as const;

export const LEDGER_VND_RMB_RATE = 3700;

export function formatLoaiLabel(loai: string): string {
  const key = (loai || "").trim();
  if (!key) return "—";
  if (LOAI_BILINGUAL[key]) return LOAI_BILINGUAL[key];
  if (/^.+ - .+/.test(key)) return key;
  return key;
}

/** Nhãn cột Type fixx trên thẻ tổng hợp Sổ. */
export function formatTypeFixxLabel(fixx: string): string {
  const key = (fixx || "").trim();
  if (!key) return "—";
  return LOAI_BILINGUAL[key] ?? formatLoaiLabel(key);
}

/** Nhãn 5 cột pivot (gom từ Type fixx). */
export function formatPivotTypeLabel(pivot: string): string {
  const key = (pivot || "").trim();
  const pivotLabels: Record<string, string> = {
    Other: "Other",
    广告: "广告 - Ads",
    转介绍: "转介绍 - Refer",
    续费: "续费 - Renew",
    公海: "公海 - Kho chung",
  };
  return pivotLabels[key] ?? formatLoaiLabel(key);
}
