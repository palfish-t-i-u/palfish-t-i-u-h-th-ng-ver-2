/**
 * Load-all CK ngoài chờ ghép (2026-07-17): nạp TOÀN BỘ bank txns theo 1 status
 * thay vì 200 dòng mới nhất (bug: giao dịch pending cũ biến mất khỏi tab).
 * BE trả bare array (không total) → loop tuần tự tới khi gặp trang ngắn.
 * Mirror fallback branch của fetchAllPaymentRequests.ts (plan 2026-07-11).
 * All-or-nothing: 1 trang fail sau retry → throw, caller giữ state cũ.
 */
import type { BankTransaction } from "./api";

export type BankTxnPageFetcher = (limit: number, offset: number) => Promise<BankTransaction[]>;

export const BANK_TXN_PAGE_SIZE = 500;
/** Backstop 10k dòng — chống loop vô hạn nếu BE paging sai. */
const MAX_PAGES = 20;

async function fetchPageWithRetry(
  fetchPage: BankTxnPageFetcher,
  limit: number,
  offset: number,
): Promise<BankTransaction[]> {
  try {
    return await fetchPage(limit, offset);
  } catch {
    return await fetchPage(limit, offset);
  }
}

export async function fetchAllBankTxns(fetchPage: BankTxnPageFetcher): Promise<BankTransaction[]> {
  const collected: BankTransaction[] = [];
  let offset = 0;
  let lastLen = BANK_TXN_PAGE_SIZE;
  while (lastLen === BANK_TXN_PAGE_SIZE && offset < MAX_PAGES * BANK_TXN_PAGE_SIZE) {
    const rows = await fetchPageWithRetry(fetchPage, BANK_TXN_PAGE_SIZE, offset);
    collected.push(...rows);
    lastLen = rows.length;
    offset += BANK_TXN_PAGE_SIZE;
  }
  // Dedupe txn_id — dòng mới chen vào giữa 2 lần fetch làm offset trôi → có thể trùng
  const seen = new Set<string>();
  return collected.filter((r) => {
    if (!r.txn_id || seen.has(r.txn_id)) return false;
    seen.add(r.txn_id);
    return true;
  });
}
