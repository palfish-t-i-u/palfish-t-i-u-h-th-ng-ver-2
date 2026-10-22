/**
 * Xuất CSV dữ liệu thô Feedback lead. Client-side: nhận items đã lấy từ
 * endpoint list (RBAC đã áp ở BE) rồi ghép CSV + tải về.
 *
 * - BOM UTF-8 (U+FEFF) để Excel mở đúng tiếng Việt.
 * - Escape chuẩn RFC4180: bọc ngoặc kép khi ô chứa , " hoặc xuống dòng;
 *   nhân đôi ngoặc kép bên trong. sale_note/mkt_note có cả dấu phẩy lẫn \n.
 */
import type { LeadFeedback } from "../../types/leadFeedback";
import { findSourceByKey } from "../../constants/leadSource";

/** BOM UTF-8 — tạo từ code point để source không chứa ký tự vô hình. */
const UTF8_BOM = String.fromCharCode(0xfeff);

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function statusLabel(s: string): string {
  if (s === "done") return "MKT đã feedback";
  if (s === "wait") return "Chờ MKT feedback";
  return s || "";
}

function imagesUrls(imgs: { url: string }[] | null | undefined): string {
  return (imgs || []).map((i) => i?.url || "").filter(Boolean).join(" | ");
}

/** Bọc ngoặc kép khi cần (RFC4180). Giá trị null/undefined → ô rỗng. */
function csvCell(v: string | null | undefined): string {
  const s = v == null ? "" : String(v);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

const COLUMNS: Array<[string, (r: LeadFeedback) => string]> = [
  ["Ngày tạo", (r) => fmtDateTime(r.created_at)],
  ["Người điền (Sale)", (r) => r.sale_name || r.sale_email],
  ["Email sale", (r) => r.sale_email],
  ["Khách", (r) => r.customer_name ?? ""],
  ["SĐT", (r) => r.phone ?? ""],
  ["UID", (r) => r.uid ?? ""],
  ["Nguồn", (r) => findSourceByKey(r.lead_source)?.label ?? r.lead_source ?? ""],
  ["Kênh", (r) => r.lead_channel ?? ""],
  ["Lead ID", (r) => r.lead_id ?? ""],
  ["Ghi chú của Sale", (r) => r.sale_note ?? ""],
  ["Trạng thái", (r) => statusLabel(r.status)],
  ["Nhận xét Marketing", (r) => r.mkt_note ?? ""],
  ["MKT nhận xét bởi", (r) => r.mkt_by ?? ""],
  ["MKT nhận xét lúc", (r) => fmtDateTime(r.mkt_at)],
  ["Ảnh Sale (URL)", (r) => imagesUrls(r.sale_images)],
  ["Ảnh MKT (URL)", (r) => imagesUrls(r.mkt_images)],
  ["ID bản ghi", (r) => r.id],
];

/** Ghép toàn bộ items thành 1 chuỗi CSV (kèm BOM UTF-8 ở đầu). */
export function buildFeedbackCsv(items: LeadFeedback[]): string {
  const header = COLUMNS.map(([h]) => csvCell(h)).join(",");
  const rows = items.map((r) => COLUMNS.map(([, fn]) => csvCell(fn(r))).join(","));
  return UTF8_BOM + [header, ...rows].join("\r\n");
}

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

/** Build CSV + tải về. */
export function downloadFeedbackCsv(items: LeadFeedback[], filename: string): void {
  const csv = buildFeedbackCsv(items);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  downloadBlob(blob, filename);
}
