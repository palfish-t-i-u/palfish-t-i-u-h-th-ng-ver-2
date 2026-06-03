import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import ReportBC03Tab from "./ReportBC03Tab";
import { server } from "../test/msw/server";
import type { Bc03Report, Bc03MonthlySettings, DashboardLiveSummary } from "../types/order";

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

function today() {
  return new Date().toISOString().slice(0, 10);
}

function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthStart() {
  return currentMonthKey() + "-01";
}

function makeBc03Report(overrides?: Partial<Bc03Report>): Bc03Report {
  const d = today();
  return {
    period: { start: monthStart(), end: d },
    dates: [monthStart(), d],
    revenue: [
      {
        sale_name: "Nguyen Kieu Trang",
        team: "Inhouse 1",
        gmv_rmb: 120,
        gmv_rmb_crm: 80,
        gmv_rmb_ledger: 40,
        collected_vnd: 70_977_400,
        collected_vnd_m2: 0,
        orders: 2,
        orders_crm: 1,
        orders_ledger: 1,
        orders_m2: 0,
        daily: {
          [monthStart()]: {
            gmv_rmb_crm: 50,
            gmv_rmb_ledger: 20,
            collected_vnd: 40_000_000,
            collected_vnd_m2: 0,
            orders_crm: 1,
            orders_ledger: 0,
            orders_m2: 0,
            gmv_rmb: 70,
            orders: 1,
          },
          [d]: {
            gmv_rmb_crm: 30,
            gmv_rmb_ledger: 20,
            collected_vnd: 30_977_400,
            collected_vnd_m2: 0,
            orders_crm: 0,
            orders_ledger: 1,
            orders_m2: 0,
            gmv_rmb: 50,
            orders: 1,
          },
        },
      },
      {
        sale_name: "Le Thi Lan Anh",
        team: "Inhouse 1",
        gmv_rmb: 60,
        gmv_rmb_crm: 60,
        gmv_rmb_ledger: 0,
        collected_vnd: 28_988_700,
        collected_vnd_m2: 0,
        orders: 2,
        orders_crm: 2,
        orders_ledger: 0,
        orders_m2: 0,
        daily: {},
      },
    ],
    trial: [
      {
        sale_name: "Nguyen Kieu Trang",
        team: "Inhouse 1",
        completed_classes: 5,
        daily: { [monthStart()]: 3, [d]: 2 },
      },
    ],
    referral: [
      {
        sale_name: "Le Thi Lan Anh",
        team: "Inhouse 1",
        referral_leads: 3,
        daily: { [monthStart()]: 2, [d]: 1 },
      },
    ],
    ...overrides,
  };
}

function makeLiveSummary(): DashboardLiveSummary {
  return {
    period: { start: monthStart(), end: today() },
    row_count: 178,
    kpi: {
      l1: 178,
      l8: 21,
      total_gmv_rmb: 55398,
      total_collected_vnd: 177_204_500,
      total_orders: 21,
      sales_count: 15,
    },
    top_sales: [],
    conversion: { l1_to_l8: 0 },
    today: { orders: 0, gmv_rmb: 0 },
  } as unknown as DashboardLiveSummary;
}

function makeMonthlySettings(): Bc03MonthlySettings {
  return {
    month: currentMonthKey(),
    exchange_rate: 3700,
    updated_at: "2026-06-01T10:00:00Z",
    updated_by: "admin@test.com",
    kpi_rows: [
      { id: "k1", sale_name: "Nguyen Kieu Trang", b2_orders: 5, b4_gmv_vnd: 100_000_000 },
      { id: "k2", sale_name: "Le Thi Lan Anh", b2_orders: 3, b4_gmv_vnd: 80_000_000 },
    ],
  };
}

function makeStaffOptions() {
  return {
    sales: [
      { crm_name: "Nguyen Kieu Trang", team: "Inhouse 1", display_name: "Nguyen Kieu Trang - Inhouse 1" },
      { crm_name: "Le Thi Lan Anh", team: "Inhouse 1", display_name: "Le Thi Lan Anh - Inhouse 1" },
      { crm_name: "Ta Thuy Van", team: "Inhouse 1", display_name: "Ta Thuy Van - Inhouse 1" },
    ],
  };
}

