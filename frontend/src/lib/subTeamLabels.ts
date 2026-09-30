// Nhãn leader chỉ đúng cho Inhouse 1 — đây là nơi bộ mã "Team 1..5" gắn với
// tên leader (HuongPT, SonTT...). Các team khác (vd Inhouse 2) cũng dùng lại
// "Team 1"/"Team 2" nhưng leader KHÁC → không được áp map này, giữ nhãn thô.
const SUBTEAM_LABELS: Record<string, string> = {
  "Team 1": "Team HuongPT",
  "Team 2": "Team SonTT",
  "Team 3": "Team VanTT",
  "Team 4": "Team VanBTH",
  "Team 5": "Team AnhLTL",
  "Sales": "Team Nina",
};

// team-aware: chỉ Inhouse 1 (hoặc không truyền team — backward-compat) mới remap
// sang tên leader; team khác trả nguyên "Team 1"/"Team 2".
export function subTeamLabel(
  value: string | null | undefined,
  team?: string | null,
): string {
  if (!value) return "";
  if (team && team !== "Inhouse 1") return value;
  return SUBTEAM_LABELS[value] || value;
}
