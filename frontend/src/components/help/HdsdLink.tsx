// frontend/src/components/help/HdsdLink.tsx
import { cn } from "../../lib/cn";

type Props = { moduleSlug: string; topicSlug?: string; className?: string };

/**
 * Link "HDSD" đặt cạnh header module/submodule/popup. Luôn mở trang docs
 * (`/docs/<moduleSlug>` hoặc `/docs/<moduleSlug>/<topicSlug>`) ở tab mới —
 * màn hình đang thao tác dở giữ nguyên hoàn toàn, không cần phân biệt
 * desktop/mobile hay lo mất state như bản in-app trước đây.
 */
export function HdsdLink({ moduleSlug, topicSlug, className }: Props) {
  const href = topicSlug ? `/docs/${moduleSlug}/${topicSlug}` : `/docs/${moduleSlug}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center rounded-gmv-md border border-gmv-border px-2 py-1 text-xs font-medium text-gmv-primary hover:bg-gmv-primary-soft",
        className
      )}
    >
      HDSD
    </a>
  );
}
