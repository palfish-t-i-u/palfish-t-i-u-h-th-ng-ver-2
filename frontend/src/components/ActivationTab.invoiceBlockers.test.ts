import { describe, it, expect } from "vitest";
import { getInvoiceBlockers } from "./ActivationTab";
import type { ActiveCourse } from "../types/paymentRequest";

/** Gói học đủ điều kiện (tên gói + tiền + Order ID). */
const fullCourse: ActiveCourse = {
  courseCode: "CC-0078-001",
  packageName: "2/W- NEW 24 buoi",
  amount: 4_550_000,
  orderId: "752820050659",
  invoiced: false,
};

/** PR khách KHÔNG lấy HĐ — không cần bất kỳ thông tin khách nào (chuẩn 26/8). */
const nonTakerPr = { province: "", ward: "", address: "" };

/** PR khách VN LẤY HĐ, đủ chuẩn 26/8: họ tên + CCCD + email + Tỉnh + Phường/Xã
 * (số nhà KHÔNG bắt buộc — để trống chủ đích). */
const takerPr = {
  wantsInvoice: true,
  invoiceCustomerName: "Nguyễn Thị Hằng",
  taxId: "001204012345",
  email: "hang@example.com",
  province: "Thành phố Hà Nội",
  ward: "Phường Hoàng Mai",
  address: "",
};

function keys(course: ActiveCourse, pr: Parameters<typeof getInvoiceBlockers>[1]) {
  return getInvoiceBlockers(course, pr).map((b) => b.key);
}

/** Chỉ các blocker CỨNG (chặn xuất HĐ). Nhắc mềm (soft) không tính. */
function blocking(course: ActiveCourse, pr: Parameters<typeof getInvoiceBlockers>[1]) {
  return getInvoiceBlockers(course, pr).filter((b) => !b.soft).map((b) => b.key);
}

describe("getInvoiceBlockers — khách KHÔNG lấy HĐ (wants_invoice falsy)", () => {
  it("không cần thông tin khách nào — kể cả địa chỉ trống hoàn toàn", () => {
    expect(getInvoiceBlockers(fullCourse, nonTakerPr)).toEqual([]);
    expect(getInvoiceBlockers(fullCourse, null)).toEqual([]);
    expect(getInvoiceBlockers(fullCourse, { ...nonTakerPr, wantsInvoice: false })).toEqual([]);
  });

  it("thiếu Order ID → nhắc MỀM, KHÔNG chặn xuất HĐ (2 luồng tách biệt)", () => {
    const b = getInvoiceBlockers({ ...fullCourse, orderId: "" }, nonTakerPr);
    expect(b.map((x) => x.key)).toContain("order");
    expect(b.find((x) => x.key === "order")?.soft).toBe(true);
    expect(b.find((x) => x.key === "order")?.text).toContain("vẫn xuất được hoá đơn");
    expect(blocking({ ...fullCourse, orderId: "" }, nonTakerPr)).toEqual([]);
    expect(blocking({ ...fullCourse, orderId: "   " }, nonTakerPr)).toEqual([]);
  });

  it("tên gói / số tiền vẫn bắt buộc (dữ liệu dòng hóa đơn)", () => {
    expect(keys({ ...fullCourse, packageName: "" }, nonTakerPr)).toContain("package");
    expect(keys({ ...fullCourse, amount: 0 }, nonTakerPr)).toContain("amount");
  });
});

