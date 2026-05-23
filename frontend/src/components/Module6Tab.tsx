import { useState } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

// --------------------------------------------------------------------------
// Mock Data
// --------------------------------------------------------------------------
const LEAD_TREND = [
  { date: "13/5", L1: 18, L3: 10, L8: 2 },
  { date: "14/5", L1: 22, L3: 13, L8: 3 },
  { date: "15/5", L1: 15, L3: 8,  L8: 1 },
  { date: "16/5", L1: 28, L3: 16, L8: 4 },
  { date: "17/5", L1: 20, L3: 12, L8: 2 },
  { date: "18/5", L1: 25, L3: 15, L8: 3 },
  { date: "19/5", L1: 30, L3: 18, L8: 5 },
  { date: "20/5", L1: 24, L3: 14, L8: 3 },
  { date: "21/5", L1: 32, L3: 20, L8: 6 },
  { date: "22/5", L1: 19, L3: 11, L8: 2 },
  { date: "23/5", L1: 27, L3: 16, L8: 4 },
];

const TOP_SALES = [
  { name: "Nguyễn Hiếu",  gmv: 18500000 },
  { name: "Trần Lan",     gmv: 15200000 },
  { name: "Lê Minh",      gmv: 12800000 },
  { name: "Phạm Thu",     gmv: 10500000 },
  { name: "Đỗ Hùng",      gmv: 8900000  },
];

const CONVERSION = [
  { label: "L2/L1", value: 78 },
  { label: "L3/L2", value: 56 },
  { label: "L4/L3", value: 43 },
  { label: "L8/L4", value: 20 },
];

const TABLE_ROWS = [
  { team: "Team A", sale: "Hiếu",  tgoi: "2:30", tyle: "72%", leads: 32, l3: 20, l4: 15, l8: 6,  gmv: 18500000, aov: 3083333 },
  { team: "Team A", sale: "Lan",   tgoi: "2:10", tyle: "68%", leads: 28, l3: 16, l4: 11, l8: 4,  gmv: 15200000, aov: 3800000 },
  { team: "Team B", sale: "Minh",  tgoi: "2:45", tyle: "65%", leads: 25, l3: 14, l4: 10, l8: 3,  gmv: 12800000, aov: 4266667 },
  { team: "Team B", sale: "Thu",   tgoi: "1:55", tyle: "61%", leads: 22, l3: 12, l4: 8,  l8: 3,  gmv: 10500000, aov: 3500000 },
  { team: "Team C", sale: "Hùng",  tgoi: "3:00", tyle: "58%", leads: 20, l3: 10, l4: 7,  l8: 2,  gmv: 8900000,  aov: 4450000 },
];

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

