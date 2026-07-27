import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import HelpLanding from "./HelpLanding";

describe("HelpLanding", () => {
  it("lists all modules that have help content", () => {
    render(
      <MemoryRouter>
        <HelpLanding />
      </MemoryRouter>
    );
    expect(screen.getByText("Quản lý thanh toán")).toBeInTheDocument();
    expect(screen.getByText("Đối soát giao dịch · Chuyển khoản")).toBeInTheDocument();
  });

  it("links each module to its module index route", () => {
    render(
      <MemoryRouter>
        <HelpLanding />
      </MemoryRouter>
    );
    expect(screen.getByText("Quản lý thanh toán").closest("a")).toHaveAttribute(
      "href",
      "/docs/paymentRequests"
    );
  });
});
