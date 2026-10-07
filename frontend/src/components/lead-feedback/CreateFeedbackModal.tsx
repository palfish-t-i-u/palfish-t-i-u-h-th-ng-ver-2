import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Icons } from "../payment-request/Icons";
import { formatPhoneIntl } from "../payment-request/phoneUtils";
import {
  LEAD_SOURCES,
  findSourceByKey,
  channelValue,
  sourceHasChannels,
} from "../../constants/leadSource";
import { endpoints } from "../../lib/api";
import ImageDropZone, { type HeldImage } from "./ImageDropZone";

/** Suy ra nguồn + kênh từ mã CRM của lead (crm_code = channel code, vd 300265). */
function resolveSourceFromCrmCode(crmCode: string | null | undefined): {
  sourceKey: string;
  channel: string;
} | null {
  if (!crmCode) return null;
  for (const s of LEAD_SOURCES) {
    const ch = s.channels.find((c) => c.code === crmCode);
    if (ch) return { sourceKey: s.key, channel: channelValue(ch) };
  }
  return null;
}

export default function CreateFeedbackModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [phone, setPhone] = useState("");
  const [uid, setUid] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [sourceKey, setSourceKey] = useState("");
  const [channel, setChannel] = useState("");
  const [leadId, setLeadId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [images, setImages] = useState<HeldImage[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [lookupStatus, setLookupStatus] = useState<"idle" | "loading" | "matched" | "none" | "error">("idle");
  const [matchedName, setMatchedName] = useState<string | null>(null);

  const channelOptions = useMemo(() => {
    const src = findSourceByKey(sourceKey);
    return src?.channels ?? [];
  }, [sourceKey]);

  // Tra lead trong handler (không qua effect) → khớp thì tự điền UID / tên / nguồn / kênh, sale vẫn sửa được.
  const onLookup = async () => {
    const formatted = formatPhoneIntl("VN", phone) || phone.trim();
    if (!formatted) return;
    setPhone(formatted);
    setLookupStatus("loading");
    try {
      const { data } = await endpoints.leads.lookup({ phone: formatted });
      if (data.matched && data.leads.length > 0) {
        const hit = data.leads[0];
        setLeadId(hit.lead_id);
        if (hit.uid) setUid(hit.uid);
        if (hit.name) setCustomerName(hit.name);
        const resolved = resolveSourceFromCrmCode(hit.crm_code);
        if (resolved) {
          setSourceKey(resolved.sourceKey);
          setChannel(resolved.channel);
        }
        setMatchedName(hit.name);
        setLookupStatus("matched");
      } else {
        setMatchedName(null);
        setLookupStatus("none");
      }
    } catch {
      setLookupStatus("error");
    }
  };

  const save = async () => {
    setErr(null);
    const fmtPhone = formatPhoneIntl("VN", phone) || phone.trim();
    if (!fmtPhone) {
      setErr("Nhập SĐT khách.");
      return;
    }
    if (!note.trim()) {
      setErr("Ghi chú là bắt buộc.");
      return;
    }
    setSaving(true);
    try {
      const { data } = await endpoints.leadFeedback.create({
        phone: fmtPhone,
        sale_note: note.trim(),
        uid: uid.trim() || null,
        customer_name: customerName.trim() || null,
        lead_source: sourceKey || null,
        lead_channel: channel || null,
        lead_id: leadId,
      });
      const fid = data.item.id;
      for (const im of images) {
        await endpoints.leadFeedback.uploadImage(fid, "sale", im.file, im.file.name || "bang-chung.jpg");
      }
      onCreated();
      onClose();
    } catch (e) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setErr(msg || "Không lưu được feedback. Thử lại.");
      setSaving(false);
    }
  };

  const statusLine = () => {
    switch (lookupStatus) {
      case "loading":
        return <span style={{ color: "var(--text-2)" }}>Đang tra lead…</span>;
      case "matched":
        return (
          <span style={{ color: "var(--success-text)" }}>
            <Icons.CheckCircle size={13} style={{ verticalAlign: "-2px" }} /> Khớp lead
            {matchedName ? ` — ${matchedName}` : ""} — đã điền UID / nguồn / kênh.
          </span>
        );
      case "none":
        return <span style={{ color: "var(--text-2)" }}>Không tìm thấy lead khớp — sale tự điền bên dưới.</span>;
      case "error":
        return <span style={{ color: "var(--danger-text)" }}>Lỗi tra lead. Thử lại.</span>;
      default:
        return null;
    }
  };

  return createPortal(
    <div className="gmv-prototype-modal-scrim" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Tạo feedback lead"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <h3>Tạo feedback lead</h3>
            <div style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 2 }}>
              Định danh lead, đính ảnh bằng chứng và ghi chú. Team Marketing sẽ nhận xét lại sau.
            </div>
          </div>
          <button className="drawer-close" onClick={onClose} aria-label="Đóng">
            <Icons.Close size={16} />
          </button>
        </div>

        <div className="modal-body">
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              color: "var(--text-2)",
            }}
          >
            Thông tin lead
          </div>

          <div className="field">
            <label>
              SĐT khách <span style={{ color: "var(--danger)" }}>*</span>
            </label>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 2 }}>
              Nhập số rồi bấm “Tra lead” — hệ thống tự điền UID, nguồn, kênh. Số 09… tự đổi về 84-…
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="tel"
                placeholder="VD 84-912345678"
                value={phone}
                autoComplete="off"
                onChange={(e) => setPhone(e.target.value)}
                onBlur={() => {
                  const f = formatPhoneIntl("VN", phone);
                  if (f) setPhone(f);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void onLookup();
                  }
                }}
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => void onLookup()}
                disabled={lookupStatus === "loading"}
              >
                <Icons.Search size={14} /> Tra lead
              </button>
            </div>
            <div style={{ fontSize: 12.5, marginTop: 6, minHeight: 16 }}>{statusLine()}</div>
          </div>

          <div className="field-row">
            <div className="field">
              <label>UID</label>
              <input type="text" placeholder="Tự điền khi tra" value={uid} onChange={(e) => setUid(e.target.value)} />
            </div>
            <div className="field">
              <label>Tên khách</label>
              <input
                type="text"
                placeholder="Tự điền khi tra"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label>Nguồn</label>
              <select
                value={sourceKey}
                onChange={(e) => {
                  setSourceKey(e.target.value);
                  setChannel("");
                }}
              >
                <option value="">— Chọn nguồn —</option>
                {LEAD_SOURCES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Kênh</label>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                disabled={!sourceKey || !sourceHasChannels(sourceKey)}
              >
                <option value="">{sourceKey ? (sourceHasChannels(sourceKey) ? "— Chọn kênh —" : "Nguồn này không có kênh") : "Chọn nguồn trước"}</option>
                {channelOptions.map((c) => (
                  <option key={channelValue(c)} value={channelValue(c)}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              color: "var(--text-2)",
              marginTop: 4,
            }}
          >
            Bằng chứng &amp; ghi chú
          </div>

          <div className="field">
            <label>Ảnh bằng chứng</label>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 2 }}>
              Chụp màn hình tin nhắn / cuộc gọi. Dán (Ctrl+V), kéo-thả, hoặc bấm chọn — giống up ảnh bill.
            </div>
            <ImageDropZone images={images} onChange={setImages} disabled={saving} />
          </div>

          <div className="field">
            <label>
              Ghi chú <span style={{ color: "var(--danger)" }}>*</span>
            </label>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 2 }}>
              Bắt buộc cần điền - Ghi rõ vấn đề gặp phải với khách này, để team Marketing có thông tin để kiểm chứng.
            </div>
            <textarea
              placeholder="VD: Khách quan tâm nhưng chê học phí cao, hẹn gọi lại cuối tuần. Con 8 tuổi."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
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
        </div>

        <div className="modal-foot">
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={saving}>
            Huỷ
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={saving}>
            {saving ? "Đang lưu…" : "Lưu feedback"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
