import { fireEvent, render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "../test/msw/server";
import PaymentRequestsTab from "./PaymentRequestsTab";
import type { PaymentAttempt, PaymentRequest } from "../types/paymentRequest";

// AR button gating (Task 6, 16/7) — "Kích hoạt khoá học" chỉ mở khi đã báo đơn
// hoàn thành (completion_reports.length > 0), ngay cả khi PR đã đủ tiền + có bill.

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
    name: "Nguyễn Hoàn Thành Test",
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

const makeFlow = (requests: PaymentRequest[]) => ({
  requests,
  activeRequests: [],
  loading: false,
  apiNote: "",
  loadData: vi.fn(),
  updateRequest: vi.fn(),
  updateActiveRequest: vi.fn(),
  setEditingArId: vi.fn(),
  handleCreate: vi.fn(),
  handleAddPayment: vi.fn(),
  handleCreateActiveRequest: vi.fn(),
  saveActiveRequest: vi.fn(),
  deleteActiveRequest: vi.fn(),
  reportComplete: vi.fn(),
  nav: {},
  setNav: vi.fn(),
});
let mockFlow = makeFlow([makePr()]);

vi.mock("../contexts/PaymentFlowContext", () => ({
  usePaymentFlow: () => mockFlow,
}));
vi.mock("../hooks/useMe", () => ({
  useMe: () => ({ profile: { role: "sale", email: "sale@pf.vn", name: "Sale Test" } }),
}));
vi.mock("../hooks/usePermission", () => ({
  usePermission: () => ({ readOnly: false, level: "full", loading: false, canView: true }),
}));
vi.mock("../lib/supabase", () => ({
  supabase: {
    channel: () => ({ on: function () { return this; }, subscribe: () => {} }),
    removeChannel: () => {},
    auth: { getSession: () => Promise.resolve({ data: { session: null } }) },
  },
}));

function renderTabWithPr(pr: PaymentRequest) {
  mockFlow = makeFlow([pr]);
  server.use(
    http.get("*", () => HttpResponse.json({})),
    http.post("*", () => HttpResponse.json({}))
  );
  render(<PaymentRequestsTab />);
  fireEvent.click(screen.getByText(pr.name));
}

describe("AR button gating — completion_reports", () => {
  beforeEach(() => {
    mockFlow = makeFlow([makePr()]);
  });

  it("PR đủ tiền + có bill nhưng CHƯA báo đơn hoàn thành → nút Kích hoạt disabled + hint đúng", () => {
    renderTabWithPr(makePr({ completion_reports: [] }));
    const btn = screen.getByRole("button", { name: /Kích hoạt khoá học/i });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("title", "Cần báo đơn hoàn thành trước");
  });

  it("PR đã báo đơn hoàn thành (completion_reports ≥ 1) → nút Kích hoạt hết disabled", () => {
    renderTabWithPr(
      makePr({
        completion_reports: [
          { id: "r1", seq: 1, reason: null, reported_by: "sale@pf.vn", total_net: 1_000_000, target: 1_000_000, created_at: "2026-07-16T02:30:00+00:00" },
        ],
      })
    );
    const btn = screen.getByRole("button", { name: /Kích hoạt khoá học/i });
    expect(btn).not.toBeDisabled();
  });

  it("PR chưa đủ tiền vẫn disabled với hint thu tiền trước, bất kể completion_reports", () => {
    renderTabWithPr(
      makePr({
        state: "short",
        received: 500_000,
        payments: [makeLine({ amount: 500_000 })],
        completion_reports: [
          { id: "r1", seq: 1, reason: null, reported_by: "sale@pf.vn", total_net: 500_000, target: 1_000_000, created_at: "2026-07-16T02:30:00+00:00" },
        ],
      })
    );
    const btn = screen.getByRole("button", { name: /Kích hoạt khoá học/i });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("title", "Cần thu đủ 100% số tiền trước khi kích hoạt");
  });
});
