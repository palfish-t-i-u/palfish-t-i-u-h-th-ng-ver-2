import { useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icons } from "../payment-request/Icons";
import { findSourceByKey, resolveChannel } from "../../constants/leadSource";
import { endpoints } from "../../lib/api";
import type { LeadFeedback } from "../../types/leadFeedback";
import ImageDropZone, { type HeldImage } from "./ImageDropZone";

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function StatusBadge({ status }: { status: LeadFeedback["status"] }) {
  return status === "done" ? (
    <span className="badge is-done">
      <span className="dot" /> MKT đã feedback
    </span>
  ) : (
    <span className="badge is-waiting">
      <span className="dot" /> Chờ MKT feedback
    </span>
  );
}

function Thumbs({ images }: { images: { url: string }[] }) {
  if (!images || images.length === 0) return <div style={{ fontSize: 12.5, color: "var(--text-3)" }}>Không có ảnh.</div>;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {images.map((im, i) => (
        <a
          key={i}
          href={im.url}
          target="_blank"
          rel="noreferrer"
          style={{ width: 64, height: 64, borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)", display: "block" }}
        >
          <img src={im.url} alt="bằng chứng" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </a>
      ))}
    </div>
  );
}

const GROUP_T: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  color: "var(--text-2)",
};

export default function FeedbackDetailModal({
  item,
  canReview,
  onClose,
  onUpdated,
}: {
  item: LeadFeedback;
  canReview: boolean;
  onClose: () => void;
  onUpdated: (next: LeadFeedback) => void;
}) {
  const [mktNote, setMktNote] = useState(item.mkt_note ?? "");
  const [mktImages, setMktImages] = useState<HeldImage[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const src = findSourceByKey(item.lead_source);
  const ch = resolveChannel(item.lead_source, item.lead_channel);
  const alreadyDone = !!item.mkt_note; // đã có nhận xét MKT
  const showEditForm = canReview && !alreadyDone;

  const submit = async () => {
    setErr(null);
    if (!mktNote.trim()) {
      setErr("Nhập nhận xét của team Marketing.");
      return;
    }
    setSaving(true);
    try {
      for (const im of mktImages) {
        await endpoints.leadFeedback.uploadImage(item.id, "mkt", im.file, im.file.name || "mkt.jpg");
      }
      const { data } = await endpoints.leadFeedback.mktFeedback(item.id, mktNote.trim());
      onUpdated(data.item);
      onClose();
    } catch (e) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setErr(msg || "Không gửi được nhận xét. Thử lại.");
      setSaving(false);
    }
  };

  const roItem = (k: string, v: ReactNode) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
      <div style={{ fontSize: 11, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>{k}</div>
      <div style={{ fontSize: 13.5, color: "var(--text)", fontWeight: 500, wordBreak: "break-word" }}>{v || "—"}</div>
    </div>
  );

  return createPortal(
    <div className="gmv-prototype-modal-scrim" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Chi tiết feedback lead"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <h3 style={{ display: "flex", alignItems: "center", gap: 10 }}>
              Chi tiết feedback lead <StatusBadge status={item.status} />
            </h3>
            <div style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 2 }}>
              {item.sale_name || item.sale_email} · {fmtDateTime(item.created_at)}
            </div>
          </div>
          <button className="drawer-close" onClick={onClose} aria-label="Đóng">
            <Icons.Close size={16} />
          </button>
        </div>

        <div className="modal-body">
          <div style={GROUP_T}>
            Thông tin lead{" "}
            <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "var(--text-3)" }}>
              (sale điền — chỉ xem)
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px 18px" }}>
            {roItem("Khách", item.customer_name)}
            {roItem("SĐT", item.phone)}
            {roItem("UID", item.uid)}
            {roItem("Nguồn", src?.label)}
            {roItem("Kênh", ch?.label)}
          </div>

          <div style={{ ...GROUP_T, marginTop: 6 }}>
            Bằng chứng &amp; ghi chú{" "}
            <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "var(--text-3)" }}>
              (sale điền — chỉ xem)
            </span>
          </div>
          <div className="field">
            <label>Ghi chú của sale</label>
            <div
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "10px 12px",
                fontSize: 13,
                color: "var(--text)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {item.sale_note || "—"}
            </div>
          </div>
          <div className="field">
            <label>Ảnh bằng chứng</label>
            <Thumbs images={item.sale_images} />
          </div>

          <div
            style={{
              ...GROUP_T,
              marginTop: 8,
              display: "flex",
              alignItems: "center",
              gap: 7,
              color: "var(--primary-700)",
            }}
          >
            <Icons.AlertCircle size={14} /> Nhận xét của team Marketing
          </div>

          {showEditForm ? (
            <>
              <div className="field">
                <label>
                  Nhận xét của team MKT <span style={{ color: "var(--danger)" }}>*</span>
                </label>
                <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 2 }}>
                  Điền sau khi đã kiểm chứng lead. Gửi xong sẽ cập nhật trạng thái “MKT đã feedback”.
                </div>
                <textarea
                  placeholder="VD: Đã xác minh lead có thật, nguồn Livestream đúng. Chất lượng khá, nên tiếp tục chăm."
                  value={mktNote}
                  onChange={(e) => setMktNote(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Ảnh đính kèm (nếu cần)</label>
                <ImageDropZone images={mktImages} onChange={setMktImages} disabled={saving} />
              </div>
            </>
          ) : alreadyDone ? (
            <>
              <div className="field">
                <label>Nhận xét của team MKT</label>
                <div
                  style={{
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: "10px 12px",
                    fontSize: 13,
                    color: "var(--text)",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {item.mkt_note}
                </div>
                {(item.mkt_by || item.mkt_at) && (
                  <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 4 }}>
                    {item.mkt_by || ""}
                    {item.mkt_at ? ` · ${fmtDateTime(item.mkt_at)}` : ""}
                  </div>
                )}
              </div>
              <div className="field">
                <label>Ảnh đính kèm</label>
                <Thumbs images={item.mkt_images} />
              </div>
            </>
          ) : (
            <div style={{ fontSize: 12.5, color: "var(--text-3)" }}>
              Chưa có nhận xét từ team Marketing.
            </div>
          )}

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
        </div>

        <div className="modal-foot">
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={saving}>
            Đóng
          </button>
          {showEditForm && (
            <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={saving}>
              {saving ? "Đang gửi…" : "Gửi feedback cho sale"}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
