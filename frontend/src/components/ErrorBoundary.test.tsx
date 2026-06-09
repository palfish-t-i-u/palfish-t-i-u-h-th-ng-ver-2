import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ErrorBoundary from "./ErrorBoundary";

function ThrowOnRender({ error }: { error: Error }) {
  throw error;
}

function GoodChild() {
  return <div>Content loads fine</div>;
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("ErrorBoundary", () => {
  it("renders children normally when no error", () => {
    render(
      <ErrorBoundary>
        <GoodChild />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Content loads fine")).toBeTruthy();
  });

  it("shows generic error UI on render error", () => {
    render(
      <ErrorBoundary>
        <ThrowOnRender error={new Error("Something broke")} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Đã xảy ra lỗi")).toBeTruthy();
    expect(screen.getByText(/Trang gặp lỗi không mong muốn/)).toBeTruthy();
    expect(screen.getByText("Tải lại trang")).toBeTruthy();
  });

  it("shows chunk-specific message on dynamic import failure", () => {
    render(
      <ErrorBoundary>
        <ThrowOnRender error={new Error("Failed to fetch dynamically imported module: /assets/Foo-abc123.js")} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Ứng dụng đã được cập nhật")).toBeTruthy();
    expect(screen.getByText(/phiên bản mới được triển khai/)).toBeTruthy();
  });

  it("shows chunk-specific message on loading chunk failure", () => {
    render(
      <ErrorBoundary>
        <ThrowOnRender error={new Error("Loading chunk abc123 failed")} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Ứng dụng đã được cập nhật")).toBeTruthy();
  });

  it("reload button calls window.location.reload", async () => {
    const reloadMock = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...window.location, reload: reloadMock },
      writable: true,
    });

    render(
      <ErrorBoundary>
        <ThrowOnRender error={new Error("Something broke")} />
      </ErrorBoundary>,
    );

    await userEvent.click(screen.getByText("Tải lại trang"));
    expect(reloadMock).toHaveBeenCalled();
  });
});
