import { describe, it, expect } from "vitest";
import {
  extractEmvAddInfo,
  extractEmvAmount,
  verifyQrPayload,
} from "./qrVerify";

// Helper: build a single TLV entry
const tlv = (tag: string, v: string) =>
  `${tag}${String(v.length).padStart(2, "0")}${v}`;

// Standard test payload matching a real VietQR structure
const payload =
  tlv("00", "01") +
  tlv("38", tlv("00", "A000000727")) +
  tlv("53", "704") +
  tlv("54", "9850000") +
  tlv("58", "VN") +
  tlv("62", tlv("08", "84389926401 Phan Duc Bao FHK81")) +
  tlv("63", "ABCD");

describe("qrVerify — EMV TLV parsing", () => {
  // Test 1: extractEmvAddInfo returns correct addInfo string
  it("extracts addInfo from tag 62 sub-tag 08", () => {
    expect(extractEmvAddInfo(payload)).toBe(
      "84389926401 Phan Duc Bao FHK81"
    );
  });

  // Test 2: extractEmvAmount returns correct amount string
  it("extracts amount from tag 54", () => {
    expect(extractEmvAmount(payload)).toBe("9850000");
  });

  // Test 3: verifyQrPayload returns true for correct code + correct amount
  it("verifyQrPayload returns true for correct transferCode and amount", () => {
    expect(
      verifyQrPayload(payload, { transferCode: "FHK81", amount: 9850000 })
    ).toBe(true);
  });

  // Test 4: Empty transferCode must return false (fail-closed guard)
  it("verifyQrPayload returns false when transferCode is empty string", () => {
    expect(
      verifyQrPayload(payload, { transferCode: "", amount: 9850000 })
    ).toBe(false);
  });

  // Test 5 (was 4): Incident case — different QR content must reject mismatched transferCode
  it("verifyQrPayload returns false when addInfo belongs to different account (incident case)", () => {
    const wrongPayload =
      tlv("00", "01") +
      tlv("54", "9850000") +
      tlv("62", tlv("08", "84394954262 Khoi Nguyen FHK59")) +
      tlv("63", "ABCD");
    expect(
      verifyQrPayload(wrongPayload, { transferCode: "FHK81", amount: 9850000 })
    ).toBe(false);
  });

  // Test 5: Correct transferCode but wrong amount → false
  it("verifyQrPayload returns false when amount does not match", () => {
    expect(
      verifyQrPayload(payload, { transferCode: "FHK81", amount: 9840000 })
    ).toBe(false);
  });

  // Test 6: Malformed payload — must NOT throw, verifyQrPayload returns false
  it("does not throw on malformed payload and returns false", () => {
    expect(() =>
      verifyQrPayload("not-emv", { transferCode: "FHK81", amount: 9850000 })
    ).not.toThrow();
    expect(
      verifyQrPayload("not-emv", { transferCode: "FHK81", amount: 9850000 })
    ).toBe(false);
  });

  // Test 7: Payload missing tag 62 → false (addInfo not found)
  it("verifyQrPayload returns false when tag 62 is absent", () => {
    const noTag62Payload =
      tlv("00", "01") +
      tlv("54", "9850000") +
      tlv("58", "VN") +
      tlv("63", "ABCD");
    expect(
      verifyQrPayload(noTag62Payload, {
        transferCode: "FHK81",
        amount: 9850000,
      })
    ).toBe(false);
  });
});
