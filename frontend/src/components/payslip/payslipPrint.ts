import type { PayslipDetail } from "../../types/payroll";
import { PAYSLIP_BLOCKS, normalizePhieu, formatValue, matchesBlockKey, stageLabel } from "./PayslipDetail";

export function printPayslip(item: PayslipDetail): void {
  const normalized = normalizePhieu(item.phieu);

  let rowsHtml = "";
  for (const block of PAYSLIP_BLOCKS) {
    const rows: string[] = [];
    for (const blockKey of block.keys) {
      for (const dk of Object.keys(normalized)) {
        if (matchesBlockKey(dk, blockKey) && normalized[dk] !== "" && normalized[dk] !== null) {
          rows.push(dk);
        }
      }
    }
    if (rows.length === 0) continue;
    rowsHtml += `<tr class="bh"><td colspan="2">${block.title}</td></tr>`;
    for (const dk of rows) {
      rowsHtml += `<tr><td>${dk}</td><td class="v">${formatValue(normalized[dk], dk)}</td></tr>`;
    }
  }

  const name = String(normalized["Name"] ?? item.name ?? item.code);
  const chucDanh = typeof normalized["Chức danh"] === "string" ? ` · ${normalized["Chức danh"]}` : "";
  const stageLbl = stageLabel(item.stage).toUpperCase();

  const html = `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8">
<title>Phiếu lương ${item.ky_luong} — ${name}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Arial,sans-serif;font-size:13px;color:#111;padding:28px 32px}
h2{font-size:15px;font-weight:700;text-align:center;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px}
.sub{text-align:center;color:#555;font-size:12px;margin-bottom:18px}
table{width:100%;border-collapse:collapse}
tr.bh td{background:#eef0f8;font-weight:600;font-size:11.5px;padding:5px 8px;border-top:1px solid #ccd}
td{padding:4px 8px;border-bottom:1px solid #eee;font-size:12.5px}
td.v{text-align:right;font-weight:500}
.footer{margin-top:18px;text-align:center;font-size:11px;color:#888;line-height:1.6}
@media print{body{padding:16px 20px}button{display:none}}
</style></head><body>
<h2>Phiếu lương — ${stageLbl}</h2>
<p class="sub">${name}${chucDanh} · Mã NV: ${item.code} · Kỳ: ${item.ky_luong}</p>
<table>${rowsHtml}</table>
<p class="footer">Nếu có thắc mắc, liên hệ Phòng Nhân sự<br>
Ms. Thu Trang — 0988.934.163 · palfishrecruitment@gmail.com</p>
</body></html>`;

  const win = window.open("", "_blank", "width=620,height=820");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 400);
}
