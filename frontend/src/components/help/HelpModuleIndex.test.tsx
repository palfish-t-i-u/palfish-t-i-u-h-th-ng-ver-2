import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import HelpModuleIndex from "./HelpModuleIndex";
import { HelpNavProvider, useHelpNav } from "../../contexts/HelpNavContext";

describe("HelpModuleIndex", () => {
  it("lists topics for a known module with human-readable label", () => {
    render(
      <HelpNavProvider>
        <HelpModuleIndex moduleSlug="paymentRequests" />
      </HelpNavProvider>
    );
    expect(screen.getByText("Hướng dẫn — Quản lý thanh toán")).toBeInTheDocument();
    expect(screen.getByText("Tạo lần thanh toán (TT) chuẩn")).toBeInTheDocument();
  });

  it("clicking a topic calls goToTopic", () => {
    function Probe() {
      const { helpModule, helpTopic } = useHelpNav();
      return (
        <span data-testid="probe">
          {helpModule ?? "none"}/{helpTopic ?? "none"}
        </span>
      );
    }
    render(
      <HelpNavProvider>
        <HelpModuleIndex moduleSlug="paymentRequests" />
        <Probe />
      </HelpNavProvider>
    );
    fireEvent.click(screen.getByText("Tạo lần thanh toán (TT) chuẩn"));
    expect(screen.getByTestId("probe").textContent).toBe("paymentRequests/tao-lan-tt-chuan");
  });

  it("shows a friendly message for a module with no help content", () => {
    render(
      <HelpNavProvider>
        <HelpModuleIndex moduleSlug="does-not-exist" />
      </HelpNavProvider>
    );
    expect(screen.getByText("Chưa có hướng dẫn")).toBeInTheDocument();
  });
});
