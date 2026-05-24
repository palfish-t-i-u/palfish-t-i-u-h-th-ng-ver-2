export type LoaiNhap = "tu_dong" | "tay";

export interface RevenueLedgerRow {
  id: string;
  ngayTienVe: string;
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

export interface RevenueKeyDataTypeRow {
  typeLabel: string;
  cells: Record<string, number>;
  total: number;
}

export interface RevenueKeyDataResponse {
  months: string[];
  types: RevenueKeyDataTypeRow[];
  grandTotalRow: Record<string, number>;
  grandTotal: number;
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
