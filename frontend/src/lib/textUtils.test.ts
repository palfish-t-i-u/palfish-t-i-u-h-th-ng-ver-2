import { describe, expect, it } from "vitest";
import { normVi } from "./textUtils";

describe("normVi — chuẩn hoá tiếng Việt cho search", () => {
  it("strip dấu thanh + lowercase", () => {
    expect(normVi("Như Ý")).toBe("nhu y");
    expect(normVi("Nguyễn")).toBe("nguyen");
    expect(normVi("Hà Bảo Ngân")).toBe("ha bao ngan");
  });

  it("đ/Đ → d (base char riêng, KHÔNG bị NFD tách — bẫy kinh điển)", () => {
    expect(normVi("Đặng")).toBe("dang");
    expect(normVi("đường")).toBe("duong");
    expect(normVi("ĐỖ")).toBe("do");
  });

  it("strip toàn bộ dấu phụ (breve/circumflex/horn): ă â ê ô ơ ư", () => {
    expect(normVi("Trần Thị Hương")).toBe("tran thi huong");
    expect(normVi("Vũ Đức Ước")).toBe("vu duc uoc");
  });

  it("chuỗi không dấu giữ nguyên (idempotent)", () => {
    expect(normVi("ha bao ngan")).toBe("ha bao ngan");
    expect(normVi("PR-2026-0314")).toBe("pr-2026-0314");
  });

  it("null-safe: undefined / null / '' → ''", () => {
    expect(normVi(undefined)).toBe("");
    expect(normVi(null)).toBe("");
    expect(normVi("")).toBe("");
  });
});
