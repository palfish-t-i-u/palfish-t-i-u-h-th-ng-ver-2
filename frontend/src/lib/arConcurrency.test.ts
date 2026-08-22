import { describe, it, expect } from "vitest";
import { withExpectedUpdatedAt, parseArConflict, AR_CONFLICT_MESSAGE } from "./arConcurrency";
import type { ActiveRequest } from "../types/paymentRequest";

function makeAr(updatedAt?: string): ActiveRequest {
  return {
    id: "ar-1",
    prId: "pr-1",
    customerName: "Test",
    createdAt: "2026-08-22T00:00:00Z",
    createdBy: "",
    uids: [],
    updatedAt,
  } as ActiveRequest;
}

describe("withExpectedUpdatedAt (G4)", () => {
  it("chèn expected_updated_at khi AR có updatedAt", () => {
    const body = { uids_data: [] };
    const result = withExpectedUpdatedAt(body, makeAr("2026-08-22T10:00:00Z"));
    expect(result.expected_updated_at).toBe("2026-08-22T10:00:00Z");
    expect(result.uids_data).toEqual([]);
  });

  it("KHÔNG chèn field khi AR không có updatedAt (tránh gửi undefined → BE 400)", () => {
    const body = { uids_data: [] };
    const result = withExpectedUpdatedAt(body, makeAr(undefined));
    expect("expected_updated_at" in result).toBe(false);
  });
});

describe("parseArConflict (G5)", () => {
  it("409 nested detail đúng shape → conflict=true + current", () => {
    const mockCurrent = { id: "ar-1", status: "pending_order" };
    const err = {
      response: {
        status: 409,
        data: {
          detail: {
            detail: "Active Request da duoc cap nhat boi nguoi khac",
            current: mockCurrent,
          },
        },
      },
    };
    const result = parseArConflict(err);
    expect(result.conflict).toBe(true);
    if (result.conflict) {
      expect(result.current).toEqual(mockCurrent);
    }
  });

  it("409 order_id 'ton tai' (per-course, khác class) → conflict=false (G1 — không nhầm lớp)", () => {
    const err = {
      response: {
        status: 409,
        data: {
          detail: "order_id 'ORD-123' da ton tai o AR/course khac",
        },
      },
    };
    expect(parseArConflict(err).conflict).toBe(false);
  });

  it("409 detail string thường (không nested) → conflict=false", () => {
    const err = {
      response: {
        status: 409,
        data: { detail: "something else" },
      },
    };
    expect(parseArConflict(err).conflict).toBe(false);
  });

  it("non-409 error → conflict=false", () => {
    const err = {
      response: { status: 500, data: { detail: "server error" } },
    };
    expect(parseArConflict(err).conflict).toBe(false);
  });

  it("network error (no response) → conflict=false", () => {
    expect(parseArConflict(new Error("Network Error")).conflict).toBe(false);
  });
});

describe("AR_CONFLICT_MESSAGE", () => {
  it("message hằng số dùng chung cho tất cả call site", () => {
    expect(AR_CONFLICT_MESSAGE).toContain("người khác cập nhật");
  });
});
