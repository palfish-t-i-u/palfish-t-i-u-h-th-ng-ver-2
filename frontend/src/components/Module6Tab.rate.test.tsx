/**
 * Guardrail for VAC-06 (Đạt) — fallback 3700 in Module6Tab.tsx:254.
 * Run: cd frontend && npm run test -- Module6Tab.rate
 * Expected: FAIL on current code (?? 3700 hard-code), PASS after Đạt reads from API.
 */

import { render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import Module6Tab from "./Module6Tab";
import { server } from "../test/msw/server";

// ---------------------------------------------------------------------------
// Supabase stub — prevents real Supabase calls from useRealtimeTable + api.ts
// ---------------------------------------------------------------------------
vi.mock("../lib/supabase", () => ({
  supabase: {
    channel: () => ({
      on: function () { return this; },
      subscribe: () => {},
    }),
    removeChannel: () => {},
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  },
}));

// ---------------------------------------------------------------------------
// useTeamScope stub — Module6Tab uses this hook which requires MeProvider +
// AuthProvider context. Mocking it directly avoids setting up the full auth
// provider tree in a unit test.
// ---------------------------------------------------------------------------
vi.mock("../hooks/useTeamScope", () => ({
  useTeamScope: () => ({
    teamFilters: [{ value: "", label: "Toàn công ty" }],
    defaultTeam: "",
    isRestricted: false,
  }),
}));

// ---------------------------------------------------------------------------
// Recharts stub — avoids ResizeObserver / SVG rendering issues in jsdom
// ---------------------------------------------------------------------------
vi.mock("recharts", () => {
  const React = require("react");
  const passThrough = ({ children }: { children?: React.ReactNode }) =>
    React.createElement("div", null, children);
  return {
    LineChart: passThrough,
    BarChart: passThrough,
    Line: () => null,
    Bar: () => null,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
    ResponsiveContainer: passThrough,
    Cell: () => null,
  };
});

const BASE = "http://localhost:8000";

// ---------------------------------------------------------------------------
// Minimal DashboardLiveSummary payload that deliberately omits exchange_rate
// from both meta and kpi, so the component must read from /api/v1/exchange-rates
// to get the correct rate instead of falling back to the hard-coded 3700.
// ---------------------------------------------------------------------------
const LIVE_SUMMARY_NO_RATE = {
  period: { start: "2026-06-01", end: "2026-06-30" },
  meta: {
    crm_gmv_currency: "RMB" as const,
    collected_currency: "VND" as const,
    // exchange_rate intentionally absent — forces fallback chain
    kpi_source: "palfish_live" as const,
    source: "hybrid",
    department_fallback: false,
  },
  kpi: {
    total_orders: 10,
    total_gmv_rmb: 5000,
    total_collected_vnd: 18_500_000,
    total_collected: 18_500_000,
    aov: 1_850_000,
    // exchange_rate intentionally absent — forces fallback chain
    l1: 50, l3: 30, l4: 20, l8: 10,
  },
  top_sales: [
    {
      sale_name: "Nguyen Van A",
      orders: 5,
      gmv_rmb: 2500,
      total_amount: 2500,
      collected: 9_250_000,
    },
  ],
  conversion: [
    { label: "L3/L1", value: 60 },
    { label: "L4/L3", value: 66.7 },
    { label: "L8/L4", value: 50 },
  ],
  today: {
    orders: 2,
    gmv_rmb: 1000,
    collected_vnd: 3_700_000,
    is_calendar_today: true,
  },
  row_count: 1,
};

const DAILY_TRENDS_EMPTY = {
  period: { start: "2026-06-01", end: "2026-06-30" },
  row_count: 0,
  revenue_by_date: [],
  meta: { source: "db", sync_days: 0 },
};

const FILTERS_RESPONSE = {
  teams: ["Team A", "Team B"],
  sales: ["Nguyen Van A"],
  departments: [],
};

// The exchange-rates API returns rate 3800 — this is what Đạt's fix should consume.
const EXCHANGE_RATES_RESPONSE = {
  rates: [
    {
      effective_from: "2026-01-01",
      rate: 3800,
      note: "Tháng 1/2026",
      created_at: "2026-01-01T00:00:00Z",
      created_by: "admin@palfish.vn",
    },
  ],
};

function registerAllHandlers() {
  server.use(
    http.get(`${BASE}/dashboard/filters`, () =>
      HttpResponse.json(FILTERS_RESPONSE)
    ),
    http.get(`${BASE}/dashboard/live_summary`, () =>
      HttpResponse.json(LIVE_SUMMARY_NO_RATE)
    ),
    http.get(`${BASE}/dashboard/daily_trends`, () =>
      HttpResponse.json(DAILY_TRENDS_EMPTY)
    ),
    http.get(`${BASE}/api/v1/exchange-rates`, () =>
      HttpResponse.json(EXCHANGE_RATES_RESPONSE)
    ),
  );
}

describe("Module6Tab — exchange rate guardrail (VAC-06)", () => {
  it("uses rate 3800 from /api/v1/exchange-rates instead of hard-coded 3700", async () => {
    registerAllHandlers();
    render(<Module6Tab />);

    // Wait for the async load to complete and the info bar to appear.
    // The info bar (Module6Tab.tsx:356) renders: "Tỷ giá: 1 RMB = {fmt(fx)} ₫"
    // fmt() uses Intl.NumberFormat("vi-VN") → 3800 → "3.800", 3700 → "3.700"
    await waitFor(
      () => {
        // The info bar only renders when (live || trends) && !loading.
        // After load completes, live summary is set and the bar appears.
        expect(
          screen.getByText(/Tỷ giá: 1 RMB =/)
        ).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    // CORE ASSERTION: the rate shown must come from the API (3.800), NOT the fallback (3.700).
    // On current code (no API call, ?? 3700 fallback), this assertion will FAIL.
    // After Đạt's fix (reads from /api/v1/exchange-rates), this assertion will PASS.
    const infoBar = screen.getByText(/Tỷ giá: 1 RMB =/);
    expect(infoBar.textContent).toContain("3.800");

    // Negative assertion: the fallback literal must not appear as the displayed rate.
    expect(infoBar.textContent).not.toContain("3.700");
  });
});
