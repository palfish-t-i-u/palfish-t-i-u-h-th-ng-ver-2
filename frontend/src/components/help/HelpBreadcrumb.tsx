// frontend/src/components/help/HelpBreadcrumb.tsx
import { getModuleLabel } from "../../content/help/moduleLabels";
import { useHelpNavOptional } from "../../contexts/HelpNavContext";

/**
 * Dòng "Hướng dẫn sử dụng › Module › Bài viết" ở đầu HelpArticle/HelpModuleIndex —
 * giúp người dùng nhận ra ngay là đã điều hướng đúng, đặc biệt khi bấm HdsdLink
 * từ 1 popup đang mở (không nhìn tiêu đề trang cũng vẫn thấy được thay đổi).
 * Segment "Module" bấm được để quay lại mục lục — KHÔNG khôi phục lại thao tác
 * dở trước đó, chỉ là điều hướng thuận trong chính hệ thống docs.
 *
 * Dùng useHelpNavOptional (không throw) — HelpArticle/HelpModuleIndex có unit
 * test dựng lại riêng lẻ không bọc HelpNavProvider. Không có ctx thì segment
 * module chỉ hiện chữ tĩnh, không bấm được, thay vì crash cả cây render.
 */
export default function HelpBreadcrumb({ moduleSlug, topicTitle }: { moduleSlug: string; topicTitle?: string }) {
  const ctx = useHelpNavOptional();

  return (
    <nav className="flex min-w-0 flex-wrap items-center gap-1 text-xs text-gmv-muted" aria-label="breadcrumb">
      <span>Hướng dẫn sử dụng</span>
      <span aria-hidden="true">›</span>
      {topicTitle && ctx ? (
        <button
          type="button"
          onClick={() => ctx.goToModuleIndex(moduleSlug)}
          className="text-gmv-primary hover:underline"
        >
          {getModuleLabel(moduleSlug)}
        </button>
      ) : (
        <span className="font-medium text-gmv-text">{getModuleLabel(moduleSlug)}</span>
      )}
      {topicTitle && (
        <>
          <span aria-hidden="true">›</span>
          <span className="min-w-0 truncate font-medium text-gmv-text">{topicTitle}</span>
        </>
      )}
    </nav>
  );
}
