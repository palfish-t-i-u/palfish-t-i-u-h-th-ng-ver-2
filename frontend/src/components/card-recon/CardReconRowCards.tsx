import Badge from "../ui/Badge";
import Button from "../ui/Button";
import { RowCard, RowCardList } from "../ui/RowCard";
import { formatPaymentDateTime, vnd } from "../payment-request/paymentRequestUtils";
import type { GatewaySource, GatewayTxn, MatchStatus } from "./mockGatewayTxns";

const STATUS_META: Record<MatchStatus, { cls: string; text: string }> = {
  pending: { cls: "is-over", text: "Chưa ghép" },
  matched: { cls: "is-done", text: "Đã ghép" },
  ignored: { cls: "is-cancelled", text: "Bỏ qua" },
};

const SOURCE_LABEL: Record<GatewaySource, string> = { mpos: "mPOS", payoo: "Payoo" };

function StatusBadge({ s }: { s: MatchStatus }) {
  const m = STATUS_META[s];
  return (
    <span className={`badge ${m.cls}`}>
      <span className="dot" />
      {m.text}
    </span>
  );
}

interface Props {
  rows: GatewayTxn[];
  loading: boolean;
  onOpen: (t: GatewayTxn) => void;
  emptyText?: string;
}

export default function CardReconRowCards({ rows, loading, onOpen, emptyText }: Props) {
  return (
    <RowCardList empty={loading ? "Đang tải…" : emptyText ?? "Không có giao dịch nào khớp điều kiện lọc."}>
      {rows.map((t) => {
        const dt = formatPaymentDateTime(t.paid_at);
        return (
          <RowCard
            key={t.id}
            title={t.cardholder_name}
            value={vnd(t.amount)}
            onClick={() => onOpen(t)}
            badges={
              <>
                <Badge tone={t.source === "mpos" ? "warn" : "primary"}>
                  {SOURCE_LABEL[t.source as GatewaySource] ?? t.source}
                </Badge>
                {t.installment_term ? (
                  <Badge tone="primary">Trả góp</Badge>
                ) : (
                  <Badge tone="neutral">Thường</Badge>
                )}
                <StatusBadge s={t.match_status} />
              </>
            }
            meta={[
              { label: "Thời gian", value: `${dt.date} ${dt.time}` },
              { label: "Thẻ", value: `${t.card_type} · ${t.card_masked}` },
              { label: "Thực nhận", value: vnd(t.net_amount) },
              ...(t.source === "mpos" && t.settlement_code
                ? [{ label: "Mã phiếu chi", value: t.settlement_code }]
                : []),
              ...(t.source === "payoo" && t.category
                ? [{ label: "Loại", value: t.category }]
                : []),
              ...(t.matched_label
                ? [{ label: "Đã ghép", value: t.matched_label }]
                : []),
            ]}
            actions={
              t.match_status === "pending" ? (
                <Button type="button" size="sm" variant="secondary" onClick={() => onOpen(t)}>
                  Ghép
                </Button>
              ) : undefined
            }
          />
        );
      })}
    </RowCardList>
  );
}
