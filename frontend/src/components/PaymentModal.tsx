import { useCallback, useEffect, useRef, useState } from "react";
import { BANK_INFO, buildVietQrUrl } from "../constants/bank";
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

  const qrUrl = buildVietQrUrl(tongTien, infoCode);
  const amountLabel = tongTien > 0 ? tongTien.toLocaleString("vi-VN") : "Chưa nhập";

  useEffect(() => {
    if (open) setQrCopy({ kind: "idle" });
  }, [open, qrUrl]);

  const flash = useCallback((s: QrCopyState) => {
    setQrCopy(s);
    setTimeout(() => setQrCopy({ kind: "idle" }), 2500);
  }, []);

  async function fetchQrBlob(): Promise<Blob | null> {
    try {
      const res = await fetch(qrUrl, { mode: "cors", cache: "no-store" });
      if (!res.ok) return null;
      const blob = await res.blob();
      return blob.type.startsWith("image/") ? blob : null;
    } catch {
      return null;
    }
  }

  async function blobFromCanvas(): Promise<Blob | null> {
    const img = imgRef.current;
    if (!img || !img.complete || img.naturalWidth === 0) return null;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0);
      return await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/png"),
      );
    } catch {
      return null;
    }
  }

  function downloadBlob(blob: Blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `QR-${maDonHang || "vietqr"}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function handleCopyQr() {
    const supportsClipboardImage =
      typeof window !== "undefined" &&
      typeof window.ClipboardItem !== "undefined" &&
      !!navigator.clipboard?.write;

    if (supportsClipboardImage && typeof window.ClipboardItem !== "undefined") {
      try {
        const item = new window.ClipboardItem({
          "image/png": (async () => {
            const blob = (await fetchQrBlob()) || (await blobFromCanvas());
            if (!blob) throw new Error("no-blob");
            return blob;
          })(),
        });
        await navigator.clipboard.write([item]);
        flash({ kind: "ok" });
        return;
      } catch {
      }
    }

    const blob = (await fetchQrBlob()) || (await blobFromCanvas());
    if (!blob) {
      flash({ kind: "err", msg: "Không lấy được ảnh QR. Thử lại hoặc chụp màn hình." });
      return;
    }
    downloadBlob(blob);
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
          </div>
        </div>

        <div className="flex flex-col items-center justify-center border-t border-dashed border-gmv-border pt-4 md:w-[220px] md:border-l md:border-t-0 md:pl-5 md:pt-0">
          <img
            ref={imgRef}
            src={qrUrl}
            alt="QR chuyển khoản"
            crossOrigin="anonymous"
            className="max-w-full rounded-gmv-md border border-gmv-border p-1"
          />
          <p className="mt-2 text-center text-xs italic text-gmv-muted">
            Quét mã bằng App Ngân Hàng
            <br />
            để điền tự động Số Tiền &amp; Nội Dung
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        <Button type="button" variant="primary" size="sm" onClick={handleCopyQr}>
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
