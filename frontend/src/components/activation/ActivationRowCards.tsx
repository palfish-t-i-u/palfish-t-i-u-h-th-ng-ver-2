import { RowCard, RowCardList } from "../ui/RowCard";
import { formatPaymentDateTime, getArReferralStatus } from "../payment-request/paymentRequestUtils";
import {
  AR_STATUS_META,
  type EnrichedActiveRequest,
  vnd,
} from "../payment-flow/paymentFlowUtils";

interface Props {
  rows: EnrichedActiveRequest[];
  openArId: string | null;
  onSelect: (id: string) => void;
  reminderByPrId: Map<string, unknown>;
  emptyText?: string;
}

function StatusBadge({ status }: { status: string }) {
  const m = AR_STATUS_META[status as keyof typeof AR_STATUS_META] || AR_STATUS_META.pending_order;
  return (
    <span className={`badge ${m.cls}`}>
      <span className="dot" />
      {m.text}
    </span>
  );
}

function ReferralBadge({ ar }: { ar: EnrichedActiveRequest }) {
  const rs = getArReferralStatus(ar);
  if (rs === null) return null;
  const cfg = {
    full: { cls: "badge-success", label: "GT ✓" },
    partial: { cls: "badge-warning", label: "GT 1p" },
    none: { cls: "badge-danger", label: "GT chưa" },
  }[rs];
  return <span className={`badge ${cfg.cls}`}>{cfg.label}</span>;
}

export default function ActivationRowCards({
  rows,
  openArId,
  onSelect,
  reminderByPrId,
  emptyText = "Chưa có Active Request nào.",
}: Props) {
  return (
    <RowCardList empty={emptyText}>
      {rows.map((a) => {
        const rem = a.prId ? reminderByPrId.has(a.prId) : false;
        const ts = formatPaymentDateTime(a.createdAt);

        return (
          <RowCard
            key={a.id}
            className={
              openArId === a.id
                ? "ring-2 ring-gmv-primary"
                : rem
                ? "border-l-[3px] border-l-orange-600"
                : undefined
            }
            title={a.customerName}
            value={vnd(a.total)}
            badges={
              <>
                <StatusBadge status={a.status} />
                <ReferralBadge ar={a} />
                {a.holdActivation && a.status !== "activated" && a.status !== "invoiced" && (
                  <span
                    className="badge badge-warning"
                    title={a.holdNote ? `Chưa muốn tạo gói học — "${a.holdNote}"` : "Chưa muốn tạo gói học"}
                  >
                    ⏸ KH chưa muốn tạo gói
                  </span>
                )}
                {a.isCreditOrder && !a.creditSettlementPending && (
                  <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, background: "var(--info-bg, #dbeafe)", color: "var(--info-text, #1d4ed8)", fontWeight: 600, whiteSpace: "nowrap" }}>
                    Đã ghép TD
                  </span>
                )}
              </>
            }
            meta={[
              { label: "AR-ID", value: a.id },
              { label: "PR-ID", value: a.prId || "Standalone" },
              { label: "UID", value: `${a.uids.length} UID · ${a.totalCourses} khoá` },
              {
                label: "Order ID",
                value: `${a.orderedCount}/${a.totalCourses}`,
              },
              {
                label: "Tạo lúc",
                value: `${ts.date}${ts.time ? ` ${ts.time}` : ""}`,
              },
            ]}
            onClick={() => onSelect(a.id)}
          />
        );
      })}
    </RowCardList>
  );
}
