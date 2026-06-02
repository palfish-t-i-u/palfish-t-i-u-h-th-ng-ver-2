export type RoleLevel = "sale" | "leader" | "manager" | "system";

export interface MeProfile {
  email: string;
  userId: string | null;
  role: RoleLevel;
  crmName: string | null;
  displayName: string | null;
  phone: string | null;
  team: string | null;
  subTeam: string | null;
  managerEmail: string | null;
  leaderEmail: string | null;
  isActive: boolean;
  linked: boolean;
  canConfirmPayment: boolean;
  canAccessAdmin: boolean;
  canManageStaff: boolean;
  isActivated: boolean;
  department: string | null;
  permissions: Record<string, "full" | "read" | "none">;
}

export interface SaleStaffRow {
  id: string;
  crmName: string;
  email: string | null;
  phone: string | null;
  displayName: string | null;
  team: string | null;
  subTeam: string | null;
  role: RoleLevel;
  managerEmail: string | null;
  leaderEmail: string | null;
  isActive: boolean;
}

export interface AuthUserRow {
  id: string;
  email: string;
  providers: string[];
  lastSignIn: string | null;
  createdAt: string | null;
  bannedUntil: string | null;
  crmName: string | null;
  staffRole: string | null;
  isBanned: boolean;
  isActivated: boolean;
  department: string | null;
  team: string | null;
  subTeam: string | null;
  fullName: string | null;
  phone: string | null;
}
