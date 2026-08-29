/**
 * Xuất BC04 "Dòng tiền về" — clone đúng layout sheet `HN BANK 26` (file mẫu chị Vân
 * `越南教育管报 2026.xlsx`). Xem docs/plans/PLAN_BC04_DONG_TIEN_VE_2026-08-27.md §8.
 *
 * B1 = tỷ giá; header dòng 2 song ngữ (copy nguyên văn từ file mẫu, kể cả khoảng
 * trắng trong "Date "); 12 cột A–L; cột E (Balance) đã cộng dồn từ BE, dùng thẳng.
 */
import * as XLSX from "xlsx";
import type { CashInReport } from "../types/cashIn";

const HEADER_ROW = [
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
];

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function buildCashInSheet(report: CashInReport): XLSX.WorkSheet {
  const rateRow = ["汇率", report.summary.rate];
  const dataRows = report.rows.map((r) => [
    r.date.slice(0, 10),
    r.details,
    r.output,
    r.input,
    r.balance,
    r.income,
    r.expenditure,
    r.businessLine,
    r.team ?? "",
    r.note ?? "",
    Number(r.rmb.toFixed(2)),
    r.dataSource,
  ]);

  const ws = XLSX.utils.aoa_to_sheet([rateRow, HEADER_ROW, ...dataRows]);
  ws["!cols"] = [
    { wch: 11 }, { wch: 22 }, { wch: 11 }, { wch: 12 }, { wch: 14 },
    { wch: 11 }, { wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 20 }, { wch: 10 }, { wch: 10 },
  ];
  return ws;
}

export function downloadCashInXlsx(report: CashInReport, range: { from: string; to: string }) {
  if (report.rows.length === 0) return;
  const ws = buildCashInSheet(report);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "HN BANK 26");
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  const blob = new Blob([buf], { type: "application/octet-stream" });
  downloadBlob(blob, `BC04_dong_tien_ve_${range.from}_${range.to}.xlsx`);
}
