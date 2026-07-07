import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import useIsMobile, { QUERY } from "./useIsMobile";

type ChangeListener = (e: { matches: boolean }) => void;

function stubMatchMedia(initialMatches: boolean) {
  const listeners = new Map<string, Set<ChangeListener>>();
  const mql = {
    matches: initialMatches,
    media: QUERY,
    addEventListener: vi.fn((type: string, cb: ChangeListener) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(cb);
    }),
    removeEventListener: vi.fn((type: string, cb: ChangeListener) => {
      listeners.get(type)?.delete(cb);
    }),
  };
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue(mql));
  return {
    mql,
    fire(matches: boolean) {
      mql.matches = matches;
      listeners.get("change")?.forEach((cb) => cb({ matches }));
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("useIsMobile", () => {
  it("trả về true khi viewport < 768px", () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it("trả về false khi viewport >= 768px", () => {
    stubMatchMedia(false);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it("cập nhật khi viewport đổi (xoay máy)", () => {
    const media = stubMatchMedia(false);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
    act(() => media.fire(true));
    expect(result.current).toBe(true);
  });

  it("không crash khi môi trường thiếu matchMedia (jsdom test cũ)", () => {
    vi.stubGlobal("matchMedia", undefined);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it("cleanup khi unmount — listener bị remove, không update state nữa", () => {
    const media = stubMatchMedia(false);
    const { result, unmount } = renderHook(() => useIsMobile());
    expect(media.mql.addEventListener).toHaveBeenCalledWith("change", expect.any(Function));
    unmount();
    expect(media.mql.removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
    act(() => media.fire(true));
    // State should remain false — listener was removed
    expect(result.current).toBe(false);
  });
});
