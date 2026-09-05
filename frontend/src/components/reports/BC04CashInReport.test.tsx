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
    summary: {
      total_input: 5_000_000, total_rmb: 1351.35, opening_balance: 9_579_473_038, closing_balance: 9_584_473_038,
      rate: 3700, unsynced_settlement_count: 1, unsynced_settlement_amount: 38_143_740,
    },
    days: [{ date: "2026-01-01", total_input: 5_000_000, total_rmb: 1351.35, ending_balance: 9_584_473_038 }],
    rows: [
      {
        // CK thường (không PC) → is_split=true theo công thức BE `not bool(pc)`, không hiện badge.
        source: "bank", txn_id: "t1", date: "2026-01-01", details: "用户付款", output: 0, input: 1_000_000,
        balance: 9_580_473_038, income: 1_000_000, expenditure: 0, business_line: "Giáo dục / 教育",
        team: "In-house 2", note: null, rmb: 270.27, data_source: "HN BANK", group: "khach_tra",
        main_cat: null, detail: null, is_split: true, unmatched: false,
      },
      {
        source: "bank", txn_id: "t2", date: "2026-01-01", details: "TK TikTok rút về", output: 0, input: 4_000_000,
        balance: 9_584_473_038, income: 4_000_000, expenditure: 0, business_line: "",
        team: null, note: null, rmb: 1081.08, data_source: "HN BANK", group: "rut_tiktok",
        main_cat: null, detail: null, is_split: true, unmatched: false,
      },
      {
        // Đã tách từ gateway nhưng chưa khớp payment_line → unmatched=true, Team trống.
        source: "gateway", txn_id: "t3", date: "2026-01-01", details: "Quẹt thẻ", output: 0, input: 15_697_500,
        balance: 9_600_171_240, income: 15_697_500, expenditure: 0, business_line: "Giáo dục / 教育",
        team: null, note: null, rmb: 4242.57, data_source: "mPOS", group: "the",
        main_cat: null, detail: null, is_split: true, unmatched: true,
      },
      {
        // Cục phiếu chi còn nguyên vì chưa đồng bộ → is_split=false, hiện badge.
        source: "bank", txn_id: "t4", date: "2026-01-01", details: "Quẹt thẻ (chưa tách)", output: 0, input: 38_143_740,
        balance: 9_638_314_980, income: 38_143_740, expenditure: 0, business_line: "Giáo dục / 教育",
        team: null, note: null, rmb: 10309.12, data_source: "HN BANK", group: "the_gop",
        main_cat: null, detail: null, is_split: false, unmatched: false,
      },
    ],
  };
}

afterEach(() => server.resetHandlers());

