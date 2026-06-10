import { render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import StaffCRMTab from "./StaffCRMTab";
import { server } from "../test/msw/server";

vi.mock("../lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
    },
  },
}));

vi.mock("../hooks/useMe", () => ({
  useMe: () => ({
    profile: {
      email: "test@example.com",
      canManageStaff: true,
      canAccessAdmin: true,
      role: "system",
      permissions: {},
    },
    loading: false,
    error: "",
    refresh: () => Promise.resolve(),
  }),
}));

const BASE = "http://localhost:8000";

function makeSalesResponse() {
  return {
    sales: [
      {
        id: "s1",
        crmName: "Nguyen Van A",
        email: "a@test.com",
        phone: "0901234567",
        displayName: "Nguyen Van A",
        team: "Inhouse 1",
        subTeam: "Sub A",
        role: "sale",
        managerEmail: null,
        leaderEmail: null,
        isActive: true,
      },
      {
        id: "s2",
        crmName: "Tran Thi B",
        email: null,
        phone: null,
        displayName: "Tran Thi B",
        team: "Inhouse 2",
        subTeam: null,
        role: "leader",
        managerEmail: null,
        leaderEmail: null,
        isActive: false,
      },
    ],
  };
}

function mockSalesEndpoint() {
  server.use(
    http.get(`${BASE}/admin/sales`, () =>
      HttpResponse.json(makeSalesResponse()),
    ),
  );
}

describe("StaffCRMTab", () => {
  it("renders without crashing", async () => {
    mockSalesEndpoint();
    render(<StaffCRMTab />);
    expect(screen.getByText(/Master data từ Metabase/)).toBeInTheDocument();
  });

  it("shows key UI elements (search, buttons)", async () => {
    mockSalesEndpoint();
    render(<StaffCRMTab />);
    expect(screen.getByPlaceholderText("Tìm tên CRM…")).toBeInTheDocument();
    expect(screen.getByText("Tìm")).toBeInTheDocument();
    expect(screen.getByText("Sync Metabase now")).toBeInTheDocument();
  });

  it("shows loading state while fetching", async () => {
    server.use(
      http.get(`${BASE}/admin/sales`, async () => {
        await new Promise((r) => setTimeout(r, 100));
        return HttpResponse.json(makeSalesResponse());
      }),
    );
    render(<StaffCRMTab />);
    expect(screen.getByText("Đang tải…")).toBeInTheDocument();
  });

  it("renders staff data in the table after loading", async () => {
    mockSalesEndpoint();
    render(<StaffCRMTab />);

    await waitFor(() => {
      expect(screen.getByText("Nguyen Van A")).toBeInTheDocument();
    });
    expect(screen.getByText("Tran Thi B")).toBeInTheDocument();
    expect(screen.getByText("a@test.com")).toBeInTheDocument();
    expect(screen.getByText("Inhouse 1")).toBeInTheDocument();
    expect(screen.getByText("Sub A")).toBeInTheDocument();
    expect(screen.getByText("Hoạt động")).toBeInTheDocument();
    expect(screen.getByText("Tắt")).toBeInTheDocument();
    // Table headers
    expect(screen.getByText("CRM name")).toBeInTheDocument();
    expect(screen.getByText("Email link")).toBeInTheDocument();
    expect(screen.getByText("Team")).toBeInTheDocument();
    expect(screen.getByText("Sub-team")).toBeInTheDocument();
    expect(screen.getByText("Role")).toBeInTheDocument();
    expect(screen.getByText("Trạng thái")).toBeInTheDocument();
  });

  it("shows error message when API fails", async () => {
    server.use(
      http.get(`${BASE}/admin/sales`, () =>
        new HttpResponse(null, { status: 500 }),
      ),
    );
    render(<StaffCRMTab />);

    await waitFor(() => {
      expect(screen.getByText("Không tải danh sách nhân sự CRM.")).toBeInTheDocument();
    });
  });

  it("shows empty state when no staff data", async () => {
    server.use(
      http.get(`${BASE}/admin/sales`, () =>
        HttpResponse.json({ sales: [] }),
      ),
    );
    render(<StaffCRMTab />);

    await waitFor(() => {
      expect(screen.getByText(/Chưa có dữ liệu/)).toBeInTheDocument();
    });
  });
});
