import { useMe } from "./useMe";
import type { AccessLevel } from "../types/permissions";

export function usePermission(moduleKey: string): {
  level: AccessLevel;
  loading: boolean;
  canView: boolean;
  readOnly: boolean;
} {
  const { profile, loading } = useMe();
  const perms = profile?.permissions ?? {};
  const level = (perms[moduleKey] ?? "none") as AccessLevel;
  return {
    level,
    loading,
    canView: !loading && level !== "none",
    readOnly: loading || level === "read",
  };
}
