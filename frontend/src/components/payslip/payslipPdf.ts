import type { PayslipDetail } from "../../types/payroll";
import { normalizePhieu, stageLabel, buildRows } from "./payslipFormat";

// Cache base64 font trong module — fetch 1 lần / session; file tĩnh có browser cache.
let fontB64: string | null = null;

async function loadFontB64(): Promise<string> {
  if (fontB64) return fontB64;
  const res = await fetch("/fonts/Roboto-Regular.ttf");
  if (!res.ok) throw new Error(`Font HTTP ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  fontB64 = btoa(bin);
  return fontB64;
}

const PAGE_CENTER_X = 297.6; // A4 width 595.28pt / 2

export async function downloadPayslipPdf(item: PayslipDetail): Promise<void> {
  const [{ jsPDF }, { default: autoTable }, font] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
    loadFontB64(),
  ]);

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  // CHỈ có Roboto "normal" — cấm mọi fontStyle "bold"/"italic"
  // (bold sẽ fallback Helvetica → MẤT DẤU tiếng Việt).
  doc.addFileToVFS("Roboto-Regular.ttf", font);
  doc.addFont("Roboto-Regular.ttf", "Roboto", "normal");
  doc.setFont("Roboto", "normal");

  const normalized = normalizePhieu(item.phieu);
  const name = String(normalized["Name"] ?? item.name ?? item.code);
  const chucDanh = typeof normalized["Chức danh"] === "string" ? String(normalized["Chức danh"]) : "";

  doc.setFontSize(14);
  doc.text(`PHIẾU LƯƠNG — ${stageLabel(item.stage).toUpperCase()}`, PAGE_CENTER_X, 48, { align: "center" });
  doc.setFontSize(10);
  doc.setTextColor(85, 85, 85);
  const sub = [name, chucDanh, `Mã NV: ${item.code}`, `Kỳ: ${item.ky_luong}`].filter(Boolean).join("  ·  ");
  doc.text(sub, PAGE_CENTER_X, 66, { align: "center" });

  const rows = buildRows(item.phieu);
  const headerIdx = new Set(rows.map((r, i) => (r.isBlockHeader ? i : -1)).filter((i) => i >= 0));

  autoTable(doc, {
    startY: 84,
    margin: { left: 48, right: 48 },
    theme: "plain",
    styles: {
      font: "Roboto",
      fontStyle: "normal",
      fontSize: 10,
      textColor: [17, 17, 17] as [number, number, number],
      cellPadding: { top: 4, bottom: 4, left: 8, right: 8 },
    },
    columnStyles: { 1: { halign: "right" } },
    body: rows.map((r) => (r.isBlockHeader ? [{ content: r.label, colSpan: 2 }] : [r.label, r.value])),
    didParseCell: (data) => {
      if (headerIdx.has(data.row.index)) {
        data.cell.styles.fillColor = [238, 240, 248] as [number, number, number];
        data.cell.styles.fontSize = 10.5;
      }
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finalY = (doc as any).lastAutoTable?.finalY ?? 720;
  doc.setFontSize(8.5);
  doc.setTextColor(136, 136, 136);
  doc.text("Nếu có thắc mắc, vui lòng liên hệ Phòng Nhân sự", PAGE_CENTER_X, finalY + 26, { align: "center" });
  doc.text("Ms. Thu Trang — 0988.934.163 · palfishrecruitment@gmail.com", PAGE_CENTER_X, finalY + 40, { align: "center" });

  doc.save(`PhieuLuong_${item.code}_${item.ky_luong}_${item.stage}.pdf`);
}
