import { describe, expect, it } from "vitest";
import { provinces, wardsByProvinceCode, VN_PROVINCES_VERSION } from "./vnProvinces";

describe("vnProvinces static data", () => {
  it("has version metadata", () => {
    expect(VN_PROVINCES_VERSION).toMatch(/^v\d+\.\d+\.\d+$/);
  });

  it("has exactly 34 provinces (sáp nhập 2025)", () => {
    expect(provinces.length).toBe(34);
  });

  it("every province has valid code + name", () => {
    for (const p of provinces) {
      expect(typeof p.code).toBe("number");
      expect(typeof p.name).toBe("string");
      expect(p.name.length).toBeGreaterThan(0);
    }
  });

  it("every province has wards key", () => {
    for (const p of provinces) {
      expect(wardsByProvinceCode[p.code]).toBeDefined();
      expect(Array.isArray(wardsByProvinceCode[p.code])).toBe(true);
    }
  });

  it("total wards ≥ 3000", () => {
    const total = Object.values(wardsByProvinceCode).reduce((sum, ws) => sum + ws.length, 0);
    expect(total).toBeGreaterThanOrEqual(3000);
  });

  it("wards within each province are sorted (locale vi)", () => {
    for (const code of Object.keys(wardsByProvinceCode)) {
      const wards = wardsByProvinceCode[Number(code)];
      const sorted = [...wards].sort((a, b) => a.localeCompare(b, "vi"));
      expect(wards).toEqual(sorted);
    }
  });

  it("Hà Nội exists with sensible ward count", () => {
    const hn = provinces.find((p) => /Hà Nội/i.test(p.name));
    expect(hn).toBeDefined();
    expect(wardsByProvinceCode[hn!.code].length).toBeGreaterThan(50);
  });

  it("TP.HCM exists with sensible ward count", () => {
    const hcm = provinces.find((p) => /Hồ Chí Minh/i.test(p.name));
    expect(hcm).toBeDefined();
    expect(wardsByProvinceCode[hcm!.code].length).toBeGreaterThan(50);
  });

  it("Đà Nẵng exists", () => {
    const dn = provinces.find((p) => /Đà Nẵng/i.test(p.name));
    expect(dn).toBeDefined();
    expect(wardsByProvinceCode[dn!.code].length).toBeGreaterThan(10);
  });
});
