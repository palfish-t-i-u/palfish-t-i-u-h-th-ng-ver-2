import type { LeadCheckState, LeadHit } from "./useLeadCheck";
import { LY_DO_KHONG_GHEP } from "../../constants/leadSource";

interface Props {
  state: LeadCheckState;
  onSelectLead: (leadId: string) => void;
  onSdtGocInput: (val: string) => void;
  onSdtGocBlur: (val: string) => void;
  onReasonChange: (val: string) => void;
}

/** ISO "2024-08-26" → "26/08/2024". Trả nguyên bản nếu không parse được. */
function formatLeadDate(iso: string | null): string {
  if (!iso) return "?";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** Khối chi tiết 1 lead, có nhãn — dùng cho trường hợp khớp đúng 1 lead.
 *  Nội dung theo chốt Hiếu: SĐT gốc + tên + kênh + tên sale (BỎ trạng thái L).
 *  SĐT gốc + tên sale để phân biệt khách điền lead nhiều lần qua các năm. */
function LeadDetail({ hit }: { hit: LeadHit }) {
  return (
    <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 1, color: "var(--gmv-text, #1f2937)" }}>
      <div><span style={{ color: "var(--muted)" }}>SĐT gốc:</span> {hit.phone || "?"}</div>
      <div><span style={{ color: "var(--muted)" }}>Ngày lead xuất hiện:</span> {formatLeadDate(hit.leadDate)}</div>
      <div>
        <span style={{ color: "var(--muted)" }}>Kênh:</span> {hit.crmCode || "?"}
        {hit.saleName ? <> · <span style={{ color: "var(--muted)" }}>Sale:</span> {hit.saleName}</> : null}
      </div>
    </div>
  );
}

/** 1 dòng gọn cho danh sách radio (nhiều lead) — tên · SĐT gốc · ngày · kênh · sale (BỎ trạng thái). */
function LeadLineCompact({ hit }: { hit: LeadHit }) {
  return (
    <span>
      <b>{hit.name || "(không tên)"}</b> · {hit.phone || "?"} · {formatLeadDate(hit.leadDate)} · kênh {hit.crmCode || "?"}
      {hit.saleName ? ` · ${hit.saleName}` : ""}
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
          ✓ Khớp lead{state.matchedBy === "sdt_goc" ? " qua số gốc" : ""}: {!many ? (state.leads[0]?.name || "(không tên)") : ""}
        </div>
        {!many ? (
          <LeadDetail hit={state.leads[0]} />
        ) : (
          <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{ color: "var(--muted)" }}>Có {state.leads.length} lead — chọn đúng khách:</div>
            {state.leads.map((h) => (
              <label key={h.leadId} style={{ display: "flex", gap: 6, alignItems: "flex-start", cursor: "pointer" }}>
                <input type="radio" name="lead-pick" checked={state.selectedLeadId === h.leadId}
                       onChange={() => onSelectLead(h.leadId)} style={{ marginTop: 2 }} />
                <LeadLineCompact hit={h} />
              </label>
            ))}
          </div>
        )}
      </div>
    );
  }

  // status === "none"
  // Chốt chặn (yêu cầu Hiếu): BẮT BUỘC sale tra SĐT gốc trước. Dropdown lý do chỉ mở
  // sau khi đã tra 1 số gốc mà cũng không có trong kho (sdtGocNotFound=true) — chống
  // sale lười, bỏ qua tra cứu để chọn thẳng lý do.
  const reasonUnlocked = state.sdtGocNotFound;
  return (
    <div style={{ background: "var(--warning-bg, #fffbeb)", border: "1px solid var(--warning, #f59e0b)",
                  borderRadius: 8, padding: 8, fontSize: 12, display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontWeight: 600, color: "var(--warning-fg, #b45309)" }}>
        ⚠ Không tìm thấy số này trong dữ liệu marketing. Nhập SĐT khách dùng lúc đăng ký để tra tiếp.
      </div>
      <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ color: "var(--muted)" }}>SĐT khách dùng lúc đăng ký (tra số này trước)</span>
        <input value={state.sdtGoc}
               onChange={(e) => onSdtGocInput(e.target.value)}
               onBlur={(e) => onSdtGocBlur(e.target.value)}
               placeholder="VD 0912 345 678"
               style={{ padding: "4px 6px", border: "1px solid var(--border)", borderRadius: 6 }} />
      </label>
      {state.sdtGocNotFound && state.sdtGoc.trim() ? (
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: -2 }}>
          Đã tra số gốc — số này cũng không có trong kho. Chọn lý do bên dưới để lưu.
        </div>
      ) : null}
      <label style={{ display: "flex", flexDirection: "column", gap: 2, opacity: reasonUnlocked ? 1 : 0.55 }}>
        <span style={{ color: "var(--muted)" }}>
          {reasonUnlocked ? "Chọn lý do" : "Chọn lý do (tra SĐT gốc trước để mở khoá)"}
        </span>
        <select value={state.reason} onChange={(e) => onReasonChange(e.target.value)}
                disabled={!reasonUnlocked}
                title={reasonUnlocked ? "" : "Nhập & tra SĐT gốc trước khi chọn lý do"}
                style={{ padding: "4px 6px", border: "1px solid var(--border)", borderRadius: 6,
                         cursor: reasonUnlocked ? "pointer" : "not-allowed",
                         background: reasonUnlocked ? "var(--surface, #fff)" : "var(--gmv-bg, #f3f4f6)" }}>
          <option value="">— Chọn lý do —</option>
          {LY_DO_KHONG_GHEP.map((r) => (<option key={r.value} value={r.value}>{r.label}</option>))}
        </select>
      </label>
    </div>
  );
}
