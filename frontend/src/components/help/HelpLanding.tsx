// frontend/src/components/help/HelpLanding.tsx
import { listHelpModules } from "../../content/help";
import { getModuleLabel } from "../../content/help/moduleLabels";
import { useHelpNav } from "../../contexts/HelpNavContext";

export default function HelpLanding() {
  const modules = listHelpModules();
  const { goToModuleIndex } = useHelpNav();

  return (
    <div className="min-w-0 max-w-2xl space-y-3">
      <h2 className="text-lg font-semibold text-gmv-text-strong">Hướng dẫn sử dụng</h2>
      <p className="text-sm text-gmv-muted">Chọn 1 module bên dưới (hoặc ở sidebar) để xem hướng dẫn từng thao tác.</p>
      {modules.length > 0 && (
        <ul className="space-y-2">
          {modules.map((mod) => (
            <li key={mod.slug}>
              <button
                type="button"
                onClick={() => goToModuleIndex(mod.slug)}
                className="w-full rounded-gmv-md border border-gmv-border px-3 py-2 text-left text-sm text-gmv-text hover:bg-gmv-bg"
              >
                {getModuleLabel(mod.slug)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
