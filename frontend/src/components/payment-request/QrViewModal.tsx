import { useState } from "react";
import { BANK_INFO } from "../../constants/bank";
import type { PaymentAttempt, PaymentRequest } from "../../types/paymentRequest";
import BillUploadZone from "./BillUploadZone";
import { findCountry } from "./CountryCombo";
import { Icons } from "./Icons";
import { fmtPhone, vnd } from "./paymentRequestUtils";

/** compact2 = QR + logo Napas + logo bank, không có whitespace thừa như print */
function buildQrUrl(amount: number, content: string): string {
  const { bin, accountNo, accountName } = BANK_INFO;
  const params = new URLSearchParams({ amount: String(amount), addInfo: content, accountName });
  return `https://img.vietqr.io/image/${bin}-${accountNo}-compact2.png?${params.toString()}`;
}

function buildFullBankText(amount: number, transferCode: string): string {
  return [
    `Ngân hàng: ${BANK_INFO.displayName}`,
    `Chủ tài khoản: ${BANK_INFO.accountName}`,
    `Số tài khoản: ${BANK_INFO.accountNo}`,
    `Số tiền: ${amount.toLocaleString("vi-VN")} VND`,
    `Nội dung chuyển khoản: ${transferCode}`,
  ].join("\n");
}

async function copyImageToClipboard(url: string): Promise<boolean> {
  try {
    const resp = await fetch(url);
    const blob = await resp.blob();
    // Ensure PNG mime type for ClipboardItem
    const pngBlob = blob.type === "image/png" ? blob : new Blob([await blob.arrayBuffer()], { type: "image/png" });
    await navigator.clipboard.write([new ClipboardItem({ "image/png": pngBlob })]);
    return true;
  } catch {
    return false;
  }
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
  deletingBill,
}: {
  qr: PaymentAttempt | null;
  request: PaymentRequest | null;
  onClose: () => void;
  onBillFile?: (file: File) => void;
  onBillView?: () => void;
  uploadingBill?: boolean;
  deletingBill?: boolean;
}) {
  const [copyQrState, setCopyQrState] = useState<"idle" | "copying" | "done" | "error">("idle");

  if (!qr || !request) return null;

  const country = findCountry(request.country);
  const transferCode = qr.transferContent || qr.code;
  const qrImageUrl = buildQrUrl(qr.amount, transferCode);
  const fullBankText = buildFullBankText(qr.amount, transferCode);

  const copy = (text: string) => navigator.clipboard?.writeText(text).catch(() => {});

  const handleCopyQr = async () => {
    setCopyQrState("copying");
    const ok = await copyImageToClipboard(qrImageUrl);
    setCopyQrState(ok ? "done" : "error");
    setTimeout(() => setCopyQrState("idle"), 2500);
  };

  const openCheckout = () => {
    if (qr.checkoutUrl) window.open(qr.checkoutUrl, "_blank", "noopener,noreferrer");
  };

  const copyQrLabel = copyQrState === "copying"
    ? "Đang copy…"
    : copyQrState === "done"
    ? "Đã copy ảnh QR!"
    : copyQrState === "error"
    ? "Không hỗ trợ — tải về"
    : "Copy mã QR";

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
            {/* QR image — compact2 template: QR chiếm toàn bộ, logo Napas+bank nhỏ ở góc */}
            <div
              style={{
                flexShrink: 0,
                border: "1px solid var(--border)",
                borderRadius: 10,
                overflow: "hidden",
                background: "#fff",
                width: 200,
                height: 200,
              }}
            >
              <img
                src={qrImageUrl}
                alt="VietQR"
                style={{ width: 200, height: 200, display: "block", objectFit: "cover" }}
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
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {/* F2c: Copy ảnh QR */}
            <button
              className="btn btn-outline"
              style={{ flex: 1, justifyContent: "center", minWidth: 140 }}
              onClick={copyQrState === "error" ? () => window.open(qrImageUrl, "_blank") : handleCopyQr}
              disabled={copyQrState === "copying"}
            >
              <Icons.QrCode size={14} /> {copyQrLabel}
            </button>

            {/* F2b: Copy đầy đủ thông tin CK */}
            <button
              className="btn btn-outline"
              style={{ flex: 1, justifyContent: "center", minWidth: 140 }}
              onClick={() => copy(fullBankText)}
            >
              <Icons.Copy size={14} /> Copy nội dung CK
            </button>

            {qr.checkoutUrl ? (
              <button
                className="btn btn-outline"
                style={{ flex: 1, justifyContent: "center", minWidth: 140 }}
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
                deleting={deletingBill}
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
