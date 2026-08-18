import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HdsdLink } from "./HdsdLink";

describe("HdsdLink", () => {
  it("renders without a router (plain anchor, no context dependency)", () => {
    render(<HdsdLink moduleSlug="paymentRequests" />);
    const link = screen.getByRole("link", { name: "HDSD" });
    expect(link).toHaveAttribute("href", "/docs/paymentRequests");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("links to the module index when no topicSlug is given", () => {
    render(<HdsdLink moduleSlug="reconCard" />);
    expect(screen.getByRole("link", { name: "HDSD" })).toHaveAttribute("href", "/docs/reconCard");
  });

  it("links to the specific article when topicSlug is given", () => {
    render(<HdsdLink moduleSlug="paymentRequests" topicSlug="quan-ly-lan-thanh-toan" />);
    expect(screen.getByRole("link", { name: "HDSD" })).toHaveAttribute(
      "href",
      "/docs/paymentRequests/quan-ly-lan-thanh-toan"
    );
  });
});
