/** B3 / M3 ghi Sổ doanh thu — tab Sổ lắng nghe để reload không cần F5. */
export const LEDGER_CHANGED = "gmv:ledger-changed";

export function notifyLedgerChanged() {
  window.dispatchEvent(new CustomEvent(LEDGER_CHANGED));
}
