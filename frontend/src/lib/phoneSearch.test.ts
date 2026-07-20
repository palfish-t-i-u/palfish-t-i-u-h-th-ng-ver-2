import { describe, it, expect } from "vitest";
import { phoneMatchesQuery, phoneSearchDigits } from "./phoneSearch";

describe("phoneSearchDigits", () => {
  it("bỏ mọi ký tự ≠ số + toàn bộ số 0 đầu", () => {
    expect(phoneSearchDigits("+84 396-249.966")).toBe("84396249966");
    expect(phoneSearchDigits("0396249966")).toBe("396249966");
    expect(phoneSearchDigits("")).toBe("");
    expect(phoneSearchDigits(null)).toBe("");
  });
});

describe("phoneMatchesQuery", () => {
  const PHONE = "396249966"; // đuôi số như DB lưu

  it("query format công ty 84-đuôi → khớp", () => {
    expect(phoneMatchesQuery(PHONE, "84-396249966")).toBe(true);
  });
  it("query 84 dính liền → khớp", () => {
    expect(phoneMatchesQuery(PHONE, "84396249966")).toBe(true);
  });
  it("query có số 0 đầu → khớp", () => {
    expect(phoneMatchesQuery(PHONE, "0396249966")).toBe(true);
  });
  it("query +84 với space → khớp", () => {
    expect(phoneMatchesQuery(PHONE, "+84 396 249 966")).toBe(true);
  });
  it("phone trong DB dính sẵn 84 (data bẩn), query dạng 0x → khớp", () => {
    expect(phoneMatchesQuery("84904769355", "0904769355")).toBe(true);
  });
  it("phone trong DB dạng '+84 9889 739 96' (model FE có space) → khớp query 84-x", () => {
    expect(phoneMatchesQuery("+84 9889 739 96", "84-988973996")).toBe(true);
  });
  it("substring ≥4 digits vẫn khớp (giữ hành vi tìm 1 phần số)", () => {
    expect(phoneMatchesQuery(PHONE, "9624")).toBe(true);
  });
  it("query < 4 digits → KHÔNG khớp (tránh '84' match mọi số)", () => {
    expect(phoneMatchesQuery(PHONE, "84")).toBe(false);
  });
  it("query có chữ (không phải dạng SĐT) → KHÔNG khớp nhánh này", () => {
    expect(phoneMatchesQuery(PHONE, "PR-2026")).toBe(false);
    expect(phoneMatchesQuery(PHONE, "chi thuong")).toBe(false);
  });
  it("số khác → KHÔNG khớp", () => {
    expect(phoneMatchesQuery(PHONE, "84-999999999")).toBe(false);
  });
  it("phone rỗng/null → KHÔNG khớp", () => {
    expect(phoneMatchesQuery("", "84-396249966")).toBe(false);
    expect(phoneMatchesQuery(null, "84-396249966")).toBe(false);
  });
});
