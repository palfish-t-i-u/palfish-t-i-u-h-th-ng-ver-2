import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetColumnVisibilityCache,
  useColumnVisibility,
} from "./useColumnVisibility";

const KEYS = ["a", "b", "c"] as const;

describe("useColumnVisibility", () => {
  beforeEach(() => {
    __resetColumnVisibilityCache();
  });

  it("mặc định tất cả cột visible", () => {
    const { result } = renderHook(() => useColumnVisibility("t1", KEYS));
    expect(result.current.isVisible("a")).toBe(true);
    expect(result.current.visibleCount).toBe(3);
    expect(result.current.hiddenCount).toBe(0);
  });

  it("toggle ẩn rồi hiện lại cột", () => {
    const { result } = renderHook(() => useColumnVisibility("t1", KEYS));
    act(() => result.current.toggle("b"));
    expect(result.current.isVisible("b")).toBe(false);
    expect(result.current.visibleCount).toBe(2);
    act(() => result.current.toggle("b"));
    expect(result.current.isVisible("b")).toBe(true);
    expect(result.current.visibleCount).toBe(3);
  });

  it("guard: không ẩn được cột cuối cùng", () => {
    const { result } = renderHook(() => useColumnVisibility("t1", KEYS));
    act(() => result.current.toggle("a"));
    act(() => result.current.toggle("b"));
    act(() => result.current.toggle("c")); // phải no-op
    expect(result.current.isVisible("c")).toBe(true);
    expect(result.current.visibleCount).toBe(1);
  });

  it("giữ state qua unmount + remount (chuyển tab trong app)", () => {
    const first = renderHook(() => useColumnVisibility("t1", KEYS));
    act(() => first.result.current.toggle("b"));
    first.unmount();
    const second = renderHook(() => useColumnVisibility("t1", KEYS));
    expect(second.result.current.isVisible("b")).toBe(false);
  });

  it("showAll reset về full", () => {
    const { result } = renderHook(() => useColumnVisibility("t1", KEYS));
    act(() => result.current.toggle("a"));
    act(() => result.current.toggle("b"));
    act(() => result.current.showAll());
    expect(result.current.visibleCount).toBe(3);
  });

  it("hai tableId độc lập nhau", () => {
    const t1 = renderHook(() => useColumnVisibility("t1", KEYS));
    const t2 = renderHook(() => useColumnVisibility("t2", KEYS));
    act(() => t1.result.current.toggle("a"));
    expect(t2.result.current.isVisible("a")).toBe(true);
  });

  it("prune key rác không còn trong allKeys khi init", () => {
    const first = renderHook(() =>
      useColumnVisibility("t1", ["a", "b", "c", "old"])
    );
    act(() => first.result.current.toggle("old"));
    first.unmount();
    const second = renderHook(() => useColumnVisibility("t1", KEYS)); // "old" biến mất
    expect(second.result.current.hiddenCount).toBe(0);
    expect(second.result.current.visibleCount).toBe(3);
  });

  it("defaultHidden ẩn cột đúng lần đầu (chưa có cache)", () => {
    const { result } = renderHook(() =>
      useColumnVisibility("t1", KEYS, ["c"])
    );
    expect(result.current.isVisible("c")).toBe(false);
    expect(result.current.isVisible("a")).toBe(true);
    expect(result.current.visibleCount).toBe(2);
  });

  it("defaultHidden bỏ qua key không có trong allKeys", () => {
    const { result } = renderHook(() =>
      useColumnVisibility("t1", KEYS, ["c", "khong-ton-tai"])
    );
    expect(result.current.hiddenCount).toBe(1);
    expect(result.current.isVisible("c")).toBe(false);
  });

  it("khi đã có lựa chọn (cache) thì KHÔNG áp lại defaultHidden", () => {
    const first = renderHook(() => useColumnVisibility("t1", KEYS, ["c"]));
    act(() => first.result.current.toggle("c")); // user tự hiện lại "c" → cache
    first.unmount();
    const second = renderHook(() => useColumnVisibility("t1", KEYS, ["c"]));
    expect(second.result.current.isVisible("c")).toBe(true); // tôn trọng lựa chọn, không ẩn lại
  });
});
