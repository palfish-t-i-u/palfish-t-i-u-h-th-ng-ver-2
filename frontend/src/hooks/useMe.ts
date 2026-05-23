import { useCallback, useEffect, useState } from "react";
import { endpoints } from "../lib/api";
import type { MeProfile } from "../types/profile";
import { useAuth } from "./useAuth";

const DEV_PROFILE: MeProfile = {
  email: "dev@local",
  userId: null,
  role: "system",
  crmName: "Dev User",
  displayName: "Dev User",
  phone: null,
  team: null,
  subTeam: null,
  managerEmail: null,
  leaderEmail: null,
  isActive: true,
  linked: true,
  canConfirmPayment: true,
  canAccessAdmin: true,
  canManageStaff: true,
};

export function useMe() {
  const { user, isDevMode, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<MeProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (isDevMode) {
      setProfile(DEV_PROFILE);
      setLoading(false);
      setError("");
      return;
    }
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await endpoints.me.get();
      setProfile(res.data as MeProfile);
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "response" in e
          ? String((e as { response?: { data?: { detail?: string } } }).response?.data?.detail || "Không tải hồ sơ")
          : "Không tải hồ sơ";
      setError(msg);
      setProfile({
        email: user.email || "",
        userId: user.id,
        role: "sale",
        crmName: (user.user_metadata?.full_name as string) || null,
        displayName: (user.user_metadata?.full_name as string) || null,
        phone: (user.user_metadata?.phone as string) || null,
        team: (user.user_metadata?.team as string) || null,
        subTeam: null,
        managerEmail: null,
        leaderEmail: null,
        isActive: true,
        linked: false,
        canConfirmPayment: false,
        canAccessAdmin: false,
        canManageStaff: false,
      });
    } finally {
      setLoading(false);
    }
  }, [user, isDevMode]);

  useEffect(() => {
    if (authLoading) return;
    refresh();
  }, [authLoading, refresh]);

  return { profile, loading, error, refresh };
}
