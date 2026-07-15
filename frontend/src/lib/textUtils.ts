/**
 * Chuẩn hoá chuỗi tiếng Việt cho so khớp search (case- & accent-insensitive).
 *
 * 2 bước BẮT BUỘC (xem docs/learnings/2026-07-11-search-normalize-vi.md):
 *   1. NFD + strip combining marks (U+0300–U+036F) — xoá sắc/huyền/hỏi/ngã/nặng,
 *      breve, circumflex, horn.
 *   2. đ/Đ → d — thủ công, vì đ (U+0111/U+0110) là base character riêng,
 *      KHÔNG bị NFD decompose thành `d + combining mark`. Bỏ bước này thì "Đặng"
 *      normalize thành "đang" (không phải "dang"), user gõ "dang" vẫn trượt.
 *
 * Null-safe: undefined/null/"" → "".
 *
 * Ví dụ: "Như Ý" → "nhu y" · "Đặng" → "dang" · "Hà Bảo Ngân" → "ha bao ngan".
 */
export function normVi(s?: string | null): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d");
}
