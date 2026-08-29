import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import BC04CashInReport from "./BC04CashInReport";
import { server } from "../../test/msw/server";
import type { CashInReportRaw } from "../../types/cashIn";

const BASE = "http://localhost:8000";

vi.mock("../../hooks/useTeamScope", () => ({
  useTeamScope: () => ({
    teamFilters: [{ value: "", label: "Tất cả teams" }],
    defaultTeam: "",
    isRestricted: false,
  }),
}));

vi.mock("../../hooks/useIsMobile", () => ({
  default: () => false,
}));

function _rawReport(): CashInReportRaw {
  return {
    summary: { total_input: 5_000_000, total_rmb: 1351.35, opening_balance: 9_579_473_038, closing_balance: 9_584_473_038, rate: 3700 },
    days: [{ date: "2026-01-01", total_input: 5_000_000, total_rmb: 1351.35, ending_balance: 9_584_473_038 }],
    rows: [
      {
        source: "bank", txn_id: "t1", date: "2026-01-01", details: "用户付款", output: 0, input: 1_000_000,
        balance: 9_580_473_038, income: 1_000_000, expenditure: 0, business_line: "Giáo dục / 教育",
        team: "In-house 2", note: null, rmb: 270.27, data_source: "HN BANK", group: "khach_tra",
        main_cat: null, detail: null,
      },
      {
        source: "bank", txn_id: "t2", date: "2026-01-01", details: "TK TikTok rút về", output: 0, input: 4_000_000,
        balance: 9_584_473_038, income: 4_000_000, expenditure: 0, business_line: "",
        team: null, note: null, rmb: 1081.08, data_source: "HN BANK", group: "rut_tiktok",
        main_cat: null, detail: null,
      },
    ],
  };
}

afterEach(() => server.resetHandlers());

describe("BC04CashInReport", () => {
  it("tải và hiện đúng dòng + tổng thu vào/RMB/số dư", async () => {
    server.use(
      http.get(`${BASE}/api/v1/reports/cash-in`, () => HttpResponse.json(_rawReport()))
    );

    render(<BC04CashInReport />);

    await waitFor(() => expect(screen.getByText(/Thu vào: 5\.000\.000 đ/)).toBeInTheDocument());
    expect(screen.getByText(/Thu RMB: ¥1,351\.35/)).toBeInTheDocument();
    expect(screen.getByText(/Số dư cuối kỳ: 9\.584\.473\.038 đ/)).toBeInTheDocument();
    expect(screen.getByText("用户付款")).toBeInTheDocument();
    expect(screen.getByText("TK TikTok rút về")).toBeInTheDocument();
  });

  it("chọn phân loại cho dòng lạ (rut_tiktok) gọi đúng PUT annotation", async () => {
    server.use(
      http.get(`${BASE}/api/v1/reports/cash-in`, () => HttpResponse.json(_rawReport()))
    );

    let putBody: unknown = null;
    let putUrl = "";
    server.use(
      http.put(`${BASE}/api/v1/reports/cash-in/:source/:txnId/annotation`, async ({ request, params }) => {
        putUrl = `${params.source}/${params.txnId}`;
        putBody = await request.json();
        return HttpResponse.json({ ok: true });
      })
    );

    render(<BC04CashInReport />);
    await waitFor(() => expect(screen.getByText("TK TikTok rút về")).toBeInTheDocument());

    const row = screen.getByText("TK TikTok rút về").closest("tr");
    expect(row).not.toBeNull();
    const select = within(row as HTMLElement).getByRole("combobox");

    await userEvent.selectOptions(select, "Lãi tiền gửi / 利息收入");

    await waitFor(() => expect(putUrl).toBe("bank/t2"));
    expect(putBody).toMatchObject({
      business_line: "Giáo dục / 教育",
      main_cat: "Lãi tiền gửi / 利息收入",
      detail: "Lãi tiền gửi / 利息收入",
    });
  });

  it("báo lỗi khi BE trả lỗi, không crash trang", async () => {
    server.use(
      http.get(`${BASE}/api/v1/reports/cash-in`, () => HttpResponse.json({ detail: "Lỗi BC04" }, { status: 500 }))
    );

    render(<BC04CashInReport />);
    await waitFor(() => expect(screen.getByText("Lỗi BC04")).toBeInTheDocument());
  });
});
