import { describe, expect, it } from "vitest";
import { buildRows } from "./payslipFormat";

describe("buildRows — mirror UI 6 block", () => {
  const phieu = {
    STT: 1,
    Name: "Phạm Anh Minh",
    Khối: "MARKETING",
    "Luong co ban": 6000000,
    Công: 24,
    "Thuong COM": "",
    "Khấu trừ thuế tháng 07": 600000,
    "Tong luong + thuong": 5400000,
  };

  it("nhóm đúng block, bỏ key rỗng, ẩn key ngoài mẫu", () => {
    const rows = buildRows(phieu);
    const labels = rows.map((r) => r.label);

    expect(rows[0]).toEqual({ label: "Lương cơ bản", value: "", isBlockHeader: true });
    expect(rows).toContainEqual({ label: "Lương cơ bản", value: "6.000.000" });
    expect(rows).toContainEqual({ label: "Tổng lương + thưởng", value: "5.400.000" });
    expect(rows).toContainEqual({ label: "Khấu trừ thuế tháng 07", value: "600.000" });
    expect(labels).not.toContain("Khối");
    expect(labels).not.toContain("Name");
    expect(labels).not.toContain("STT");
    expect(labels).not.toContain("Thưởng + COM");
    expect(rows).toContainEqual({ label: "Công", value: "24" });
  });
});
