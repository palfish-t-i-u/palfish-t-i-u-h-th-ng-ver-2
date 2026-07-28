import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import HelpModuleIndex from "./HelpModuleIndex";

describe("HelpModuleIndex", () => {
  it("lists topics for a known module with human-readable label", () => {
    render(
      <MemoryRouter>
        <HelpModuleIndex moduleSlug="paymentRequests" />
      </MemoryRouter>
    );
    expect(screen.getByText("Hướng dẫn — Quản lý thanh toán")).toBeInTheDocument();
    expect(screen.getByText("Tạo lần thanh toán (TT) chuẩn")).toBeInTheDocument();
  });

  it("links each topic to its article route", () => {
    render(
      <MemoryRouter>
        <HelpModuleIndex moduleSlug="paymentRequests" />
      </MemoryRouter>
    );
    expect(screen.getByText("Tạo lần thanh toán (TT) chuẩn").closest("a")).toHaveAttribute(
      "href",
      "/docs/paymentRequests/tao-lan-tt-chuan"
    );
  });

  it("shows a friendly message for a module with no help content", () => {
    render(
      <MemoryRouter>
        <HelpModuleIndex moduleSlug="does-not-exist" />
      </MemoryRouter>
    );
    expect(screen.getByText("Chưa có hướng dẫn")).toBeInTheDocument();
  });
});
