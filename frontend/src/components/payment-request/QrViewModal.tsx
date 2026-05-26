import type { PaymentAttempt, PaymentRequest } from "../../types/paymentRequest";
import { findCountry } from "./CountryCombo";
import { Icons } from "./Icons";
import { fmtPhone, vnd } from "./paymentRequestUtils";

function QrPlaceholder() {
  return (
    <svg viewBox="0 0 24 24" width="170" height="170" fill="none" style={{ color: "var(--text)" }}>
      <rect x="2" y="2" width="6" height="6" stroke="currentColor" strokeWidth="1" fill="none" />
      <rect x="4" y="4" width="2" height="2" fill="currentColor" />
      <rect x="16" y="2" width="6" height="6" stroke="currentColor" strokeWidth="1" fill="none" />
      <rect x="18" y="4" width="2" height="2" fill="currentColor" />
      <rect x="2" y="16" width="6" height="6" stroke="currentColor" strokeWidth="1" fill="none" />
      <rect x="4" y="18" width="2" height="2" fill="currentColor" />
      {Array.from({ length: 60 }).map((_, i) => {
        const x = (i * 7919) % 20;
        const y = (i * 4099) % 20;
        if ((x < 6 && y < 6) || (x > 14 && y < 6) || (x < 6 && y > 14)) return null;
        return <rect key={i} x={2 + x} y={2 + y} width="1" height="1" fill="currentColor" />;
      })}
    </svg>
  );
}

export default function QrViewModal({
  qr,
  request,
  onClose,
  onUploadBill,
}: {
  qr: PaymentAttempt | null;
  request: PaymentRequest | null;
  onClose: () => void;
  onUploadBill?: (qr: PaymentAttempt) => void;
}) {
  if (!qr || !request) return null;

  const country = findCountry(request.country);
  const transferCode = qr.transferContent || qr.code;
  const bank = qr.bank || "MB Bank";

  const copyTransfer = () => {
    if (transferCode) navigator.clipboard?.writeText(transferCode).catch(() => {});
  };

  const openCheckout = () => {
    if (qr.checkoutUrl) window.open(qr.checkoutUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="gmv-prototype gmv-prototype-modal-scrim" onClick={onClose}>
      <div className="modal" style={{ width: "min(540px, 100%)" }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>QR thanh toán · Lần #{qr.idx}</h3>
          <button className="drawer-close" onClick={onClose}>
            <Icons.Close size={16} />
          </button>
        </div>
        <div className="modal-body" style={{ gap: 18 }}>
          <div className="qr-detail-card">
            <div className="qr-big">
              {qr.qrCode ? (
                <img src={qr.qrCode} alt="Mã QR PayOS" style={{ width: 170, height: 170, objectFit: "contain" }} />
              ) : (
                <QrPlaceholder />
              )}
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
              <div>
                <div className="info-label">Khách hàng</div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{request.name}</div>
                <div style={{ fontSize: 12, color: "var(--text-3)" }}>
                  {country.flag} {country.dial} {fmtPhone(request.phone)}
                </div>
              </div>
              <div>
                <div className="info-label">Số tiền</div>
                <div className="info-value money">{vnd(qr.amount)}</div>
              </div>
              <div>
                <div className="info-label">Nội dung CK</div>
                <div
                  style={{
                    fontFamily: "JetBrains Mono, monospace",
                    fontSize: 13,
                    background: "var(--primary-50)",
                    color: "var(--primary-700)",
                    border: "1px solid var(--primary-100)",
                    padding: "6px 9px",
                    borderRadius: 7,
                    display: "inline-block",
                    fontWeight: 600,
                  }}
                >
                  {transferCode}
                </div>
              </div>
              <div>
                <div className="info-label">Ngân hàng nhận</div>
                <div className="info-value">{bank} · PalFish Vietnam Co., Ltd</div>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-outline" style={{ flex: 1, justifyContent: "center" }} onClick={copyTransfer}>
              <Icons.Copy size={14} /> Copy nội dung CK
            </button>
            {qr.checkoutUrl ? (
              <button className="btn btn-outline" style={{ flex: 1, justifyContent: "center" }} onClick={openCheckout}>
                <Icons.Download size={14} /> Mở link PayOS
              </button>
            ) : (
              <button className="btn btn-outline" style={{ flex: 1, justifyContent: "center" }} disabled>
                <Icons.Download size={14} /> Tải ảnh QR
              </button>
            )}
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-outline" onClick={onClose}>
            Đóng
          </button>
          {onUploadBill && (
            <button className="btn btn-primary" onClick={() => onUploadBill(qr)}>
              <Icons.Upload size={14} /> Up biên lai
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
