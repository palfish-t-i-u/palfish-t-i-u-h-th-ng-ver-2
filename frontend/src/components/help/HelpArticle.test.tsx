import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import HelpArticle from "./HelpArticle";

function renderArticle(moduleSlug: string, topicSlug: string) {
  return render(
    <MemoryRouter>
      <HelpArticle moduleSlug={moduleSlug} topicSlug={topicSlug} />
    </MemoryRouter>
  );
}

describe("HelpArticle", () => {
  it("renders the pilot topic's title and body content", () => {
    renderArticle("paymentRequests", "quan-ly-lan-thanh-toan");
    expect(screen.getByRole("heading", { name: "Cách tạo và quản lý lần TT (mọi trường hợp)" })).toBeInTheDocument();
    expect(screen.getByText(/cần tạo một lần thanh toán/)).toBeInTheDocument();
  });

  it("renders a breadcrumb with the module label and topic title", () => {
    renderArticle("paymentRequests", "quan-ly-lan-thanh-toan");
    const breadcrumb = screen.getByRole("navigation", { name: "breadcrumb" });
    expect(breadcrumb).toHaveTextContent("Hướng dẫn sử dụng");
    expect(breadcrumb).toHaveTextContent("Quản lý thanh toán");
    expect(breadcrumb).toHaveTextContent("Cách tạo và quản lý lần TT (mọi trường hợp)");
  });

  it("shows a friendly message instead of crashing for an unknown topic", () => {
    renderArticle("paymentRequests", "does-not-exist");
    expect(screen.getByText("Chưa có bài viết")).toBeInTheDocument();
  });

  it("shows a friendly message for an unknown module", () => {
    renderArticle("does-not-exist", "does-not-exist");
    expect(screen.getByText("Chưa có bài viết")).toBeInTheDocument();
  });
});
