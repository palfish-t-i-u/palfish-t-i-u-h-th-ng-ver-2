import { useEffect, useMemo, useState, type ReactNode } from "react";
import { endpoints } from "../lib/api";
import { cn } from "../lib/cn";
import type {
  GamificationCommission,
  GamificationDashboardSummary,
  GamificationEventItem,
  GamificationTaskItem,
} from "../types/dashboard";
import type { RevenueLedgerRow } from "../types/revenue";
import {
  buildDashboardSalesData,
  buildDashboardSalesRowsFromGamification,
  formatVndCompact,
  monthDateRange,
  todayIso,
  type DashboardSaleRow,
} from "./DashboardTab.utils";

type RewardTone = "purple" | "amber";

type RewardCard = GamificationTaskItem & {
  tone: RewardTone;
  label: string;
};

const SAMPLE_LEDGER_ROWS: RevenueLedgerRow[] = [
  sampleRow("sample-1", "Tran My Linh", "Ca Ganh Team", 86_000_000),
  sampleRow("sample-2", "Pham Quoc Anh", "Ca Cham Chi", 72_500_000),
  sampleRow("sample-3", "Le Thu Trang", "Ca Hoc Gioi", 64_000_000),
  sampleRow("sample-4", "Dang Hoang Son", "Ca Thu Linh", 1_200_000_000, monthDateRange().from),
  sampleRow("sample-5", "Vu Khanh Vy", "Ca Nong Nay", 1_100_000_000, monthDateRange().from),
  sampleRow("sample-6", "Truong My Duyen", "HCM 02", 612_000_000, monthDateRange().from),
];

const SAMPLE_TASKS: RewardCard[] = [
  {
    id: "task-1",
    title: "Team đạt 100% KPI",
    description: "Toàn team chạm mốc KPI tháng",
    reward: "+1.000.000đ",
    tone: "purple",
    label: "THEO TEAM",
  },
  {
    id: "task-2",
    title: "Team đạt 110% KPI",
    description: "Vượt 10% KPI tháng - thưởng kép",
    reward: "+2.000.000đ",
    tone: "purple",
    label: "THEO TEAM",
  },
  {
    id: "task-3",
    title: "Doanh số cá nhân tuần đạt 100 triệu",
    description: "Mốc tuần - cá nhân",
    reward: "+200.000đ",
    tone: "amber",
    label: "CÁ NHÂN",
  },
  {
    id: "task-4",
    title: "Doanh số cá nhân tuần đạt 115 triệu",
    description: "Mốc tuần - cá nhân",
    reward: "+300.000đ",
    tone: "amber",
    label: "CÁ NHÂN",
  },
  {
    id: "task-5",
    title: "Doanh số cá nhân tuần đạt 130 triệu",
    description: "Mốc tuần - cá nhân",
    reward: "+500.000đ",
    tone: "amber",
    label: "CÁ NHÂN",
  },
];

const SAMPLE_GAMIFICATION_SUMMARY: GamificationDashboardSummary = {
  top_today: [
    { id: "sale-today-1", name: "Tran My Linh", revenue: 86_000_000 },
    { id: "sale-today-2", name: "Pham Quoc Anh", revenue: 72_500_000 },
    { id: "sale-today-3", name: "Le Thu Trang", revenue: 64_000_000 },
  ],
  top_month: [
    { id: "sale-month-1", name: "Dang Hoang Son", revenue: 1_200_000_000 },
    { id: "sale-month-2", name: "Vu Khanh Vy", revenue: 1_100_000_000 },
    { id: "sale-month-3", name: "Truong My Duyen", revenue: 612_000_000 },
    { id: "sale-month-4", name: "Tran My Linh", revenue: 86_000_000 },
    { id: "sale-month-5", name: "Pham Quoc Anh", revenue: 72_500_000 },
    { id: "sale-month-6", name: "Le Thu Trang", revenue: 64_000_000 },
  ],
  tasks: SAMPLE_TASKS.map(({ id, title, description, reward }) => ({
    id,
    title,
    description,
    reward,
  })),
  events: [
    {
      id: "event-1",
      title: "Hanh Trinh Da Nang 2026",
      date: "2026-06-15",
      description: "Top 30 toan quoc · 3 ngay 2 dem · All-inclusive",
    },
  ],
  commission: {
    status: "coming_soon",
    amount: 0,
  },
};

