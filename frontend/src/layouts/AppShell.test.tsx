// frontend/src/layouts/AppShell.test.tsx
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AppShell, { type NavItem } from "./AppShell";

function makeItems(n: number): NavItem[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `tab${i}`,
    label: `Tab${i}`,
    icon: <span />,
  }));
}

function renderShell(items: NavItem[], activeId = "tab0", onSelect = vi.fn()) {
  render(
    <AppShell items={items} activeId={activeId} onSelect={onSelect} title="Test">
      <div>nội dung</div>
    </AppShell>
  );
  return { onSelect };
}

describe("AppShell bottom nav", () => {
  it("<=5 mục: hiện đủ, không có nút Thêm", () => {
    renderShell(makeItems(5));
    const nav = screen.getByRole("navigation", { name: "Điều hướng chính" });
    for (let i = 0; i < 5; i++) expect(within(nav).getByText(`Tab${i}`)).toBeInTheDocument();
    expect(within(nav).queryByText("Thêm")).not.toBeInTheDocument();
  });

  it(">5 mục: ghim 4 mục đầu + nút Thêm", () => {
    renderShell(makeItems(8));
    const nav = screen.getByRole("navigation", { name: "Điều hướng chính" });
    for (let i = 0; i < 4; i++) expect(within(nav).getByText(`Tab${i}`)).toBeInTheDocument();
    expect(within(nav).queryByText("Tab4")).not.toBeInTheDocument();
    expect(within(nav).getByText("Thêm")).toBeInTheDocument();
  });

  it("bấm Thêm mở sheet đầy đủ, chọn module ngoài slot đầu", () => {
    const { onSelect } = renderShell(makeItems(8));
    fireEvent.click(screen.getByText("Thêm"));
    const sheet = screen.getByRole("dialog", { name: "Tất cả chức năng" });
    fireEvent.click(within(sheet).getByText("Tab6"));
    expect(onSelect).toHaveBeenCalledWith("tab6");
    expect(screen.queryByRole("dialog", { name: "Tất cả chức năng" })).not.toBeInTheDocument();
  });

  it("module active ngoài 4 slot đầu → nút Thêm highlight", () => {
    renderShell(makeItems(8), "tab6");
    const nav = screen.getByRole("navigation", { name: "Điều hướng chính" });
    const moreBtn = within(nav).getByText("Thêm").closest("button")!;
    expect(moreBtn.className).toContain("text-gmv-primary");
  });

  it("mục ghim có children → chọn child đầu tiên (không chọn id hub)", () => {
    const items: NavItem[] = [
      ...makeItems(3),
      {
        id: "reconHub",
        label: "Đốisoát",
        icon: <span />,
        children: [
          { id: "reconciliation", label: "Chuyển khoản" },
          { id: "reconCard", label: "Quẹt thẻ" },
        ],
      },
      ...makeItems(2).map((it) => ({ ...it, id: `x${it.id}`, label: `X${it.label}` })),
    ];
    const onSelect = vi.fn();
    renderShell(items, "tab0", onSelect);
    const nav = screen.getByRole("navigation", { name: "Điều hướng chính" });
    fireEvent.click(within(nav).getByText("Đốisoát"));
    expect(onSelect).toHaveBeenCalledWith("reconciliation");
  });
});
