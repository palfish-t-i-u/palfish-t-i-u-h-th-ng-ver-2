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
  onFile: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const images = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) {
      alert("Vui lòng chọn ảnh để upload!");
      return;
    }
    images.forEach((f) => onFile(f));
  };

  const handleFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      alert("Vui lòng chọn ảnh để upload!");
      return;
    }
    onFile(file);
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
          title="Da co anh bill - nhan de xem"
        >
          <Icons.Receipt size={13} /> Da co anh bill
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
        title={hasBill ? "Upload them bill (khong xoa bill cu)" : "Keo tha anh bill hoac bam de chon file"}
      >
        {uploading ? (
          <>Dang tai...</>
        ) : deleting ? (
          <>Dang xoa...</>
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
          const files = e.target.files;
          e.target.value = "";
          handleFiles(files);
        }}
      />
    </div>
  );
}
