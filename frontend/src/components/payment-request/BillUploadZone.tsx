import { useRef, useState } from "react";
import { Icons } from "./Icons";

export default function BillUploadZone({
  hasBill,
  uploading,
  onView,
  onFile,
}: {
  hasBill: boolean;
  uploading?: boolean;
  onView?: () => void;
  onFile: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      alert("Vui lòng chọn định dạng ảnh!");
      return;
    }
    onFile(file);
  };

  if (hasBill) {
    return (
      <span
        className="bill-upload has-bill"
        onClick={(e) => {
          e.stopPropagation();
          onView?.();
        }}
        title="Đã có ảnh biên lai — nhấn để xem"
      >
        {uploading ? (
          <>Đang tải...</>
        ) : (
          <>
            <Icons.Receipt size={13} /> Đã có ảnh bill
          </>
        )}
      </span>
    );
  }

  return (
    <div
      className={`bill-dropzone ${dragOver ? "is-drag-over" : ""} ${uploading ? "is-uploading" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        if (!uploading) inputRef.current?.click();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!uploading) setDragOver(true);
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
        if (uploading) return;
        const file = e.dataTransfer.files?.[0];
        if (file) handleFile(file);
      }}
      title="Kéo thả ảnh bill hoặc bấm để chọn file"
    >
      {uploading ? (
        <>Đang tải...</>
      ) : (
        <>
          <Icons.Upload size={13} />
          <span>Up bill</span>
        </>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) handleFile(file);
        }}
      />
    </div>
  );
}
