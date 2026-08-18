import type { LeadCheckState, LeadHit } from "./useLeadCheck";
import { LY_DO_KHONG_GHEP } from "../../constants/leadSource";

interface Props {
  state: LeadCheckState;
  onSelectLead: (leadId: string) => void;
  onSdtGocInput: (val: string) => void;
  onSdtGocBlur: (val: string) => void;
  onReasonChange: (val: string) => void;
}

function LeadLine({ hit }: { hit: LeadHit }) {
  return (
    <span>
      {hit.name || "(không tên)"} · {hit.leadDate || "?"} · kênh {hit.crmCode || "?"}
      {hit.status ? ` · ${hit.status}` : ""}
    </span>
  );
}

export default function LeadCheckBlock({
  state, onSelectLead, onSdtGocInput, onSdtGocBlur, onReasonChange,
}: Props) {
  if (state.status === "idle" || state.status === "skipped" || state.status === "error") return null;

  if (state.status === "loading") {
    return <div style={{ fontSize: 12, color: "var(--muted)", padding: "4px 0" }}>Đang tra lead…</div>;
  }

  if (state.status === "matched") {
    const many = state.leads.length > 1;
    return (
      <div style={{ background: "var(--success-bg, #ecfdf5)", border: "1px solid var(--success, #10b981)",
                    borderRadius: 8, padding: 8, fontSize: 12 }}>
        <div style={{ fontWeight: 600, color: "var(--success, #059669)" }}>
          ✓ Khớp lead{state.matchedBy === "sdt_goc" ? " qua số gốc" : ""}:
        </div>
        {!many ? (
          <div style={{ marginTop: 2 }}><LeadLine hit={state.leads[0]} /></div>
        ) : (
          <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ color: "var(--muted)" }}>Có {state.leads.length} lead — chọn đúng khách:</div>
            {state.leads.map((h) => (
              <label key={h.leadId} style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
                <input type="radio" name="lead-pick" checked={state.selectedLeadId === h.leadId}
                       onChange={() => onSelectLead(h.leadId)} />
                <LeadLine hit={h} />
              </label>
            ))}
          </div>
        )}
      </div>
    );
  }

  // status === "none"
  return (
    <div style={{ background: "var(--warning-bg, #fffbeb)", border: "1px solid var(--warning, #f59e0b)",
                  borderRadius: 8, padding: 8, fontSize: 12, display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontWeight: 600, color: "var(--warning-fg, #b45309)" }}>
        ⚠ Không tìm thấy số này trong dữ liệu marketing. Khách có dùng số khác khi đăng ký không?
      </div>
      <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ color: "var(--muted)" }}>SĐT khách dùng lúc đăng ký (nếu khác)</span>
        <input value={state.sdtGoc}
               onChange={(e) => onSdtGocInput(e.target.value)}
               onBlur={(e) => onSdtGocBlur(e.target.value)}
               placeholder="VD 0912 345 678"
               style={{ padding: "4px 6px", border: "1px solid var(--border)", borderRadius: 6 }} />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ color: "var(--muted)" }}>Hoặc chọn lý do</span>
        <select value={state.reason} onChange={(e) => onReasonChange(e.target.value)}
                style={{ padding: "4px 6px", border: "1px solid var(--border)", borderRadius: 6 }}>
          <option value="">— Chọn lý do —</option>
          {LY_DO_KHONG_GHEP.map((r) => (<option key={r.value} value={r.value}>{r.label}</option>))}
        </select>
      </label>
    </div>
  );
}
