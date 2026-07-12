import { useRef, useState } from "react";
import { BANK_INFO } from "../../constants/bank";
import type { PaymentAttempt, PaymentRequest } from "../../types/paymentRequest";
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
            data-qr-capture-hide="true"
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
}: {
  qr: PaymentAttempt | null;
  request: PaymentRequest | null;
  onClose: () => void;
}) {
  const [copyQrState, setCopyQrState] = useState<"idle" | "copying" | "done" | "error" | "verifyfail">("idle");
  const [captureState, setCaptureState] = useState<"idle" | "capturing" | "done" | "downloaded" | "error" | "verifyfail">("idle");
  // Derived state: imgReadyUrl lưu URL đã load xong. imgReady = (URL hiện tại đã load chưa).
  // Lý do KHÔNG dùng useState+useEffect: useEffect chạy SAU render commit, tạo race window
  // (button còn enable, browser còn hiện bitmap cũ trong vài ms) → chụp nhầm QR cũ.
  // Prod incident 26/6/2026 (PR-0080/0081 chị Quỳnh/chị Thủy 4.7M).
  const [imgReadyUrl, setImgReadyUrl] = useState<string>("");
  const imgRef = useRef<HTMLImageElement>(null);
  const captureRef = useRef<HTMLDivElement>(null);

  const country = qr && request ? findCountry(request.country) : null;
  const transferCode = qr ? qr.transferContent || qr.code : "";
  const qrImageUrl = qr ? buildQrUrl(qr.amount, transferCode) : "";
  const fullBankText = qr ? buildFullBankText(qr.amount, transferCode) : "";
  const imgReady = qrImageUrl !== "" && imgReadyUrl === qrImageUrl;

  if (!qr || !request || !country) return null;

  const copy = (text: string) => navigator.clipboard?.writeText(text).catch(() => {});

  // Defensive guard: img.currentSrc PHẢI khớp qrImageUrl hiện tại trước khi capture/copy.
  // Phòng race rare khi browser còn hiện bitmap cũ dù imgReady đã true. Mismatch = abort.
  const isImgFresh = (): boolean => {
    const img = imgRef.current;
    if (!img) return false;
    // currentSrc = URL browser thực sự đã resolve/fetch; src = attribute thô.
    // So sánh cả hai để chắc chắn DOM ⇔ state đồng bộ.
    return img.currentSrc === qrImageUrl || img.src === qrImageUrl;
  };

  const verifyQrBlob = async (blob: Blob): Promise<"ok" | "mismatch" | "unreadable"> => {
    if (!qr.code) { console.warn("[QR-GUARD] line không có code — skip verify"); return "ok"; }
    try {
      const { decodeQrFromBlob, verifyQrPayload } = await import("./qrVerify");
      const payload = await decodeQrFromBlob(blob);
      if (!payload) return "unreadable";
      return verifyQrPayload(payload, { transferCode: qr.code, amount: qr.amount })
        ? "ok" : "mismatch";
    } catch { return "unreadable"; }
  };

  const handleCopyQr = async () => {
    if (!isImgFresh()) {
      setCopyQrState("error");
      setTimeout(() => setCopyQrState("idle"), 2500);
      return;
    }
    setCopyQrState("copying");
    try {
      const resp = await fetch(qrImageUrl);
      const blob = await resp.blob();
      const verdict = await verifyQrBlob(blob);
      if (verdict !== "ok") {
        console.error(`[QR-GUARD] chặn copy: ${verdict}`, { expected: transferCode, url: qrImageUrl });
        setCopyQrState("verifyfail");
        setTimeout(() => setCopyQrState("idle"), 4000);
        return;
      }
      const pngBlob = blob.type === "image/png" ? blob : new Blob([await blob.arrayBuffer()], { type: "image/png" });
      await navigator.clipboard.write([new ClipboardItem({ "image/png": pngBlob })]);
      setCopyQrState("done");
    } catch {
      setCopyQrState("error");
    }
    setTimeout(() => setCopyQrState("idle"), 2500);
  };

  const handleCaptureQr = async () => {
    if (!captureRef.current) return;
    if (!isImgFresh()) {
      setCaptureState("error");
      setTimeout(() => setCaptureState("idle"), 2500);
      return;
    }
    setCaptureState("capturing");
    try {
      const { toBlob } = await import("html-to-image");
      const blob = await toBlob(captureRef.current, {
        backgroundColor: "#ffffff",
        pixelRatio: 2,
        // Incident 7/7/2026 (PR-2026-0135/0136): html-to-image cache resource theo
        // URL ĐÃ CẮT query params (getCacheKey trong dataurl.js). Mọi QR vietqr.io
        // chỉ khác nhau ở query → capture thứ 2 trong phiên nhúng bitmap QR cũ.
        // includeQueryParams: true buộc cache key = full URL. KHÔNG ĐƯỢC BỎ.
        includeQueryParams: true,
        filter: (node) =>
          !(node instanceof HTMLElement && node.dataset.qrCaptureHide === "true"),
      });
      if (!blob) throw new Error("toBlob returned null");

      const verdict = await verifyQrBlob(blob);
      if (verdict !== "ok") {
        console.error(`[QR-GUARD] chặn capture: ${verdict}`, { expected: transferCode, url: qrImageUrl });
        setCaptureState(verdict === "mismatch" ? "verifyfail" : "error");
        setTimeout(() => setCaptureState("idle"), 4000);
        return;
      }

      let copied = false;
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        copied = true;
      } catch {
        // clipboard không hỗ trợ → fallback download
      }

      if (!copied) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `QR-${transferCode}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }
      setCaptureState(copied ? "done" : "downloaded");
    } catch {
      setCaptureState("error");
    }
    setTimeout(() => setCaptureState("idle"), 2500);
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
    : copyQrState === "verifyfail"
    ? "QR không khớp — F5 thử lại"
    : "Copy mã QR";

  const captureLabel = captureState === "capturing"
    ? "Đang chụp…"
    : captureState === "done"
    ? "Đã copy ảnh — paste vào chat!"
    : captureState === "downloaded"
    ? "Clipboard lỗi — đã tải ảnh"
    : captureState === "error"
    ? "Lỗi — thử lại"
    : captureState === "verifyfail"
    ? "QR không khớp nội dung — bấm F5 rồi thử lại"
    : "Chụp mã QR";

  return (
    <div className="gmv-prototype gmv-prototype-modal-scrim" onClick={onClose}>
      <div className="modal qr-view-modal" style={{ width: "min(720px, 100%)" }} onClick={(e) => e.stopPropagation()}>
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
          {/* Capture target — phần này sẽ được chụp ảnh */}
          <div
            ref={captureRef}
            style={{ background: "#fff", borderRadius: 12, padding: 16 }}
          >
            <div className="qr-detail-card" style={{ alignItems: "flex-start", gap: 24 }}>
              {/* QR image */}
              <div
                className="qr-img-wrap"
                style={{
                  flexShrink: 0,
                  border: "1px solid #e5e7eb",
                  borderRadius: 10,
                  overflow: "hidden",
                  background: "#fff",
                  width: 240,
                  minHeight: 240,
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <img
                  // key buộc remount khi URL đổi → không bao giờ hiển thị PNG cũ
                  key={qrImageUrl}
                  ref={imgRef}
                  src={qrImageUrl}
                  alt="VietQR"
                  // Bắt buộc cho html-to-image.toBlob: thiếu crossOrigin →
                  // canvas bị CORS-taint → toBlob throws → clipboard không
                  // được ghi → sale paste ra clipboard cũ (ảnh QR khách trước).
                  crossOrigin="anonymous"
                  // Chỉ set imgReadyUrl = URL hiện tại khi load xong.
                  // Nếu URL đã đổi (rerender), onLoad của img cũ KHÔNG còn quan trọng
                  // vì derived imgReady = (imgReadyUrl === qrImageUrl) sẽ vẫn false.
                  onLoad={() => setImgReadyUrl(qrImageUrl)}
                  onError={() => setImgReadyUrl("")}
                  style={{
                    width: "100%",
                    height: "100%",
                    maxHeight: 360,
                    display: "block",
                    objectFit: "contain",
                    background: "#fff",
                    opacity: imgReady ? 1 : 0,
                    transition: "opacity 120ms ease-out",
                  }}
                />
                {!imgReady && (
                  <div
                    data-qr-capture-hide="true"
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      background: "#fff",
                      color: "var(--text-3)",
                      fontSize: 12,
                    }}
                  >
                    <span style={{ fontSize: 22 }} className="animate-spin">⟳</span>
                    <span>Đang tải QR…</span>
                  </div>
                )}
              </div>

              {/* Bank info panel */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 2 }}>
                  {country.flag} {country.dial} {fmtPhone(request.phone)} · {request.name}
                </div>

                <BankInfoRow label="Ngân hàng" value={BANK_INFO.displayName} />
                <BankInfoRow label="Chủ tài khoản" value={BANK_INFO.accountName} />
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
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {/* Chụp toàn bộ card QR + thông tin CK — chặn khi ảnh chưa load để không chụp nhầm QR cũ */}
            <button
              className="btn btn-primary"
              style={{ flex: 1, justifyContent: "center", minWidth: 140 }}
              onClick={handleCaptureQr}
              disabled={captureState === "capturing" || !imgReady}
              title={!imgReady ? "Đợi QR tải xong rồi mới chụp" : undefined}
            >
              <Icons.Download size={14} /> {!imgReady ? "Đang tải QR…" : captureLabel}
            </button>

            {/* Copy ảnh QR */}
            <button
              className="btn btn-outline"
              style={{ flex: 1, justifyContent: "center", minWidth: 140 }}
              onClick={copyQrState === "error" ? () => window.open(qrImageUrl, "_blank") : handleCopyQr}
              disabled={copyQrState === "copying" || !imgReady}
              title={!imgReady ? "Đợi QR tải xong rồi mới copy" : undefined}
            >
              <Icons.QrCode size={14} /> {!imgReady ? "Đang tải QR…" : copyQrLabel}
            </button>

            {/* Copy đầy đủ thông tin CK */}
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
