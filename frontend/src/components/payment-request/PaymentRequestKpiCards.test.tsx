import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PaymentRequestKpiCards, { computePrKpi } from "./PaymentRequestKpiCards";
import type { PaymentRequest } from "../../types/paymentRequest";

function pr(over: Partial<PaymentRequest>): PaymentRequest {
  return {
    id: over.id || "PR-1",
    name: "Khach",
    uid: "U1",
    phone: "",
    country: "VN",
    address: "",
    target: over.target ?? 1_000_000,
    source: "",
    createdAt: "2026-09-01T00:00:00Z",
    received: over.received ?? 0,
    doneCount: 0,
    totalCount: 0,
    delta: 0,
    state: over.state ?? "pending",
    payments: [],
    ...over,
  };
}

describe("computePrKpi — mirror pr_list_summary.kpi (M3-T4)", () => {
  it("bỏ qua PR cancelled hoàn toàn", () => {
    const kpi = computePrKpi([pr({ state: "cancelled", target: 5_000_000, received: 5_000_000 })]);
    expect(kpi.total).toBe(0);
    expect(kpi.target).toBe(0);
  });

  it("short gộp cả pending lẫn short (mirror PaymentRequestKpiCards cũ)", () => {
    const kpi = computePrKpi([pr({ state: "pending" }), pr({ state: "short" }), pr({ state: "done" })]);
    expect(kpi.short).toBe(2);
    expect(kpi.done).toBe(1);
    expect(kpi.total).toBe(3);
  });

  it("received/target cộng dồn trên PR live", () => {
    const kpi = computePrKpi([
      pr({ target: 1_000_000, received: 500_000, state: "short" }),
      pr({ target: 2_000_000, received: 2_000_000, state: "done" }),
    ]);
    expect(kpi.received).toBe(2_500_000);
    expect(kpi.target).toBe(3_000_000);
  });
});

describe("PaymentRequestKpiCards — render", () => {
  it("load-all mode: tự tính kpi từ requests khi không truyền prop kpi", () => {
    render(
      <PaymentRequestKpiCards
        requests={[
          pr({ state: "done", target: 1_000_000, received: 1_000_000 }),
          pr({ state: "pending", target: 500_000, received: 0 }),
        ]}
      />
    );
    expect(screen.getByText("2")).toBeInTheDocument(); // total = 2 (unique, không trùng done/over/ready)
    expect(screen.getByText("1 đã đủ tiền · 1 đang thiếu")).toBeInTheDocument();
  });

  it("server mode: prop kpi override, KHÔNG tự tính lại từ requests (thường rỗng/1 trang)", () => {
    render(
      <PaymentRequestKpiCards
        requests={[]}
        kpi={{ total: 42, done: 10, over: 2, short: 30, received: 9_000_000, target: 12_000_000 }}
      />
    );
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("75% / dự kiến 12.000.000 đ")).toBeInTheDocument();
  });
});
