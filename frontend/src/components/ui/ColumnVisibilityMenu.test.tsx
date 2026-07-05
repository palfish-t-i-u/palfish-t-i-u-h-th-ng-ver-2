import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ColumnVisibilityMenu, { type ColumnOption } from "./ColumnVisibilityMenu";

const COLUMNS: ColumnOption[] = [
  { key: "userName", label: "User Name", hideable: false },
  { key: "phone", label: "Phone", hideable: true },
  { key: "uid", label: "UID", hideable: true },
];

function setup(overrides?: { isVisible?: (k: string) => boolean; visibleCount?: number }) {
  const onToggle = vi.fn();
  const onShowAll = vi.fn();
  render(
    <ColumnVisibilityMenu
      columns={COLUMNS}
      isVisible={overrides?.isVisible ?? (() => true)}
      onToggle={onToggle}
      onShowAll={onShowAll}
      visibleCount={overrides?.visibleCount ?? 3}
    />
  );
  return { onToggle, onShowAll };
}

describe("ColumnVisibilityMenu", () => {
  it("hiện badge đếm cột visible/total", () => {
    setup({ isVisible: (k) => k !== "uid", visibleCount: 2 });
    expect(screen.getByText("2/3")).toBeInTheDocument();
  });

  it("mặc định panel đóng; click nút thì mở với checkbox đúng trạng thái", () => {
    setup({ isVisible: (k) => k !== "uid", visibleCount: 2 });
    expect(screen.queryByText("Chọn cột hiển thị")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /cột hiển thị/i }));
    expect(screen.getByText("Chọn cột hiển thị")).toBeInTheDocument();
    expect(screen.getByLabelText("Phone")).toBeChecked();
    expect(screen.getByLabelText("UID")).not.toBeChecked();
  });

  it("tick checkbox gọi onToggle đúng key", () => {
    const { onToggle } = setup();
    fireEvent.click(screen.getByRole("button", { name: /cột hiển thị/i }));
    fireEvent.click(screen.getByLabelText("Phone"));
    expect(onToggle).toHaveBeenCalledWith("phone");
  });

  it("cột hideable=false có checkbox disabled, không gọi onToggle", () => {
    const { onToggle } = setup();
    fireEvent.click(screen.getByRole("button", { name: /cột hiển thị/i }));
    const cb = screen.getByLabelText("User Name");
    expect(cb).toBeDisabled();
    fireEvent.click(cb);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("nút Hiện tất cả gọi onShowAll", () => {
    const { onShowAll } = setup({ isVisible: (k) => k !== "uid", visibleCount: 2 });
    fireEvent.click(screen.getByRole("button", { name: /cột hiển thị/i }));
    fireEvent.click(screen.getByRole("button", { name: "Hiện tất cả" }));
    expect(onShowAll).toHaveBeenCalled();
  });

  it("nút Hiện tất cả disabled khi không có cột ẩn", () => {
    setup(); // mặc định full 3/3
    fireEvent.click(screen.getByRole("button", { name: /cột hiển thị/i }));
    expect(screen.getByRole("button", { name: "Hiện tất cả" })).toBeDisabled();
  });

  it("Esc đóng panel", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /cột hiển thị/i }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("Chọn cột hiển thị")).not.toBeInTheDocument();
  });

  it("click ra ngoài đóng panel", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /cột hiển thị/i }));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByText("Chọn cột hiển thị")).not.toBeInTheDocument();
  });
});
