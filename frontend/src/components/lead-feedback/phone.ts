import { smartParsePhonePaste } from "../payment-request/phoneUtils";

/**
 * Chuẩn hoá SĐT dạng đầu số-đuôi số cho Feedback lead.
 * TÔN TRỌNG đầu số nước ngoài (33 Pháp, 420 Séc…) và idempotent (chạy lại không cộng dồn 84).
 * - "33-619500436"  → "33-619500436"  (giữ đầu số nước ngoài, KHÔNG nhét 84)
 * - "0912345678" / "912345678" → "84-912345678"  (số trần mặc định VN)
 * - "84-912345678" → "84-912345678"  (idempotent)
 * - số trần không có separator → mặc định VN (đúng quy ước app: không đoán mò đầu số chuỗi digits trần).
 */
export function normalizePhone(raw: string): string {
  const parsed = smartParsePhonePaste(raw || "");
  if (parsed.dial) return `${parsed.dial}-${parsed.local}`;
  let local = (parsed.local || "").replace(/^0+/, "");
  if (local.startsWith("84") && local.length > 9) local = local.slice(2);
  return local ? `84-${local}` : "";
}
