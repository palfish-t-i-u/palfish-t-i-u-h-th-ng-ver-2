import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { endpoints } from "../lib/api";
import { isValidSaleName } from "../lib/metrics";
import { cn } from "../lib/cn";
import type { Bc03DailyRevenue, Bc03Report, Bc03StaffOption, DashboardLiveSummary } from "../types/order";

type CurrencyMode = "VND" | "RMB";
type AutoTab = "revenue" | "trial" | "referral";

type FilterMode = "month" | "custom";
type KpiDraft = { b2Orders: number; b4Gmv: number };

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthDateBounds(monthKey: string) {
  const [y, m] = monthKey.split("-");
  if (!y || !m) {
    const t = todayStr();
    return { min: t.slice(0, 8) + "01", max: t };
  }
  const min = `${y}-${m}-01`;
  const lastDay = new Date(Number(y), Number(m), 0).getDate();
  const endOfMonth = `${y}-${m}-${String(lastDay).padStart(2, "0")}`;
  return { min, max: endOfMonth > todayStr() ? todayStr() : endOfMonth };
}

function monthRange(monthKey: string): { start: string; end: string } {
  const { min, max } = monthDateBounds(monthKey);
  return { start: min, end: max };
}

function clampDate(iso: string, min: string, max: string) {
  if (iso < min) return min;
  if (iso > max) return max;
  return iso;
}

function fmtDayHeader(iso: string) {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
}

function fmtMoney(n: number, mode: CurrencyMode) {
  const suffix = mode === "VND" ? " ₫" : " ¥";
  return new Intl.NumberFormat("vi-VN").format(Math.round(n)) + suffix;
}

