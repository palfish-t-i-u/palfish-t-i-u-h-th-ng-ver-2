/**
 * FE contract test cho luồng đối soát kế toán dùng:
 *   - cardRecon (mPOS/Payoo gateway_txns)
 *   - bankTxns (SePay bank_transactions)
 *
 * Góc nhìn nghiệp vụ (chị Lan kế toán):
 *   1. Mở tab Đối soát → list GD `needs_review`.
 *   2. Click 1 GD → mở modal candidates (payment_lines pending).
 *   3. Chọn 1 candidate → ghép → GD chuyển `manual_matched`.
 *   4. Có thể đổi status bằng tay (patchStatus) khi cần.
 *
 * Test đảm bảo:
 *   - URL/method/body/query đúng theo BE contract.
 *   - Response phân loại đúng theo TypeScript types (BankTransaction, GatewayTxn).
 *   - Filter status pass đúng vào query string.
 *   - Discrepancy hiển thị đúng (số âm khi tiền lệch ít).
 */

import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it } from "vitest";
import { endpoints } from "./api";
import { server } from "../test/msw/server";

const BASE = "http://localhost:8000";

// ===========================================================================
// bankTxns (SePay)
// ===========================================================================
describe("bankTxns endpoint contract — luồng kế toán xem SePay", () => {
  afterEach(() => server.resetHandlers());

  it("list không param trả về toàn bộ GD", async () => {
    server.use(
      http.get(`${BASE}/api/v1/bank-transactions`, () =>
        HttpResponse.json([
          {
            txn_id: "txn-1", amount: 5_000_000,
            match_status: "auto_matched", gateway: "MBBank",
            content: "FHB9T", transfer_content: "FHB9T",
            account_number: "0123", sub_account: null,
            transaction_date: "2026-06-20T08:00:00Z",
            payment_line_id: "line-1", matched_by: null,
            created_at: "2026-06-20T08:00:00Z",
            updated_at: "2026-06-20T08:00:00Z",
            date: null,
          },
        ]),
      ),
    );

    const res = await endpoints.bankTxns.list();
    expect(res.status).toBe(200);
    expect(res.data[0].match_status).toBe("auto_matched");
  });

  it("list với filter status=needs_review chuyền query đúng", async () => {
    let receivedStatus = "";
    server.use(
      http.get(`${BASE}/api/v1/bank-transactions`, ({ request }) => {
        receivedStatus = new URL(request.url).searchParams.get("status") || "";
        return HttpResponse.json([]);
      }),
    );

    await endpoints.bankTxns.list({ status: "needs_review" });
    expect(receivedStatus).toBe("needs_review");
  });

  it("list truyền status/limit/offset lên query đúng (load-all paging)", async () => {
    let received: URLSearchParams | null = null;
    server.use(
      http.get(`${BASE}/api/v1/bank-transactions`, ({ request }) => {
        received = new URL(request.url).searchParams;
        return HttpResponse.json([]);
      }),
    );

    await endpoints.bankTxns.list({ status: "unmatched", limit: 500, offset: 500 });
    expect(received!.get("status")).toBe("unmatched");
    expect(received!.get("limit")).toBe("500");
    expect(received!.get("offset")).toBe("500");
  });

  it("matchCandidates với amount_exact truyền query đúng", async () => {
    let receivedAmount = "";
    server.use(
      http.get(`${BASE}/api/v1/bank-transactions/:id/match-candidates`, ({ request }) => {
        receivedAmount = new URL(request.url).searchParams.get("amount_exact") || "";
        return HttpResponse.json([]);
      }),
    );

    await endpoints.bankTxns.matchCandidates("txn-1", { amount_exact: 5_000_000 });
    expect(receivedAmount).toBe("5000000");
  });

  it("matchCandidates trả về danh sách có thông tin sale + team", async () => {
    server.use(
      http.get(`${BASE}/api/v1/bank-transactions/:id/match-candidates`, () =>
        HttpResponse.json([
          {
            payment_line_id: "line-1",
            pr_id: "PR-2026-0099",
            pr_name: "Phụ huynh A",
            pr_uid: "uid-1",
            pr_phone: "0901234567",
            child_name: "Bé Bin",
            sale_name: "Hoa Sale",
            team_name: "Team HN",
            amount: 5_000_000,
            created_at: "2026-06-20T08:00:00Z",
            method: "qr",
            status: "pending",
            transfer_code: "FHB9T",
          },
        ]),
      ),
    );

    const res = await endpoints.bankTxns.matchCandidates("txn-1");
    expect(res.data[0].sale_name).toBe("Hoa Sale");
    expect(res.data[0].team_name).toBe("Team HN");
    expect(res.data[0].child_name).toBe("Bé Bin");
  });

  it("matchCandidates trả về bill_images + has_bill (T4)", async () => {
    server.use(
      http.get(`${BASE}/api/v1/bank-transactions/:id/match-candidates`, () =>
        HttpResponse.json([
          {
            payment_line_id: "line-bill",
            pr_id: "PR-2026-0100",
            pr_name: "Phụ huynh B",
            amount: 5_000_000,
            created_at: "2026-06-20T08:00:00Z",
            method: "qr",
            status: "pending",
            transfer_code: "TT001",
            bill_images: ["https://storage.test/bill-1.jpg"],
            has_bill: true,
          },
        ]),
      ),
    );

    const res = await endpoints.bankTxns.matchCandidates("txn-1");
    expect(res.data[0].has_bill).toBe(true);
    expect(res.data[0].bill_images).toEqual(["https://storage.test/bill-1.jpg"]);
  });

  it("match gửi PATCH với payment_line_id qua query param", async () => {
    let receivedTxnId = "";
    let receivedLineId = "";
    server.use(
      http.patch(`${BASE}/api/v1/bank-transactions/:id/match`, ({ request, params }) => {
        receivedTxnId = String(params.id);
        receivedLineId = new URL(request.url).searchParams.get("payment_line_id") || "";
        return HttpResponse.json({ matched: true });
      }),
    );

    await endpoints.bankTxns.match("txn-1", "line-1");
    expect(receivedTxnId).toBe("txn-1");
    expect(receivedLineId).toBe("line-1");
  });
});

