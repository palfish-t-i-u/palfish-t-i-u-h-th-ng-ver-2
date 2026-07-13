import { describe, it, expect } from "vitest";
import { isReferralPackage, buildCreateActiveRequestPayload } from "./paymentRequestUtils";
import type { PaymentRequest } from "../../types/paymentRequest";

const PR = { id: "PR-1", uid: "u1", phone: "0900000000", country: "VN" } as unknown as PaymentRequest;

describe("isReferralPackage", () => {
  it("detects REFER in name (case-insensitive)", () => {
    expect(isReferralPackage("2/W- Both AB REFER 96 PHI+10 HN")).toBe(true);
    expect(isReferralPackage("2/w both ab refer 96")).toBe(true);
  });
  it("false for non-referral packages", () => {
    expect(isReferralPackage("2/W- Both AB 96 PHI+10 HN")).toBe(false);
    expect(isReferralPackage("")).toBe(false);
  });
});

describe("buildCreateActiveRequestPayload referral", () => {
  it("tags gioi_thieu on REFER courses only", () => {
    const payload = buildCreateActiveRequestPayload(PR, [
      { childName: "Bé A", uid: "u1", packageName: "2/W- Both AB REFER 96", amount: 35000000 },
      { childName: "Bé A", uid: "u1", packageName: "2/W- Normal 48", amount: 10000000 },
    ]);
    const courses = payload.uids[0].courses;
    expect(courses[0].lead_source).toBe("gioi_thieu");
    expect(courses[1].lead_source).toBeUndefined();
  });
});
