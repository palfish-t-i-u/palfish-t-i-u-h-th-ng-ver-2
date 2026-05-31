import { useMe } from "./useMe";
import type { AccessLevel } from "../types/permissions";

export function usePermission(moduleKey: string): {
  level: AccessLevel;
  canView: boolean;
  readOnly: boolean;
} {
  const { profile } = useMe();
  const perms = profile?.permissions ?? {};
  const level = (perms[moduleKey] ?? "full") as AccessLevel;
  return {
    level,
    canView: level !== "none",
    readOnly: level === "read",
  };
}
