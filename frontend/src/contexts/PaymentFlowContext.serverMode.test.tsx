/**
 * Server mode (M3-T6, pr-list-server-pagination) — PaymentFlowContext khi
 * VITE_PR_LIST_MODE=server. Không có test file tiền lệ cho context này (đã tìm,
 * không tồn tại "refetchGate.test.tsx" nhắc trong plan gốc) — bộ test này tự dựng
 * từ đầu bằng PaymentFlowProvider thật + MSW, không mock usePaymentFlow.
 */
import { useEffect } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "../test/msw/server";

vi.stubEnv("VITE_PR_LIST_MODE", "server");

const { PaymentFlowProvider, usePaymentFlow } = await import("./PaymentFlowContext");

const BASE = "http://localhost:8000";

const capturedUrls: string[] = [];
beforeEach(() => {
  capturedUrls.length = 0;
});

function pageResponse(overrides: Partial<{ requests: unknown[]; total: number }> = {}) {
  return {
    requests: overrides.requests ?? [
      { id: "PR-1", name: "Khach A", uid: "U1", phone: "", target: 1000, received: 0, state: "pending", created_at: "2026-09-01T00:00:00Z", sale_email: "a@x.com" },
    ],
    total: overrides.total ?? 1,
    page: 1,
    page_size: 50,
  };
}

function summaryResponse() {
  return {
    chips: { all: 1, pending: 1, short: 0, done: 0, over: 0 },
    tabs: { tracking: 1, created: 0, cancelled: 0 },
    kpi: { total: 1, done: 0, over: 0, short: 1, received: 0, target: 1000 },
    tvts: [],
    has_pending_qr: false,
  };
}

function installDefaultHandlers() {
  server.use(
    http.get(`${BASE}/api/v1/payment-requests`, ({ request }) => {
      capturedUrls.push(request.url);
      return HttpResponse.json(pageResponse());
    }),
    http.get(`${BASE}/api/v1/payment-requests/summary`, ({ request }) => {
      capturedUrls.push(request.url);
      return HttpResponse.json(summaryResponse());
    }),
    http.get(`${BASE}/api/v1/payment-requests/badge-counts`, () =>
      HttpResponse.json({ reconciliation: 0, activation: 0, invoice: 0 })
    ),
    http.get(`${BASE}/api/v1/active-requests`, ({ request }) => {
      capturedUrls.push(request.url);
      return HttpResponse.json([]);
    })
  );
}

/** Consumer test-only: đọc state context ra DOM để assert, không cần UI thật. */
function Probe({ onReady }: { onReady?: (ctx: ReturnType<typeof usePaymentFlow>) => void }) {
  const ctx = usePaymentFlow();
  useEffect(() => {
    onReady?.(ctx);
  });
  return (
    <div>
      <div data-testid="page-rows-count">{ctx.pageRows.length}</div>
      <div data-testid="page-total">{ctx.pageTotal}</div>
      <div data-testid="summary-total">{ctx.summary?.kpi.total ?? "null"}</div>
    </div>
  );
}

function renderProbe(onReady?: (ctx: ReturnType<typeof usePaymentFlow>) => void) {
  return render(
    <PaymentFlowProvider>
      <Probe onReady={onReady} />
    </PaymentFlowProvider>
  );
}

