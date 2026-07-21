import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icons } from "./Icons";

/** Rút ảnh từ clipboard/drop — ưu tiên items (paste), fallback files (drop). */
function extractImages(dt: DataTransfer | null): File[] {
  if (!dt) return [];
  const out: File[] = [];
  for (const item of Array.from(dt.items ?? [])) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const f = item.getAsFile();
      if (f) out.push(f);
    }
  }
  if (out.length === 0 && dt.files) {
    for (const f of Array.from(dt.files)) {
      if (f.type.startsWith("image/")) out.push(f);
    }
  }
  return out;
}

export default function BillUploadZone({
  hasBill,
  uploading,
  deleting,
  onView,
  onFile,
}: {
  hasBill: boolean;
  uploading?: boolean;
  deleting?: boolean;
  onView?: () => void;
  onFile: (file: File) => void | Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [sessionCount, setSessionCount] = useState(0); // số ảnh đã tải trong lần mở modal này

  const busy = !!uploading || !!deleting;

  const handleFiles = async (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) {
      alert("Vui lòng chọn ảnh để upload!");
      return;
    }
    // Serialize uploads — each call's BE response refreshes state with the
    // full bill_images array. Parallel uploads would race and only the last
    // resolved response would be applied to FE state.
    for (const f of images) {
      await onFile(f);
      setSessionCount((c) => c + 1);
    }
  };

  const openModal = () => {
    if (busy) return;
    setSessionCount(0);
    setOpen(true);
  };

  // Ref giữ closure mới nhất để listener paste (gắn lúc mở modal) không bị stale.
  const liveRef = useRef({ uploading, deleting, handleFiles });
  liveRef.current = { uploading, deleting, handleFiles };

  // Khi modal mở: focus dropzone (để bàn phím + Ctrl+V nhắm đúng), nghe paste toàn
  // trang (modal là ngữ cảnh duy nhất → dán bất kỳ đâu là vào đúng dòng này) + Esc đóng.
  useEffect(() => {
    if (!open) return;
    dropRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onPaste = (e: ClipboardEvent) => {
      const s = liveRef.current;
      if (s.uploading || s.deleting) return;
      const images = extractImages(e.clipboardData);
      if (images.length === 0) return; // không có ảnh → để nguyên (không hijack)
      e.preventDefault();
      void s.handleFiles(images);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("paste", onPaste);
    };
  }, [open]);

  return (
    <div className="bill-upload-actions">
      {hasBill && (
        <span
          className="bill-upload has-bill"
          onClick={(e) => {
            e.stopPropagation();
            onView?.();
          }}
          title="Đã có ảnh bill — nhấn để xem"
        >
          <Icons.Receipt size={13} /> Đã có ảnh bill
        </span>
      )}

      <div
        role="button"
        tabIndex={busy ? -1 : 0}
        aria-label="Up bill — mở hộp dán / kéo-thả / chọn ảnh"
        className={`bill-dropzone ${busy ? "is-uploading" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          openModal();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openModal();
          }
        }}
        title={hasBill ? "Up thêm bill — dán (Ctrl+V), kéo-thả, hoặc chọn file" : "Up bill — dán (Ctrl+V), kéo-thả, hoặc chọn file"}
      >
        {uploading ? (
          <>Đang tải...</>
        ) : deleting ? (
          <>Đang xoá...</>
        ) : (
          <>
            <Icons.Upload size={13} />
            <span>Up bill</span>
          </>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          // Snapshot file list to array BEFORE clearing input (clearing nukes e.target.files).
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          void handleFiles(files);
        }}
      />

      {open &&
        createPortal(
          <div
            className="gmv-prototype gmv-prototype-modal-scrim"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
          >
            <div
              className="modal"
              style={{ width: "min(460px, 100%)" }}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label="Tải ảnh bill"
            >
              <div className="modal-head">
                <div>
                  <h3>Tải ảnh bill</h3>
                  <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
                    Dán ảnh (Ctrl+V), kéo-thả, hoặc chọn file — chọn được nhiều ảnh
                  </div>
                </div>
                <button className="drawer-close" onClick={() => setOpen(false)} aria-label="Đóng">
                  <Icons.Close size={16} />
                </button>
              </div>

              <div className="modal-body">
                <div
                  ref={dropRef}
                  role="button"
                  tabIndex={0}
                  aria-label="Vùng thả ảnh — bấm để chọn file, hoặc dán / kéo-thả"
                  className={`bill-drop-zone ${dragOver ? "is-drag-over" : ""} ${hasBill ? "has-bill" : ""}`}
                  style={{ padding: "28px 16px", outline: "none" }}
                  onClick={() => {
                    if (!busy) inputRef.current?.click();
                  }}
                  onKeyDown={(e) => {
                    if (busy) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      inputRef.current?.click();
                    }
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!busy) setDragOver(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDragOver(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDragOver(false);
                    if (busy) return;
                    void handleFiles(Array.from(e.dataTransfer.files ?? []));
                  }}
                >
                  {busy ? (
                    <div style={{ fontWeight: 600, color: "var(--primary-700)" }}>Đang xử lý…</div>
                  ) : (
                    <>
                      <Icons.Upload size={30} />
                      <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>Dán ảnh (Ctrl+V)</div>
                      <div>hoặc kéo-thả ảnh vào đây</div>
                      <div>
                        hoặc <span style={{ color: "var(--primary-700)", textDecoration: "underline" }}>bấm để chọn file</span>
                      </div>
                    </>
                  )}
                </div>

                {sessionCount > 0 && (
                  <div style={{ fontSize: 12.5, color: "var(--success-text)", fontWeight: 600, textAlign: "center" }}>
                    <Icons.Check size={13} style={{ verticalAlign: "-2px", marginRight: 4 }} />
                    Đã tải {sessionCount} ảnh
                  </div>
                )}
              </div>

              <div className="modal-foot">
                <button className="btn btn-primary btn-sm" onClick={() => setOpen(false)}>
                  Xong
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
