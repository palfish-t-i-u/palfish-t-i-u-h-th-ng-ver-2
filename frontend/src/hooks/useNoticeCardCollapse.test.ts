import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useNoticeCardCollapse } from "./useNoticeCardCollapse";

const KEY = "activation.noticeCards.v1";

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("useNoticeCardCollapse", () => {
  it("1. mặc định: mọi card thu gọn, allCollapsed=true", () => {
    const { result } = renderHook(() => useNoticeCardCollapse());
    expect(result.current.isCollapsed("AR-1::CC-1")).toBe(true);
    expect(result.current.allCollapsed).toBe(true);
  });

  it("2. toggle 1 card → card đó mở, card khác vẫn thu gọn", () => {
    const { result } = renderHook(() => useNoticeCardCollapse());
    act(() => result.current.toggle("AR-1::CC-1"));
    expect(result.current.isCollapsed("AR-1::CC-1")).toBe(false);
    expect(result.current.isCollapsed("AR-1::CC-2")).toBe(true);
  });

  it("3. toggle lần 2 về default → override bị xóa", () => {
    const { result } = renderHook(() => useNoticeCardCollapse());
    act(() => result.current.toggle("AR-1::CC-1"));
    act(() => result.current.toggle("AR-1::CC-1"));
    const saved = JSON.parse(localStorage.getItem(KEY) || "{}");
    expect(saved.overrides).toEqual({});
    expect(result.current.isCollapsed("AR-1::CC-1")).toBe(true);
  });

  it("4. expandAll → defaultCollapsed=false, mọi card mở", () => {
    const { result } = renderHook(() => useNoticeCardCollapse());
    act(() => result.current.expandAll());
    expect(result.current.allCollapsed).toBe(false);
    expect(result.current.isCollapsed("AR-9::CC-9")).toBe(false);
  });

  it("5. có overrides sẵn + expandAll → mọi card mở, overrides={}", () => {
    const { result } = renderHook(() => useNoticeCardCollapse());
    act(() => result.current.toggle("AR-1::CC-1"));
    act(() => result.current.expandAll());
    expect(result.current.isCollapsed("AR-1::CC-1")).toBe(false);
    const saved = JSON.parse(localStorage.getItem(KEY) || "{}");
    expect(saved.overrides).toEqual({});
  });

  it("6. persist: mount hook mới đọc lại localStorage", () => {
    const first = renderHook(() => useNoticeCardCollapse());
    act(() => first.result.current.toggle("AR-1::CC-1"));
    const second = renderHook(() => useNoticeCardCollapse());
    expect(second.result.current.isCollapsed("AR-1::CC-1")).toBe(false);
  });

  it("7. G1: setItem ném lỗi → không throw, state đổi in-memory", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceeded");
    });
    const { result } = renderHook(() => useNoticeCardCollapse());
    expect(() => act(() => result.current.toggle("AR-1::CC-1"))).not.toThrow();
    expect(result.current.isCollapsed("AR-1::CC-1")).toBe(false);
  });

  it("8. G2: JSON hỏng → về default", () => {
    localStorage.setItem(KEY, "{not json");
    const { result } = renderHook(() => useNoticeCardCollapse());
    expect(result.current.allCollapsed).toBe(true);
    expect(result.current.isCollapsed("x")).toBe(true);
  });

  it("8b. G2: sai kiểu field → về default an toàn", () => {
    localStorage.setItem(KEY, JSON.stringify({ defaultCollapsed: "yes", overrides: 5 }));
    const { result } = renderHook(() => useNoticeCardCollapse());
    expect(result.current.allCollapsed).toBe(true);
  });

  it("9. G4: hai toggle liên tiếp trong 1 act → về đầu, override sạch", () => {
    const { result } = renderHook(() => useNoticeCardCollapse());
    act(() => {
      result.current.toggle("AR-1::CC-1");
      result.current.toggle("AR-1::CC-1");
    });
    expect(result.current.isCollapsed("AR-1::CC-1")).toBe(true);
    const saved = JSON.parse(localStorage.getItem(KEY) || "{}");
    expect(saved.overrides).toEqual({});
  });

  it("10. G5: 2 cardKey độc lập", () => {
    const { result } = renderHook(() => useNoticeCardCollapse());
    act(() => result.current.toggle("AR-1::idx0"));
    expect(result.current.isCollapsed("AR-1::idx0")).toBe(false);
    expect(result.current.isCollapsed("AR-1::idx1")).toBe(true);
  });

  it("11. G6: >300 override key → reset về {}", () => {
    const overrides: Record<string, boolean> = {};
    for (let i = 0; i < 301; i++) overrides[`AR::${i}`] = false;
    localStorage.setItem(KEY, JSON.stringify({ defaultCollapsed: true, overrides }));
    const { result } = renderHook(() => useNoticeCardCollapse());
    expect(result.current.isCollapsed("AR::0")).toBe(true);
  });

  it("12. G7: StorageEvent từ tab khác → state cập nhật", () => {
    const { result } = renderHook(() => useNoticeCardCollapse());
    expect(result.current.allCollapsed).toBe(true);
    act(() => {
      localStorage.setItem(KEY, JSON.stringify({ defaultCollapsed: false, overrides: {} }));
      window.dispatchEvent(new StorageEvent("storage", { key: KEY }));
    });
    expect(result.current.allCollapsed).toBe(false);
  });
});
