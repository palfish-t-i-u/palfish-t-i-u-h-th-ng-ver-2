import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { buildCashInSheet } from "./cashInXlsxExport";
import type { CashInReport } from "../types/cashIn";

function _sheetToAoa(ws: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as unknown[][];
}

function _sampleReport(): CashInReport {
  return {
    summary: {
      totalInput: 5_000_000, totalRmb: 1351.35, openingBalance: 9_579_473_038, closingBalance: 9_584_473_038,
      rate: 3700, unsyncedSettlementCount: 0, unsyncedSettlementAmount: 0,
    },
    days: [{ date: "2026-01-01", totalInput: 5_000_000, totalRmb: 1351.35, endingBalance: 9_584_473_038 }],
    rows: [
      {
        source: "bank", txnId: "t1", date: "2026-01-01", details: "用户付款", output: 0, input: 1_000_000,
        balance: 9_580_473_038, income: 1_000_000, expenditure: 0, businessLine: "Giáo dục / 教育",
        team: "In-house 2", note: null, rmb: 270.27, dataSource: "HN BANK", group: "khach_tra", mainCat: null, detail: null,
        isSplit: true, unmatched: false,
      },
      {
        source: "gateway", txnId: "t2", date: "2026-01-01", details: "Quẹt thẻ", output: 0, input: 4_000_000,
        balance: 9_584_473_038, income: 4_000_000, expenditure: 0, businessLine: "Giáo dục / 教育",
        team: "In-house 1", note: "PC 79492392", rmb: 1081.08, dataSource: "mPOS", group: "the", mainCat: null, detail: null,
        isSplit: true, unmatched: false,
      },
    ],
  };
}

describe("buildCashInSheet — clone layout HN BANK 26", () => {
  it("dòng 1 = 汇率 (rate label) + tỷ giá ở B1", () => {
    const ws = buildCashInSheet(_sampleReport());
    const aoa = _sheetToAoa(ws);
    expect(aoa[0].slice(0, 2)).toEqual(["汇率", 3700]);
  });

  it("dòng 2 = header song ngữ đúng y file mẫu (12 cột A-L)", () => {
    const ws = buildCashInSheet(_sampleReport());
    const aoa = _sheetToAoa(ws);
    expect(aoa[1].slice(0, 12)).toEqual([
      "Date ",
      "Details Description",
      "Output (VND)",
      "Input (VND)",
      "Balance",
      "income",
      "expenditure",
      "管报-业务线\nMR - Business Line",
      "团队\nTeam",
      "备注、说明",
      "收\nRMB",
      "数据表源",
    ]);
  });

  it("dữ liệu bắt đầu dòng 3, Output luôn 0, Balance/RMB lấy thẳng từ BE (không tính lại)", () => {
    const ws = buildCashInSheet(_sampleReport());
    const aoa = _sheetToAoa(ws);
    const row1 = aoa[2];
    expect(row1[2]).toBe(0); // Output
    expect(row1[3]).toBe(1_000_000); // Input
    expect(row1[4]).toBe(9_580_473_038); // Balance cộng dồn
    expect(row1[10]).toBe(270.27); // RMB
    expect(row1[11]).toBe("HN BANK"); // Nguồn dữ liệu

    const row2 = aoa[3];
    expect(row2[4]).toBe(9_584_473_038); // Balance dòng 2 tiếp tục cộng dồn
    expect(row2[11]).toBe("mPOS");
  });

  it("income = input, expenditure = output cho mọi dòng", () => {
    const ws = buildCashInSheet(_sampleReport());
    const aoa = _sheetToAoa(ws);
    for (const row of aoa.slice(2)) {
      expect(row[5]).toBe(row[3]); // income === input
      expect(row[6]).toBe(row[2]); // expenditure === output
    }
  });

  it("F7 — không gộp lại các dòng đã tách cùng phiếu chi, xuất đủ từng dòng riêng (ca vàng PC 79523736)", () => {
    // 2 dòng gateway thật cùng settlement_code, đã tách per-đơn từ 1 cục bank —
    // export không được gộp lại theo PC, phải giữ nguyên 2 dòng riêng biệt.
    const report: CashInReport = {
      summary: {
        totalInput: 38_143_740, totalRmb: 10309.12, openingBalance: 0, closingBalance: 38_143_740,
        rate: 3700, unsyncedSettlementCount: 0, unsyncedSettlementAmount: 0,
      },
      days: [{ date: "2026-09-03", totalInput: 38_143_740, totalRmb: 10309.12, endingBalance: 38_143_740 }],
      rows: [
        {
          source: "gateway", txnId: "g1", date: "2026-09-03", details: "Quẹt thẻ", output: 0, input: 15_697_500,
          balance: 15_697_500, income: 15_697_500, expenditure: 0, businessLine: "Giáo dục / 教育",
          team: null, note: null, rmb: 4242.57, dataSource: "mPOS", group: "the", mainCat: null, detail: null,
          isSplit: true, unmatched: true,
        },
        {
          source: "gateway", txnId: "g2", date: "2026-09-03", details: "Trả góp", output: 0, input: 22_446_240,
          balance: 38_143_740, income: 22_446_240, expenditure: 0, businessLine: "Giáo dục / 教育",
          team: null, note: null, rmb: 6066.55, dataSource: "mPOS", group: "the_gop", mainCat: null, detail: null,
          isSplit: true, unmatched: true,
        },
      ],
    };

    const ws = buildCashInSheet(report);
    const aoa = _sheetToAoa(ws);
    const dataRows = aoa.slice(2);

    expect(dataRows).toHaveLength(2);
    expect(dataRows[0][3]).toBe(15_697_500);
    expect(dataRows[1][3]).toBe(22_446_240);
    // Không có dòng cục gộp 38.143.740 nào lẫn vào — chỉ 2 dòng tách + tổng input khớp
    const totalInput = dataRows.reduce((sum, r) => sum + (r[3] as number), 0);
    expect(totalInput).toBe(38_143_740);
    expect(dataRows.some((r) => r[3] === 38_143_740)).toBe(false);
  });
});
