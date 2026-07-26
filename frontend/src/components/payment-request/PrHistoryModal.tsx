import type { PaymentRequest } from "../../types/paymentRequest";
import AuditTrail from "../ui/AuditTrail";
import OwnershipLogSection from "./OwnershipLogSection";
import { Icons } from "./Icons";
import { HdsdLink } from "../help/HdsdLink";

/** Modal "Xem lịch sử" của 1 PR — mô phỏng nút "Xem lịch sử" trên CRM.
 *
 * Gom 2 nhật ký, chỉ fetch khi mở (lazy):
 * 1. Lịch sử lưu chuyển (ai sở hữu PR từ mốc nào — tạo / tạo hộ / chuyển giao)
 * 2. Lịch sử thao tác (audit log: xác nhận tiền, sửa số tiền, bill, huỷ…)
 */
export default function PrHistoryModal({
  pr,
  onClose,
}: {
  pr: PaymentRequest | null;
  onClose: () => void;
}) {
  if (!pr) return null;
  return (
    <div className="gmv-prototype-modal-scrim" style={{ zIndex: 140 }} onClick={onClose}>
      <div className="modal" style={{ width: "min(600px, 100%)" }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h3>Lịch sử PR — {pr.id}</h3>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
              Sở hữu hiện tại:{" "}
              <strong style={{ color: "var(--text-2)" }} title={pr.saleEmail || undefined}>
                {pr.saleName || pr.saleEmail || "—"}
              </strong>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <HdsdLink mode="topic" moduleSlug="paymentRequests" topicSlug="xem-lich-su-pr" />
            <button className="drawer-close" onClick={onClose}>
              <Icons.Close size={16} />
            </button>
          </div>
        </div>
        <div className="modal-body">
          <div style={{ marginBottom: 16 }}>
            <h4
              style={{
                fontSize: 11.5, fontWeight: 600, color: "var(--text-3)",
                textTransform: "uppercase", letterSpacing: 0.4, margin: "0 0 8px",
              }}
            >
              <Icons.User size={13} style={{ verticalAlign: "-2px", marginRight: 4 }} />
              Lịch sử lưu chuyển (sở hữu)
            </h4>
            <OwnershipLogSection prId={pr.id} />
          </div>
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
            <AuditTrail targetType="payment_request" targetId={pr.id} />
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-outline" onClick={onClose}>Đóng</button>
        </div>
      </div>
    </div>
  );
}
