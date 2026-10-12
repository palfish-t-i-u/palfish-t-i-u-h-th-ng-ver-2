import { useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Icons } from "../payment-request/Icons";
import { presetRange } from "../payment-request/DateRangeFilter";
import { endpoints } from "../../lib/api";
import { downloadFeedbackCsv } from "./feedbackCsv";

/**
 * Modal "Xuất CSV" cho Feedback lead. Chọn khoảng thời gian (preset + 2 ô ngày
 * hiện thẳng, KHÔNG dropdown lồng) + trạng thái rồi tải dữ liệu thô về.
 * Gọi lại endpoint list (RBAC đã áp ở BE) với bộ lọc riêng của modal — KHÔNG
 * ảnh hưởng bộ lọc/trang của bảng chính.
 *
 * Style: dùng class scrim (.field-row/.btn...) + inline var(--token) — scrim tự
 * định nghĩa token (prototype-payments.css) nên không cần wrap .gmv-prototype.
 */

const PRESETS: Array<[string, string]> = [
  ["today", "Hôm nay"],
  ["7d", "7 ngày"],
  ["30d", "30 ngày"],
  ["thismonth", "Tháng này"],
  ["all", "Toàn bộ"],
];

const labelStyle: CSSProperties = {
  display: "block",
  fontSize: 11,
  color: "var(--text-3)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  fontWeight: 600,
  marginBottom: 7,
};

const chipBase: CSSProperties = {
  padding: "6px 12px",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
  background: "white",
  color: "var(--text-2)",
};

const chipActive: CSSProperties = {
  background: "var(--primary-50)",
  borderColor: "var(--primary)",
  color: "var(--primary-700)",
};

const inputStyle: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 9,
  padding: "8px 11px",
  fontSize: 13,
  background: "white",
  color: "var(--text)",
  width: "100%",
};

export default function ExportFeedbackModal({ onClose }: { onClose: () => void }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [preset, setPreset] = useState("all");
  const [status, setStatus] = useState<"" | "wait" | "done">("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const applyPreset = (key: string) => {
    const r = presetRange(key);
    setFrom(r.from);
    setTo(r.to);
    setPreset(key);
  };

  const onExport = async () => {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const { data } = await endpoints.leadFeedback.list({
        status: status || undefined,
        date_from: from || undefined,
        date_to: to || undefined,
      });
      const items = data.items;
      if (items.length === 0) {
        setErr("Không có feedback nào khớp bộ lọc đã chọn.");
        return;
      }
      const part = from || to ? `${from || "dau"}_den_${to || "nay"}` : "tat_ca";
      downloadFeedbackCsv(items, `feedback_lead_${part}.csv`);
      setMsg(
        `Đã xuất ${items.length} dòng.` +
          (items.length >= 500
            ? " ⚠️ Đạt giới hạn 500 dòng/lần — có thể còn dòng chưa xuất, hãy thu hẹp khoảng thời gian."
            : ""),
      );
    } catch (e) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setErr(detail || "Không xuất được dữ liệu. Thử lại.");
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="gmv-prototype-modal-scrim" onClick={() => !busy && onClose()}>
      <div
        className="modal"
        style={{ width: "min(480px, 100%)" }}
        role="dialog"
        aria-modal="true"
        aria-label="Xuất CSV feedback"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <h3>Xuất CSV dữ liệu thô</h3>
          </div>
          <button className="drawer-close" onClick={onClose} disabled={busy} aria-label="Đóng">
            <Icons.Close size={16} />
          </button>
        </div>

        <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={labelStyle}>Khoảng thời gian</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
              {PRESETS.map(([key, text]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => applyPreset(key)}
                  style={preset === key ? { ...chipBase, ...chipActive } : chipBase}
                >
                  {text}
                </button>
              ))}
            </div>
            <div className="field-row">
              <div>
                <label style={{ ...labelStyle, marginBottom: 4 }}>Từ ngày</label>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => {
                    setFrom(e.target.value);
                    setPreset("custom");
                  }}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ ...labelStyle, marginBottom: 4 }}>Đến ngày</label>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => {
                    setTo(e.target.value);
                    setPreset("custom");
                  }}
                  style={inputStyle}
                />
              </div>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Loại dữ liệu (theo trạng thái)</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as "" | "wait" | "done")}
              style={inputStyle}
            >
              <option value="">Tất cả</option>
              <option value="wait">Chờ MKT feedback</option>
              <option value="done">MKT đã feedback</option>
            </select>
          </div>

          {err && (
            <div
              style={{
                fontSize: 12.5,
                color: "var(--danger-text)",
                background: "var(--danger-bg)",
                border: "1px solid var(--danger)",
                borderRadius: 8,
                padding: "8px 12px",
              }}
            >
              {err}
            </div>
          )}
          {msg && (
            <div
              style={{
                fontSize: 12.5,
                color: "var(--text-2)",
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "8px 12px",
                lineHeight: 1.5,
              }}
            >
              {msg}
            </div>
          )}
        </div>

        <div className="modal-foot">
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>
            Đóng
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void onExport()} disabled={busy}>
            {busy ? (
              "Đang xuất…"
            ) : (
              <>
                <Icons.Download size={14} /> Tải CSV về
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
