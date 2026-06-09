import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  isChunkError: boolean;
}

function isChunkLoadError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes("loading chunk") ||
      msg.includes("loading css chunk") ||
      msg.includes("dynamically imported module") ||
      msg.includes("failed to fetch") ||
      msg.includes("importing a module script failed")
    );
  }
  return false;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, isChunkError: false };

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, isChunkError: isChunkLoadError(error) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f5f6fb",
        fontFamily: "Inter, system-ui, sans-serif",
      }}>
        <div style={{
          textAlign: "center",
          maxWidth: 420,
          padding: "40px 24px",
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>
            {this.state.isChunkError ? "🔄" : "⚠️"}
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "#1c1f2a", marginBottom: 8 }}>
            {this.state.isChunkError
              ? "Ứng dụng đã được cập nhật"
              : "Đã xảy ra lỗi"}
          </h2>
          <p style={{ fontSize: 14, color: "#5a6075", lineHeight: 1.6, marginBottom: 24 }}>
            {this.state.isChunkError
              ? "Có phiên bản mới được triển khai. Bấm nút bên dưới để tải lại trang."
              : "Trang gặp lỗi không mong muốn. Bấm tải lại để thử lại."}
          </p>
          <button
            onClick={this.handleReload}
            style={{
              padding: "10px 28px",
              fontSize: 14,
              fontWeight: 600,
              color: "#fff",
              background: "#6f5cf3",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            Tải lại trang
          </button>
        </div>
      </div>
    );
  }
}
