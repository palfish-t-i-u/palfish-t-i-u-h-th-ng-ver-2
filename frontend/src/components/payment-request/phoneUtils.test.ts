import { describe, it, expect } from "vitest";
import { smartParsePhonePaste, normalizeLocalPhone, crmPhoneFormat } from "./phoneUtils";
import { findCountry } from "./CountryCombo";

describe("smartParsePhonePaste", () => {
  it("cắt đầu số dạng 420-777710688 → dial 420 + local", () => {
    expect(smartParsePhonePaste("420-777710688")).toEqual({ dial: "420", local: "777710688" });
  });
  it("cắt +84 352334789 (dấu cộng + space)", () => {
    expect(smartParsePhonePaste("+84 352334789")).toEqual({ dial: "84", local: "352334789" });
  });
  it("đầu số không tồn tại → giữ nguyên digits, không dial", () => {
    expect(smartParsePhonePaste("999-123456789")).toEqual({ local: "999123456789" });
  });
  it("không separator → chỉ lọc ký tự rác, KHÔNG đoán đầu số (G11)", () => {
    expect(smartParsePhonePaste("84987654321")).toEqual({ local: "84987654321" });
  });
  it("lọc ký tự rác (ngoặc, chấm, space)", () => {
    expect(smartParsePhonePaste("(035) 233.4789")).toEqual({ local: "0352334789" });
  });
});

describe("normalizeLocalPhone", () => {
  const vn = findCountry("VN"); // exampleLocal "987 654 321" = 9 digits

  it("bỏ 1 số 0 đầu khi sau khi bỏ khớp độ dài mẫu", () => {
    expect(normalizeLocalPhone("0352334789", vn)).toEqual({ value: "352334789", warn: false });
  });
  it("KHÔNG bỏ 0 khi bắt đầu 00 (số 0 đầu thật — G11)", () => {
    const r = normalizeLocalPhone("0083329127", vn);
    expect(r.value).toBe("0083329127");
  });
  it("KHÔNG bỏ 0 khi độ dài sau bỏ vẫn lệch", () => {
    const r = normalizeLocalPhone("035233", vn);
    expect(r.value).toBe("035233");
    expect(r.warn).toBe(true); // 6 digits, lệch >1 vs 9
  });
  it("đúng độ dài → không cảnh báo", () => {
    expect(normalizeLocalPhone("352334789", vn).warn).toBe(false);
  });
  it("lệch 1 → tha (exampleLocal chỉ là 1 mẫu, nhiều nước có range)", () => {
    expect(normalizeLocalPhone("35233478", vn).warn).toBe(false); // 8 vs 9
  });
  it("lệch >1 → cảnh báo (case user: 420 mà đuôi 11 số)", () => {
    const cz = findCountry("CZ");
    const czLen = cz.exampleLocal.replace(/\D/g, "").length;
    const tooLong = "1".repeat(czLen + 2);
    expect(normalizeLocalPhone(tooLong, cz).warn).toBe(true);
  });
  it("rỗng → không cảnh báo (chưa điền ≠ điền sai)", () => {
    expect(normalizeLocalPhone("", vn).warn).toBe(false);
  });
});

describe("crmPhoneFormat", () => {
  it("dạng CRM đầu số-đuôi số", () => {
    expect(crmPhoneFormat("352334789", findCountry("VN"))).toBe("84-352334789");
  });
  it("local rỗng → chuỗi rỗng", () => {
    expect(crmPhoneFormat("", findCountry("VN"))).toBe("");
  });
});
