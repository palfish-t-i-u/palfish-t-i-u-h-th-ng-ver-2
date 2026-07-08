import Badge from "../ui/Badge";
import { RowCard, RowCardList } from "../ui/RowCard";
import type { ZaloOutboxRow } from "../../lib/api/zaloAdmin";

const EVENT_LABELS: Record<string, string> = {
  payment_paid: "Báo tiền về",
  course_activated: "Kích hoạt TP",
  activation_urgent_reminder: "Nhắc kích hoạt",
  activation_request_created: "Y/c kích hoạt",
};

function eventLabel(eventType: string): string {
  return EVENT_LABELS[eventType] || eventType;
}

function statusTone(row: ZaloOutboxRow): { tone: "ok" | "danger" | "warn" | "primary" | "neutral"; label: string } {
  if (row.sent_at) return { tone: "ok", label: "Đã gửi" };
  if (row.retries >= 99) return { tone: "neutral", label: "Đã huỷ" };
  if (row.retries >= 4) return { tone: "danger", label: "Dead" };
  if (row.retries > 0) return { tone: "warn", label: `Retry ${row.retries}/4` };
  return { tone: "primary", label: "Chờ gửi" };
}

interface Props {
  rows: ZaloOutboxRow[];
  loading: boolean;
  retrying: number | null;
  onRetry: (id: number) => void;
  cancelling?: number | null;
  onCancel?: (id: number) => void;
  formatDate: (iso?: string | null) => string;
}

export default function ZaloOutboxCards({
  rows,
  loading,
  retrying,
  onRetry,
  cancelling,
  onCancel,
  formatDate,
}: Props) {
  if (loading) {
    return (
      <div className="rounded-gmv-md border border-dashed border-gmv-border p-6 text-center text-sm text-gmv-muted">
        Đang tải...
      </div>
    );
  }

  return (
    <RowCardList empty="Chưa có tin nhắn nào">
      {rows.map((row) => {
        const { tone, label } = statusTone(row);
        const canRetry = !row.sent_at;
        const shortMsg =
          row.message.length > 60 ? row.message.slice(0, 60) + "…" : row.message;

        const metaItems: { label: string; value: string }[] = [
          { label: "Group ID", value: row.group_id },
          { label: "Nội dung", value: shortMsg },
          { label: "Tạo lúc", value: formatDate(row.created_at) },
        ];

        if (row.sent_at) {
          metaItems.push({ label: "Gửi lúc", value: formatDate(row.sent_at) });
        }

        if (row.image_url) {
          const imgLabel = row.image_sent_at
            ? "Ảnh: đã gửi"
            : row.image_error
            ? "Ảnh: lỗi"
            : "Ảnh: chờ gửi";
          metaItems.push({ label: "Ảnh", value: imgLabel });
        }

        if (row.last_error) {
          metaItems.push({ label: "Lỗi", value: row.last_error });
        }

        return (
          <RowCard
            key={row.id}
            title={eventLabel(row.event_type)}
            value={`#${row.id}`}
            badges={<Badge tone={tone}>{label}</Badge>}
            meta={metaItems}
            actions={
              canRetry ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => onRetry(row.id)}
                    disabled={retrying === row.id}
                    className="min-h-[44px] px-2 text-xs rounded bg-yellow-50 text-yellow-700 hover:bg-yellow-100 disabled:opacity-50"
                  >
                    {retrying === row.id ? "..." : "Retry"}
                  </button>
                  {row.retries < 99 && onCancel && (
                    <button
                      onClick={() => onCancel(row.id)}
                      disabled={cancelling === row.id}
                      className="min-h-[44px] px-2 text-xs rounded bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50"
                    >
                      {cancelling === row.id ? "..." : "Huỷ"}
                    </button>
                  )}
                </div>
              ) : undefined
            }
          />
        );
      })}
    </RowCardList>
  );
}
