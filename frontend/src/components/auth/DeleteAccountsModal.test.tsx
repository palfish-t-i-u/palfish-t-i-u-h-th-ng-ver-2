import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import DeleteAccountsModal from "./DeleteAccountsModal";
import { server } from "../../test/msw/server";
import type { AuthUserRow } from "../../types/profile";

const BASE = "http://localhost:8000";

function makeUser(over: Partial<AuthUserRow>): AuthUserRow {
  return {
    id: over.id || "u-?",
    email: over.email || "x@example.com",
    providers: [],
    lastSignIn: null,
    createdAt: null,
    bannedUntil: null,
    crmName: null,
    staffRole: null,
    isBanned: false,
    isActivated: false,
    department: null,
    team: null,
    subTeam: null,
    fullName: null,
    phone: null,
    ...over,
  };
}

const USERS: AuthUserRow[] = [
  makeUser({ id: "u-1", email: "alpha@test.com", crmName: "Alpha CRM", isActivated: true }),
  makeUser({ id: "u-2", email: "bravo@test.com", crmName: "Bravo CRM" }),
  makeUser({ id: "u-3", email: "charlie@test.com", fullName: "Charlie Full" }),
  makeUser({ id: "u-4", email: "delta@test.com", crmName: "Delta CRM", isBanned: true }),
];

function renderModal(extra?: { users?: AuthUserRow[]; onDeleted?: () => void; onClose?: () => void }) {
  const onDeleted = extra?.onDeleted || vi.fn();
  const onClose = extra?.onClose || vi.fn();
  render(
    <DeleteAccountsModal
      open
      users={extra?.users ?? USERS}
      onClose={onClose}
      onDeleted={onDeleted}
    />
  );
  return { onDeleted, onClose };
}

function getRowByEmail(email: string): HTMLElement {
  const cell = screen.getByText(email);
  // bubble up to the row container
  const row = cell.closest(".aa-delete-row") as HTMLElement | null;
  if (!row) throw new Error(`Row not found for ${email}`);
  return row;
}

