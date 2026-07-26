import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import HelpArticle from "./HelpArticle";

describe("HelpArticle", () => {
  it("renders the pilot topic's title and body content", () => {
    render(<HelpArticle moduleSlug="paymentRequests" topicSlug="tao-lan-tt-chuan" />);
    expect(screen.getByText("Tạo lần thanh toán (TT) chuẩn")).toBeInTheDocument();
    expect(screen.getByText(/Điền đúng UID/)).toBeInTheDocument();
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
