import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HdsdLink } from "./HdsdLink";
import { HelpNavProvider, useHelpNav } from "../../contexts/HelpNavContext";

describe("HdsdLink", () => {
  it("renders nothing when used outside HelpNavProvider (does not crash the tree)", () => {
    const { container } = render(<HdsdLink mode="module" moduleSlug="paymentRequests" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("mode=module calls goToModule, does not touch helpModule/helpTopic", () => {
    function Probe() {
      const { helpModule, helpTopic, helpExpandedModuleId } = useHelpNav();
      return (
        <span data-testid="probe">
          {helpExpandedModuleId ?? "none"}/{helpModule ?? "none"}/{helpTopic ?? "none"}
        </span>
      );
    }
    render(
      <HelpNavProvider>
        <HdsdLink mode="module" moduleSlug="paymentRequests" />
        <Probe />
      </HelpNavProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: "HDSD" }));
    expect(screen.getByTestId("probe").textContent).toBe("paymentRequests/none/none");
  });

  it("mode=topic calls goToTopic, sets helpModule+helpTopic", () => {
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
        <HdsdLink mode="topic" moduleSlug="paymentRequests" topicSlug="tao-lan-tt-chuan" />
        <Probe />
      </HelpNavProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: "HDSD" }));
    expect(screen.getByTestId("probe").textContent).toBe("paymentRequests/tao-lan-tt-chuan");
  });
});