describe("BC04CashInReport", () => {
  it("tải và hiện đúng dòng + tổng thu vào/RMB/số dư", async () => {
    server.use(
      http.get(`${BASE}/reports/cash-in`, () => HttpResponse.json(_rawReport()))
    );

    render(<BC04CashInReport />);

    await waitFor(() => expect(screen.getByText(/Thu vào: 5\.000\.000 đ/)).toBeInTheDocument());
    expect(screen.getByText(/Thu RMB: ¥1,351\.35/)).toBeInTheDocument();
    expect(screen.getByText(/Số dư cuối kỳ: 9\.584\.473\.038 đ/)).toBeInTheDocument();
    expect(screen.getByText("Khách trả")).toBeInTheDocument();
    expect(screen.getByText("Rút TikTok")).toBeInTheDocument();
  });

  it("chọn phân loại cho dòng lạ (rut_tiktok) gọi đúng PUT annotation", async () => {
    server.use(
      http.get(`${BASE}/reports/cash-in`, () => HttpResponse.json(_rawReport()))
    );

    let putBody: unknown = null;
    let putUrl = "";
    server.use(
      http.put(`${BASE}/reports/cash-in/:source/:txnId/annotation`, async ({ request, params }) => {
        putUrl = `${params.source}/${params.txnId}`;
        putBody = await request.json();
        return HttpResponse.json({ ok: true });
      })
    );

    render(<BC04CashInReport />);
    await waitFor(() => expect(screen.getByText("Rút TikTok")).toBeInTheDocument());

    const row = screen.getByText("Rút TikTok").closest("tr");
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

  it("hiện badge 'Cục — chưa đồng bộ' cho dòng is_split=false, KHÔNG hiện cho dòng đã tách", async () => {
    server.use(
      http.get(`${BASE}/reports/cash-in`, () => HttpResponse.json(_rawReport()))
    );

    render(<BC04CashInReport />);
    // t4: group="the_gop" → badge nhóm "Trả góp"
    await waitFor(() => expect(screen.getByText("Trả góp")).toBeInTheDocument());

    // t4 (is_split=false) có badge cảnh báo
    const unsyncedRow = screen.getByText("Trả góp").closest("tr");
    expect(within(unsyncedRow as HTMLElement).getByText("Cục — chưa đồng bộ")).toBeInTheDocument();

    // t1 (group="khach_tra" → badge "Khách trả", is_split=true) KHÔNG có badge đó
    const normalRow = screen.getByText("Khách trả").closest("tr");
    expect(within(normalRow as HTMLElement).queryByText("Cục — chưa đồng bộ")).not.toBeInTheDocument();
  });

  it("hiện 'Chưa khớp đơn' ở cột Đội cho dòng unmatched=true, không lẫn với dòng trống Team hợp lệ", async () => {
    server.use(
      http.get(`${BASE}/reports/cash-in`, () => HttpResponse.json(_rawReport()))
    );

    render(<BC04CashInReport />);
    // t3: group="the" → badge nhóm "Quẹt thẻ"
    await waitFor(() => expect(screen.getByText("Quẹt thẻ")).toBeInTheDocument());

    // t3 (gateway, unmatched=true, team=null) → "Chưa khớp đơn"
    const unmatchedRow = screen.getByText("Quẹt thẻ").closest("tr");
    expect(within(unmatchedRow as HTMLElement).getByText("Chưa khớp đơn")).toBeInTheDocument();

    // t2 (rut_tiktok, unmatched=false, team=null) → "—", không phải "Chưa khớp đơn"
    const tiktokRow = screen.getByText("Rút TikTok").closest("tr");
    expect(within(tiktokRow as HTMLElement).getByText("—")).toBeInTheDocument();
    expect(within(tiktokRow as HTMLElement).queryByText("Chưa khớp đơn")).not.toBeInTheDocument();
  });

  it("hiện dòng cảnh báo tổng phiếu chi chưa đồng bộ khi unsyncedSettlementCount > 0", async () => {
    server.use(
      http.get(`${BASE}/reports/cash-in`, () => HttpResponse.json(_rawReport()))
    );

    render(<BC04CashInReport />);
    // Nội dung chia thành nhiều text node lồng <strong> — query theo textContent
    // của cả banner thay vì getByText (chỉ khớp trong 1 node).
    await waitFor(() => {
      const banner = document.querySelector(".ring-amber-800");
      expect(banner).toBeTruthy();
      expect(banner?.textContent).toMatch(/Còn 1 phiếu chi/);
      expect(banner?.textContent).toMatch(/38\.143\.740 đ/);
      expect(banner?.textContent).toMatch(/nhắc sale chạy Đồng bộ mPOS\/Payoo/);
    });
  });

  it("KHÔNG hiện dòng cảnh báo khi unsyncedSettlementCount = 0", async () => {
    const report = _rawReport();
    report.summary.unsynced_settlement_count = 0;
    report.summary.unsynced_settlement_amount = 0;
    server.use(
      http.get(`${BASE}/reports/cash-in`, () => HttpResponse.json(report))
    );

    render(<BC04CashInReport />);
    await waitFor(() => expect(screen.getByText("Khách trả")).toBeInTheDocument());
    expect(document.querySelector(".ring-amber-800")).toBeNull();
  });

  it("báo lỗi khi BE trả lỗi, không crash trang", async () => {
    server.use(
      http.get(`${BASE}/reports/cash-in`, () => HttpResponse.json({ detail: "Lỗi BC04" }, { status: 500 }))
    );

    render(<BC04CashInReport />);
    await waitFor(() => expect(screen.getByText("Lỗi BC04")).toBeInTheDocument());
  });
});
