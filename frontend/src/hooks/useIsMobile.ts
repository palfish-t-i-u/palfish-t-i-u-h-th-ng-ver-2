import { useEffect, useState } from "react";

/** Khớp breakpoint `md` của Tailwind (768px). Dưới md = mobile. */
export const QUERY = "(max-width: 767px)";

function getMql(): MediaQueryList | null {
  // Defensive: jsdom trong các test cũ không stub matchMedia → coi như desktop
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(QUERY)
    : null;
}

export default function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() => getMql()?.matches ?? false);

  useEffect(() => {
    const mql = getMql();
    if (!mql) return;
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
