import Badge from "../ui/Badge";
import { RowCard, RowCardList } from "../ui/RowCard";
import type { ZaloGroup } from "../../lib/api/zaloAdmin";

interface Props {
  groups: ZaloGroup[];
  loading: boolean;
  onEdit: (g: ZaloGroup) => void;
  onDelete: (teamCode: string) => void;
  formatDate: (iso?: string) => string;
  canManage: boolean;
}

export default function ZaloGroupCards({
  groups,
  loading,
  onEdit,
  onDelete,
  formatDate,
  canManage,
}: Props) {
  if (loading) {
    return (
      <div className="rounded-gmv-md border border-dashed border-gmv-border p-6 text-center text-sm text-gmv-muted">
        Đang tải...
      </div>
    );
  }

  return (
    <RowCardList empty="Chưa có nhóm Zalo nào">
      {groups.map((g) => (
        <RowCard
          key={g.team_code}
          title={g.group_name}
          value={g.team_code}
          badges={
            <Badge tone={g.is_active ? "ok" : "neutral"}>
              {g.is_active ? "ON" : "OFF"}
            </Badge>
          }
          meta={[
            { label: "Group ID", value: g.group_id },
            { label: "Cập nhật", value: formatDate(g.updated_at) },
          ]}
          actions={
            canManage ? (
              <>
                <button
                  onClick={() => onEdit(g)}
                  className="min-h-[44px] px-2 text-xs rounded bg-blue-50 text-blue-600 hover:bg-blue-100"
                >
                  Sửa
                </button>
                <button
                  onClick={() => onDelete(g.team_code)}
                  className="min-h-[44px] px-2 text-xs rounded bg-red-50 text-red-600 hover:bg-red-100"
                >
                  Xoá
                </button>
              </>
            ) : undefined
          }
        />
      ))}
    </RowCardList>
  );
}
