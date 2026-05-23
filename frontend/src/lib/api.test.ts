import { describe, it, expect } from "vitest";
import { endpoints } from "./api";

describe("Giang API contract (mocked via MSW)", () => {
  it("creates an info code", async () => {
    const res = await endpoints.infoCode.create({
      customerName: "Test Student",
      uid: "U001",
      amount: 500000,
    });
    expect(res.status).toBe(201);
    expect(res.data.infoCode).toMatch(/^IC-/);
    expect(res.data.status).toBe("PENDING");
  });

  it("reads info code status", async () => {
    const res = await endpoints.infoCode.status("IC-TEST-001");
    expect(res.status).toBe(200);
    expect(res.data.status).toBe("MATCHED");
  });

  it("fetches recent webhook events", async () => {
    const res = await endpoints.webhook.recentEvents();
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data.events)).toBe(true);
    expect(res.data.events[0]).toHaveProperty("type", "BANK_CREDIT");
  });

  it("triggers CRM activation", async () => {
    const res = await endpoints.crm.activate("IC-TEST-001");
    expect(res.status).toBe(200);
    expect(res.data.activated).toBe(true);
  });
});
