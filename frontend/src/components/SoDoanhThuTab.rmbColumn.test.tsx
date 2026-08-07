import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LEDGER_COLUMNS, type LedgerColumnDef } from "./SoDoanhThuTab";
import type { RevenueLedgerRow } from "../types/revenue";

function makeRow(overrides: Partial<RevenueLedgerRow> = {}): RevenueLedgerRow {
  return {
    id: "r1",
    ngayTienVe: "2026-07-01",
    payTime: "2026-07-01",
    tenKhach: "Nguyễn Văn A",
    sdt: "0912345678",
    uid: "37481212",
    goiHoc: "",
    soTienVnd: 12000000,
    gmvRmb: 3243,
    tyGiaVndRmb: 3700,
    saleCrmName: "Sale B",
    team: "Inhouse 1",
    teamPivotLabel: "IH1",
    loai: "",
    loai2: "",
    note: "",
    note2: "",
    paymentMethod: "",
    loaiNhap: "tay",
    donHangId: null,
    maDonHang: "DH-001",
    crmOrderId: "",
    infoCode: "PF ABC",
    ...overrides,
  };
}

function renderColumn(col: LedgerColumnDef, row: RevenueLedgerRow) {
  // renderTd returns a <td>; wrap so DOM nesting is valid.
  return render(
    <table>
      <tbody>
        <tr>{col.renderTd(row, {} as never)}</tr>
      </tbody>
    </table>,
  );
}

describe("Sổ doanh thu — cột Real Pay (RMB)", () => {
  const col = LEDGER_COLUMNS.find((c) => c.key === "realPayRmb")!;

  it("cột tồn tại, nhãn Real Pay (RMB), đứng ngay trước Real Pay (VND)", () => {
    expect(col).toBeDefined();
    expect(col.label).toBe("Real Pay (RMB)");
    const keys = LEDGER_COLUMNS.map((c) => c.key);
    expect(keys.indexOf("realPayRmb")).toBe(keys.indexOf("realPay") - 1);
  });

  it("quy đổi = VND ÷ tỷ giá per-row, 2 số lẻ, không ký hiệu ¥", () => {
    // 12.000.000 / 3700 = 3243,2432... → 3.243,24
    renderColumn(col, makeRow());
    expect(screen.getByText("3.243,24")).toBeInTheDocument();
  });

  it("dùng tỷ giá của chính dòng đó (đổi tỷ giá → đổi kết quả)", () => {
    // 12.000.000 / 3600 = 3333,33
    renderColumn(col, makeRow({ tyGiaVndRmb: 3600 }));
    expect(screen.getByText("3.333,33")).toBeInTheDocument();
  });

  it("tỷ giá 0 / thiếu → hiện — (không chia cho 0)", () => {
    renderColumn(col, makeRow({ tyGiaVndRmb: 0 }));
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
