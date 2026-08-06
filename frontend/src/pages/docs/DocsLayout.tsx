// frontend/src/pages/docs/DocsLayout.tsx
import { useState } from "react";
import { Route, Routes, useParams } from "react-router-dom";
import DocsSidebar from "./DocsSidebar";
import HelpLanding from "../../components/help/HelpLanding";
import HelpModuleIndex from "../../components/help/HelpModuleIndex";
import HelpArticle from "../../components/help/HelpArticle";
import { cn } from "../../lib/cn";

function ModuleIndexRoute() {
  const { moduleSlug } = useParams<{ moduleSlug: string }>();
  return <HelpModuleIndex moduleSlug={moduleSlug!} />;
}

function ArticleRoute() {
  const { moduleSlug, topicSlug } = useParams<{ moduleSlug: string; topicSlug: string }>();
  return <HelpArticle moduleSlug={moduleSlug!} topicSlug={topicSlug!} />;
}

export default function DocsLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const isSandbox =
    import.meta.env.VITE_APP_ENV === "sandbox" || import.meta.env.VITE_SANDBOX === "true";

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-gmv-bg font-sans text-gmv-text">
      {isSandbox && (
        <div className="z-50 shrink-0 bg-yellow-400 py-1 text-center text-xs font-bold text-yellow-900">
          ⚠️ SANDBOX — Dữ liệu test, không phải production
        </div>
      )}
      <header className="z-20 flex h-14 shrink-0 items-center gap-3 border-b border-gmv-border bg-gmv-canvas/95 px-4 shadow-gmv-1 backdrop-blur">
        <button
          type="button"
          onClick={() => setMobileNavOpen((v) => !v)}
          className="flex h-9 w-9 items-center justify-center rounded-gmv-md border border-gmv-border text-gmv-muted md:hidden"
          aria-label="Danh mục"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="18" x2="20" y2="18" />
          </svg>
        </button>
        <img src="/app-logo.png" alt="PalFish GMV" className="h-7 w-7 shrink-0 rounded-gmv-md object-cover" />
        <span className="text-sm font-semibold text-gmv-text-strong">PalFish GMV — Hướng dẫn sử dụng</span>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className={cn("md:block", mobileNavOpen ? "fixed inset-0 z-30 flex" : "hidden")}>
          {mobileNavOpen && (
            <div
              className="absolute inset-0 bg-black/40 md:hidden"
              onClick={() => setMobileNavOpen(false)}
              role="presentation"
            />
          )}
          <div className="relative z-10 h-full">
            <DocsSidebar onNavigate={() => setMobileNavOpen(false)} />
          </div>
        </div>

        <main className="min-h-0 flex-1 overflow-auto motion-safe:scroll-smooth p-4 md:p-6">
          <div className="mx-auto max-w-5xl">
            <Routes>
              <Route index element={<HelpLanding />} />
              <Route path=":moduleSlug" element={<ModuleIndexRoute />} />
              <Route path=":moduleSlug/:topicSlug" element={<ArticleRoute />} />
            </Routes>
          </div>
        </main>
      </div>
    </div>
  );
}
