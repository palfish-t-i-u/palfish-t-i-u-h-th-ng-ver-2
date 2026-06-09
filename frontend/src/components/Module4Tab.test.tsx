import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import Module4Tab from "./Module4Tab";
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

function makePendingOrders(): InvoiceOrder[] {
  return [
    {
      id: "p1",
      maDonHang: "DH-P001",
      tenKhach: "Nguyen Thi E",
      sdt: "0901234567",
      uid: "U300",
      goiHoc: "Goi 1 Nam",
      tongTien: 7000000,
      nguon: "Ban moi",
      tienVe: true,
      donCRM: true,
      trangThaiThuTuc: "CHO_XUAT_HD",
      taxProductName: "Goi 1 Nam",
      taxInvoiceCode: "",
      taxProductCode: "",
      m3ApprovedAt: "2026-06-05T09:00:00Z",
      crmOrderId: "CRM-P001",
      createdBy: "sale@test.com",
      createdAt: "2026-06-01T10:00:00Z",
    },
  ];
}

function makeIssuedOrders(): InvoiceOrder[] {
  return [
    {
      id: "i1",
      maDonHang: "DH-I001",
      tenKhach: "Tran Van F",
      sdt: "0912345678",
      uid: "U400",
      goiHoc: "Goi 3 Thang",
      tongTien: 2500000,
      nguon: "Gia han",
      tienVe: true,
      donCRM: true,
      trangThaiThuTuc: "DA_XUAT_HD",
      taxProductName: "Goi 3 Thang",
      taxInvoiceCode: "INV-001",
      taxProductCode: "PROD-001",
      m3ApprovedAt: "2026-06-03T08:00:00Z",
      crmOrderId: "CRM-I001",
      createdBy: "sale2@test.com",
      createdAt: "2026-05-15T10:00:00Z",
    },
  ];
}

function mockM4Endpoints(pending?: InvoiceOrder[], issued?: InvoiceOrder[]) {
  server.use(
    http.get(`${BASE}/invoice/m4-queue`, () =>
      HttpResponse.json({
        orders: pending ?? makePendingOrders(),
        count: (pending ?? makePendingOrders()).length,
      }),
    ),
    http.get(`${BASE}/invoice/m4-issued`, () =>
      HttpResponse.json({
        orders: issued ?? makeIssuedOrders(),
        count: (issued ?? makeIssuedOrders()).length,
      }),
    ),
  );
}

describe("Module4Tab", () => {
  it("renders without crashing", async () => {
    mockM4Endpoints();
    render(<Module4Tab />);
    expect(screen.getByText(/Xuat hoa don thue - M4/)).toBeInTheDocument();
  });

  it("shows key UI elements (tab switcher, buttons)", async () => {
    mockM4Endpoints();
    render(<Module4Tab />);
    // Tab switcher text appears in both tabs and badges
    expect(screen.getAllByText(/Cho xuat/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Da xuat/).length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(screen.getByText("Lam moi")).toBeInTheDocument();
    });
    expect(screen.getByText("Tai hoa don")).toBeInTheDocument();
  });

  it("shows loading state while fetching", async () => {
    server.use(
      http.get(`${BASE}/invoice/m4-queue`, async () => {
        await new Promise((r) => setTimeout(r, 100));
        return HttpResponse.json({ orders: makePendingOrders(), count: 1 });
      }),
      http.get(`${BASE}/invoice/m4-issued`, async () => {
        await new Promise((r) => setTimeout(r, 100));
        return HttpResponse.json({ orders: makeIssuedOrders(), count: 1 });
      }),
    );
    render(<Module4Tab />);
    expect(screen.getByText("Dang tai...")).toBeInTheDocument();
  });

  it("renders pending orders in the table after loading", async () => {
    mockM4Endpoints();
    render(<Module4Tab />);

    await waitFor(() => {
      expect(screen.getByText("DH-P001")).toBeInTheDocument();
    });
    expect(screen.getByText("Nguyen Thi E")).toBeInTheDocument();
    expect(screen.getByText("Goi 1 Nam")).toBeInTheDocument();
    expect(screen.getByText("CRM-P001")).toBeInTheDocument();
    // Table headers
    expect(screen.getByText("Ma don")).toBeInTheDocument();
    expect(screen.getByText("Khach hang")).toBeInTheDocument();
    expect(screen.getByText("Ten SP thue")).toBeInTheDocument();
    expect(screen.getByText("So tien")).toBeInTheDocument();
    // Summary badges
    expect(screen.getByText(/Cho xuat: 1/)).toBeInTheDocument();
    expect(screen.getByText(/Da xuat: 1/)).toBeInTheDocument();
    // Cancel button visible for pending tab
    expect(screen.getByText("Huy queue")).toBeInTheDocument();
  });

  it("switches to Da xuat tab and shows issued orders", async () => {
    mockM4Endpoints();
    const user = userEvent.setup();
    render(<Module4Tab />);

    await waitFor(() => {
      expect(screen.getByText("DH-P001")).toBeInTheDocument();
    });

    // Click on "Da xuat" tab
    const daXuatTab = screen.getAllByText(/Da xuat/).find(
      (el) => el.tagName === "BUTTON"
    );
    if (daXuatTab) await user.click(daXuatTab);

    await waitFor(() => {
      expect(screen.getByText("DH-I001")).toBeInTheDocument();
    });
    expect(screen.getByText("Tran Van F")).toBeInTheDocument();
    expect(screen.getByText("INV-001")).toBeInTheDocument();
    expect(screen.getByText("PROD-001")).toBeInTheDocument();
  });

  it("shows error message when API fails", async () => {
    server.use(
      http.get(`${BASE}/invoice/m4-queue`, () =>
        new HttpResponse(null, { status: 500 }),
      ),
      http.get(`${BASE}/invoice/m4-issued`, () =>
        new HttpResponse(null, { status: 500 }),
      ),
    );
    render(<Module4Tab />);

    await waitFor(() => {
      expect(screen.getByText("Khong tai duoc du lieu hoa don.")).toBeInTheDocument();
    });
  });

  it("shows empty state when no pending orders", async () => {
    mockM4Endpoints([], []);
    render(<Module4Tab />);

    await waitFor(() => {
      expect(screen.getByText("Khong co don cho xuat")).toBeInTheDocument();
    });
  });
});
