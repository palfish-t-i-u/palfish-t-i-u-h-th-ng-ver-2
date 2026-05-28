import { useRef, useState } from "react";
import { Icons } from "./Icons";

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
  const [dragOver, setDragOver] = useState(false);

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
        className={`bill-dropzone ${dragOver ? "is-drag-over" : ""} ${uploading || deleting ? "is-uploading" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          if (!uploading && !deleting) inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!uploading && !deleting) setDragOver(true);
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
          if (uploading || deleting) return;
          const file = e.dataTransfer.files?.[0];
          if (file) handleFile(file);
        }}
        title={hasBill ? "Upload thêm bill (không xoá bill cũ) — chọn được nhiều ảnh" : "Kéo thả ảnh bill hoặc bấm để chọn file (có thể chọn nhiều)"}
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
    </div>
  );
}
