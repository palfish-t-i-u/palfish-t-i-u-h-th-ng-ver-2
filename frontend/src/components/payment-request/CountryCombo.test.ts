import { describe, expect, it } from "vitest";
import { COUNTRIES, findCountry } from "./CountryCombo";

describe("CountryCombo COUNTRIES data", () => {
  it("bổ sung đủ Czechia (+420) — bug báo cáo 08/07", () => {
    const cz = findCountry("CZ");
    expect(cz.code).toBe("CZ");
    expect(cz.dial).toBe("+420");
    expect(cz.flag).toBe("🇨🇿");
  });

  it("giữ nguyên 49 quốc gia curated cũ (không bị generate đè lên)", () => {
    const vn = findCountry("VN");
    expect(vn).toEqual({
      code: "VN",
      name: "Việt Nam",
      dial: "+84",
      flag: "🇻🇳",
      exampleLocal: "987 654 321",
    });
    // US/CA dùng root-only "+1", không phải root+area-code
    expect(findCountry("US").dial).toBe("+1");
    expect(findCountry("CA").dial).toBe("+1");
  });

  it("danh sách đầy đủ hơn nhiều so với 49 mục cũ", () => {
    expect(COUNTRIES.length).toBeGreaterThan(200);
  });

  it("không có mã quốc gia trùng lặp", () => {
    const codes = COUNTRIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("mọi mục đều có dial bắt đầu bằng + và exampleLocal không rỗng", () => {
    // exampleLocal không rỗng là bắt buộc — vài nơi gọi .replace() thẳng lên nó
    // (vd ActivationTab.tsx, PaymentRequestDetailDrawer.tsx) nên không được rỗng/undefined.
    for (const c of COUNTRIES) {
      expect(c.dial.startsWith("+"), `${c.code} dial phải bắt đầu bằng +`).toBe(true);
      expect(c.exampleLocal.length, `${c.code} exampleLocal không được rỗng`).toBeGreaterThan(0);
      expect(c.flag.length, `${c.code} flag không được rỗng`).toBeGreaterThan(0);
    }
  });

  it("findCountry fallback về VN khi không tìm thấy / không truyền code", () => {
    expect(findCountry(undefined).code).toBe("VN");
    expect(findCountry("XX-not-a-real-code").code).toBe("VN");
  });
});
