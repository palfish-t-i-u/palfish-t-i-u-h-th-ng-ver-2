import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "../test/msw/server";
import { __resetColumnVisibilityCache } from "../hooks/useColumnVisibility";
import SoDoanhThuTab, { LEDGER_COLUMNS } from "./SoDoanhThuTab";

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

let mockPermissions: Record<string, "full" | "read" | "none"> = { revenueLedger: "full" };

vi.mock("../hooks/useMe", () => ({
  useMe: () => ({
    profile: {
      email: "test@example.com",
      role: "system",
      department: null,
      permissions: mockPermissions,
    },
    loading: false,
    error: "",
    refresh: async () => {},
  }),
}));

const LEDGER_ROW = {
  id: "r1",
  ngayTienVe: "2026-07-04",
  payTime: "2026-07-04",
  tenKhach: "C Oanh - Thương Anh",
  sdt: "84-878714588",
  uid: "3313938108",
  goiHoc: "",
  soTienVnd: 10_800_000,
  gmvRmb: 2919,
  saleCrmName: "Nguyen Minh Phat",
  team: "HCM (Online)",
  loai: "转介绍",
  loai2: "",
  note: "",
  note2: "",
  paymentMethod: "1st",
  loaiNhap: "tay",
  infoCode: "",
  maDonHang: "",
  crmOrderId: "",
};

const EMPTY_SUMMARY = { totalGmvVnd: 0, orderCount: 0, bySource: [] };

function mockLedger(rows: unknown[]) {
  server.use(
    http.get("http://localhost:8000/revenue/ledger", () =>
      HttpResponse.json({ rows, count: rows.length, offset: 0, limit: 60, hasMore: false })
    ),
    http.get("http://localhost:8000/revenue/ledger/summary", () =>
      HttpResponse.json(EMPTY_SUMMARY)
    )
  );
}

describe("SoDoanhThuTab column visibility", () => {
  beforeEach(() => {
    __resetColumnVisibilityCache();
    mockPermissions = { revenueLedger: "full" };
  });

  it("G1: header và body luôn cùng số cột, trước và sau khi ẩn cột", async () => {
    mockLedger([LEDGER_ROW]);
    render(<SoDoanhThuTab />);
    await waitFor(() =>
      expect(screen.getByText("C Oanh - Thương Anh")).toBeInTheDocument()
    );

    const headerCount = () => screen.getAllByRole("columnheader").length;
    const bodyRow = screen.getByText("C Oanh - Thương Anh").closest("tr")!;
    const cellCount = () => within(bodyRow).getAllByRole("cell").length;

    expect(headerCount()).toBe(LEDGER_COLUMNS.length);
    expect(cellCount()).toBe(headerCount());

    fireEvent.click(screen.getByRole("button", { name: /cột hiển thị/i }));
    fireEvent.click(screen.getByLabelText("Phone"));

    expect(screen.queryByRole("columnheader", { name: "Phone" })).not.toBeInTheDocument();
    expect(headerCount()).toBe(LEDGER_COLUMNS.length - 1);
    expect(cellCount()).toBe(headerCount());
    expect(screen.getByText(/1 cột đang ẩn/)).toBeInTheDocument();
  });

  it("G4: colSpan empty-state khớp số cột visible", async () => {
    mockLedger([]);
    render(<SoDoanhThuTab />);
    await waitFor(() =>
      expect(screen.getByText(/Chưa có dòng/)).toBeInTheDocument()
    );

    const emptyCell = screen.getByText(/Chưa có dòng/).closest("td")!;
    expect(emptyCell.colSpan).toBe(LEDGER_COLUMNS.length);

    fireEvent.click(screen.getByRole("button", { name: /cột hiển thị/i }));
    fireEvent.click(screen.getByLabelText("Phone"));
    expect(emptyCell.colSpan).toBe(LEDGER_COLUMNS.length - 1);
  });

  it("G3: User Name không ẩn được (checkbox disabled)", async () => {
    mockLedger([LEDGER_ROW]);
    render(<SoDoanhThuTab />);
    await waitFor(() =>
      expect(screen.getByText("C Oanh - Thương Anh")).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole("button", { name: /cột hiển thị/i }));
    expect(screen.getByLabelText("User Name")).toBeDisabled();
  });

  it("G6: readOnly user không thấy cột Thao tác ở cả header lẫn body", async () => {
    mockPermissions = { revenueLedger: "read" };
    mockLedger([LEDGER_ROW]);
    render(<SoDoanhThuTab />);
    await waitFor(() =>
      expect(screen.getByText("C Oanh - Thương Anh")).toBeInTheDocument()
    );

    expect(screen.queryByRole("columnheader", { name: "Thao tác" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Chỉnh sửa" })).not.toBeInTheDocument();

    const headerCount = screen.getAllByRole("columnheader").length;
    const bodyRow = screen.getByText("C Oanh - Thương Anh").closest("tr")!;
    const cellCount = within(bodyRow).getAllByRole("cell").length;
    expect(headerCount).toBe(LEDGER_COLUMNS.length - 1);
    expect(cellCount).toBe(headerCount);
  });
});
