import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import HelpLanding from "./HelpLanding";
import { HelpNavProvider, useHelpNav } from "../../contexts/HelpNavContext";

describe("HelpLanding", () => {
  it("lists all modules that have help content", () => {
    render(
      <HelpNavProvider>
        <HelpLanding />
      </HelpNavProvider>
    );
    expect(screen.getByText("Quản lý thanh toán")).toBeInTheDocument();
    expect(screen.getByText("Đối soát giao dịch · Chuyển khoản")).toBeInTheDocument();
  });

  it("clicking a module navigates to its module index (goToModuleIndex)", () => {
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
        <HelpLanding />
        <Probe />
      </HelpNavProvider>
    );
    fireEvent.click(screen.getByText("Quản lý thanh toán"));
    expect(screen.getByTestId("probe").textContent).toBe("paymentRequests/none");
  });
});
