import Button from "../ui/Button";
import { RowCard, RowCardList } from "../ui/RowCard";
import {
  type FlatTransaction,
  METHOD_META,
  type TxnDisplayStatus,
  TXN_STATUS_META,
  txnDisplayStatus,
  vnd,
} from "../payment-flow/paymentFlowUtils";
import { formatPaymentDateTime } from "../payment-request/paymentRequestUtils";

interface Props {
  transactions: FlatTransaction[];
  drawerTxnKey: string | null;
  readOnly: boolean;
  selectedIds: Set<string>;
  onSelect: (t: FlatTransaction) => void;
  onToggleSelect: (key: string) => void;
  onConfirm: (t: FlatTransaction) => void;
  onReject: (t: FlatTransaction) => void;
  billRequiredButMissing: (t: FlatTransaction) => boolean;
  onRedirectCard: () => void;
  onSwitchToCkOutside: () => void;
  emptyText?: string;
}

function StatusBadge({ status }: { status: TxnDisplayStatus }) {
  const m = TXN_STATUS_META[status] || TXN_STATUS_META.unsent;
  return (
    <span className={`badge ${m.cls}`}>
      <span className="dot" />
      {m.text}
    </span>
  );
}

export default function ReconTxnCards({
  transactions,
  drawerTxnKey,
  readOnly,
  selectedIds,
  onSelect,
  onToggleSelect,
  onConfirm,
  onReject,
  billRequiredButMissing,
  onRedirectCard,
  onSwitchToCkOutside,
  emptyText = "Không có giao dịch nào.",
}: Props) {
  return (
    <RowCardList empty={emptyText}>
      {transactions.map((t) => {
        const status = txnDisplayStatus(t);
        const method = METHOD_META[t.method || "qr"];
        const created = formatPaymentDateTime(t.createdAt);
        const paid = t.paidAt ? formatPaymentDateTime(t.paidAt) : null;
        return (
          <RowCard
            key={t.key}
            className={drawerTxnKey === t.key ? "ring-2 ring-gmv-primary" : undefined}
            title={
              <span>
                <span className="font-mono text-xs text-gmv-primary">{t.prId}</span>
                {" · "}
                {t.prName}
              </span>
            }
            value={vnd(t.amount)}
            badges={
              <>
                <StatusBadge status={status} />
                <span className={`method-badge ${method.cls}`} style={{ fontSize: 10.5 }}>
                  {method.label}
                </span>
              </>
            }
            meta={[
              { label: "Mã GD", value: t.code },
              { label: "Tạo lệnh lúc", value: `${created.date} ${created.time || ""}`.trim() },
              { label: "Tiền về lúc", value: paid ? `${paid.date} ${paid.time || ""}`.trim() : "—" },
              { label: "Chi tiết", value: t.bank || t.cashier || "—" },
            ]}
            onClick={() => onSelect(t)}
            actions={
              status === "awaiting" && !readOnly ? (
                t.method === "cash" ? (
                  <div className="flex w-full items-center justify-between">
                    <label className="flex items-center gap-1.5 text-xs">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(t.key)}
                        onChange={() => onToggleSelect(t.key)}
                      />
                      Chọn
                    </label>
                    <div className="flex gap-2">
                      <Button type="button" size="sm" variant="danger" onClick={() => onReject(t)}>
                        Từ chối
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="primary"
                        disabled={billRequiredButMissing(t)}
                        onClick={() => onConfirm(t)}
                      >
                        Xác nhận
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={t.method === "card" || t.method === "installment" ? onRedirectCard : onSwitchToCkOutside}
                  >
                    {t.method === "card" || t.method === "installment" ? "→ mPOS/Payoo" : "→ CK ngoài"}
                  </Button>
                )
              ) : undefined
            }
          />
        );
      })}
    </RowCardList>
  );
}
