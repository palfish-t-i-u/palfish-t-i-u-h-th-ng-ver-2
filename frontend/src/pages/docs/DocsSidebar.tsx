// frontend/src/pages/docs/DocsSidebar.tsx
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { listHelpModules } from "../../content/help";
import { getModuleLabel, groupHelpModules } from "../../content/help/moduleLabels";
import { cn } from "../../lib/cn";

export default function DocsSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const modules = listHelpModules();
  // DocsSidebar sống NGOÀI cây <Routes> lồng bên trong DocsLayout (nó là 1
  // sibling của <Outlet>/<Routes>, không phải con của route ":moduleSlug"),
  // nên useParams() ở đây không thấy được params — React Router chỉ merge
  // params XUỐNG theo nhánh route đã khớp, không đưa NGƯỢC lên sibling. Parse
  // thẳng từ location.pathname thay vì dựa vào useParams().
  const location = useLocation();
  const segments = location.pathname.replace(/^\/docs\/?/, "").split("/").filter(Boolean);
  const moduleSlug = segments[0];
  const topicSlug = segments[1];
  const [expandedModule, setExpandedModule] = useState<string | null>(moduleSlug ?? null);

  // URL đổi (mở từ HdsdLink ở tab mới, hoặc back/forward) → tự expand đúng
  // module đang xem, không cần bấm lại.
  useEffect(() => {
    if (moduleSlug) setExpandedModule(moduleSlug);
  }, [moduleSlug]);

  return (
    <nav className="flex h-full w-64 shrink-0 flex-col overflow-y-auto border-r border-gmv-border bg-gmv-canvas p-3">
      <Link
        to="/docs"
        onClick={onNavigate}
        className="mb-3 block px-1 text-sm font-semibold text-gmv-text-strong hover:text-gmv-primary"
      >
        Hướng dẫn sử dụng
      </Link>
      {groupHelpModules(modules).map((group) => (
        <div key={group.label}>
          <div className="mb-1 mt-3 px-3 text-[10px] font-semibold uppercase tracking-wide text-gmv-muted first:mt-0">
            {group.label}
          </div>
          <ul className="space-y-0.5">
            {group.modules.map((mod) => {
              const isExpanded = expandedModule === mod.slug;
              return (
                <li key={mod.slug}>
                  <button
                    type="button"
                    onClick={() => setExpandedModule(isExpanded ? null : mod.slug)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-gmv-md px-2.5 py-2 text-left text-xs font-medium transition",
                      moduleSlug === mod.slug ? "text-gmv-primary" : "text-gmv-text hover:bg-gmv-bg hover:text-gmv-text-strong"
                    )}
                  >
                    <span>{getModuleLabel(mod.slug)}</span>
                    <span className={cn("text-[10px] text-gmv-muted transition", isExpanded && "rotate-90")}>›</span>
                  </button>
                  {isExpanded && (
                    <ul className="mb-1 ml-3 mt-0.5 space-y-0.5 border-l border-gmv-border pl-2">
                      {mod.topics.length === 0 && (
                        <li className="px-2.5 py-1.5 text-xs text-gmv-muted">Chưa có bài viết.</li>
                      )}
                      {mod.topics.map((topic) => {
                        const active = moduleSlug === mod.slug && topicSlug === topic.topicSlug;
                        return (
                          <li key={topic.topicSlug}>
                            <Link
                              to={`/docs/${mod.slug}/${topic.topicSlug}`}
                              onClick={onNavigate}
                              className={cn(
                                "block w-full rounded-gmv-md px-2.5 py-1.5 text-left text-xs transition",
                                active
                                  ? "bg-gmv-primary-soft text-gmv-primary"
                                  : "text-gmv-text hover:bg-gmv-bg hover:text-gmv-text-strong"
                              )}
                            >
                              {topic.title}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
