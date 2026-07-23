import { useEffect, useState } from "react";
import { endpoints, type AuditLogEntry } from "../../lib/api";

const ACTION_LABELS: Record<string, string> = {
  "recon.txn_matched": "Ghép giao dịch",
  "recon.txn_status_changed": "Đổi trạng thái GD",
  "recon.line_marked_paid": "Xác nhận đã nhận tiền",
  "recon.line_status_changed": "Đổi trạng thái thanh toán",
  "recon.amount_changed": "Sửa số tiền",
  "recon.bank_txn_matched": "Ghép giao dịch ngân hàng",
  "payment_line.bill_uploaded": "Up ảnh bill",
  "payment_line.bill_deleted": "Xoá ảnh bill",
  "pr.cancelled": "Huỷ PR",
  "pr.owner_transferred": "Chuyển sale",
  "pr.created_on_behalf": "Tạo hộ PR",
  "activation.order_id_set": "Gắn Order ID",
  "activation.order_id_cleared": "Xoá Order ID",
  "referral.credit_confirmed": "Cộng buổi giới thiệu",
  "referral.credit_revoked": "Bỏ cộng buổi giới thiệu",
  "referral.amount_changed": "Sửa thông tin giới thiệu",
};

function fmtTime(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString("vi-VN", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function fmtActor(entry: AuditLogEntry) {
  const email = entry.actor_email;
  if (email.startsWith("system:")) return email.replace("system:", "Hệ thống ");
  if (entry.actor_name) return entry.actor_name;
  const name = email.split("@")[0];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function detailText(entry: AuditLogEntry): string {
  const p = entry.payload || {};
  const parts: string[] = [];
  if (p.from_status || p.to_status) parts.push(`${p.from_status || "?"} → ${p.to_status}`);
  if (p.from && p.to) parts.push(`${p.from} → ${p.to}`);
  if (p.owner_sale_email) parts.push(`cho: ${p.owner_sale_email}`);
  if (p.source) parts.push(`nguồn: ${p.source}`);
  if (p.old_amount !== undefined && p.new_amount !== undefined)
    parts.push(`${Number(p.old_amount).toLocaleString("vi-VN")} → ${Number(p.new_amount).toLocaleString("vi-VN")}`);
  if (p.reject_reason) parts.push(`lý do: ${p.reject_reason}`);
  if (p.reason) parts.push(`lý do: ${p.reason}`);
  if (p.discrepancy_amount && Number(p.discrepancy_amount) !== 0)
    parts.push(`chênh lệch: ${Number(p.discrepancy_amount).toLocaleString("vi-VN")}`);
  if (p.order_id) parts.push(`Order ID: ${p.order_id}`);
  if (p.old_order_id) parts.push(`cũ: ${p.old_order_id}`);
  if (p.side) parts.push(`bên: ${p.side}`);
  if (p.filename) parts.push(String(p.filename));
  if (p.mode === "all") parts.push("xoá tất cả");
  if (p.remaining_count !== undefined) parts.push(`còn lại: ${p.remaining_count} ảnh`);
  return parts.join(" · ");
}

interface AuditTrailProps {
  targetType: string;
  targetId: string;
}

export default function AuditTrail({ targetType, targetId }: AuditTrailProps) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!targetId) return;
    setLoading(true);
    endpoints.auditLogs
      .list({ target_type: targetType, target_id: targetId, limit: 50 })
      .then((res) => setLogs(res.data?.data || []))
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, [targetType, targetId]);

  if (loading) return <p className="text-xs text-gray-400 py-2">Đang tải lịch sử...</p>;
  if (!logs.length) return <p className="text-xs text-gray-400 py-2">Chưa có lịch sử thao tác</p>;

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
        Lịch sử thao tác
      </h4>
      <div className="space-y-1">
        {logs.map((entry) => (
          <div key={entry.id} className="flex items-start gap-2 text-xs leading-relaxed">
            <span className="shrink-0 text-gray-400 tabular-nums">{fmtTime(entry.created_at)}</span>
            <span className="shrink-0 font-medium text-gray-700">{fmtActor(entry)}</span>
            <span className="text-gray-600">
              {ACTION_LABELS[entry.action] || entry.action}
              {detailText(entry) && (
                <span className="text-gray-400 ml-1">({detailText(entry)})</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
