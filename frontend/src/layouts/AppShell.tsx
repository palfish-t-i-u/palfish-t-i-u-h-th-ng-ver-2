import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import Badge from "../components/ui/Badge";
import { cn } from "../lib/cn";

export interface NavChildItem {
  id: string;
  label: string;
  subtitle?: string;
}

export interface NavItem {
  id: string;
  label: string;
  icon: ReactNode;
  badge?: ReactNode;
  section?: string;
  children?: NavChildItem[];
}

interface Props {
  items: NavItem[];
  activeId: string;
  onSelect: (id: string) => void;
  onHover?: (id: string) => void;
  title: string;
  subtitle?: string;
  userEmail?: string;
  userRole?: string;
  isDevMode?: boolean;
  onSignOut?: () => void;
  wideContent?: boolean;
  autoCollapse?: boolean;
  children: ReactNode;
}

function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      className="group/tip relative"
      onMouseEnter={(e) => {
        const tip = e.currentTarget.querySelector<HTMLElement>("[data-tip]");
        if (!tip) return;
        const rect = e.currentTarget.getBoundingClientRect();
        tip.style.top = `${rect.top + rect.height / 2}px`;
        tip.style.left = `${rect.right + 8}px`;
      }}
    >
      {children}
      <div
        data-tip
        className="pointer-events-none fixed z-[9999] -translate-y-1/2 whitespace-nowrap rounded-gmv-md bg-gmv-text-strong px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-gmv-2 transition-opacity group-hover/tip:opacity-100"
      >
        {label}
      </div>
    </div>
  );
}

function NavButton({
  it,
  active,
  onSelect,
  onHover,
  compact,
  collapsed,
  expanded,
  onToggleExpand,
  childActive,
}: {
  it: NavItem;
  active: boolean;
  onSelect: (id: string) => void;
  onHover?: (id: string) => void;
  compact?: boolean;
  collapsed?: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
  childActive?: boolean;
}) {
  const hasChildren = Boolean(it.children?.length);
  const highlighted = active || childActive;

  const btn = (
    <button
      type="button"
      onMouseEnter={() => onHover?.(it.id)}
      onClick={() => {
        if (hasChildren && onToggleExpand && !collapsed) onToggleExpand();
        else if (hasChildren && collapsed) onSelect(it.children![0].id);
        else onSelect(it.id);
      }}
      className={cn(
        "flex w-full items-center font-medium transition",
        compact
          ? "min-h-[44px] flex-col gap-1 px-1 py-2 text-[10px]"
          : collapsed
            ? "justify-center rounded-gmv-md p-2.5"
            : "gap-3 rounded-gmv-md px-3 py-2 text-sm",
        highlighted
          ? "bg-gmv-primary-soft text-gmv-primary"
          : "text-gmv-text hover:bg-gmv-bg hover:text-gmv-text-strong"
      )}
    >
      <span className={highlighted ? "text-gmv-primary" : "text-gmv-muted"}>{it.icon}</span>
      {!compact && !collapsed && (
        <>
          <span className="flex-1 text-left">{it.label}</span>
          {hasChildren && (
            <span className={cn("text-xs text-gmv-muted transition", expanded && "rotate-90")}>›</span>
          )}
          {!hasChildren && it.badge}
        </>
      )}
      {compact && <span className="max-w-full truncate text-center leading-tight">{it.label.split(" ")[0]}</span>}
    </button>
  );

  if (collapsed) return <Tooltip label={it.label}>{btn}</Tooltip>;
  return btn;
}

