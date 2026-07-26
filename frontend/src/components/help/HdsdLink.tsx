// frontend/src/components/help/HdsdLink.tsx
import { useHelpNavOptional } from "../../contexts/HelpNavContext";
import { cn } from "../../lib/cn";
import useIsMobile from "../../hooks/useIsMobile";

type Props =
  | { mode: "module"; moduleSlug: string; className?: string }
  | { mode: "topic"; moduleSlug: string; topicSlug: string; className?: string };

/**
 * Link "HDSD" đặt cạnh header module/submodule. mode="module" trên desktop chỉ
 * mở cây trong sidebar (không đổi màn hình chính — an toàn, không mất state
 * đang thao tác dở). mode="topic" nhảy thẳng tới bài viết (đổi activeView).
 *
 * Mobile không có sidebar cây (`MobileNavSheet` không render `HelpNavTree`) nên
 * "mở cây" là no-op — mode="module" trên mobile dùng `goToModuleIndex` để nhảy
 * thẳng tới mục lục module thay vì im lặng. Đánh đổi: trên mobile, mode="module"
 * mất tính "an toàn không đổi màn hình" như trên desktop — chấp nhận được vì
 * lựa chọn còn lại (no-op) tệ hơn.
 *
 * Dùng useHelpNavOptional (không throw) — HdsdLink gắn rải rác vào rất nhiều
 * modal/drawer nghiệp vụ, nhiều unit test dựng lại các component đó riêng lẻ
 * không có HelpNavProvider bọc ngoài. Ẩn hẳn nút thay vì crash cả cây render.
 */
export function HdsdLink(props: Props) {
  const ctx = useHelpNavOptional();
  const isMobile = useIsMobile();
  if (!ctx) return null;
  const { goToModule, goToModuleIndex, goToTopic } = ctx;

  const handleClick = () => {
    if (props.mode === "topic") return goToTopic(props.moduleSlug, props.topicSlug);
    return isMobile ? goToModuleIndex(props.moduleSlug) : goToModule(props.moduleSlug);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "inline-flex items-center rounded-gmv-md border border-gmv-border px-2 py-1 text-xs font-medium text-gmv-primary hover:bg-gmv-primary-soft",
        props.className
      )}
    >
      HDSD
    </button>
  );
}
