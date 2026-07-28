// frontend/src/components/help/HelpModuleIndex.tsx
import { Link } from "react-router-dom";
import { getHelpModule } from "../../content/help";
import { getModuleLabel } from "../../content/help/moduleLabels";
import HelpBreadcrumb from "./HelpBreadcrumb";

export default function HelpModuleIndex({ moduleSlug }: { moduleSlug: string }) {
  const mod = getHelpModule(moduleSlug);

  if (!mod || mod.topics.length === 0) {
    return (
      <div className="min-w-0 space-y-2">
        <HelpBreadcrumb moduleSlug={moduleSlug} />
        <h2 className="text-lg font-semibold text-gmv-text-strong">Chưa có hướng dẫn</h2>
        <p className="text-sm text-gmv-muted">Module này chưa có bài hướng dẫn nào. Quay lại sau nhé.</p>
      </div>
    );
  }

  return (
    <div className="min-w-0 max-w-2xl space-y-3">
      <HelpBreadcrumb moduleSlug={moduleSlug} />
      <h2 className="text-xl font-semibold text-black">Hướng dẫn — {getModuleLabel(moduleSlug)}</h2>
      <ul className="space-y-2">
        {mod.topics.map((topic) => (
          <li key={topic.topicSlug}>
            <Link
              to={`/docs/${mod.slug}/${topic.topicSlug}`}
              className="block w-full rounded-gmv-md border border-gmv-border px-4 py-3 text-left text-base text-black hover:bg-gmv-bg"
            >
              {topic.title}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
