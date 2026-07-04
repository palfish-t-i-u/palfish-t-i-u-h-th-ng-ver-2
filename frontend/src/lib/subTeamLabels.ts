const SUBTEAM_LABELS: Record<string, string> = {
  "Team 1": "Team HuongPT",
  "Team 2": "Team SonTT",
  "Team 3": "Team VanTT",
  "Team 4": "Team VanBTH",
  "Team 5": "Team AnhLTL",
  "Sales": "Team Nina",
};

export function subTeamLabel(value: string | null | undefined): string {
  if (!value) return "";
  return SUBTEAM_LABELS[value] || value;
}
