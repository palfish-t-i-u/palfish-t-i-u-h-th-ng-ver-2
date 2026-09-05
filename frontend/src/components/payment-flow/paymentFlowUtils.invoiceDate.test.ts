import { describe, it, expect } from "vitest";
import { invoiceDateFor, type InvoiceRow } from "./paymentFlowUtils";

function makeRow(opts: {
  invoiced?: boolean;
  invoicedAt?: string | null;
  tienVeMuon?: string | null;
  tienVeSom?: string | null;
  createdAt?: string;
}): InvoiceRow {
  return {
    ar: {
      createdAt: opts.createdAt ?? "2026-09-03",
      tienVeSom: opts.tienVeSom ?? null,
      tienVeMuon: opts.tienVeMuon ?? null,
    },
    course: {
      invoiced: opts.invoiced ?? false,
      invoicedAt: opts.invoicedAt ?? null,
    },
  } as unknown as InvoiceRow;
}

describe("invoiceDateFor — mốc ngày B4 theo tiền về", () => {
  it("chờ xuất → ngày tiền về MUỘN nhất (đủ tiền)", () => {
    // đơn có CK 31/08 + thẻ funded 04/09 → phải neo 04/09 (muộn), không phải 31/08 (sớm)
    expect(invoiceDateFor(makeRow({ tienVeMuon: "2026-09-04", tienVeSom: "2026-08-31" }))).toBe("2026-09-04");
  });

  it("chờ xuất, thiếu muộn → fallback tiền về sớm nhất", () => {
    expect(invoiceDateFor(makeRow({ tienVeMuon: null, tienVeSom: "2026-08-31" }))).toBe("2026-08-31");
  });

  it("chờ xuất, chưa có tiền về → fallback ngày tạo (không biến mất)", () => {
    expect(invoiceDateFor(makeRow({ tienVeMuon: null, tienVeSom: null, createdAt: "2026-09-03" }))).toBe("2026-09-03");
  });

  it("đã xuất → ngày lập HĐ (bỏ qua tiền về)", () => {
    expect(
      invoiceDateFor(makeRow({ invoiced: true, invoicedAt: "2026-09-05 12:30", tienVeMuon: "2026-09-04" }))
    ).toBe("2026-09-05 12:30");
  });

  it("đã xuất, thiếu invoicedAt → fallback ngày tạo", () => {
    expect(invoiceDateFor(makeRow({ invoiced: true, invoicedAt: null, createdAt: "2026-09-03" }))).toBe("2026-09-03");
  });
});
