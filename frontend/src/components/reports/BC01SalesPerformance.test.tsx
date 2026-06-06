import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import BC01SalesPerformance from "./BC01SalesPerformance";
import { server } from "../../test/msw/server";
import type { RevenuePivotResponse } from "../../types/revenue";

vi.mock("../../hooks/useTeamScope", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../hooks/useTeamScope")>();
  return {
    ...mod,
    useTeamScope: () => ({
      teamFilters: mod.ALL_TEAM_FILTERS,
      defaultTeam: "",
      isRestricted: false,
    }),
  };
});

const BASE = "http://localhost:8000";

function makeResponse(overrides?: Partial<RevenuePivotResponse>): RevenuePivotResponse {
  return {
    months: ["2026-05", "2026-06"],
    teams: [
      {
        teamLabel: "Inhouse 1",
        totalRow: { "2026-05": 120.5, "2026-06": 85.3 },
        totalRowSum: 205.8,
        sales: [
          { sale: "Nguyen Van A", cells: { "2026-05": 70.5, "2026-06": 50.3 }, total: 120.8 },
          { sale: "Tran Thi B", cells: { "2026-05": 50, "2026-06": 35 }, total: 85 },
        ],
      },
      {
        teamLabel: "Inhouse 2",
        totalRow: { "2026-05": 60, "2026-06": 40 },
        totalRowSum: 100,
        sales: [
          { sale: "Le Van C", cells: { "2026-05": 60, "2026-06": 40 }, total: 100 },
        ],
      },
    ],
    grandTotalRow: { "2026-05": 180.5, "2026-06": 125.3 },
    grandTotal: 305.8,
    ...overrides,
  };
}

function mockBC01(data: RevenuePivotResponse = makeResponse()) {
  server.use(
    http.get(`${BASE}/revenue/pivot/sales-performance`, () => HttpResponse.json(data)),
  );
}

describe("BC01SalesPerformance", () => {
  it("renders loading then data with team/sale rows", async () => {
    mockBC01();
    render(<BC01SalesPerformance />);

    await waitFor(() => {
      expect(screen.getByText("Nguyen Van A")).toBeInTheDocument();
    });

    expect(screen.getByText("Tran Thi B")).toBeInTheDocument();
    expect(screen.getByText("Le Van C")).toBeInTheDocument();
    expect(screen.getAllByText("Inhouse 1").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Inhouse 2").length).toBeGreaterThanOrEqual(1);
  });

  it("displays grand total GMV", async () => {
    mockBC01();
    render(<BC01SalesPerformance />);

    await waitFor(() => {
      expect(screen.getByText(/Tổng GMV \(RMB\):/)).toBeInTheDocument();
    });

    const summaryEl = screen.getByText(/Tổng GMV \(RMB\):/);
    expect(summaryEl.textContent).toContain("305.8");
  });

  it("shows month columns in header", async () => {
    mockBC01();
    render(<BC01SalesPerformance />);

    await waitFor(() => {
      expect(screen.getByText("2026-05")).toBeInTheDocument();
    });
    expect(screen.getByText("2026-06")).toBeInTheDocument();
  });

  it("shows team subtotals when multiple teams exist", async () => {
    mockBC01();
    render(<BC01SalesPerformance />);

    await waitFor(() => {
      expect(screen.getAllByText("Tổng").length).toBeGreaterThanOrEqual(2);
    });
  });

  it("hides team subtotals when single team", async () => {
    const singleTeam = makeResponse({
      teams: [
        {
          teamLabel: "Inhouse 1",
          totalRow: { "2026-05": 100 },
          totalRowSum: 100,
          sales: [{ sale: "Nguyen Van A", cells: { "2026-05": 100 }, total: 100 }],
        },
      ],
    });
    mockBC01(singleTeam);
    render(<BC01SalesPerformance />);

    await waitFor(() => {
      expect(screen.getByText("Nguyen Van A")).toBeInTheDocument();
    });

    expect(screen.queryByText("Tổng")).not.toBeInTheDocument();
  });

  it("shows empty state when no data", async () => {
    mockBC01(makeResponse({ teams: [], months: [] }));
    render(<BC01SalesPerformance />);

    await waitFor(() => {
      expect(screen.getByText("Chưa có dữ liệu trong khoảng ngày đã chọn.")).toBeInTheDocument();
    });
  });

  it("shows error on API failure", async () => {
    server.use(
      http.get(`${BASE}/revenue/pivot/sales-performance`, () =>
        HttpResponse.json({ detail: "Server error" }, { status: 500 }),
      ),
    );
    render(<BC01SalesPerformance />);

    await waitFor(() => {
      expect(screen.getByText("Không tải được BC01 Sales Performance.")).toBeInTheDocument();
    });
  });

  it("has team filter dropdown with all options", () => {
    mockBC01();
    render(<BC01SalesPerformance />);

    const select = screen.getByRole("combobox");
    expect(select).toBeInTheDocument();

    const options = screen.getAllByRole("option");
    const labels = options.map((o) => o.textContent);
    expect(labels).toContain("Toàn công ty");
    expect(labels).toContain("Inhouse 1");
    expect(labels).toContain("Inhouse 2");
    expect(labels).toContain("Khác");
  });

  it("passes team param to API when filter changes", async () => {
    let capturedTeam: string | null = null;
    server.use(
      http.get(`${BASE}/revenue/pivot/sales-performance`, ({ request }) => {
        const url = new URL(request.url);
        capturedTeam = url.searchParams.get("team");
        return HttpResponse.json(makeResponse());
      }),
    );

    const user = userEvent.setup();
    render(<BC01SalesPerformance />);

    await waitFor(() => {
      expect(screen.getByText("Nguyen Van A")).toBeInTheDocument();
    });

    const select = screen.getByRole("combobox");
    await user.selectOptions(select, "Inhouse 1");

    await waitFor(() => {
      expect(capturedTeam).toBe("Inhouse 1");
    });
  });

  it("has date inputs for from/to filters", () => {
    mockBC01();
    render(<BC01SalesPerformance />);

    expect(screen.getByLabelText(/Từ ngày/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Đến ngày/)).toBeInTheDocument();
  });

  it("has refresh button that triggers reload", async () => {
    let callCount = 0;
    server.use(
      http.get(`${BASE}/revenue/pivot/sales-performance`, () => {
        callCount++;
        return HttpResponse.json(makeResponse());
      }),
    );

    const user = userEvent.setup();
    render(<BC01SalesPerformance />);

    await waitFor(() => {
      expect(screen.getByText("Nguyen Van A")).toBeInTheDocument();
    });

    const initialCalls = callCount;
    await user.click(screen.getByRole("button", { name: /Làm mới/ }));

    await waitFor(() => {
      expect(callCount).toBeGreaterThan(initialCalls);
    });
  });

  it("renders Tổng cộng grand total header row", async () => {
    mockBC01();
    render(<BC01SalesPerformance />);

    await waitFor(() => {
      expect(screen.getByText("Tổng cộng")).toBeInTheDocument();
    });
  });
});
