import { useState } from "react";
import { cn } from "../lib/cn";
import type { NavItem } from "./AppShell";

interface Props {
  open: boolean;
  onClose: () => void;
  items: NavItem[];
  activeId: string;
  onSelect: (id: string) => void;
}

/** Sheet toàn màn hình cho mobile: liệt kê đủ module theo section. Chỉ render < md. */
export default function MobileNavSheet({ open, onClose, items, activeId, onSelect }: Props) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    const parent = items.find((it) => it.children?.some((c) => c.id === activeId));
    return new Set(parent ? [parent.id] : []);
  });

  if (!open) return null;

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function pick(id: string) {
    onSelect(id);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 md:hidden" onClick={onClose} role="presentation">
      <div
        className="absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col rounded-t-gmv-lg bg-gmv-canvas shadow-gmv-2"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Tất cả chức năng"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gmv-border px-4 py-2">
          <span className="text-sm font-semibold text-gmv-text-strong">Tất cả chức năng</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-gmv-md text-gmv-muted hover:bg-gmv-bg"
          >
            ✕
          </button>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-2 pb-[max(env(safe-area-inset-bottom),12px)]">
          <ul className="space-y-0.5">
            {items.map((it, idx) => {
              const prevSection = idx > 0 ? items[idx - 1]?.section : undefined;
              const showSection = it.section && it.section !== prevSection;
              const hasChildren = Boolean(it.children?.length);
              const highlighted =
                it.id === activeId || (it.children?.some((c) => c.id === activeId) ?? false);
              return (
                <li key={it.id}>
                  {showSection && (
                    <div className="mb-1 mt-3 px-3 text-[10px] font-semibold uppercase tracking-wide text-gmv-muted first:mt-0">
                      {it.section}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => (hasChildren ? toggleExpand(it.id) : pick(it.id))}
                    className={cn(
                      "flex min-h-[44px] w-full items-center gap-3 rounded-gmv-md px-3 py-2 text-sm font-medium transition",
                      highlighted
                        ? "bg-gmv-primary-soft text-gmv-primary"
                        : "text-gmv-text hover:bg-gmv-bg"
                    )}
                  >
                    <span className={highlighted ? "text-gmv-primary" : "text-gmv-muted"}>{it.icon}</span>
                    <span className="flex-1 text-left">{it.label}</span>
                    {hasChildren && (
                      <span
                        className={cn(
                          "text-xs text-gmv-muted transition",
                          expandedIds.has(it.id) && "rotate-90"
                        )}
                      >
                        ›
                      </span>
                    )}
                  </button>
                  {hasChildren && expandedIds.has(it.id) && (
                    <ul className="mb-1 ml-4 mt-0.5 space-y-0.5 border-l border-gmv-border pl-2">
                      {it.children!.map((child) => (
                        <li key={child.id}>
                          <button
                            type="button"
                            onClick={() => pick(child.id)}
                            className={cn(
                              "min-h-[44px] w-full rounded-gmv-md px-2.5 py-2 text-left transition",
                              child.id === activeId
                                ? "bg-gmv-primary-soft text-gmv-primary"
                                : "text-gmv-text hover:bg-gmv-bg"
                            )}
                          >
                            <span className="block text-xs font-medium">{child.label}</span>
                            {child.subtitle && (
                              <span className="mt-0.5 block text-[10px] leading-snug text-gmv-muted">
                                {child.subtitle}
                              </span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </div>
  );
}
