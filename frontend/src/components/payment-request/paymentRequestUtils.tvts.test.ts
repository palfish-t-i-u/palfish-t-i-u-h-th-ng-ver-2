import { describe, expect, it } from "vitest";
import {
  UNKNOWN_TVTS_KEY,
  applyTvtsFilter,
  deriveTvtsOptions,
  tvtsKeyOf,
  tvtsLabelOf,
} from "./paymentRequestUtils";
import type { PaymentRequest } from "../../types/paymentRequest";

function makePr(overrides: Partial<PaymentRequest> = {}): PaymentRequest {
  return {
    id: "pr-test",
    name: "Test Student",
    uid: "123456789",
    phone: "0900000000",
    country: "VN",
    address: "",
    target: 0,
    source: "manual",
    createdAt: "2026-01-01T00:00:00Z",
    received: 0,
    doneCount: 0,
    totalCount: 0,
    delta: 0,
    state: "tracking",
    payments: [],
    saleEmail: "",
    saleName: undefined,
    ...overrides,
  } as PaymentRequest;
}

describe("tvtsKeyOf", () => {
  it("chuẩn hoá email: trim + lowercase", () => {
    const r = makePr({ saleEmail: "  Nhung@PF.vn " });
    expect(tvtsKeyOf(r)).toBe("nhung@pf.vn");
  });

  it("saleEmail rỗng hoặc undefined → UNKNOWN_TVTS_KEY", () => {
    expect(tvtsKeyOf(makePr({ saleEmail: "" }))).toBe(UNKNOWN_TVTS_KEY);
    expect(tvtsKeyOf(makePr({ saleEmail: undefined }))).toBe(UNKNOWN_TVTS_KEY);
  });
});

describe("tvtsLabelOf", () => {
  it("ưu tiên saleName khi có", () => {
    const r = makePr({ saleEmail: "nhung@pf.vn", saleName: "Le Thuy Nhung" });
    expect(tvtsLabelOf(r)).toBe("Le Thuy Nhung");
  });

  it("fallback phần trước @ khi thiếu saleName", () => {
    const r = makePr({ saleEmail: "nhung@pf.vn", saleName: undefined });
    expect(tvtsLabelOf(r)).toBe("nhung");
  });

  it("không có gì → 'Không rõ TVTS'", () => {
    const r = makePr({ saleEmail: "", saleName: undefined });
    expect(tvtsLabelOf(r)).toBe("Không rõ TVTS");
  });
});

describe("deriveTvtsOptions", () => {
  it("unique theo key, count đúng số PR mỗi TVTS", () => {
    const prs = [
      makePr({ saleEmail: "trinh@pf.vn", saleName: "Trinh" }),
      makePr({ saleEmail: "trinh@pf.vn", saleName: "Trinh" }),
      makePr({ saleEmail: "nhung@pf.vn", saleName: "Nhung" }),
    ];
    const opts = deriveTvtsOptions(prs);
    expect(opts).toHaveLength(2);
    const trinh = opts.find((o) => o.key === "trinh@pf.vn");
    expect(trinh?.count).toBe(2);
  });

  it("cùng email khác hoa thường → gộp 1 option", () => {
    const prs = [
      makePr({ saleEmail: "A@pf.vn" }),
      makePr({ saleEmail: "a@pf.vn" }),
    ];
    const opts = deriveTvtsOptions(prs);
    expect(opts).toHaveLength(1);
    expect(opts[0].count).toBe(2);
  });

  it("PR đầu thiếu saleName, PR sau có → label lấy saleName", () => {
    const prs = [
      makePr({ saleEmail: "trinh@pf.vn", saleName: undefined }),
      makePr({ saleEmail: "trinh@pf.vn", saleName: "Le Thi Thuy Trinh" }),
    ];
    const opts = deriveTvtsOptions(prs);
    expect(opts[0].label).toBe("Le Thi Thuy Trinh");
  });

  it("sort A→Z locale vi, UNKNOWN luôn cuối", () => {
    const prs = [
      makePr({ saleEmail: "" }),
      makePr({ saleEmail: "binh@pf.vn", saleName: "Bình" }),
      makePr({ saleEmail: "anh@pf.vn", saleName: "Ánh" }),
    ];
    const opts = deriveTvtsOptions(prs);
    expect(opts[0].label).toBe("Ánh");
    expect(opts[1].label).toBe("Bình");
    expect(opts[opts.length - 1].key).toBe(UNKNOWN_TVTS_KEY);
  });

  it("mảng rỗng → []", () => {
    expect(deriveTvtsOptions([])).toEqual([]);
  });
});

describe("applyTvtsFilter", () => {
  const prs = [
    makePr({ saleEmail: "trinh@pf.vn" }),
    makePr({ saleEmail: "nhung@pf.vn" }),
    makePr({ saleEmail: "" }),
  ];

  it("selected rỗng → trả về ĐÚNG reference đầu vào", () => {
    const result = applyTvtsFilter(prs, new Set());
    expect(result).toBe(prs);
  });

  it("lọc 1 key → chỉ PR của TVTS đó", () => {
    const result = applyTvtsFilter(prs, new Set(["trinh@pf.vn"]));
    expect(result).toHaveLength(1);
    expect(result[0].saleEmail).toBe("trinh@pf.vn");
  });

  it("lọc nhiều key → union các TVTS", () => {
    const result = applyTvtsFilter(prs, new Set(["trinh@pf.vn", "nhung@pf.vn"]));
    expect(result).toHaveLength(2);
  });

  it("UNKNOWN_TVTS_KEY lọc được PR thiếu saleEmail", () => {
    const result = applyTvtsFilter(prs, new Set([UNKNOWN_TVTS_KEY]));
    expect(result).toHaveLength(1);
    expect(result[0].saleEmail).toBe("");
  });

  it("key không tồn tại trong data → mảng rỗng", () => {
    const result = applyTvtsFilter(prs, new Set(["notexist@pf.vn"]));
    expect(result).toHaveLength(0);
  });
});
