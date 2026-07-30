import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import LedgerRowCards from "./LedgerRowCards";
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

const noop = () => {};
const baseProps = {
  readOnly: false,
  deletingId: null,
  onEdit: noop,
  onDelete: noop,
  hasMore: false,
  loadingMore: false,
  onLoadMore: noop,
  emptyText: "Chưa có dòng",
};

describe("LedgerRowCards", () => {
  it("render tên khách, số tiền, Pay Time dd/mm/yyyy, sales, order id", () => {
    render(<LedgerRowCards {...baseProps} rows={[makeRow()]} />);
    expect(screen.getByText("Nguyễn Văn A")).toBeInTheDocument();
    expect(screen.getByText(/12\.000\.000/)).toBeInTheDocument();
    expect(screen.getByText("01/07/2026")).toBeInTheDocument();
    expect(screen.getByText("Sale B")).toBeInTheDocument();
    expect(screen.getByText("DH-001")).toBeInTheDocument();
  });

  it("bấm Chỉnh sửa gọi onEdit; dòng tay có nút Xóa gọi onDelete", () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const row = makeRow();
    render(<LedgerRowCards {...baseProps} rows={[row]} onEdit={onEdit} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole("button", { name: "Chỉnh sửa" }));
    expect(onEdit).toHaveBeenCalledWith(row);
    fireEvent.click(screen.getByRole("button", { name: "Xóa" }));
    expect(onDelete).toHaveBeenCalledWith(row);
  });

  it("dòng tự động (Tự động) không có nút Xóa", () => {
    render(<LedgerRowCards {...baseProps} rows={[makeRow({ loaiNhap: "tu_dong" })]} />);
    expect(screen.getByText("Tự động")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Xóa" })).toBeNull();
  });

  it("readOnly ẩn toàn bộ nút thao tác", () => {
    render(<LedgerRowCards {...baseProps} rows={[makeRow()]} readOnly />);
    expect(screen.queryByRole("button", { name: "Chỉnh sửa" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Xóa" })).toBeNull();
  });

  it("hasMore hiện nút Tải thêm và gọi onLoadMore", () => {
    const onLoadMore = vi.fn();
    render(<LedgerRowCards {...baseProps} rows={[makeRow()]} hasMore onLoadMore={onLoadMore} />);
    fireEvent.click(screen.getByRole("button", { name: "Tải thêm" }));
    expect(onLoadMore).toHaveBeenCalled();
  });

  it("rows rỗng hiện emptyText", () => {
    render(<LedgerRowCards {...baseProps} rows={[]} emptyText="Chưa có dòng" />);
    expect(screen.getByText("Chưa có dòng")).toBeInTheDocument();
  });
});
