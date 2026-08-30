import { describe, expect, it } from "vitest";
import { mapCashInReport, type CashInReportRaw } from "./cashIn";

function _rawSample(): CashInReportRaw {
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
    ],
  };
}

describe("mapCashInReport — snake_case (BE) → camelCase (FE)", () => {
  it("map summary đúng field", () => {
    const out = mapCashInReport(_rawSample());
    expect(out.summary).toEqual({
      totalInput: 5_000_000, totalRmb: 1351.35, openingBalance: 9_579_473_038, closingBalance: 9_584_473_038, rate: 3700,
    });
  });

  it("map days đúng field", () => {
    const out = mapCashInReport(_rawSample());
    expect(out.days).toEqual([{ date: "2026-01-01", totalInput: 5_000_000, totalRmb: 1351.35, endingBalance: 9_584_473_038 }]);
  });

  it("map rows giữ nguyên txn_id → txnId, business_line → businessLine, không mất field nào", () => {
    const out = mapCashInReport(_rawSample());
    expect(out.rows[0]).toEqual({
      source: "bank", txnId: "t1", date: "2026-01-01", details: "用户付款", output: 0, input: 1_000_000,
      balance: 9_580_473_038, income: 1_000_000, expenditure: 0, businessLine: "Giáo dục / 教育",
      team: "In-house 2", note: null, rmb: 270.27, dataSource: "HN BANK", group: "khach_tra",
      mainCat: null, detail: null,
    });
  });
});
