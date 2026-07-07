import Badge from "../ui/Badge";
import { RowCard, RowCardList } from "../ui/RowCard";
import type { AuthUserRow } from "../../types/profile";

type StatusKey = "activated" | "pending" | "banned";

const STATUS_LABEL: Record<StatusKey, string> = {
  activated: "Đã kích hoạt",
  pending: "Chờ kích hoạt",
  banned: "Đã khoá",
};

const STATUS_TONE: Record<StatusKey, "ok" | "warn" | "danger"> = {
  activated: "ok",
  pending: "warn",
  banned: "danger",
};

function roleLabel(role: string | null): string {
  if (!role) return "User";
  const r = role.toLowerCase();
  if (r === "system" || r === "admin") return "Admin";
  if (r === "manager") return "Manager";
  if (r === "leader") return "Leader";
  return "User";
}

interface Props {
  users: AuthUserRow[];
  onSelect: (u: AuthUserRow) => void;
  statusOf: (u: AuthUserRow) => StatusKey;
  deptLabel: (u: AuthUserRow) => string;
  emptyText?: string;
}

export default function AuthAccountCards({
  users,
  onSelect,
  statusOf,
  deptLabel,
  emptyText,
}: Props) {
  return (
    <RowCardList empty={emptyText ?? "Không có tài khoản nào."}>
      {users.map((u) => {
        const st = statusOf(u);
        const name = u.crmName || u.fullName || u.email;
        const lastSignInFormatted = u.lastSignIn
          ? new Date(u.lastSignIn).toLocaleString("vi-VN", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "—";

        return (
          <RowCard
            key={u.id}
            title={name}
            value={roleLabel(u.staffRole)}
            onClick={() => onSelect(u)}
            badges={
              <>
                <Badge tone={STATUS_TONE[st]}>{STATUS_LABEL[st]}</Badge>
                <Badge tone="neutral">{deptLabel(u)}</Badge>
              </>
            }
            meta={[
              { label: "Email", value: u.email },
              { label: "SĐT", value: u.phone || "—" },
              { label: "Team", value: u.team || "—" },
              {
                label: "CRM",
                value: u.crmName ? (
                  <span className="text-gmv-ok font-semibold">Đã liên kết</span>
                ) : (
                  <span className="text-gmv-muted">Chưa liên kết</span>
                ),
              },
              { label: "Đăng nhập cuối", value: lastSignInFormatted },
            ]}
          />
        );
      })}
    </RowCardList>
  );
}
