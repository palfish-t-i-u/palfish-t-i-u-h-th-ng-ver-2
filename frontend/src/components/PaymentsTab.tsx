import { useCallback, useEffect, useState } from "react";
import { cn } from "../lib/cn";
import { usePermission } from "../hooks/usePermission";
import { api } from "../lib/api";

type SubTab = "grid" | "reports" | "recon" | "master";

const SUB_TABS: { id: SubTab; label: string; activeClass: string; inactiveClass: string }[] = [
  { id: "grid", label: "Doanh thu",
    activeClass: "bg-[#7260ff] text-white shadow-gmv-1",
    inactiveClass: "bg-[#7260ff]/10 text-[#7260ff] hover:bg-[#7260ff]/20" },
  { id: "reports", label: "Báo cáo",
    activeClass: "bg-[#2f9e44] text-white shadow-gmv-1",
    inactiveClass: "bg-[#2f9e44]/10 text-[#2f9e44] hover:bg-[#2f9e44]/20" },
  { id: "recon", label: "Đối soát",
    activeClass: "bg-[#f08c00] text-white shadow-gmv-1",
    inactiveClass: "bg-[#f08c00]/10 text-[#f08c00] hover:bg-[#f08c00]/20" },
  { id: "master", label: "Danh mục",
    activeClass: "bg-[#1c7ed6] text-white shadow-gmv-1",
    inactiveClass: "bg-[#1c7ed6]/10 text-[#1c7ed6] hover:bg-[#1c7ed6]/20" },
];

const TEAMS = ["Tất cả", "In-house", "In-house 2", "Offline", "HCM"] as const;

/* ── Helpers ── */
const fmtVND = (n: number) => new Intl.NumberFormat("vi-VN").format(Math.round(n));
const fmtGMV = (n: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);
const fmtDate = (s: string) => {
  try { return new Date(s).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }); }
  catch { return s?.slice(0, 10) ?? "—"; }
};

/* ── Summary Card ── */
function SummaryCard({ label, value, sub, tone = "neutral" }: {
  label: string; value: string; sub?: string; tone?: "neutral" | "ok" | "warn" | "danger";
}) {
  const toneClasses: Record<string, string> = {
    neutral: "text-gmv-text-strong", ok: "text-gmv-ok", warn: "text-gmv-warn", danger: "text-gmv-danger",
  };
  return (
    <div className="flex flex-col gap-1 rounded-gmv-lg border border-gmv-border bg-gmv-canvas px-4 py-3">
      <span className="text-xs font-medium text-gmv-muted">{label}</span>
      <span className={cn("text-2xl font-bold tabular-nums", toneClasses[tone])}>{value}</span>
      {sub && <span className="text-[11px] text-gmv-muted">{sub}</span>}
    </div>
  );
}