export default function AppShell({
  items,
  activeId,
  onSelect,
  onHover,
  title,
  subtitle,
  userEmail,
  userRole,
  isDevMode,
  onSignOut,
  wideContent,
  autoCollapse,
  children,
}: Props) {
  const reportParentId = items.find((it) => it.children?.some((c) => c.id === activeId))?.id;
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set(reportParentId ? [reportParentId] : []));
  const [collapsed, setCollapsed] = useState(false);
  const userToggled = useRef(false);

  useEffect(() => {
    userToggled.current = false;
    setCollapsed(!!autoCollapse);
  }, [autoCollapse]);

  const toggleCollapse = useCallback(() => {
    userToggled.current = true;
    setCollapsed((prev) => !prev);
  }, []);

  useEffect(() => {
    if (reportParentId) {
      setExpandedIds((prev) => new Set(prev).add(reportParentId));
    }
  }, [reportParentId]);

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Khớp convention của BE/seed (Giang): VITE_APP_ENV=sandbox. Giữ VITE_SANDBOX để tương thích ngược.
  const isSandbox =
    import.meta.env.VITE_APP_ENV === "sandbox" || import.meta.env.VITE_SANDBOX === "true";

  return (
    <div className="flex min-h-screen w-full flex-col bg-gmv-bg font-sans text-gmv-text">
      {isSandbox && (
        <div className="z-50 bg-yellow-400 py-1 text-center text-xs font-bold text-yellow-900">
          ⚠️ SANDBOX — Dữ liệu test, không phải production
        </div>
      )}
    <div className="flex min-w-0 flex-1 bg-gmv-bg font-sans text-gmv-text">
      <aside
        className={cn(
          "sticky top-0 hidden max-h-screen shrink-0 flex-col border-r border-gmv-border bg-gmv-canvas transition-[width] duration-200 md:flex",
          collapsed ? "w-[60px]" : "w-60"
        )}
      >
        <div className={cn(
          "flex h-16 items-center border-b border-gmv-border",
          collapsed ? "justify-center px-2" : "gap-2 px-5"
        )}>
          <img
            src="/app-logo.png"
            alt="PalFish GMV"
            className="h-8 w-8 shrink-0 rounded-gmv-md object-cover"
          />
          {!collapsed && (
            <div className="min-w-0 flex-1 leading-tight">
              <div className="text-sm font-semibold text-gmv-text-strong">PalFish GMV</div>
              <div className="text-[11px] text-gmv-muted">Reconciliation</div>
            </div>
          )}
        </div>
        <nav className={cn(
          "flex-1 py-4",
          collapsed ? "overflow-y-auto overflow-x-hidden px-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" : "overflow-y-auto px-3"
        )}>
          <ul className="space-y-1">
            {items.map((it, idx) => {
              const active = it.id === activeId;
              const childActive = it.children?.some((c) => c.id === activeId) ?? false;
              const prevSection = idx > 0 ? items[idx - 1]?.section : undefined;
              const showSection = it.section && it.section !== prevSection;
              return (
                <li key={it.id}>
                  {showSection && !collapsed && (
                    <div className="mb-1 mt-3 px-3 text-[10px] font-semibold uppercase tracking-wide text-gmv-muted first:mt-0">
                      {it.section}
                    </div>
                  )}
                  {showSection && collapsed && (
                    <div className="mx-auto my-2 h-px w-6 bg-gmv-border" />
                  )}
                  <NavButton
                    it={it}
                    active={active}
                    onSelect={onSelect}
                    onHover={onHover}
                    collapsed={collapsed}
                    expanded={expandedIds.has(it.id)}
                    onToggleExpand={() => toggleExpand(it.id)}
                    childActive={childActive}
                  />
                  {!collapsed && it.children && expandedIds.has(it.id) && (
                    <ul className="mb-1 ml-3 mt-0.5 space-y-0.5 border-l border-gmv-border pl-2">
                      {it.children.map((child) => (
                        <li key={child.id}>
                          <button
                            type="button"
                            onMouseEnter={() => onHover?.(child.id)}
                            onClick={() => onSelect(child.id)}
                            className={cn(
                              "w-full rounded-gmv-md px-2.5 py-2 text-left transition",
                              child.id === activeId
                                ? "bg-gmv-primary-soft text-gmv-primary"
                                : "text-gmv-text hover:bg-gmv-bg hover:text-gmv-text-strong"
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
        <div className={cn("border-t border-gmv-border", collapsed ? "px-2.5 py-3" : "px-3 py-3")}>
          <button
            type="button"
            onClick={toggleCollapse}
            className={cn(
              "flex w-full items-center justify-center rounded-gmv-md border transition",
              collapsed
                ? "aspect-square border-gmv-border bg-gmv-bg text-gmv-primary hover:border-gmv-primary hover:bg-gmv-primary-soft"
                : "gap-2 border-gmv-border bg-gmv-bg px-3 py-2 text-gmv-muted hover:border-gmv-primary hover:bg-gmv-primary-soft hover:text-gmv-primary"
            )}
            title={collapsed ? "Mở rộng sidebar" : "Thu gọn sidebar"}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={cn("shrink-0 transition-transform", collapsed && "rotate-180")}>
              <polyline points="11 17 6 12 11 7" />
              <polyline points="18 17 13 12 18 7" />
            </svg>
            {!collapsed && <span className="text-[11px] font-medium">Thu gọn</span>}
          </button>
        </div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col pb-[72px] md:pb-0">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-gmv-border bg-gmv-canvas/95 px-4 shadow-gmv-1 backdrop-blur md:px-6">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-gmv-text-strong">{title}</h1>
            {subtitle && <p className="truncate text-xs text-gmv-muted">{subtitle}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2 md:gap-3">
            {isDevMode && (
              <Badge tone="warn" className="hidden sm:inline-flex">
                Dev Mode
              </Badge>
            )}
            {userRole && <Badge tone="neutral">{userRole}</Badge>}
            <span className="hidden text-xs text-gmv-muted sm:inline">{userEmail || "dev@local"}</span>
            {onSignOut && (
              <button
                type="button"
                onClick={onSignOut}
                className="min-h-[44px] rounded-gmv-md border border-gmv-border bg-gmv-canvas px-3 py-1.5 text-xs font-medium text-gmv-text-strong hover:bg-gmv-bg"
              >
                Đăng xuất
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-x-auto p-4 md:p-6">
          <div className={cn("mx-auto", wideContent ? "max-w-none" : "max-w-[1400px]")}>{children}</div>
        </main>
      </div>

      <nav
        className="fixed bottom-0 left-0 right-0 z-30 flex border-t border-gmv-border bg-gmv-canvas px-1 py-1 shadow-gmv-2 md:hidden"
        aria-label="Điều hướng chính"
      >
        {items.slice(0, 5).map((it) => (
          <div key={it.id} className="min-w-0 flex-1">
            <NavButton
              it={it}
              active={it.id === activeId || (it.children?.some((c) => c.id === activeId) ?? false)}
              onSelect={onSelect}
              onHover={onHover}
              compact
            />
          </div>
        ))}
      </nav>
    </div>
    </div>
  );
}
