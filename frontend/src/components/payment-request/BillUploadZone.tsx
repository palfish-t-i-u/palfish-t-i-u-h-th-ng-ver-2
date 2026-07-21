import { useEffect, useRef, useState } from "react";
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
  const zoneRef = useRef<HTMLDivElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [active, setActive] = useState(false); // hover hoặc focus → sẵn sàng nhận Ctrl+V

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
    }
  };

  const handleFile = (file: File) => {
    void handleFiles([file]);
  };

  // Paste ảnh (Ctrl/⌘+V) khi ô đang được trỏ vào (hover) hoặc đang focus — đúng
  // bằng lúc hiện hint "Ctrl+V để dán" (active). Nghe ở cấp document vì paste chỉ
  // tới element đang focus, hover không tự nhận được. Ref giữ closure mới nhất để
  // listener gắn 1 lần, không bị stale.
  const pasteStateRef = useRef({ active, uploading, deleting, handleFiles });
  pasteStateRef.current = { active, uploading, deleting, handleFiles };

  useEffect(() => {
    const onDocPaste = (e: ClipboardEvent) => {
      const s = pasteStateRef.current;
      if (s.uploading || s.deleting) return;
      const zone = zoneRef.current;
      if (!zone) return;
      // Ô này đang được nhắm tới? active = hover/focus; kèm focus-within phòng
      // khi con focus (không có, nhưng an toàn) mà state chưa kịp cập nhật.
      if (!s.active && !zone.contains(document.activeElement)) return;
      const images = extractImages(e.clipboardData);
      if (images.length === 0) return; // paste text → để nguyên cho input khác
      e.preventDefault();
      void s.handleFiles(images);
    };
    document.addEventListener("paste", onDocPaste);
    return () => document.removeEventListener("paste", onDocPaste);
  }, []);

  const busy = !!uploading || !!deleting;

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
        ref={zoneRef}
        role="button"
        tabIndex={busy ? -1 : 0}
        aria-label="Up bill — dán ảnh (Ctrl+V), kéo thả, hoặc bấm để chọn file"
        className={`bill-dropzone ${dragOver ? "is-drag-over" : ""} ${active ? "is-paste-ready" : ""} ${busy ? "is-uploading" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          if (!busy) inputRef.current?.click();
        }}
        onKeyDown={(e) => {
          if (busy) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onMouseEnter={() => setActive(true)}
        onMouseLeave={() => setActive(false)}
        onFocus={() => setActive(true)}
        onBlur={() => setActive(false)}
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
          const file = e.dataTransfer.files?.[0];
          if (file) handleFile(file);
        }}
        title={
          hasBill
            ? "Thêm bill: dán ảnh (Ctrl+V) khi trỏ vào ô, kéo thả, hoặc bấm chọn file — không xoá bill cũ, chọn được nhiều ảnh"
            : "Dán ảnh (Ctrl+V) khi trỏ vào ô, kéo thả, hoặc bấm để chọn file (có thể nhiều ảnh)"
        }
      >
        {uploading ? (
          <>Đang tải...</>
        ) : deleting ? (
          <>Đang xoá...</>
        ) : active ? (
          <>
            <Icons.Upload size={13} />
            <span>Ctrl+V để dán</span>
          </>
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
    </div>
  );
}