/* ── Loading Skeleton ── */
function TableSkeleton({ cols = 5, rows = 5 }: { cols?: number; rows?: number }) {
  return (
    <div className="overflow-hidden rounded-gmv-lg border border-gmv-border bg-gmv-canvas">
      <table className="w-full text-sm">
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r} className={r % 2 === 0 ? "bg-gmv-canvas" : "bg-gmv-bg/50"}>
              {Array.from({ length: cols }).map((_, c) => (
                <td key={c} className="px-4 py-3">
                  <div className="h-4 animate-pulse rounded bg-gmv-border" style={{ width: `${50 + Math.random() * 40}%` }} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Status Badge ── */
function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn(
      "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
      status === "active" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
    )}>
      {status === "active" ? "Active" : "Refunded"}
    </span>
  );
}
function BoolBadge({ value, yes = "Có", no = "Chưa" }: { value: boolean; yes?: string; no?: string }) {
  return (
    <span className={cn(
      "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
      value ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"
    )}>
      {value ? yes : no}
    </span>
  );
}

/* ── Sub-tab: Doanh thu (Grid) ── */
function GridSubTab({ canWrite }: { canWrite: boolean }) {
  const [teamFilter, setTeamFilter] = useState("Tất cả");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{ items: any[]; total: number; summary: any }>({ items: [], total: 0, summary: {} });
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, page_size: pageSize };
      if (teamFilter !== "Tất cả") params.team = teamFilter;
      if (search.trim()) params.search = search.trim();
      const res = await api.get("/api/v1/payments", { params });
      setData(res.data);
    } catch (err) {
      console.error("Fetch payments failed:", err);
    } finally {
      setLoading(false);
    }
  }, [teamFilter, search, page]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [teamFilter, search]);

  const { items, total, summary } = data;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <SummaryCard label="Tổng GMV" value={summary.gmv_final != null ? fmtGMV(summary.gmv_final) : "—"} sub="sum gmv_final (active)" />
        <SummaryCard label="Doanh thu VNĐ" value={summary.real_pay_vnd != null ? fmtVND(summary.real_pay_vnd) : "—"} sub="sum real_pay_vnd" />
        <SummaryCard label="Số đơn" value={summary.count != null ? summary.count.toLocaleString("vi-VN") : "—"} sub="active + refunded" />
        <SummaryCard label="Chưa khớp NH" value={summary.unmatched_bank != null ? String(summary.unmatched_bank) : "—"} tone="warn" sub="bank_matched = false" />
        <SummaryCard label="Chưa kích hoạt CRM" value={summary.uncrm != null ? String(summary.uncrm) : "—"} tone="warn" sub="crm_activated = false" />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {canWrite && (
          <button type="button" className="inline-flex items-center gap-1.5 rounded-gmv-md bg-gmv-primary px-3 py-2 text-sm font-medium text-white shadow-gmv-1 transition hover:bg-gmv-primary/90">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Thêm doanh thu
          </button>
        )}
        {canWrite && (
          <button type="button" className="inline-flex items-center gap-1.5 rounded-gmv-md border border-gmv-border bg-gmv-canvas px-3 py-2 text-sm font-medium text-gmv-text-strong shadow-gmv-1 transition hover:bg-gmv-bg">
            Import từ file
          </button>
        )}
        <button type="button" className="inline-flex items-center gap-1.5 rounded-gmv-md border border-gmv-border bg-gmv-canvas px-3 py-2 text-sm font-medium text-gmv-text-strong shadow-gmv-1 transition hover:bg-gmv-bg">
          Xuất Excel
        </button>
        <div className="flex-1" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm uid, tên, SĐT..."
          className="w-56 rounded-gmv-md border border-gmv-border bg-gmv-canvas px-3 py-2 text-sm text-gmv-text placeholder:text-gmv-muted focus:border-gmv-primary focus:outline-none focus:ring-1 focus:ring-gmv-primary/30"
        />
      </div>

      {/* Team filter tabs */}
      <div className="flex gap-1 border-b border-gmv-border">
        {TEAMS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setTeamFilter(tab)}
            className={cn(
              "border-b-2 px-3 py-2 text-sm font-medium transition",
              teamFilter === tab
                ? "border-gmv-primary text-gmv-primary"
                : "border-transparent text-gmv-muted hover:border-gmv-border hover:text-gmv-text"
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Data table */}
      {loading ? <TableSkeleton cols={10} rows={8} /> : items.length === 0 ? (
        <div className="rounded-gmv-lg border-2 border-dashed border-gmv-border bg-gmv-bg px-6 py-16 text-center text-sm text-gmv-muted">
          Không có dữ liệu {teamFilter !== "Tất cả" ? `cho team "${teamFilter}"` : ""}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-gmv-lg border border-gmv-border bg-gmv-canvas">
          <table className="w-full whitespace-nowrap text-sm">
            <thead>
              <tr className="bg-gmv-table-head">
                <th className="sticky left-0 z-10 bg-gmv-table-head px-3 py-2.5 text-left text-xs font-semibold uppercase text-gmv-muted">Ngày</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase text-gmv-muted">UID</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase text-gmv-muted">Khách</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase text-gmv-muted">Sale</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase text-gmv-muted">Team</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase text-gmv-muted">VNĐ</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase text-gmv-muted">GMV</th>
                <th className="px-3 py-2.5 text-center text-xs font-semibold uppercase text-gmv-muted">TT</th>
                <th className="px-3 py-2.5 text-center text-xs font-semibold uppercase text-gmv-muted">NH</th>
                <th className="px-3 py-2.5 text-center text-xs font-semibold uppercase text-gmv-muted">CRM</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase text-gmv-muted">Note</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row: any) => (
                <tr key={row.payment_id} className="border-t border-gmv-border transition hover:bg-gmv-bg/50">
                  <td className="sticky left-0 z-10 bg-gmv-canvas px-3 py-2 font-mono text-xs">{fmtDate(row.pay_time)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{row.uid}</td>
                  <td className="max-w-[140px] truncate px-3 py-2">{row.customers?.full_name ?? "—"}</td>
                  <td className="px-3 py-2">{row.sales?.short_code ?? row.sales?.full_name ?? "—"}</td>
                  <td className="px-3 py-2 text-gmv-muted">{row.team}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtVND(row.real_pay_vnd)}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtGMV(row.gmv_final ?? 0)}</td>
                  <td className="px-3 py-2 text-center"><StatusBadge status={row.status} /></td>
                  <td className="px-3 py-2 text-center"><BoolBadge value={row.bank_matched} yes="Khớp" no="Chưa" /></td>
                  <td className="px-3 py-2 text-center"><BoolBadge value={row.crm_activated} /></td>
                  <td className="max-w-[180px] truncate px-3 py-2 text-xs text-gmv-muted">{row.note ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {total > pageSize && (
        <div className="flex items-center justify-between text-sm text-gmv-muted">
          <span>Hiện {items.length} / {total.toLocaleString("vi-VN")} dòng</span>
          <div className="flex gap-1">
            <button type="button" disabled={page <= 1} onClick={() => setPage(p => p - 1)}
              className="rounded-gmv-md border border-gmv-border bg-gmv-canvas px-3 py-1.5 text-xs font-medium disabled:opacity-40">
              Trước
            </button>
            <span className="px-2 py-1.5 text-xs">Trang {page}/{totalPages}</span>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
              className="rounded-gmv-md border border-gmv-border bg-gmv-canvas px-3 py-1.5 text-xs font-medium disabled:opacity-40">
              Sau
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Sub-tab: Báo cáo ── */
type ReportTab = "bctb" | "team" | "channel";
const REPORT_TABS: { id: ReportTab; label: string }[] = [
  { id: "bctb", label: "BCTB" },
  { id: "team", label: "Theo Team" },
  { id: "channel", label: "Theo Kênh" },
];

function ReportsSubTab() {
  const [activeReport, setActiveReport] = useState<ReportTab>("bctb");
  const today = new Date();
  const firstOfMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
  const todayStr = today.toISOString().slice(0, 10);
  const [dateFrom, setDateFrom] = useState(firstOfMonth);
  const [dateTo, setDateTo] = useState(todayStr);
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState<any>(null);

  const fetchReport = useCallback(async () => {
    if (!dateFrom || !dateTo) return;
    setLoading(true);
    try {
      const res = await api.get(`/api/v1/reports/${activeReport}`, { params: { from: dateFrom, to: dateTo } });
      setReportData(res.data);
    } catch (err) {
      console.error(`Fetch report ${activeReport} failed:`, err);
      setReportData(null);
    } finally {
      setLoading(false);
    }
  }, [activeReport, dateFrom, dateTo]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const handleExport = async () => {
    try {
      const res = await api.get(`/api/v1/reports/${activeReport}/export`, {
        params: { from: dateFrom, to: dateTo },
        responseType: "blob",
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `report_${activeReport}_${dateFrom}_${dateTo}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed:", err);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {REPORT_TABS.map((tab) => (
            <button key={tab.id} type="button" onClick={() => setActiveReport(tab.id)}
              className={cn("rounded-gmv-md px-3 py-1.5 text-sm font-medium transition",
                activeReport === tab.id ? "bg-gmv-primary text-white shadow-gmv-1" : "bg-gmv-bg text-gmv-muted hover:text-gmv-text"
              )}>
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-2 text-sm">
          <label className="text-gmv-muted">Từ</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-gmv-md border border-gmv-border bg-gmv-canvas px-2.5 py-1.5 text-sm text-gmv-text focus:border-gmv-primary focus:outline-none" />
          <label className="text-gmv-muted">đến</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            className="rounded-gmv-md border border-gmv-border bg-gmv-canvas px-2.5 py-1.5 text-sm text-gmv-text focus:border-gmv-primary focus:outline-none" />
        </div>
        <button type="button" onClick={handleExport}
          className="inline-flex items-center gap-1.5 rounded-gmv-md border border-gmv-border bg-gmv-canvas px-3 py-1.5 text-sm font-medium text-gmv-text-strong shadow-gmv-1 transition hover:bg-gmv-bg">
          Xuất Excel
        </button>
      </div>

      {loading ? <TableSkeleton cols={6} rows={6} /> : !reportData ? (
        <div className="rounded-gmv-lg border-2 border-dashed border-gmv-border bg-gmv-bg px-6 py-12 text-center text-sm text-gmv-muted">
          Không tải được báo cáo
        </div>
      ) : activeReport === "bctb" ? (
        <BctbTable data={reportData} />
      ) : activeReport === "team" ? (
        <TeamTable rows={reportData.rows || []} />
      ) : (
        <ChannelTable rows={reportData.rows || []} />
      )}

      <p className="text-xs text-gmv-muted">
        Dữ liệu chỉ tính đơn <span className="font-medium text-gmv-ok">active</span> · Team lấy từ <code className="rounded bg-gmv-bg px-1">sales.team</code>
      </p>
    </div>
  );
}

function BctbTable({ data }: { data: any }) {
  const dateKeys: string[] = data.date_keys || [];
  const rows: any[] = data.sorted_data || data.data || [];
  if (!rows.length) return <div className="rounded-gmv-lg border-2 border-dashed border-gmv-border bg-gmv-bg px-6 py-12 text-center text-sm text-gmv-muted">Không có dữ liệu trong khoảng ngày này</div>;
  return (
    <div className="overflow-x-auto rounded-gmv-lg border border-gmv-border bg-gmv-canvas">
      <table className="w-full whitespace-nowrap text-sm">
        <thead>
          <tr className="bg-gmv-table-head">
            <th className="sticky left-0 z-10 bg-gmv-table-head px-3 py-2.5 text-left text-xs font-semibold uppercase text-gmv-muted">Sale</th>
            <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase text-gmv-muted">Team</th>
            <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase text-gmv-muted">Khối</th>
            {dateKeys.map((d) => (
              <th key={d} className="px-3 py-2.5 text-right text-xs font-semibold text-gmv-muted">{d.slice(5)}</th>
            ))}
            <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase text-gmv-muted">Tổng GMV</th>
            <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase text-gmv-muted">Số đơn</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row: any, i: number) => (
            <tr key={row.sale_id ?? i} className="border-t border-gmv-border hover:bg-gmv-bg/50">
              <td className="sticky left-0 z-10 bg-gmv-canvas px-3 py-2 font-medium">{row.crm_name ?? "—"}</td>
              <td className="px-3 py-2 text-gmv-muted">{row.team ?? "—"}</td>
              <td className="px-3 py-2 text-gmv-muted">{row.department ?? "—"}</td>
              {dateKeys.map((d) => {
                const cell = row.days?.[d];
                const val = cell?.gmv_final ?? cell?.real_pay_vnd ?? 0;
                return <td key={d} className="px-3 py-2 text-right font-mono text-xs tabular-nums">{val > 0 ? fmtGMV(val) : ""}</td>;
              })}
              <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums">{fmtGMV(row.total?.gmv_final ?? 0)}</td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">{row.total?.count ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TeamTable({ rows }: { rows: any[] }) {
  if (!rows.length) return <div className="rounded-gmv-lg border-2 border-dashed border-gmv-border bg-gmv-bg px-6 py-12 text-center text-sm text-gmv-muted">Không có dữ liệu</div>;
  return (
    <div className="overflow-hidden rounded-gmv-lg border border-gmv-border bg-gmv-canvas">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gmv-table-head">
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gmv-muted">Khối</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gmv-muted">Team</th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-gmv-muted">GMV Final</th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-gmv-muted">Doanh thu VNĐ</th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-gmv-muted">GMV RMB</th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-gmv-muted">Số đơn</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r: any, i: number) => (
            <tr key={i} className="border-t border-gmv-border hover:bg-gmv-bg/50">
              <td className="px-4 py-2.5 font-medium">{r.khoi ?? "—"}</td>
              <td className="px-4 py-2.5">{r.team ?? "—"}</td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums">{fmtGMV(r.gmv_final ?? 0)}</td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums">{fmtVND(r.real_pay_vnd ?? 0)}</td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums">{fmtGMV(r.gmv_rmb ?? 0)}</td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums">{(r.count ?? 0).toLocaleString("vi-VN")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChannelTable({ rows }: { rows: any[] }) {
  if (!rows.length) return <div className="rounded-gmv-lg border-2 border-dashed border-gmv-border bg-gmv-bg px-6 py-12 text-center text-sm text-gmv-muted">Không có dữ liệu</div>;
  return (
    <div className="overflow-hidden rounded-gmv-lg border border-gmv-border bg-gmv-canvas">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gmv-table-head">
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gmv-muted">Kênh</th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-gmv-muted">GMV Final</th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-gmv-muted">Doanh thu VNĐ</th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-gmv-muted">GMV RMB</th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-gmv-muted">Số đơn</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r: any, i: number) => (
            <tr key={i} className="border-t border-gmv-border hover:bg-gmv-bg/50">
              <td className="px-4 py-2.5 font-medium">{r.channel ?? r.channel_type ?? "—"}</td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums">{fmtGMV(r.gmv_final ?? 0)}</td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums">{fmtVND(r.real_pay_vnd ?? 0)}</td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums">{fmtGMV(r.gmv_rmb ?? 0)}</td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums">{(r.count ?? 0).toLocaleString("vi-VN")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Sub-tab: Đối soát ── */
function ReconSubTab() {
  const [loading, setLoading] = useState(true);
  const [warnings, setWarnings] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get("/api/v1/recon/internal");
        setWarnings(res.data?.warnings || res.data?.data || []);
      } catch (err) {
        console.error("Fetch recon failed:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const warningTypeLabel: Record<string, { label: string; tone: string }> = {
    DUPLICATE: { label: "Trùng đơn", tone: "bg-red-100 text-red-700" },
    MISSING_DATA: { label: "Thiếu trường", tone: "bg-orange-100 text-orange-700" },
    ORPHAN_DATA: { label: "Sale/kênh lạ", tone: "bg-yellow-100 text-yellow-700" },
    RATE_DEVIATION: { label: "Lệch tỷ giá", tone: "bg-blue-100 text-blue-700" },
  };

  if (loading) return <TableSkeleton cols={4} rows={6} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h3 className="text-base font-semibold text-gmv-text-strong">Đối soát nội bộ</h3>
        <span className="rounded-full bg-gmv-bg px-2.5 py-0.5 text-xs font-medium text-gmv-muted">
          {warnings.length} cảnh báo
        </span>
      </div>

      {warnings.length === 0 ? (
        <div className="rounded-gmv-lg border-2 border-dashed border-green-200 bg-green-50 px-6 py-12 text-center text-sm text-green-700">
          Không có cảnh báo — dữ liệu sạch
        </div>
      ) : (
        <div className="overflow-hidden rounded-gmv-lg border border-gmv-border bg-gmv-canvas">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gmv-table-head">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gmv-muted">Loại</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gmv-muted">Payment ID</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gmv-muted">Chi tiết</th>
              </tr>
            </thead>
            <tbody>
              {warnings.map((w: any, i: number) => {
                const type = w.warning_type ?? w.type ?? "UNKNOWN";
                const meta = warningTypeLabel[type] ?? { label: type, tone: "bg-gray-100 text-gray-600" };
                return (
                  <tr key={i} className="border-t border-gmv-border hover:bg-gmv-bg/50">
                    <td className="px-4 py-2.5">
                      <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium", meta.tone)}>
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">{w.payment_id ?? "—"}</td>
                    <td className="px-4 py-2.5 text-xs text-gmv-muted">
                      {w.message ?? (w.details ? JSON.stringify(w.details) : "—")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── Sub-tab: Danh mục ── */
type MasterTab = "sales" | "channels" | "packages" | "customers";
const MASTER_TABS: { id: MasterTab; label: string; endpoint: string; columns: { key: string; label: string; align?: "right" }[] }[] = [
  { id: "sales", label: "Sale", endpoint: "/api/v1/payments/master/sales",
    columns: [
      { key: "full_name", label: "Tên" }, { key: "short_code", label: "Short Code" },
      { key: "team", label: "Team" }, { key: "khoi", label: "Khối" }, { key: "active", label: "Active" },
    ] },
  { id: "channels", label: "Kênh", endpoint: "/api/v1/payments/master/channels",
    columns: [
      { key: "channel_code", label: "Mã kênh" }, { key: "name", label: "Tên" }, { key: "type", label: "Loại" },
    ] },
  { id: "packages", label: "Gói học", endpoint: "/api/v1/payments/master/packages",
    columns: [
      { key: "name", label: "Tên gói" }, { key: "fixed", label: "Fixed" },
    ] },
  { id: "customers", label: "Khách hàng", endpoint: "/api/v1/customers/search",
    columns: [
      { key: "uid", label: "UID" }, { key: "full_name", label: "Tên" }, { key: "phone", label: "SĐT" },
    ] },
];

function MasterSubTab({ canWrite }: { canWrite: boolean }) {
  const [activeMaster, setActiveMaster] = useState<MasterTab>("sales");
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const current = MASTER_TABS.find((t) => t.id === activeMaster)!;

  useEffect(() => {
    setSearch("");
    setRows([]);
    (async () => {
      setLoading(true);
      try {
        // customers requires q param
        if (activeMaster === "customers") {
          setLoading(false);
          return; // wait for search
        }
        const res = await api.get(current.endpoint);
        setRows(res.data || []);
      } catch (err) {
        console.error(`Fetch ${activeMaster} failed:`, err);
      } finally {
        setLoading(false);
      }
    })();
  }, [activeMaster, current.endpoint]);

  // Search customers
  useEffect(() => {
    if (activeMaster !== "customers") return;
    if (!search.trim() || search.trim().length < 2) { setRows([]); return; }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.get("/api/v1/customers/search", { params: { q: search.trim() } });
        setRows(res.data || []);
      } catch { /* ignore */ } finally { setLoading(false); }
    }, 400);
    return () => clearTimeout(timer);
  }, [search, activeMaster]);

  // Filter non-customer tabs locally
  const filteredRows = activeMaster !== "customers" && search.trim()
    ? rows.filter((r) => Object.values(r).some((v) => String(v ?? "").toLowerCase().includes(search.toLowerCase())))
    : rows;

  return (
    <div className="space-y-4">
      <div className="flex gap-1">
        {MASTER_TABS.map((tab) => (
          <button key={tab.id} type="button" onClick={() => setActiveMaster(tab.id)}
            className={cn("rounded-gmv-md px-3 py-1.5 text-sm font-medium transition",
              activeMaster === tab.id ? "bg-gmv-primary text-white shadow-gmv-1" : "bg-gmv-bg text-gmv-muted hover:text-gmv-text"
            )}>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        {canWrite && activeMaster !== "customers" && (
          <button type="button" className="inline-flex items-center gap-1.5 rounded-gmv-md bg-gmv-primary px-3 py-2 text-sm font-medium text-white shadow-gmv-1 transition hover:bg-gmv-primary/90">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Thêm {current.label}
          </button>
        )}
        <div className="flex-1" />
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder={activeMaster === "customers" ? "Nhập uid, tên hoặc SĐT để tìm..." : `Tìm ${current.label.toLowerCase()}...`}
          className="w-64 rounded-gmv-md border border-gmv-border bg-gmv-canvas px-3 py-2 text-sm text-gmv-text placeholder:text-gmv-muted focus:border-gmv-primary focus:outline-none focus:ring-1 focus:ring-gmv-primary/30" />
      </div>

      {loading ? <TableSkeleton cols={current.columns.length} rows={6} /> : filteredRows.length === 0 ? (
        <div className="rounded-gmv-lg border-2 border-dashed border-gmv-border bg-gmv-bg px-6 py-12 text-center text-sm text-gmv-muted">
          {activeMaster === "customers" && !search.trim() ? "Nhập ít nhất 2 ký tự để tìm khách hàng" : "Không có dữ liệu"}
        </div>
      ) : (
        <div className="overflow-hidden rounded-gmv-lg border border-gmv-border bg-gmv-canvas">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gmv-table-head">
                {current.columns.map((col) => (
                  <th key={col.key} className={cn("px-4 py-3 text-xs font-semibold uppercase text-gmv-muted", col.align === "right" ? "text-right" : "text-left")}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row: any, i: number) => (
                <tr key={row.id ?? row.uid ?? i} className="border-t border-gmv-border hover:bg-gmv-bg/50">
                  {current.columns.map((col) => (
                    <td key={col.key} className={cn("px-4 py-2.5", col.align === "right" && "text-right")}>
                      {col.key === "active" ? <BoolBadge value={row[col.key]} yes="Active" no="Inactive" /> : (String(row[col.key] ?? "—"))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && filteredRows.length > 0 && (
        <p className="text-xs text-gmv-muted">{filteredRows.length.toLocaleString("vi-VN")} dòng</p>
      )}
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
      <div className="flex items-center gap-1.5 rounded-gmv-lg bg-gmv-bg p-1.5">
        {SUB_TABS.map((tab) => (
          <button key={tab.id} type="button" onClick={() => setActiveSubTab(tab.id)}
            className={cn("rounded-gmv-md px-4 py-2 text-sm font-semibold transition",
              activeSubTab === tab.id ? tab.activeClass : tab.inactiveClass
            )}>
            {tab.label}
          </button>
        ))}
      </div>

      {activeSubTab === "grid" && <GridSubTab canWrite={canWrite} />}
      {activeSubTab === "reports" && <ReportsSubTab />}
      {activeSubTab === "recon" && <ReconSubTab />}
      {activeSubTab === "master" && <MasterSubTab canWrite={canWrite} />}
    </div>
  );
}
