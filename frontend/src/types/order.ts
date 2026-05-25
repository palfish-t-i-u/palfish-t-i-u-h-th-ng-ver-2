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
  meta?: {
    crm_gmv_currency: "RMB";
    collected_currency: "VND";
    exchange_rate: number;
    kpi_source?: "summary" | "daily_fallback";
    summary_rows?: number;
    daily_rows?: number;
  };
  kpi: {
    total_orders: number;
    /** Số đơn tien_ve=true trong kỳ — mẫu số AOV */
    collected_order_count?: number;
    total_gmv_rmb: number;
    total_collected_vnd: number;
    gmv_vnd_est?: number;
    exchange_rate?: number;
    /** Doanh thu tạo mã QR (Module 2) — VND, lọc created_at */
    revenue_qr_created_vnd?: number;
    qr_created_count?: number;
    /** L8 CRM (PalFish) — chỉ dùng tỷ lệ chuyển đổi */
    crm_l8?: number;
    /** @deprecated alias — VND */
    total_collected: number;
    aov: number;
    b1_qr_count?: number;
    b3_gmv_qr?: number;
    l1: number;
    l3: number;
    l4: number;
    l8: number;
    l1_0?: number;
    l1_1?: number;
    l1_2?: number;
    l3_1?: number;
    l3_3?: number;
    c1?: number;
    c2?: number;
    c4?: number;
    c5?: number;
  };
  row_count?: number;
  data_mode?: "detail" | "summary" | "none";
  revenue_by_date: {
    date: string;
    gmv_rmb?: number;
    gmv_rmb_mtd?: number;
    gmv_rmb_delta?: number;
    collected_vnd?: number;
    orders: number;
    amount?: number;
    collected?: number;
    has_sync?: boolean;
  }[];
  top_sales: {
    sale_name: string;
    department?: string;
    team?: string;
    ad_leads?: number;
    ad_leads_manual?: number;
    referral_leads?: number;
    total_leads?: number;
    gd_leads?: number;
    invitation_number?: number;
    scheduled_classes?: number;
    preview_rate?: number;
    completed_classes?: number;
    completion_rate?: number;
    orders: number;
    gmv_rmb?: number;
    avg_price?: number;
    total_call_time?: number;
    total_dials?: number;
    total_connections?: number;
    connection_rate?: number;
    over_3min_connections?: number;
    over_3min_rate?: number;
    total_amount: number;
    collected_vnd?: number;
    collected: number;
  }[];
  conversion: { label: string; value: number }[];
  today: {
    date?: string;
    is_calendar_today?: boolean;
    orders: number;
    gmv_rmb?: number;
    gmv_rmb_mtd?: number;
    collected_vnd?: number;
    amount?: number;
    collected?: number;
  };
}

/** Hybrid — DB incremental daily (charts, BC03 scroll) */
export interface DashboardDailyTrends {
  period: { start: string; end: string };
  row_count: number;
  revenue_by_date: DashboardSummary["revenue_by_date"];
  meta?: {
    source?: string;
    sync_days?: number;
    crm_gmv_currency?: "RMB";
    collected_currency?: "VND";
  };
}

/** Hybrid — PalFish live (KPI cards, Top Sale) */
export interface DashboardLiveSummary {
  period: { start: string; end: string };
  row_count?: number;
  meta?: DashboardSummary["meta"] & {
    kpi_source?: "palfish_live";
    source?: string;
    department_fallback?: boolean;
  };
  kpi: DashboardSummary["kpi"];
  top_sales: DashboardSummary["top_sales"];
  conversion: DashboardSummary["conversion"];
  today: DashboardSummary["today"];
}

// BC03 Report
export interface Bc03KpiRow {
  id: string;
  saleName: string;
  b2Orders: number;
  b4Gmv: number;
}

export interface Bc03MonthlySettings {
  month: string;
  exchange_rate: number;
  updated_at: string | null;
  updated_by: string | null;
  kpi_rows: {
    id: string;
    sale_name: string;
    b2_orders: number;
    b4_gmv_vnd: number;
  }[];
}

export interface Bc03DailyRevenue {
  gmv_rmb_crm: number;
  gmv_rmb_ledger: number;
  collected_vnd: number;
  collected_vnd_m2: number;
  orders_crm: number;
  orders_ledger: number;
  orders_m2: number;
  gmv_rmb: number;
  orders: number;
}

export interface Bc03StaffOption {
  crm_name: string;
  team: string;
  display_name: string;
}

export interface Bc03Report {
  period: { start: string; end: string };
  dates: string[];
  revenue: {
    sale_name: string;
    team: string;
    gmv_rmb: number;
    gmv_rmb_crm: number;
    gmv_rmb_ledger: number;
    collected_vnd: number;
    collected_vnd_m2: number;
    orders: number;
    orders_crm: number;
    orders_ledger: number;
    orders_m2: number;
    daily: Record<string, Bc03DailyRevenue>;
  }[];
  trial: {
    sale_name: string;
    team: string;
    completed_classes: number;
    daily: Record<string, number>;
  }[];
  referral: {
    sale_name: string;
    team: string;
    referral_leads: number;
    daily: Record<string, number>;
  }[];
  meta?: {
    source?: string;
    row_count?: number;
    synced_days?: number;
    expected_days?: number;
    missing_dates?: string[];
  };
}
