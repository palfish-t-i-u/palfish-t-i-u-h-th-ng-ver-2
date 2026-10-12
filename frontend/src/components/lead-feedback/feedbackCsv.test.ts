import { describe, it, expect } from "vitest";
import { buildFeedbackCsv } from "./feedbackCsv";
import type { LeadFeedback } from "../../types/leadFeedback";

function row(over: Partial<LeadFeedback> = {}): LeadFeedback {
  return {
    id: "id-1",
    created_at: "2026-10-12T08:48:33.000Z",
    sale_email: "sale@example.com",
    sale_name: "Nguyen Van A",
    phone: "84-976771867",
    uid: "3319489016",
    customer_name: "Khach A",
    lead_source: "quang_cao",
    lead_channel: "300265",
    lead_id: "lead-xyz",
    sale_note: "ghi chu",
    sale_images: [],
    status: "wait",
    mkt_note: null,
    mkt_images: [],
    mkt_by: null,
    mkt_at: null,
    ...over,
  };
}

describe("buildFeedbackCsv", () => {
  it("bắt đầu bằng BOM UTF-8 và có dòng header", () => {
    const csv = buildFeedbackCsv([row()]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("Ngày tạo");
    expect(csv).toContain("ID bản ghi");
  });

  it("dịch nhãn trạng thái sang tiếng Việt", () => {
    expect(buildFeedbackCsv([row({ status: "done" })])).toContain("MKT đã feedback");
    expect(buildFeedbackCsv([row({ status: "wait" })])).toContain("Chờ MKT feedback");
  });

  it("dịch nhãn nguồn qua findSourceByKey", () => {
    expect(buildFeedbackCsv([row({ lead_source: "quang_cao" })])).toContain("Quảng cáo");
  });

  it("bọc ngoặc kép khi ô có dấu phẩy", () => {
    expect(buildFeedbackCsv([row({ sale_note: "a, b, c" })])).toContain('"a, b, c"');
  });

  it("nhân đôi ngoặc kép bên trong ô", () => {
    expect(buildFeedbackCsv([row({ sale_note: 'noi "xin chao"' })])).toContain('"noi ""xin chao"""');
  });

  it("giữ xuống dòng trong ô được bọc ngoặc kép", () => {
    const csv = buildFeedbackCsv([row({ sale_note: "dong 1\ndong 2" })]);
    expect(csv).toContain('"dong 1\ndong 2"');
  });

  it("null → ô rỗng, không phải chữ 'null'", () => {
    const csv = buildFeedbackCsv([row({ customer_name: null, mkt_note: null, mkt_by: null })]);
    expect(csv).not.toContain("null");
  });

  it("nối nhiều URL ảnh bằng ' | '", () => {
    const csv = buildFeedbackCsv([
      row({ sale_images: [{ url: "https://a/1.png" }, { url: "https://a/2.png" }] }),
    ]);
    expect(csv).toContain("https://a/1.png | https://a/2.png");
  });

  it("mỗi item là 1 dòng dữ liệu (ngoài header)", () => {
    const csv = buildFeedbackCsv([row(), row({ id: "id-2" })]);
    expect(csv.split("\r\n").length).toBe(3);
  });
});
