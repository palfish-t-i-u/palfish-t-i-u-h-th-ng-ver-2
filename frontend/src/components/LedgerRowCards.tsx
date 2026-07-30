import Badge from "./ui/Badge";
import Button from "./ui/Button";
import { RowCard, RowCardList } from "./ui/RowCard";
import { cn } from "../lib/cn";
import { formatVndNumber } from "../lib/vndFormat";
import { fmtPayTime, orderIdDisplay } from "../lib/ledgerFormat";
import {
  ledgerPillBase,
  paymentMethodCellClass,
  typeCellClass,
  typeDisplayLabel,
} from "../lib/ledgerCellStyle";
import type { RevenueLedgerRow } from "../types/revenue";

interface Props {
  rows: RevenueLedgerRow[];
  readOnly: boolean;
  deletingId: string | null;
  onEdit: (row: RevenueLedgerRow) => void;
  onDelete: (row: RevenueLedgerRow) => void;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  emptyText: string;
}

export default function LedgerRowCards({
  rows,
  readOnly,
  deletingId,
  onEdit,
  onDelete,
  hasMore,
  loadingMore,
  onLoadMore,
  emptyText,
}: Props) {
  return (
    <div className="space-y-2">
      <RowCardList empty={emptyText}>
        {rows.map((row) => (
          <RowCard
            key={row.id}
            className={deletingId === row.id ? "opacity-60" : undefined}
            title={row.tenKhach || "—"}
            value={`${formatVndNumber(row.soTienVnd) || "0"} ₫`}
            badges={
              <>
                <span title={row.loaiNhap === "tu_dong"
                  ? "Tự ghi khi đơn đã thu đủ 100% và tới bước Kích hoạt."
                  : "Nhập tay hoặc mang từ ngoài vào."}>
                  <Badge tone={row.loaiNhap === "tu_dong" ? "primary" : "neutral"}>
                    {row.loaiNhap === "tu_dong" ? "Tự động" : "Thủ công"}
                  </Badge>
                </span>
                {row.paymentMethod ? (
                  <span className={cn(ledgerPillBase, paymentMethodCellClass(row.paymentMethod))}>
                    {row.paymentMethod}
                  </span>
                ) : null}
                {typeDisplayLabel(row.loai, row.loai2) !== "—" ? (
                  <span className={cn(ledgerPillBase, typeCellClass(row.loai, row.loai2))}>
                    {typeDisplayLabel(row.loai, row.loai2)}
                  </span>
                ) : null}
              </>
            }
            meta={[
              { label: "Pay Time", value: fmtPayTime(row.payTime || row.ngayTienVe) },
              { label: "SĐT", value: row.sdt || "—" },
              { label: "UID", value: row.uid || "—" },
              { label: "Sales", value: row.saleCrmName || "—" },
              { label: "Team", value: row.team || "—" },
              { label: "Nội dung CK", value: row.infoCode || "—" },
              { label: "ID đơn hàng", value: orderIdDisplay(row) },
            ]}
            actions={
              readOnly ? undefined : (
                <>
                  <Button type="button" size="sm" variant="ghost" onClick={() => onEdit(row)}>
                    Chỉnh sửa
                  </Button>
                  {row.loaiNhap === "tay" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="danger"
                      disabled={deletingId === row.id}
                      onClick={() => onDelete(row)}
                    >
                      {deletingId === row.id ? "…" : "Xóa"}
                    </Button>
                  )}
                </>
              )
            }
          />
        ))}
      </RowCardList>
      {hasMore && (
        <Button
          type="button"
          variant="secondary"
          fullWidth
          className="min-h-[44px]"
          disabled={loadingMore}
          onClick={onLoadMore}
        >
          {loadingMore ? "Đang tải thêm…" : "Tải thêm"}
        </Button>
      )}
    </div>
  );
}
