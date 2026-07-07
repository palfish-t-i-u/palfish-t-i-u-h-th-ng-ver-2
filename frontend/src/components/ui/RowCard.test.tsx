import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RowCard, RowCardList } from "./RowCard";

describe("RowCard", () => {
  it("hiển thị tiêu đề, giá trị chính, badge và meta", () => {
    render(
      <RowCard
        title="Nguyễn Văn A"
        value="4.700.000 ₫"
        badges={<span>Đã thanh toán</span>}
        meta={[{ label: "Sale", value: "Đào Thị Trang" }]}
      />
    );
    expect(screen.getByText("Nguyễn Văn A")).toBeInTheDocument();
    expect(screen.getByText("4.700.000 ₫")).toBeInTheDocument();
    expect(screen.getByText("Đã thanh toán")).toBeInTheDocument();
    expect(screen.getByText("Sale")).toBeInTheDocument();
    expect(screen.getByText("Đào Thị Trang")).toBeInTheDocument();
  });

  it("bấm vào thẻ gọi onClick", () => {
    const onClick = vi.fn();
    render(<RowCard title="PR-0080" onClick={onClick} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("bấm vào vùng actions KHÔNG lan lên onClick của thẻ", () => {
    const onClick = vi.fn();
    const onAction = vi.fn();
    render(
      <RowCard
        title="PR-0080"
        onClick={onClick}
        actions={<button onClick={onAction}>Sửa</button>}
      />
    );
    // Verify card click normally works
    fireEvent.click(screen.getByRole("button", { name: /PR-0080/i }));
    expect(onClick).toHaveBeenCalledTimes(1);
    onClick.mockClear();
    // Then verify action click doesn't propagate
    fireEvent.click(screen.getByText("Sửa"));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("keyboard Enter kích hoạt onClick", () => {
    const onClick = vi.fn();
    render(<RowCard title="PR-0080" onClick={onClick} />);
    const card = screen.getByRole("button");
    card.focus();
    fireEvent.keyDown(card, { key: "Enter" });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("keyboard Space không bắn trong keydown, bắn trong keyup", () => {
    const onClick = vi.fn();
    render(<RowCard title="PR-0080" onClick={onClick} />);
    const card = screen.getByRole("button");
    card.focus();
    fireEvent.keyDown(card, { key: " " });
    expect(onClick).not.toHaveBeenCalled();
    fireEvent.keyUp(card, { key: " " });
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("RowCardList", () => {
  it("hiển thị empty state khi không có thẻ", () => {
    render(<RowCardList empty="Chưa có PR nào">{null}</RowCardList>);
    expect(screen.getByText("Chưa có PR nào")).toBeInTheDocument();
  });

  it("render children khi có thẻ", () => {
    render(
      <RowCardList>
        <RowCard title="PR-0080" />
      </RowCardList>
    );
    expect(screen.getByText("PR-0080")).toBeInTheDocument();
  });
});
