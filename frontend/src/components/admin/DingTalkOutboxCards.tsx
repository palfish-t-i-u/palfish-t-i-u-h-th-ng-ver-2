// frontend/src/components/admin/DingTalkOutboxCards.tsx
import Badge from "../ui/Badge";
import { RowCard, RowCardList } from "../ui/RowCard";
import type { DingTalkOutboxRow } from "../../lib/api/dingtalkAdmin";

interface Props {
  rows: DingTalkOutboxRow[];
  loading: boolean;
  onRetry: (id: number) => void;
}

function getStatusTone(row: DingTalkOutboxRow): {
  tone: "ok" | "danger" | "warn" | "neutral";
  label: string;
} {
  if (row.sent_at) return { tone: "ok", label: "sent" };
  if (row.retries >= 4) return { tone: "danger", label: "dead" };
  if (row.retries > 0) return { tone: "warn", label: `retry ${row.retries}` };
  return { tone: "neutral", label: "pending" };
}

export default function DingTalkOutboxCards({
  rows,
  loading,
  onRetry,
}: Props) {
  if (loading) {
    return <div className="text-gray-500">Đang tải...</div>;
  }

  return (
    <RowCardList empty="Chưa có tin nhắn nào.">
      {rows.map((r) => {
        const { tone, label } = getStatusTone(r);
        const truncatedMsg =
          r.message.length > 60 ? r.message.slice(0, 60) + "…" : r.message;

        return (
          <RowCard
            key={r.id}
            title={r.event_type}
            badges={<Badge tone={tone}>{label}</Badge>}
            meta={[
              { label: "ID", value: <span className="font-mono">{r.id}</span> },
              {
                label: "team_code",
                value: <span className="font-mono">{r.team_code}</span>,
              },
              { label: "Nội dung", value: truncatedMsg },
              {
                label: "Tạo lúc",
                value: new Date(r.created_at).toLocaleString("vi-VN"),
              },
              ...(r.last_error
                ? [
                    {
                      label: "Lỗi",
                      value: (
                        <span className="text-red-600">{r.last_error}</span>
                      ),
                    },
                  ]
                : []),
            ]}
            actions={
              !r.sent_at ? (
                <button
                  onClick={() => onRetry(r.id)}
                  className="min-h-[44px] px-2 rounded text-xs text-blue-600 hover:bg-blue-50"
                >
                  Retry
                </button>
              ) : undefined
            }
          />
        );
      })}
    </RowCardList>
  );
}
