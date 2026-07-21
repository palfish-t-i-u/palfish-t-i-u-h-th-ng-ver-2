import type { ActiveRequest, PaymentRequest } from "../../types/paymentRequest";
import Button from "../ui/Button";
import { RowCard, RowCardList } from "../ui/RowCard";
import { findCountry } from "./CountryCombo";
import { Icons } from "./Icons";
import PaymentRequestStatusBadge from "./PaymentRequestStatusBadge";
import {
  type RequestBucket,
  ddmmyyyy,
  hasUnverifiedFeeLine,
  vnd,
} from "./paymentRequestUtils";
import { formatPhoneIntl } from "./phoneUtils";

interface Props {
  requests: PaymentRequest[];
  tab: RequestBucket;
  selectedId: string | null;
  onSelect: (request: PaymentRequest) => void;
  onCancelClick: (request: PaymentRequest) => void;
  onRestoreClick: (request: PaymentRequest) => void;
  arByPrId: Record<string, ActiveRequest>;
  showTvts: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  emptyText?: string;
}

export default function PrRowCards({
  requests,
  tab,
  selectedId,
  onSelect,
  onCancelClick,
  onRestoreClick,
  arByPrId,
  showTvts,
  hasMore,
  onLoadMore,
  emptyText = "Không có Payment Request nào.",
}: Props) {
  return (
    <div className="space-y-2">
      <RowCardList empty={emptyText}>
        {requests.map((p) => {
          const country = findCountry(p.country);
          const canCancel = p.state !== "cancelled" && p.doneCount === 0;
          const pct = p.target ? Math.round((p.received / p.target) * 100) : 0;
          const ar = arByPrId[p.id];
          return (
            <RowCard
              key={p.id}
              className={selectedId === p.id ? "ring-2 ring-gmv-primary" : undefined}
              title={
                <span>
                  {p.name}
                  {p.isTest && (
                    <span className="ml-1.5 rounded bg-yellow-100 px-1 py-0.5 text-[10px] font-bold text-yellow-700">
                      TEST
                    </span>
                  )}
                </span>
              }
              value={vnd(p.target)}
              badges={
                <>
                  <PaymentRequestStatusBadge state={p.state} totalCount={p.totalCount} provisional={hasUnverifiedFeeLine(p)} />
                  {ar && (
                    <span
                      className={`badge ${ar.uids.some((u) => u.courses.some((c) => !!c.orderId)) ? "is-done" : "is-over"}`}
                      style={{ fontSize: 10.5 }}
                    >
                      {ar.uids.some((u) => u.courses.some((c) => !!c.orderId)) ? "AR ✓" : "AR chờ"}
                    </span>
                  )}
                </>
              }
              meta={[
                { label: "PR-ID", value: p.id },
                { label: "UID", value: p.uid },
                { label: "SĐT", value: `${country.flag} ${formatPhoneIntl(p.country, p.phone)}` },
                ...(showTvts && p.saleName ? [{ label: "TVTS", value: p.saleName }] : []),
                { label: "Thanh toán", value: `${p.doneCount}/${p.totalCount} lần · ${vnd(p.received)} (${pct}%)` },
                { label: "Tạo lúc", value: ddmmyyyy(p.createdAt) },
              ]}
              onClick={() => onSelect(p)}
              actions={
                tab === "cancelled" ? (
                  <Button type="button" size="sm" variant="ghost" onClick={() => onRestoreClick(p)}>
                    <Icons.CheckCircle size={13} /> Khôi phục
                  </Button>
                ) : canCancel ? (
                  <Button type="button" size="sm" variant="danger" onClick={() => onCancelClick(p)}>
                    <Icons.XCircle size={13} /> Huỷ
                  </Button>
                ) : undefined
              }
            />
          );
        })}
      </RowCardList>
      {hasMore && (
        <Button type="button" variant="secondary" fullWidth className="min-h-[44px]" onClick={onLoadMore}>
          Tải thêm
        </Button>
      )}
    </div>
  );
}