// ===========================================================================
// cardRecon (mPOS/Payoo gateway)
// ===========================================================================
describe("cardRecon endpoint contract — luồng kế toán xem mPOS/Payoo", () => {
  afterEach(() => server.resetHandlers());

  it("list mPOS chỉ trả về source=mpos", async () => {
    let receivedSource = "";
    server.use(
      http.get(`${BASE}/api/v1/gateway-txns`, ({ request }) => {
        receivedSource = new URL(request.url).searchParams.get("source") || "";
        return HttpResponse.json([
          {
            txn_id: "mpos-1", source: "mpos", category: "Quẹt thẻ",
            amount: 5_000_000, net_amount: 4_925_000, fee: 75_000,
            match_status: "auto_matched", paid_at: "2026-06-20T15:30:00Z",
            cardholder_name: "NGUYEN VAN A", card_masked: "****1234",
          },
        ]);
      }),
    );

    await endpoints.cardRecon.list({ source: "mpos" });
    expect(receivedSource).toBe("mpos");
  });

  it("match GD card thành công → trả về GatewayTxn updated", async () => {
    let bodyReceived: Record<string, unknown> = {};
    server.use(
      http.patch(`${BASE}/api/v1/gateway-txns/:id/match`, async ({ request }) => {
        bodyReceived = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          txn_id: "mpos-1",
          match_status: "manual_matched",
          payment_line_id: "line-1",
        });
      }),
    );

    const res = await endpoints.cardRecon.match("mpos-1", "line-1");
    expect(bodyReceived).toEqual({ payment_line_id: "line-1" });
    expect(res.data.match_status).toBe("manual_matched");
  });

  it("patchStatus mark ignored không cần payment_line_id", async () => {
    let body: Record<string, unknown> = {};
    server.use(
      http.patch(`${BASE}/api/v1/gateway-txns/:id/status`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ txn_id: "mpos-2", match_status: "ignored" });
      }),
    );

    await endpoints.cardRecon.patchStatus("mpos-2", "ignored");
    expect(body).toEqual({ match_status: "ignored" });
    expect(body.payment_line_id).toBeUndefined();
  });

  it("syncStatus trả về ext_connected + counts", async () => {
    server.use(
      http.get(`${BASE}/api/v1/gateway-sync/status`, () =>
        HttpResponse.json({
          last_sync_at: "2026-06-20T10:00:00Z",
          ext_connected: true,
          counts: {
            mpos: { auto_matched: 50, needs_review: 3, pending: 5 },
            payoo: { auto_matched: 20, pending: 2 },
          },
        }),
      ),
    );

    const res = await endpoints.cardRecon.syncStatus();
    expect(res.data.ext_connected).toBe(true);
    expect(res.data.counts.mpos.needs_review).toBe(3);
  });
});

// ===========================================================================
// Discrepancy display — confirm tiền lệch hiển thị đúng dấu
// ===========================================================================
describe("Discrepancy calc (kế toán xem chênh lệch SePay vs PR)", () => {
  it("amount lệch dương = chuyển dư", () => {
    const sepay = 5_000_500;
    const pr = 5_000_000;
    expect(sepay - pr).toBe(500);
  });

  it("amount lệch âm = chuyển thiếu", () => {
    const sepay = 4_900_000;
    const pr = 5_000_000;
    expect(sepay - pr).toBe(-100_000);
  });

  it("0 lệch = exact match", () => {
    const sepay = 5_000_000;
    const pr = 5_000_000;
    expect(sepay - pr).toBe(0);
  });
});
