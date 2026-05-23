import type { User } from "@supabase/supabase-js";

const OPS_ROLES = new Set(["ops", "system"]);

/** Email Thu Hiền / hệ thống — cấu hình trong .env.local, phân cách bằng dấu phẩy */
function opsEmails(): string[] {
  const raw = import.meta.env.VITE_OPS_EMAILS as string | undefined;
  return (raw || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** Chỉ ops được tick "tiền đã vào" thủ công (khi bank/CRM lỗi) */
export function canConfirmPayment(user: User | null, isDevMode: boolean): boolean {
  if (isDevMode) return true;
  if (!user?.email) return false;
  if (OPS_ROLES.has(String(user.user_metadata?.role || ""))) return true;
  if (opsEmails().includes(user.email.toLowerCase())) return true;
  return false;
}

export function operatorRoleHeader(user: User | null, isDevMode: boolean): string {
  return canConfirmPayment(user, isDevMode) ? "ops" : "sale";
}
