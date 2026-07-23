import { useEffect, useState } from "react";
import type { PrOwnershipLogEntry } from "../../types/paymentRequest";
import { endpoints } from "../../lib/api";
import { Icons } from "./Icons";

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
 * PR bình thường (chỉ 1 dòng "Tạo PR") → 1 dòng mờ gọn. Có tạo hộ/chuyển giao
 * → bảng đầy đủ để kế toán/leader đối soát.
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

  if (!log || log.length === 0) return null;

  const onlyPlainCreate = log.length === 1 && log[0].action === "create";
  if (onlyPlainCreate) {
    const e = log[0];
    return (
      <div style={{ fontSize: 11.5, color: "var(--text-3)", padding: "2px 0 6px" }}>
        Sở hữu: {who(e.to_sale_name, e.to_sale_email)} (tạo {fmtTime(e.created_at)})
      </div>
    );
  }

  const newestFirst = [...log].reverse();
  return (
    <div className="panel" style={{ marginBottom: 12 }}>
      <div className="panel-head">
        <h4>
          <Icons.User size={15} /> Lịch sử lưu chuyển
        </h4>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "2px 0" }}>
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
    </div>
  );
}
