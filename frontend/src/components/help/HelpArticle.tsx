// frontend/src/components/help/HelpArticle.tsx
import { useEffect } from "react";
import type { ReactNode, ReactElement } from "react";
import { useLocation } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getHelpTopic } from "../../content/help";
import HelpBreadcrumb from "./HelpBreadcrumb";
import "./help.css";

function extractText(node: ReactNode): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (node && typeof node === "object" && "props" in node) {
    const props = (node as ReactElement).props as Record<string, unknown>;
    return extractText(props.children as ReactNode);
  }
  return "";
}

function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Rút heading cấp 2 (## mục lớn) và cấp 3 (### mục con) từ markdown thô để dựng
// mục lục 2 cấp — bỏ chính heading "Mục lục" (nó chỉ là cờ bật mục lục). Slug
// PHẢI khớp id do renderer h2/h3 sinh ra (cùng dùng slugify) thì anchor mới cuộn
// đúng — nên nhãn ### trong .md phải DUY NHẤT, không trùng chữ (id trùng = anchor
// chỉ nhảy cái đầu).
function extractHeadings(body: string): { id: string; text: string; level: number }[] {
  const out: { id: string; text: string; level: number }[] = [];
  for (const line of body.split(/\r?\n/)) {
    const m = line.match(/^(#{2,3})\s+(.+?)\s*$/);
    if (!m) continue;
    const level = m[1].length;
    const text = m[2].trim();
    const id = slugify(text);
    if (id === "muc-luc") continue;
    out.push({ id, text, level });
  }
  return out;
}

export default function HelpArticle({ moduleSlug, topicSlug }: { moduleSlug: string; topicSlug: string }) {
  const topic = getHelpTopic(moduleSlug, topicSlug);
  const { hash } = useLocation();

  // React Router nuốt scroll-to-fragment mặc định của trình duyệt (popstate
  // handler hủy smooth scroll đang chạy), và khi mở thẳng URL kèm #anchor thì
  // nội dung chưa mount lúc trình duyệt xử lý fragment — tự scroll ở đây.
  useEffect(() => {
    if (!hash) return;
    const el = document.getElementById(decodeURIComponent(hash.slice(1)));
    if (el) el.scrollIntoView();
  }, [hash, moduleSlug, topicSlug]);

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

  // Mục lục: chỉ bật khi bài có heading "## Mục lục" (cờ opt-in). Danh sách tự
  // sinh từ các heading ## còn lại — không phải bảo trì tay ở file .md.
  const hasToc = /^##\s+Mục lục\s*$/m.test(topic.body);
  const toc = hasToc ? extractHeadings(topic.body) : [];
  // Xoá khối "## Mục lục" (tới heading ## kế tiếp) khỏi nội dung render — nó đã
  // thành thanh mục lục bên trái + khối inline mobile, không lặp lại trong bài.
  const body = hasToc ? topic.body.replace(/^##\s+Mục lục[\s\S]*?(?=^##\s)/m, "") : topic.body;
  const showToc = toc.length > 0;

  const mdComponents = {
    table: ({ children }: { children?: ReactNode }) => (
      <div className="overflow-x-auto">
        <table>{children}</table>
      </div>
    ),
    h2: ({ children, ...props }: { children?: ReactNode }) => {
      const id = slugify(extractText(children));
      return (
        <h2 id={id} className="scroll-mt-6" {...props}>
          {children}
        </h2>
      );
    },
    h3: ({ children, ...props }: { children?: ReactNode }) => {
      const id = slugify(extractText(children));
      return (
        <h3 id={id} className="scroll-mt-6" {...props}>
          {children}
        </h3>
      );
    },
  };

  return (
    <div className="flex justify-center gap-8">
      {/* key gồm CẢ moduleSlug: ép remount khi đổi bài để animate-fade-in-once
          chạy lại — không thì React chỉ update text trong node cũ, animation
          không tự replay. Phải kèm moduleSlug vì `tong-quan` trùng ở 8 module:
          chỉ dùng topicSlug thì nhảy paymentRequests/tong-quan → module3/tong-quan
          giữ nguyên key, mất hiệu ứng đúng ở luồng browse hay dùng nhất. */}
      <article key={`${moduleSlug}/${topicSlug}`} className="min-w-0 max-w-3xl grow space-y-5">
        <HelpBreadcrumb moduleSlug={moduleSlug} topicTitle={topic.title} />
        <h2 className="animate-fade-in-once text-2xl font-bold text-black">{topic.title}</h2>

        {/* Mục lục inline cho mobile — thanh bên trái ẩn dưới xl */}
        {showToc && (
          <nav className="rounded-gmv-md border border-gmv-border bg-gmv-bg/60 p-3 xl:hidden">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gmv-muted">Mục lục</div>
            <ul className="space-y-1">
              {toc.map((h) => (
                <li key={h.id} className={h.level === 3 ? "ml-4" : ""}>
                  <a
                    href={`#${h.id}`}
                    className={[
                      "text-gmv-primary underline",
                      h.level === 3 ? "text-xs" : "text-sm font-medium",
                    ].join(" ")}
                  >
                    {h.text}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <div
          className={[
            "space-y-4 text-base leading-relaxed text-black",
            // Cấp heading rõ ràng: bài (h1, text-2xl) > mục lớn (h2, text-xl + gạch
            // chân tách chương) > mục con (h3, base đậm). Bước size + gạch chân giúp
            // sale nhìn ra ngay cha/con, không lẫn với chữ thường.
            "[&_h2]:mt-8 [&_h2]:border-b [&_h2]:border-gmv-border [&_h2]:pb-1 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-black",
            "[&_h3]:mt-5 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-gmv-text-strong",
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
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
            {body}
          </ReactMarkdown>
        </div>
      </article>

      {/* Thanh mục lục bên phải — sticky, chỉ hiện trên màn rộng (xl trở lên).
          Đặt SAU bài để bám lề phải theo layout docs kinh điển; mobile ẩn (đã có
          khối mục lục inline trong <article>). */}
      {showToc && (
        <nav className="sticky top-6 hidden w-52 shrink-0 self-start py-1 xl:block">
          <div className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wide text-gmv-muted">
            Mục lục
          </div>
          <ul className="space-y-0.5 border-l border-gmv-border">
            {toc.map((h) => (
              <li key={h.id}>
                <a
                  href={`#${h.id}`}
                  className={[
                    "-ml-px block border-l-2 border-transparent py-1 leading-snug transition-colors hover:border-gmv-primary hover:text-gmv-primary",
                    h.level === 3
                      ? "pl-7 text-[12px] text-gmv-muted" // mục con — thụt sâu hơn + nhạt
                      : "pl-3 text-[13px] font-medium text-gmv-text-strong", // mục lớn
                  ].join(" ")}
                >
                  {h.text}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}
