import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import HelpArticle from "./HelpArticle";

describe("HelpArticle", () => {
  it("renders the pilot topic's title and body content", () => {
    render(<HelpArticle moduleSlug="paymentRequests" topicSlug="tao-lan-tt-chuan" />);
    expect(screen.getByRole("heading", { name: "Tạo lần thanh toán (TT) chuẩn" })).toBeInTheDocument();
    expect(screen.getByText(/khách đã chốt gói học/)).toBeInTheDocument();
  });

  it("renders a breadcrumb with the module label and topic title", () => {
    render(<HelpArticle moduleSlug="paymentRequests" topicSlug="tao-lan-tt-chuan" />);
    const breadcrumb = screen.getByRole("navigation", { name: "breadcrumb" });
    expect(breadcrumb).toHaveTextContent("Hướng dẫn sử dụng");
    expect(breadcrumb).toHaveTextContent("Quản lý thanh toán");
    expect(breadcrumb).toHaveTextContent("Tạo lần thanh toán (TT) chuẩn");
  });

  it("shows a friendly message instead of crashing for an unknown topic", () => {
    render(<HelpArticle moduleSlug="paymentRequests" topicSlug="does-not-exist" />);
    expect(screen.getByText("Chưa có bài viết")).toBeInTheDocument();
  });

  it("shows a friendly message for an unknown module", () => {
    render(<HelpArticle moduleSlug="does-not-exist" topicSlug="does-not-exist" />);
    expect(screen.getByText("Chưa có bài viết")).toBeInTheDocument();
  });
});
