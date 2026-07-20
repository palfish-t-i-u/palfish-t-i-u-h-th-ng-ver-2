/**
 * Trạng thái đồng bộ UID giữa 1 khối uids_data của AR và UID thông tin khách (payment_requests.uid).
 * Bug gốc (20/7): sale sửa UID ở B1 SAU khi AR tạo → uids_data giữ UID cũ, không auto-sync.
 * Đây là GROUND TRUTH cho cảnh báo lệch + nút "Đồng bộ từ PR" ở ActivationTab.
 *
 * Nhánh "match" tái tạo đúng logic isUidFromPr cũ (ActivationTab.tsx:1187): khớp pr.uid HOẶC
 * thuộc 1 PR nào đó (prByUid hit, đa-con). Chỉ THÊM nhánh "diverged" cho phần còn lại.
 * Không ghi đè âm thầm — chỉ phân loại để render.
 */
export type UidSyncState =
  | { kind: "match" }
  | { kind: "none" }
  | { kind: "diverged"; prUid: string; canOneClick: boolean };

export function getUidSyncState(
  blockUid: string | null | undefined,
  prUid: string | null | undefined,
  opts: { matchedOtherPr: boolean; singleUid: boolean }
): UidSyncState {
  const b = String(blockUid || "").trim();
  const p = String(prUid || "").trim();
  if (!b) return { kind: "none" };
  if (p && b === p) return { kind: "match" };
  if (opts.matchedOtherPr) return { kind: "match" };
  if (!p) return { kind: "none" };
  return { kind: "diverged", prUid: p, canOneClick: opts.singleUid };
}
