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

  const handleFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      alert("Vui long chon anh de upload!");
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
