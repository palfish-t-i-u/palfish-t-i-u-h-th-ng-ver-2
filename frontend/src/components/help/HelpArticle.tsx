// frontend/src/components/help/HelpArticle.tsx
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getHelpTopic } from "../../content/help";
import HelpBreadcrumb from "./HelpBreadcrumb";
import "./help.css";

export default function HelpArticle({ moduleSlug, topicSlug }: { moduleSlug: string; topicSlug: string }) {
  const topic = getHelpTopic(moduleSlug, topicSlug);

  if (!topic) {
    return (
      <div className="min-w-0 space-y-2">
        <HelpBreadcrumb moduleSlug={moduleSlug} />
        <h2 className="text-lg font-semibold text-gmv-text-strong">Chưa có bài viết</h2>
        <p className="text-sm text-gmv-muted">
          Nội dung hướng dẫn cho mục này đang được cập nhật. Quay lại sau nhé.
        </p>
      </div>
    );
  }

  return (
    // key gồm CẢ moduleSlug: ép remount khi đổi bài để animate-fade-in-once
    // chạy lại — không thì React chỉ update text trong node cũ, animation không
    // tự replay. Phải kèm moduleSlug vì `tong-quan` trùng ở 8 module: chỉ dùng
    // topicSlug thì nhảy paymentRequests/tong-quan → module3/tong-quan giữ
    // nguyên key, mất hiệu ứng đúng ở luồng browse hay dùng nhất.
    <article key={`${moduleSlug}/${topicSlug}`} className="min-w-0 max-w-3xl space-y-5">
      <HelpBreadcrumb moduleSlug={moduleSlug} topicTitle={topic.title} />
      <h2 className="animate-fade-in-once text-xl font-semibold text-black">{topic.title}</h2>
      <div
        className={[
          "space-y-4 text-base leading-relaxed text-black",
          "[&_h2]:mt-5 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-black",
          "[&_h3]:mt-4 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-black",
          "[&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5",
          "[&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5",
          "[&_blockquote]:border-l-2 [&_blockquote]:border-gmv-border [&_blockquote]:pl-3 [&_blockquote]:text-neutral-600",
          "[&_a]:text-gmv-primary [&_a]:underline",
          "[&_code]:rounded [&_code]:bg-gmv-bg [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs",
          // Ảnh minh họa — viền + bo góc + đổ bóng nhẹ để tách khỏi nền trang
          // (trước đây border/radius/shadow đều 0 → ảnh dính liền nền, trông thô).
          "[&_img]:my-3 [&_img]:w-full [&_img]:rounded-gmv-md [&_img]:border [&_img]:border-gmv-border [&_img]:shadow-gmv-1",
          // Bảng — remark-gfm đã parse đúng nhưng không có style nào đi kèm
          // (trước đây padding 1px, border 0 → chữ dính nhau, không đọc được).
          "[&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm",
          "[&_thead]:bg-gmv-bg",
          "[&_th]:border [&_th]:border-gmv-border [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold",
          "[&_td]:border [&_td]:border-gmv-border [&_td]:px-3 [&_td]:py-2 [&_td]:align-top",
          "[&_hr]:my-5 [&_hr]:border-gmv-border",
          "[&_p]:leading-relaxed",
        ].join(" ")}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            // Bọc scroll ngang riêng cho bảng — trang docs không giới hạn
            // max-width cho <table> (để bảng nhiều cột vẫn đọc được trên
            // desktop), nên trên mobile phải tự cuộn thay vì tràn ra ngoài
            // khung bài, đè lên sidebar.
            table: ({ children }) => (
              <div className="overflow-x-auto">
                <table>{children}</table>
              </div>
            ),
          }}
        >
          {topic.body}
        </ReactMarkdown>
      </div>
    </article>
  );
}
