import { useMemo } from "react";
import { useMe } from "./useMe";

export const ALL_TEAM_FILTERS = [
  { value: "", label: "Toàn công ty" },
  { value: "Inhouse 1", label: "Inhouse 1" },
  { value: "Inhouse 2", label: "Inhouse 2" },
  { value: "HCM (Online)", label: "HCM (Online)" },
  { value: "Linh Dam (Store)", label: "Linh Dam (Store)" },
  { value: "Offline", label: "Offline" },
  { value: "An Binh (Store)", label: "An Binh (Store)" },
  { value: "Khác", label: "Khác" },
] as const;

export function useTeamScope() {
  const { profile } = useMe();

  return useMemo(() => {
    const role = profile?.role ?? "sale";
    const team = (profile?.team ?? "").trim();

    if (role === "system") {
      return {
        teamFilters: ALL_TEAM_FILTERS as readonly { value: string; label: string }[],
        defaultTeam: "",
        isRestricted: false,
      };
    }

    if (team) {
      const match = ALL_TEAM_FILTERS.find((f) => f.value === team);
      const entry = match ?? { value: team, label: team };
      return { teamFilters: [entry], defaultTeam: team, isRestricted: true };
    }

    return {
      teamFilters: ALL_TEAM_FILTERS as readonly { value: string; label: string }[],
      defaultTeam: "",
      isRestricted: false,
    };
  }, [profile?.role, profile?.team]);
}
