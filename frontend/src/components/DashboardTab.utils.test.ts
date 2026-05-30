import { describe, expect, it } from "vitest";
import type { RevenueLedgerRow } from "../types/revenue";
import {
  buildDashboardSalesData,
  formatVndCompact,
  getInitials,
  monthDateRange,
} from "./DashboardTab.utils";

function row(partial: Partial<RevenueLedgerRow>): RevenueLedgerRow {
  return {
    id: partial.id ?? crypto.randomUUID(),
    ngayTienVe: partial.ngayTienVe ?? "2026-05-30",
    payTime: partial.payTime,
    tenKhach: partial.tenKhach ?? "",
    sdt: partial.sdt ?? "",
    uid: partial.uid ?? "",
    goiHoc: partial.goiHoc ?? "",
    soTienVnd: partial.soTienVnd ?? 0,
    gmvRmb: partial.gmvRmb ?? 0,
    tyGiaVndRmb: partial.tyGiaVndRmb ?? 3700,
    paymentMethod: partial.paymentMethod ?? "",
    loai: partial.loai ?? "",
    loai2: partial.loai2 ?? "",
    saleCrmName: partial.saleCrmName ?? "",
    team: partial.team ?? "",
    teamPivotLabel: partial.teamPivotLabel ?? "",
    note: partial.note ?? "",
    note2: partial.note2 ?? "",
    loaiNhap: partial.loaiNhap ?? "tu_dong",
    donHangId: partial.donHangId ?? null,
    maDonHang: partial.maDonHang ?? "",
    crmOrderId: partial.crmOrderId ?? "",
    infoCode: partial.infoCode ?? "",
  };
}

describe("DashboardTab utilities", () => {
  it("aggregates today winner and monthly ranking from ledger rows", () => {
    const data = buildDashboardSalesData(
      [
        row({ id: "1", ngayTienVe: "2026-05-30", saleCrmName: "Trần Mỹ Linh", team: "Cá Gánh Team", soTienVnd: 86_000_000 }),
        row({ id: "2", ngayTienVe: "2026-05-30", saleCrmName: "Trần Mỹ Linh", team: "Cá Gánh Team", soTienVnd: 14_000_000 }),
        row({ id: "3", ngayTienVe: "2026-05-30", saleCrmName: "Phạm Quốc Anh", team: "Cá Chăm Chỉ", soTienVnd: 72_500_000 }),
        row({ id: "4", ngayTienVe: "2026-05-02", saleCrmName: "Đặng Hoàng Sơn", team: "Cá Thủ Lĩnh", soTienVnd: 1_200_000_000 }),
      ],
      "2026-05-30"
    );

    expect(data.today[0]).toMatchObject({
      sale_crm_name: "Trần Mỹ Linh",
      team: "Cá Gánh Team",
      gmv_vnd: 100_000_000,
      order_count: 2,
    });
    expect(data.month[0]).toMatchObject({
      sale_crm_name: "Đặng Hoàng Sơn",
      gmv_vnd: 1_200_000_000,
      rank: 1,
    });
  });

  it("keeps empty sale names out of ranking", () => {
    const data = buildDashboardSalesData(
      [row({ saleCrmName: "", soTienVnd: 99_000_000 }), row({ saleCrmName: "Mai Quỳnh Như", soTienVnd: 10_000_000 })],
      "2026-05-30"
    );

    expect(data.today).toHaveLength(1);
    expect(data.today[0].sale_crm_name).toBe("Mai Quỳnh Như");
  });

  it("formats compact VND labels and initials for dashboard display", () => {
    expect(formatVndCompact(1_200_000_000)).toBe("1,2 tỷ");
    expect(formatVndCompact(86_000_000)).toBe("86 tr");
    expect(getInitials("Trần Mỹ Linh")).toBe("LM");
    expect(monthDateRange(new Date("2026-05-30T00:00:00+07:00"))).toEqual({
      from: "2026-05-01",
      to: "2026-05-30",
    });
  });
});
