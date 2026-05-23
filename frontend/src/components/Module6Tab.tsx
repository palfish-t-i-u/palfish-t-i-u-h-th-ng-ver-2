import { useCallback, useEffect, useState } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { endpoints } from "../lib/api";
import type { DashboardSummary } from "../types/order";

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

const BAR_COLORS = ["#6366f1","#8b5cf6","#a78bfa","#c4b5fd","#ddd6fe",
                    "#818cf8","#7c3aed","#4f46e5","#6d28d9","#5b21b6"];

const RANGE_OPTIONS = [
  { key: "today",      label: "Hôm nay" },
  { key: "week",       label: "Tuần này" },
  { key: "month",      label: "Tháng này" },
  { key: "last_month", label: "Tháng trước" },
  { key: "custom",     label: "Tùy chọn" },
];

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
  return (
    <div className="flex items-center gap-3">
      <span className="w-12 text-right text-xs font-semibold text-slate-400">{label}</span>
      <div className="flex-1 h-5 rounded-full bg-slate-700 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-500"
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
      <span className="w-10 text-xs text-slate-300 tabular-nums">{value}%</span>
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

  const [data, setData]         = useState<DashboardSummary | null>(null);
  const [loading, setLoading]   = useState(false);
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
    setLoading(true);
    setError("");
    try {
      const params: Record<string, string> = { range_key: rangeKey };
      if (rangeKey === "custom") { params.start = customStart; params.end = customEnd; }
      if (teamFilter) params.team = teamFilter;
      if (saleFilter) params.sale = saleFilter;
      const res = await endpoints.dashboard.summary(params);
      setData(res.data);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg || "Không tải được dữ liệu dashboard.");
    } finally {
      setLoading(false);
    }
  }, [rangeKey, customStart, customEnd, teamFilter, saleFilter]);

  useEffect(() => { load(); }, [load]);

  const kpi = data?.kpi;
  const revenueData = data?.revenue_by_date ?? [];
  const topSales    = data?.top_sales ?? [];
  const conversion  = data?.conversion ?? [];
  const today       = data?.today;

  return (
    <div className="space-y-5 p-5">

      {/* ── HEADER & FILTERS ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-100">Sale Leader / System</h2>
          <p className="text-xs text-slate-400">
            {data ? `${data.period.start} → ${data.period.end}` : "Dashboard tổng quan hiệu suất Sale"}
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

      {hasCrmData && kpi?.total_orders === 0 && !loading && (
        <div className="rounded-lg bg-amber-950/60 px-4 py-3 text-sm text-amber-300 ring-1 ring-amber-800">
          Có dữ liệu CRM nhưng không khớp bộ lọc thời gian hiện tại ({data?.period.start} → {data?.period.end}).
          Thử chọn <strong>Tháng này</strong> hoặc <strong>Tùy chọn</strong> trùng ngày đã export.
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-950/60 px-4 py-3 text-sm text-red-300 ring-1 ring-red-800">{error}</div>
      )}

      {/* ── KPI CARDS ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <KpiCard label="Tổng số L1"   value={fmt(kpi?.l1 ?? 0)} />
        <KpiCard label="Tổng số L3"   value={fmt(kpi?.l3 ?? 0)} />
        <KpiCard label="Tổng số L4"   value={fmt(kpi?.l4 ?? 0)} />
        <KpiCard label="Tổng số L8"   value={fmt(kpi?.l8 ?? 0)} />
        <KpiCard label="Doanh thu (tạo QR)"  value={fmt(kpi?.total_amount_qr ?? 0) + " ₫"} sub="Đã tạo mã" />
        <KpiCard label="Doanh thu (đã thu)"  value={fmt(kpi?.total_collected ?? 0) + " ₫"} sub="Tiền về TK" highlight />
        <KpiCard label="AOV (đã thu)"        value={fmt(kpi?.aov ?? 0) + " ₫"} sub="Trung bình/đơn" />
      </div>

      {/* ── CHARTS ROW ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Line chart */}
        <div className="lg:col-span-2 rounded-xl bg-slate-800/60 p-4 ring-1 ring-slate-700">
          <p className="mb-3 text-sm font-semibold text-slate-300">Doanh thu theo ngày</p>
          {revenueData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={revenueData} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 10 }}
                    tickFormatter={(v) => v.slice(5)} />
                  <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }}
                    tickFormatter={(v) => fmtM(v)} />
                  <Tooltip
                    contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
                    formatter={(v) => [fmt(Number(v)) + " ₫"]}
                    labelStyle={{ color: "#e2e8f0" }}
                  />
                  <Line type="monotone" dataKey="amount"    stroke="#6366f1" strokeWidth={2} dot={false} name="Tạo QR" />
                  <Line type="monotone" dataKey="collected" stroke="#22c55e" strokeWidth={2} dot={false} name="Đã thu" />
                </LineChart>
              </ResponsiveContainer>
              <div className="mt-2 flex gap-4 text-xs text-slate-400">
                {[["#6366f1","Tạo QR"],["#22c55e","Đã thu"]].map(([c,l])=>(
                  <span key={l} className="flex items-center gap-1">
                    <span className="inline-block h-2 w-4 rounded-full" style={{background:c}}/>
                    {l}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <div className="flex h-[220px] items-center justify-center text-sm text-slate-500">
              {loading ? "Đang tải…" : "Chưa có dữ liệu"}
            </div>
          )}
        </div>

        {/* Today panel */}
        <div className="rounded-xl bg-slate-800/60 p-4 ring-1 ring-slate-700">
          <p className="mb-3 text-sm font-semibold text-slate-300">Hôm nay</p>
          <div className="space-y-3">
            {[
              ["Số đơn mới",         fmt(today?.orders ?? 0)],
              ["Doanh thu tạo QR",   fmt(today?.amount ?? 0) + " ₫"],
              ["Doanh thu đã thu",   fmt(today?.collected ?? 0) + " ₫"],
            ].map(([label, val]) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-xs text-slate-400">{label}</span>
                <span className="text-xs font-semibold text-slate-200 tabular-nums">{val}</span>
              </div>
            ))}
          </div>
          {/* Tỷ lệ thu */}
          {today && today.amount > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs text-slate-400">Tỷ lệ thu hôm nay</p>
              <div className="h-3 rounded-full bg-slate-700 overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${Math.round(today.collected / today.amount * 100)}%` }}
                />
              </div>
              <p className="mt-1 text-right text-xs text-emerald-400">
                {Math.round(today.collected / today.amount * 100)}%
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── CONVERSION + TOP SALES ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Conversion */}
        <div className="rounded-xl bg-slate-800/60 p-4 ring-1 ring-slate-700">
          <p className="mb-4 text-sm font-semibold text-slate-300">Tỷ lệ chuyển đổi từng giai đoạn</p>
          <div className="space-y-3">
            {(conversion.length > 0 ? conversion : [
              {label:"L2/L1",value:0},{label:"L3/L2",value:0},
              {label:"L4/L3",value:0},{label:"L8/L4",value:0},
            ]).map((c) => <ConversionBar key={c.label} label={c.label} value={c.value} />)}
          </div>
          {conversion.every((c) => c.value === 0) && (
            <p className="mt-3 text-xs text-slate-500 text-center">
              Tỷ lệ tính từ CRM: L2=接通, L3=邀约, L4=完课, L8=签单
            </p>
          )}
        </div>

        {/* Top Sales */}
        <div className="rounded-xl bg-slate-800/60 p-4 ring-1 ring-slate-700">
          <p className="mb-3 text-sm font-semibold text-slate-300">Top Sale (Doanh thu)</p>
          {topSales.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={topSales} layout="vertical"
                margin={{ top: 0, right: 50, bottom: 0, left: 70 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                <XAxis type="number" tickFormatter={(v) => fmtM(v)}
                  tick={{ fill: "#94a3b8", fontSize: 10 }} />
                <YAxis type="category" dataKey="sale_name" width={68}
                  tick={{ fill: "#cbd5e1", fontSize: 11 }} />
                <Tooltip
                  formatter={(v) => [fmt(Number(v)) + " ₫"]}
                  contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
                />
                <Bar dataKey="total_amount" radius={[0,4,4,0]} name="Doanh thu">
                  {topSales.map((_, i) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[200px] items-center justify-center text-sm text-slate-500">
              {loading ? "Đang tải…" : "Chưa có dữ liệu"}
            </div>
          )}
        </div>
      </div>

      {/* ── DETAIL TABLE ── */}
      <div className="rounded-xl bg-slate-800/60 ring-1 ring-slate-700 overflow-x-auto">
        <div className="p-4 border-b border-slate-700 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-300">Chi tiết theo Sale</p>
          <span className="text-xs text-slate-500">{topSales.length} sale</span>
        </div>
        {topSales.length > 0 ? (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400">
                {["#","Sale","Team","Số đơn","Doanh thu QR","Đã thu","Tỷ lệ thu"].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-left font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {topSales.map((r, i) => {
                const collectRate = r.total_amount > 0
                  ? Math.round(r.collected / r.total_amount * 100) : 0;
                return (
                  <tr key={r.sale_name} className="border-b border-slate-700/50 hover:bg-slate-700/30 transition">
                    <td className="px-3 py-2 text-slate-500">{i + 1}</td>
                    <td className="px-3 py-2 font-medium text-slate-200">{r.sale_name}</td>
                    <td className="px-3 py-2 text-slate-400">{r.team}</td>
                    <td className="px-3 py-2 tabular-nums text-slate-100 font-semibold">{r.orders}</td>
                    <td className="px-3 py-2 tabular-nums text-slate-200 whitespace-nowrap">{fmt(r.total_amount)} ₫</td>
                    <td className="px-3 py-2 tabular-nums text-emerald-400 whitespace-nowrap">{fmt(r.collected)} ₫</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 rounded-full bg-slate-700">
                          <div className="h-full rounded-full bg-emerald-500"
                            style={{ width: `${collectRate}%` }} />
                        </div>
                        <span className="tabular-nums text-slate-400">{collectRate}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="py-12 text-center text-sm text-slate-500">
            {loading ? "Đang tải dữ liệu…" : "Chưa có data — lấy dữ liệu CRM ở tab Đồng bộ CRM trước"}
          </div>
        )}
      </div>
    </div>
  );
}
