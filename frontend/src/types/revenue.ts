export type LoaiNhap = "tu_dong" | "tay";

export interface RevenueLedgerRow {
  id: string;
  ngayTienVe: string;
  payTime?: string;
  tenKhach: string;
  sdt: string;
  uid: string;
  goiHoc: string;
  soTienVnd: number;
  gmvRmb: number;
  tyGiaVndRmb: number;
  paymentMethod: string;
  loai: string;
  loai2: string;
  saleCrmName: string;
  team: string;
  teamPivotLabel: string;
  note: string;
  note2: string;
  loaiNhap: LoaiNhap;
  donHangId: string | null;
  maDonHang: string;
  crmOrderId: string;
  infoCode: string;
}

export interface RevenuePivotSale {
  sale: string;
  cells: Record<string, number>;
  total: number;
}

export interface RevenuePivotTeam {
  teamLabel: string;
  totalRow: Record<string, number>;
  totalRowSum: number;
  sales: RevenuePivotSale[];
}

export interface RevenuePivotResponse {
  months: string[];
  teams: RevenuePivotTeam[];
  grandTotalRow: Record<string, number>;
  grandTotal: number;
}

export interface RevenueKeyDataCategoryCell {
  count: number;
  gmv: number;
}

export interface RevenueKeyDataColumnGroup {
  key: string;
  label: string;
  countLabel: string;
  gmvLabel: string;
}

export interface RevenueKeyDataDayRow {
  date: string;
  totalOrders: number;
  totalGmv: number;
  categories: Record<string, RevenueKeyDataCategoryCell>;
}

export interface RevenueKeyDataResponse {
  scopeLabel: string;
  columnGroups: RevenueKeyDataColumnGroup[];
  rows: RevenueKeyDataDayRow[];
  grandTotal: {
    totalOrders: number;
    totalGmv: number;
    categories: Record<string, RevenueKeyDataCategoryCell>;
  };
}

export interface LedgerSummarySource {
  source: string;
  gmvVnd: number;
  count: number;
}

export interface LedgerSummaryResponse {
  totalGmvVnd: number;
  orderCount: number;
  bySource: LedgerSummarySource[];
}

export interface RevenueLedgerListResponse {
  rows: RevenueLedgerRow[];
  count: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

export type LedgerCreatePayload = {
  ngayTienVe: string;
  tenKhach?: string;
  sdt?: string;
  uid?: string;
  goiHoc?: string;
  soTienVnd?: number;
  gmvRmb?: number;
  saleCrmName?: string;
  team?: string;
  loai?: string;
  loai2?: string;
  note?: string;
  paymentMethod?: string;
};

export type LedgerPatchPayload = Partial<LedgerCreatePayload> & {
  note2?: string;
};

export interface GsheetSyncResponse {
  spreadsheetId: string;
  tabs: string[];
  fetched: number;
  skippedExisting: number;
  skippedLoose: number;
  inserted: number;
  dryRun: boolean;
}
