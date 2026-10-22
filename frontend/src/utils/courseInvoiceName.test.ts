import { describe, it, expect } from "vitest";
import { courseInvoiceName } from "./courseInvoiceName";

// Mirror backend/tests/test_course_invoice_name.py — nguồn chuẩn chị Thu Hiền
// (bản cuối SM sửa 2026-09-07). FE phải khớp byte-exact với BE.
const PHI = "Philippines";
const AM = "Âu Mỹ";
const name = (value: string, teacher: string) => `Khóa học tiếng Anh ${value} giáo viên ${teacher}`;

describe("courseInvoiceName — gói trong bảng", () => {
  const cases: [string, string][] = [
    // ── 2/W ──
    ["2/W- NEW 24 PHI+2 HN", name("03 tháng", PHI)],
    ["2/W- NEW 24 US-UK+1 HN", name("03 tháng", AM)],
    ["2/W- NEW 32 US-UK+2 HN", name("04 tháng", AM)],
    ["2/W- NEW 48 PHI+5 HCM", name("06 tháng", PHI)],
    ["2/W- NEW 72 PHI+7", name("09 tháng", PHI)],
    ["2/W- NEW 72 US-UK+5", name("09 tháng", AM)],
    ["2/W- NEW 96 PHI+10 HN", name("12 tháng", PHI)],
    ["2/W- NEW 144 PHI+15 HN", name("18 tháng", PHI)],
    ["2/W- NEW 192 PHI+20 HN", name("24 tháng", PHI)],
    // NEW/UPSALE/REFER/Both AB/Only A + HN/HCM đều bị bỏ qua
    ["2/W- UPSALE 48 PHI+5 HN", name("06 tháng", PHI)],
    ["2/W- Both AB (A-PH) REFER 32 PHI+3", name("04 tháng", PHI)],
    ["2/W- Only A REFER 24 PHI+2 HN", name("03 tháng", PHI)],
    // ── 3/W ──
    ["3/W - NEW 24 PHI+2+2 HN", name("02 tháng", PHI)],
    ["3/W - NEW 96 PHI+10+10 HN", name("08 tháng", PHI)],
    ["3/W- COMBO 48 US-UK+2 HN", name("04 tháng", AM)],
    ["3/W- UPSALE 120 US-UK+6 HN", name("10 tháng", AM)],
    // ── 12/M ──
    ["12/M - NEW 30 PHI+10 HN", name("30 buổi", PHI)],
    ["12/M - NEW 60 PHI+20 HN", name("05 tháng", PHI)],
    ["12/M - Both AB REFER 60 PHI +20 HN", name("05 tháng", PHI)],
    ["12/M - NEW 90 PHI+30 HN", name("90 buổi", PHI)],
    ["12/M - NEW 120 PHI+40 HN", name("120 buổi", PHI)],
    ["12/M - NEW 150 PHI+50 HN", name("150 buổi", PHI)],
    // ── 8/M ──
    ["8/M - NEW 30 US-UK+5 HN", name("30 buổi", AM)],
    ["8/M - NEW 60 US-UK+10 HN", name("60 buổi", AM)],
    ["8/M - NEW 120 US-UK+20 HN", name("120 buổi", AM)],
  ];
  it.each(cases)("%s -> %s", (raw, expected) => {
    expect(courseInvoiceName(raw)).toBe(expected);
  });
});

describe("courseInvoiceName — gói ngoài bảng trả rỗng (caller fallback tên thô)", () => {
  const cases = [
    "5/W- VIP 96 US-UK+5 HN", // không bán nữa, ngoài bảng
    "2/W- NEW 24 buoi", // thiếu tag giáo viên
    "Gói tự gõ linh tinh", // free text
    "",
  ];
  it.each(cases)("%j -> ''", (raw) => {
    expect(courseInvoiceName(raw)).toBe("");
  });
});
