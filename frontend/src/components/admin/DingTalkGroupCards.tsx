// frontend/src/components/admin/DingTalkGroupCards.tsx
import Badge from "../ui/Badge";
import { RowCard, RowCardList } from "../ui/RowCard";
import type { DingTalkGroup } from "../../lib/api/dingtalkAdmin";

interface Props {
  groups: DingTalkGroup[];
  loading: boolean;
  onToggle: (g: DingTalkGroup) => void;
  onDelete: (teamCode: string) => void;
}

export default function DingTalkGroupCards({
  groups,
  loading,
  onToggle,
  onDelete,
}: Props) {
  if (loading) {
    return <div className="text-gray-500">Đang tải...</div>;
  }

  return (
    <RowCardList empty="Chưa có nhóm nào.">
      {groups.map((g) => (
        <RowCard
          key={g.team_code}
          title={g.group_name}
          value={<span className="font-mono text-sm">{g.team_code}</span>}
          badges={
            <Badge tone={g.is_active ? "ok" : "neutral"}>
              {g.is_active ? "Active" : "Inactive"}
            </Badge>
          }
          meta={[
            {
              label: "Conversation ID",
              value: (
                <span className="font-mono text-xs">
                  {g.open_conversation_id}
                </span>
              ),
            },
            {
              label: "Cập nhật",
              value: g.updated_at
                ? new Date(g.updated_at).toLocaleString("vi-VN")
                : "—",
            },
          ]}
          actions={
            <>
              <button
                onClick={() => onToggle(g)}
                className={`min-h-[44px] px-2 rounded text-xs font-medium ${
                  g.is_active
                    ? "bg-green-100 text-green-700 hover:bg-green-200"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {g.is_active ? "Tắt" : "Bật"}
              </button>
              <button
                onClick={() => onDelete(g.team_code)}
                className="min-h-[44px] px-2 rounded text-xs text-red-600 hover:bg-red-50"
              >
                Xóa
              </button>
            </>
          }
        />
      ))}
    </RowCardList>
  );
}
