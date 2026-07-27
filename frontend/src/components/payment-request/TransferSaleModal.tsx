import { useEffect, useMemo, useState } from "react";
import type { OwnerOption, PaymentRequest } from "../../types/paymentRequest";
import { endpoints } from "../../lib/api";
import { useMe } from "../../hooks/useMe";
import Combobox from "../ui/Combobox";
import { Icons } from "./Icons";
import { HdsdLink } from "../help/HdsdLink";

const LEAD_ROLES = new Set(["leader", "manager", "system"]);

/** Modal "Chuyển sale" — trục sale ↔ leader (không sale ↔ sale trực tiếp).
 *
 * - Sale: chỉ bàn giao PR của mình cho leader/manager cùng team.
 * - Leader/Manager: kéo PR của sale trong scope về mình, hoặc giao PR (đang
 *   thuộc leader) cho sale trong team. BE validate lại toàn bộ.
 */
export default function TransferSaleModal({
  pr,
  onClose,
  onTransferred,
}: {
  pr: PaymentRequest | null;
  onClose: () => void;
  onTransferred: (toName: string) => void | Promise<void>;
}) {
  const { profile } = useMe();
  const [options, setOptions] = useState<OwnerOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [toEmail, setToEmail] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = !!pr;

  useEffect(() => {
    if (!open) return;
    setToEmail("");
    setReason("");
    setError(null);
    setLoadingOptions(true);
    let alive = true;
    endpoints.paymentRequests
      .ownerOptions()
      .then((res) => { if (alive) setOptions(res.data?.options ?? []); })
      .catch(() => { if (alive) setOptions([]); })
      .finally(() => { if (alive) setLoadingOptions(false); });
    return () => { alive = false; };
  }, [open]);

  const ownerEmail = (pr?.saleEmail || profile?.email || "").toLowerCase();
  const ownerRole = useMemo(() => {
    const found = options.find((o) => o.email === ownerEmail);
    // Không thấy trong roster (khác team/đã nghỉ) → coi như sale để ép đích là leader
    return (found?.role || (ownerEmail === (profile?.email ?? "") ? profile?.role : "") || "sale").toLowerCase();
  }, [options, ownerEmail, profile]);

  // Trục sale ↔ leader: chủ hiện tại là sale → đích phải leader/manager; chủ là
  // leader/manager → đích tùy ý trong scope. Luôn loại chính chủ hiện tại.
  const targets = useMemo(() => {
    const base = options.filter((o) => o.email !== ownerEmail);
    if (LEAD_ROLES.has(ownerRole)) return base;
    return base.filter((o) => LEAD_ROLES.has(o.role));
  }, [options, ownerEmail, ownerRole]);

  if (!open || !pr) return null;

  const isSale = profile?.role === "sale";
  const toOption = targets.find((o) => o.email === toEmail) || null;
  const canConfirm = !!toEmail && !submitting;

  const confirm = async () => {
    if (!canConfirm) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await endpoints.paymentRequests.transfer(pr.id, {
        to_sale_email: toEmail,
        reason: reason.trim() || undefined,
      });
      await onTransferred(res.data?.to_sale_name || toOption?.name || toEmail);
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
      setError(
        typeof detail === "string"
          ? detail
          : err instanceof Error
          ? err.message
          : "Không chuyển được — thử lại sau"
      );
      setSubmitting(false);
    }
  };

  return (
    <div className="gmv-prototype-modal-scrim" onClick={onClose}>
      <div className="modal" style={{ width: "min(480px, 100%)" }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h3>Chuyển giao PR — {pr.id}</h3>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
              Đang thuộc: <strong>{pr.saleName || pr.saleEmail || "tôi"}</strong>
              {" · "}KH: {pr.name}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <HdsdLink moduleSlug="paymentRequests" topicSlug="chuyen-giao-pr" />
            <button className="drawer-close" onClick={onClose}>
              <Icons.Close size={16} />
            </button>
          </div>
        </div>
        <div className="modal-body">
          <div className="field">
            <label>
              Chuyển cho <span style={{ color: "var(--danger)" }}>*</span>
            </label>
            {loadingOptions ? (
              <div style={{ fontSize: 12.5, color: "var(--text-3)", padding: "6px 0" }}>Đang tải danh sách…</div>
            ) : targets.length === 0 ? (
              <div style={{ fontSize: 12.5, color: "var(--danger)", padding: "6px 0" }}>
                Không có người nhận hợp lệ trong phạm vi của bạn.
              </div>
            ) : (
              <Combobox
                value={toEmail}
                onChange={(v) => setToEmail(v)}
                options={targets.map((o) => ({
                  value: o.email,
                  label: `${o.name}${o.is_self ? " (tôi)" : ""} · ${o.role}${o.sub_team ? ` · ${o.sub_team}` : ""}`,
                }))}
                placeholder="Chọn người nhận"
                emptyLabel="— Bỏ chọn —"
                invalid={!toEmail}
              />
            )}
            {isSale && (
              <div style={{ fontSize: 11.5, color: "var(--text-3)", lineHeight: 1.45, marginTop: 4 }}>
                Sale không chuyển PR thẳng cho nhau — bạn bàn giao cho leader/manager,
                leader sẽ chuyển tiếp cho sale phù hợp.
              </div>
            )}
            {!LEAD_ROLES.has(ownerRole) && !isSale && (
              <div style={{ fontSize: 11.5, color: "var(--text-3)", lineHeight: 1.45, marginTop: 4 }}>
                PR đang thuộc sale — chỉ chuyển được về leader/manager. Muốn giao cho
                sale khác: kéo về mình trước, rồi chuyển tiếp (2 bước, mỗi bước có nhật ký).
              </div>
            )}
          </div>

          <div className="field">
            <label>Lý do (tùy chọn)</label>
            <textarea
              placeholder="VD: Chốt chéo qua điện thoại / bàn giao khách khi sale nghỉ…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
            />
          </div>

          <div
            style={{
              background: "var(--warning-bg)",
              border: "1px solid #f6d36b",
              borderRadius: 10,
              padding: "10px 12px",
              fontSize: 12,
              color: "var(--warning-text)",
              lineHeight: 1.5,
            }}
          >
            Từ thời điểm chuyển: doanh thu, KPI, BXH và thông báo Zalo/DingTalk theo{" "}
            <strong>sale mới</strong>. Doanh thu đã chốt & tin đã gửi trước đó{" "}
            <strong>giữ nguyên</strong> sale cũ (đối soát bằng Nhật ký lưu chuyển).
          </div>

          {error && (
            <div
              style={{
                marginTop: 10,
                background: "var(--danger-bg, #fef2f2)",
                border: "1px solid var(--danger)",
                borderRadius: 10,
                padding: "8px 12px",
                fontSize: 12.5,
                color: "var(--danger)",
              }}
            >
              {error}
            </div>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn btn-outline" onClick={onClose} disabled={submitting}>
            Huỷ
          </button>
          <button
            className="btn btn-primary"
            disabled={!canConfirm}
            style={!canConfirm ? { opacity: 0.4, cursor: "not-allowed" } : undefined}
            onClick={() => void confirm()}
          >
            {submitting ? "Đang chuyển…" : `Xác nhận chuyển${toOption ? ` cho ${toOption.name}` : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
