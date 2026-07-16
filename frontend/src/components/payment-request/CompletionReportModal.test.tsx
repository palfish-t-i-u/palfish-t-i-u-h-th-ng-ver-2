import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PaymentRequest } from "../../types/paymentRequest";
import CompletionReportModal from "./CompletionReportModal";

function makePr(overrides: Partial<PaymentRequest> = {}): PaymentRequest {
  return {
    id: "PR-2026-0900",
    name: "Nguyễn Văn A",
    childName: "Bé Bin",
    uid: "u1",
    phone: "0900000000",
    country: "VN",
    address: "",
    target: 1_000_000,
    source: "manual",
    createdAt: "2026-07-16T00:00:00+00:00",
    received: 1_500_000,
    doneCount: 2,
    totalCount: 2,
    delta: 500_000,
    state: "over",
    payments: [],
    completion_reports: [
      { id: "r1", seq: 1, reason: null, reported_by: "sale@pf.vn", total_net: 1_000_000, target: 1_000_000, created_at: "2026-07-01T03:12:00+00:00" },
    ],
    ...overrides,
  };
}

describe("CompletionReportModal", () => {
  it("nút xác nhận khoá khi textarea lý do trống", () => {
    render(<CompletionReportModal request={makePr()} onClose={vi.fn()} onConfirm={vi.fn()} />);
    const submitBtn = screen.getByRole("button", { name: /Xác nhận và báo đơn hoàn thành/i });
    expect(submitBtn).toBeDisabled();
  });

  it("nút xác nhận khoá khi lý do chỉ có khoảng trắng", () => {
    render(<CompletionReportModal request={makePr()} onClose={vi.fn()} onConfirm={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/Vì sao đơn đủ tiền/i), { target: { value: "   " } });
    expect(screen.getByRole("button", { name: /Xác nhận và báo đơn hoàn thành/i })).toBeDisabled();
  });

  it("mở khoá nút xác nhận khi có lý do, preview cập nhật theo textarea (Lần #2 + Lý do)", () => {
    render(<CompletionReportModal request={makePr()} onClose={vi.fn()} onConfirm={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/Vì sao đơn đủ tiền/i), {
      target: { value: "Khách mua thêm gói cho con" },
    });
    expect(screen.getByRole("button", { name: /Xác nhận và báo đơn hoàn thành/i })).not.toBeDisabled();
    // Preview live theo spec: "- Lần #2" + dòng "Lý do: ..."
    expect(screen.getByText(/- Lần #2/)).toBeInTheDocument();
    expect(screen.getByText(/Lý do: Khách mua thêm gói cho con/)).toBeInTheDocument();
  });

  it("banner cảnh báo hiện đúng lần báo trước + copy chính xác đã chốt", () => {
    render(<CompletionReportModal request={makePr()} onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(
      screen.getByText(/Đơn này đã báo hoàn thành ở lần #1 \(01\/07 · 1\.000\.000 đ\)\. Nhập lý do báo lại để kế toán theo dõi\./)
    ).toBeInTheDocument();
  });

  it("submit gọi onConfirm với lý do đã trim", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(<CompletionReportModal request={makePr()} onClose={vi.fn()} onConfirm={onConfirm} />);
    fireEvent.change(screen.getByPlaceholderText(/Vì sao đơn đủ tiền/i), {
      target: { value: "  Khách đóng nốt phần bổ sung  " },
    });
    fireEvent.click(screen.getByRole("button", { name: /Xác nhận và báo đơn hoàn thành/i }));
    expect(onConfirm).toHaveBeenCalledWith("Khách đóng nốt phần bổ sung");
  });

  it("title dùng đúng số lần báo tiếp theo", () => {
    render(<CompletionReportModal request={makePr()} onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByText("Báo đơn hoàn thành — lần #2")).toBeInTheDocument();
  });
});
