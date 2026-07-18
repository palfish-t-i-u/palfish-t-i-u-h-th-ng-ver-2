import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const handlers: Array<() => void> = [];
vi.mock("../lib/supabase", () => ({
  supabase: {
    channel: vi.fn(() => {
      const ch: Record<string, unknown> = {};
      ch.on = vi.fn((_t: string, _f: unknown, cb: () => void) => {
        handlers.push(cb);
        return ch;
      });
      ch.subscribe = vi.fn();
      return ch;
    }),
    removeChannel: vi.fn(),
  },
}));

import { useRealtimeTable } from "./useRealtimeTable";

let hidden = false;

function setHidden(next: boolean) {
  hidden = next;
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

function fireOneEvent() {
  act(() => {
    handlers[0]();
  });
}

describe("useRealtimeTable visibility gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handlers.length = 0;
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

  it("tab visible: event → debounce → onChange chạy (hành vi cũ giữ nguyên)", () => {
    const onChange = vi.fn();
    renderHook(() => useRealtimeTable(["payment_requests"], onChange));
    fireOneEvent();
    act(() => {
      vi.advanceTimersByTime(9_000);
    });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("tab ẩn: event KHÔNG gây onChange dù chờ lâu", () => {
    const onChange = vi.fn();
    renderHook(() => useRealtimeTable(["payment_requests"], onChange));
    setHidden(true);
    fireOneEvent();
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("nợ trong lúc ẩn → quay lại tab → trả đúng 1 lần (dù 5 event)", () => {
    const onChange = vi.fn();
    renderHook(() => useRealtimeTable(["payment_requests"], onChange));
    setHidden(true);
    for (let i = 0; i < 5; i++) {
      fireOneEvent();
      act(() => {
        vi.advanceTimersByTime(10_000);
      });
    }
    expect(onChange).not.toHaveBeenCalled();
    setHidden(false);
    act(() => {
      vi.advanceTimersByTime(9_000);
    });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("ẩn rồi quay lại mà KHÔNG có event → không refetch thừa", () => {
    const onChange = vi.fn();
    renderHook(() => useRealtimeTable(["payment_requests"], onChange));
    setHidden(true);
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    setHidden(false);
    act(() => {
      vi.advanceTimersByTime(9_000);
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("event đến lúc visible nhưng user ẩn tab TRƯỚC khi debounce nổ → vẫn ghi nợ", () => {
    const onChange = vi.fn();
    renderHook(() => useRealtimeTable(["payment_requests"], onChange));
    fireOneEvent();
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    setHidden(true);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(onChange).not.toHaveBeenCalled();
    setHidden(false);
    act(() => {
      vi.advanceTimersByTime(9_000);
    });
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