function mockAllBC03Endpoints(opts?: {
  report?: Bc03Report;
  monthly?: Bc03MonthlySettings;
}) {
  server.use(
    http.get(`${BASE}/reports/bc03`, () =>
      HttpResponse.json(opts?.report ?? makeBc03Report()),
    ),
    http.get(`${BASE}/reports/bc03/staff`, () =>
      HttpResponse.json(makeStaffOptions()),
    ),
    http.get(`${BASE}/reports/bc03/monthly`, () =>
      HttpResponse.json(opts?.monthly ?? makeMonthlySettings()),
    ),
    http.get(`${BASE}/dashboard/live_summary`, () =>
      HttpResponse.json(makeLiveSummary()),
    ),
    http.put(`${BASE}/reports/bc03/monthly`, () =>
      HttpResponse.json(makeMonthlySettings()),
    ),
  );
}

describe("ReportBC03Tab", () => {
  it("renders live KPI cards (L1, L8, GMV CRM, Đã thu)", async () => {
    mockAllBC03Endpoints();
    render(<ReportBC03Tab />);

    await waitFor(() => {
      expect(screen.getByText("L1")).toBeInTheDocument();
    });
    expect(screen.getByText("L8 (đơn CRM)")).toBeInTheDocument();
    expect(screen.getByText("GMV CRM (RMB)")).toBeInTheDocument();
    expect(screen.getByText("Đã thu (VND)")).toBeInTheDocument();
  });

  it("displays live summary numbers", async () => {
    mockAllBC03Endpoints();
    render(<ReportBC03Tab />);

    await waitFor(() => {
      expect(screen.getByText("178")).toBeInTheDocument();
    });
    expect(screen.getByText("21")).toBeInTheDocument();
  });

  it("renders revenue tab with sale names", async () => {
    mockAllBC03Endpoints();
    render(<ReportBC03Tab />);

    await waitFor(() => {
      expect(screen.getByText("Nguyen Kieu Trang")).toBeInTheDocument();
    });
    expect(screen.getByText("Le Thi Lan Anh")).toBeInTheDocument();
  });

  it("shows three sub-tabs: Doanh thu & Order, Trial, Referral", async () => {
    mockAllBC03Endpoints();
    render(<ReportBC03Tab />);

    await waitFor(() => {
      expect(screen.getByText("Doanh thu & Order")).toBeInTheDocument();
    });
    expect(screen.getByText("Trial (L4)")).toBeInTheDocument();
    expect(screen.getByText("Referral (L1.2)")).toBeInTheDocument();
  });

  it("switches to Trial tab and shows trial data", async () => {
    mockAllBC03Endpoints();
    const user = userEvent.setup();
    render(<ReportBC03Tab />);

    await waitFor(() => {
      expect(screen.getByText("Trial (L4)")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Trial (L4)"));

    await waitFor(() => {
      expect(screen.getByText("Nguyen Kieu Trang")).toBeInTheDocument();
    });
  });

  it("switches to Referral tab and shows referral data", async () => {
    mockAllBC03Endpoints();
    const user = userEvent.setup();
    render(<ReportBC03Tab />);

    await waitFor(() => {
      expect(screen.getByText("Referral (L1.2)")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Referral (L1.2)"));

    await waitFor(() => {
      expect(screen.getByText("Le Thi Lan Anh")).toBeInTheDocument();
    });
  });

  it("shows filter mode toggle: Cả tháng / Theo ngày", async () => {
    mockAllBC03Endpoints();
    render(<ReportBC03Tab />);

    await waitFor(() => {
      expect(screen.getByText("Cả tháng")).toBeInTheDocument();
    });
    expect(screen.getByText("Theo ngày")).toBeInTheDocument();
  });

  it("has currency toggle (VND / RMB)", async () => {
    mockAllBC03Endpoints();
    render(<ReportBC03Tab />);

    await waitFor(() => {
      expect(screen.getByText("VND")).toBeInTheDocument();
    });
    expect(screen.getByText("RMB")).toBeInTheDocument();
  });

  it("has save button for KPI & exchange rate", async () => {
    mockAllBC03Endpoints();
    render(<ReportBC03Tab />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Lưu tỷ giá & KPI/ })).toBeInTheDocument();
    });
  });

  it("has refresh button", async () => {
    mockAllBC03Endpoints();
    render(<ReportBC03Tab />);

    await waitFor(() => {
      expect(screen.getByText("Làm mới")).toBeInTheDocument();
    });
  });

  it("shows error on bc03 API failure", async () => {
    server.use(
      http.get(`${BASE}/reports/bc03`, () =>
        new HttpResponse(null, { status: 500 }),
      ),
      http.get(`${BASE}/reports/bc03/staff`, () =>
        HttpResponse.json(makeStaffOptions()),
      ),
      http.get(`${BASE}/reports/bc03/monthly`, () =>
        HttpResponse.json(makeMonthlySettings()),
      ),
      http.get(`${BASE}/dashboard/live_summary`, () =>
        new HttpResponse(null, { status: 500 }),
      ),
    );
    render(<ReportBC03Tab />);

    await waitFor(() => {
      expect(screen.getByText(/Không tải được báo cáo BC03/)).toBeInTheDocument();
    });
  });

  it("shows empty state when no revenue rows and no KPI", async () => {
    mockAllBC03Endpoints({
      report: makeBc03Report({ revenue: [], trial: [], referral: [] }),
      monthly: { ...makeMonthlySettings(), kpi_rows: [] },
    });
    render(<ReportBC03Tab />);

    await waitFor(() => {
      expect(
        screen.getByText(/Chưa có dòng/)
      ).toBeInTheDocument();
    });
  });

  it("displays exchange rate input with default value", async () => {
    mockAllBC03Endpoints();
    render(<ReportBC03Tab />);

    await waitFor(() => {
      const input = screen.getByDisplayValue("3700");
      expect(input).toBeInTheDocument();
    });
  });

  it("displays team filter dropdown", async () => {
    mockAllBC03Endpoints();
    render(<ReportBC03Tab />);

    await waitFor(() => {
      expect(screen.getByText("Nguyen Kieu Trang")).toBeInTheDocument();
    });

    const select = screen.getByRole("combobox");
    expect(select).toBeInTheDocument();
  });

  it("shows saved meta (last saved time)", async () => {
    mockAllBC03Endpoints();
    render(<ReportBC03Tab />);

    await waitFor(() => {
      expect(screen.getByText(/Lưu lần cuối:/)).toBeInTheDocument();
    });
  });

  it("displays Tổng kỳ header section", async () => {
    mockAllBC03Endpoints();
    render(<ReportBC03Tab />);

    await waitFor(() => {
      expect(screen.getByText(/Tổng kỳ/i)).toBeInTheDocument();
    });
  });

  it("displays month picker input", async () => {
    mockAllBC03Endpoints();
    render(<ReportBC03Tab />);

    await waitFor(() => {
      const monthInput = screen.getByDisplayValue(currentMonthKey());
      expect(monthInput).toBeInTheDocument();
    });
  });

  it("shows staff picker section with Thêm button", async () => {
    mockAllBC03Endpoints();
    render(<ReportBC03Tab />);

    await waitFor(() => {
      expect(screen.getByText("Nguyen Kieu Trang")).toBeInTheDocument();
    });

    expect(screen.getByText(/\+ Thêm/)).toBeInTheDocument();
  });

  it("save button triggers PUT request", async () => {
    let putCalled = false;
    mockAllBC03Endpoints();
    server.use(
      http.put(`${BASE}/reports/bc03/monthly`, () => {
        putCalled = true;
        return HttpResponse.json(makeMonthlySettings());
      }),
    );

    const user = userEvent.setup();
    render(<ReportBC03Tab />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Lưu tỷ giá & KPI/ })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Lưu tỷ giá & KPI/ }));

    await waitFor(() => {
      expect(putCalled).toBe(true);
    });
  });

  it("revenue table has correct header columns", async () => {
    mockAllBC03Endpoints();
    render(<ReportBC03Tab />);

    await waitFor(() => {
      expect(screen.getByText("Team")).toBeInTheDocument();
    });
    expect(screen.getByText("Nhân sự")).toBeInTheDocument();
    expect(screen.getByText("GMV PKI")).toBeInTheDocument();
    expect(screen.getByText("% GMV")).toBeInTheDocument();
    expect(screen.getByText("Tổng DT")).toBeInTheDocument();
    expect(screen.getByText("Tổng đơn")).toBeInTheDocument();
  });

  it("shows Inhouse 1 team total row", async () => {
    mockAllBC03Endpoints();
    render(<ReportBC03Tab />);

    await waitFor(() => {
      expect(screen.getByText("Inhouse 1")).toBeInTheDocument();
    });
  });
});
