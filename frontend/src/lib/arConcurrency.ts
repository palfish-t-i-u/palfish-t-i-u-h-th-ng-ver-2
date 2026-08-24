import type { ActiveRequest, ActiveRequestApiRow, PatchActiveRequestPayload } from "../types/paymentRequest";

export function withExpectedUpdatedAt(
  body: PatchActiveRequestPayload,
  currentAr: ActiveRequest,
): PatchActiveRequestPayload {
  if (!currentAr.updatedAt) return body;
  return { ...body, expected_updated_at: currentAr.updatedAt };
}

export type ArConflictResult =
  | { conflict: true; current: ActiveRequestApiRow }
  | { conflict: false };

export function parseArConflict(err: unknown): ArConflictResult {
  const resp = (err as { response?: { status?: number; data?: { detail?: unknown } } })?.response;
  if (resp?.status !== 409) return { conflict: false };
  const outer = resp.data?.detail;
  if (typeof outer !== "object" || outer === null) return { conflict: false };
  const rec = outer as Record<string, unknown>;
  if (rec.detail !== "Active Request da duoc cap nhat boi nguoi khac") return { conflict: false };
  return { conflict: true, current: rec.current as ActiveRequestApiRow };
}

export const AR_CONFLICT_MESSAGE =
  "AR vừa được người khác cập nhật — đã tải lại bản mới, vui lòng kiểm tra và thao tác lại.";
