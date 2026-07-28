// frontend/src/components/help/HelpLanding.tsx
import { Link } from "react-router-dom";
import { listHelpModules } from "../../content/help";
import { getModuleLabel, groupHelpModules } from "../../content/help/moduleLabels";

export default function HelpLanding() {
  const modules = listHelpModules();
  const groups = groupHelpModules(modules);

  return (
    <div className="min-w-0 max-w-2xl space-y-5">
      <div className="space-y-3">
        <h2 className="text-xl font-semibold text-black">Hướng dẫn sử dụng</h2>
        <p className="text-base text-neutral-600">Chọn 1 module bên dưới (hoặc ở sidebar) để xem hướng dẫn từng thao tác.</p>
      </div>
      {groups.map((group) => (
        <div key={group.label} className="space-y-2">
          <div className="px-1 text-[11px] font-semibold uppercase tracking-wide text-gmv-muted">
            {group.label}
          </div>
          <ul className="space-y-2">
            {group.modules.map((mod) => (
              <li key={mod.slug}>
                <Link
                  to={`/docs/${mod.slug}`}
                  className="block w-full rounded-gmv-md border border-gmv-border px-4 py-3 text-left text-base text-black hover:bg-gmv-bg"
                >
                  {getModuleLabel(mod.slug)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
