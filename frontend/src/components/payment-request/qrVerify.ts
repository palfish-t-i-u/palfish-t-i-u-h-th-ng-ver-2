/**
 * Guardrail incident 7/7/2026: mọi ảnh QR rời app (clipboard/download) phải
 * decode ra và khớp nội dung line đang mở. Độc lập html-to-image internals.
 */

/**
 * Parse EMV TLV flat format.
 * Each entry: id(2 chars) + len(2 chars, decimal) + value(len chars).
 * On malformed (len exceeds string, non-digit len chars) → stop and return
 * map of what was parsed so far. Does NOT throw.
 */
export function parseEmvTlv(payload: string): Map<string, string> {
  const result = new Map<string, string>();
  let i = 0;
  while (i + 4 <= payload.length) {
    const tag = payload.slice(i, i + 2);
    const lenStr = payload.slice(i + 2, i + 4);
    // Validate length chars are digits
    if (!/^\d{2}$/.test(lenStr)) {
      break;
    }
    const len = parseInt(lenStr, 10);
    const valueStart = i + 4;
    const valueEnd = valueStart + len;
    if (valueEnd > payload.length) {
      break;
    }
    const value = payload.slice(valueStart, valueEnd);
    result.set(tag, value);
    i = valueEnd;
  }
  return result;
}

/**
 * Extract VietQR addInfo from EMV payload.
 * addInfo is at top-level tag "62" (Additional Data Field Template),
 * sub-tag "08" inside tag 62's value.
 * Returns null if not found.
 */
export function extractEmvAddInfo(payload: string): string | null {
  const topLevel = parseEmvTlv(payload);
  const tag62Value = topLevel.get("62");
  if (!tag62Value) return null;
  const nested = parseEmvTlv(tag62Value);
  return nested.get("08") ?? null;
}

/**
 * Extract Transaction Amount from EMV payload.
 * Tag "54" = Transaction Amount (string).
 * Returns null if not found.
 */
export function extractEmvAmount(payload: string): string | null {
  const topLevel = parseEmvTlv(payload);
  return topLevel.get("54") ?? null;
}

/**
 * Verify a QR payload against expected transferCode and amount.
 * Returns true iff:
 *   - addInfo is found AND includes expected.transferCode
 *   - amount string === String(expected.amount)
 * Uses includes() for transferCode (not strict equality) because vietqr.io
 * may normalize spaces/accents in names, but the token code (e.g. "FHK81")
 * is stable.
 */
export function verifyQrPayload(
  payload: string,
  expected: { transferCode: string; amount: number }
): boolean {
  if (!expected.transferCode) return false;
  const addInfo = extractEmvAddInfo(payload);
  if (addInfo === null) return false;
  if (!addInfo.includes(expected.transferCode)) return false;
  const amount = extractEmvAmount(payload);
  if (amount === null) return false;
  return amount === String(expected.amount);
}

/**
 * Decode QR code from a Blob (browser-only).
 * Uses createImageBitmap + canvas + jsqr.
 * Retries at scales [1, 0.75, 0.5] (jsQR is sensitive to image size
 * with pixelRatio 2 images).
 * Returns null on any error (handles createImageBitmap missing in old browsers).
 */
export async function decodeQrFromBlob(blob: Blob): Promise<string | null> {
  try {
    const scales = [1, 0.75, 0.5];
    const bitmap = await createImageBitmap(blob);
    const jsqr = (await import("jsqr")).default;
    try {
      for (const scale of scales) {
        try {
          const w = Math.round(bitmap.width * scale);
          const h = Math.round(bitmap.height * scale);
          const canvas = new OffscreenCanvas(w, h);
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          ctx.drawImage(bitmap, 0, 0, w, h);
          const imageData = ctx.getImageData(0, 0, w, h);
          const result = jsqr(imageData.data, w, h);
          if (result) {
            return result.data;
          }
        } catch {
          // Try next scale
        }
      }
      return null;
    } finally {
      bitmap.close();
    }
  } catch {
    return null;
  }
}
