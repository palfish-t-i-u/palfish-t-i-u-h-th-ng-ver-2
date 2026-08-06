import { describe, it, expect } from "vitest";
import { reportButtonState, activationAddressComplete } from "./paymentRequestUtils";

describe("reportButtonState", () => {
  it("chưa đủ tiền → disabled, label mặc định", () => {
    const s = reportButtonState({ ready: false, hasAr: false, unallocated: 0, arLabel: "" });
    expect(s.enabled).toBe(false);
    expect(s.label).toBe("Báo đơn & Tạo gói học");
    expect(s.title).toContain("100%");
  });

  it("đủ tiền, chưa có AR → enabled, label báo đơn lần đầu", () => {
    const s = reportButtonState({ ready: true, hasAr: false, unallocated: 0, arLabel: "" });
    expect(s.enabled).toBe(true);
    expect(s.label).toBe("Báo đơn & Tạo gói học");
  });

  it("có AR + còn tiền chưa phân bổ → enabled, label Báo đơn bổ sung", () => {
    const s = reportButtonState({ ready: true, hasAr: true, unallocated: 1_000_000, arLabel: "Đã tạo gói học" });
    expect(s.enabled).toBe(true);
    expect(s.label).toBe("Báo đơn bổ sung");
    expect(s.title).toContain("1.000.000");
  });

  it("có AR + hết tiền chưa phân bổ → disabled, label = trạng thái AR", () => {
    const s = reportButtonState({ ready: true, hasAr: true, unallocated: 0, arLabel: "Đã tạo gói học" });
    expect(s.enabled).toBe(false);
    expect(s.label).toBe("Đã tạo gói học");
  });

  it("chưa đủ tiền nhưng có AR (edge PR tăng target) → disabled", () => {
    const s = reportButtonState({ ready: false, hasAr: true, unallocated: 500, arLabel: "Chờ tạo gói học" });
    expect(s.enabled).toBe(false);
  });
});

describe("activationAddressComplete", () => {
  it("VN đủ Tỉnh + Phường → true (KHÔNG cần Số nhà)", () => {
    expect(activationAddressComplete({ country: "VN", province: "Thành phố Hồ Chí Minh", ward: "Phường Gò Vấp" })).toBe(true);
  });

  it("VN thiếu Tỉnh → false", () => {
    expect(activationAddressComplete({ country: "VN", province: "", ward: "Phường Gò Vấp" })).toBe(false);
  });

  it("VN thiếu Phường → false", () => {
    expect(activationAddressComplete({ country: "VN", province: "Hà Nội", ward: "" })).toBe(false);
  });

  it("VN chỉ khoảng trắng → false", () => {
    expect(activationAddressComplete({ country: "VN", province: "  ", ward: "  " })).toBe(false);
  });

  it("country mặc định (undefined → VN) áp luật VN", () => {
    expect(activationAddressComplete({ province: "Hà Nội", ward: "Phường Cửa Nam" })).toBe(true);
    expect(activationAddressComplete({ province: "Hà Nội" })).toBe(false);
  });

  it("khách nước ngoài (country != VN) → true dù thiếu Tỉnh/Phường", () => {
    expect(activationAddressComplete({ country: "US", province: "", ward: "" })).toBe(true);
    expect(activationAddressComplete({ country: "JP" })).toBe(true);
  });

  it("khách OV dùng SĐT Việt (country=VN + Tỉnh giữ tên quốc gia) → true", () => {
    // Regression 04/8: khách nước ngoài số Việt bị coi nhầm là khách VN → chặn kích hoạt.
    expect(activationAddressComplete({ country: "VN", province: "Japan", ward: "" })).toBe(true);
    expect(activationAddressComplete({ country: "VN", province: "United States", ward: "" })).toBe(true);
  });
});
