import { render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import Module3Tab from "./Module3Tab";
import { server } from "../test/msw/server";
import type { InvoiceOrder } from "../types/order";

vi.mock("../lib/supabase", () => ({
  supabase: {
    channel: () => ({
      on: function () { return this; },
      subscribe: () => {},
    }),
    removeChannel: () => {},
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
    },
  },
}));

vi.mock("../hooks/usePermission", () => ({
  usePermission: () => ({ readOnly: false, level: "full", loading: false, canView: true }),
}));

const BASE = "http://localhost:8000";

function makeM3Orders(): InvoiceOrder[] {
  return [
    {
      id: "o1",
      maDonHang: "DH-001",
      tenKhach: "Le Van C",
      sdt: "84912345678",
      uid: "U100",
      goiHoc: "Goi Tieng Anh 1 Nam",
      tongTien: 5000000,
      nguon: "Ban moi",
      tienVe: true,
      donCRM: true,
      trangThaiThuTuc: "CHO_XAC_NHAN",
      taxProductName: "",
      taxInvoiceCode: "",
      taxProductCode: "",
      m3ApprovedAt: "",
      crmOrderId: "CRM-001",
      createdBy: "sale@test.com",
      createdAt: "2026-06-01T10:00:00Z",
    },
    {
      id: "o2",
      maDonHang: "DH-002",
      tenKhach: "Pham Thi D",
      sdt: "0987654321",
      uid: "U200",
      goiHoc: "Goi 6 Thang",
      tongTien: 3000000,
      nguon: "Gia han",
      tienVe: true,
      donCRM: true,
      trangThaiThuTuc: "CHO_XUAT_HD",
      taxProductName: "Goi 6 Thang",
      taxInvoiceCode: "",
      taxProductCode: "",
      m3ApprovedAt: "2026-06-02T11:00:00Z",
      crmOrderId: "CRM-002",
      createdBy: "sale2@test.com",
      createdAt: "2026-06-02T10:00:00Z",
    },
  ];
}

function mockM3Endpoint(orders?: InvoiceOrder[]) {
  server.use(
    http.get(`${BASE}/invoice/m3-pending`, () =>
      HttpResponse.json({ orders: orders ?? makeM3Orders(), count: (orders ?? makeM3Orders()).length }),
    ),
  );
}

describe("Module3Tab", () => {
  it("renders without crashing", async () => {
    mockM3Endpoint();
    render(<Module3Tab />);
    expect(screen.getByText("Kích hoạt khóa học")).toBeInTheDocument();
  });

  it("shows key UI elements (header, description, buttons)", async () => {
    mockM3Endpoint();
    render(<Module3Tab />);
    expect(screen.getByText(/Đơn đã xác nhận tiền về/)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("Làm mới")).toBeInTheDocument();
    });
    expect(screen.getByText(/Lưu hàng loạt/)).toBeInTheDocument();
    expect(screen.getByText(/Xuất hàng loạt/)).toBeInTheDocument();
  });

  it("shows loading state while fetching", async () => {
    server.use(
      http.get(`${BASE}/invoice/m3-pending`, async () => {
        await new Promise((r) => setTimeout(r, 100));
        return HttpResponse.json({ orders: makeM3Orders(), count: 2 });
      }),
    );
    render(<Module3Tab />);
    expect(screen.getByText("Đang tải…")).toBeInTheDocument();
  });

  it("renders order data in the table after loading", async () => {
    mockM3Endpoint();
    render(<Module3Tab />);

    await waitFor(() => {
      expect(screen.getByText("Le Van C")).toBeInTheDocument();
    });
    expect(screen.getByText("Pham Thi D")).toBeInTheDocument();
    expect(screen.getByText("Goi Tieng Anh 1 Nam")).toBeInTheDocument();
    expect(screen.getByText("Goi 6 Thang")).toBeInTheDocument();
    expect(screen.getByText("U100")).toBeInTheDocument();
    expect(screen.getByText("U200")).toBeInTheDocument();
    // Table headers
    expect(screen.getByText(/ID đơn hàng/)).toBeInTheDocument();
    expect(screen.getByText(/SDT/)).toBeInTheDocument();
    expect(screen.getByText("UID")).toBeInTheDocument();
    expect(screen.getByText(/Tên gói học/)).toBeInTheDocument();
    expect(screen.getByText("Tên khách")).toBeInTheDocument();
    expect(screen.getByText("Số tiền")).toBeInTheDocument();
    expect(screen.getByText("Thao tác")).toBeInTheDocument();
    expect(screen.getByText("Xuất hóa đơn")).toBeInTheDocument();
    // Status badge for approved order
    expect(screen.getByText("Chờ xuất")).toBeInTheDocument();
  });

  it("shows error message when API fails", async () => {
    server.use(
      http.get(`${BASE}/invoice/m3-pending`, () =>
        new HttpResponse(null, { status: 500 }),
      ),
    );
    render(<Module3Tab />);

    await waitFor(() => {
      expect(screen.getByText("Không tải được danh sách đơn hàng.")).toBeInTheDocument();
    });
  });

  it("shows empty state when no orders", async () => {
    mockM3Endpoint([]);
    render(<Module3Tab />);

    await waitFor(() => {
      expect(screen.getByText("Không có đơn nào có tiền về")).toBeInTheDocument();
    });
  });
});
