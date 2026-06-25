import { Icons } from "./Icons";

interface Props {
  visible: boolean;
  loading?: boolean;
  onRefresh: () => void;
  onDismiss: () => void;
}

export default function PrStaleContentWarning({
  visible,
  loading = false,
  onRefresh,
  onDismiss,
}: Props) {
  if (!visible) return null;

  return (
    <div
      role="alert"
      style={{
        background: "var(--warning-bg, #fef3c7)",
        border: "1px solid var(--warning, #f59e0b)",
        borderRadius: 8,
        padding: "10px 12px",
        marginBottom: 8,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        <span style={{ fontSize: 18, lineHeight: 1, marginTop: 1 }}>⚠️</span>
        <div style={{ flex: 1, fontSize: 13, color: "var(--text-1, #1f2937)" }}>
          <strong>Khách đã đổi thông tin.</strong>{" "}
          Nội dung CK của lần thanh toán này vẫn dùng tên / số điện thoại cũ.
          Bấm <strong>Cập nhật QR</strong> để dùng thông tin mới, hoặc <strong>Huỷ</strong> để giữ nguyên.
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={onDismiss}
          disabled={loading}
        >
          Huỷ
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => onRefresh()}
          disabled={loading}
          style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
        >
          <Icons.QrCode size={13} />
          {loading ? "Đang cập nhật…" : "Cập nhật QR"}
        </button>
      </div>
    </div>
  );
}
