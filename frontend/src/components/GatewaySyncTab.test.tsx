import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import GatewaySyncTab from "./GatewaySyncTab";

describe("GatewaySyncTab — hướng dẫn cài đặt", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("danh sách bước cài đặt có bước dán mã bí mật (Extension Secret)", () => {
    render(<GatewaySyncTab />);
    // Xuất hiện ở cả hướng dẫn 6 bước trên tab lẫn onboarding modal (modal tự mở lần đầu)
    expect(screen.getAllByText(/mã bí mật/i).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/Extension Secret/i).length).toBeGreaterThanOrEqual(2);
  });

  it("onboarding modal nói đúng số bước (6 bước, không còn 5)", () => {
    render(<GatewaySyncTab />);
    expect(screen.queryByText(/5 bước/)).toBeNull();
    expect(screen.getAllByText(/6 bước/).length).toBeGreaterThanOrEqual(1);
  });
});
