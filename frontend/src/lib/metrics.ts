/** Tránh #DIV/0! và NaN trên Dashboard. */
export const safeDivide = (
  numerator: number,
  denominator: number,
  asPercent = false,
): number => {
  if (!denominator || denominator === 0 || Number.isNaN(denominator)) return 0;
  const num = Number.isNaN(numerator) ? 0 : numerator;
  const result = num / denominator;
  return Number((asPercent ? result * 100 : result).toFixed(2));
};

const INVALID_SALE_NAMES = new Set([
  "", "nan", "none", "null", "na", "sales", "sale", "department",
  "total", "合计", "汇总", "—", "-",
]);

/** Loại dòng header / Total / NaN khỏi bảng Dashboard & BC03. */
export function isValidSaleName(name: string | null | undefined): boolean {
  const s = String(name ?? "").trim();
  if (!s) return false;
  return !INVALID_SALE_NAMES.has(s.toLowerCase());
}

export const pctOf = (part: number, whole: number): number =>
  Math.round(safeDivide(part, whole, true));

export const fmtRate = (value: number | undefined | null): string =>
  `${Number(value ?? 0).toFixed(1)}%`;