// --------------------------------------------------------------------------
// Sub-components
// --------------------------------------------------------------------------
function KpiCard({ label, value, sub, highlight }: {
  label: string; value: string; sub?: string; highlight?: boolean;
}) {
  return (
    <div className={`rounded-xl p-4 ring-1 ${
      highlight
        ? "bg-blue-900/40 ring-blue-600"
        : "bg-slate-800/60 ring-slate-700"
    }`}>
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${
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
          className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all"
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="w-10 text-xs text-slate-300 tabular-nums">{value}%</span>
    </div>
  );
}

const TODAY_STATS = [
  { label: "Số cuộc gọi",            value: "40" },
  { label: "Thời gian gọi trung bình",value: "2:30" },
  { label: "Số lead mới (L1)",        value: "20" },
  { label: "Mời học thử thành công",  value: "10" },
  { label: "Lớp học thử thành công",  value: "8" },
  { label: "Số L8 thành công",        value: "2" },
  { label: "Doanh thu hôm nay",       value: "5.000.000 ₫" },
];

const DATE_RANGES = ["Hôm nay", "Tuần này", "Tháng này", "Tháng trước", "Tùy chọn"];
const BAR_COLORS = ["#6366f1", "#8b5cf6", "#a78bfa", "#c4b5fd", "#ddd6fe"];

// --------------------------------------------------------------------------
// Main component
// --------------------------------------------------------------------------
export default function Module6Tab() {
  const [dateRange, setDateRange] = useState("Tháng này");
  const [teamFilter, setTeamFilter] = useState("Tất cả");
  const [saleFilter, setSaleFilter] = useState("Tất cả");

  return (
    <div className="space-y-5 p-5">

      {/* ── HEADER & FILTERS ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-100">Sale Leader / System</h2>
          <p className="text-xs text-slate-400">Dashboard tổng quan hiệu suất Sale — Mock Data</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Date Range */}
          <div className="flex rounded-lg overflow-hidden ring-1 ring-slate-600">
            {DATE_RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setDateRange(r)}
                className={`px-3 py-1.5 text-xs font-medium transition ${
                  dateRange === r
                    ? "bg-blue-600 text-white"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >{r}</button>
            ))}
          </div>
          {/* Team filter */}
          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 focus:outline-none"
          >
            {["Tất cả", "Team A", "Team B", "Team C"].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          {/* Sale filter */}
          <select
            value={saleFilter}
            onChange={(e) => setSaleFilter(e.target.value)}
            className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 focus:outline-none"
          >
            {["Tất cả", "Hiếu", "Lan", "Minh", "Thu", "Hùng"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── KPI CARDS ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <KpiCard label="Tổng số L1"    value="230" />
        <KpiCard label="Tổng số L3"    value="130" />
        <KpiCard label="Tổng số L4"    value="100" />
        <KpiCard label="Tổng số L8"    value="20"  />
        <KpiCard label="Doanh thu (tạo QR)"  value="62.333.000 ₫" sub="Đã tạo mã QR" />
        <KpiCard label="Doanh thu (đã thu)"  value="52.333.000 ₫" sub="Tiền về TK" highlight />
        <KpiCard label="AOV (đã thu)"        value="2.616.650 ₫"  sub="Trung bình/đơn" />
      </div>

      {/* ── CHARTS ROW ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">

        {/* Line chart — chiếm 2/3 */}
        <div className="lg:col-span-2 rounded-xl bg-slate-800/60 p-4 ring-1 ring-slate-700">
          <p className="mb-3 text-sm font-semibold text-slate-300">
            Chart biến thiên số lượng Lead mỗi ngày
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={LEAD_TREND} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 11 }} />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
                labelStyle={{ color: "#e2e8f0" }}
              />
              <Line type="monotone" dataKey="L1" stroke="#6366f1" strokeWidth={2} dot={false} name="L1 mới" />
              <Line type="monotone" dataKey="L3" stroke="#22c55e" strokeWidth={2} dot={false} name="L3" />
              <Line type="monotone" dataKey="L8" stroke="#f59e0b" strokeWidth={2} dot={false} name="L8 (chốt)" />
            </LineChart>
          </ResponsiveContainer>
          <div className="mt-2 flex gap-4 text-xs text-slate-400">
            {[["#6366f1","L1 mới"],["#22c55e","L3"],["#f59e0b","L8 chốt"]].map(([c,l])=>(
              <span key={l} className="flex items-center gap-1">
                <span className="inline-block h-2 w-4 rounded-full" style={{background:c}}/>
                {l}
              </span>
            ))}
          </div>
        </div>

        {/* Today panel — 1/3 */}
        <div className="rounded-xl bg-slate-800/60 p-4 ring-1 ring-slate-700">
          <p className="mb-3 text-sm font-semibold text-slate-300">Hôm nay</p>
          <div className="space-y-2.5">
            {TODAY_STATS.map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-xs text-slate-400">{label}</span>
                <span className="text-xs font-semibold text-slate-200 tabular-nums">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── CONVERSION + TOP SALES ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

        {/* Conversion rates */}
        <div className="rounded-xl bg-slate-800/60 p-4 ring-1 ring-slate-700">
          <p className="mb-4 text-sm font-semibold text-slate-300">Tỷ lệ chuyển đổi từng giai đoạn</p>
          <div className="space-y-3">
            {CONVERSION.map((c) => (
              <ConversionBar key={c.label} label={c.label} value={c.value} />
            ))}
          </div>
        </div>

        {/* Top 5 Sales — horizontal bar */}
        <div className="rounded-xl bg-slate-800/60 p-4 ring-1 ring-slate-700">
          <p className="mb-3 text-sm font-semibold text-slate-300">Top 5 Sale (GMV)</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart
              data={TOP_SALES}
              layout="vertical"
              margin={{ top: 0, right: 40, bottom: 0, left: 60 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
              <XAxis
                type="number"
                tickFormatter={(v) => fmtM(v)}
                tick={{ fill: "#94a3b8", fontSize: 10 }}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fill: "#cbd5e1", fontSize: 11 }}
                width={58}
              />
              <Tooltip
                formatter={(v) => [fmt(Number(v)) + " ₫", "GMV"]}
                contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
              />
              <Bar dataKey="gmv" radius={[0, 4, 4, 0]}>
                {TOP_SALES.map((_, i) => (
                  <Cell key={i} fill={BAR_COLORS[i]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── DETAIL TABLE ── */}
      <div className="rounded-xl bg-slate-800/60 ring-1 ring-slate-700 overflow-x-auto">
        <div className="p-4 border-b border-slate-700">
          <p className="text-sm font-semibold text-slate-300">Chi tiết theo Sale</p>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-700 text-slate-400">
              {["Team","Sale","TG gọi TB","Tỷ lệ gọi thành","Leads","L3","L4","L8","GMV","AOV"].map((h)=>(
                <th key={h} className="px-3 py-2.5 text-left font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TABLE_ROWS
              .filter((r) => teamFilter === "Tất cả" || r.team === teamFilter)
              .filter((r) => saleFilter === "Tất cả" || r.sale === saleFilter)
              .map((r, i) => (
                <tr key={i} className="border-b border-slate-700/50 hover:bg-slate-700/30 transition">
                  <td className="px-3 py-2 text-slate-400">{r.team}</td>
                  <td className="px-3 py-2 font-medium text-slate-200">{r.sale}</td>
                  <td className="px-3 py-2 tabular-nums text-slate-300">{r.tgoi}</td>
                  <td className="px-3 py-2 tabular-nums text-slate-300">{r.tyle}</td>
                  <td className="px-3 py-2 tabular-nums text-slate-100 font-semibold">{r.leads}</td>
                  <td className="px-3 py-2 tabular-nums text-green-400">{r.l3}</td>
                  <td className="px-3 py-2 tabular-nums text-blue-400">{r.l4}</td>
                  <td className="px-3 py-2 tabular-nums text-yellow-400 font-bold">{r.l8}</td>
                  <td className="px-3 py-2 tabular-nums text-slate-200 whitespace-nowrap">{fmt(r.gmv)} ₫</td>
                  <td className="px-3 py-2 tabular-nums text-slate-400 whitespace-nowrap">{fmt(r.aov)} ₫</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Mock data notice */}
      <p className="text-center text-xs text-slate-600">
        ⚠ Đang hiển thị Mock Data — kết nối API thật ở bước tiếp theo
      </p>
    </div>
  );
}
