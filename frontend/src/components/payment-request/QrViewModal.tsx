import { BANK_INFO } from "../../constants/bank";
import type { PaymentAttempt, PaymentRequest } from "../../types/paymentRequest";
import BillUploadZone from "./BillUploadZone";
import { findCountry } from "./CountryCombo";
import { Icons } from "./Icons";
import { fmtPhone, vnd } from "./paymentRequestUtils";

function buildQrPrintUrl(amount: number, content: string): string {
  const { bin, accountNo, accountName } = BANK_INFO;
  const params = new URLSearchParams({ amount: String(amount), addInfo: content, accountName });
  return `https://img.vietqr.io/image/${bin}-${accountNo}-print.png?${params.toString()}`;
}

function BankInfoRow({ label, value, onCopy }: { label: string; value: string; onCopy?: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div className="info-label">{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
        <div className="info-value" style={{ fontWeight: 600, fontSize: 13 }}>{value}</div>
        {onCopy && (
          <button
            type="button"
            className="btn btn-outline btn-sm"
            style={{ flexShrink: 0, padding: "2px 10px", fontSize: 12 }}
            onClick={onCopy}
          >
            Sao chép
          </button>
        )}
      </div>
    </div>
  );
}

export default function QrViewModal({
  qr,
  request,
  onClose,
  onBillFile,
  onBillView,
  uploadingBill,
}: {
  qr: PaymentAttempt | null;
  request: PaymentRequest | null;
  onClose: () => void;
  onBillFile?: (file: File) => void;
  onBillView?: () => void;
  uploadingBill?: boolean;
}) {
  if (!qr || !request) return null;

  const country = findCountry(request.country);
  const transferCode = qr.transferContent || qr.code;
  const qrImageUrl = buildQrPrintUrl(qr.amount, transferCode);

  const copy = (text: string) => navigator.clipboard?.writeText(text).catch(() => {});

  const openCheckout = () => {
    if (qr.checkoutUrl) window.open(qr.checkoutUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="gmv-prototype gmv-prototype-modal-scrim" onClick={onClose}>
      <div className="modal" style={{ width: "min(580px, 100%)" }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h3>QR thanh toán · Lần #{qr.idx}</h3>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
              Mở app ngân hàng bất kỳ để quét mã hoặc chuyển khoản thủ công
            </div>
          </div>
          <button className="drawer-close" onClick={onClose}>
            <Icons.Close size={16} />
          </button>
        </div>

        <div className="modal-body" style={{ gap: 18 }}>
          {/* QR + bank details side by side */}
          <div className="qr-detail-card" style={{ alignItems: "flex-start", gap: 20 }}>
            {/* QR image với logo VietQR PRO + Napas + MB */}
            <div
              style={{
                flexShrink: 0,
                border: "1px solid var(--border)",
                borderRadius: 10,
                overflow: "hidden",
                background: "#fff",
              }}
            >
              <img
                src={qrImageUrl}
                alt="VietQR"
                style={{ width: 200, height: 200, display: "block", objectFit: "contain" }}
              />
            </div>

            {/* Bank info panel */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 2 }}>
                {country.flag} {country.dial} {fmtPhone(request.phone)} · {request.name}
              </div>

              <BankInfoRow label="Ngân hàng" value={BANK_INFO.displayName} />
              <BankInfoRow
                label="Chủ tài khoản"
                value={BANK_INFO.accountName}
              />
              <BankInfoRow
                label="Số tài khoản"
                value={BANK_INFO.accountNo}
                onCopy={() => copy(BANK_INFO.accountNo)}
              />
              <BankInfoRow
                label="Số tiền"
                value={vnd(qr.amount)}
                onCopy={() => copy(String(qr.amount))}
              />
              <BankInfoRow
                label="Nội dung chuyển khoản"
                value={transferCode}
                onCopy={() => copy(transferCode)}
              />
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn btn-outline"
              style={{ flex: 1, justifyContent: "center" }}
              onClick={() => copy(transferCode)}
            >
              <Icons.Copy size={14} /> Copy nội dung CK
            </button>
            {qr.checkoutUrl ? (
              <button
                className="btn btn-outline"
                style={{ flex: 1, justifyContent: "center" }}
                onClick={openCheckout}
              >
                <Icons.Download size={14} /> Mở link PayOS
              </button>
            ) : null}
          </div>

          {/* Bill upload */}
          {onBillFile && (
            <div style={{ display: "flex", justifyContent: "center" }}>
              <BillUploadZone
                hasBill={!!qr.billImage}
                uploading={uploadingBill}
                onView={onBillView}
                onFile={onBillFile}
              />
            </div>
          )}
        </div>

        <div className="modal-foot">
          <button className="btn btn-outline" onClick={onClose}>
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
