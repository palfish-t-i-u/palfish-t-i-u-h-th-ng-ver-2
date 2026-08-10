import { describe, it, expect } from "vitest";
import { COURSE_PACKAGES, filterPackagesByLeadSource } from "./coursePackages";

describe("filterPackagesByLeadSource", () => {
  it("gia_han → chỉ gói UPSALE", () => {
    const result = filterPackagesByLeadSource("gia_han");
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((p) => p.includes("UPSALE"))).toBe(true);
    // Không có gói NEW hay REFER lọt vào
    expect(result.some((p) => p.includes("NEW"))).toBe(false);
    expect(result.some((p) => p.includes("REFER"))).toBe(false);
  });

  it("gioi_thieu → gói REFER + NEW", () => {
    const result = filterPackagesByLeadSource("gioi_thieu");
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((p) => p.includes("REFER") || p.includes("NEW"))).toBe(true);
    // Không có gói UPSALE lọt vào
    expect(result.some((p) => p.includes("UPSALE"))).toBe(false);
  });

  it("nguồn khác → hiện tất cả gói", () => {
    for (const src of ["quang_cao", "offline", "koc", "kho_chung", "khac"]) {
      const result = filterPackagesByLeadSource(src);
      expect(result).toEqual(COURSE_PACKAGES);
    }
  });

  it("undefined / null / empty → fallback hiện tất cả", () => {
    expect(filterPackagesByLeadSource(undefined)).toEqual(COURSE_PACKAGES);
    expect(filterPackagesByLeadSource(null)).toEqual(COURSE_PACKAGES);
    expect(filterPackagesByLeadSource("")).toEqual(COURSE_PACKAGES);
  });

  it("kết quả không bao giờ rỗng với bất kỳ nguồn nào", () => {
    const allSources = [
      "gia_han",
      "gioi_thieu",
      "quang_cao",
      "offline",
      "koc",
      "kho_chung",
      "khac",
      undefined,
      null,
      "",
    ];
    for (const src of allSources) {
      expect(filterPackagesByLeadSource(src).length).toBeGreaterThan(0);
    }
  });
});
