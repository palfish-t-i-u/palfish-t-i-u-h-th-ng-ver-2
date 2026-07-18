import { describe, it, expect } from "vitest";
import { buildCreateActiveRequestPayload } from "./paymentRequestUtils";
import type { PaymentRequest, ArDraftRow } from "../../types/paymentRequest";

const PR = { phone: "0977000111", country: "VN" } as PaymentRequest;

const row = (over: Partial<ArDraftRow>): ArDraftRow => ({
  childName: "Bé A", uid: "U1", phone: "", phoneCountry: "VN",
  packageName: "Gói X", amount: 100, leadSource: "", leadChannel: "", ...over,
});

describe("buildCreateActiveRequestPayload — phone per bé (18/7)", () => {
  it("phone của row vào block (không dùng ngầm số PR)", () => {
    const p = buildCreateActiveRequestPayload(PR, [row({ phone: "352334789" })]);
    expect(p.uids[0].phone).toBe("352334789");
    expect(p.uids[0].country).toBe("VN");
  });

  it("phone trống → fallback số PR (bé đầu = số khách)", () => {
    const p = buildCreateActiveRequestPayload(PR, [row({})]);
    expect(p.uids[0].phone).toBe("0977000111");
  });

  it("2 bé 2 số riêng → 2 block đúng số từng bé", () => {
    const p = buildCreateActiveRequestPayload(PR, [
      row({ childName: "Bé A", uid: "U1", phone: "352334789" }),
      row({ childName: "Bé B", uid: "U2", phone: "777710688", phoneCountry: "CZ" }),
    ]);
    expect(p.uids).toHaveLength(2);
    expect(p.uids[0].phone).toBe("352334789");
    expect(p.uids[1].phone).toBe("777710688");
    expect(p.uids[1].country).toBe("CZ");
  });
});
