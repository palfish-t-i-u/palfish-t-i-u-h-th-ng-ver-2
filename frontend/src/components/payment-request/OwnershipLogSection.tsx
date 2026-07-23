import { useEffect, useState } from "react";
import type { PrOwnershipLogEntry } from "../../types/paymentRequest";
import { endpoints } from "../../lib/api";

const ACTION_LABEL: Record<PrOwnershipLogEntry["action"], string> = {
  create: "Tạo PR",
  create_on_behalf: "Tạo hộ",
  transfer: "Chuyển giao",
};

function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("vi-VN", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function who(name?: string, email?: string | null) {
  return name || email || "—";
}

/** Nhật ký lưu chuyển PR — ai nắm giữ PR từ mốc nào (đối soát doanh thu).
 *
 * Render dạng list dòng (mới nhất trên cùng), dùng bên trong PrHistoryModal
 * (mô phỏng "Nhật ký bán hàng" của CRM). Fetch khi mount → lazy theo modal.
 */
export default function OwnershipLogSection({ prId }: { prId: string }) {
  const [log, setLog] = useState<PrOwnershipLogEntry[] | null>(null);

  useEffect(() => {
    if (!prId) return;
    let alive = true;
    endpoints.paymentRequests
      .ownershipLog(prId)
      .then((res) => { if (alive) setLog(res.data?.log ?? []); })
      .catch(() => { if (alive) setLog([]); });
    return () => { alive = false; };
  }, [prId]);

  if (log === null) {
    return <p className="text-xs text-gray-400 py-2">Đang tải nhật ký…</p>;
  }
  if (log.length === 0) {
    return <p className="text-xs text-gray-400 py-2">Chưa có nhật ký lưu chuyển</p>;
  }

  const newestFirst = [...log].reverse();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {newestFirst.map((e) => (
        <div key={e.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, lineHeight: 1.5 }}>
          <span style={{ color: "var(--text-3)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
            {fmtTime(e.created_at)}
          </span>
          <span>
            <strong>{ACTION_LABEL[e.action] ?? e.action}</strong>
            {": "}
            {e.action === "transfer" ? (
              <>
                {who(e.from_sale_name, e.from_sale_email)}
                {" → "}
                <strong>{who(e.to_sale_name, e.to_sale_email)}</strong>
              </>
            ) : (
              <strong>{who(e.to_sale_name, e.to_sale_email)}</strong>
            )}
            <span style={{ color: "var(--text-3)" }}>
              {" · "}thao tác: {who(e.actor_name, e.actor_email)}
              {e.reason ? ` · lý do: ${e.reason}` : ""}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}
