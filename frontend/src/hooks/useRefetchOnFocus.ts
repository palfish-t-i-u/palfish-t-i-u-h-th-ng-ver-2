import { useEffect, useRef } from "react";

const DEFAULT_COOLDOWN_MS = 30_000;

/**
 * Gọi `refetch` khi người dùng quay lại tab sau ≥ cooldownMs ẩn.
 * Dùng silent refetch — không gây unmount hay loading spinner.
 */
export function useRefetchOnFocus(
  refetch: () => void,
  cooldownMs = DEFAULT_COOLDOWN_MS,
) {
  const hiddenAtRef = useRef<number | null>(null);

  useEffect(() => {
    function onVisibilityChange() {
      if (document.hidden) {
        hiddenAtRef.current = Date.now();
      } else {
        const hiddenAt = hiddenAtRef.current;
        hiddenAtRef.current = null;
        if (hiddenAt && Date.now() - hiddenAt >= cooldownMs) {
          refetch();
        }
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [refetch, cooldownMs]);
}
