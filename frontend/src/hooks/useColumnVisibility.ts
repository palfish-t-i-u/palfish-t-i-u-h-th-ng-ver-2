import { useCallback, useState } from "react";

// Cache module-level: sống khi component unmount (chuyển tab trong app),
// mất khi F5/đóng tab — đúng lifecycle "custom view tạm thời".
// CHỦ Ý không dùng sessionStorage: sessionStorage sống qua F5 (sai spec)
// và tạo rủi ro stale key giữa các lần deploy đổi cột.
const sessionCache = new Map<string, ReadonlySet<string>>();

/** Chỉ dùng trong test — reset cache giữa các test case. */
export function __resetColumnVisibilityCache(): void {
  sessionCache.clear();
}

export interface ColumnVisibilityApi {
  isVisible: (key: string) => boolean;
  toggle: (key: string) => void;
  showAll: () => void;
  hiddenCount: number;
  visibleCount: number;
}

export function useColumnVisibility(
  tableId: string,
  allKeys: readonly string[]
): ColumnVisibilityApi {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => {
    const cached = sessionCache.get(tableId);
    if (!cached) return new Set();
    // G5: prune key rác không còn trong allKeys khi init
    return new Set([...cached].filter((k) => allKeys.includes(k)));
  });

  const totalCount = allKeys.length;

  const toggle = useCallback(
    (key: string) => {
      setHidden((prev) => {
        const next = new Set(prev);
        if (next.has(key)) {
          // Đang ẩn → hiện lại
          next.delete(key);
        } else {
          // G2: không ẩn được cột cuối cùng
          if (totalCount - next.size <= 1) return prev;
          next.add(key);
        }
        sessionCache.set(tableId, next);
        return next;
      });
    },
    [tableId, totalCount]
  );

  const showAll = useCallback(() => {
    const next = new Set<string>();
    sessionCache.set(tableId, next);
    setHidden(next);
  }, [tableId]);

  const isVisible = useCallback((key: string) => !hidden.has(key), [hidden]);

  const hiddenCount = allKeys.filter((k) => hidden.has(k)).length;

  return {
    isVisible,
    toggle,
    showAll,
    hiddenCount,
    visibleCount: totalCount - hiddenCount,
  };
}
