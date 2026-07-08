import type { PaymentAttempt } from "../../types/paymentRequest";

/**
 * Returns all "paid" payment attempts that are missing a bill image.
 * A bill is considered present if:
 *  - `billImage` is a non-empty string, OR
 *  - `billImages` is a non-empty array
 */
export function findPaidLinesWithoutBill(lines: PaymentAttempt[]): PaymentAttempt[] {
  return lines.filter((l) => {
    if (l.status !== "paid") return false;
    const hasSingle = (l.billImage ?? "").trim().length > 0;
    const hasMulti = Array.isArray(l.billImages) && l.billImages.length > 0;
    return !hasSingle && !hasMulti;
  });
}
