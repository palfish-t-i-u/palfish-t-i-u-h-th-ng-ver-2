// frontend/src/contexts/HelpNavContext.tsx
/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export type HelpNavContextValue = {
  /** Mục "Hướng dẫn sử dụng" ở sidebar có đang mở (hiện danh sách module) không. */
  helpSectionOpen: boolean;
  helpModule: string | null;
  helpTopic: string | null;
  /** Module nào đang expand để hiện danh sách submodule/topic của nó. */
  helpExpandedModuleId: string | null;
  /** Chỉ mở section + expand cây trong sidebar tới module này — KHÔNG đổi activeView. Dùng cho HdsdLink mode="module" ở header. */
  goToModule: (moduleSlug: string) => void;
  /** Đổi activeView sang "help" + hiện danh sách topic của module ở màn hình chính. Dùng khi browse TỪ TRONG trang Help (HelpLanding, mobile) — không có sidebar tree để mở. */
  goToModuleIndex: (moduleSlug: string) => void;
  /** Đổi activeView sang "help" + hiện đúng bài viết ở màn hình chính. */
  goToTopic: (moduleSlug: string, topicSlug: string) => void;
  toggleHelpSection: () => void;
  setHelpExpandedModuleId: (moduleSlug: string | null) => void;
};

const HelpNavContext = createContext<HelpNavContextValue | null>(null);

export function HelpNavProvider({
  children,
  onNavigateToHelp,
}: {
  children: ReactNode;
  /** Gọi khi goToTopic được kích hoạt — MainPage dùng để setActiveView("help"). */
  onNavigateToHelp?: () => void;
}) {
  const [helpSectionOpen, setHelpSectionOpen] = useState(false);
  const [helpModule, setHelpModule] = useState<string | null>(null);
  const [helpTopic, setHelpTopic] = useState<string | null>(null);
  const [helpExpandedModuleId, setHelpExpandedModuleId] = useState<string | null>(null);

  const toggleHelpSection = useCallback(() => {
    setHelpSectionOpen((prev) => !prev);
  }, []);

  const goToModule = useCallback((moduleSlug: string) => {
    setHelpSectionOpen(true);
    setHelpExpandedModuleId(moduleSlug);
  }, []);

  const goToModuleIndex = useCallback(
    (moduleSlug: string) => {
      setHelpSectionOpen(true);
      setHelpExpandedModuleId(moduleSlug);
      setHelpModule(moduleSlug);
      setHelpTopic(null);
      onNavigateToHelp?.();
    },
    [onNavigateToHelp]
  );

  const goToTopic = useCallback(
    (moduleSlug: string, topicSlug: string) => {
      setHelpSectionOpen(true);
      setHelpExpandedModuleId(moduleSlug);
      setHelpModule(moduleSlug);
      setHelpTopic(topicSlug);
      onNavigateToHelp?.();
    },
    [onNavigateToHelp]
  );

  const value = useMemo<HelpNavContextValue>(
    () => ({
      helpSectionOpen,
      helpModule,
      helpTopic,
      helpExpandedModuleId,
      goToModule,
      goToModuleIndex,
      goToTopic,
      toggleHelpSection,
      setHelpExpandedModuleId,
    }),
    [
      helpSectionOpen,
      helpModule,
      helpTopic,
      helpExpandedModuleId,
      goToModule,
      goToModuleIndex,
      goToTopic,
      toggleHelpSection,
    ]
  );

  return <HelpNavContext.Provider value={value}>{children}</HelpNavContext.Provider>;
}

export function useHelpNav(): HelpNavContextValue {
  const ctx = useContext(HelpNavContext);
  if (!ctx) throw new Error("useHelpNav must be used within HelpNavProvider");
  return ctx;
}

/**
 * Biến thể không throw — dùng cho component (vd. HdsdLink) gắn rải rác vào rất
 * nhiều modal/drawer nghiệp vụ, để không bắt buộc MỌI unit test dựng lại cây
 * component đó phải bọc thêm HelpNavProvider (cùng mô hình usePaymentFlowOptional).
 */
export function useHelpNavOptional(): HelpNavContextValue | null {
  return useContext(HelpNavContext);
}
