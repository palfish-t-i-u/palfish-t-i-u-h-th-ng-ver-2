import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import BC02KeyDataReport from "./BC02KeyDataReport";
import { server } from "../../test/msw/server";
import type { RevenueKeyDataResponse } from "../../types/revenue";

const BASE = "http://localhost:8000";

function makeResponse(overrides?: Partial<RevenueKeyDataResponse>): RevenueKeyDataResponse {
  return {
    scopeLabel: "Toàn công ty · 01/06 – 30/06",
    columnGroups: [
      { key: "new", label: "Mới", countLabel: "Đơn", gmvLabel: "GMV (¥)" },
      { key: "renew", label: "Gia hạn", countLabel: "Đơn", gmvLabel: "GMV (¥)" },
    ],
    rows: [
      {
        date: "2026-06-01",
        totalOrders: 15,
        totalGmv: 2500.5,
        categories: {
          new: { count: 10, gmv: 1800 },
          renew: { count: 5, gmv: 700.5 },
        },
      },
      {
        date: "2026-06-02",
        totalOrders: 8,
        totalGmv: 1200,
        categories: {
          new: { count: 5, gmv: 800 },
          renew: { count: 3, gmv: 400 },
        },
      },
    ],
    grandTotal: {
      totalOrders: 23,
      totalGmv: 3700.5,
      categories: {
        new: { count: 15, gmv: 2600 },
        renew: { count: 8, gmv: 1100.5 },
      },
    },
    ...overrides,
  };
}

function mockBC02(data: RevenueKeyDataResponse = makeResponse()) {
  server.use(
    http.get(`${BASE}/revenue/pivot/key-data`, () => HttpResponse.json(data)),
  );
}

describe("BC02KeyDataReport", () => {
  it("renders data rows with dates formatted dd/mm/yyyy", async () => {
    mockBC02();
    render(<BC02KeyDataReport />);

    await waitFor(() => {
      expect(screen.getByText("01/06/2026")).toBeInTheDocument();
    });
    expect(screen.getByText("02/06/2026")).toBeInTheDocument();
  });

  it("displays grand total summary text", async () => {
    mockBC02();
    render(<BC02KeyDataReport />);

    await waitFor(() => {
      expect(screen.getByText(/Tổng GMV \(RMB\):/)).toBeInTheDocument();
    });
    const summaryEl = screen.getByText(/Tổng GMV \(RMB\):/);
    expect(summaryEl.textContent).toContain("3,700.5");
    expect(summaryEl.textContent).toContain("23");
    expect(summaryEl.textContent).toContain("đơn");
  });

  it("displays grand total row in table", async () => {
    mockBC02();
    render(<BC02KeyDataReport />);

    await waitFor(() => {
      expect(screen.getByText("Tổng cộng")).toBeInTheDocument();
    });
  });

  it("displays scope label", async () => {
    mockBC02();
    render(<BC02KeyDataReport />);

    await waitFor(() => {
      expect(screen.getByText("Toàn công ty · 01/06 – 30/06")).toBeInTheDocument();
    });
  });

  it("renders column group headers", async () => {
    mockBC02();
    render(<BC02KeyDataReport />);

    await waitFor(() => {
      expect(screen.getByText("Mới")).toBeInTheDocument();
    });
    expect(screen.getByText("Gia hạn")).toBeInTheDocument();
  });

  it("renders sub-column headers (countLabel, gmvLabel)", async () => {
    mockBC02();
    render(<BC02KeyDataReport />);

    await waitFor(() => {
      expect(screen.getAllByText("Đơn").length).toBeGreaterThanOrEqual(2);
    });
    expect(screen.getAllByText("GMV (¥)").length).toBeGreaterThanOrEqual(2);
  });

  it("shows empty state when no rows", async () => {
    mockBC02(makeResponse({ rows: [] }));
    render(<BC02KeyDataReport />);

    await waitFor(() => {
      expect(screen.getByText("Chưa có dữ liệu trong khoảng ngày đã chọn.")).toBeInTheDocument();
    });
  });

  it("shows error on API failure", async () => {
    server.use(
      http.get(`${BASE}/revenue/pivot/key-data`, () =>
        HttpResponse.json({ detail: "fail" }, { status: 500 }),
      ),
    );
    render(<BC02KeyDataReport />);

    await waitFor(() => {
      expect(screen.getByText("Không tải được BC02 Key Data.")).toBeInTheDocument();
    });
  });

  it("shows dash for zero-count categories", async () => {
    mockBC02(
      makeResponse({
        rows: [
          {
            date: "2026-06-01",
            totalOrders: 5,
            totalGmv: 1000,
            categories: {
              new: { count: 5, gmv: 1000 },
              renew: { count: 0, gmv: 0 },
            },
          },
        ],
      }),
    );
    render(<BC02KeyDataReport />);

    await waitFor(() => {
      expect(screen.getByText("01/06/2026")).toBeInTheDocument();
    });
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });

  it("has team filter with all options", () => {
    mockBC02();
    render(<BC02KeyDataReport />);

    const select = screen.getByRole("combobox");
    const options = screen.getAllByRole("option");
    const labels = options.map((o) => o.textContent);
    expect(labels).toContain("Toàn công ty");
    expect(labels).toContain("Inhouse 1");
    expect(labels).toContain("HCM (Online)");
    expect(select).toBeInTheDocument();
  });

  it("passes team param to API on filter change", async () => {
    let capturedTeam: string | null = null;
    server.use(
      http.get(`${BASE}/revenue/pivot/key-data`, ({ request }) => {
        const url = new URL(request.url);
        capturedTeam = url.searchParams.get("team");
        return HttpResponse.json(makeResponse());
      }),
    );

    const user = userEvent.setup();
    render(<BC02KeyDataReport />);

    await waitFor(() => {
      expect(screen.getByText("01/06/2026")).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByRole("combobox"), "Inhouse 2");

    await waitFor(() => {
      expect(capturedTeam).toBe("Inhouse 2");
    });
  });

  it("has from/to date inputs and refresh button", async () => {
    mockBC02();
    render(<BC02KeyDataReport />);

    expect(screen.getByLabelText(/Từ ngày/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Đến ngày/)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Làm mới/ })).toBeInTheDocument();
    });
  });

  it("refresh button triggers API reload", async () => {
    let callCount = 0;
    server.use(
      http.get(`${BASE}/revenue/pivot/key-data`, () => {
        callCount++;
        return HttpResponse.json(makeResponse());
      }),
    );

    const user = userEvent.setup();
    render(<BC02KeyDataReport />);

    await waitFor(() => {
      expect(screen.getByText("01/06/2026")).toBeInTheDocument();
    });

    const before = callCount;
    await user.click(screen.getByRole("button", { name: /Làm mới/ }));

    await waitFor(() => {
      expect(callCount).toBeGreaterThan(before);
    });
  });

  it("displays static header columns Ngày, Tổng đơn, Tổng GMV", async () => {
    mockBC02();
    render(<BC02KeyDataReport />);

    await waitFor(() => {
      expect(screen.getByText("Ngày")).toBeInTheDocument();
    });
    expect(screen.getByText("Tổng đơn")).toBeInTheDocument();
    expect(screen.getByText("Tổng GMV (¥)")).toBeInTheDocument();
  });
});
