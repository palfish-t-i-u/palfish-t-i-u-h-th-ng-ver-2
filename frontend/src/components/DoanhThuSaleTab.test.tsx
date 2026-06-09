import { render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import DoanhThuSaleTab from "./DoanhThuSaleTab";
import { server } from "../test/msw/server";
import type { RevenuePivotResponse } from "../types/revenue";

vi.mock("../lib/supabase", () => ({
  supabase: {
    channel: () => ({
      on: function () { return this; },
      subscribe: () => {},
    }),
    removeChannel: () => {},
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
    },
  },
}));

const BASE = "http://localhost:8000";

function makePivotResponse(overrides?: Partial<RevenuePivotResponse>): RevenuePivotResponse {
  return {
    months: ["2026-05", "2026-06"],
    teams: [
      {
        teamLabel: "Inhouse 1",
        totalRow: { "2026-05": 500, "2026-06": 300 },
        totalRowSum: 800,
        sales: [
          {
            sale: "Nguyen Van A",
            cells: { "2026-05": 300, "2026-06": 200 },
            total: 500,
          },
          {
            sale: "Tran Thi B",
            cells: { "2026-05": 200, "2026-06": 100 },
            total: 300,
          },
        ],
      },
    ],
    grandTotalRow: { "2026-05": 500, "2026-06": 300 },
    grandTotal: 800,
    ...overrides,
  };
}

function mockPivotEndpoint(data?: RevenuePivotResponse) {
  server.use(
    http.get(`${BASE}/revenue/pivot`, () =>
      HttpResponse.json(data ?? makePivotResponse()),
    ),
  );
}

describe("DoanhThuSaleTab", () => {
  it("renders without crashing", async () => {
    mockPivotEndpoint();
    render(<DoanhThuSaleTab />);
    expect(screen.getByText(/Bảng tự cộng từ/)).toBeInTheDocument();
  });

  it("shows key UI elements (date filters, refresh button)", async () => {
    mockPivotEndpoint();
    render(<DoanhThuSaleTab />);
    expect(screen.getByText("Từ ngày")).toBeInTheDocument();
    expect(screen.getByText("Đến ngày")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("Làm mới")).toBeInTheDocument();
    });
  });

  it("shows loading state while fetching", async () => {
    server.use(
      http.get(`${BASE}/revenue/pivot`, async () => {
        await new Promise((r) => setTimeout(r, 100));
        return HttpResponse.json(makePivotResponse());
      }),
    );
    render(<DoanhThuSaleTab />);
    expect(screen.getByText("Đang tải…")).toBeInTheDocument();
  });

  it("renders pivot data in the table after loading", async () => {
    mockPivotEndpoint();
    render(<DoanhThuSaleTab />);

    await waitFor(() => {
      expect(screen.getByText("Nguyen Van A")).toBeInTheDocument();
    });
    expect(screen.getByText("Tran Thi B")).toBeInTheDocument();
    expect(screen.getAllByText("Inhouse 1").length).toBeGreaterThan(0);
    // Grand total
    expect(screen.getByText(/Tổng GMV \(RMB\): 800/)).toBeInTheDocument();
    // Table headers
    expect(screen.getByText("2026-05")).toBeInTheDocument();
    expect(screen.getByText("2026-06")).toBeInTheDocument();
    expect(screen.getByText("Tổng GMV")).toBeInTheDocument();
  });

  it("shows error message when API fails", async () => {
    server.use(
      http.get(`${BASE}/revenue/pivot`, () =>
        new HttpResponse(null, { status: 500 }),
      ),
    );
    render(<DoanhThuSaleTab />);

    await waitFor(() => {
      expect(screen.getByText("Không tải được Sales Performance.")).toBeInTheDocument();
    });
  });

  it("shows empty state when no teams data", async () => {
    mockPivotEndpoint(makePivotResponse({ teams: [], grandTotal: 0 }));
    render(<DoanhThuSaleTab />);

    await waitFor(() => {
      expect(screen.getByText(/Chưa có dữ liệu trong khoảng ngày đã chọn/)).toBeInTheDocument();
    });
  });
});
