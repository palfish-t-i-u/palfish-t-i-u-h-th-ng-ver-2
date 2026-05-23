export interface Order {
  id: string;
  maDonHang: string;
  uid: string;
  uidPhu?: string[];
  tenKhach: string;
  diaChi: string;
  sdt: string;
  goiHoc: string;
  tongTien: number;
  nguon: string;
  leadKenh?: string;
  datCoc?: boolean;
  ghiChu: string;
  infoCode: string;
  tienVe: boolean;
  donCRM: boolean;
  billImage: string | null;
  trangThai?: string;
  createdBy?: string;
  createdAt?: string;
  // Module 3 / 4 — hóa đơn thuế
  taxProductName?: string;
  taxInvoiceCode?: string;
  taxProductCode?: string;
  m3ApprovedAt?: string;
  trangThaiThuTuc?: string;
}

/** Kiểu dữ liệu trả về từ /invoice/* endpoints */
export interface InvoiceOrder {
  id: string;
  maDonHang: string;
  tenKhach: string;
  sdt: string;
  uid: string;
  goiHoc: string;
  tongTien: number;
  nguon: string;
  tienVe: boolean;
  donCRM: boolean;
  trangThaiThuTuc: string;
  taxProductName: string;
  taxInvoiceCode: string;
  taxProductCode: string;
  m3ApprovedAt: string;
  crmOrderId: string;
  createdBy: string;
  createdAt: string;
}

export interface CreateOrderPayload {
  uid: string;
  uidPhu?: string[];
  tenKhach: string;
  diaChi: string;
  sdt: string;
  goiHoc: string;
  tongTien: number;
  nguon: string;
  leadKenh?: string;
  datCoc?: boolean;
  ghiChu: string;
  maVung?: string;
  tinh?: string;
  quan?: string;
  phuong?: string;
  diaChiChiTiet?: string;
}

export const NGUON_OPTIONS = [
  "Bán mới",
  "Khách giới thiệu",
  "Gia hạn",
  "Kho chung",
  "Nguồn khác",
] as const;

export const LEAD_KENH_OPTIONS = [
  "KOC",
  "Offline",
  "Booth",
  "Livestream",
  "Tiktok",
  "Tiktokshop",
  "FB - Partnership",
  "FB - VN",
  "FB - OV",
] as const;
