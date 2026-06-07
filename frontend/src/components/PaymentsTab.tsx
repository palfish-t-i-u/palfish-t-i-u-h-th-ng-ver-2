import { useState } from "react";
import { cn } from "../lib/cn";
import { usePermission } from "../hooks/usePermission";

type SubTab = "grid" | "reports" | "recon" | "master";

const SUB_TABS: { id: SubTab; label: string; description: string }[] = [
  { id: "grid", label: "Doanh thu", description: "Nhập / sửa / xem danh sách giao dịch" },
  { id: "reports", label: "Báo cáo", description: "BCTB, theo team, theo kênh" },
  { id: "recon", label: "Đối soát", description: "Cảnh báo nội bộ" },
  { id: "master", label: "Danh mục", description: "Sale, Kênh, Gói, Khách" },
];

/* ── Summary Card ── */
function SummaryCard({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "ok" | "warn" | "danger";
}) {
  const toneClasses: Record<string, string> = {
    neutral: "text-gmv-text-strong",
    ok: "text-gmv-ok",
    warn: "text-gmv-warn",
    danger: "text-gmv-danger",
  };
  return (
    <div className="flex flex-col gap-1 rounded-gmv-lg border border-gmv-border bg-gmv-canvas px-4 py-3">
      <span className="text-xs font-medium text-gmv-muted">{label}</span>
      <span className={cn("text-2xl font-bold tabular-nums", toneClasses[tone])}>{value}</span>
      {sub && <span className="text-[11px] text-gmv-muted">{sub}</span>}
    </div>
  );
}

/* ── Empty State ── */
function EmptyPlaceholder({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-gmv-lg border-2 border-dashed border-gmv-border bg-gmv-bg px-6 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gmv-primary-soft">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gmv-primary">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          <line x1="8" y1="7" x2="16" y2="7" /><line x1="8" y1="11" x2="14" y2="11" />
        </svg>
      </div>
      <h3 className="text-base font-semibold text-gmv-text-strong">{title}</h3>
      <p className="max-w-md text-sm text-gmv-muted">{description}</p>
    </div>
  );
}

