/**
 * GĐ1 load-all (2026-07-11): nạp TOÀN BỘ PR thay vì 100 PR mới nhất.
 * Trang 1 tuần tự (lấy total) → các trang còn lại song song → dedupe id.
 * All-or-nothing: 1 trang fail sau retry → throw, caller giữ state cũ
 * (KHÔNG bao giờ hiển thị danh sách thiếu — đó chính là bug gốc).
 */

export interface RawPrRow {
  id?: string;
  created_at?: string;
  [key: string]: unknown;
}

export interface PrListPage {
  requests?: RawPrRow[];
  total?: number;
}

export type PrListFetcher = (limit: number, offset: number) => Promise<PrListPage>;

export const PR_PAGE_SIZE = 500;
/** Vượt ngưỡng này = đến lúc làm GĐ2 (slim list) — xem plan 2026-07-11-pr-list-slim-lazy-gd2.md */
export const PR_TOTAL_WARN_THRESHOLD = 1500;
/** Backstop 20k PR — chống loop vô hạn nếu BE trả total/paging sai. */
const MAX_PAGES = 40;

async function fetchPageWithRetry(fetchPage: PrListFetcher, limit: number, offset: number): Promise<PrListPage> {
  try {
    return await fetchPage(limit, offset);
  } catch {
    return await fetchPage(limit, offset);
  }
}

function dedupeById(rows: RawPrRow[]): RawPrRow[] {
  const seen = new Set<string>();
  const out: RawPrRow[] = [];
  for (const r of rows) {
    const id = String(r.id ?? "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(r);
  }
  return out;
}

export async function fetchAllPaymentRequests(fetchPage: PrListFetcher): Promise<{
  requests: RawPrRow[];
  total: number | null;
  /** true = gộp xong vẫn thiếu so với total (row đổi giữa các lần fetch) — realtime refetch sẽ tự lành */
  incomplete: boolean;
}> {
  const first = await fetchPageWithRetry(fetchPage, PR_PAGE_SIZE, 0);
  const total = typeof first.total === "number" ? first.total : null;
  const collected: RawPrRow[] = [...(first.requests ?? [])];

  if (total !== null) {
    const offsets: number[] = [];
    for (let o = PR_PAGE_SIZE; o < Math.min(total, MAX_PAGES * PR_PAGE_SIZE); o += PR_PAGE_SIZE) {
      offsets.push(o);
    }
    const rest = await Promise.all(offsets.map((o) => fetchPageWithRetry(fetchPage, PR_PAGE_SIZE, o)));
    for (const page of rest) collected.push(...(page.requests ?? []));
  } else {
    // BE cũ chưa deploy total (rollback scenario): loop tuần tự tới trang ngắn
    let offset = PR_PAGE_SIZE;
    let lastLen = (first.requests ?? []).length;
    while (lastLen === PR_PAGE_SIZE && offset < MAX_PAGES * PR_PAGE_SIZE) {
      const page = await fetchPageWithRetry(fetchPage, PR_PAGE_SIZE, offset);
      const rows = page.requests ?? [];
      collected.push(...rows);
      lastLen = rows.length;
      offset += PR_PAGE_SIZE;
    }
  }

  const requests = dedupeById(collected);
  // Giữ thứ tự created_at desc như BE (các trang song song đã theo offset, sort lại cho chắc)
  requests.sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
  return {
    requests,
    total,
    incomplete: total !== null && requests.length < total,
  };
}
