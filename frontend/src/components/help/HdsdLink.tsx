// frontend/src/components/help/HdsdLink.tsx
import { useHelpNav } from "../../contexts/HelpNavContext";
import { cn } from "../../lib/cn";

type Props =
  | { mode: "module"; moduleSlug: string; className?: string }
  | { mode: "topic"; moduleSlug: string; topicSlug: string; className?: string };

/**
 * Link "HDSD" đặt cạnh header module/submodule. mode="module" chỉ mở cây
 * trong sidebar (không đổi màn hình chính — an toàn, không mất state đang
 * thao tác dở). mode="topic" nhảy thẳng tới bài viết (đổi activeView).
 */
export function HdsdLink(props: Props) {
  const { goToModule, goToTopic } = useHelpNav();

  return (
    <button
      type="button"
      onClick={() =>
        props.mode === "module" ? goToModule(props.moduleSlug) : goToTopic(props.moduleSlug, props.topicSlug)
      }
      className={cn(
        "inline-flex items-center rounded-gmv-md border border-gmv-border px-2 py-1 text-xs font-medium text-gmv-primary hover:bg-gmv-primary-soft",
        props.className
      )}
    >
      HDSD
    </button>
  );
}
