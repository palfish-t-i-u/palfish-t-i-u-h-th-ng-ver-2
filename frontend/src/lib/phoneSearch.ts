/**
 * So khớp SĐT cho search — chấp mọi biến thể format công ty "đầu số-đuôi số"
 * (84-396249966 / 84396249966 / 0396249966 / +84 396 249 966) lẫn data bẩn
 * trong DB (đuôi trần, dính đầu số, có space).
 *
 * Nguyên tắc: đưa CẢ 2 phía về chuỗi digits (bỏ separator + toàn bộ số 0 đầu)
 * rồi so CHỨA 2 CHIỀU — không cần biết đầu số nước nào:
 *   query "84396249966" ⊇ phone "396249966" ✓ · phone "84904769355" ⊇ query "904769355" ✓
 *
 * Guard: chỉ kích hoạt khi query "giống SĐT" (digits + separator, không chữ)
 * và ≥ MIN_PHONE_QUERY_DIGITS — search tên/PR-ID không rơi vào nhánh này.
 */
const MIN_PHONE_QUERY_DIGITS = 4;
const PHONE_LIKE_QUERY = /^[+\d][\d\s().-]*$/;

export function phoneSearchDigits(s?: string | null): string {
  return (s || "").replace(/\D/g, "").replace(/^0+/, "");
}

export function phoneMatchesQuery(phone: string | null | undefined, rawQuery: string): boolean {
  const q = (rawQuery || "").trim();
  if (!PHONE_LIKE_QUERY.test(q)) return false;
  const qd = phoneSearchDigits(q);
  const pd = phoneSearchDigits(phone);
  if (!qd || !pd || qd.length < MIN_PHONE_QUERY_DIGITS) return false;
  return pd.includes(qd) || qd.includes(pd);
}
