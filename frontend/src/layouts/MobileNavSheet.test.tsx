import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { NavItem } from "./AppShell";
import MobileNavSheet from "./MobileNavSheet";

const items: NavItem[] = [
  { id: "dashboard", label: "Bảng thông tin", icon: <span />, section: "Khách hàng & Đơn hàng" },
  { id: "paymentRequests", label: "Quản lý thanh toán", icon: <span /> },
  {
    id: "reconHub",
    label: "Đối soát giao dịch",
    icon: <span />,
    section: "Đối soát & Hóa đơn",
    children: [
      { id: "reconciliation", label: "Chuyển khoản" },
      { id: "reconCard", label: "Quẹt thẻ" },
    ],
  },
];

describe("MobileNavSheet", () => {
  it("open=false không render gì", () => {
    const { container } = render(
      <MobileNavSheet open={false} onClose={vi.fn()} items={items} activeId="dashboard" onSelect={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("liệt kê đủ module + tiêu đề section", () => {
    render(
      <MobileNavSheet open onClose={vi.fn()} items={items} activeId="dashboard" onSelect={vi.fn()} />
    );
    expect(screen.getByText("Bảng thông tin")).toBeInTheDocument();
    expect(screen.getByText("Quản lý thanh toán")).toBeInTheDocument();
    expect(screen.getByText("Đối soát giao dịch")).toBeInTheDocument();
    expect(screen.getByText("Đối soát & Hóa đơn")).toBeInTheDocument();
  });

  it("chọn module lá → gọi onSelect + đóng sheet", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <MobileNavSheet open onClose={onClose} items={items} activeId="dashboard" onSelect={onSelect} />
    );
    fireEvent.click(screen.getByText("Quản lý thanh toán"));
    expect(onSelect).toHaveBeenCalledWith("paymentRequests");
    expect(onClose).toHaveBeenCalled();
  });

  it("module có children → expand rồi chọn child", () => {
    const onSelect = vi.fn();
    render(
      <MobileNavSheet open onClose={vi.fn()} items={items} activeId="dashboard" onSelect={onSelect} />
    );
    fireEvent.click(screen.getByText("Đối soát giao dịch")); // expand, chưa select
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Chuyển khoản"));
    expect(onSelect).toHaveBeenCalledWith("reconciliation");
  });

  it("bấm overlay đóng sheet", () => {
    const onClose = vi.fn();
    render(
      <MobileNavSheet open onClose={onClose} items={items} activeId="dashboard" onSelect={vi.fn()} />
    );
    fireEvent.click(screen.getByRole("presentation"));
    expect(onClose).toHaveBeenCalled();
  });
});
