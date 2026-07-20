import { describe, it, expect } from "vitest";
import { smartParsePhonePaste, normalizeLocalPhone, crmPhoneFormat, formatPhoneIntl, applySmartPhoneInput } from "./phoneUtils";
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

describe("formatPhoneIntl — format công ty đầu số-đuôi số (20/7)", () => {
  it("VN sạch", () => {
    expect(formatPhoneIntl("VN", "396249966")).toBe("84-396249966");
  });
  it("data bẩn dính đầu số 84 → tự bỏ (fix double +84)", () => {
    expect(formatPhoneIntl("VN", "84904769355")).toBe("84-904769355");
  });
  it("số 0 đầu → bỏ (mirror BE lstrip)", () => {
    expect(formatPhoneIntl("VN", "0352334789")).toBe("84-352334789");
  });
  it("model FE có sẵn '+84 ... space'", () => {
    expect(formatPhoneIntl("VN", "+84 9889 739 96")).toBe("84-988973996");
  });
  it("nước ngoài map đầy đủ (DE +49 — COUNTRY_DIALS cũ thiếu)", () => {
    expect(formatPhoneIntl("DE", "1727552989")).toBe("49-1727552989");
  });
  it("US format ký tự rác", () => {
    expect(formatPhoneIntl("US", "(415) 555-0131")).toBe("1-4155550131");
  });
  it("country thiếu → fallback VN; phone rỗng → rỗng", () => {
    expect(formatPhoneIntl(undefined, "396249966")).toBe("84-396249966");
    expect(formatPhoneIntl("VN", "")).toBe("");
    expect(formatPhoneIntl("VN", null)).toBe("");
  });
  it("KHÔNG cắt dial khi phần còn lại quá ngắn (≤5)", () => {
    expect(formatPhoneIntl("VN", "84846")).toBe("84-84846");
  });
});

describe("applySmartPhoneInput", () => {
  it("dán 84-352334789 → tách dial + set country VN", () => {
    expect(applySmartPhoneInput("84-352334789")).toEqual({ phone: "352334789", countryCode: "VN" });
  });
  it("dán +420 777710688 → CZ", () => {
    expect(applySmartPhoneInput("+420 777710688")).toEqual({ phone: "777710688", countryCode: "CZ" });
  });
  it("digits trần KHÔNG đoán (G11)", () => {
    expect(applySmartPhoneInput("84987654321")).toEqual({ phone: "84987654321" });
  });
});

describe("card candidate — fallback khi BE chưa trả pr_country (guardrail additive)", () => {
  it("có pr_country → format 84-x; thiếu → giữ raw", () => {
    const withCountry = { pr_phone: "396249966", pr_country: "VN" };
    const without = { pr_phone: "396249966", pr_country: undefined as string | undefined };
    const render = (c: { pr_phone: string; pr_country?: string }) =>
      c.pr_country ? formatPhoneIntl(c.pr_country, c.pr_phone) : c.pr_phone;
    expect(render(withCountry)).toBe("84-396249966");
    expect(render(without)).toBe("396249966");
  });
});
