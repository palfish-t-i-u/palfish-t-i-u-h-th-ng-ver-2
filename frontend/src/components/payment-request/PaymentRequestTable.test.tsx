import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PaymentRequest } from "../../types/paymentRequest";
import PaymentRequestTable from "./PaymentRequestTable";

function makePr(i: number): PaymentRequest {
  return {
    id: `PR-2026-${String(i).padStart(4, "0")}`,
    name: `Khách ${i}`,
    uid: `10000${i}`,
    phone: "0912345678",
    country: "VN",
    address: "1 Phố Huế",
    ward: "Hai Bà Trưng",
    province: "Hà Nội",
    target: 1_000_000,
    source: "manual",
    createdAt: "2026-06-10T08:30:00+07:00",
    received: 0,
    doneCount: 0,
    totalCount: 1,
    delta: -1_000_000,
    state: "pending",
    payments: [],
  };
}

const tabs = [
  { key: "tracking" as const, label: "Đang theo dõi", icon: "Wallet" as const, count: 45 },
  { key: "created" as const, label: "Gói học đã tạo", icon: "Sparkle" as const, count: 0 },
  { key: "cancelled" as const, label: "Đã huỷ", icon: "XCircle" as const, count: 0 },
];

function renderTable(over: Partial<Parameters<typeof PaymentRequestTable>[0]> = {}) {
  const onPageChange = vi.fn();
  render(
    <PaymentRequestTable
      requests={Array.from({ length: 5 }, (_, i) => makePr(41 + i))}
      total={45}
      page={3}
      totalPages={3}
      pageSize={20}
      selectedId={null}
      tab="tracking"
      onTabChange={() => {}}
      tabs={tabs}
      onSelect={() => {}}
      onCancelClick={() => {}}
      onRestoreClick={() => {}}
      arByPrId={{}}
      onPageChange={onPageChange}
      {...over}
    />
  );
  return { onPageChange };
}

describe("PaymentRequestTable pagination", () => {
  it("footer hiển thị dải dòng thật theo trang", () => {
    renderTable();
    expect(screen.getByText("Hiển thị 41–45 trong 45 kết quả")).toBeInTheDocument();
  });

  it("đếm tổng kết quả sau lọc ở góc phải đầu bảng", () => {
    renderTable();
    expect(screen.getByText("45 kết quả")).toBeInTheDocument();
  });

  it("bấm số trang gọi onPageChange", () => {
    const { onPageChange } = renderTable();
    fireEvent.click(screen.getByRole("button", { name: "2" }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it("nút trang hiện tại có class active", () => {
    renderTable();
    expect(screen.getByRole("button", { name: "3" }).className).toContain("active");
  });

  it("trang cuối: nút sau disabled, nút trước lùi 1 trang", () => {
    const { onPageChange } = renderTable();
    expect(screen.getByRole("button", { name: "Trang sau" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Trang trước" }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it("trang 1: nút trước disabled", () => {
    renderTable({ requests: Array.from({ length: 20 }, (_, i) => makePr(i + 1)), page: 1 });
    expect(screen.getByRole("button", { name: "Trang trước" })).toBeDisabled();
  });

  it("không có kết quả: footer gọn + empty state", () => {
    renderTable({ requests: [], total: 0, page: 1, totalPages: 1 });
    expect(screen.getByText("Không có kết quả")).toBeInTheDocument();
    expect(
      screen.getByText("Không có Payment Request nào khớp với điều kiện lọc.")
    ).toBeInTheDocument();
  });
});
