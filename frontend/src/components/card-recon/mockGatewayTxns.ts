// Mock dữ liệu Đối soát mPOS / Payoo (FE-only, snake_case mirror backend).
// Nguồn: file export thật mPOS (Chi tiết phiếu chi) + Payoo (Trực tuyến / Trả góp).
// Khi nối backend: thay MOCK_* bằng endpoints.cardRecon.* trả đúng shape này.

export type GatewaySource = "mpos" | "payoo";
export type MatchStatus = "pending" | "matched" | "ignored";

export interface GatewayTxn {
  id: string;
  source: GatewaySource;
  /** "Quẹt thẻ" | "Trực tuyến" | "Trả góp" */
  category: string;
  /** Số giao dịch (mPOS) / Mã đơn hàng (Payoo) — khóa chống trùng */
  txn_code: string;
  /** Mã phiếu chi (mPOS) / Mã chuẩn chi (Payoo) — gom theo đợt chi */
  settlement_code: string | null;
  cardholder_name: string;
  card_masked: string;
  card_type: string;
  amount: number;
  fee: number;
  net_amount: number;
  installment_term: number | null;
  bank: string | null;
  /** "HCM" | "HN" (mPOS palfish02/palfish3) */
  collector_region: string | null;
  /** "YYYY-MM-DD HH:mm" */
  paid_at: string;
  match_status: MatchStatus;
  payment_line_id: string | null;
  /** Nhãn lần thanh toán đã ghép (hiển thị) */
  matched_label: string | null;
  bill_url: string | null;
}

export interface MatchCandidate {
  payment_line_id: string;
  pr_id: string;
  pr_name: string;
  attempt_idx: number;
  amount: number;
  created_at: string;
  uid: string;
}

export const LAST_SYNC_AT = "2026-06-16 09:42";

export const MOCK_GATEWAY_TXNS: GatewayTxn[] = [
  // ── mPOS · Chi tiết phiếu chi ──
  {
    id: "m1", source: "mpos", category: "Quẹt thẻ", txn_code: "MPL_MP13531924",
    settlement_code: "79007437", cardholder_name: "Dao Trung Thanh", card_masked: "412189***4002",
    card_type: "Visa nội địa", amount: 18_820_000, fee: 470_500, net_amount: 18_349_500,
    installment_term: null, bank: null, collector_region: "HCM", paid_at: "2026-06-15 18:10",
    match_status: "pending", payment_line_id: null, matched_label: null, bill_url: null,
  },
  {
    id: "m2", source: "mpos", category: "Quẹt thẻ", txn_code: "MPL_MP13531515",
    settlement_code: "79007437", cardholder_name: "Dong Tran Hieu", card_masked: "523975***9901",
    card_type: "Master nội địa", amount: 7_900_000, fee: 197_500, net_amount: 7_702_500,
    installment_term: null, bank: null, collector_region: "HCM", paid_at: "2026-06-15 17:13",
    match_status: "pending", payment_line_id: null, matched_label: null, bill_url: null,
  },
  {
    id: "m3", source: "mpos", category: "Quẹt thẻ", txn_code: "MPL_MP13528247",
    settlement_code: "78997253", cardholder_name: "Nguyen Minh Duc", card_masked: "438103***2756",
    card_type: "Visa nội địa", amount: 19_600_000, fee: 490_000, net_amount: 19_110_000,
    installment_term: null, bank: null, collector_region: "HCM", paid_at: "2026-06-14 22:48",
    match_status: "matched", payment_line_id: "pl-1003", matched_label: "PR-2026-0055 · Nguyễn Minh Đức · lần TT 1",
    bill_url: null,
  },
  {
    id: "m4", source: "mpos", category: "Quẹt thẻ", txn_code: "MPL_MP13511228",
    settlement_code: "78990258", cardholder_name: "Nguyen Thi Luyen", card_masked: "483931***2432",
    card_type: "Visa nội địa", amount: 26_200_000, fee: 655_000, net_amount: 25_545_000,
    installment_term: null, bank: null, collector_region: "HCM", paid_at: "2026-06-12 10:55",
    match_status: "pending", payment_line_id: null, matched_label: null, bill_url: null,
  },
  {
    id: "m5", source: "mpos", category: "Quẹt thẻ", txn_code: "20260611103699801689",
    settlement_code: "78982290", cardholder_name: "Nguyen T Thuy Linh", card_masked: "457353***9521",
    card_type: "Visa nội địa", amount: 4_940_000, fee: 88_920, net_amount: 4_851_080,
    installment_term: null, bank: null, collector_region: "HN", paid_at: "2026-06-11 10:36",
    match_status: "pending", payment_line_id: null, matched_label: null, bill_url: null,
  },
  {
    id: "m6", source: "mpos", category: "Trả góp", txn_code: "MPL_MP13476876",
    settlement_code: "78947429", cardholder_name: "Huynh T P Trinh", card_masked: "483931***1471",
    card_type: "Visa nội địa", amount: 10_080_000, fee: 252_000, net_amount: 9_525_600,
    installment_term: 3, bank: "Techcombank", collector_region: "HCM", paid_at: "2026-06-06 09:48",
    match_status: "pending", payment_line_id: null, matched_label: null, bill_url: null,
  },
  {
    id: "m7", source: "mpos", category: "Trả góp", txn_code: "MPL_MP13457791",
    settlement_code: "78915900", cardholder_name: "Bui Thi Ngoc Ha", card_masked: "544640***1028",
    card_type: "Master nội địa", amount: 20_160_000, fee: 504_000, net_amount: 18_385_920,
    installment_term: 9, bank: "Citibank", collector_region: "HCM", paid_at: "2026-06-02 15:25",
    match_status: "ignored", payment_line_id: null, matched_label: null, bill_url: null,
  },

  // ── Payoo · Trực tuyến / Trả góp ──
  {
    id: "p1", source: "payoo", category: "Trực tuyến", txn_code: "8971260616094704777",
    settlement_code: null, cardholder_name: "***KIEU", card_masked: "VISA***4763",
    card_type: "Thẻ quốc tế · VISA", amount: 17_820_000, fee: 376_420, net_amount: 17_443_580,
    installment_term: null, bank: null, collector_region: null, paid_at: "2026-06-16 11:10",
    match_status: "pending", payment_line_id: null, matched_label: null, bill_url: null,
  },
  {
    id: "p2", source: "payoo", category: "Trực tuyến", txn_code: "8971260609120413616",
    settlement_code: null, cardholder_name: "***HANG", card_masked: "MASTER***0656",
    card_type: "Thẻ quốc tế · MASTER", amount: 17_820_000, fee: 376_420, net_amount: 17_443_580,
    installment_term: null, bank: null, collector_region: null, paid_at: "2026-06-09 12:10",
    match_status: "pending", payment_line_id: null, matched_label: null, bill_url: null,
  },
  {
    id: "p3", source: "payoo", category: "Trực tuyến", txn_code: "8971260604171639568",
    settlement_code: null, cardholder_name: "***QUAN", card_masked: "VISA***4943",
    card_type: "Thẻ quốc tế · VISA", amount: 25_640_000, fee: 540_640, net_amount: 25_099_360,
    installment_term: null, bank: null, collector_region: null, paid_at: "2026-06-04 20:54",
    match_status: "matched", payment_line_id: "pl-1009", matched_label: "PR-2026-0042 · Trần Quân · lần TT 2",
    bill_url: null,
  },
  {
    id: "p4", source: "payoo", category: "Trả góp", txn_code: "8971260422201706311",
    settlement_code: "685288", cardholder_name: "***NHAN", card_masked: "VISA***3018",
    card_type: "Thẻ quốc tế · VISA", amount: 18_320_000, fee: 2_057_704, net_amount: 16_262_296,
    installment_term: 12, bank: "VPBank", collector_region: null, paid_at: "2026-04-22 20:20",
    match_status: "pending", payment_line_id: null, matched_label: null, bill_url: null,
  },
];