describe("PaymentFlowContext — server mode (VITE_PR_LIST_MODE=server)", () => {
  it("gọi đúng 4 endpoint: view=page, summary, badge-counts, active-requests?pr_ids", async () => {
    installDefaultHandlers();
    renderProbe();

    await waitFor(() => {
      expect(screen.getByTestId("page-rows-count").textContent).toBe("1");
    });

    const pageCall = capturedUrls.find((u) => u.includes("/payment-requests?") && u.includes("view=page"));
    expect(pageCall).toBeTruthy();
    const url = new URL(pageCall!);
    expect(url.searchParams.get("view")).toBe("page");
    expect(url.searchParams.get("page_size")).toBe("50");
    expect(url.searchParams.get("bucket")).toBe("tracking");
    // listQuery mặc định của context là {bucket:"tracking", page:1} — isTest/date/tvts/q
    // do PaymentRequestsTab.setListQuery() set khi mount (không phải context default),
    // nên khi test context trần (không có Tab) thì is_test KHÔNG xuất hiện trên URL.
    expect(url.searchParams.get("is_test")).toBeNull();

    const summaryCall = capturedUrls.find((u) => u.includes("/summary"));
    expect(summaryCall).toBeTruthy();

    const arCall = capturedUrls.find((u) => u.includes("/active-requests?"));
    expect(arCall).toBeTruthy();
    expect(new URL(arCall!).searchParams.get("pr_ids")).toBe("PR-1");
  });

  it("summary.kpi lộ ra qua context.summary (dùng cho KpiCards server mode)", async () => {
    installDefaultHandlers();
    renderProbe();
    await waitFor(() => {
      expect(screen.getByTestId("summary-total").textContent).toBe("1");
    });
  });

  it("pageTotal phản ánh đúng total trả về (không phải page_size hay length trang)", async () => {
    server.use(
      http.get(`${BASE}/api/v1/payment-requests`, () => HttpResponse.json(pageResponse({ total: 137 }))),
      http.get(`${BASE}/api/v1/payment-requests/summary`, () => HttpResponse.json(summaryResponse())),
      http.get(`${BASE}/api/v1/payment-requests/badge-counts`, () =>
        HttpResponse.json({ reconciliation: 0, activation: 0, invoice: 0 })
      ),
      http.get(`${BASE}/api/v1/active-requests`, () => HttpResponse.json([]))
    );
    renderProbe();
    await waitFor(() => {
      expect(screen.getByTestId("page-total").textContent).toBe("137");
    });
  });

  it("hydratePr: tải 1 PR ngoài trang -> findPr thấy ngay sau đó (pinnedRows)", async () => {
    installDefaultHandlers();
    server.use(
      http.get(`${BASE}/api/v1/payment-requests/PR-OUTSIDE`, () =>
        HttpResponse.json({
          id: "PR-OUTSIDE", name: "Ngoai trang", uid: "U9", phone: "", target: 500, received: 500,
          state: "done", created_at: "2026-01-01T00:00:00Z", sale_email: "a@x.com", payments: [],
        })
      )
    );
    let ctxRef: ReturnType<typeof usePaymentFlow> | null = null;
    renderProbe((ctx) => {
      ctxRef = ctx;
    });
    await waitFor(() => expect(ctxRef).not.toBeNull());

    expect(ctxRef!.findPr("PR-OUTSIDE")).toBeNull();
    const hydrated = await ctxRef!.hydratePr("PR-OUTSIDE");
    expect(hydrated?.id).toBe("PR-OUTSIDE");

    await waitFor(() => {
      // Re-render đã áp dụng pinnedRows mới -> lấy ctx mới nhất qua onReady tiếp theo.
      expect(ctxRef!.findPr("PR-OUTSIDE")?.id).toBe("PR-OUTSIDE");
    });
  });

  it("hydratePr seq-guard: response CŨ trả về SAU response MỚI cho CÙNG id -> không ghi đè", async () => {
    installDefaultHandlers();
    let callCount = 0;
    server.use(
      http.get(`${BASE}/api/v1/payment-requests/PR-RACE`, async () => {
        callCount += 1;
        const isFirst = callCount === 1;
        // Lần gọi đầu (cũ hơn) trả về CHẬM hơn lần gọi sau (mới hơn) — mô phỏng
        // network race thật (bug QR cross-PR 26/6).
        await new Promise((r) => setTimeout(r, isFirst ? 50 : 0));
        return HttpResponse.json({
          id: "PR-RACE", name: isFirst ? "Ban dau (cu)" : "Ghi de (moi)", uid: "U1", phone: "",
          target: 1, received: 0, state: "pending", created_at: "2026-01-01T00:00:00Z",
          sale_email: "a@x.com", payments: [],
        });
      })
    );
    let ctxRef: ReturnType<typeof usePaymentFlow> | null = null;
    renderProbe((ctx) => {
      ctxRef = ctx;
    });
    await waitFor(() => expect(ctxRef).not.toBeNull());

    const oldCall = ctxRef!.hydratePr("PR-RACE"); // seq=1, chậm (50ms)
    const newCall = ctxRef!.hydratePr("PR-RACE"); // seq=2, nhanh (0ms) — resolve TRƯỚC oldCall
    const [oldResult, newResult] = await Promise.all([oldCall, newCall]);

    expect(newResult?.name).toBe("Ghi de (moi)");
    expect(oldResult).toBeNull(); // seq-guard chặn — response cũ hơn bị bỏ, KHÔNG trả data

    await waitFor(() => {
      expect(ctxRef!.findPr("PR-RACE")?.name).toBe("Ghi de (moi)");
    });
  });

  it("ensureFullData: mount B2/B3/B4 -> tải song song requests/activeRequests đầy đủ, KHÔNG thay thế pageRows", async () => {
    installDefaultHandlers();
    server.use(
      http.get(`${BASE}/api/v1/payment-requests`, ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get("view") === "page") {
          return HttpResponse.json(pageResponse());
        }
        // Endpoint cũ (fetchAllPaymentRequests dùng limit/offset, KHÔNG có view=page).
        return HttpResponse.json({
          requests: [
            { id: "PR-FULL-1", name: "Full 1", uid: "U1", phone: "", target: 1, received: 0, state: "pending", created_at: "2026-01-01T00:00:00Z" },
          ],
          total: 1,
        });
      })
    );

    let ctxRef: ReturnType<typeof usePaymentFlow> | null = null;
    renderProbe((ctx) => {
      ctxRef = ctx;
    });
    await waitFor(() => expect(ctxRef).not.toBeNull());

    let cleanup: (() => void) | null = null;
    cleanup = ctxRef!.ensureFullData();

    await waitFor(() => {
      expect(ctxRef!.requests.some((r) => r.id === "PR-FULL-1")).toBe(true);
    });
    // pageRows (trang server) không bị full-load ghi đè.
    expect(ctxRef!.pageRows.some((r) => r.id === "PR-1")).toBe(true);

    cleanup();
  });
});
