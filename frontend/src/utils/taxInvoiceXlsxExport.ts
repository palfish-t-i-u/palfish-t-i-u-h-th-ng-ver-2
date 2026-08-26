/**
 * Xuất 3 file Excel kê khai thuế — adapt từ backend/invoice_routes.py (_build_excel_*).
 * FE tạm cấp mã M.../PF... theo batch; BE sau này nên persist qua POST /invoice/export-batch B4.
 */
import JSZip from "jszip";
import * as XLSX from "xlsx";
import type { InvoiceRow } from "../components/payment-flow/paymentFlowUtils";

export type TaxExportOrder = {
  taxInvoiceCode: string;
  taxProductCode: string;
  taxProductName: string;
  sdt: string;
  tenKhach: string;
  tongTien: number;
  invDate: string;
  email?: string;
  /** Thuế NĐ 70/2025: CCCD/hộ chiếu (cá nhân) hoặc MST + tên đơn vị (doanh nghiệp) */
  soCccd?: string;
  maSoThue?: string;
  tenDonVi?: string;
};

function fmtSdt(raw: string): string {
  const digits = (raw || "").replace(/\D/g, "");
  if (digits.startsWith("84") && digits.length === 11) return `84-${digits.slice(2)}`;
  if (digits.startsWith("0") && digits.length === 10) return `84-${digits.slice(1)}`;
  if (digits.length === 9) return `84-${digits}`;
  return raw || "";
}

function parseInvDate(raw?: string | null): string {
  if (!raw) return new Date().toISOString().slice(0, 10);
  const iso = raw.includes("T") ? raw : raw.replace(" ", "T");
  const d = new Date(iso);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  const [datePart] = raw.split(" ");
  return datePart?.slice(0, 10) || new Date().toISOString().slice(0, 10);
}