// Ứng viên lần thanh toán (mock) — backend sẽ gợi ý theo số tiền + ngày gần.
export const MOCK_MATCH_CANDIDATES: MatchCandidate[] = [
  { payment_line_id: "pl-1001", pr_id: "PR-2026-0061", pr_name: "Đào Trung Thành", attempt_idx: 1, amount: 18_820_000, created_at: "2026-06-15 09:30", uid: "daott90" },
  { payment_line_id: "pl-1002", pr_id: "PR-2026-0058", pr_name: "Đổng Trần Hiếu", attempt_idx: 2, amount: 7_900_000, created_at: "2026-06-15 16:40", uid: "donghieu" },
  { payment_line_id: "pl-1003", pr_id: "PR-2026-0055", pr_name: "Nguyễn Minh Đức", attempt_idx: 1, amount: 19_600_000, created_at: "2026-06-14 20:00", uid: "minhduc" },
  { payment_line_id: "pl-1004", pr_id: "PR-2026-0049", pr_name: "Nguyễn Thị Luyến", attempt_idx: 1, amount: 26_200_000, created_at: "2026-06-12 09:00", uid: "luyennt" },
  { payment_line_id: "pl-1005", pr_id: "PR-2026-0071", pr_name: "Kiều Anh", attempt_idx: 1, amount: 17_820_000, created_at: "2026-06-16 10:05", uid: "kieuanh" },
  { payment_line_id: "pl-1006", pr_id: "PR-2026-0072", pr_name: "Hằng Trần", attempt_idx: 2, amount: 17_820_000, created_at: "2026-06-09 11:20", uid: "hangtran" },
  { payment_line_id: "pl-1007", pr_id: "PR-2026-0044", pr_name: "Huỳnh Phương Trinh", attempt_idx: 1, amount: 10_080_000, created_at: "2026-06-06 08:30", uid: "trinhhp" },
  { payment_line_id: "pl-1008", pr_id: "PR-2026-0040", pr_name: "Phạm Thu Hương", attempt_idx: 3, amount: 26_200_000, created_at: "2026-06-11 18:00", uid: "huongpt" },
  { payment_line_id: "pl-1010", pr_id: "PR-2026-0073", pr_name: "Lê Nhân", attempt_idx: 1, amount: 18_320_000, created_at: "2026-04-22 19:00", uid: "lenhan" },
];

const DAY = 24 * 60 * 60 * 1000;

/** Gợi ý ứng viên: trùng số tiền trước, rồi sát ngày. Loại ±0 nếu cần. */
export function suggestCandidates(txn: GatewayTxn, all: MatchCandidate[]): MatchCandidate[] {
  const t = new Date(txn.paid_at.replace(" ", "T")).getTime();
  return all
    .map((c) => {
      const exact = c.amount === txn.amount;
      const diffAmt = Math.abs(c.amount - txn.amount);
      const diffDay = Math.abs(new Date(c.created_at.replace(" ", "T")).getTime() - t) / DAY;
      const score = (exact ? 0 : diffAmt) + diffDay * 1000;
      return { c, exact, diffDay, score };
    })
    .filter((x) => x.exact || x.diffDay <= 3)
    .sort((a, b) => a.score - b.score)
    .map((x) => x.c);
}