function fmtCompact(n: number) {
  if (n === 0) return "—";
  return new Intl.NumberFormat("vi-VN", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

function fmtInt(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n);
}

function fmtSavedAt(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function pctProgress(actual: number, target: number): number | null {
  if (!target || target <= 0) return null;
  return Math.round((actual / target) * 100);
}

function revVndFromBucket(b: Bc03DailyRevenue, rate: number) {
  const vndFromRmb = Math.round(((b.gmv_rmb_crm || 0) + (b.gmv_rmb_ledger || 0)) * rate);
  return (b.collected_vnd || 0) + vndFromRmb;
}

function revRmbFromBucket(b: Bc03DailyRevenue, rate: number) {
  const rmbExtra = rate > 0 ? (b.collected_vnd_m2 || 0) / rate : 0;
  return (b.gmv_rmb || 0) + rmbExtra;
}

type RevRow = Bc03Report["revenue"][number];

function revTotals(r: RevRow, rate: number) {
  const rmbExtra = rate > 0 ? (r.collected_vnd_m2 || 0) / rate : 0;
  const rmbTotal = (r.gmv_rmb_crm || 0) + (r.gmv_rmb_ledger || 0) + rmbExtra;
  const vndFromRmb = Math.round(((r.gmv_rmb_crm || 0) + (r.gmv_rmb_ledger || 0)) * rate);
  const vndTotal = (r.collected_vnd || 0) + vndFromRmb;
  return { rmbTotal, vndTotal };
}

function buildEmptyRevRow(saleName: string, team: string, dates: string[]): RevRow {
  const daily: Record<string, Bc03DailyRevenue> = {};
  for (const d of dates) {
    daily[d] = {
      gmv_rmb_crm: 0,
      gmv_rmb_ledger: 0,
      collected_vnd: 0,
      collected_vnd_m2: 0,
      orders_crm: 0,
      orders_ledger: 0,
      orders_m2: 0,
      gmv_rmb: 0,
      orders: 0,
    };
  }
  return {
    sale_name: saleName,
    team,
    gmv_rmb: 0,
    gmv_rmb_crm: 0,
    gmv_rmb_ledger: 0,
    collected_vnd: 0,
    collected_vnd_m2: 0,
    orders: 0,
    orders_crm: 0,
    orders_ledger: 0,
    orders_m2: 0,
    daily,
  };
}

const DAY_COL_SCROLL_PX = 76;

function isEditableTarget(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || el.isContentEditable) return true;
  return el.closest("[contenteditable='true']") !== null;
}

function isElementVisible(el: HTMLElement | null) {
  if (!el) return false;
  let node: HTMLElement | null = el;
  while (node) {
    const s = window.getComputedStyle(node);
    if (s.display === "none" || s.visibility === "hidden") return false;
    node = node.parentElement;
  }
  return el.getBoundingClientRect().width > 0;
}

const NAV_KEYS = new Set(["ArrowLeft", "ArrowRight", "Home", "End"]);

/** Pixel widths — freeze tới cột tổng, chỉ ngày scroll ngang. */
const REV_COL_W = [112, 144, 40, 104, 128, 104, 80];
const TRI_COL_W = [112, 144, 80];

function bc03StickyCol(
  index: number,
  widths: number[],
  bg: string,
  z = 20
): { className: string; style: React.CSSProperties } {
  const left = widths.slice(0, index).reduce((sum, w) => sum + w, 0);
  const w = widths[index] ?? 80;
  const last = index === widths.length - 1;
  return {
    className: cn("sticky", bg, last && "shadow-[2px_0_6px_-2px_rgba(0,0,0,0.35)]"),
    style: { left, minWidth: w, zIndex: z },
  };
}

function bc03StickyCell(
  index: number,
  widths: number[],
  bg: string,
  extraClass?: string,
  z = 20
) {
  const sticky = bc03StickyCol(index, widths, bg, z);
  return {
    className: cn(sticky.className, extraClass),
    style: sticky.style,
  };
}

const AUTO_TABS: { key: AutoTab; label: string }[] = [
  { key: "revenue", label: "Doanh thu & Order" },
  { key: "trial", label: "Trial (L4)" },
  { key: "referral", label: "Referral (L1.2)" },
];

const BC03_TEAM_ORDER = [
  "Inhouse 1",
  "Inhouse 2",
  "HCM (Online)",
  "Linh Dam (Store)",
  "Offline",
  "An Binh (Store)",
  "Khác",
] as const;

const TEAM_FILTERS = [
  { value: "", label: "Toàn công ty" },
  { value: "Inhouse 1", label: "Inhouse 1" },
  { value: "Inhouse 2", label: "Inhouse 2" },
  { value: "HCM (Online)", label: "HCM (Online)" },
  { value: "Linh Dam (Store)", label: "Linh Dam (Store)" },
  { value: "Offline", label: "Offline" },
  { value: "An Binh (Store)", label: "An Binh (Store)" },
  { value: "Khác", label: "Khác" },
] as const;

function normalizeTeam(team: string | undefined): string {
  const t = (team || "").trim() || "Khác";
  return (BC03_TEAM_ORDER as readonly string[]).includes(t) ? t : "Khác";
}

function emptyDailyBucket(): Bc03DailyRevenue {
  return {
    gmv_rmb_crm: 0,
    gmv_rmb_ledger: 0,
    collected_vnd: 0,
    collected_vnd_m2: 0,
    orders_crm: 0,
    orders_ledger: 0,
    orders_m2: 0,
    gmv_rmb: 0,
    orders: 0,
  };
}

function sumRevRows(rows: RevRow[], team: string, dates: string[]): RevRow {
  const daily: Record<string, Bc03DailyRevenue> = {};
  for (const d of dates) {
    daily[d] = emptyDailyBucket();
    for (const r of rows) {
      const b = r.daily?.[d];
      if (!b) continue;
      const t = daily[d];
      t.gmv_rmb_crm += b.gmv_rmb_crm || 0;
      t.gmv_rmb_ledger += b.gmv_rmb_ledger || 0;
      t.collected_vnd += b.collected_vnd || 0;
      t.collected_vnd_m2 += b.collected_vnd_m2 || 0;
      t.orders_crm += b.orders_crm || 0;
      t.orders_ledger += b.orders_ledger || 0;
      t.orders_m2 += b.orders_m2 || 0;
      t.gmv_rmb += b.gmv_rmb || 0;
      t.orders += b.orders || 0;
    }
  }
  const base = rows.reduce(
    (acc, r) => ({
      gmv_rmb: acc.gmv_rmb + (r.gmv_rmb || 0),
      gmv_rmb_crm: acc.gmv_rmb_crm + (r.gmv_rmb_crm || 0),
      gmv_rmb_ledger: acc.gmv_rmb_ledger + (r.gmv_rmb_ledger || 0),
      collected_vnd: acc.collected_vnd + (r.collected_vnd || 0),
      collected_vnd_m2: acc.collected_vnd_m2 + (r.collected_vnd_m2 || 0),
      orders: acc.orders + (r.orders || 0),
      orders_crm: acc.orders_crm + (r.orders_crm || 0),
      orders_ledger: acc.orders_ledger + (r.orders_ledger || 0),
      orders_m2: acc.orders_m2 + (r.orders_m2 || 0),
    }),
    {
      gmv_rmb: 0,
      gmv_rmb_crm: 0,
      gmv_rmb_ledger: 0,
      collected_vnd: 0,
      collected_vnd_m2: 0,
      orders: 0,
      orders_crm: 0,
      orders_ledger: 0,
      orders_m2: 0,
    }
  );
  return {
    sale_name: "__team_total__",
    team,
    ...base,
    daily,
  };
}

function sumKpiForSales(saleNames: string[], kpiDraft: Record<string, KpiDraft>): KpiDraft {
  return saleNames.reduce(
    (acc, name) => {
      const k = kpiDraft[name] ?? { b2Orders: 0, b4Gmv: 0 };
      return { b2Orders: acc.b2Orders + k.b2Orders, b4Gmv: acc.b4Gmv + k.b4Gmv };
    },
    { b2Orders: 0, b4Gmv: 0 }
  );
}

type RevenueDisplayRow =
  | { kind: "team-total"; team: string; row: RevRow; kpi: KpiDraft }
  | { kind: "staff"; row: RevRow };

function buildRevenueDisplayRows(
  rows: RevRow[],
  dates: string[],
  kpiDraft: Record<string, KpiDraft>,
  teamFilter: string
): RevenueDisplayRow[] {
  const filtered = teamFilter
    ? rows.filter((r) => normalizeTeam(r.team) === teamFilter)
    : rows;

  const byTeam = new Map<string, RevRow[]>();
  for (const r of filtered) {
    const t = normalizeTeam(r.team);
    const list = byTeam.get(t) ?? [];
    list.push(r);
    byTeam.set(t, list);
  }

  const teamKeys = teamFilter
    ? [teamFilter]
    : [
        ...BC03_TEAM_ORDER.filter((t) => byTeam.has(t)),
        ...[...byTeam.keys()].filter((t) => !(BC03_TEAM_ORDER as readonly string[]).includes(t)).sort(),
      ];

  const out: RevenueDisplayRow[] = [];
  for (const team of teamKeys) {
    const members = byTeam.get(team) ?? [];
    if (members.length === 0) continue;
    members.sort((a, b) => (b.collected_vnd || 0) - (a.collected_vnd || 0));
    const names = members.map((m) => m.sale_name);
    out.push({
      kind: "team-total",
      team,
      row: sumRevRows(members, team, dates),
      kpi: sumKpiForSales(names, kpiDraft),
    });
    for (const row of members) {
      out.push({ kind: "staff", row });
    }
  }
  return out;
}

type TrialRow = Bc03Report["trial"][number];

type TrialDisplayRow =
  | { kind: "team-total"; team: string; row: TrialRow }
  | { kind: "staff"; row: TrialRow };

function sumTrialRows(rows: TrialRow[], team: string, dates: string[]): TrialRow {
  const daily: Record<string, number> = {};
  for (const d of dates) {
    daily[d] = rows.reduce((s, r) => s + (r.daily?.[d] ?? 0), 0);
  }
  return {
    sale_name: "__team_total__",
    team,
    completed_classes: Object.values(daily).reduce((a, b) => a + b, 0),
    daily,
  };
}

function buildTrialDisplayRows(
  rows: TrialRow[],
  dates: string[],
  teamFilter: string
): TrialDisplayRow[] {
  const filtered = teamFilter
    ? rows.filter((r) => normalizeTeam(r.team) === teamFilter)
    : rows;

  const byTeam = new Map<string, TrialRow[]>();
  for (const r of filtered) {
    const t = normalizeTeam(r.team);
    const list = byTeam.get(t) ?? [];
    list.push(r);
    byTeam.set(t, list);
  }

  const teamKeys = teamFilter
    ? [teamFilter]
    : [
        ...BC03_TEAM_ORDER.filter((t) => byTeam.has(t)),
        ...[...byTeam.keys()].filter((t) => !(BC03_TEAM_ORDER as readonly string[]).includes(t)).sort(),
      ];

  const out: TrialDisplayRow[] = [];
  for (const team of teamKeys) {
    const members = byTeam.get(team) ?? [];
    if (members.length === 0) continue;
    members.sort((a, b) => (b.completed_classes || 0) - (a.completed_classes || 0));
    out.push({ kind: "team-total", team, row: sumTrialRows(members, team, dates) });
    for (const row of members) {
      out.push({ kind: "staff", row });
    }
  }
  return out;
}

type ReferralRow = Bc03Report["referral"][number];

type ReferralDisplayRow =
  | { kind: "team-total"; team: string; row: ReferralRow }
  | { kind: "staff"; row: ReferralRow };

function sumReferralRows(rows: ReferralRow[], team: string, dates: string[]): ReferralRow {
  const daily: Record<string, number> = {};
  for (const d of dates) {
    daily[d] = rows.reduce((s, r) => s + (r.daily?.[d] ?? 0), 0);
  }
  return {
    sale_name: "__team_total__",
    team,
    referral_leads: Object.values(daily).reduce((a, b) => a + b, 0),
    daily,
  };
}

function buildReferralDisplayRows(
  rows: ReferralRow[],
  dates: string[],
  teamFilter: string
): ReferralDisplayRow[] {
  const filtered = teamFilter
    ? rows.filter((r) => normalizeTeam(r.team) === teamFilter)
    : rows;

  const byTeam = new Map<string, ReferralRow[]>();
  for (const r of filtered) {
    const t = normalizeTeam(r.team);
    const list = byTeam.get(t) ?? [];
    list.push(r);
    byTeam.set(t, list);
  }

  const teamKeys = teamFilter
    ? [teamFilter]
    : [
        ...BC03_TEAM_ORDER.filter((t) => byTeam.has(t)),
        ...[...byTeam.keys()].filter((t) => !(BC03_TEAM_ORDER as readonly string[]).includes(t)).sort(),
      ];

  const out: ReferralDisplayRow[] = [];
  for (const team of teamKeys) {
    const members = byTeam.get(team) ?? [];
    if (members.length === 0) continue;
    members.sort((a, b) => (b.referral_leads || 0) - (a.referral_leads || 0));
    out.push({ kind: "team-total", team, row: sumReferralRows(members, team, dates) });
    for (const row of members) {
      out.push({ kind: "staff", row });
    }
  }
  return out;
}

function KpiProgressBar({ actual, target, label }: { actual: number; target: number; label: string }) {
  const pct = pctProgress(actual, target);
  const fill = pct === null ? 0 : Math.min(100, Math.max(0, pct));
  const barColor = pct === null ? "bg-slate-500" : pct < 50 ? "bg-red-500" : "bg-green-500";

  return (
    <div className="min-w-[7.5rem]" title={label}>
      <div className="flex items-center gap-1.5">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-200/20">
          <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${fill}%` }} />
        </div>
        <span className="w-9 shrink-0 text-right text-[10px] tabular-nums text-slate-300">
          {pct === null ? "—" : `${pct}%`}
        </span>
      </div>
    </div>
  );
}

function InlineKpiInput({
  value,
  onChange,
  className = "w-16",
}: {
  value: number;
  onChange: (n: number) => void;
  className?: string;
}) {
  return (
    <input
      type="number"
      min={0}
      value={value || ""}
      placeholder="0"
      onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
      className={`${className} rounded border border-slate-600/80 bg-slate-800/80 px-1.5 py-1 text-right text-xs tabular-nums text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/40`}
    />
  );
}

export default function ReportBC03Tab() {
  const [monthKey, setMonthKey] = useState(currentMonthKey);
  const [filterMode, setFilterMode] = useState<FilterMode>("month");
  const initialMonth = monthRange(currentMonthKey());
  const [customStart, setCustomStart] = useState(initialMonth.start);
  const [customEnd, setCustomEnd] = useState(initialMonth.end);
  const [exchangeRate, setExchangeRate] = useState(3700);
  const [currency, setCurrency] = useState<CurrencyMode>("VND");
  const [teamFilter, setTeamFilter] = useState("");
  const [autoTab, setAutoTab] = useState<AutoTab>("revenue");
  const [report, setReport] = useState<Bc03Report | null>(null);
  const [liveSummary, setLiveSummary] = useState<DashboardLiveSummary | null>(null);
  const [kpiLoading, setKpiLoading] = useState(false);
  const [kpiDraft, setKpiDraft] = useState<Record<string, KpiDraft>>({});
  const [excludedStaff, setExcludedStaff] = useState<Set<string>>(() => new Set());
  const [staffOptions, setStaffOptions] = useState<Bc03StaffOption[]>([]);
  const [staffSearch, setStaffSearch] = useState("");
  const [pickSelection, setPickSelection] = useState<string[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loadingMonthly, setLoadingMonthly] = useState(false);
  const [savingMonthly, setSavingMonthly] = useState(false);
  const [monthlyError, setMonthlyError] = useState("");
  const [saveMsg, setSaveMsg] = useState("");
  const [savedMeta, setSavedMeta] = useState<{ at: string | null; by: string | null }>({
    at: null,
    by: null,
  });
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const tableNavActiveRef = useRef(false);

  const scrollTableHorizontal = useCallback((delta: number) => {
    tableScrollRef.current?.scrollBy({ left: delta, behavior: "smooth" });
  }, []);

  const focusTableScroll = useCallback(() => {
    tableScrollRef.current?.focus({ preventScroll: true });
  }, []);

  const handleTableNavKey = useCallback(
    (e: KeyboardEvent) => {
      if (!NAV_KEYS.has(e.key)) return;
      if (isEditableTarget(e.target)) return;
      if (!isElementVisible(sectionRef.current)) return;

      const scroll = tableScrollRef.current;
      if (!scroll) return;

      const active = document.activeElement;
      const targetNode = e.target instanceof Node ? e.target : null;
      const inTable =
        tableNavActiveRef.current ||
        scroll === active ||
        scroll.contains(active) ||
        (targetNode !== null && scroll.contains(targetNode));

      if (!inTable) return;

      e.preventDefault();
      if (e.key === "ArrowLeft") {
        scrollTableHorizontal(-DAY_COL_SCROLL_PX);
      } else if (e.key === "ArrowRight") {
        scrollTableHorizontal(DAY_COL_SCROLL_PX);
      } else if (e.key === "Home") {
        scroll.scrollTo({ left: 0, behavior: "smooth" });
      } else if (e.key === "End") {
        scroll.scrollTo({ left: scroll.scrollWidth, behavior: "smooth" });
      }
    },
    [scrollTableHorizontal]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleTableNavKey);
    return () => window.removeEventListener("keydown", handleTableNavKey);
  }, [handleTableNavKey]);

  const activateTableNav = useCallback(
    (target: EventTarget | null) => {
      if (isEditableTarget(target)) {
        tableNavActiveRef.current = false;
        return;
      }
      if (!tableScrollRef.current?.contains(target as Node)) return;
      tableNavActiveRef.current = true;
      focusTableScroll();
    },
    [focusTableScroll]
  );

  const bounds = useMemo(() => monthDateBounds(monthKey), [monthKey]);
  const monthSpan = useMemo(() => monthRange(monthKey), [monthKey]);

  const { start: rangeStart, end: rangeEnd } = useMemo(() => {
    if (filterMode === "custom") {
      let s = clampDate(customStart, bounds.min, bounds.max);
      let e = clampDate(customEnd, bounds.min, bounds.max);
      if (s > e) [s, e] = [e, s];
      return { start: s, end: e };
    }
    return monthSpan;
  }, [filterMode, customStart, customEnd, bounds, monthSpan]);

  const dates = report?.dates ?? [];

  useEffect(() => {
    const { min, max } = monthDateBounds(monthKey);
    setCustomStart((s) => clampDate(s, min, max));
    setCustomEnd((e) => clampDate(e, min, max));
    setExcludedStaff(new Set());
    setPickSelection([]);
  }, [monthKey]);

  useEffect(() => {
    setStaffLoading(true);
    endpoints.reports
      .bc03Staff()
      .then((res) => setStaffOptions(res.data.sales ?? []))
      .catch(() => setStaffOptions([]))
      .finally(() => setStaffLoading(false));
  }, []);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setKpiLoading(true);
    setError("");
    const liveParams = { start_date: rangeStart, end_date: rangeEnd };
    try {
      const [bc03Res, liveRes] = await Promise.all([
        endpoints.reports.bc03({
          range_key: "custom",
          start: rangeStart,
          end: rangeEnd,
          team: teamFilter || undefined,
        }),
        endpoints.dashboard.liveSummary(liveParams).finally(() => setKpiLoading(false)),
      ]);
      setReport(bc03Res.data);
      setLiveSummary(liveRes.data);
    } catch (e: unknown) {
      setKpiLoading(false);
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg || "Không tải được báo cáo BC03.");
      setReport(null);
      setLiveSummary(null);
    } finally {
      setLoading(false);
    }
  }, [rangeStart, rangeEnd, teamFilter]);

  const loadMonthly = useCallback(async () => {
    setLoadingMonthly(true);
    setMonthlyError("");
    try {
      const res = await endpoints.reports.monthlyGet(monthKey);
      setExchangeRate(res.data.exchange_rate || 3700);
      setSavedMeta({ at: res.data.updated_at, by: res.data.updated_by });
      const draft: Record<string, KpiDraft> = {};
      for (const r of res.data.kpi_rows) {
        const name = r.sale_name.trim();
        if (name) draft[name] = { b2Orders: r.b2_orders, b4Gmv: r.b4_gmv_vnd };
      }
      setKpiDraft(draft);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setMonthlyError(msg || "Không tải được KPI tháng.");
    } finally {
      setLoadingMonthly(false);
    }
  }, [monthKey]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  useEffect(() => {
    loadMonthly();
  }, [loadMonthly]);

  function getKpi(saleName: string): KpiDraft {
    return kpiDraft[saleName] ?? { b2Orders: 0, b4Gmv: 0 };
  }

  function patchKpi(saleName: string, patch: Partial<KpiDraft>) {
    setKpiDraft((prev) => ({
      ...prev,
      [saleName]: { ...(prev[saleName] ?? { b2Orders: 0, b4Gmv: 0 }), ...patch },
    }));
  }

  const staffTeamMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of staffOptions) m[s.crm_name] = s.team;
    return m;
  }, [staffOptions]);

  const mergedRevenueRows = useMemo(() => {
    const map = new Map<string, RevRow>();
    for (const r of report?.revenue ?? []) {
      if (!excludedStaff.has(r.sale_name) && isValidSaleName(r.sale_name)) {
        if (teamFilter && normalizeTeam(r.team) !== teamFilter) continue;
        map.set(r.sale_name, r);
      }
    }
    const ensureRow = (name: string) => {
      if (excludedStaff.has(name) || map.has(name)) return;
      map.set(name, buildEmptyRevRow(name, staffTeamMap[name] ?? "—", dates));
    };
    for (const name of Object.keys(kpiDraft)) {
      if (isValidSaleName(name)) ensureRow(name);
    }
    return [...map.values()].sort((a, b) => {
      const av = revTotals(a, exchangeRate).vndTotal;
      const bv = revTotals(b, exchangeRate).vndTotal;
      if (bv !== av) return bv - av;
      return a.sale_name.localeCompare(b.sale_name, "vi");
    });
  }, [report, excludedStaff, kpiDraft, staffTeamMap, dates, exchangeRate, teamFilter]);

  const revenueDisplayRows = useMemo(
    () => buildRevenueDisplayRows(mergedRevenueRows, dates, kpiDraft, teamFilter),
    [mergedRevenueRows, dates, kpiDraft, teamFilter]
  );

  const trialRowsFiltered = useMemo(() => {
    const rows = report?.trial ?? [];
    if (!teamFilter) return rows;
    return rows.filter((r) => normalizeTeam(r.team) === teamFilter);
  }, [report?.trial, teamFilter]);

  const referralRowsFiltered = useMemo(() => {
    const rows = report?.referral ?? [];
    if (!teamFilter) return rows;
    return rows.filter((r) => normalizeTeam(r.team) === teamFilter);
  }, [report?.referral, teamFilter]);

  const visibleSaleNames = useMemo(
    () => new Set(mergedRevenueRows.map((r) => r.sale_name)),
    [mergedRevenueRows]
  );

  const pickableStaff = useMemo(() => {
    const q = staffSearch.trim().toLowerCase();
    return staffOptions.filter((s) => {
      if (teamFilter && normalizeTeam(s.team) !== teamFilter) return false;
      if (visibleSaleNames.has(s.crm_name)) return false;
      if (!q) return true;
      return (
        s.crm_name.toLowerCase().includes(q) ||
        s.display_name.toLowerCase().includes(q) ||
        s.team.toLowerCase().includes(q)
      );
    });
  }, [staffOptions, staffSearch, visibleSaleNames, teamFilter]);

  function addSelectedStaff() {
    if (pickSelection.length === 0) return;
    setKpiDraft((prev) => {
      const next = { ...prev };
      for (const name of pickSelection) {
        if (!next[name]) next[name] = { b2Orders: 0, b4Gmv: 0 };
      }
      return next;
    });
    setExcludedStaff((prev) => {
      const next = new Set(prev);
      for (const name of pickSelection) next.delete(name);
      return next;
    });
    setPickSelection([]);
    setStaffSearch("");
  }

  function removeStaffRow(saleName: string) {
    setExcludedStaff((prev) => new Set(prev).add(saleName));
    setKpiDraft((prev) => {
      const next = { ...prev };
      delete next[saleName];
      return next;
    });
  }

  async function handleSave() {
    setSavingMonthly(true);
    setSaveMsg("");
    setMonthlyError("");
    const saleNames = mergedRevenueRows.map((r) => r.sale_name).filter((n) => n.trim());

    try {
      const res = await endpoints.reports.monthlySave({
        month: monthKey,
        exchange_rate: exchangeRate,
        kpi_rows: saleNames
          .sort((a, b) => a.localeCompare(b, "vi"))
          .map((name) => {
            const k = kpiDraft[name] ?? { b2Orders: 0, b4Gmv: 0 };
            return { sale_name: name, b2_orders: k.b2Orders, b4_gmv_vnd: k.b4Gmv };
          })
          .filter((r) => {
            const row = mergedRevenueRows.find((x) => x.sale_name === r.sale_name);
            const hasActual = row && (row.orders > 0 || row.collected_vnd > 0 || row.gmv_rmb > 0);
            return hasActual || r.b4_gmv_vnd > 0;
          }),
      });
      setSavedMeta({ at: res.data.updated_at, by: res.data.updated_by });
      setSaveMsg(`Đã lưu tỷ giá & KPI tháng ${monthKey}`);
      const draft: Record<string, KpiDraft> = {};
      for (const r of res.data.kpi_rows) {
        const name = r.sale_name.trim();
        if (name) draft[name] = { b2Orders: r.b2_orders, b4Gmv: r.b4_gmv_vnd };
      }
      setKpiDraft(draft);
      setExcludedStaff(new Set());
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setMonthlyError(msg || "Lưu thất bại.");
    } finally {
      setSavingMonthly(false);
    }
  }

  const trialDisplayRows = useMemo(
    () => buildTrialDisplayRows(trialRowsFiltered, dates, teamFilter),
    [trialRowsFiltered, dates, teamFilter]
  );
  const referralDisplayRows = useMemo(
    () => buildReferralDisplayRows(referralRowsFiltered, dates, teamFilter),
    [referralRowsFiltered, dates, teamFilter]
  );

  const monthLabel = useMemo(() => {
    const [y, m] = monthKey.split("-");
    if (!y || !m) return monthKey;
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("vi-VN", {
      month: "long",
      year: "numeric",
    });
  }, [monthKey]);

  function handleMonthChange(next: string) {
    setMonthKey(next);
    const { min, max } = monthDateBounds(next);
    setCustomStart(min);
    setCustomEnd(max);
  }

  function switchFilterMode(mode: FilterMode) {
    if (mode === "custom") {
      const { min, max } = monthDateBounds(monthKey);
      setCustomStart(min);
      setCustomEnd(max);
    }
    setFilterMode(mode);
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-100">BC03 — Báo cáo tổng bộ</h2>
          <p className="mt-1 text-sm text-slate-400">
            Mặc định cả tháng · Có thể lọc theo khoảng ngày · KPI sửa trực tiếp trên bảng
          </p>
        </div>
        {report && (
          <p className="text-xs text-slate-500">
            Kỳ: {report.period.start} → {report.period.end}
          </p>
        )}
      </div>

      {report?.meta?.missing_dates && report.meta.missing_dates.length > 0 && (
        <div className="rounded-lg bg-amber-950/60 px-4 py-3 text-sm text-amber-200 ring-1 ring-amber-800">
          <strong>Thiếu dữ liệu daily trong DB:</strong>{" "}
          {report.meta.synced_days ?? 0}/{report.meta.expected_days ?? "?"} ngày đã sync.
          {" "}Các ngày chưa có:{" "}
          {report.meta.missing_dates.slice(0, 12).map((d) => d.slice(8, 10) + "/" + d.slice(5, 7)).join(", ")}
          {(report.meta.missing_dates.length > 12) ? ` … (+${report.meta.missing_dates.length - 12} ngày)` : ""}.
          {" "}Vào tab <strong>Đồng bộ CRM</strong> → backfill từng ngày hoặc gọi{" "}
          <code className="text-amber-100">POST /crm/sync/backfill</code>.
        </div>
      )}

      {/* PalFish live KPI — khớp 100% với CRM gốc */}
      <div className="relative rounded-xl bg-slate-800/60 p-4 ring-1 ring-slate-700">
        {kpiLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-slate-900/70">
            <span className="flex items-center gap-2 text-sm text-slate-300">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
              Đang lấy tổng CRM từ PalFish…
            </span>
          </div>
        )}
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Tổng kỳ (PalFish live — không lưu DB)
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <p className="text-[10px] text-slate-500">L1</p>
            <p className="text-lg font-bold tabular-nums text-slate-100">
              {new Intl.NumberFormat("vi-VN").format(liveSummary?.kpi?.l1 ?? 0)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500">L8 (đơn CRM)</p>
            <p className="text-lg font-bold tabular-nums text-slate-100">
              {new Intl.NumberFormat("vi-VN").format(liveSummary?.kpi?.l8 ?? 0)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500">GMV CRM (RMB)</p>
            <p className="text-lg font-bold tabular-nums text-slate-100">
              {new Intl.NumberFormat("vi-VN").format(liveSummary?.kpi?.total_gmv_rmb ?? 0)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500">Đã thu (VND)</p>
            <p className="text-lg font-bold tabular-nums text-emerald-300">
              {new Intl.NumberFormat("vi-VN").format(liveSummary?.kpi?.total_collected_vnd ?? 0)} ₫
            </p>
          </div>
        </div>
      </div>

      {/* Toolbar — không còn form KPI riêng */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl bg-slate-800/60 p-4 ring-1 ring-slate-700">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-400">Tháng KPI &amp; tỷ giá</span>
          <input
            type="month"
            value={monthKey}
            onChange={(e) => handleMonthChange(e.target.value)}
            className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
          />
        </label>

        <div>
          <span className="mb-1 block text-xs font-medium text-slate-400">Kỳ xem báo cáo</span>
          <div className="flex overflow-hidden rounded-lg ring-1 ring-slate-600">
            <button
              type="button"
              onClick={() => switchFilterMode("month")}
              className={`px-3 py-2 text-xs font-semibold transition ${
                filterMode === "month" ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              Cả tháng
            </button>
            <button
              type="button"
              onClick={() => switchFilterMode("custom")}
              className={`px-3 py-2 text-xs font-semibold transition ${
                filterMode === "custom" ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              Theo ngày
            </button>
          </div>
        </div>

        {filterMode === "month" ? (
          <div className="rounded-lg border border-slate-600/60 bg-slate-900/50 px-3 py-2">
            <span className="block text-[10px] uppercase tracking-wide text-slate-500">Đang xem</span>
            <span className="text-sm font-medium text-emerald-400">{monthLabel}</span>
          </div>
        ) : (
          <>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-400">Từ ngày</span>
              <input
                type="date"
                value={customStart}
                min={bounds.min}
                max={customEnd}
                onChange={(e) => setCustomStart(clampDate(e.target.value, bounds.min, bounds.max))}
                className="rounded-lg border border-slate-600 bg-slate-900 px-2 py-2 text-xs text-slate-100 focus:border-blue-500 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-400">Đến ngày</span>
              <input
                type="date"
                value={customEnd}
                min={customStart}
                max={bounds.max}
                onChange={(e) => setCustomEnd(clampDate(e.target.value, bounds.min, bounds.max))}
                className="rounded-lg border border-slate-600 bg-slate-900 px-2 py-2 text-xs text-slate-100 focus:border-blue-500 focus:outline-none"
              />
            </label>
          </>
        )}

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-400">Team</span>
          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            className="min-w-[10rem] rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
          >
            {TEAM_FILTERS.map((t) => (
              <option key={t.value || "all"} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-400">Tỷ giá ¥ → ₫</span>
          <input
            type="number"
            min={1}
            value={exchangeRate}
            onChange={(e) => setExchangeRate(Number(e.target.value) || 0)}
            disabled={loadingMonthly}
            className="w-32 rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none disabled:opacity-50"
          />
        </label>

        <div>
          <span className="mb-1 block text-xs font-medium text-slate-400">Tiền tệ</span>
          <div className="flex overflow-hidden rounded-lg ring-1 ring-slate-600">
            {(["VND", "RMB"] as CurrencyMode[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCurrency(c)}
                className={`px-3 py-2 text-xs font-semibold transition ${
                  currency === c ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={savingMonthly || loadingMonthly}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {savingMonthly ? "Đang lưu…" : "Lưu tỷ giá & KPI"}
        </button>
        <button
          type="button"
          onClick={loadReport}
          disabled={loading}
          className="rounded-lg border border-slate-600 px-3 py-2 text-xs text-slate-300 hover:bg-slate-700 disabled:opacity-50"
        >
          {loading ? "⟳" : "Làm mới"}
        </button>

        {savedMeta.at && !loadingMonthly && (
          <p className="w-full text-xs text-slate-500">
            Lưu lần cuối: {fmtSavedAt(savedMeta.at)}
            {savedMeta.by ? ` · ${savedMeta.by}` : ""}
          </p>
        )}
      </div>

      {monthlyError && (
        <div className="rounded-lg bg-red-950/60 px-4 py-3 text-sm text-red-300 ring-1 ring-red-800">{monthlyError}</div>
      )}
      {saveMsg && (
        <div className="rounded-lg bg-emerald-950/60 px-4 py-3 text-sm text-emerald-300 ring-1 ring-emerald-800">{saveMsg}</div>
      )}
      {error && (
        <div className="rounded-lg bg-red-950/60 px-4 py-3 text-sm text-red-300 ring-1 ring-red-800">{error}</div>
      )}

      <section
        ref={sectionRef}
        className="overflow-hidden rounded-xl bg-slate-800/60 ring-1 ring-slate-700"
        onPointerDownCapture={(e) => activateTableNav(e.target)}
      >
        <div className="flex border-b border-slate-700 px-4">
          {AUTO_TABS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setAutoTab(key)}
              className={`border-b-2 px-4 py-3 text-xs font-medium transition -mb-px ${
                autoTab === key
                  ? "border-blue-500 text-blue-300"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {autoTab === "revenue" && (
          <div className="border-b border-slate-700 bg-slate-900/40 px-4 py-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[12rem] flex-1">
                <span className="mb-1 block text-xs font-medium text-slate-400">
                  Thêm nhân sự (chọn nhiều — Ctrl/⌘ + click)
                </span>
                <input
                  type="search"
                  placeholder="Lọc tên / team…"
                  value={staffSearch}
                  onChange={(e) => setStaffSearch(e.target.value)}
                  className="mb-1.5 w-full rounded-lg border border-slate-600 bg-slate-900 px-2 py-1.5 text-xs text-slate-100 focus:border-blue-500 focus:outline-none"
                />
                <select
                  multiple
                  size={5}
                  value={pickSelection}
                  onChange={(e) =>
                    setPickSelection(Array.from(e.target.selectedOptions, (o) => o.value))
                  }
                  disabled={staffLoading || pickableStaff.length === 0}
                  className="w-full min-w-[14rem] rounded-lg border border-slate-600 bg-slate-900 px-2 py-1 text-xs text-slate-100 focus:border-blue-500 focus:outline-none disabled:opacity-50"
                >
                  {pickableStaff.map((s) => (
                    <option key={s.crm_name} value={s.crm_name}>
                      {s.crm_name} · {s.team}
                    </option>
                  ))}
                </select>
                {staffLoading && <p className="mt-1 text-[10px] text-slate-500">Đang tải nhân sự…</p>}
                {!staffLoading && pickableStaff.length === 0 && (
                  <p className="mt-1 text-[10px] text-slate-500">Không còn sale để thêm (hoặc đã có trên bảng).</p>
                )}
              </div>
              <button
                type="button"
                onClick={addSelectedStaff}
                disabled={pickSelection.length === 0}
                className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-40"
              >
                + Thêm {pickSelection.length > 0 ? `(${pickSelection.length})` : ""}
              </button>
            </div>
          </div>
        )}

        <div
          ref={tableScrollRef}
          tabIndex={0}
          role="region"
          aria-label="Bảng BC03 — phím mũi tên trái phải cuộn ngang theo ngày"
          onBlur={(e) => {
            const scroll = tableScrollRef.current;
            if (!scroll) return;
            if (!scroll.contains(e.relatedTarget as Node)) {
              window.setTimeout(() => {
                if (!scroll.contains(document.activeElement)) {
                  tableNavActiveRef.current = false;
                }
              }, 0);
            }
          }}
          className="overflow-x-auto outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-inset"
        >
          {loading && !report ? (
            <p className="py-12 text-center text-sm text-slate-500">Đang tải dữ liệu…</p>
          ) : autoTab === "revenue" ? (
            <table className="min-w-max w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-700 bg-slate-900/80 text-slate-400">
                  <th {...bc03StickyCell(0, REV_COL_W, "bg-slate-900", "px-3 py-2.5 text-left font-medium")}>
                    Team
                  </th>
                  <th {...bc03StickyCell(1, REV_COL_W, "bg-slate-900", "px-3 py-2.5 text-left font-medium")}>
                    Nhân sự
                  </th>
                  <th
                    {...bc03StickyCell(2, REV_COL_W, "bg-slate-900", "px-2 py-2.5 text-center font-medium w-10")}
                    title="Xóa dòng KPI"
                  >
                    ×
                  </th>
                  <th {...bc03StickyCell(3, REV_COL_W, "bg-slate-900", "px-2 py-2.5 text-center font-medium whitespace-nowrap")}>
                    GMV PKI
                  </th>
                  <th {...bc03StickyCell(4, REV_COL_W, "bg-slate-900", "px-2 py-2.5 text-left font-medium whitespace-nowrap")}>
                    % GMV
                  </th>
                  <th {...bc03StickyCell(5, REV_COL_W, "bg-slate-900", "px-2 py-2.5 text-right font-medium whitespace-nowrap")}>
                    Tổng ĐT
                  </th>
                  <th {...bc03StickyCell(6, REV_COL_W, "bg-slate-900", "px-2 py-2.5 text-right font-medium whitespace-nowrap")}>
                    Tổng đơn
                  </th>
                  {dates.map((d) => (
                    <th key={d} className="px-2 py-2.5 text-right font-medium whitespace-nowrap min-w-[4.5rem]">
                      {fmtDayHeader(d)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {revenueDisplayRows.length === 0 ? (
                  <tr>
                    <td colSpan={7 + dates.length} className="py-10 text-center text-slate-500">
                      Chưa có dòng — đổi Team / kỳ ngày hoặc thêm nhân sự KPI.
                    </td>
                  </tr>
                ) : (
                  revenueDisplayRows.map((item) => {
                    const isTotal = item.kind === "team-total";
                    const r = item.row;
                    const kpi = isTotal ? item.kpi : getKpi(r.sale_name);
                    const { vndTotal } = revTotals(r, exchangeRate);
                    const gmvPct = pctProgress(vndTotal, kpi.b4Gmv);
                    const primaryTotal = currency === "VND" ? vndTotal : revTotals(r, exchangeRate).rmbTotal;
                    const isKpiOnly =
                      !isTotal &&
                      r.orders === 0 &&
                      r.collected_vnd === 0 &&
                      r.gmv_rmb === 0 &&
                      r.gmv_rmb_crm === 0;
                    const rowKey = isTotal ? `total-${item.team}` : r.sale_name;
                    const stickyBg = isTotal ? "bg-amber-950" : "bg-slate-900";

                    return (
                      <tr
                        key={rowKey}
                        className={cn(
                          "border-b border-slate-700/40",
                          isTotal
                            ? "bg-amber-950/40 font-semibold text-amber-100"
                            : "hover:bg-slate-700/15"
                        )}
                      >
                        <td
                          {...bc03StickyCell(
                            0,
                            REV_COL_W,
                            stickyBg,
                            cn("px-3 py-2 whitespace-nowrap", isTotal ? "text-amber-100" : "text-slate-500")
                          )}
                        >
                          {isTotal ? item.team : ""}
                        </td>
                        <td
                          {...bc03StickyCell(
                            1,
                            REV_COL_W,
                            stickyBg,
                            cn("px-3 py-2 font-medium", isTotal ? "text-amber-50" : "text-slate-100")
                          )}
                        >
                          {isTotal ? "Total" : r.sale_name}
                          {isKpiOnly && (
                            <span className="ml-1 rounded bg-slate-700 px-1 py-0.5 text-[9px] text-slate-400">
                              KPI
                            </span>
                          )}
                        </td>
                        <td {...bc03StickyCell(2, REV_COL_W, stickyBg, "px-2 py-2 text-center")}>
                          {!isTotal && (
                            <button
                              type="button"
                              onClick={() => removeStaffRow(r.sale_name)}
                              className="rounded p-1 text-slate-500 hover:bg-red-950/50 hover:text-red-400"
                              title="Xóa dòng khỏi bảng KPI"
                            >
                              ×
                            </button>
                          )}
                        </td>
                        <td {...bc03StickyCell(3, REV_COL_W, stickyBg, "px-2 py-2 text-center tabular-nums")}>
                          {isTotal ? (
                            <span className="text-amber-200">{fmtInt(kpi.b4Gmv)}</span>
                          ) : (
                            <InlineKpiInput
                              value={kpi.b4Gmv}
                              onChange={(n) => patchKpi(r.sale_name, { b4Gmv: n })}
                              className="w-24"
                            />
                          )}
                        </td>
                        <td {...bc03StickyCell(4, REV_COL_W, stickyBg, "px-2 py-2")}>
                          <KpiProgressBar actual={vndTotal} target={kpi.b4Gmv} label="Tiến độ GMV VND" />
                        </td>
                        <td
                          {...bc03StickyCell(5, REV_COL_W, stickyBg, "px-2 py-2 text-right tabular-nums whitespace-nowrap")}
                        >
                          <span className={isTotal ? "text-amber-50" : "font-medium text-emerald-400"}>
                            {fmtMoney(primaryTotal, currency)}
                          </span>
                          {gmvPct !== null && (
                            <div className="text-[10px] text-slate-500">{gmvPct}% GMV</div>
                          )}
                        </td>
                        <td
                          {...bc03StickyCell(
                            6,
                            REV_COL_W,
                            stickyBg,
                            cn("px-2 py-2 text-right tabular-nums", isTotal ? "text-amber-50" : "text-slate-200")
                          )}
                        >
                          {r.orders}
                        </td>
                        {dates.map((d) => {
                          const bucket = r.daily?.[d];
                          if (!bucket) {
                            return (
                              <td
                                key={d}
                                className={cn("px-2 py-2 text-right text-slate-600", isTotal && "bg-amber-950/40")}
                              >
                                —
                              </td>
                            );
                          }
                          const dayVal =
                            currency === "VND"
                              ? revVndFromBucket(bucket, exchangeRate)
                              : revRmbFromBucket(bucket, exchangeRate);
                          return (
                            <td
                              key={d}
                              className={cn(
                                "px-2 py-2 text-right tabular-nums whitespace-nowrap",
                                isTotal && "bg-amber-950/40"
                              )}
                            >
                              <div className={dayVal > 0 ? (isTotal ? "text-amber-50" : "text-slate-200") : "text-slate-600"}>
                                {dayVal > 0 ? fmtCompact(dayVal) : "—"}
                              </div>
                              {bucket.orders > 0 && (
                                <div className="text-[10px] text-slate-500">{bucket.orders} đơn</div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          ) : autoTab === "trial" ? (
            <table className="min-w-max w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-700 bg-slate-900/80 text-slate-400">
                  <th {...bc03StickyCell(0, TRI_COL_W, "bg-slate-900", "px-3 py-2.5 text-left font-medium")}>
                    Team
                  </th>
                  <th {...bc03StickyCell(1, TRI_COL_W, "bg-slate-900", "px-3 py-2.5 text-left font-medium")}>
                    Tên Sale
                  </th>
                  <th {...bc03StickyCell(2, TRI_COL_W, "bg-slate-900", "px-2 py-2.5 text-right font-medium whitespace-nowrap")}>
                    Tổng L4
                  </th>
                  {dates.map((d) => (
                    <th key={d} className="px-2 py-2.5 text-right font-medium whitespace-nowrap min-w-[4rem]">
                      {fmtDayHeader(d)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {trialDisplayRows.length === 0 ? (
                  <tr>
                    <td colSpan={3 + dates.length} className="py-10 text-center text-slate-500">
                      Chưa có dữ liệu trial.
                    </td>
                  </tr>
                ) : (
                  trialDisplayRows.map((item) => {
                    const isTotal = item.kind === "team-total";
                    const r = item.row;
                    const stickyBg = isTotal ? "bg-amber-950" : "bg-slate-900";
                    const rowKey = isTotal ? `trial-total-${item.team}` : r.sale_name;

                    return (
                      <tr
                        key={rowKey}
                        className={cn(
                          "border-b border-slate-700/40",
                          isTotal
                            ? "bg-amber-950/40 font-semibold text-amber-100"
                            : "hover:bg-slate-700/15"
                        )}
                      >
                        <td
                          {...bc03StickyCell(
                            0,
                            TRI_COL_W,
                            stickyBg,
                            cn("px-3 py-2 whitespace-nowrap", isTotal ? "text-amber-100" : "text-slate-400")
                          )}
                        >
                          {isTotal ? item.team : ""}
                        </td>
                        <td
                          {...bc03StickyCell(
                            1,
                            TRI_COL_W,
                            stickyBg,
                            cn("px-3 py-2 font-medium", isTotal ? "text-amber-50" : "text-slate-100")
                          )}
                        >
                          {isTotal ? "Total" : r.sale_name}
                        </td>
                        <td
                          {...bc03StickyCell(
                            2,
                            TRI_COL_W,
                            stickyBg,
                            cn(
                              "px-2 py-2 text-right tabular-nums font-medium",
                              isTotal ? "text-amber-50" : "text-blue-300"
                            )
                          )}
                        >
                          {new Intl.NumberFormat("vi-VN").format(r.completed_classes)}
                        </td>
                        {dates.map((d) => {
                          const v = r.daily?.[d] ?? 0;
                          return (
                            <td
                              key={d}
                              className={cn(
                                "px-2 py-2 text-right tabular-nums",
                                isTotal && "bg-amber-950/40",
                                v ? (isTotal ? "text-amber-50" : "text-slate-200") : "text-slate-600"
                              )}
                            >
                              {v > 0 ? v : "—"}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          ) : (
            <table className="min-w-max w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-700 bg-slate-900/80 text-slate-400">
                  <th {...bc03StickyCell(0, TRI_COL_W, "bg-slate-900", "px-3 py-2.5 text-left font-medium")}>
                    Team
                  </th>
                  <th {...bc03StickyCell(1, TRI_COL_W, "bg-slate-900", "px-3 py-2.5 text-left font-medium")}>
                    Tên Sale
                  </th>
                  <th {...bc03StickyCell(2, TRI_COL_W, "bg-slate-900", "px-2 py-2.5 text-right font-medium whitespace-nowrap")}>
                    Tổng L1.2
                  </th>
                  {dates.map((d) => (
                    <th key={d} className="px-2 py-2.5 text-right font-medium whitespace-nowrap min-w-[4rem]">
                      {fmtDayHeader(d)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {referralDisplayRows.length === 0 ? (
                  <tr>
                    <td colSpan={3 + dates.length} className="py-10 text-center text-slate-500">
                      Chưa có dữ liệu referral.
                    </td>
                  </tr>
                ) : (
                  referralDisplayRows.map((item) => {
                    const isTotal = item.kind === "team-total";
                    const r = item.row;
                    const stickyBg = isTotal ? "bg-amber-950" : "bg-slate-900";
                    const rowKey = isTotal ? `referral-total-${item.team}` : r.sale_name;

                    return (
                      <tr
                        key={rowKey}
                        className={cn(
                          "border-b border-slate-700/40",
                          isTotal
                            ? "bg-amber-950/40 font-semibold text-amber-100"
                            : "hover:bg-slate-700/15"
                        )}
                      >
                        <td
                          {...bc03StickyCell(
                            0,
                            TRI_COL_W,
                            stickyBg,
                            cn("px-3 py-2 whitespace-nowrap", isTotal ? "text-amber-100" : "text-slate-400")
                          )}
                        >
                          {isTotal ? item.team : ""}
                        </td>
                        <td
                          {...bc03StickyCell(
                            1,
                            TRI_COL_W,
                            stickyBg,
                            cn("px-3 py-2 font-medium", isTotal ? "text-amber-50" : "text-slate-100")
                          )}
                        >
                          {isTotal ? "Total" : r.sale_name}
                        </td>
                        <td
                          {...bc03StickyCell(
                            2,
                            TRI_COL_W,
                            stickyBg,
                            cn(
                              "px-2 py-2 text-right tabular-nums font-medium",
                              isTotal ? "text-amber-50" : "text-violet-300"
                            )
                          )}
                        >
                          {new Intl.NumberFormat("vi-VN").format(r.referral_leads)}
                        </td>
                        {dates.map((d) => {
                          const v = r.daily?.[d] ?? 0;
                          return (
                            <td
                              key={d}
                              className={cn(
                                "px-2 py-2 text-right tabular-nums",
                                isTotal && "bg-amber-950/40",
                                v ? (isTotal ? "text-amber-50" : "text-slate-200") : "text-slate-600"
                              )}
                            >
                              {v > 0 ? v : "—"}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-slate-500">
          {filterMode === "month"
            ? "Đang xem cả tháng — chuyển sang Theo ngày để lọc khoảng ngày trong tháng."
            : `Lọc theo ngày trong ${monthLabel} — KPI vẫn theo cả tháng.`}{" "}
          Tab Doanh thu: thêm sale + × xóa dòng · Click bảng rồi dùng{" "}
          <strong className="text-slate-400">← → Home End</strong> cuộn ngang · Bấm{" "}
          <strong className="text-slate-400">Lưu tỷ giá &amp; KPI</strong> để ghi thay đổi.
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => scrollTableHorizontal(-DAY_COL_SCROLL_PX * 3)}
            className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-400 hover:bg-slate-700 hover:text-slate-200"
            title="Cuộn trái (←)"
          >
            ←
          </button>
          <button
            type="button"
            onClick={focusTableScroll}
            className="rounded border border-slate-600 px-2 py-1 text-[10px] text-slate-500 hover:bg-slate-700"
            title="Focus bảng để dùng phím ← → Home End"
          >
            ⌨ ← →
          </button>
          <button
            type="button"
            onClick={() => scrollTableHorizontal(DAY_COL_SCROLL_PX * 3)}
            className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-400 hover:bg-slate-700 hover:text-slate-200"
            title="Cuộn phải (→)"
          >
            →
          </button>
        </div>
      </div>
    </div>
  );
}
