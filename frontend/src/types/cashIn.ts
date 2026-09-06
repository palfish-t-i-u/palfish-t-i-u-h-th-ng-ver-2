/**
 * BC04 — Dòng tiền về hàng ngày. Xem docs/plans/PLAN_BC04_DONG_TIEN_VE_2026-08-27.md §4, §6.
 * Raw = snake_case (khớp response BE); FE dùng bản camelCase map ở dưới.
 */

export type CashInGroup = "khach_tra" | "the" | "the_gop" | "rut_tiktok" | "khac";
export type CashInSource = "bank" | "gateway";

export interface CashInRowRaw {
  source: CashInSource;
  txn_id: string;
  date: string; // ISO date — transaction_date (bank) / funded_date (thẻ)
  details: string; // Nội dung cột B — nhãn theo nhóm
  output: number; // luôn 0 (v1 chỉ tiền vào)
  input: number;
  balance: number; // số dư cộng dồn tại dòng này
  income: number; // = input
  expenditure: number; // = output
  business_line: string; // "Giáo dục / 教育" ... — auto hoặc đã sửa tay
  team: string | null;
  note: string | null;
  rmb: number; // input ÷ tỷ giá kỳ
  data_source: string; // "HN BANK" | "mPOS" | "Payoo"
  group: CashInGroup;
  main_cat: string | null;
  detail: string | null;
  /** true nếu source="gateway" (đã tách từ Đối soát quẹt thẻ); false nếu source="bank"
   * có settlement_code (cục phiếu chi còn nguyên vì chưa đồng bộ). Xem
   * docs/plans/PLAN_BC04_BOC_TACH_TIN_DUNG_2026-09-03.md §A0. */
  is_split: boolean;
  /** Chỉ có ý nghĩa khi is_split=true — true nếu payment_line_id null (đã tách
   * nhưng chưa khớp đơn/sale nên chưa rõ Team). */
  unmatched: boolean;
}

export interface CashInDaySummaryRaw {
  date: string;
  total_input: number;
  total_rmb: number;
  ending_balance: number;
}

export interface CashInSummaryRaw {
  total_input: number;
  total_rmb: number;
  opening_balance: number;
  closing_balance: number;
  rate: number;
  /** Số phiếu chi (settlement_code) còn nguyên cục vì chưa đồng bộ trong kỳ đang xem. */
  unsynced_settlement_count: number;
  /** Tổng tiền của các cục phiếu chi chưa đồng bộ đó. */
  unsynced_settlement_amount: number;
}

export interface CashInReportRaw {
  summary: CashInSummaryRaw;
  days: CashInDaySummaryRaw[];
  rows: CashInRowRaw[];
}

export interface CashInRow {
  source: CashInSource;
  txnId: string;
  date: string;
  details: string;
  output: number;
  input: number;
  balance: number;
  income: number;
  expenditure: number;
  businessLine: string;
  team: string | null;
  note: string | null;
  rmb: number;
  dataSource: string;
  group: CashInGroup;
  mainCat: string | null;
  detail: string | null;
  isSplit: boolean;
  unmatched: boolean;
}

export interface CashInDaySummary {
  date: string;
  totalInput: number;
  totalRmb: number;
  endingBalance: number;
}

export interface CashInSummary {
  totalInput: number;
  totalRmb: number;
  openingBalance: number;
  closingBalance: number;
  rate: number;
  unsyncedSettlementCount: number;
  unsyncedSettlementAmount: number;
}

export interface CashInReport {
  summary: CashInSummary;
  days: CashInDaySummary[];
  rows: CashInRow[];
}

export function mapCashInReport(raw: CashInReportRaw): CashInReport {
  return {
    summary: {
      totalInput: raw.summary.total_input,
      totalRmb: raw.summary.total_rmb,
      openingBalance: raw.summary.opening_balance,
      closingBalance: raw.summary.closing_balance,
      rate: raw.summary.rate,
      unsyncedSettlementCount: raw.summary.unsynced_settlement_count,
      unsyncedSettlementAmount: raw.summary.unsynced_settlement_amount,
    },
    days: raw.days.map((d) => ({
      date: d.date,
      totalInput: d.total_input,
      totalRmb: d.total_rmb,
      endingBalance: d.ending_balance,
    })),
    rows: raw.rows.map((r) => ({
      source: r.source,
      txnId: r.txn_id,
      date: r.date,
      details: r.details,
      output: r.output,
      input: r.input,
      balance: r.balance,
      income: r.income,
      expenditure: r.expenditure,
      businessLine: r.business_line,
      team: r.team,
      note: r.note,
      rmb: r.rmb,
      dataSource: r.data_source,
      group: r.group,
      mainCat: r.main_cat,
      detail: r.detail,
      isSplit: r.is_split,
      unmatched: r.unmatched,
    })),
  };
}

/** Taxonomy dropdown v1 — seed tiền vào (spec §5, sheet 管报项目类别). */
export interface CashInTaxonomyOption {
  businessLine: string;
  mainCat: string;
  detail: string;
  label: string; // hiển thị dropdown, VI trước / gốc sau
}

export const CASH_IN_TAXONOMY: CashInTaxonomyOption[] = [
  { businessLine: "Giáo dục / 教育", mainCat: "Doanh thu / 收入", detail: "Doanh thu / 收入", label: "Doanh thu / 收入" },
  { businessLine: "Giáo dục / 教育", mainCat: "Hoàn tiền / 退款", detail: "Hoàn tiền / 退款", label: "Hoàn tiền / 退款" },
  { businessLine: "Giáo dục / 教育", mainCat: "Lãi tiền gửi / 利息收入", detail: "Lãi tiền gửi / 利息收入", label: "Lãi tiền gửi / 利息收入" },
  { businessLine: "Không tính quản báo / 不计入管报", mainCat: "Công nợ nội bộ / 往来款", detail: "Chuyển nhầm / 转账错误", label: "Chuyển nhầm (nội bộ) / 转账错误" },
];

export const CASH_IN_GROUP_LABELS: Record<CashInGroup, string> = {
  khach_tra: "Khách trả",
  the: "Quẹt thẻ",
  the_gop: "Trả góp",
  rut_tiktok: "Rút TikTok",
  khac: "Khoản khác",
};
