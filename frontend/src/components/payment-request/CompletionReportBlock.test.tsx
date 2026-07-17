import { render, screen } from "@testing-library/react";
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
  // FEATURE_LOCKED = true → nút luôn disabled, banner "đang phát triển".
  // Khi unlock (set FEATURE_LOCKED = false), bỏ group này và khôi phục tests cũ từ git.

  it("renders locked banner with disabled button", () => {
    const pr = makePr();
    render(<CompletionReportBlock request={pr} onReportComplete={vi.fn()} />);
    const btn = screen.getByRole("button", { name: /Báo đơn hoàn thành/i });
    expect(btn).toBeDisabled();
    expect(screen.getByText(/đang được phát triển/i)).toBeInTheDocument();
  });

  it("disabled regardless of state=short", () => {
    const pr = makePr({ state: "short" });
    render(<CompletionReportBlock request={pr} onReportComplete={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Báo đơn hoàn thành/i })).toBeDisabled();
  });

  it("disabled regardless of state=done with all bills", () => {
    const pr = makePr({ state: "done" });
    render(<CompletionReportBlock request={pr} onReportComplete={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Báo đơn hoàn thành/i })).toBeDisabled();
  });

  it("disabled regardless of state=over", () => {
    const pr = makePr({ state: "over" });
    render(<CompletionReportBlock request={pr} onReportComplete={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Báo đơn hoàn thành/i })).toBeDisabled();
  });

  it("click disabled button does NOT call onReportComplete", () => {
    const onReportComplete = vi.fn();
    const pr = makePr();
    render(<CompletionReportBlock request={pr} onReportComplete={onReportComplete} />);
    screen.getByRole("button", { name: /Báo đơn hoàn thành/i }).click();
    expect(onReportComplete).not.toHaveBeenCalled();
  });

  it("does NOT render report history when locked", () => {
    const pr = makePr({
      completion_reports: [
        { id: "r1", seq: 1, reason: null, reported_by: "sale@pf.vn", total_net: 1_000_000, target: 1_000_000, created_at: "2026-07-01T03:00:00+00:00" },
      ],
    });
    render(<CompletionReportBlock request={pr} onReportComplete={vi.fn()} />);
    expect(screen.queryByText(/Lần #1/)).not.toBeInTheDocument();
  });

  it("does NOT render modal textarea when locked", () => {
    const pr = makePr({
      completion_reports: [
        { id: "r1", seq: 1, reason: null, reported_by: "sale@pf.vn", total_net: 1_000_000, target: 1_000_000, created_at: "2026-07-01T03:00:00+00:00" },
      ],
    });
    render(<CompletionReportBlock request={pr} onReportComplete={vi.fn()} />);
    screen.getByRole("button", { name: /Báo đơn hoàn thành/i }).click();
    expect(screen.queryByPlaceholderText(/Vì sao đơn đủ tiền/i)).not.toBeInTheDocument();
  });
});
