import { useEffect, useState } from "react";
import { Icons } from "./payment-request/Icons";
import { formatPaymentDateFull } from "./payment-request/paymentRequestUtils";
import { LAST_SYNC_AT, isExtInstalled, setExtInstalled } from "./card-recon/mockGatewayTxns";
import "../styles/prototype-payments.css";

function RefreshIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
      <polyline points="21 3 21 8 16 8" />
    </svg>
  );
}

const STEPS: [string, string][] = [
  ["Tải tiện ích", 'Bấm "Tải tiện ích" ở trên, rồi giải nén file .zip ra một thư mục.'],
  ["Mở trang tiện ích Chrome", "Gõ chrome://extensions vào thanh địa chỉ → Enter."],
  ["Bật chế độ nhà phát triển", 'Bật công tắc "Developer mode" (góc trên bên phải).'],
  ["Nạp tiện ích", 'Bấm "Load unpacked" → chọn đúng thư mục vừa giải nén.'],
  ["Đăng nhập mPOS / Payoo", "Mở mpos.vn và portal.payoo.vn, đăng nhập như thường ngày. Tiện ích tự kéo dữ liệu giao dịch về app."],
];

export default function GatewaySyncTab() {
  const [installed, setInstalled] = useState(isExtInstalled());
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(LAST_SYNC_AT);
  const [synced, setSynced] = useState<number | null>(null);

  useEffect(() => {
    const refresh = () => setInstalled(isExtInstalled());
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const toggleInstalled = () => {
    const v = !installed;
    setExtInstalled(v);
    setInstalled(v);
  };

  const handleSync = () => {
    if (syncing || !installed) return;
    setSyncing(true);
    setSynced(null);
    window.setTimeout(() => {
      setSyncing(false);
      setLastSync(formatPaymentDateFull(new Date().toISOString()));
      setSynced(Math.floor(Math.random() * 6)); // mock: số giao dịch mới kéo về
    }, 1200);
  };

  return (
    <div className="gmv-prototype">
      <div className="page">
        <div style={{ fontSize: 12.5, color: "var(--text-3)", maxWidth: 760, lineHeight: 1.55, marginBottom: 10 }}>
          Cài <strong style={{ color: "var(--text-2)" }}>1 lần</strong> tiện ích trình duyệt để app tự kéo giao dịch{" "}
          <strong style={{ color: "var(--text-2)" }}>mPOS</strong> & <strong style={{ color: "var(--text-2)" }}>Payoo</strong>{" "}
          về. Tiện ích dùng phiên đăng nhập sẵn của bạn — không cần nhập lại mật khẩu, không lưu mật khẩu ở đâu.
        </div>

        {/* Trạng thái + đồng bộ */}
        <div className="panel" style={{ padding: 16, marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span
              className={`badge ${installed ? "is-done" : "is-over"}`}
              style={{ fontSize: 12.5 }}
            >
              <span className="dot" />
              {installed ? "Tiện ích đã cài & hoạt động" : "Chưa cài tiện ích"}
            </span>
            {installed && (
              <span style={{ fontSize: 12.5, color: "var(--text-2)" }}>
                Đồng bộ gần nhất: <strong>{lastSync}</strong>
              </span>
            )}
            <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
              {installed ? (
                <button type="button" className="btn btn-outline btn-sm" onClick={handleSync} disabled={syncing}>
                  <RefreshIcon /> {syncing ? "Đang đồng bộ…" : "Đồng bộ ngay"}
                </button>
              ) : (
                <span style={{ fontSize: 12, color: "var(--text-3)" }}>Làm theo hướng dẫn bên dưới để cài</span>
              )}
            </div>
          </div>
          {synced != null && (
            <div
              style={{
                marginTop: 10,
                fontSize: 12.5,
                color: "var(--success-text)",
                background: "var(--success-bg)",
                borderRadius: 8,
                padding: "8px 12px",
              }}
            >
              <Icons.CheckCircle size={14} /> Đã đồng bộ — kéo về {synced} giao dịch mới. (Nếu không có giao dịch nào,
              kiểm tra đã đăng nhập mPOS/Payoo chưa.)
            </div>
          )}
        </div>

        {/* Tải + hướng dẫn cài */}
        <div className="panel" style={{ padding: 16 }}>
          <div className="panel-head" style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <h4>Cài tiện ích đồng bộ</h4>
            <a
              className="btn btn-primary btn-sm"
              href="#"
              onClick={(e) => e.preventDefault()}
              title="Bản cài sẽ có khi tiện ích hoàn thiện"
            >
              <Icons.Download size={14} /> Tải tiện ích (.zip)
            </a>
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text-3)", marginBottom: 12 }}>
            Chrome chỉ cho cài kiểu "Load unpacked" (giải nén rồi nạp thư mục) — đây là cách an toàn cho công cụ nội bộ.
          </div>

          <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            {STEPS.map(([title, desc], i) => (
              <li key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <span
                  style={{
                    flexShrink: 0,
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    background: "var(--primary-bg, var(--surface-3))",
                    color: "var(--primary, var(--text-2))",
                    fontSize: 12,
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {i + 1}
                </span>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text)" }}>{title}</div>
                  <div style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 1 }}>
                    {desc.split(/(chrome:\/\/extensions|Developer mode|Load unpacked)/g).map((part, idx) =>
                      ["chrome://extensions", "Developer mode", "Load unpacked"].includes(part) ? (
                        <code
                          key={idx}
                          style={{
                            background: "var(--surface-3)",
                            borderRadius: 4,
                            padding: "0 4px",
                            fontSize: 12,
                            color: "var(--text)",
                          }}
                        >
                          {part}
                        </code>
                      ) : (
                        <span key={idx}>{part}</span>
                      ),
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>

          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)", fontSize: 11.5, color: "var(--text-3)" }}>
            Cài rồi mà chưa thấy dữ liệu? Mở mPOS/Payoo đăng nhập lại rồi bấm "Đồng bộ ngay". Tiện ích tự chạy lại định kỳ
            khi trình duyệt mở.
          </div>
        </div>

        {/* Demo: giả lập trạng thái cài (gỡ khi nối tiện ích thật) */}
        <div style={{ marginTop: 12, fontSize: 11.5, color: "var(--text-3)", display: "flex", alignItems: "center", gap: 8 }}>
          <Icons.AlertCircle size={13} />
          <span>Bản xem thử — chưa nối tiện ích thật.</span>
          <button type="button" className="btn btn-outline btn-sm" onClick={toggleInstalled}>
            {installed ? "Giả lập: GỠ tiện ích" : "Giả lập: ĐÃ cài tiện ích"}
          </button>
        </div>
      </div>
    </div>
  );
}
