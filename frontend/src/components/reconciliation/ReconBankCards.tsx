import type { BankTransaction, BankTransactionTeam } from "../../lib/api";
import Button from "../ui/Button";
import { RowCard, RowCardList } from "../ui/RowCard";
import { Icons } from "../payment-request/Icons";
import { formatPaymentDateTime } from "../payment-request/paymentRequestUtils";
import { nextTeam, vnd } from "../payment-flow/paymentFlowUtils";

const TEAM_META: Record<"HCM" | "HN", { bg: string; fg: string }> = {
  HCM: { bg: "#dcfce7", fg: "#15803d" },
  HN:  { bg: "#dbeafe", fg: "#1d4ed8" },
};

interface Props {
  txns: BankTransaction[];
  readOnly: boolean;
  onMatch: (txnId: string) => void;
  onSetTeam?: (txnId: string, team: BankTransactionTeam | null) => void;
}

export default function ReconBankCards({ txns, readOnly, onMatch, onSetTeam }: Props) {
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
              <>
                <span className={`badge ${isReview ? "is-short" : "is-over"}`}>
                  <span className="dot" />
                  {isReview ? "Cần kiểm tra" : "Chờ ghép"}
                </span>
                {b.team && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: "1px 6px",
                      borderRadius: 4,
                      background: TEAM_META[b.team].bg,
                      color: TEAM_META[b.team].fg,
                      marginLeft: 4,
                    }}
                  >
                    {b.team}
                  </span>
                )}
              </>
            }
            meta={[
              { label: "Thời gian", value: `${whenFmt.date} ${whenFmt.time || ""}`.trim() },
              { label: "TK nhận", value: b.account_number || "—" },
            ]}
            onClick={readOnly ? undefined : () => onMatch(b.txn_id)}
            actions={
              <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
                {!readOnly && onSetTeam && (
                  <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                    {(["HCM", "HN"] as const).map((v) => (
                      <label
                        key={v}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          fontSize: 12,
                          fontWeight: 600,
                          color: "var(--text-2)",
                          cursor: "pointer",
                          userSelect: "none",
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={b.team === v}
                          onChange={() => onSetTeam(b.txn_id, nextTeam(b.team, v))}
                          style={{ cursor: "pointer", accentColor: TEAM_META[v].fg }}
                        />
                        {v}
                      </label>
                    ))}
                  </div>
                )}
                {!readOnly && (
                  <Button type="button" size="sm" variant="primary" onClick={() => onMatch(b.txn_id)}>
                    <Icons.Bank size={12} /> Ghép
                  </Button>
                )}
              </div>
            }
          />
        );
      })}
    </RowCardList>
  );
}
