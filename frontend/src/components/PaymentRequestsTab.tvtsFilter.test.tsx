import { fireEvent, render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "../test/msw/server";
import PaymentRequestsTab from "./PaymentRequestsTab";
import type { PaymentRequest } from "../types/paymentRequest";

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makePr(
  id: string,
  saleEmail: string,
  saleName: string,
  state: PaymentRequest["state"] = "pending"
): PaymentRequest {
  return {
    id,
    name: `Khách ${id}`,
    uid: id,
    phone: "0900000000",
    country: "VN",
    address: "",
    target: 0,
    source: "manual",
    createdAt: "2026-01-01T00:00:00Z",
    received: 0,
    doneCount: 0,
    totalCount: 1,
    delta: 0,
    state,
    payments: [],
    saleEmail,
    saleName,
  } as unknown as PaymentRequest;
}

// 3 PR Trinh, 2 PR Nhung, 1 PR không rõ (saleEmail rỗng)
const TRINH_PRS = [
  makePr("pr-1", "trinh@pf.vn", "Le Thi Thuy Trinh"),
  makePr("pr-2", "trinh@pf.vn", "Le Thi Thuy Trinh"),
  makePr("pr-3", "trinh@pf.vn", "Le Thi Thuy Trinh"),
];
const NHUNG_PRS = [
  makePr("pr-4", "nhung@pf.vn", "Le Thuy Nhung"),
  makePr("pr-5", "nhung@pf.vn", "Le Thuy Nhung"),
];
const UNKNOWN_PR = [makePr("pr-6", "", "")];
const ALL_PRS = [...TRINH_PRS, ...NHUNG_PRS, ...UNKNOWN_PR];

// ── Context mocks ─────────────────────────────────────────────────────────────

let mockRole = "leader";
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
  nav: {},
  setNav: vi.fn(),
});
let mockFlow = makeFlow(ALL_PRS);

vi.mock("../contexts/PaymentFlowContext", () => ({
  usePaymentFlow: () => mockFlow,
}));
vi.mock("../hooks/useMe", () => ({
  useMe: () => ({ profile: { role: mockRole, email: "test@pf.vn", name: "Test" } }),
}));
vi.mock("../hooks/usePermission", () => ({
  usePermission: () => ({ readOnly: false, level: "full", loading: false, canView: true }),
}));

// Supabase realtime (unused in tests, but sub-deps may import it)
vi.mock("../lib/supabase", () => ({
  supabase: {
    channel: () => ({ on: function () { return this; }, subscribe: () => {} }),
    removeChannel: () => {},
    auth: { getSession: () => Promise.resolve({ data: { session: null } }) },
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Render tab và chờ load xong (không loading spinner vì mock immediate) */
function renderTab() {
  // Intercept bất kỳ API call nào mà sub-component có thể phát ra
  server.use(
    http.get("*", () => HttpResponse.json([])),
    http.post("*", () => HttpResponse.json({}))
  );
  return render(<PaymentRequestsTab />);
}

/** Mở dropdown TVTS và trả về container wrapper */
function openTvtsPanel() {
  const btn = screen.getByRole("button", { name: /TVTS/i });
  fireEvent.click(btn);
  return btn;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("TVTS filter — role visibility", () => {
  beforeEach(() => {
    mockRole = "leader";
    mockFlow = makeFlow(ALL_PRS);
  });

  it("role sale → KHÔNG render nút TVTS", () => {
    mockRole = "sale";
    renderTab();
    expect(screen.queryByRole("button", { name: /TVTS/i })).toBeNull();
  });

  it("role leader → có nút TVTS", () => {
    renderTab();
    expect(screen.getByRole("button", { name: /TVTS/i })).toBeInTheDocument();
  });
});

describe("TVTS filter — filtering behavior (role leader)", () => {
  beforeEach(() => {
    mockRole = "leader";
    mockFlow = makeFlow(ALL_PRS);
  });

  it("chọn 1 TVTS → bảng chỉ còn PR của TVTS đó", () => {
    renderTab();
    openTvtsPanel();

    // Tick Trinh
    const trinhCheckbox = screen.getByRole("checkbox", {
      name: (_name, el) => el.closest("label")?.textContent?.includes("Le Thi Thuy Trinh") ?? false,
    });
    fireEvent.click(trinhCheckbox);

    // Đóng panel
    fireEvent.keyDown(document, { key: "Escape" });

    // Mọi ô TVTS visible phải là Trinh
    const tvtsCells = screen.getAllByTestId("pr-tvts-cell");
    expect(tvtsCells.length).toBeGreaterThan(0);
    tvtsCells.forEach((cell) => {
      expect(cell.textContent).toBe("Le Thi Thuy Trinh");
    });
  });

  it("chọn 1 TVTS → chip 'Tất cả' đếm lại đúng (chứng minh C3: filter trên visibleRequests)", () => {
    renderTab();

    // Trước khi lọc: chip Tất cả = 6 (tất cả PR không bị huỷ)
    const allChipBefore = screen.getByRole("button", { name: /Tất cả/i });
    expect(allChipBefore.textContent).toContain("6");

    openTvtsPanel();
    const trinhCheckbox = screen.getByRole("checkbox", {
      name: (_name, el) => el.closest("label")?.textContent?.includes("Le Thi Thuy Trinh") ?? false,
    });
    fireEvent.click(trinhCheckbox);
    fireEvent.keyDown(document, { key: "Escape" });

    // Sau khi lọc: chip Tất cả = 3 (chỉ còn PR của Trinh)
    const allChipAfter = screen.getByRole("button", { name: /Tất cả/i });
    expect(allChipAfter.textContent).toContain("3");
  });

  it("chọn 2 TVTS → union PR của 2 người", () => {
    renderTab();
    openTvtsPanel();

    const trinhCheckbox = screen.getByRole("checkbox", {
      name: (_name, el) => el.closest("label")?.textContent?.includes("Le Thi Thuy Trinh") ?? false,
    });
    const nhungCheckbox = screen.getByRole("checkbox", {
      name: (_name, el) => el.closest("label")?.textContent?.includes("Le Thuy Nhung") ?? false,
    });
    fireEvent.click(trinhCheckbox);
    fireEvent.click(nhungCheckbox);
    fireEvent.keyDown(document, { key: "Escape" });

    const tvtsCells = screen.getAllByTestId("pr-tvts-cell");
    const labels = tvtsCells.map((c) => c.textContent);
    expect(labels.filter((l) => l === "Le Thi Thuy Trinh")).toHaveLength(3);
    expect(labels.filter((l) => l === "Le Thuy Nhung")).toHaveLength(2);
  });

  it("Bỏ lọc → bảng về đầy đủ như ban đầu", () => {
    renderTab();
    openTvtsPanel();

    const trinhCheckbox = screen.getByRole("checkbox", {
      name: (_name, el) => el.closest("label")?.textContent?.includes("Le Thi Thuy Trinh") ?? false,
    });
    fireEvent.click(trinhCheckbox);
    // Bỏ lọc
    fireEvent.click(screen.getByText("Bỏ lọc"));
    fireEvent.keyDown(document, { key: "Escape" });

    const allChip = screen.getByRole("button", { name: /Tất cả/i });
    expect(allChip.textContent).toContain("6");
  });
});
