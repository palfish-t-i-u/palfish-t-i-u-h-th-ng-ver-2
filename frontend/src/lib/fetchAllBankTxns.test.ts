import { describe, expect, it, vi } from "vitest";
import { fetchAllBankTxns, BANK_TXN_PAGE_SIZE } from "./fetchAllBankTxns";
import type { BankTransaction } from "./api";

const txn = (id: string) => ({ txn_id: id } as BankTransaction);

describe("fetchAllBankTxns", () => {
  it("1 trang ngắn → dừng sau 1 lần gọi", async () => {
    const fetcher = vi.fn().mockResolvedValue([txn("a"), txn("b")]);
    const rows = await fetchAllBankTxns(fetcher);
    expect(rows).toHaveLength(2);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(BANK_TXN_PAGE_SIZE, 0);
  });

  it("trang đầy → gọi tiếp trang sau tới khi gặp trang ngắn", async () => {
    const full = Array.from({ length: BANK_TXN_PAGE_SIZE }, (_, i) => txn(`p1-${i}`));
    const fetcher = vi.fn()
      .mockResolvedValueOnce(full)
      .mockResolvedValueOnce([txn("p2-0")]);
    const rows = await fetchAllBankTxns(fetcher);
    expect(rows).toHaveLength(BANK_TXN_PAGE_SIZE + 1);
    expect(fetcher).toHaveBeenNthCalledWith(2, BANK_TXN_PAGE_SIZE, BANK_TXN_PAGE_SIZE);
  });

  it("dedupe txn_id trùng giữa 2 trang (offset trôi khi dòng mới chen vào)", async () => {
    const full = Array.from({ length: BANK_TXN_PAGE_SIZE }, (_, i) => txn(`x-${i}`));
    const fetcher = vi.fn()
      .mockResolvedValueOnce(full)
      .mockResolvedValueOnce([txn(`x-${BANK_TXN_PAGE_SIZE - 1}`), txn("new")]);
    const rows = await fetchAllBankTxns(fetcher);
    expect(rows).toHaveLength(BANK_TXN_PAGE_SIZE + 1);
  });

  it("retry 1 lần khi trang fail; fail cả retry → throw (caller giữ state cũ)", async () => {
    const fetcher = vi.fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce([txn("a")]);
    const rows = await fetchAllBankTxns(fetcher);
    expect(rows).toHaveLength(1);

    const dead = vi.fn().mockRejectedValue(new Error("network"));
    await expect(fetchAllBankTxns(dead)).rejects.toThrow("network");
  });
});
