import Badge from "../ui/Badge";
import { RowCard, RowCardList } from "../ui/RowCard";
import { CASH_IN_GROUP_LABELS, CASH_IN_TAXONOMY, type CashInRow } from "../../types/cashIn";

function fmtVnd(n: number): string {
  return new Intl.NumberFormat("vi-VN").format(Math.round(n));
}

function fmtRmb(n: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

const GROUP_BADGE_TONE: Record<CashInRow["group"], "primary" | "ok" | "warn" | "neutral"> = {
  khach_tra: "primary",
  the: "ok",
  the_gop: "ok",
  rut_tiktok: "warn",
  khac: "neutral",
};

interface Props {
  rows: CashInRow[];
  loading: boolean;
  savingKey: string | null;
  onClassify: (row: CashInRow, taxonomyLabel: string) => void;
  onNoteBlur: (row: CashInRow, note: string) => void;
}

export default function BC04CashInRowCards({ rows, loading, savingKey, onClassify, onNoteBlur }: Props) {
  if (loading && rows.length === 0) {
    return <div className="rounded-gmv-md border border-dashed border-gmv-border p-6 text-center text-sm text-gmv-muted">Đang tải...</div>;
  }

  return (
    <RowCardList empty="Không có khoản tiền về trong khoảng ngày đã chọn.">
      {rows.map((row) => {
        const key = `${row.source}:${row.txnId}`;
        const currentLabel =
          CASH_IN_TAXONOMY.find((o) => o.businessLine === row.businessLine && o.mainCat === row.mainCat)?.label ?? "";
        return (
          <RowCard
            key={key}
            title={fmtDate(row.date)}
            value={`${fmtVnd(row.input)} đ`}
            badges={
              <>
                <Badge tone={GROUP_BADGE_TONE[row.group]}>{CASH_IN_GROUP_LABELS[row.group]}</Badge>
                <Badge tone="neutral">{row.dataSource}</Badge>
                {!row.isSplit && <Badge tone="warn">Phiếu chi chưa tách</Badge>}
              </>
            }
            meta={[
              { label: "Nội dung", value: row.details },
              { label: "Số dư", value: `${fmtVnd(row.balance)} đ` },
              { label: "Thu RMB", value: `¥${fmtRmb(row.rmb)}` },
              { label: "Đội", value: row.team || (row.unmatched ? "Chưa rõ sale/team" : "—") },
            ]}
            actions={
              <div className="flex w-full flex-col gap-2">
                <select
                  className="min-h-10 w-full min-w-0 rounded-gmv-sm border border-gmv-border px-2 text-sm"
                  value={currentLabel}
                  disabled={savingKey === key}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => onClassify(row, e.target.value)}
                >
                  <option value="">— Chọn phân loại —</option>
                  {CASH_IN_TAXONOMY.map((o) => (
                    <option key={o.label} value={o.label}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <input
                  className="min-h-10 w-full min-w-0 rounded-gmv-sm border border-gmv-border px-2 text-sm"
                  placeholder="Ghi chú"
                  defaultValue={row.note ?? ""}
                  disabled={savingKey === key}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={(e) => onNoteBlur(row, e.target.value)}
                />
              </div>
            }
          />
        );
      })}
    </RowCardList>
  );
}
