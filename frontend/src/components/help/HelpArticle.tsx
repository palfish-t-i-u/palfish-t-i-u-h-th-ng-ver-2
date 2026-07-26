// frontend/src/components/help/HelpArticle.tsx
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getHelpTopic } from "../../content/help";

export default function HelpArticle({ moduleSlug, topicSlug }: { moduleSlug: string; topicSlug: string }) {
  const topic = getHelpTopic(moduleSlug, topicSlug);

  if (!topic) {
    return (
      <div className="min-w-0 space-y-2">
        <h2 className="text-lg font-semibold text-gmv-text-strong">Chưa có bài viết</h2>
        <p className="text-sm text-gmv-muted">
          Nội dung hướng dẫn cho mục này đang được cập nhật. Quay lại sau nhé.
        </p>
      </div>
    );
  }

  return (
    <article className="min-w-0 max-w-3xl space-y-4">
      <h2 className="text-lg font-semibold text-gmv-text-strong">{topic.title}</h2>
      <div
        className={[
          "space-y-3 text-sm text-gmv-text",
          "[&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-gmv-text-strong",
          "[&_h3]:mt-3 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-gmv-text-strong",
          "[&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5",
          "[&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5",
          "[&_blockquote]:border-l-2 [&_blockquote]:border-gmv-border [&_blockquote]:pl-3 [&_blockquote]:text-gmv-muted",
          "[&_a]:text-gmv-primary [&_a]:underline",
          "[&_code]:rounded [&_code]:bg-gmv-bg [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs",
        ].join(" ")}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{topic.body}</ReactMarkdown>
      </div>
    </article>
  );
}
