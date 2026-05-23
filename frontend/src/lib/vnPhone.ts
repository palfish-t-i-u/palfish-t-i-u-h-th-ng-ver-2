// Whitelist đầu số di động VN (sau cải cách 2018, 10 số 0xxxxxxxxx).
// Đầu số = 3 chữ số đầu tiên (vd 097, 086, 070, 032...).
// Nguồn: VNTA / nhà mạng — chốt lại với QL nếu cần mở rộng.
export const VN_MOBILE_PREFIXES: ReadonlySet<string> = new Set([
  // Viettel
  "032", "033", "034", "035", "036", "037", "038", "039",
  "086", "096", "097", "098",
  // Vinaphone
  "081", "082", "083", "084", "085", "088", "091", "094",
  // Mobifone
  "070", "076", "077", "078", "079", "089", "090", "093",
  // Vietnamobile
  "052", "056", "058", "092",
  // Gmobile
  "059", "099",
  // Itelecom
  "087",
]);

/** Cắt 3 ký tự đầu của phần thuê bao (sau khi bỏ '+84' / số 0 đầu). */
export function extractVnPrefix(local: string): string {
  const d = (local || "").replace(/\D/g, "");
  const trimmed = d.startsWith("0") ? d.slice(1) : d;
  return trimmed.slice(0, 3);
}

export function isValidVnMobilePrefix(local: string): boolean {
  const p = extractVnPrefix(local);
  return p.length === 3 && VN_MOBILE_PREFIXES.has(p);
}

/** True khi mã vùng là VN (+84). */
export function isVnCountryCode(code: string): boolean {
  return (code || "").trim() === "+84";
}