describe("getInvoiceBlockers — khách VN lấy HĐ (chuẩn Sương Mai 26/8)", () => {
  it("đủ họ tên + CCCD + email + Tỉnh + Phường/Xã → không blocker (số nhà không bắt buộc)", () => {
    expect(getInvoiceBlockers(fullCourse, takerPr)).toEqual([]);
  });

  it("thiếu Phường/Xã hoặc Tỉnh → blocker 'address'; thiếu số nhà thì KHÔNG", () => {
    expect(keys(fullCourse, { ...takerPr, ward: "" })).toContain("address");
    expect(keys(fullCourse, { ...takerPr, province: "" })).toContain("address");
    expect(keys(fullCourse, { ...takerPr, address: "" })).not.toContain("address");
  });

  it("thiếu họ tên đầy đủ / CCCD / email → blocker tương ứng", () => {
    expect(keys(fullCourse, { ...takerPr, invoiceCustomerName: "" })).toContain("invoiceName");
    expect(keys(fullCourse, { ...takerPr, taxId: "" })).toContain("taxCode");
    expect(keys(fullCourse, { ...takerPr, email: "" })).toContain("email");
  });

  it("giá trị per-course (kế toán điền ở form Xuất HĐ) bù cho PR thiếu", () => {
    const courseFilled: ActiveCourse = {
      ...fullCourse,
      name: "Nguyễn Thị Hằng",
      taxCode: "001204012345",
      email: "hang@example.com",
    };
    const prMissingInfo = { ...takerPr, invoiceCustomerName: "", taxId: "", email: "" };
    expect(keys(courseFilled, prMissingInfo)).toEqual([]);
  });

  it("địa chỉ trên course (AR kế toán tạo tay) bù cho PR thiếu", () => {
    const courseWithAddr: ActiveCourse = {
      ...fullCourse,
      province: "Thành phố Hà Nội",
      ward: "Phường Hoàng Mai",
    };
    expect(keys(courseWithAddr, { ...takerPr, province: "", ward: "" })).not.toContain("address");
  });

  it("blocker địa chỉ liệt kê đúng phần thiếu — không còn đòi số nhà", () => {
    const text = getInvoiceBlockers(fullCourse, { ...takerPr, ward: "" })
      .find((b) => b.key === "address")?.text;
    expect(text).toContain("Phường/Xã");
    expect(text).not.toContain("Số nhà, đường");
    expect(text).not.toContain("Tỉnh/Thành");
  });
});

describe("getInvoiceBlockers — khách OV lấy HĐ", () => {
  const ovTakerPr = {
    wantsInvoice: true,
    invoiceCustomerName: "Nguyen Kim Bich",
    taxId: "C1234567",
    email: "bich@example.com",
    province: "Czechia",
    ward: "",
    address: "",
    country: "CZ",
  };

  it("đủ họ tên + hộ chiếu + email + tên nước → không blocker", () => {
    expect(getInvoiceBlockers(fullCourse, ovTakerPr)).toEqual([]);
  });

  it("OV nhận diện qua country code dù province trống (learning dial-not-province)", () => {
    expect(keys(fullCourse, { ...ovTakerPr, province: "" })).not.toContain("address");
  });

  it("OV vẫn bắt họ tên + hộ chiếu + email như khách VN", () => {
    expect(keys(fullCourse, { ...ovTakerPr, taxId: "" })).toContain("taxCode");
    expect(keys(fullCourse, { ...ovTakerPr, invoiceCustomerName: "" })).toContain("invoiceName");
    expect(keys(fullCourse, { ...ovTakerPr, email: "" })).toContain("email");
  });

  it("OV KHÔNG lấy HĐ → không blocker gì", () => {
    expect(getInvoiceBlockers(fullCourse, { province: "Japan", ward: "", address: "" })).toEqual([]);
  });
});

describe("getInvoiceBlockers — doanh nghiệp ('vẫn thế' — không blocker cá nhân mới)", () => {
  it("business taker: không đòi họ tên/CCCD/email; vẫn cần địa chỉ Tỉnh + Xã", () => {
    const bizPr = {
      wantsInvoice: true,
      customerType: "business",
      invoiceCustomerName: "",
      taxId: "",
      email: "",
      province: "Thành phố Hà Nội",
      ward: "Phường Hoàng Mai",
      address: "",
    };
    expect(getInvoiceBlockers(fullCourse, bizPr)).toEqual([]);
    expect(keys(fullCourse, { ...bizPr, ward: "" })).toContain("address");
  });
});
