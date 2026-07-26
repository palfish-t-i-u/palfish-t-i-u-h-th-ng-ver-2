import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { HelpNavProvider, useHelpNav } from "./HelpNavContext";

function wrapper(onNavigateToHelp?: () => void) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <HelpNavProvider onNavigateToHelp={onNavigateToHelp}>{children}</HelpNavProvider>;
  };
}

describe("HelpNavContext", () => {
  it("useHelpNav throws when used outside HelpNavProvider", () => {
    expect(() => renderHook(() => useHelpNav())).toThrow(/HelpNavProvider/);
  });

  it("goToModule only expands the sidebar tree — does not call onNavigateToHelp", () => {
    const onNavigateToHelp = vi.fn();
    const { result } = renderHook(() => useHelpNav(), { wrapper: wrapper(onNavigateToHelp) });

    act(() => result.current.goToModule("paymentRequests"));

    expect(result.current.helpSectionOpen).toBe(true);
    expect(result.current.helpExpandedModuleId).toBe("paymentRequests");
    expect(result.current.helpModule).toBeNull();
    expect(result.current.helpTopic).toBeNull();
    expect(onNavigateToHelp).not.toHaveBeenCalled();
  });

  it("goToTopic sets module+topic and calls onNavigateToHelp", () => {
    const onNavigateToHelp = vi.fn();
    const { result } = renderHook(() => useHelpNav(), { wrapper: wrapper(onNavigateToHelp) });

    act(() => result.current.goToTopic("paymentRequests", "tao-lan-tt-chuan"));

    expect(result.current.helpSectionOpen).toBe(true);
    expect(result.current.helpExpandedModuleId).toBe("paymentRequests");
    expect(result.current.helpModule).toBe("paymentRequests");
    expect(result.current.helpTopic).toBe("tao-lan-tt-chuan");
    expect(onNavigateToHelp).toHaveBeenCalledTimes(1);
  });

  it("goToModuleIndex sets module (no topic) and calls onNavigateToHelp", () => {
    const onNavigateToHelp = vi.fn();
    const { result } = renderHook(() => useHelpNav(), { wrapper: wrapper(onNavigateToHelp) });

    act(() => result.current.goToModuleIndex("reconciliation"));

    expect(result.current.helpModule).toBe("reconciliation");
    expect(result.current.helpTopic).toBeNull();
    expect(onNavigateToHelp).toHaveBeenCalledTimes(1);
  });

  it("toggleHelpSection flips helpSectionOpen", () => {
    const { result } = renderHook(() => useHelpNav(), { wrapper: wrapper() });

    expect(result.current.helpSectionOpen).toBe(false);
    act(() => result.current.toggleHelpSection());
    expect(result.current.helpSectionOpen).toBe(true);
    act(() => result.current.toggleHelpSection());
    expect(result.current.helpSectionOpen).toBe(false);
  });

  it("setHelpExpandedModuleId lets the tree toggle a module row directly", () => {
    const { result } = renderHook(() => useHelpNav(), { wrapper: wrapper() });

    act(() => result.current.setHelpExpandedModuleId("bc03"));
    expect(result.current.helpExpandedModuleId).toBe("bc03");

    act(() => result.current.setHelpExpandedModuleId(null));
    expect(result.current.helpExpandedModuleId).toBeNull();
  });
});
