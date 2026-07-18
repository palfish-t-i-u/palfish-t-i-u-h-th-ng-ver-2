import { describe, it, expect } from "vitest";
import { reportButtonState } from "./paymentRequestUtils";

describe("reportButtonState", () => {
  it("chưa đủ tiền → disabled, label mặc định", () => {
    const s = reportButtonState({ ready: false, hasAr: false, unallocated: 0, arLabel: "" });
    expect(s.enabled).toBe(false);
    expect(s.label).toBe("Báo đơn & Kích hoạt");
    expect(s.title).toContain("100%");
  });

  it("đủ tiền, chưa có AR → enabled, label báo đơn lần đầu", () => {
    const s = reportButtonState({ ready: true, hasAr: false, unallocated: 0, arLabel: "" });
    expect(s.enabled).toBe(true);
    expect(s.label).toBe("Báo đơn & Kích hoạt");
  });

  it("có AR + còn tiền chưa phân bổ → enabled, label Báo đơn bổ sung", () => {
    const s = reportButtonState({ ready: true, hasAr: true, unallocated: 1_000_000, arLabel: "Đã kích hoạt khoá học" });
    expect(s.enabled).toBe(true);
    expect(s.label).toBe("Báo đơn bổ sung");
    expect(s.title).toContain("1.000.000");
  });

  it("có AR + hết tiền chưa phân bổ → disabled, label = trạng thái AR", () => {
    const s = reportButtonState({ ready: true, hasAr: true, unallocated: 0, arLabel: "Đã kích hoạt khoá học" });
    expect(s.enabled).toBe(false);
    expect(s.label).toBe("Đã kích hoạt khoá học");
  });

  it("chưa đủ tiền nhưng có AR (edge PR tăng target) → disabled", () => {
    const s = reportButtonState({ ready: false, hasAr: true, unallocated: 500, arLabel: "Chờ kích hoạt khóa học" });
    expect(s.enabled).toBe(false);
  });
});
