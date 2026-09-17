/**
 * Cờ bật server-side pagination cho tab Quản lý thanh toán (B1).
 * Xem docs/superpowers/plans/2026-09-15-pr-list-server-pagination.md M3-T1.
 *
 * Mặc định "load-all" (hành vi hiện tại, không đổi gì) — chỉ bật "server" khi
 * env VITE_PR_LIST_MODE=server (Vercel sandbox trước, prod sau khi verify đủ M4).
 * Rollback: đổi env về mặc định/xoá — không cần deploy code.
 */
export type PrListMode = "load-all" | "server";

export const PR_LIST_MODE: PrListMode =
  import.meta.env.VITE_PR_LIST_MODE === "server" ? "server" : "load-all";
