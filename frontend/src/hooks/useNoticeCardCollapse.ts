import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "activation.noticeCards.v1";
const MAX_OVERRIDES = 300; // G6: chống rò rỉ key rác của gói đã invoiced/xóa

export type NoticeCollapseState = {
  defaultCollapsed: boolean;
  overrides: Record<string, boolean>;
};

const DEFAULT_STATE: NoticeCollapseState = { defaultCollapsed: true, overrides: {} };

function hasWindow(): boolean {
  return typeof window !== "undefined"; // G3
}

/** G2 + G6: validate shape, ép kiểu, soft-cap overrides. */
function sanitize(raw: unknown): NoticeCollapseState {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_STATE, overrides: {} };
  const obj = raw as Record<string, unknown>;
  const defaultCollapsed = typeof obj.defaultCollapsed === "boolean" ? obj.defaultCollapsed : true;
  let overrides: Record<string, boolean> = {};
  if (obj.overrides && typeof obj.overrides === "object") {
    for (const [k, v] of Object.entries(obj.overrides as Record<string, unknown>)) {
      if (typeof v === "boolean") overrides[k] = v;
    }
  }
  if (Object.keys(overrides).length > MAX_OVERRIDES) overrides = {};
  return { defaultCollapsed, overrides };
}

function readState(): NoticeCollapseState {
  if (!hasWindow()) return { ...DEFAULT_STATE, overrides: {} };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE, overrides: {} };
    return sanitize(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_STATE, overrides: {} }; // G1/G2
  }
}

function writeState(state: NoticeCollapseState): void {
  if (!hasWindow()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* G1: localStorage không dùng được — state sống in-memory */
  }
}

export type UseNoticeCardCollapse = {
  isCollapsed: (cardKey: string) => boolean;
  toggle: (cardKey: string) => void;
  collapseAll: () => void;
  expandAll: () => void;
  allCollapsed: boolean;
};

export function useNoticeCardCollapse(): UseNoticeCardCollapse {
  const [state, setState] = useState<NoticeCollapseState>(readState);

  // Persist mỗi khi state đổi (write có guard G1).
  useEffect(() => {
    writeState(state);
  }, [state]);

  // G7: đồng bộ đa tab.
  useEffect(() => {
    if (!hasWindow()) return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      setState(readState());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const isCollapsed = useCallback(
    (cardKey: string) => state.overrides[cardKey] ?? state.defaultCollapsed,
    [state]
  );

  // G4: luôn dùng functional updater.
  const toggle = useCallback((cardKey: string) => {
    setState((prev) => {
      const current = prev.overrides[cardKey] ?? prev.defaultCollapsed;
      const next = !current;
      const overrides = { ...prev.overrides };
      if (next === prev.defaultCollapsed) {
        delete overrides[cardKey]; // trùng default → dọn
      } else {
        overrides[cardKey] = next;
      }
      return { ...prev, overrides };
    });
  }, []);

  const collapseAll = useCallback(() => {
    setState({ defaultCollapsed: true, overrides: {} });
  }, []);

  const expandAll = useCallback(() => {
    setState({ defaultCollapsed: false, overrides: {} });
  }, []);

  return { isCollapsed, toggle, collapseAll, expandAll, allCollapsed: state.defaultCollapsed };
}
