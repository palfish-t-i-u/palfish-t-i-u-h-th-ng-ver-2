import { lazy, Suspense, useState } from "react";
import { cn } from "../lib/cn";

const BC01SalesPerformance = lazy(() => import("./reports/BC01SalesPerformance"));
const BC02KeyDataReport = lazy(() => import("./reports/BC02KeyDataReport"));
const BC03Placeholder = lazy(() => import("./reports/BC03Placeholder"));

type ReportId = "bc01" | "bc02" | "bc03";

const REPORTS: { id: ReportId; label: string; subtitle: string }[] = [
  { id: "bc01", label: "BC01: Sales performance", subtitle: "Tổng GMV theo team × sale × tháng" },
  { id: "bc02", label: "BC02: Key Data of Sales Process", subtitle: "Dữ liệu then chốt quy trình bán hàng" },
  { id: "bc03", label: "BC03: Báo cáo Tổng bộ hàng ngày", subtitle: "Tổng hợp vận hành hàng ngày" },
];

function ReportPanel({ id }: { id: ReportId }) {
  if (id === "bc01") return <BC01SalesPerformance />;
  if (id === "bc02") return <BC02KeyDataReport />;
  return <BC03Placeholder />;
}

export default function ReportsHub() {
  const [selected, setSelected] = useState<ReportId | null>(null);

  return (
    <div className="flex min-h-[480px] flex-col gap-4 lg:flex-row lg:gap-6">
      <aside className="w-full shrink-0 lg:w-72">
        <div className="rounded-gmv-md border border-gmv-border bg-gmv-canvas p-2 shadow-gmv-1">
          <p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-gmv-muted">
            Báo cáo
          </p>
          <ul className="space-y-1">
            {REPORTS.map((r) => {
              const active = selected === r.id;
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(r.id)}
                    className={cn(
                      "w-full rounded-gmv-md px-3 py-2.5 text-left transition",
                      active
                        ? "bg-gmv-primary-soft text-gmv-primary"
                        : "text-gmv-text hover:bg-gmv-bg hover:text-gmv-text-strong"
                    )}
                  >
                    <span className="block text-sm font-medium">{r.label}</span>
                    <span className="mt-0.5 block text-xs text-gmv-muted">{r.subtitle}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {selected ? (
          <Suspense
            fallback={
              <div className="flex min-h-[320px] items-center justify-center rounded-gmv-md border border-gmv-border bg-gmv-canvas text-sm text-gmv-muted">
                Đang tải…
              </div>
            }
          >
            <ReportPanel id={selected} />
          </Suspense>
        ) : (
          <div className="flex min-h-[320px] flex-col items-center justify-center rounded-gmv-md border border-dashed border-gmv-border bg-gmv-bg p-8 text-center">
            <p className="text-base font-medium text-gmv-text-strong">Chọn báo cáo</p>
            <p className="mt-1 text-sm text-gmv-muted">Chọn một mục bên trái để xem nội dung</p>
          </div>
        )}
      </div>
    </div>
  );
}