function sampleRow(
  id: string,
  saleCrmName: string,
  team: string,
  soTienVnd: number,
  ngayTienVe = todayIso()
): RevenueLedgerRow {
  return {
    id,
    ngayTienVe,
    payTime: ngayTienVe,
    tenKhach: "",
    sdt: "",
    uid: "",
    goiHoc: "",
    soTienVnd,
    gmvRmb: Math.round(soTienVnd / 3700),
    tyGiaVndRmb: 3700,
    paymentMethod: "",
    loai: "",
    loai2: "",
    saleCrmName,
    team,
    teamPivotLabel: team,
    note: "",
    note2: "",
    loaiNhap: "tu_dong",
    donHangId: null,
    maDonHang: "",
    crmOrderId: "",
    infoCode: "",
  };
}

function TrophyIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 21h8" />
      <path d="M12 17v4" />
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
      <path d="M5 5H3v3a4 4 0 0 0 4 4" />
      <path d="M19 5h2v3a4 4 0 0 1-4 4" />
    </svg>
  );
}

function MedalIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2h8l-2 6h-4L8 2Z" />
      <circle cx="12" cy="14" r="5" />
      <path d="m10.8 14.4.9.9 2-2.4" />
    </svg>
  );
}

function BoardIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m13 2-8 12h7l-1 8 8-12h-7l1-8Z" />
    </svg>
  );
}

function EventIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="17" rx="3" />
      <path d="M8 2v4M16 2v4M3 10h18" />
      <path d="m9 15 2 2 4-4" />
    </svg>
  );
}

function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn("overflow-hidden rounded-[18px] border border-[#E3E6EF] bg-white shadow-[0_10px_28px_rgba(31,35,48,0.08)]", className)}>
      {children}
    </section>
  );
}

function SectionHeader({
  icon,
  title,
  action,
}: {
  icon: ReactNode;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-[46px] items-center justify-between gap-3 border-b border-[#E8EAF2] px-5">
      <div className="flex items-center gap-2 text-[15px] font-extrabold text-[#101426]">
        <span className="text-[#1F2937]">{icon}</span>
        {title}
      </div>
      {action}
    </div>
  );
}

function AvatarBadge({ row, rank, selected }: { row: DashboardSaleRow; rank: number; selected?: boolean }) {
  const colors = ["bg-[#FFF0B8] text-[#9C6A00]", "bg-[#EFE9FF] text-[#6A55E8]", "bg-[#FFE5E5] text-[#DA3B3B]", "bg-[#E2F7F3] text-[#009981]"];

  return (
    <div className="relative">
      <span
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-[14px] text-xs font-extrabold ring-2",
          colors[rank % colors.length],
          selected ? "ring-[#F6BF26]" : "ring-transparent"
        )}
      >
        {row.initials}
      </span>
      {rank <= 3 ? (
        <span className="absolute -left-2 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#F2A900] px-1 text-[11px] font-extrabold text-white shadow-sm">
          {rank}
        </span>
      ) : null}
    </div>
  );
}