function batchDateKey(d = new Date()): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}${mm}${yy}`;
}

/** Map InvoiceRow → dòng xuất thuế; cấp M/PF theo thứ tự trong batch. */
export function mapInvoiceRowsToTaxOrders(rows: InvoiceRow[]): TaxExportOrder[] {
  const dateKey = batchDateKey();
  return rows.map((row, i) => {
    // Chain tên khách mirror BE _course_display_name: course (invoice name/company) →
    // PR.invoiceCustomerName (tên pháp lý sale khai) → AR.customerName.
    const name =
      row.course.name ??
      row.course.companyName ??
      row.pr?.invoiceCustomerName ??
      row.ar.customerName;
    const phone = row.course.phone ?? row.uidObj.phone ?? row.pr?.phone ?? "";
    const productName = row.course.packageName?.trim() || row.course.courseCode;
    const taxInvoiceCode =
      row.course.taxInvoiceCode ||
      (row.course.invoiceId?.startsWith("M") ? row.course.invoiceId : `M${dateKey}${String(i + 1).padStart(3, "0")}`);
    const taxProductCode = row.course.taxProductCode || `PF${String(i + 1).padStart(6, "0")}`;
    const customerType = row.course.customerType ?? row.pr?.customerType ?? "individual";
    const taxCode = row.course.taxCode || row.pr?.taxId || "";
    const companyName = row.course.companyName || row.pr?.companyName || "";

    return {
      taxInvoiceCode,
      taxProductCode,
      taxProductName: productName,
      sdt: phone,
      tenKhach: name,
      tongTien: Math.round(row.course.amount || 0),
      invDate: parseInvDate(row.course.invoicedAt || row.ar.createdAt),
      email: row.course.email || row.pr?.email || "",
      soCccd: customerType !== "business" ? taxCode : "",
      maSoThue: customerType === "business" ? taxCode : "",
      tenDonVi: customerType === "business" ? companyName : "",
    };
  });
}

function sheetToArrayBuffer(ws: XLSX.WorkSheet, sheetName: string): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
}

function buildOrdersSheet(orders: TaxExportOrder[]): XLSX.WorkSheet {
  const headerGroups = [
    "Thông tin chung",
    "",
    "",
    "",
    "",
    "",
    "",
    "Thông tin sản phẩm",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "Thông tin lô hàng",
    "",
  ];
  const headers = [
    "Mã đơn hàng*",
    "Mã khách hàng",
    "Tên khách hàng*",
    "Tên người mua",
    "Ngày hóa đơn",
    "Hình thức thanh toán",
    "Ghi chú",
    "Mã sản phẩm",
    "Tên sản phẩm*",
    "Đơn vị tính",
    "Số lượng*",
    "Đơn giá*",
    "Giảm giá sản phẩm",
    "Thuế suất ",
    "Tiền sau thuế",
    "Mã lô*",
    "Lượng hàng*",
  ];

  const dataRows = orders.map((o) => [
    o.taxInvoiceCode,
    fmtSdt(o.sdt),
    "",
    "",
    o.invDate,
    "TM/CK",
    "",
    o.taxProductCode,
    o.taxProductName,
    "Khóa",
    1,
    o.tongTien,
    "",
    "KCT",
    "",
    "",
    "",
  ]);

  const ws = XLSX.utils.aoa_to_sheet([headerGroups, headers, ...dataRows]);
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } },
    { s: { r: 0, c: 7 }, e: { r: 0, c: 14 } },
    { s: { r: 0, c: 15 }, e: { r: 0, c: 16 } },
  ];
  return ws;
}

function buildCustomersSheet(orders: TaxExportOrder[]): XLSX.WorkSheet {
  const headers = [
    "Mã KH/NCC",
    "Tên đơn vị (*)",
    "Tên người mua",
    "Loại (*)",
    "Địa chỉ",
    "Số điện thoại",
    "Ngày sinh",
    "Số CCCD",
    "Mã số thuế",
    "Email",
    "Số tài khoản",
    "Tên ngân hàng",
    "Giới tính",
    "Mô tả",
  ];

  const seen = new Set<string>();
  const rows: (string | number)[][] = [];
  for (const o of orders) {
    const maKh = fmtSdt(o.sdt);
    if (seen.has(maKh)) continue;
    seen.add(maKh);
    // Cột: 1 Mã KH, 2 Tên đơn vị (DN), 3 Tên người mua, 4 Loại, 5 Địa chỉ, 6 SĐT,
    // 7 Ngày sinh, 8 Số CCCD, 9 MST (DN), 10 Email, 11-14 trống — khớp BE _build_excel_customers.
    rows.push([
      maKh,
      o.tenDonVi || "",
      o.tenKhach,
      "Khách hàng",
      "",
      "",
      "",
      o.soCccd || "",
      o.maSoThue || "",
      o.email || "",
      "",
      "",
      "",
      "",
    ]);
  }

  return XLSX.utils.aoa_to_sheet([headers, ...rows]);
}

function buildProductsSheet(orders: TaxExportOrder[]): XLSX.WorkSheet {
  const headers = [
    "Mã sản phẩm (*)",
    "Tên sản phẩm (*)",
    "Barcode",
    "Nhóm sản phẩm",
    "Giá nhập",
    "Giá bán (*)",
    "Đơn vị tính",
    "Theo dõi hàng tồn kho",
    "Số lượng tồn kho",
    "Hạn mức tồn",
    "Áp dụng thuế",
    "Ảnh",
    "Mô tả",
    "Thuế giảm trừ",
    "Nhóm ngành nghề tính thuế",
  ];

  const rows = orders.map((o) => [
    o.taxProductCode,
    o.taxProductName,
    "",
    "",
    "",
    o.tongTien,
    "Khóa",
    "Không",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
  ]);

  return XLSX.utils.aoa_to_sheet([headers, ...rows]);
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

/** Tạo ZIP 3 file xlsx và tải xuống — cùng format tên file như M4 cũ. */
export async function downloadTaxInvoiceZip(rows: InvoiceRow[], label?: string) {
  if (rows.length === 0) return;

  const orders = mapInvoiceRowsToTaxOrders(rows);
  const batchLabel = label || batchDateKey();

  const ordersBuf = sheetToArrayBuffer(buildOrdersSheet(orders), "Đơn hàng");
  const customersBuf = sheetToArrayBuffer(buildCustomersSheet(orders), "Khách hàng");
  const productsBuf = sheetToArrayBuffer(buildProductsSheet(orders), "Sản phẩm");

  const zip = new JSZip();
  zip.file(`01_1don_hang_${batchLabel}.xlsx`, ordersBuf);
  zip.file(`02_khach_hang1_${batchLabel}.xlsx`, customersBuf);
  zip.file(`03_sanpham1_${batchLabel}.xlsx`, productsBuf);

  const zipBlob = await zip.generateAsync({ type: "blob" });
  downloadBlob(zipBlob, `hoa_don_thue_${batchLabel}.zip`);
}

/** Tải ZIP từ BE export-batch (persist M/PF codes); fallback caller nên dùng downloadTaxInvoiceZip. */
export function downloadApiTaxZip(blob: Blob, label?: string) {
  const batchLabel = label || batchDateKey();
  downloadBlob(blob, `hoa_don_thue_${batchLabel}.zip`);
}
