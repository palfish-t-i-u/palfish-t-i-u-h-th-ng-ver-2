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

export function buildVietQrUrl(amount: number, infoCode: string): string {
  const { bin, accountNo, accountName } = BANK_INFO;
  const params = new URLSearchParams({
    amount: String(amount),
    addInfo: infoCode,
    accountName,
  });
  return `https://img.vietqr.io/image/${bin}-${accountNo}-compact2.png?${params.toString()}`;
}
