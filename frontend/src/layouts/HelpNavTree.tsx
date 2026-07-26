// frontend/src/layouts/HelpNavTree.tsx
// Nhánh render riêng cho mục "Hướng dẫn sử dụng" trong sidebar — cây 3 cấp
// (mục HDSD → module → submodule/topic). NavItem/NavChildItem trong AppShell.tsx
// chỉ hỗ trợ đúng 2 cấp (NavChildItem không có field children) nên KHÔNG tái
// dùng cơ chế expandedIds/NavButton chung — bọc riêng độc lập ở đây.
import { useEffect, useRef } from "react";
import { cn } from "../lib/cn";
import { listHelpModules } from "../content/help";
import { getModuleLabel } from "../content/help/moduleLabels";
import { useHelpNav } from "../contexts/HelpNavContext";
import type { NavItem } from "./AppShell";

export function HelpNavTree({
  it,
  activeId,
  collapsed,
}: {
  it: NavItem;
  activeId: string;
  collapsed?: boolean;
}) {
  const modules = listHelpModules();
  const {
    helpSectionOpen,
    helpModule,
    helpTopic,
    helpExpandedModuleId,
    goToModuleIndex,
    goToTopic,
    toggleHelpSection,
    setHelpExpandedModuleId,
  } = useHelpNav();
  const isActive = activeId === "help";

  // <nav> sidebar tự cuộn riêng (AppShell.tsx overflow-y-auto), mục "Hướng dẫn
  // sử dụng" luôn nằm CUỐI danh sách — bấm HdsdLink từ 1 module ở trên thì cây
  // vẫn expand đúng state, nhưng nếu sidebar đang cuộn ở chỗ khác, module/topic
  // vừa mở render ngoài khung nhìn, trông như "bấm không có gì xảy ra" (y hệt
  // vấn đề Đạt vừa fix cho <main>, nhưng ở sidebar — khác chỗ, chưa ai xử lý).
  // Gắn ref vào đúng 1 phần tử đang active (topic nếu có, không thì module đang
  // expand) rồi scrollIntoView mỗi khi state đổi.
  const activeItemRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!helpExpandedModuleId) return;
    activeItemRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [helpExpandedModuleId, helpModule, helpTopic]);

  if (collapsed) {
    // Sidebar thu gọn không có chỗ hiện cây lồng — điều hướng thẳng tới
    // danh sách topic của module đầu tiên (như cách các item khác nhảy
    // thẳng children[0] khi collapsed), thay vì chỉ set state ẩn vô hình.
    return (
      <button
        type="button"
        title={it.label}
        onClick={() => modules[0] && goToModuleIndex(modules[0].slug)}
        className={cn(
          "flex w-full items-center justify-center rounded-gmv-md p-2.5 transition",
          isActive ? "bg-gmv-primary-soft text-gmv-primary" : "text-gmv-text hover:bg-gmv-bg"
        )}
      >
        <span className={isActive ? "text-gmv-primary" : "text-gmv-muted"}>{it.icon}</span>
      </button>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={toggleHelpSection}
        className={cn(
          "flex w-full items-center gap-3 rounded-gmv-md px-3 py-2 text-sm font-medium transition",
          isActive ? "bg-gmv-primary-soft text-gmv-primary" : "text-gmv-text hover:bg-gmv-bg hover:text-gmv-text-strong"
        )}
      >
        <span className={isActive ? "text-gmv-primary" : "text-gmv-muted"}>{it.icon}</span>
        <span className="flex-1 text-left">{it.label}</span>
        <span className={cn("text-xs text-gmv-muted transition", helpSectionOpen && "rotate-90")}>›</span>
      </button>

      {helpSectionOpen && (
        <ul className="mb-1 ml-3 mt-0.5 space-y-0.5 border-l border-gmv-border pl-2">
          {modules.length === 0 && (
            <li className="px-2.5 py-2 text-xs text-gmv-muted">Chưa có hướng dẫn nào.</li>
          )}
          {modules.map((mod) => {
            const modExpanded = helpExpandedModuleId === mod.slug;
            const hasActiveTopicInModule =
              modExpanded && mod.topics.some((t) => helpModule === mod.slug && helpTopic === t.topicSlug);
            return (
              <li key={mod.slug}>
                <button
                  ref={modExpanded && !hasActiveTopicInModule ? activeItemRef : undefined}
                  type="button"
                  onClick={() => setHelpExpandedModuleId(modExpanded ? null : mod.slug)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-gmv-md px-2.5 py-2 text-left text-xs font-medium transition",
                    modExpanded ? "text-gmv-primary" : "text-gmv-text hover:bg-gmv-bg hover:text-gmv-text-strong"
                  )}
                >
                  <span>{getModuleLabel(mod.slug)}</span>
                  <span className={cn("text-[10px] text-gmv-muted transition", modExpanded && "rotate-90")}>›</span>
                </button>

                {modExpanded && (
                  <ul className="mb-1 ml-3 mt-0.5 space-y-0.5 border-l border-gmv-border pl-2">
                    {mod.topics.map((topic) => {
                      const topicActive = helpModule === mod.slug && helpTopic === topic.topicSlug;
                      return (
                        <li key={topic.topicSlug}>
                          <button
                            ref={topicActive ? activeItemRef : undefined}
                            type="button"
                            onClick={() => goToTopic(mod.slug, topic.topicSlug)}
                            className={cn(
                              "block w-full rounded-gmv-md px-2.5 py-1.5 text-left text-xs transition",
                              topicActive
                                ? "bg-gmv-primary-soft text-gmv-primary"
                                : "text-gmv-text hover:bg-gmv-bg hover:text-gmv-text-strong"
                            )}
                          >
                            {topic.title}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
