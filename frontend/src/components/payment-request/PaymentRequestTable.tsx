import { cn } from "../../lib/cn";
import type { PaymentRequest } from "../../types/paymentRequest";
import { Table, TableWrap, Td, Th, Tr } from "../ui";
import PaymentRequestProgress from "./PaymentRequestProgress";
import PaymentRequestStatusBadge from "./PaymentRequestStatusBadge";
import { createdAtDate, hasCreatedPackage, vnd } from "./paymentRequestUtils";

function DeltaCell({ request }: { request: PaymentRequest }) {
  if (request.delta === 0) return <span className="font-bold text-gmv-ok">Đã đủ</span>;
  return (
    <span className={cn("font-bold", request.delta > 0 ? "text-gmv-warn" : "text-gmv-danger")}>
      {request.delta > 0 ? "+" : ""}
      {vnd(request.delta)}
    </span>
  );
}

export default function PaymentRequestTable({
  requests,
  selectedId,
  onSelect,
  onCancel,
}: {
  requests: PaymentRequest[];
  selectedId: string | null;
  onSelect: (request: PaymentRequest) => void;
  onCancel: (request: PaymentRequest) => void;
}) {
  return (
    <TableWrap className="rounded-none border-0 shadow-none">
      <Table className="min-w-[1320px]">
        <thead>
          <tr>
            <Th className="text-left">TẠO LÚC</Th>
            <Th className="text-left">PR-ID</Th>
            <Th className="text-left">TÊN KHÁCH HÀNG</Th>
            <Th className="text-left">UID / SĐT</Th>
            <Th>SỐ LẦN TT</Th>
            <Th className="text-left">TIẾN TRÌNH THANH TOÁN</Th>
            <Th>TRẠNG THÁI</Th>
            <Th>CHÊNH LỆCH</Th>
            <Th>TT GÓI HỌC</Th>
            <Th>HỦY</Th>
          </tr>
        </thead>
        <tbody>
          {requests.map((request) => {
            const created = createdAtDate(request.createdAt);
            const phone = request.phone.trim().startsWith("+") ? request.phone : `+84 ${request.phone}`;
            return (
              <Tr
                key={request.id}
                onClick={() => onSelect(request)}
                className={cn("cursor-pointer", selectedId === request.id && "[&>td]:bg-gmv-primary-soft")}
              >
                <Td className="text-left">
                  <div>{created.date}</div>
                  <div className="text-sm text-gmv-text-strong">{created.time}</div>
                </Td>
                <Td className="text-left font-mono text-sm font-bold text-gmv-text-strong">{request.id.replace("PR-2026-", "PR-2026-\n")}</Td>
                <Td className="text-left">
                  <div className="font-bold text-gmv-text-strong">{request.name}</div>
                  <div className="mt-1 text-xs text-gmv-muted">{request.address || "—"}</div>
                </Td>
                <Td className="text-left font-mono text-xs text-gmv-secondary">
                  <div>{request.uid}</div>
                  <div className="mt-1">{request.country} {phone}</div>
                </Td>
                <Td>
                  <span className="font-bold text-gmv-primary">{request.doneCount}</span>
                  <span className="text-gmv-muted"> / {request.totalCount || 1}</span>
                  <span className="ml-1 text-gmv-muted">lần</span>
                </Td>
                <Td className="text-left"><PaymentRequestProgress request={request} /></Td>
                <Td><PaymentRequestStatusBadge state={request.state} /></Td>
                <Td><DeltaCell request={request} /></Td>
                <Td>
                  {hasCreatedPackage(request) ? (
                    <span className="inline-flex items-center rounded-full bg-gmv-ok-soft px-3 py-1 text-xs font-bold text-gmv-ok">✓ Đã tạo</span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-gmv-bg px-3 py-1 text-xs font-bold text-gmv-muted">— Chưa tạo</span>
                  )}
                </Td>
                <Td>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onCancel(request);
                    }}
                    disabled={request.state === "cancelled"}
                    className="grid size-6 place-items-center rounded-full border border-gmv-border text-gmv-muted transition hover:border-gmv-danger hover:text-gmv-danger disabled:opacity-40"
                    aria-label="Huỷ PR"
                  >
                    ×
                  </button>
                </Td>
              </Tr>
            );
          })}
          {requests.length === 0 && (
            <tr>
              <Td colSpan={10} className="py-10 text-gmv-muted">Không có Payment Request phù hợp.</Td>
            </tr>
          )}
        </tbody>
      </Table>
    </TableWrap>
  );
}
