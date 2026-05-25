import { useCallback, useEffect, useRef, useState } from "react";
import { BANK_INFO } from "../constants/bank";
import { endpoints } from "../lib/api";
import { Button } from "./ui";
import Modal from "./ui/Modal";

interface Props {
  open: boolean;
  maDonHang: string;
  tongTien: number;
  infoCode: string;
  onClose: () => void;
}

type QrCopyState =
  | { kind: "idle" }
  | { kind: "ok" }
  | { kind: "downloaded" }
  | { kind: "err"; msg: string };

export default function PaymentModal({ open, maDonHang, tongTien, infoCode, onClose }: Props) {
  const [qrCopy, setQrCopy] = useState<QrCopyState>({ kind: "idle" });
  const imgRef = useRef<HTMLImageElement | null>(null);

  const [payosLoading, setPayosLoading] = useState(false);
  const [payosQrUrl, setPayosQrUrl] = useState("");
  const [payosCheckoutUrl, setPayosCheckoutUrl] = useState("");
  const [payosError, setPayosError] = useState("");

  const amountLabel = tongTien > 0 ? tongTien.toLocaleString("vi-VN") : "Chưa nhập";

  useEffect(() => {
    if (!open || tongTien <= 0) return;
    let cancelled = false;
    setPayosLoading(true);
    setPayosError("");
    setPayosQrUrl("");
    setPayosCheckoutUrl("");
    setQrCopy({ kind: "idle" });

    endpoints.payos
      .createLink({ amount: tongTien, infoCode, maDonHang })
      .then((res) => {
        if (cancelled) return;
        const { qrCode, checkoutUrl } = res.data;
        setPayosQrUrl(
          `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(qrCode)}`,
        );
        setPayosCheckoutUrl(checkoutUrl || "");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const msg =
          (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
          "Không tạo được QR PayOS.";
        setPayosError(msg);
      })
      .finally(() => {
        if (!cancelled) setPayosLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, tongTien, infoCode, maDonHang]);

  const flash = useCallback((s: QrCopyState) => {
    setQrCopy(s);
    setTimeout(() => setQrCopy({ kind: "idle" }), 2500);
  }, []);

  async function buildCompositeBlob(): Promise<Blob | null> {
    const img = imgRef.current;
    if (!img || !img.complete || img.naturalWidth === 0) return null;
    try {
      const pad = 20;
      const textAreaH = 64;
      const qrW = img.naturalWidth;
      const qrH = img.naturalHeight;
      const canvas = document.createElement("canvas");
      canvas.width = qrW + pad * 2;
      canvas.height = qrH + textAreaH + pad * 2;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, pad, pad, qrW, qrH);

      ctx.strokeStyle = "#e5e7eb";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad, qrH + pad + 10);
      ctx.lineTo(canvas.width - pad, qrH + pad + 10);
      ctx.stroke();

      ctx.fillStyle = "#6b7280";
      ctx.font = "13px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Nội dung chuyển khoản:", canvas.width / 2, qrH + pad + 30);

      ctx.fillStyle = "#d97706";
      ctx.font = "bold 18px monospace";
      ctx.fillText(infoCode, canvas.width / 2, qrH + pad + 55);

      return await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/png"),
      );
    } catch {
      return null;
    }
  }

  async function handleCopyQr() {
    const blobToUse = await buildCompositeBlob();
    if (!blobToUse) {
      flash({ kind: "err", msg: "Không lấy được ảnh QR. Thử chụp màn hình." });
      return;
    }

    const supportsClipboardImage =
      typeof window !== "undefined" &&
      typeof window.ClipboardItem !== "undefined" &&
      !!navigator.clipboard?.write;

    if (supportsClipboardImage && typeof window.ClipboardItem !== "undefined") {
      try {
        await navigator.clipboard.write([
          new window.ClipboardItem({ "image/png": blobToUse }),
        ]);
        flash({ kind: "ok" });
        return;
      } catch {
        /* fall through */
      }
    }

    const url = URL.createObjectURL(blobToUse);
    const a = document.createElement("a");
    a.href = url;
    a.download = `QR-${maDonHang || "payos"}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    flash({ kind: "downloaded" });
  }

  return (
    <Modal open={open} onClose={onClose} title="THÔNG TIN THANH TOÁN" wide className="relative">
      <button
        type="button"
        className="absolute right-4 top-4 text-2xl font-bold text-gmv-muted hover:text-gmv-text-strong"
        onClick={onClose}
        aria-label="Đóng"
      >
        ×
      </button>

      <p className="-mt-2 mb-4 text-center text-sm text-gmv-muted">
        Mã đơn: <strong className="text-gmv-text-strong">{maDonHang}</strong>
      </p>

      <div className="flex flex-col gap-6 md:flex-row md:items-stretch">
        <div className="flex-1 space-y-2 text-sm leading-relaxed">
          <InfoLine label="Tên tài khoản" value={BANK_INFO.accountName} />
          <InfoLine label="Ngân hàng" value={BANK_INFO.displayName} />
          <InfoLine label="Chi nhánh" value={BANK_INFO.branch} />
          <InfoLine label="Số tài khoản" value={BANK_INFO.accountNo} />
          <InfoLine label="Số tiền" value={`${amountLabel} VNĐ`} />
          <div className="pt-2">
            <div className="text-gmv-text">Nội dung CK (Info Code):</div>
            <span className="mt-1 inline-block rounded-gmv-sm border border-dashed border-gmv-warn bg-gmv-warn-soft px-2.5 py-1 text-base font-bold text-gmv-warn">
              {infoCode}
            </span>
            <p className="mt-1 text-xs italic text-gmv-danger">
              Khách PHẢI ghi đúng nội dung này khi chuyển khoản
            </p>
          </div>
          {payosCheckoutUrl && (
            <div className="pt-1">
              <a
                href={payosCheckoutUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-gmv-md border border-gmv-primary px-3 py-1.5 text-sm font-semibold text-gmv-primary hover:bg-gmv-primary-soft"
              >
                Mở trang thanh toán PayOS →
              </a>
            </div>
          )}
        </div>

        <div className="flex flex-col items-center justify-center border-t border-dashed border-gmv-border pt-4 md:w-[260px] md:border-l md:border-t-0 md:pl-5 md:pt-0">
          {payosLoading && (
            <div className="flex h-[240px] w-[240px] items-center justify-center rounded-gmv-md border border-gmv-border">
              <span className="animate-spin text-2xl text-gmv-muted">⟳</span>
            </div>
          )}
          {payosError && !payosLoading && (
            <div className="flex h-[200px] w-full flex-col items-center justify-center rounded-gmv-md border border-gmv-danger/30 bg-gmv-danger-soft p-4 text-center text-xs text-gmv-danger">
              <p className="font-semibold">Không tạo được QR PayOS</p>
              <p className="mt-1 opacity-75">{payosError}</p>
            </div>
          )}
          {!payosLoading && payosQrUrl && (
            <>
              <img
                ref={imgRef}
                src={payosQrUrl}
                alt="QR PayOS thanh toán"
                crossOrigin="anonymous"
                className="max-w-full rounded-gmv-md border border-gmv-border p-1"
                width={240}
                height={240}
              />
              <p className="mt-2 text-center text-xs font-semibold text-gmv-primary">
                Quét bằng App Ngân Hàng bất kỳ
              </p>
              <p className="mt-0.5 text-center text-xs italic text-gmv-muted">
                Nội dung CK: <strong>{infoCode}</strong>
              </p>
            </>
          )}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={handleCopyQr}
          disabled={payosLoading || !payosQrUrl}
        >
          Copy mã QR
        </Button>
        {qrCopy.kind === "ok" && (
          <span className="inline-block rounded-gmv-sm border border-gmv-ok/30 bg-gmv-ok-soft px-2.5 py-1 text-xs font-semibold text-gmv-ok">
            ✓ Đã copy mã QR — paste vào Zalo / chat / Word
          </span>
        )}
        {qrCopy.kind === "downloaded" && (
          <span className="inline-block rounded-gmv-sm border border-gmv-warn/30 bg-gmv-warn-soft px-2.5 py-1 text-xs font-semibold text-gmv-warn">
            ↓ Trình duyệt không hỗ trợ copy ảnh — đã tải file QR, đính kèm thủ công
          </span>
        )}
        {qrCopy.kind === "err" && (
          <span className="inline-block rounded-gmv-sm border border-gmv-danger/30 bg-gmv-danger-soft px-2.5 py-1 text-xs font-semibold text-gmv-danger">
            ✗ {qrCopy.msg}
          </span>
        )}
      </div>
    </Modal>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      {label}: <span className="font-bold text-gmv-primary">{value}</span>
    </div>
  );
}
