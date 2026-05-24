import { useCallback, useEffect, useState } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { endpoints } from "../lib/api";
import { fmtRate, isValidSaleName, pctOf, safeDivide } from "../lib/metrics";
import type { DashboardDailyTrends, DashboardLiveSummary } from "../types/order";

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------
function fmt(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n);
}
function fmtM(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000)     return (n / 1_000).toFixed(0) + "K";
  return String(n);
}
function todayStr() { return new Date().toISOString().slice(0, 10); }
function firstOfMonth() {
  const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-01`;
}

function resolvePeriod(rangeKey: string, customStart: string, customEnd: string) {
  const today = todayStr();
  if (rangeKey === "today") return { start: today, end: today };
  if (rangeKey === "week") {
    const d = new Date();
    const monday = new Date(d);
    const dow = d.getDay();
    monday.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
    return { start: monday.toISOString().slice(0, 10), end: today };
  }
  if (rangeKey === "month") return { start: firstOfMonth(), end: today };
  if (rangeKey === "last_month") {
    const d = new Date();
    const firstThis = new Date(d.getFullYear(), d.getMonth(), 1);
    const lastPrev = new Date(firstThis.getTime() - 86_400_000);
    const firstPrev = new Date(lastPrev.getFullYear(), lastPrev.getMonth(), 1);
    return {
      start: firstPrev.toISOString().slice(0, 10),
      end: lastPrev.toISOString().slice(0, 10),
    };
  }
  if (rangeKey === "custom") return { start: customStart, end: customEnd };
  return { start: firstOfMonth(), end: today };
}

const BAR_COLORS = ["#6366f1","#8b5cf6","#a78bfa","#c4b5fd","#ddd6fe",
                    "#818cf8","#7c3aed","#4f46e5","#6d28d9","#5b21b6"];

const RANGE_OPTIONS = [
  { key: "today",      label: "Hôm nay" },
  { key: "week",       label: "Tuần này" },
  { key: "month",      label: "Tháng này" },
  { key: "last_month", label: "Tháng trước" },
  { key: "custom",     label: "Tùy chọn" },
];

type SaleDetailRow = DashboardLiveSummary["top_sales"][number];

type DetailColKind = "text" | "num" | "rate" | "rmb" | "minutes" | "aov";

const SALE_DETAIL_COLUMNS: {
  label: string;
  key: keyof SaleDetailRow | "aov_rmb";
  kind: DetailColKind;
  sticky?: boolean;
}[] = [
  { label: "Bộ phận", key: "department", kind: "text" },
  { label: "Họ và tên Sale", key: "sale_name", kind: "text", sticky: true },
  { label: "Lead chạy Ads", key: "ad_leads", kind: "num" },
  { label: "Lead lên tay", key: "ad_leads_manual", kind: "num" },
  { label: "Lead giới thiệu", key: "referral_leads", kind: "num" },
  { label: "Tổng Leads", key: "total_leads", kind: "num" },
  { label: "Leads kho chung", key: "gd_leads", kind: "num" },
  { label: "Số lượng hẹn", key: "invitation_number", kind: "num" },
  { label: "Lịch hẹn", key: "scheduled_classes", kind: "num" },
  { label: "Tỷ lệ xem trước", key: "preview_rate", kind: "rate" },
  { label: "Học thử thành công (Trials)", key: "completed_classes", kind: "num" },
  { label: "Tỷ lệ hoàn thành", key: "completion_rate", kind: "rate" },
  { label: "Số đơn chốt", key: "orders", kind: "num" },
  { label: "Doanh thu CRM (RMB)", key: "gmv_rmb", kind: "rmb" },
  { label: "AOV (RMB)", key: "aov_rmb", kind: "aov" },
  { label: "Tổng thời lượng gọi", key: "total_call_time", kind: "minutes" },
  { label: "Tổng cuộc gọi", key: "total_dials", kind: "num" },
  { label: "Tổng kết nối", key: "total_connections", kind: "num" },
  { label: "Tỷ lệ kết nối", key: "connection_rate", kind: "rate" },
  { label: "Cuộc gọi > 3 phút", key: "over_3min_connections", kind: "num" },
  { label: "Tỷ lệ cuộc gọi > 3 phút", key: "over_3min_rate", kind: "rate" },
];

const STICKY_HEAD =
  "sticky left-0 z-20 bg-slate-900 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.25)]";
const STICKY_CELL =
  "sticky left-0 z-10 bg-slate-800 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.25)]";

function cellText(v: unknown): string {
  if (v == null || v === "") return "—";
  return String(v);
}

function cellNum(v: unknown): string {
  const n = Number(v);
  if (v == null || v === "" || Number.isNaN(n)) return "0";
  return fmt(n);
}

function detailCellValue(row: SaleDetailRow, col: (typeof SALE_DETAIL_COLUMNS)[number]): string {
  if (col.key === "aov_rmb") {
    const gmv = row.gmv_rmb ?? row.total_amount ?? 0;
    const orders = row.orders ?? 0;
    const aov = row.avg_price ?? safeDivide(gmv, orders);
    return cellNum(aov);
  }
  const raw = row[col.key as keyof SaleDetailRow];
  switch (col.kind) {
    case "text":
      return cellText(raw);
    case "num":
      return cellNum(raw);
    case "rate":
      return fmtRate(Number(raw ?? 0));
    case "rmb":
      return cellNum(raw);
    case "minutes": {
      const n = Number(raw);
      if (raw == null || Number.isNaN(n)) return "0 phút";
      return `${n.toFixed(1)} phút`;
    }
    default:
      return cellText(raw);
  }
}

// --------------------------------------------------------------------------
// Sub-components
// --------------------------------------------------------------------------
function KpiCard({ label, value, sub, highlight }: {
  label: string; value: string; sub?: string; highlight?: boolean;
}) {
  return (
    <div className={`rounded-xl p-4 ring-1 ${
      highlight ? "bg-blue-900/40 ring-blue-600" : "bg-slate-800/60 ring-slate-700"
    }`}>
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums leading-tight ${
        highlight ? "text-blue-300" : "text-slate-100"
      }`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

function ConversionBar({ label, value }: { label: string; value: number }) {
  const pct = Number.isFinite(value) && !Number.isNaN(value) ? value : 0;
  const barWidth = Math.min(Math.abs(pct), 100);
  return (
    <div className="flex items-center gap-3">
      <span className="w-12 text-right text-xs font-semibold text-slate-400">{label}</span>
      <div className="flex-1 h-5 rounded-full bg-slate-700 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-500"
          style={{ width: `${barWidth}%` }}
        />
      </div>
      <span className="w-14 text-right text-xs text-slate-300 tabular-nums">{pct.toFixed(1)}%</span>
    </div>
  );
}

// --------------------------------------------------------------------------
// Main component
// --------------------------------------------------------------------------
export default function Module6Tab() {
  const [rangeKey, setRangeKey]       = useState("month");
  const [customStart, setCustomStart] = useState(firstOfMonth());
  const [customEnd, setCustomEnd]     = useState(todayStr());
  const [teamFilter, setTeamFilter]   = useState("");
  const [saleFilter, setSaleFilter]   = useState("");

  const [live, setLive]         = useState<DashboardLiveSummary | null>(null);
  const [trends, setTrends]     = useState<DashboardDailyTrends | null>(null);
  const [kpiLoading, setKpiLoading] = useState(false);
  const [trendsLoading, setTrendsLoading] = useState(false);
  const [error, setError]       = useState("");
  const [teams, setTeams]       = useState<string[]>([]);
  const [sales, setSales]       = useState<string[]>([]);
  const [hasCrmData, setHasCrmData] = useState<boolean | null>(null);

  // Load filter options once
  useEffect(() => {
    endpoints.dashboard.filters()
      .then((r) => {
        setTeams(r.data.teams);
        setSales(r.data.sales);
        setHasCrmData(r.data.sales.length > 0);
      })
      .catch(() => setHasCrmData(false));
  }, []);

  const load = useCallback(async () => {
    setError("");
    setKpiLoading(true);
    setTrendsLoading(true);

    const { start, end } = resolvePeriod(rangeKey, customStart, customEnd);
    const params = {
      start_date: start,
      end_date: end,
      ...(teamFilter ? { team: teamFilter } : {}),
      ...(saleFilter ? { sale: saleFilter } : {}),
    };

    try {
      const [liveRes, trendsRes] = await Promise.all([
        endpoints.dashboard.liveSummary(params).finally(() => setKpiLoading(false)),
        endpoints.dashboard.dailyTrends(params).finally(() => setTrendsLoading(false)),
      ]);
      setLive(liveRes.data);
      setTrends(trendsRes.data);
    } catch (e: unknown) {
      setKpiLoading(false);
      setTrendsLoading(false);
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg || "Không tải được dữ liệu dashboard.");
    }
  }, [rangeKey, customStart, customEnd, teamFilter, saleFilter]);

  useEffect(() => { load(); }, [load]);

  const period = live?.period ?? trends?.period;
  const kpi = live?.kpi;
  const meta = live?.meta;
  const fx = meta?.exchange_rate ?? kpi?.exchange_rate ?? 3700;
  const revenueData = (trends?.revenue_by_date ?? []).map((d) => ({
    ...d,
    gmv_rmb: d.gmv_rmb ?? d.amount ?? 0,
    collected_vnd: d.collected_vnd ?? d.collected ?? 0,
  }));
  const topSales    = (live?.top_sales ?? []).filter((r) => isValidSaleName(r.sale_name));
  const topSalesChart = topSales.slice(0, 10).map((r) => ({
    ...r,
    gmv_rmb: r.gmv_rmb ?? r.total_amount ?? 0,
  }));
  const conversion  = live?.conversion ?? [];
  const today       = live?.today;
  const loading = kpiLoading || trendsLoading;
  const gmvRmb = (n: number) => fmt(n) + " RMB";
  const vnd = (n: number) => fmt(n) + " ₫";
  const todayLabel = today?.is_calendar_today === false && today?.date
    ? `Ngày ${today.date.slice(8, 10)}/${today.date.slice(5, 7)} (cuối kỳ)`
    : "Hôm nay";

  return (
    <div className="space-y-5 p-5">

      {/* ── HEADER & FILTERS ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-100">Sale Leader / System</h2>
          <p className="text-xs text-slate-400">
            {period ? `${period.start} → ${period.end}` : "Dashboard tổng quan hiệu suất Sale"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Date range tabs */}
          <div className="flex rounded-lg overflow-hidden ring-1 ring-slate-600">
            {RANGE_OPTIONS.map(({ key, label }) => (
              <button key={key} onClick={() => setRangeKey(key)}
                className={`px-3 py-1.5 text-xs font-medium transition ${
                  rangeKey === key ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}>{label}</button>
            ))}
          </div>
          {/* Custom date pickers */}
          {rangeKey === "custom" && (
            <div className="flex items-center gap-2">
              <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)}
                className="rounded-lg border border-slate-600 bg-slate-800 px-2 py-1.5 text-xs text-slate-200 focus:outline-none" />
              <span className="text-slate-500 text-xs">→</span>
              <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)}
                className="rounded-lg border border-slate-600 bg-slate-800 px-2 py-1.5 text-xs text-slate-200 focus:outline-none" />
            </div>
          )}
          {/* Filters */}
          <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}
            className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 focus:outline-none">
            <option value="">Tất cả team</option>
            {teams.map((t) => <option key={t}>{t}</option>)}
          </select>
          <select value={saleFilter} onChange={(e) => setSaleFilter(e.target.value)}
            className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 focus:outline-none">
            <option value="">Tất cả sale</option>
            {sales.map((s) => <option key={s}>{s}</option>)}
          </select>
          <button onClick={load} disabled={loading}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50 transition">
            {loading ? "⟳" : "Làm mới"}
          </button>
        </div>
      </div>

      {/* No CRM data warning */}
      {hasCrmData === false && (
        <div className="rounded-lg bg-amber-950/60 px-4 py-3 text-sm text-amber-300 ring-1 ring-amber-800">
          Chưa có dữ liệu CRM trong database — vào tab <strong>Đồng bộ CRM</strong>, bấm{" "}
          <strong>LẤY DỮ LIỆU</strong> ít nhất một lần, rồi quay lại đây bấm <strong>Làm mới</strong>.
        </div>
      )}

      {hasCrmData && (trends?.row_count ?? 0) === 0 && !trendsLoading && period && (
        <div className="rounded-lg bg-amber-950/60 px-4 py-3 text-sm text-amber-300 ring-1 ring-amber-800">
          Có dữ liệu CRM trong database nhưng <strong>không có dòng daily</strong> trong kỳ{" "}
          {period.start} → {period.end}.
          Vào tab <strong>Đồng bộ CRM</strong> và sync từng ngày trong kỳ.
        </div>
      )}

      {(live || trends) && !loading && (
        <div className="rounded-lg bg-slate-800/50 px-4 py-2 text-xs text-slate-400 ring-1 ring-slate-700">
          Kiến trúc Hybrid: KPI & Top Sale = <strong className="text-slate-300">PalFish live</strong>
          {meta?.department_fallback ? " (fallback org VN)" : ""} · Biểu đồ ={" "}
          <strong className="text-slate-300">DB daily</strong>
          ({trends?.meta?.sync_days ?? 0} ngày sync, {trends?.row_count ?? 0} dòng).
          GMV CRM = RMB · Tiền về = VND · Tỷ giá: 1 RMB = {fmt(fx)} ₫.
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-950/60 px-4 py-3 text-sm text-red-300 ring-1 ring-red-800">{error}</div>
      )}

      {/* ── KPI CARDS (PalFish live — có thể mất 1–2s) ── */}
      <div className="relative">
        {kpiLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-slate-900/70 backdrop-blur-[1px]">
            <span className="flex items-center gap-2 text-sm text-slate-300">
              <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
              Đang lấy KPI từ PalFish…
            </span>
          </div>
        )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <KpiCard label="Tổng số L1"   value={fmt(kpi?.l1 ?? 0)} />
        <KpiCard label="Tổng số L3"   value={fmt(kpi?.l3 ?? 0)} />
        <KpiCard label="Tổng số L4"   value={fmt(kpi?.l4 ?? 0)} />
        <KpiCard label="Tổng số L8"   value={fmt(kpi?.l8 ?? 0)} sub="Nguồn: CRM" />
        <KpiCard label="GMV CRM" value={gmvRmb(kpi?.total_gmv_rmb ?? kpi?.total_amount_qr ?? 0)} sub={`≈ ${vnd((kpi?.gmv_vnd_est ?? (kpi?.total_gmv_rmb ?? 0) * fx))}`} />
        <KpiCard label="Doanh thu (đã thu)"  value={vnd(kpi?.total_collected_vnd ?? kpi?.total_collected ?? 0)} sub="Nguồn: Kế toán (PayOS)" highlight />
        <KpiCard label="AOV (đã thu)"        value={vnd(kpi?.aov ?? 0)} sub="VND / đơn đã thu (PayOS)" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <KpiCard label="C1 — Thời lượng gọi" value={`${(kpi?.c1 ?? 0).toFixed(1)} phút`} />
        <KpiCard label="C2 — Số cuộc gọi" value={fmt(kpi?.c2 ?? 0)} />
        <KpiCard label="C4 — Tỷ lệ kết nối" value={fmtRate(kpi?.c4)} />
        <KpiCard label="C5 — Gọi > 3 phút" value={fmtRate(kpi?.c5)} />
        <KpiCard label="L1.0 — Kho chung" value={fmt(kpi?.l1_0 ?? 0)} />
        <KpiCard label="L1.1 — Lead phân" value={fmt(kpi?.l1_1 ?? 0)} />
        <KpiCard label="L1.2 — Giới thiệu" value={fmt(kpi?.l1_2 ?? 0)} />
        <KpiCard label="L3.3 — Preview" value={fmtRate(kpi?.l3_3)} sub={`Lịch hẹn: ${fmt(kpi?.l3_1 ?? 0)}`} />
      </div>
      </div>

      {/* ── CHARTS ROW ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Line chart */}
        <div className="lg:col-span-2 rounded-xl bg-slate-800/60 p-4 ring-1 ring-slate-700">
          <p className="mb-3 text-sm font-semibold text-slate-300">GMV CRM & tiền về theo ngày (DB daily)</p>
          {revenueData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={revenueData} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 10 }}
                    tickFormatter={(v) => v.slice(5)} />
                  <YAxis yAxisId="rmb" tick={{ fill: "#94a3b8", fontSize: 10 }}
                    tickFormatter={(v) => fmtM(v)} />
                  <YAxis yAxisId="vnd" orientation="right" tick={{ fill: "#94a3b8", fontSize: 10 }}
                    tickFormatter={(v) => fmtM(v)} />
                  <Tooltip
                    contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
                    formatter={(v, name) => {
                      const n = Number(v);
                      if (String(name).includes("VND") || String(name).includes("Đã thu")) return [vnd(n), name];
                      return [gmvRmb(n), name];
                    }}
                    labelStyle={{ color: "#e2e8f0" }}
                  />
                  <Line yAxisId="rmb" type="monotone" dataKey="gmv_rmb" stroke="#6366f1" strokeWidth={2} dot={false} name="GMV (RMB)" />
                  <Line yAxisId="vnd" type="monotone" dataKey="collected_vnd" stroke="#22c55e" strokeWidth={2} dot={false} name="Đã thu (VND)" />
                </LineChart>
              </ResponsiveContainer>
              <div className="mt-2 flex gap-4 text-xs text-slate-400">
                {[["#6366f1","GMV (RMB)"],["#22c55e","Đã thu (VND)"]].map(([c,l])=>(
                  <span key={l} className="flex items-center gap-1">
                    <span className="inline-block h-2 w-4 rounded-full" style={{background:c}}/>
                    {l}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <div className="flex h-[220px] items-center justify-center text-sm text-slate-500">
              {trendsLoading ? "Đang tải biểu đồ…" : "Chưa có dữ liệu daily — sync CRM từng ngày"}
            </div>
          )}
        </div>

        {/* Today panel */}
        <div className="rounded-xl bg-slate-800/60 p-4 ring-1 ring-slate-700">
          <p className="mb-3 text-sm font-semibold text-slate-300">{todayLabel}</p>
          <div className="space-y-3">
            {[
              ["Số đơn mới",         fmt(today?.orders ?? 0)],
              ["GMV CRM (delta ngày)", gmvRmb(today?.gmv_rmb ?? today?.amount ?? 0)],
              ["GMV MTD (snapshot)",   gmvRmb(today?.gmv_rmb_mtd ?? 0)],
              ["Doanh thu đã thu",   vnd(today?.collected_vnd ?? today?.collected ?? 0)],
            ].map(([label, val]) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-xs text-slate-400">{label}</span>
                <span className="text-xs font-semibold text-slate-200 tabular-nums">{val}</span>
              </div>
            ))}
          </div>
          {/* Tỷ lệ thu */}
          {(today?.gmv_rmb ?? today?.amount ?? 0) > 0 && (() => {
            const gmvVndEst = (today?.gmv_rmb ?? today?.amount ?? 0) * fx;
            const collectPct = pctOf(today?.collected_vnd ?? today?.collected ?? 0, gmvVndEst);
            return (
            <div className="mt-4">
              <p className="mb-2 text-xs text-slate-400">Tỷ lệ thu hôm nay</p>
              <div className="h-3 rounded-full bg-slate-700 overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${collectPct}%` }}
                />
              </div>
              <p className="mt-1 text-right text-xs text-emerald-400">
                {collectPct}%
              </p>
            </div>
            );
          })()}
        </div>
      </div>

      {/* ── CONVERSION + TOP SALES ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Conversion */}
        <div className="rounded-xl bg-slate-800/60 p-4 ring-1 ring-slate-700">
          <p className="mb-4 text-sm font-semibold text-slate-300">Tỷ lệ chuyển đổi từng giai đoạn</p>
          <div className="space-y-3">
            {(conversion.length > 0 ? conversion : [
              {label:"L3/L1",value:0},{label:"L4/L3",value:0},
              {label:"L8/L4",value:0},
            ]).map((c) => <ConversionBar key={c.label} label={c.label} value={c.value} />)}
          </div>
          {conversion.every((c) => c.value === 0) && (
            <p className="mt-3 text-xs text-slate-500 text-center">
              Tỷ lệ tính từ CRM: L3=邀约, L4=完课, L8=签单
            </p>
          )}
        </div>

        {/* Top Sales */}
        <div className="rounded-xl bg-slate-800/60 p-4 ring-1 ring-slate-700">
          <p className="mb-3 text-sm font-semibold text-slate-300">Top Sale (GMV RMB — PalFish live)</p>
          {topSales.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={topSalesChart} layout="vertical"
                margin={{ top: 0, right: 50, bottom: 0, left: 70 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                <XAxis type="number" tickFormatter={(v) => fmtM(v) + " RMB"}
                  tick={{ fill: "#94a3b8", fontSize: 10 }} />
                <YAxis type="category" dataKey="sale_name" width={68}
                  tick={{ fill: "#cbd5e1", fontSize: 11 }} />
                <Tooltip
                  formatter={(v) => [gmvRmb(Number(v))]}
                  contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
                />
                <Bar dataKey="gmv_rmb" radius={[0,4,4,0]} name="GMV RMB">
                  {topSalesChart.map((_, i) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[200px] items-center justify-center text-sm text-slate-500">
              {kpiLoading ? "Đang tải từ PalFish…" : "Chưa có dữ liệu"}
            </div>
          )}
        </div>
      </div>

      {/* ── DETAIL TABLE ── */}
      <div className="rounded-xl bg-slate-800/60 ring-1 ring-slate-700">
        <div className="p-4 border-b border-slate-700 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-300">Chi tiết theo Sale</p>
          <span className="text-xs text-slate-500">{topSales.length} sale</span>
        </div>
        {topSales.length > 0 ? (
          <div className="overflow-x-auto max-w-full">
            <table className="w-full min-w-[1200px] text-xs">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400">
                  {SALE_DETAIL_COLUMNS.map((col) => (
                    <th
                      key={col.label}
                      className={`px-3 py-2 text-left font-medium whitespace-nowrap text-[11px] ${
                        col.sticky ? STICKY_HEAD : ""
                      }`}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {topSales.map((r) => (
                  <tr
                    key={r.sale_name}
                    className="group border-b border-slate-700/50 hover:bg-slate-700/30 transition"
                  >
                    {SALE_DETAIL_COLUMNS.map((col) => (
                      <td
                        key={col.label}
                        className={`px-3 py-2 tabular-nums whitespace-nowrap ${
                          col.sticky
                            ? `${STICKY_CELL} group-hover:bg-slate-700/30 font-medium text-slate-100`
                            : col.key === "department"
                              ? "text-slate-400"
                              : "text-slate-200"
                        }`}
                      >
                        {detailCellValue(r, col)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-12 text-center text-sm text-slate-500">
            {loading ? "Đang tải dữ liệu…" : "Chưa có data — lấy dữ liệu CRM ở tab Đồng bộ CRM trước"}
          </div>
        )}
      </div>
    </div>
  );
}
