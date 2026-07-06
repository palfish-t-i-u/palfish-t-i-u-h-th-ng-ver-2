import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import TvtsFilterDropdown from "./TvtsFilterDropdown";
import type { TvtsOption } from "./paymentRequestUtils";

const OPTIONS: TvtsOption[] = [
  { key: "trinh@pf.vn", label: "Le Thi Thuy Trinh", count: 5 },
  { key: "nhung@pf.vn", label: "Le Thuy Nhung", count: 3 },
  { key: "__unknown_tvts__", label: "Không rõ TVTS", count: 1 },
];

describe("TvtsFilterDropdown", () => {
  it('render nút TVTS, chưa chọn ai thì không có badge count', () => {
    render(
      <TvtsFilterDropdown options={OPTIONS} selected={new Set()} onChange={vi.fn()} />
    );
    expect(screen.getByRole("button", { name: /TVTS/i })).toBeInTheDocument();
    expect(screen.queryByText(/^\d+$/)).toBeNull();
  });

  it("selected.size > 0 → nút có class active + badge đúng số", () => {
    render(
      <TvtsFilterDropdown
        options={OPTIONS}
        selected={new Set(["trinh@pf.vn"])}
        onChange={vi.fn()}
      />
    );
    const btn = screen.getByRole("button", { name: /TVTS/i });
    expect(btn.className).toContain("active");
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("options rỗng → nút disabled", () => {
    render(
      <TvtsFilterDropdown options={[]} selected={new Set()} onChange={vi.fn()} />
    );
    expect(screen.getByRole("button", { name: /TVTS/i })).toBeDisabled();
  });

  it("click nút → mở panel, hiện đủ option kèm count", () => {
    render(
      <TvtsFilterDropdown options={OPTIONS} selected={new Set()} onChange={vi.fn()} />
    );
    fireEvent.click(screen.getByRole("button", { name: /TVTS/i }));
    expect(screen.getByText("Le Thi Thuy Trinh")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("Le Thuy Nhung")).toBeInTheDocument();
  });

  it("tick 1 option → onChange nhận Set mới chứa key đó, KHÔNG mutate Set cũ", () => {
    const originalSet = new Set<string>();
    const onChange = vi.fn();
    render(
      <TvtsFilterDropdown options={OPTIONS} selected={originalSet} onChange={onChange} />
    );
    fireEvent.click(screen.getByRole("button", { name: /TVTS/i }));
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]);
    expect(onChange).toHaveBeenCalledOnce();
    const nextSet = onChange.mock.calls[0][0] as Set<string>;
    expect(nextSet.has("trinh@pf.vn")).toBe(true);
    expect(originalSet.has("trinh@pf.vn")).toBe(false);
  });

  it("bỏ tick option đang chọn → onChange nhận Set không còn key đó", () => {
    const onChange = vi.fn();
    render(
      <TvtsFilterDropdown
        options={OPTIONS}
        selected={new Set(["trinh@pf.vn"])}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /TVTS/i }));
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]);
    const nextSet = onChange.mock.calls[0][0] as Set<string>;
    expect(nextSet.has("trinh@pf.vn")).toBe(false);
  });

  it("click 'Bỏ lọc' → onChange nhận Set rỗng", () => {
    const onChange = vi.fn();
    render(
      <TvtsFilterDropdown
        options={OPTIONS}
        selected={new Set(["trinh@pf.vn"])}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /TVTS/i }));
    fireEvent.click(screen.getByText("Bỏ lọc"));
    expect((onChange.mock.calls[0][0] as Set<string>).size).toBe(0);
  });

  it("'Bỏ lọc' disabled khi chưa chọn gì", () => {
    render(
      <TvtsFilterDropdown options={OPTIONS} selected={new Set()} onChange={vi.fn()} />
    );
    fireEvent.click(screen.getByRole("button", { name: /TVTS/i }));
    expect(screen.getByText("Bỏ lọc")).toBeDisabled();
  });

  it("gõ 'le' vào ô tìm → khớp cả 2 option Le", () => {
    render(
      <TvtsFilterDropdown options={OPTIONS} selected={new Set()} onChange={vi.fn()} />
    );
    fireEvent.click(screen.getByRole("button", { name: /TVTS/i }));
    fireEvent.change(screen.getByPlaceholderText(/Tìm TVTS/i), { target: { value: "le" } });
    expect(screen.getByText("Le Thi Thuy Trinh")).toBeInTheDocument();
    expect(screen.getByText("Le Thuy Nhung")).toBeInTheDocument();
    expect(screen.queryByText("Không rõ TVTS")).toBeNull();
  });

  it("gõ text không khớp → hiện 'Không có TVTS'", () => {
    render(
      <TvtsFilterDropdown options={OPTIONS} selected={new Set()} onChange={vi.fn()} />
    );
    fireEvent.click(screen.getByRole("button", { name: /TVTS/i }));
    fireEvent.change(screen.getByPlaceholderText(/Tìm TVTS/i), { target: { value: "zzzznotfound" } });
    expect(screen.getByText("Không có TVTS")).toBeInTheDocument();
  });

  it("mousedown ra ngoài → panel đóng", () => {
    render(
      <div>
        <TvtsFilterDropdown options={OPTIONS} selected={new Set()} onChange={vi.fn()} />
        <div data-testid="outside">outside</div>
      </div>
    );
    fireEvent.click(screen.getByRole("button", { name: /TVTS/i }));
    expect(screen.getByText("Le Thi Thuy Trinh")).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByTestId("outside"));
    expect(screen.queryByText("Le Thi Thuy Trinh")).toBeNull();
  });

  it("nhấn Escape → panel đóng", () => {
    render(
      <TvtsFilterDropdown options={OPTIONS} selected={new Set()} onChange={vi.fn()} />
    );
    fireEvent.click(screen.getByRole("button", { name: /TVTS/i }));
    expect(screen.getByText("Le Thi Thuy Trinh")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("Le Thi Thuy Trinh")).toBeNull();
  });
});
