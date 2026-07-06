import type { BankTransaction } from "../../lib/api";
import Button from "../ui/Button";
import { RowCard, RowCardList } from "../ui/RowCard";
import { Icons } from "../payment-request/Icons";
import { formatPaymentDateTime } from "../payment-request/paymentRequestUtils";
import { vnd } from "../payment-flow/paymentFlowUtils";

interface Props {
  txns: BankTransaction[];
  readOnly: boolean;
  onMatch: (txnId: string) => void;
}

export default function ReconBankCards({ txns, readOnly, onMatch }: Props) {
  return (
    <RowCardList empty="Không có giao dịch CK ngoài chờ ghép.">
      {txns.map((b) => {
        const when = b.transaction_date || b.created_at;
        const whenFmt = when ? formatPaymentDateTime(when) : { date: "—", time: "" };
        const isReview = b.match_status === "needs_review";
        return (
          <RowCard
            key={b.txn_id}
            title={b.transfer_content || b.content || "—"}
            value={vnd(b.amount)}
            badges={
              <span className={`badge ${isReview ? "is-short" : "is-over"}`}>
                <span className="dot" />
                {isReview ? "Cần kiểm tra" : "Chờ ghép"}
              </span>
            }
            meta={[
              { label: "Thời gian", value: `${whenFmt.date} ${whenFmt.time || ""}`.trim() },
              { label: "TK nhận", value: b.account_number || "—" },
            ]}
            onClick={readOnly ? undefined : () => onMatch(b.txn_id)}
            actions={
              !readOnly ? (
                <Button type="button" size="sm" variant="primary" onClick={() => onMatch(b.txn_id)}>
                  <Icons.Bank size={12} /> Ghép
                </Button>
              ) : undefined
            }
          />
        );
      })}
    </RowCardList>
  );
}
