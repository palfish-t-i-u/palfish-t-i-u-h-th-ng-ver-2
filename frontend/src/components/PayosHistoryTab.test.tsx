import { render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import PayosHistoryTab from "./PayosHistoryTab";
import { server } from "../test/msw/server";

vi.mock("../lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
    },
  },
}));

const BASE = "http://localhost:8000";

function makeTransactions() {
  return {
    transactions: [
      {
        id: "tx1",
        maGiaoDichBank: "BANK-GD-001",
        soTien: 5000000,
        noiDung: "Thanh toan don hang ABC123",
        thoiGian: "2026-06-08T14:30:00Z",
        infoCode: "IC-ABC123",
        trangThaiDoiSoat: "khop",
        maDonHang: "DH-001",
      },
      {
        id: "tx2",
        maGiaoDichBank: "BANK-GD-002",
        soTien: 3000000,
        noiDung: "CK noi dung khong ro",
        thoiGian: "2026-06-08T15:00:00Z",
        infoCode: "",
        trangThaiDoiSoat: "chua_xu_ly",
        maDonHang: undefined,
      },
      {
        id: "tx3",
        maGiaoDichBank: "BANK-GD-003",
        soTien: 7500000,
        noiDung: "Thanh toan don DEF456",
        thoiGian: "2026-06-09T10:00:00Z",
        infoCode: "IC-DEF456",
        trangThaiDoiSoat: "sai_tien",
        maDonHang: "DH-003",
      },
    ],
  };
}

function mockTransactionsEndpoint(data?: ReturnType<typeof makeTransactions>) {
  server.use(
    http.get(`${BASE}/payos/transactions`, () =>
      HttpResponse.json(data ?? makeTransactions()),
    ),
  );
}

describe("PayosHistoryTab", () => {
  it("renders without crashing", async () => {
    mockTransactionsEndpoint();
    render(<PayosHistoryTab />);
    expect(screen.getByText("Thời gian")).toBeInTheDocument();
  });

  it("shows key UI elements (filter form, table headers)", async () => {
    mockTransactionsEndpoint();
    render(<PayosHistoryTab />);
    expect(screen.getByText("Từ ngày")).toBeInTheDocument();
    expect(screen.getByText("Đến ngày")).toBeInTheDocument();
    expect(screen.getByText("Tìm theo Info Code / Nội dung")).toBeInTheDocument();
    expect(screen.getByText("Trạng thái")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("VD: ABC123...")).toBeInTheDocument();
    // Table headers
    expect(screen.getByText("Thời gian")).toBeInTheDocument();
    expect(screen.getByText("Mã GD Bank")).toBeInTheDocument();
    expect(screen.getByText("Số tiền")).toBeInTheDocument();
    expect(screen.getByText("Nội dung CK")).toBeInTheDocument();
    expect(screen.getByText("Info Code")).toBeInTheDocument();
    expect(screen.getByText("Mã đơn match")).toBeInTheDocument();
    expect(screen.getByText("Trạng thái đối soát")).toBeInTheDocument();
  });

  it("shows loading state while fetching", async () => {
    server.use(
      http.get(`${BASE}/payos/transactions`, async () => {
        await new Promise((r) => setTimeout(r, 100));
        return HttpResponse.json(makeTransactions());
      }),
    );
    render(<PayosHistoryTab />);
    // Both the button and the table cell show "Dang tai..." during loading
    expect(screen.getAllByText("Đang tải...").length).toBeGreaterThan(0);
  });

  it("renders transaction data in the table after loading", async () => {
    mockTransactionsEndpoint();
    render(<PayosHistoryTab />);

    await waitFor(() => {
      expect(screen.getByText("BANK-GD-001")).toBeInTheDocument();
    });
    expect(screen.getByText("BANK-GD-002")).toBeInTheDocument();
    expect(screen.getByText("BANK-GD-003")).toBeInTheDocument();
    expect(screen.getByText("Thanh toan don hang ABC123")).toBeInTheDocument();
    expect(screen.getByText("IC-ABC123")).toBeInTheDocument();
    expect(screen.getByText("DH-001")).toBeInTheDocument();
    expect(screen.getByText("DH-003")).toBeInTheDocument();
    // Status badges
    expect(screen.getByText("Đã khớp")).toBeInTheDocument();
    expect(screen.getByText("Chưa khớp")).toBeInTheDocument();
    expect(screen.getByText("Sai tiền")).toBeInTheDocument();
  });

  it("shows error message when API fails", async () => {
    server.use(
      http.get(`${BASE}/payos/transactions`, () =>
        HttpResponse.json({ detail: "Server error" }, { status: 500 }),
      ),
    );
    render(<PayosHistoryTab />);

    await waitFor(() => {
      expect(screen.getByText(/Lỗi tải giao dịch|Server error/)).toBeInTheDocument();
    });
  });

  it("shows empty state when no transactions", async () => {
    mockTransactionsEndpoint({ transactions: [] });
    render(<PayosHistoryTab />);

    await waitFor(() => {
      expect(screen.getByText("Không có giao dịch nào.")).toBeInTheDocument();
    });
  });

  it("shows status filter dropdown with all options", async () => {
    mockTransactionsEndpoint();
    render(<PayosHistoryTab />);

    const statusSelect = screen.getByRole("combobox");
    expect(statusSelect).toBeInTheDocument();
    expect(screen.getByText("Tất cả trạng thái")).toBeInTheDocument();
    expect(screen.getByText("Đã khớp (mã + tiền)")).toBeInTheDocument();
    expect(screen.getByText("Sai số tiền")).toBeInTheDocument();
    expect(screen.getByText("Chưa khớp đơn")).toBeInTheDocument();
  });
});
