import { describe, it, expect } from "vitest";
import { getInvoiceBlockers } from "./ActivationTab";
import type { ActiveCourse } from "../types/paymentRequest";

/** Gói học đủ điều kiện + PR đủ địa chỉ → không còn blocker. */
const fullCourse: ActiveCourse = {
  courseCode: "CC-0078-001",
  packageName: "2/W- NEW 24 buoi",
  amount: 4_550_000,
  orderId: "752820050659",
  invoiced: false,
};
const fullPr = { province: "Thành phố Hà Nội", ward: "Phường Hoàng Mai", address: "119 Phúc Xá" };

function keys(course: ActiveCourse, pr: Parameters<typeof getInvoiceBlockers>[1]) {
  return getInvoiceBlockers(course, pr).map((b) => b.key);
}

/** Chỉ các blocker CỨNG (chặn xuất HĐ). Nhắc mềm (soft) không tính. */
function blocking(course: ActiveCourse, pr: Parameters<typeof getInvoiceBlockers>[1]) {
  return getInvoiceBlockers(course, pr).filter((b) => !b.soft).map((b) => b.key);
}

describe("getInvoiceBlockers", () => {
  it("đủ điều kiện → không có blocker", () => {
    expect(getInvoiceBlockers(fullCourse, fullPr)).toEqual([]);
  });

  it("thiếu Order ID → nhắc MỀM, KHÔNG chặn xuất HĐ (2 luồng tách biệt)", () => {
    // Vẫn hiện nhắc 'order' để kế toán không quên kích hoạt CRM...
    const b = getInvoiceBlockers({ ...fullCourse, orderId: "" }, fullPr);
    expect(b.map((x) => x.key)).toContain("order");
    expect(b.find((x) => x.key === "order")?.soft).toBe(true);
    expect(b.find((x) => x.key === "order")?.text).toContain("vẫn xuất được hoá đơn");
    // ...nhưng không phải blocker cứng → xuất được HĐ bình thường.
    expect(blocking({ ...fullCourse, orderId: "" }, fullPr)).toEqual([]);
    expect(blocking({ ...fullCourse, orderId: "   " }, fullPr)).toEqual([]);
  });

  it("thiếu tên gói / số tiền → blocker tương ứng", () => {
    expect(keys({ ...fullCourse, packageName: "" }, fullPr)).toContain("package");
    expect(keys({ ...fullCourse, amount: 0 }, fullPr)).toContain("amount");
  });

  it("PR thiếu bất kỳ phần địa chỉ nào (cần đủ 3) → blocker 'address'", () => {
    expect(keys(fullCourse, { province: "Hà Nội", ward: "", address: "119 Phúc Xá" })).toContain("address");
    expect(keys(fullCourse, { province: "", ward: "Phường X", address: "119" })).toContain("address");
    expect(keys(fullCourse, { province: "Hà Nội", ward: "Phường X", address: "" })).toContain("address");
    expect(keys(fullCourse, null)).toContain("address");
  });

  it("địa chỉ trên course (AR kế toán tạo tay) bù cho PR thiếu", () => {
    const courseWithAddr: ActiveCourse = {
      ...fullCourse,
      province: "Thành phố Hà Nội",
      ward: "Phường Hoàng Mai",
      address: "119 Phúc Xá",
    };
    expect(keys(courseWithAddr, null)).not.toContain("address");
  });

  it("khách OV (province = quốc gia nước ngoài) → chỉ cần quốc gia, không bắt phường/số nhà", () => {
    expect(keys(fullCourse, { province: "United States", ward: "", address: "" })).not.toContain("address");
    expect(keys(fullCourse, { province: "Japan", ward: "", address: "" })).not.toContain("address");
    // OV thiếu Order ID → chỉ nhắc mềm 'order', không có blocker cứng → vẫn xuất được.
    expect(blocking({ ...fullCourse, orderId: "" }, { province: "Japan", ward: "", address: "" })).toEqual([]);
  });

  it("nội dung blocker địa chỉ liệt kê đúng phần còn thiếu", () => {
    const text = getInvoiceBlockers(fullCourse, { province: "Hà Nội", ward: "", address: "" })
      .find((b) => b.key === "address")?.text;
    expect(text).toContain("Phường/Xã");
    expect(text).toContain("Số nhà, đường");
    expect(text).not.toContain("Tỉnh/Thành");
  });
});