/* ── Sub-tab: Doanh thu (grid placeholder) ── */
function GridSubTab({ canWrite }: { canWrite: boolean }) {
  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <SummaryCard label="Tổng GMV" value="—" sub="sum gmv_final (active)" />
        <SummaryCard label="Doanh thu VNĐ" value="—" sub="sum real_pay_vnd" />
        <SummaryCard label="Số đơn" value="—" sub="active + refunded" />
        <SummaryCard label="Chưa khớp NH" value="—" tone="warn" sub="bank_matched = false" />
        <SummaryCard label="Chưa kích hoạt CRM" value="—" tone="warn" sub="crm_activated = false" />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {canWrite && (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-gmv-md bg-gmv-primary px-3 py-2 text-sm font-medium text-white shadow-gmv-1 transition hover:bg-gmv-primary/90"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Thêm doanh thu
          </button>
        )}
        {canWrite && (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-gmv-md border border-gmv-border bg-gmv-canvas px-3 py-2 text-sm font-medium text-gmv-text-strong shadow-gmv-1 transition hover:bg-gmv-bg"
          >
            Import từ file
          </button>
        )}
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-gmv-md border border-gmv-border bg-gmv-canvas px-3 py-2 text-sm font-medium text-gmv-text-strong shadow-gmv-1 transition hover:bg-gmv-bg"
        >
          Xuất Excel
        </button>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Search */}
        <input
          type="text"
          placeholder="Tìm uid, tên, SĐT..."
          className="w-56 rounded-gmv-md border border-gmv-border bg-gmv-canvas px-3 py-2 text-sm text-gmv-text placeholder:text-gmv-muted focus:border-gmv-primary focus:outline-none focus:ring-1 focus:ring-gmv-primary/30"
        />
      </div>

      {/* Team filter tabs */}
      <div className="flex gap-1 border-b border-gmv-border">
        {["Tất cả", "In-house", "In-house 2", "Offline", "HCM"].map((tab, i) => (
          <button
            key={tab}
            type="button"
            className={cn(
              "border-b-2 px-3 py-2 text-sm font-medium transition",
              i === 0
                ? "border-gmv-primary text-gmv-primary"
                : "border-transparent text-gmv-muted hover:border-gmv-border hover:text-gmv-text"
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Grid placeholder */}
      <EmptyPlaceholder
        title="Lưới doanh thu"
        description="AG Grid sẽ hiển thị ở đây — danh sách giao dịch với cột: Ngày, Khách, SĐT, Sale, Team, Kênh, Gói, Tiền VNĐ, GMV, Lần TT, Trạng thái, CRM, NH, Note. Chờ BE API sẵn sàng."
      />
    </div>
  );
}

/* ── Sub-tab: Báo cáo ── */
type ReportTab = "bctb" | "team" | "channel";

const REPORT_TABS: { id: ReportTab; label: string; description: string }[] = [
  { id: "bctb", label: "BCTB", description: "Pivot ngày × sale — GMV VNĐ / RMB / số đơn" },
  { id: "team", label: "Theo Team", description: "Tổng GMV / số đơn theo team & khối" },
  { id: "channel", label: "Theo Kênh", description: "Tổng GMV / số đơn theo loại kênh" },
];

function ReportsSubTab() {
  const [activeReport, setActiveReport] = useState<ReportTab>("bctb");
  return (
    <div className="space-y-4">
      {/* Report tab pills + date filter */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {REPORT_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveReport(tab.id)}
              className={cn(
                "rounded-gmv-md px-3 py-1.5 text-sm font-medium transition",
                activeReport === tab.id
                  ? "bg-gmv-primary text-white shadow-gmv-1"
                  : "bg-gmv-bg text-gmv-muted hover:text-gmv-text"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Date range */}
        <div className="flex items-center gap-2 text-sm">
          <label className="text-gmv-muted">Từ</label>
          <input
            type="date"
            defaultValue="2026-06-01"
            className="rounded-gmv-md border border-gmv-border bg-gmv-canvas px-2.5 py-1.5 text-sm text-gmv-text focus:border-gmv-primary focus:outline-none"
          />
          <label className="text-gmv-muted">đến</label>
          <input
            type="date"
            defaultValue="2026-06-30"
            className="rounded-gmv-md border border-gmv-border bg-gmv-canvas px-2.5 py-1.5 text-sm text-gmv-text focus:border-gmv-primary focus:outline-none"
          />
        </div>

        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-gmv-md border border-gmv-border bg-gmv-canvas px-3 py-1.5 text-sm font-medium text-gmv-text-strong shadow-gmv-1 transition hover:bg-gmv-bg"
        >
          Xuất Excel
        </button>
      </div>

      {/* Report content */}
      {activeReport === "bctb" && (
        <div className="overflow-hidden rounded-gmv-lg border border-gmv-border bg-gmv-canvas">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gmv-table-head">
                <th className="sticky left-0 z-10 bg-gmv-table-head px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gmv-muted">Sale</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gmv-muted">Team</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gmv-muted">Khối</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gmv-muted" colSpan={3}>01/06</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gmv-muted" colSpan={3}>02/06</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gmv-muted">Tổng GMV</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gmv-muted">Số đơn</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={11} className="px-4 py-12 text-center text-gmv-muted">
                  Chờ BE API — GET /api/v1/reports/bctb
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {activeReport === "team" && (
        <div className="overflow-hidden rounded-gmv-lg border border-gmv-border bg-gmv-canvas">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gmv-table-head">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gmv-muted">Team</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gmv-muted">Khối</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gmv-muted">GMV Final</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gmv-muted">Doanh thu VNĐ</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gmv-muted">GMV RMB</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gmv-muted">Số đơn</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-gmv-muted">
                  Chờ BE API — GET /api/v1/reports/team
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {activeReport === "channel" && (
        <div className="overflow-hidden rounded-gmv-lg border border-gmv-border bg-gmv-canvas">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gmv-table-head">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gmv-muted">Loại kênh</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gmv-muted">GMV Final</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gmv-muted">Doanh thu VNĐ</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gmv-muted">GMV RMB</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gmv-muted">Số đơn</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-gmv-muted">
                  Chờ BE API — GET /api/v1/reports/channel
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-gmv-muted">
        Dữ liệu chỉ tính đơn <span className="font-medium text-gmv-ok">active</span> · Team lấy từ <code className="rounded bg-gmv-bg px-1">sales.team</code> (không dùng payments.team thô)
      </p>
    </div>
  );
}

/* ── Sub-tab: Đối soát ── */
function ReconSubTab() {
  return (
    <EmptyPlaceholder
      title="Đối soát nội bộ"
      description="Cảnh báo: trùng đơn, thiếu trường, sale/kênh lạ, lệch tỷ giá. Chờ endpoint GET /recon/internal."
    />
  );
}

/* ── Sub-tab: Danh mục ── */
type MasterTab = "sales" | "channels" | "packages" | "customers";

const MASTER_TABS: { id: MasterTab; label: string; columns: string[] }[] = [
  { id: "sales", label: "Sale", columns: ["full_name", "short_code", "team", "khối", "active"] },
  { id: "channels", label: "Kênh", columns: ["channel_code", "name", "type"] },
  { id: "packages", label: "Gói học", columns: ["name", "fixed"] },
  { id: "customers", label: "Khách hàng", columns: ["uid", "full_name", "phone", "first_seen"] },
];

function MasterSubTab({ canWrite }: { canWrite: boolean }) {
  const [activeMaster, setActiveMaster] = useState<MasterTab>("sales");
  const current = MASTER_TABS.find((t) => t.id === activeMaster)!;

  return (
    <div className="space-y-4">
      {/* Master tab pills */}
      <div className="flex gap-1">
        {MASTER_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveMaster(tab.id)}
            className={cn(
              "rounded-gmv-md px-3 py-1.5 text-sm font-medium transition",
              activeMaster === tab.id
                ? "bg-gmv-primary text-white shadow-gmv-1"
                : "bg-gmv-bg text-gmv-muted hover:text-gmv-text"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        {canWrite && (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-gmv-md bg-gmv-primary px-3 py-2 text-sm font-medium text-white shadow-gmv-1 transition hover:bg-gmv-primary/90"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Thêm {current.label}
          </button>
        )}
        <div className="flex-1" />
        <input
          type="text"
          placeholder={`Tìm ${current.label.toLowerCase()}...`}
          className="w-56 rounded-gmv-md border border-gmv-border bg-gmv-canvas px-3 py-2 text-sm text-gmv-text placeholder:text-gmv-muted focus:border-gmv-primary focus:outline-none focus:ring-1 focus:ring-gmv-primary/30"
        />
      </div>

      {/* Table skeleton */}
      <div className="overflow-hidden rounded-gmv-lg border border-gmv-border bg-gmv-canvas">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gmv-table-head">
              {current.columns.map((col) => (
                <th key={col} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gmv-muted">
                  {col}
                </th>
              ))}
              {canWrite && (
                <th className="w-20 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gmv-muted">
                  Sửa
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={current.columns.length + (canWrite ? 1 : 0)} className="px-4 py-12 text-center text-gmv-muted">
                Chờ BE API — GET /api/v1/{activeMaster}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Main Component ── */
export default function PaymentsTab() {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>("grid");
  const { readOnly } = usePermission("payments");
  const canWrite = !readOnly;

  return (
    <div className="space-y-4">
      {/* Sub-tab navigation */}
      <div className="flex items-center gap-1 rounded-gmv-lg bg-gmv-bg p-1">
        {SUB_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveSubTab(tab.id)}
            className={cn(
              "rounded-gmv-md px-4 py-2 text-sm font-medium transition",
              activeSubTab === tab.id
                ? "bg-gmv-canvas text-gmv-text-strong shadow-gmv-1"
                : "text-gmv-muted hover:text-gmv-text"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeSubTab === "grid" && <GridSubTab canWrite={canWrite} />}
      {activeSubTab === "reports" && <ReportsSubTab />}
      {activeSubTab === "recon" && <ReconSubTab />}
      {activeSubTab === "master" && <MasterSubTab canWrite={canWrite} />}
    </div>
  );
}
