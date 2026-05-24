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

// Module 6 — Dashboard
export interface DashboardSummary {
  period: { start: string; end: string };
  kpi: {
    total_orders: number;
    total_amount_qr: number;
    total_collected: number;
    aov: number;
    l1: number; l3: number; l4: number; l8: number;
  };
  revenue_by_date: { date: string; amount: number; collected: number; orders: number }[];
  top_sales: {
    sale_name: string; team: string;
    total_amount: number; collected: number; orders: number;
  }[];
  conversion: { label: string; value: number }[];
  today: { orders: number; amount: number; collected: number };
}
