/** Type / loai doanh thu — nhãn hiển thị (English trước, Chinese sau). */
const LOAI_DISPLAY: Record<string, string> = {
  广告: "Ads - 广告",
  转介绍: "Refer - 转介绍",
  续费: "Renew - 续费",
  公海: "Kho chung - 公海",
};

export function formatLoaiLabel(loai: string): string {
  const key = (loai || "").trim();
  if (!key) return "—";
  if (LOAI_DISPLAY[key]) return LOAI_DISPLAY[key];
  if (/^[\w][\w\s]* - .+/.test(key)) return key;
  return key;
}
