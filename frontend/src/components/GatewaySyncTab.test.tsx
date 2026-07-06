import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GatewaySyncTab from "./GatewaySyncTab";

// /ext-version.json do scripts/build_extension_zip.py sinh cùng lúc với zip.
// null = giả lập không tải được file (offline / thiếu file) — component phải im lặng.
function stubLatestVersion(version: string | null) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(() =>
      version === null
        ? Promise.reject(new Error("network fail"))
        : Promise.resolve({ ok: true, json: () => Promise.resolve({ version }) }),
    ),
  );
}

beforeEach(() => {
  localStorage.clear();
  stubLatestVersion(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GatewaySyncTab — hướng dẫn cài đặt", () => {
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

describe("GatewaySyncTab — đối chiếu phiên bản tiện ích", () => {
  beforeEach(() => {
    localStorage.setItem("gw_ext_installed", "1");
  });

  it("bản cài cũ hơn bản mới nhất → cảnh báo cần cập nhật kèm 2 số phiên bản", async () => {
    localStorage.setItem("gw_ext_version", "1.2.3");
    stubLatestVersion("9.9.9");
    render(<GatewaySyncTab />);
    expect(await screen.findByText(/Cần cập nhật tiện ích/i)).toBeTruthy();
    expect(screen.getByText("1.2.3")).toBeTruthy();
    expect(screen.getByText("9.9.9")).toBeTruthy();
  });

  it("bản cài trùng bản mới nhất → hiện phiên bản, KHÔNG cảnh báo", async () => {
    localStorage.setItem("gw_ext_version", "9.9.9");
    stubLatestVersion("9.9.9");
    render(<GatewaySyncTab />);
    expect(await screen.findByText(/Phiên bản tiện ích/i)).toBeTruthy();
    expect(screen.queryByText(/Cần cập nhật tiện ích/i)).toBeNull();
  });

  it("không tải được file version → không cảnh báo sai, không crash", async () => {
    localStorage.setItem("gw_ext_version", "1.2.3");
    render(<GatewaySyncTab />);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText(/Cần cập nhật tiện ích/i)).toBeNull();
  });
});
