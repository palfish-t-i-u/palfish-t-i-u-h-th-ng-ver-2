// frontend/src/components/help/HelpBreadcrumb.tsx
import { Link } from "react-router-dom";
import { getModuleLabel } from "../../content/help/moduleLabels";

/**
 * Dòng "Hướng dẫn sử dụng › Module › Bài viết" ở đầu HelpArticle/HelpModuleIndex —
 * giúp người dùng nhận ra ngay là đã điều hướng đúng, đặc biệt khi bấm HdsdLink
 * từ 1 popup đang mở (không nhìn tiêu đề trang cũng vẫn thấy được thay đổi).
 * Mỗi segment là 1 link thật (URL riêng) — không còn phụ thuộc context, chỉ
 * cần router bọc ngoài (test dùng MemoryRouter).
 */
export default function HelpBreadcrumb({ moduleSlug, topicTitle }: { moduleSlug: string; topicTitle?: string }) {
  return (
    <nav className="flex min-w-0 flex-wrap items-center gap-1 text-xs text-gmv-muted" aria-label="breadcrumb">
      <Link to="/docs" className="hover:text-gmv-primary hover:underline">
        Hướng dẫn sử dụng
      </Link>
      <span aria-hidden="true">›</span>
      {topicTitle ? (
        <Link to={`/docs/${moduleSlug}`} className="text-gmv-primary hover:underline">
          {getModuleLabel(moduleSlug)}
        </Link>
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
