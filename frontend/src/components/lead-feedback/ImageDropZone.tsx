import { useEffect, useRef } from "react";
import { Icons } from "../payment-request/Icons";

export interface HeldImage {
  id: string;
  file: File;
  url: string; // object URL để preview
}

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

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

/**
 * Vùng chọn ảnh GIỮ LOCAL (chưa upload) — dán (Ctrl+V) / kéo-thả / bấm chọn,
 * hiện thumbnail + nút xoá. Trả danh sách ảnh qua onChange; nơi gọi tự upload khi lưu.
 * Chỉ mount 1 zone mỗi modal (listener paste gắn toàn trang trong lúc mount).
 */
export default function ImageDropZone({
  images,
  onChange,
  disabled,
}: {
  images: HeldImage[];
  onChange: (next: HeldImage[]) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const addFiles = (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith("image/"));
    if (imgs.length === 0) return;
    const added = imgs.map((file) => ({ id: newId(), file, url: URL.createObjectURL(file) }));
    onChange([...images, ...added]);
  };

  const removeAt = (id: string) => {
    const target = images.find((im) => im.id === id);
    if (target) URL.revokeObjectURL(target.url);
    onChange(images.filter((im) => im.id !== id));
  };

  // Listener paste gắn lại theo closure mới nhất (images/onChange/disabled) — dán ảnh bất kỳ đâu trong modal.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (disabled) return;
      const imgs = extractImages(e.clipboardData);
      if (imgs.length === 0) return; // không có ảnh → không hijack
      e.preventDefault();
      addFiles(imgs);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  });

  // Dọn object URL của ảnh hiện tại khi unmount (ref cập nhật trong effect, không đụng lúc render).
  const imagesRef = useRef(images);
  useEffect(() => {
    imagesRef.current = images;
  }, [images]);
  useEffect(() => {
    return () => {
      for (const im of imagesRef.current) URL.revokeObjectURL(im.url);
    };
  }, []);

  return (
    <div>
      <div
        ref={dropRef}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label="Vùng thả ảnh bằng chứng — dán, kéo-thả hoặc bấm chọn"
        style={{
          border: "1.5px dashed var(--field-border)",
          borderRadius: 10,
          padding: "16px 14px",
          textAlign: "center",
          fontSize: 12.5,
          color: "var(--text-2)",
          cursor: disabled ? "not-allowed" : "pointer",
          background: "var(--surface-2)",
          outline: "none",
        }}
        onClick={() => {
          if (!disabled) inputRef.current?.click();
        }}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (disabled) return;
          addFiles(Array.from(e.dataTransfer.files ?? []));
        }}
      >
        <b style={{ color: "var(--text)" }}>Dán ảnh (Ctrl+V)</b> · kéo-thả ·{" "}
        <span style={{ color: "var(--primary-700)", textDecoration: "underline" }}>bấm chọn file</span>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: "none" }}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          addFiles(files);
        }}
      />

      {images.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
          {images.map((im) => (
            <div
              key={im.id}
              style={{
                position: "relative",
                width: 64,
                height: 64,
                borderRadius: 8,
                overflow: "hidden",
                border: "1px solid var(--border)",
              }}
            >
              <img src={im.url} alt="bằng chứng" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              <button
                type="button"
                aria-label="Xoá ảnh"
                onClick={() => removeAt(im.id)}
                style={{
                  position: "absolute",
                  top: 2,
                  right: 2,
                  width: 18,
                  height: 18,
                  borderRadius: 999,
                  border: "none",
                  background: "rgba(15,17,30,0.6)",
                  color: "white",
                  display: "grid",
                  placeItems: "center",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                <Icons.Close size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