describe("DeleteAccountsModal", () => {
  it("hiển thị toàn bộ tài khoản truyền vào", () => {
    renderModal();
    expect(screen.getByText("alpha@test.com")).toBeInTheDocument();
    expect(screen.getByText("bravo@test.com")).toBeInTheDocument();
    expect(screen.getByText("charlie@test.com")).toBeInTheDocument();
    expect(screen.getByText("delta@test.com")).toBeInTheDocument();
  });

  it("ô tìm kiếm lọc theo email và tên CRM (không phân biệt hoa-thường)", async () => {
    const user = userEvent.setup();
    renderModal();

    const searchBox = screen.getByPlaceholderText("Tìm email, tên CRM...");
    await user.type(searchBox, "bravo");
    expect(screen.getByText("bravo@test.com")).toBeInTheDocument();
    expect(screen.queryByText("alpha@test.com")).not.toBeInTheDocument();

    await user.clear(searchBox);
    await user.type(searchBox, "DELTA CRM");
    expect(screen.getByText("delta@test.com")).toBeInTheDocument();
    expect(screen.queryByText("alpha@test.com")).not.toBeInTheDocument();
  });

  it("nút xóa bị disable khi chưa chọn tài khoản nào", () => {
    renderModal();
    const deleteBtn = screen.getByRole("button", { name: /^Xóa tài khoản$/ });
    expect(deleteBtn).toBeDisabled();
  });

  it("chọn 'tất cả' sau khi lọc KHÔNG xóa các lựa chọn nằm ngoài bộ lọc", async () => {
    const user = userEvent.setup();
    renderModal();

    // Bước 1: chọn alpha
    await user.click(getRowByEmail("alpha@test.com"));
    expect(screen.getByText(/Đã chọn/)).toHaveTextContent("Đã chọn 1 tài khoản");

    // Bước 2: lọc còn 'bravo' & 'charlie' không có
    const searchBox = screen.getByPlaceholderText("Tìm email, tên CRM...");
    await user.type(searchBox, "bravo");
    expect(screen.queryByText("alpha@test.com")).not.toBeInTheDocument();

    // Bước 3: bấm header checkbox để "chọn tất cả" trong filter hiện tại
    // Header checkbox là checkbox đầu tiên trong list-header
    const headerRow = document.querySelector(".aa-delete-list-header") as HTMLElement;
    const headerCheckbox = within(headerRow).getByRole("checkbox");
    await user.click(headerCheckbox);

    // Tổng chọn = alpha (ẩn) + bravo (hiện) = 2
    expect(screen.getByText(/Đã chọn/)).toHaveTextContent("Đã chọn 2 tài khoản");

    // Bước 4: bấm lại header để bỏ chọn rows đang hiển thị — alpha PHẢI vẫn còn
    await user.click(headerCheckbox);
    expect(screen.getByText(/Đã chọn/)).toHaveTextContent("Đã chọn 1 tài khoản");

    // Xóa filter → alpha vẫn được đánh dấu chọn
    await user.clear(searchBox);
    const alphaRow = getRowByEmail("alpha@test.com");
    const alphaCheckbox = within(alphaRow).getByRole("checkbox") as HTMLInputElement;
    expect(alphaCheckbox.checked).toBe(true);
  });

  it("bước xác nhận liệt kê các email sẽ bị xóa", async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(getRowByEmail("alpha@test.com"));
    await user.click(getRowByEmail("charlie@test.com"));

    await user.click(screen.getByRole("button", { name: /^Xóa tài khoản$/ }));

    expect(screen.getByText(/Xác nhận xóa 2 tài khoản/)).toBeInTheDocument();
    expect(screen.getByText("alpha@test.com")).toBeInTheDocument();
    expect(screen.getByText("charlie@test.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Xóa 2 tài khoản/ })).toBeInTheDocument();
  });

  it("xóa thành công toàn bộ → đóng modal và gọi onDeleted", async () => {
    const user = userEvent.setup();
    const onDeleted = vi.fn();
    const onClose = vi.fn();

    server.use(
      http.post(`${BASE}/admin/auth-users/bulk-delete`, async ({ request }) => {
        const body = (await request.json()) as { user_ids: string[] };
        return HttpResponse.json({
          ok: true,
          deleted: body.user_ids.length,
          deletedIds: body.user_ids,
          errors: [],
        });
      })
    );

    renderModal({ onDeleted, onClose });
    await user.click(getRowByEmail("alpha@test.com"));
    await user.click(screen.getByRole("button", { name: /^Xóa tài khoản$/ }));
    await user.click(screen.getByRole("button", { name: /Xóa 1 tài khoản/ }));

    await waitFor(() => {
      expect(onDeleted).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("xóa hụt → giữ modal mở, hiển thị danh sách lỗi với email và lý do", async () => {
    const user = userEvent.setup();
    const onDeleted = vi.fn();
    const onClose = vi.fn();

    server.use(
      http.post(`${BASE}/admin/auth-users/bulk-delete`, async () => {
        // Giả lập: alpha bị chặn (tự xóa), bravo thành công
        return HttpResponse.json({
          ok: false,
          deleted: 1,
          deletedIds: ["u-2"],
          errors: [
            {
              userId: "u-1",
              email: "alpha@test.com",
              error: "Không thể tự xóa tài khoản đang đăng nhập",
            },
          ],
        });
      })
    );

    renderModal({ onDeleted, onClose });
    await user.click(getRowByEmail("alpha@test.com"));
    await user.click(getRowByEmail("bravo@test.com"));
    await user.click(screen.getByRole("button", { name: /^Xóa tài khoản$/ }));
    await user.click(screen.getByRole("button", { name: /Xóa 2 tài khoản/ }));

    // Danh sách reload phải được trigger
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());

    // Modal KHÔNG được đóng
    expect(onClose).not.toHaveBeenCalled();

    // Banner báo lỗi
    expect(
      screen.getByText(/Đã xóa 1\/2 tài khoản\. 1 tài khoản không xóa được/)
    ).toBeInTheDocument();

    // Danh sách lỗi với email + lý do
    expect(screen.getByText("Tài khoản không xóa được:")).toBeInTheDocument();
    // Email alpha xuất hiện 2 lần (row gốc + danh sách lỗi); chỉ cần đảm bảo lý do hiện
    expect(
      screen.getByText(/Không thể tự xóa tài khoản đang đăng nhập/)
    ).toBeInTheDocument();
  });
});
