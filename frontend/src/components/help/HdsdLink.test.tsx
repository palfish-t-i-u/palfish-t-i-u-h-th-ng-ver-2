import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HdsdLink } from "./HdsdLink";
import { HelpNavProvider, useHelpNav } from "../../contexts/HelpNavContext";
import { QUERY } from "../../hooks/useIsMobile";

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches,
      media: QUERY,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("HdsdLink", () => {
  it("renders nothing when used outside HelpNavProvider (does not crash the tree)", () => {
    const { container } = render(<HdsdLink mode="module" moduleSlug="paymentRequests" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("mode=module trên desktop calls goToModule, does not touch helpModule/helpTopic", () => {
    stubMatchMedia(false);
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

  it("mode=module trên mobile calls goToModuleIndex — không có sidebar để mở nên nhảy thẳng mục lục module", () => {
    stubMatchMedia(true);
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
        <HdsdLink mode="module" moduleSlug="paymentRequests" />
        <Probe />
      </HelpNavProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: "HDSD" }));
    expect(screen.getByTestId("probe").textContent).toBe("paymentRequests/none");
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
