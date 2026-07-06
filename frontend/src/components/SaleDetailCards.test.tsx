import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import SaleDetailCards from "./SaleDetailCards";
import type { SaleDetailRow } from "../lib/saleDetailColumns";

function makeSale(overrides: Partial<SaleDetailRow> = {}): SaleDetailRow {
  return {
    sale_name: "Trần Thị C",
    department: "Inhouse 1",
    ad_leads: 10,
    ad_leads_manual: 2,
    referral_leads: 3,
    total_leads: 15,
    gd_leads: 1,
    invitation_number: 8,
    scheduled_classes: 7,
    preview_rate: 0.5,
    completed_classes: 6,
    completion_rate: 0.85,
    orders: 4,
    total_amount: 74000,
    collected: 3,
    gmv_rmb: 20000,
    total_call_time: 120.5,
    total_dials: 90,
    total_connections: 45,
    connection_rate: 0.5,
    over_3min_connections: 20,
    over_3min_rate: 0.22,
    ...overrides,
  } as SaleDetailRow;
}

describe("SaleDetailCards", () => {
  it("render tên sale, GMV RMB và chỉ số then chốt mặc định", () => {
    render(<SaleDetailCards rows={[makeSale()]} />);
    expect(screen.getByText("Trần Thị C")).toBeInTheDocument();
    expect(screen.getByText(/20\.000 RMB/)).toBeInTheDocument();
    expect(screen.getByText("Tổng Leads")).toBeInTheDocument();
    expect(screen.getByText("Số đơn chốt")).toBeInTheDocument();
    // chỉ số ngoài nhóm then chốt chưa hiện
    expect(screen.queryByText("Tổng cuộc gọi")).toBeNull();
  });

  it("bấm Xem đủ chỉ số hiện toàn bộ, bấm Thu gọn ẩn lại", () => {
    render(<SaleDetailCards rows={[makeSale()]} />);
    fireEvent.click(screen.getByRole("button", { name: /Xem đủ/ }));
    expect(screen.getByText("Tổng cuộc gọi")).toBeInTheDocument();
    expect(screen.getByText("Lead chạy Ads")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Thu gọn" }));
    expect(screen.queryByText("Tổng cuộc gọi")).toBeNull();
  });

  it("rows rỗng hiện empty state", () => {
    render(<SaleDetailCards rows={[]} />);
    expect(screen.getByText(/Chưa có data/)).toBeInTheDocument();
  });
});
