/** Cấu hình ngân hàng thu tiền — override bằng VITE_BANK_* trong .env.local / Vercel */
export const BANK_INFO = {
  /** Napas BIN — MB Bank */
  bin: import.meta.env.VITE_BANK_BIN || "970422",
  accountNo: import.meta.env.VITE_BANK_ACCOUNT_NO || "1680011668899",
  /** Tên chủ TK / pháp nhân (hiển thị + VietQR accountName) */
  accountName:
    import.meta.env.VITE_BANK_ACCOUNT_NAME ||
    "CONG TY TNHH TRUONG QUOC TE PALFISH SINGAPORE - VIETNAM",
  /** Tên ngân hàng */
  displayName:
    import.meta.env.VITE_BANK_DISPLAY_NAME || "Ngân hàng TMCP Quân Đội (MB Bank)",
  branch: import.meta.env.VITE_BANK_BRANCH || "Hoàn Kiếm",
};

/**
 * Danh sách tài khoản ngân hàng nhận tiền của PalFish.
 * Khi thêm tài khoản mới (VD: PalFish HCM), chỉ cần thêm 1 phần tử vào đây.
 * Dropdown "Ngân hàng nhận" trong AddPaymentForm sẽ tự cập nhật.
 */
export interface BankAccount {
  alias: string;      // Hiển thị trong dropdown, VD: "PalFish Hà Nội - MB Bank"
  bin: string;        // Napas BIN, dùng để build VietQR URL
  accountNo: string;  // Số tài khoản
  accountName: string; // Tên chủ tài khoản (dùng cho VietQR)
  displayName: string; // Tên ngân hàng đầy đủ
}

export const BANK_ACCOUNTS: BankAccount[] = [
  {
    alias: "PalFish Hà Nội - MB Bank",
    bin: "970422",
    accountNo: "1680011668899",
    accountName: "CONG TY TNHH TRUONG QUOC TE PALFISH SINGAPORE - VIETNAM",
    displayName: "Ngân hàng TMCP Quân Đội (MB Bank)",
  },
  {
    alias: "PalFish HCM - Vietcombank",
    bin: "970436",
    accountNo: "1044914392",
    accountName: "CONG TY TNHH PALFISH CLASS SAI GON",
    displayName: "Ngân hàng TMCP Ngoại Thương Việt Nam (Vietcombank)",
  },
];

/** Trả về danh sách bank có thể chọn theo team của nhân sự.
 *  HCM (Online) → cả 2 bank; tất cả team khác → chỉ HN MB Bank. */
export function getAvailableBanks(team: string | null | undefined): BankAccount[] {
  const isHcm = (team ?? "").toLowerCase().includes("hcm");
  return isHcm ? BANK_ACCOUNTS : BANK_ACCOUNTS.filter((b) => b.alias !== "PalFish HCM - Vietcombank");
}

/** Tìm tài khoản theo alias, fallback về tài khoản đầu tiên */
export function findBankAccount(alias: string): BankAccount {
  return BANK_ACCOUNTS.find((b) => b.alias === alias) ?? BANK_ACCOUNTS[0];
}

export function buildVietQrUrl(amount: number, infoCode: string): string {
  const { bin, accountNo, accountName } = BANK_INFO;
  const params = new URLSearchParams({
    amount: String(amount),
    addInfo: infoCode,
    accountName,
  });
  return `https://img.vietqr.io/image/${bin}-${accountNo}-compact2.png?${params.toString()}`;
}