function CommissionCard({ commission }: { commission?: GamificationCommission | null }) {
  const isComingSoon = commission?.status === "coming_soon" || !commission?.status;

  return (
    <div className="relative min-h-[168px] overflow-hidden rounded-[18px] bg-[#6C5CE7] p-5 text-white shadow-[0_16px_36px_rgba(108,92,231,0.24)] sm:min-h-[218px] sm:p-7">
      <div className="absolute -right-10 -top-12 h-36 w-36 rounded-full bg-white/10" />
      <div className="absolute bottom-0 right-0 h-full w-36 bg-[#5949D6]/35" />
      <div className="relative z-10 flex h-full min-h-[164px] flex-col">
        <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-white/90">
          <TrophyIcon />
          Tính hoa hồng
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="rounded-[16px] border border-white/20 bg-white/10 px-5 py-4 text-center backdrop-blur sm:px-8 sm:py-5">
            <div className="text-2xl font-extrabold tracking-normal sm:text-3xl">
              {isComingSoon ? "Đang phát triển" : formatVndCompact(commission?.amount ?? 0)}
            </div>
            <div className="mt-2 text-sm font-medium text-white/75">
              {isComingSoon ? "Công thức hoa hồng sẽ được cập nhật sau" : "Dữ liệu hoa hồng đang được cập nhật"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function RankPositionCard({ ranking }: { ranking: DashboardSaleRow[] }) {
  const top = ranking[0];
  const totalSales = ranking.length || 1;
  const gmv = top ? formatVndCompact(top.gmv_vnd) : "0";

  return (
    <div className="min-h-[192px] rounded-[18px] bg-[#242B3A] p-7 text-white shadow-[0_16px_36px_rgba(20,24,36,0.18)]">
      <div className="flex items-center gap-5">
        <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-[4px] border-[#9EA4B8] bg-[#F2F1FF] text-xl font-extrabold text-[#6C5CE7] shadow-inner">
          {top?.initials ?? "--"}
        </div>
        <div>
          <div className="text-xs font-extrabold uppercase tracking-wide text-white/55">Vị trí dẫn đầu tháng</div>
          <div className="mt-1 flex items-end gap-3">
            <span className="text-5xl font-extrabold leading-none text-white">#1</span>
            <span className="mb-1 rounded-full bg-[#1BAA6F] px-2 py-1 text-xs font-bold text-white">Top {totalSales}</span>
          </div>
        </div>
      </div>
      <p className="mt-5 text-sm font-semibold text-white">
        {top ? `${top.sale_crm_name} đang dẫn bảng với ` : "Chưa có dữ liệu doanh thu tháng."}
        {top ? <span className="text-[#FFD66B]">{gmv}</span> : null}
      </p>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/15">
        <div className="h-full rounded-full bg-[#FFD66B]" style={{ width: top ? "78%" : "8%" }} />
      </div>
      <div className="mt-2 flex justify-between text-xs font-semibold text-white/50">
        <span>{top ? `#1 - ${gmv}` : "#1"}</span>
        <span>{ranking[1] ? `#2 - ${formatVndCompact(ranking[1].gmv_vnd)}` : "#2"}</span>
      </div>
    </div>
  );
}

function TodayHonors({ rows, loading }: { rows: DashboardSaleRow[]; loading: boolean }) {
  const visible = rows.slice(0, 3);
  const dateBadge = `${todayIso().slice(8, 10)}/${todayIso().slice(5, 7)}`;

  return (
    <Card>
      <SectionHeader
        icon={<MedalIcon />}
        title="Vinh danh hôm nay"
        action={<span className="rounded-full bg-[#FFF0F2] px-3 py-1 text-xs font-bold text-[#FF4D5F]">{dateBadge}</span>}
      />
      <div className="space-y-2 p-5">
        {loading && visible.length === 0 ? <div className="py-8 text-center text-sm text-gmv-muted">Đang tải dữ liệu...</div> : null}
        {!loading && visible.length === 0 ? <div className="py-8 text-center text-sm text-gmv-muted">Chưa có doanh thu hôm nay.</div> : null}
        {visible.map((row, index) => (
          <div
            key={`${row.sale_crm_name}-${row.rank}`}
            className={cn(
              "flex items-center gap-3 rounded-[14px] border px-3 py-2.5",
              index === 0 ? "border-[#F3C545] bg-[#FFF3CF]" : "border-[#E8EAF2] bg-[#F8F8FB]"
            )}
          >
            <AvatarBadge row={row} rank={index + 1} selected={index === 0} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-extrabold text-[#101426]">{row.sale_crm_name}</div>
              {row.team ? (
                <div className={cn("truncate text-xs font-bold", index === 0 ? "text-[#B87400]" : "text-[#5F6678]")}>
                  {row.team}
                </div>
              ) : null}
            </div>
            <div className="text-right">
              <div className="text-base font-extrabold text-[#101426]">{formatVndCompact(row.gmv_vnd)}</div>
              {row.order_count > 0 ? <div className="text-xs text-[#8A92A6]">{row.order_count} đơn</div> : null}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function MonthRanking({ rows, loading }: { rows: DashboardSaleRow[]; loading: boolean }) {
  const visible = rows.slice(0, 15);

  return (
    <Card>
      <SectionHeader
        icon={<TrophyIcon />}
        title={`Bảng xếp hạng tháng ${new Date().getMonth() + 1}`}
        action={<span className="rounded-full bg-[#F0EBFF] px-3 py-1 text-xs font-bold text-[#6C5CE7]">{rows.length} sales</span>}
      />
      <div className="grid grid-cols-[52px_minmax(0,1fr)_96px_72px] gap-2 border-b border-[#E8EAF2] px-5 py-2 text-[11px] font-extrabold uppercase tracking-wide text-[#9AA1B3]">
        <span>Hạng</span>
        <span>Nhân viên</span>
        <span className="text-right">Doanh thu</span>
        <span className="text-right">Đơn b.động</span>
      </div>
      <div className="divide-y divide-[#E8EAF2]">
        {loading && visible.length === 0 ? <div className="py-10 text-center text-sm text-gmv-muted">Đang tải bảng xếp hạng...</div> : null}
        {!loading && visible.length === 0 ? <div className="py-10 text-center text-sm text-gmv-muted">Chưa có dữ liệu tháng này.</div> : null}
        {visible.map((row, index) => (
          <div
            key={`${row.sale_crm_name}-${row.rank}`}
            className={cn(
              "grid min-h-[45px] grid-cols-[52px_minmax(0,1fr)_96px_72px] items-center gap-2 px-5 text-sm",
              index === 0 && "bg-[#FFF9EC]",
              index === 1 && "bg-[#F8FAFF]",
              index === 2 && "bg-[#FFF6F1]"
            )}
          >
            <div>
              <span
                className={cn(
                  "inline-flex h-7 min-w-7 items-center justify-center rounded-[8px] px-1 text-sm font-extrabold",
                  index < 3 ? "bg-[#F2A900] text-white" : "text-[#9AA1B3]"
                )}
              >
                {row.rank}
              </span>
            </div>
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#F0EBFF] text-[10px] font-extrabold text-[#6C5CE7]">
                {row.initials}
              </span>
              <div className="min-w-0">
                <div className="truncate font-extrabold text-[#101426]">{row.sale_crm_name}</div>
                {row.team ? <div className="truncate text-[11px] text-[#8A92A6]">{row.team}</div> : null}
              </div>
            </div>
            <div className="text-right font-extrabold text-[#101426]">{formatVndCompact(row.gmv_vnd)}</div>
            <div className="text-right font-semibold text-[#4B5572]">{row.order_count > 0 ? row.order_count : "—"}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function mapTaskToReward(task: GamificationTaskItem, index: number): RewardCard {
  const isTeam = task.title.toLowerCase().includes("team");
  return {
    ...task,
    tone: isTeam || index < 2 ? "purple" : "amber",
    label: isTeam ? "THEO TEAM" : "CÁ NHÂN",
  };
}

function WeeklyRewards({ tasks }: { tasks: GamificationTaskItem[] }) {
  const visibleTasks = (tasks.length ? tasks.map(mapTaskToReward) : SAMPLE_TASKS).slice(0, 5);

  return (
    <Card>
      <SectionHeader
        icon={<BoardIcon />}
        title="Bảng nhiệm vụ & thưởng tuần"
        action={<span className="rounded-full bg-[#FFF4D9] px-3 py-1 text-xs font-bold text-[#C77800]">Còn 3 ngày</span>}
      />
      <div className="divide-y divide-[#E8EAF2]">
        {visibleTasks.map((item) => (
          <div key={item.id} className="flex min-h-[146px] items-center gap-5 px-6 py-5">
            <span
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]",
                item.tone === "purple" ? "bg-[#EEE9FF] text-[#6C5CE7]" : "bg-[#FFF0CF] text-[#D98200]"
              )}
            >
              <BoardIcon />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-extrabold text-[#101426]">{item.title}</div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-extrabold",
                    item.tone === "purple" ? "bg-[#EEE9FF] text-[#6C5CE7]" : "bg-[#FFF0CF] text-[#C77800]"
                  )}
                >
                  {item.label}
                </span>
                <span className="text-xs text-[#8A92A6]">{item.description}</span>
              </div>
            </div>
            <div className="shrink-0 text-right text-lg font-extrabold text-[#E56B00]">{item.reward}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function InternalEvents({ event }: { event?: GamificationEventItem }) {
  const activeEvent = event ?? SAMPLE_GAMIFICATION_SUMMARY.events[0];

  return (
    <Card>
      <SectionHeader icon={<EventIcon />} title="Bảng sự kiện nội bộ" />
      <div className="relative min-h-[132px] overflow-hidden bg-[#108D7E] p-7 text-white">
        <div className="absolute -right-8 -top-6 h-36 w-36 rounded-full bg-white/10" />
        <div className="relative z-10">
          <span className="inline-flex rounded-full bg-white/20 px-3 py-1 text-xs font-extrabold uppercase">Team building</span>
          <div className="mt-4 flex items-end justify-between gap-4">
            <div>
              <h3 className="text-2xl font-extrabold tracking-normal">{activeEvent.title}</h3>
              <p className="mt-1 text-sm font-semibold text-white/90">{activeEvent.description}</p>
            </div>
            <div className="hidden h-[72px] w-[92px] shrink-0 items-center justify-center rounded-[18px] bg-[#0E756B] text-white sm:flex">
              <EventIcon />
            </div>
          </div>
          <div className="mt-5 flex gap-2">
            <span className="h-1.5 w-8 rounded-full bg-white" />
            <span className="h-1.5 w-1.5 rounded-full bg-white/60" />
            <span className="h-1.5 w-1.5 rounded-full bg-white/60" />
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function DashboardTab() {
  const [rows, setRows] = useState<RevenueLedgerRow[]>([]);
  const [summary, setSummary] = useState<GamificationDashboardSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [usingFallback, setUsingFallback] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setUsingFallback(false);

      try {
        const summaryRes = await endpoints.dashboard.gamificationSummary();
        if (!cancelled) {
          setSummary(summaryRes.data);
          setRows([]);
        }
        return;
      } catch {
        // Fall through to ledger-based fallback.
      }

      try {
        const range = monthDateRange();
        const allRows: RevenueLedgerRow[] = [];
        let offset = 0;
        const limit = 1000;
        let hasMore = true;

        while (hasMore) {
          const res = await endpoints.revenue.listLedger({
            from: range.from,
            to: range.to,
            limit,
            offset,
          });
          allRows.push(...(res.data.rows ?? []));
          hasMore = Boolean(res.data.hasMore);
          offset += limit;
        }

        if (!cancelled) {
          setRows(allRows);
          setSummary(null);
        }
      } catch {
        if (!cancelled) {
          setRows(SAMPLE_LEDGER_ROWS);
          setSummary(SAMPLE_GAMIFICATION_SUMMARY);
          setUsingFallback(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  const salesData = useMemo(() => {
    if (summary) {
      return {
        today: buildDashboardSalesRowsFromGamification(summary.top_today),
        month: buildDashboardSalesRowsFromGamification(summary.top_month),
      };
    }
    return buildDashboardSalesData(rows, todayIso());
  }, [rows, summary]);

  return (
    <div className="min-w-0 bg-[#F4F5F8] p-0 text-[#101426] md:p-1">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.9fr)]">
        <div className="min-w-0 space-y-4">
          <CommissionCard commission={summary?.commission} />
          {usingFallback ? (
            <div className="rounded-[12px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              API dashboard chưa sẵn sàng, đang hiển thị dữ liệu mẫu dự phòng.
            </div>
          ) : null}
          <TodayHonors rows={salesData.today} loading={loading} />
          <MonthRanking rows={salesData.month} loading={loading} />
        </div>
        <div className="min-w-0 space-y-4">
          <RankPositionCard ranking={salesData.month} />
          <WeeklyRewards tasks={summary?.tasks ?? []} />
          <InternalEvents event={summary?.events?.[0]} />
        </div>
      </div>
    </div>
  );
}
