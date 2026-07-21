import { vi } from "vitest";

/**
 * Stub `window.matchMedia` cho jsdom (không có sẵn) — dùng trong test cần
 * `useIsMobile()` trả `true`. Mirror pattern trong `hooks/useIsMobile.test.ts`.
 *
 * Gọi trong `beforeEach`; BẮT BUỘC gọi `restoreMatchMedia()` trong `afterEach`
 * kẻo `isMobile=true` rò rỉ sang các suite desktop khác (vi.stubGlobal áp cho
 * cả module scope nếu không unstub).
 */
export function stubMobile(matches = true) {
  const listeners = new Map<string, Set<(e: { matches: boolean }) => void>>();
  const mql = {
    matches,
    media: "(max-width: 767px)",
    addEventListener: vi.fn((type: string, cb: (e: { matches: boolean }) => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(cb);
    }),
    removeEventListener: vi.fn((type: string, cb: (e: { matches: boolean }) => void) => {
      listeners.get(type)?.delete(cb);
    }),
  };
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue(mql));
  return mql;
}

export function restoreMatchMedia() {
  vi.unstubAllGlobals();
}
