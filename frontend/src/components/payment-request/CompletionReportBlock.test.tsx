import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PaymentAttempt, PaymentRequest } from "../../types/paymentRequest";
import CompletionReportBlock from "./CompletionReportBlock";

function makeLine(overrides: Partial<PaymentAttempt> = {}): PaymentAttempt {
  return {
    id: "line-1",
    idx: 1,
    amount: 1_000_000,
    status: "paid",
    createdAt: "2026-07-16T02:00:00+00:00",
    code: "ABCDE",
    bill: true,
    billImage: "https://x/bill.jpg",
    method: "qr",
    ...overrides,
  };
}

function makePr(overrides: Partial<PaymentRequest> = {}): PaymentRequest {
  return {
    id: "PR-2026-0900",
    name: "Nguyễn Văn A",
    uid: "u1",
    phone: "0900000000",
    country: "VN",
    address: "",
    target: 1_000_000,
    source: "manual",
    createdAt: "2026-07-16T00:00:00+00:00",
    received: 1_000_000,
    doneCount: 1,
    totalCount: 1,
    delta: 0,
    state: "done",
    payments: [makeLine()],
    completion_reports: [],
    ...overrides,
  };
}

describe("CompletionReportBlock", () => {
  it("disabled + hint khi PR chưa đủ tiền (state=short)", () => {
    const pr = makePr({ state: "short", payments: [makeLine({ status: "pending", bill: false, billImage: null })] });
    render(<CompletionReportBlock request={pr} onReportComplete={vi.fn()} />);
    const btn = screen.getByRole("button", { name: /Báo đơn hoàn thành/i });
    expect(btn).toBeDisabled();
    expect(screen.getByText(/Cần thu đủ 100% số tiền/i)).toBeInTheDocument();
  });

  it("disabled + hint khi đủ tiền nhưng còn lần TT thiếu bill", () => {
    const pr = makePr({
      payments: [makeLine(), makeLine({ id: "line-2", billImage: null, bill: false, billImages: [] })],
    });
    render(<CompletionReportBlock request={pr} onReportComplete={vi.fn()} />);
    const btn = screen.getByRole("button", { name: /Báo đơn hoàn thành/i });
    expect(btn).toBeDisabled();
    expect(screen.getByText(/thiếu ảnh bill/i)).toBeInTheDocument();
  });

  it("enabled khi state=done và mọi lần đã trả đều có bill", () => {
    const pr = makePr();
    render(<CompletionReportBlock request={pr} onReportComplete={vi.fn()} />);
    const btn = screen.getByRole("button", { name: /Báo đơn hoàn thành/i });
    expect(btn).not.toBeDisabled();
  });

  it("enabled khi state=over (thừa tiền)", () => {
    const pr = makePr({ state: "over" });
    render(<CompletionReportBlock request={pr} onReportComplete={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Báo đơn hoàn thành/i })).not.toBeDisabled();
  });

  it("render lịch sử các lần đã báo, gồm nhãn backfill", () => {
    const pr = makePr({
      completion_reports: [
        { id: "r1", seq: 1, reason: null, reported_by: "system-backfill", total_net: 1_000_000, target: 1_000_000, created_at: "2026-07-01T03:00:00+00:00" },
        { id: "r2", seq: 2, reason: "Khách mua thêm gói", reported_by: "sale@pf.vn", total_net: 1_500_000, target: 1_000_000, created_at: "2026-07-16T03:00:00+00:00" },
      ],
    });
    render(<CompletionReportBlock request={pr} onReportComplete={vi.fn()} />);
    expect(screen.getByText(/Lần #1/)).toBeInTheDocument();
    expect(screen.getByText(/hệ thống \(backfill\)/)).toBeInTheDocument();
    expect(screen.getByText(/Lần #2/)).toBeInTheDocument();
    expect(screen.getByText(/sale@pf\.vn/)).toBeInTheDocument();
    expect(screen.getByText("Đã báo 2 lần")).toBeInTheDocument();
  });

  it("click lần 1 (chưa có report nào) gọi onReportComplete thẳng, KHÔNG mở modal", async () => {
    const onReportComplete = vi.fn().mockResolvedValue(undefined);
    const pr = makePr({ completion_reports: [] });
    render(<CompletionReportBlock request={pr} onReportComplete={onReportComplete} />);
    fireEvent.click(screen.getByRole("button", { name: /Báo đơn hoàn thành/i }));
    expect(onReportComplete).toHaveBeenCalledWith();
    // Modal chỉ xuất hiện khi đã có ≥1 report — không có textarea lý do ở đây
    expect(screen.queryByPlaceholderText(/Vì sao đơn đủ tiền/i)).not.toBeInTheDocument();
  });

  it("click khi đã có ≥1 report mở modal soft-block, KHÔNG gọi onReportComplete ngay", () => {
    const onReportComplete = vi.fn();
    const pr = makePr({
      completion_reports: [
        { id: "r1", seq: 1, reason: null, reported_by: "sale@pf.vn", total_net: 1_000_000, target: 1_000_000, created_at: "2026-07-01T03:00:00+00:00" },
      ],
    });
    render(<CompletionReportBlock request={pr} onReportComplete={onReportComplete} />);
    fireEvent.click(screen.getByRole("button", { name: /Báo đơn hoàn thành/i }));
    expect(onReportComplete).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText(/Vì sao đơn đủ tiền/i)).toBeInTheDocument();
  });
});
