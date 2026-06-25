import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PrStaleContentWarning from "./PrStaleContentWarning";

describe("PrStaleContentWarning", () => {
  it("không render khi visible=false", () => {
    expect.assertions(1);
    const { container } = render(
      <PrStaleContentWarning visible={false} onRefresh={() => {}} onDismiss={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("render banner với cảnh báo + 2 nút khi visible=true", () => {
    expect.assertions(3);
    render(
      <PrStaleContentWarning visible={true} onRefresh={() => {}} onDismiss={() => {}} />,
    );
    // Banner phải có text cảnh báo rõ ràng
    expect(screen.getByText(/nội dung CK.*chưa.*cập nhật|đã đổi.*thông tin/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cập nhật QR/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Huỷ|Bỏ qua/ })).toBeInTheDocument();
  });

  it("gọi onRefresh khi bấm 'Cập nhật QR'", () => {
    expect.assertions(2);
    const onRefresh = vi.fn();
    render(
      <PrStaleContentWarning visible={true} onRefresh={onRefresh} onDismiss={() => {}} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Cập nhật QR/ }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onRefresh).toHaveBeenCalledWith();
  });

  it("gọi onDismiss khi bấm 'Huỷ'", () => {
    expect.assertions(1);
    const onDismiss = vi.fn();
    render(
      <PrStaleContentWarning visible={true} onRefresh={() => {}} onDismiss={onDismiss} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Huỷ|Bỏ qua/ }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("nút 'Cập nhật QR' bị disabled khi loading=true", () => {
    expect.assertions(1);
    render(
      <PrStaleContentWarning
        visible={true}
        loading={true}
        onRefresh={() => {}}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: /Đang cập nhật|Cập nhật QR/ })).toBeDisabled();
  });

  it("có role='alert' để screen reader / accessibility nhận diện cảnh báo", () => {
    expect.assertions(1);
    render(
      <PrStaleContentWarning visible={true} onRefresh={() => {}} onDismiss={() => {}} />,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("isLegacyLine=true hiển thị text giải thích line cũ thay vì text đổi thông tin", () => {
    expect.assertions(2);
    render(
      <PrStaleContentWarning
        visible={true}
        isLegacyLine={true}
        onRefresh={() => {}}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByText(/tên KH\/tên con viết tắt từ hệ thống cũ/i)).toBeInTheDocument();
    expect(screen.queryByText(/khách đã đổi thông tin/i)).toBeNull();
  });

  it("isLegacyLine=false (default) hiển thị text đổi thông tin chuẩn", () => {
    expect.assertions(2);
    render(
      <PrStaleContentWarning visible={true} onRefresh={() => {}} onDismiss={() => {}} />,
    );
    expect(screen.getByText(/khách đã đổi thông tin/i)).toBeInTheDocument();
    expect(screen.queryByText(/tên KH\/tên con viết tắt từ hệ thống cũ/i)).toBeNull();
  });
});
