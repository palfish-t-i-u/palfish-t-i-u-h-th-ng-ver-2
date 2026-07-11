import { describe, expect, it, vi } from "vitest";
import {
  fetchAllPaymentRequests,
  type PrListPage,
  type RawPrRow,
} from "./fetchAllPaymentRequests";

function row(i: number): RawPrRow {
  return { id: `PR${i}`, created_at: `2026-01-01T00:00:${String(i % 60).padStart(2, "0")}Z` };
}

function pagedFetcher(rows: RawPrRow[], total = rows.length) {
  return vi.fn(async (limit: number, offset: number): Promise<PrListPage> => ({
    requests: rows.slice(offset, offset + limit),
    total,
  }));
}

describe("fetchAllPaymentRequests", () => {
  it("1 trang khi total <= PAGE_SIZE — đúng 1 call", async () => {
    const rows = Array.from({ length: 190 }, (_, i) => row(i));
    const fetcher = pagedFetcher(rows);
    const res = await fetchAllPaymentRequests(fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(res.requests).toHaveLength(190);
    expect(res.total).toBe(190);
    expect(res.incomplete).toBe(false);
  });

  it("nhiều trang — gọi offset 0/500/1000, gộp đủ", async () => {
    const rows = Array.from({ length: 1037 }, (_, i) => row(i));
    const fetcher = pagedFetcher(rows);
    const res = await fetchAllPaymentRequests(fetcher);
    expect(fetcher.mock.calls.map((c) => c[1])).toEqual([0, 500, 1000]);
    expect(res.requests).toHaveLength(1037);
  });

  it("dedupe id trùng ở ranh trang (PR mới tạo giữa 2 lần fetch làm trang trượt)", async () => {
    const rows = Array.from({ length: 600 }, (_, i) => row(i));
    const fetcher = vi.fn(async (_limit: number, offset: number): Promise<PrListPage> => {
      if (offset === 0) return { requests: rows.slice(0, 500), total: 600 };
      // trang 2 lặp lại phần tử cuối trang 1 (trượt offset)
      return { requests: rows.slice(499, 600), total: 600 };
    });
    const res = await fetchAllPaymentRequests(fetcher);
    const ids = res.requests.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(res.requests).toHaveLength(600);
  });

  it("thiếu row so với total → incomplete=true (guardrail hiển thị note)", async () => {
    const rows = Array.from({ length: 400 }, (_, i) => row(i));
    const fetcher = pagedFetcher(rows, 450); // BE báo 450 nhưng chỉ trả được 400
    const res = await fetchAllPaymentRequests(fetcher);
    expect(res.incomplete).toBe(true);
  });

  it("BE cũ không trả total → loop tuần tự tới trang ngắn (rollback-safe)", async () => {
    const rows = Array.from({ length: 700 }, (_, i) => row(i));
    const fetcher = vi.fn(async (limit: number, offset: number): Promise<PrListPage> => ({
      requests: rows.slice(offset, offset + limit),
      // total intentionally omitted — tests rollback-safe path
    }));
    const res = await fetchAllPaymentRequests(fetcher);
    expect(res.requests).toHaveLength(700);
    expect(res.total).toBeNull();
  });

  it("trang lỗi 1 lần → retry thành công", async () => {
    const rows = Array.from({ length: 600 }, (_, i) => row(i));
    let failed = false;
    const fetcher = vi.fn(async (limit: number, offset: number): Promise<PrListPage> => {
      if (offset === 500 && !failed) {
        failed = true;
        throw new Error("network");
      }
      return { requests: rows.slice(offset, offset + limit), total: 600 };
    });
    const res = await fetchAllPaymentRequests(fetcher);
    expect(res.requests).toHaveLength(600);
  });

  it("trang lỗi 2 lần liên tiếp → throw (all-or-nothing, không hiển thị số thiếu)", async () => {
    const fetcher = vi.fn(async (_limit: number, offset: number): Promise<PrListPage> => {
      if (offset === 500) throw new Error("network");
      return { requests: Array.from({ length: 500 }, (_, i) => row(i)), total: 600 };
    });
    await expect(fetchAllPaymentRequests(fetcher)).rejects.toThrow("network");
  });
});
