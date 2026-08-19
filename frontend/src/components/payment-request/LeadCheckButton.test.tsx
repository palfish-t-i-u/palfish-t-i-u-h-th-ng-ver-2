import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import LeadCheckButton from "./LeadCheckButton";

describe("LeadCheckButton", () => {
  it("renders button with aria-label", () => {
    render(<LeadCheckButton onClick={() => {}} />);
    expect(screen.getByRole("button", { name: "Tra cứu lead trên hệ thống" })).toBeTruthy();
  });

  it("uses custom tooltip as aria-label", () => {
    render(<LeadCheckButton onClick={() => {}} tooltip="Tooltip khác" />);
    expect(screen.getByRole("button", { name: "Tooltip khác" })).toBeTruthy();
  });

  it("type=button (không submit form)", () => {
    render(<LeadCheckButton onClick={() => {}} />);
    expect(screen.getByRole("button").getAttribute("type")).toBe("button");
  });

  it("gọi onClick khi click và không disabled", () => {
    const onClick = vi.fn();
    render(<LeadCheckButton onClick={onClick} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("disabled=true → button bị disable, không gọi onClick", () => {
    const onClick = vi.fn();
    render(<LeadCheckButton onClick={onClick} disabled />);
    const btn = screen.getByRole("button");
    expect(btn).toHaveProperty("disabled", true);
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("loading=true → button bị disable", () => {
    render(<LeadCheckButton onClick={() => {}} loading />);
    expect(screen.getByRole("button")).toHaveProperty("disabled", true);
  });
});
