import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useVisiblePoll } from "./useVisiblePoll";

let hidden = false;

function setHidden(next: boolean) {
  hidden = next;
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

describe("useVisiblePoll", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hidden = false;
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => hidden,
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("visible: tick chạy theo chu kỳ", () => {
    const cb = vi.fn();
    renderHook(() => useVisiblePoll(cb, 30_000));
    act(() => {
      vi.advanceTimersByTime(90_000);
    });
    expect(cb).toHaveBeenCalledTimes(3);
  });

  it("tab ẩn: tick bị nuốt, không gọi API", () => {
    const cb = vi.fn();
    renderHook(() => useVisiblePoll(cb, 30_000));
    setHidden(true);
    act(() => {
      vi.advanceTimersByTime(300_000);
    });
    expect(cb).not.toHaveBeenCalled();
  });

  it("quay lại tab sau khi nuốt tick → chạy bù đúng 1 lần ngay", () => {
    const cb = vi.fn();
    renderHook(() => useVisiblePoll(cb, 30_000));
    setHidden(true);
    act(() => {
      vi.advanceTimersByTime(300_000);
    });
    setHidden(false);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("ẩn rồi quay lại TRƯỚC tick đầu → không chạy bù", () => {
    const cb = vi.fn();
    renderHook(() => useVisiblePoll(cb, 30_000));
    setHidden(true);
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    setHidden(false);
    expect(cb).not.toHaveBeenCalled();
  });

  it("enabled=false: không đặt interval", () => {
    const cb = vi.fn();
    renderHook(() => useVisiblePoll(cb, 30_000, false));
    act(() => {
      vi.advanceTimersByTime(120_000);
    });
    expect(cb).not.toHaveBeenCalled();
  });
});
