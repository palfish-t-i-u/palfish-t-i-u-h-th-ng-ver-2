import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { endpoints } from "../lib/api";
import { cn } from "../lib/cn";
import { subTeamLabel } from "../lib/subTeamLabels";
import { useRefetchOnFocus } from "../hooks/useRefetchOnFocus";
import { useRealtimeTable } from "../hooks/useRealtimeTable";
import type {
  GamificationCommission,
  GamificationCurrentUser,
  GamificationDashboardSummary,
  GamificationEventItem,
  GamificationTaskItem,
} from "../types/dashboard";
import type { RevenueLedgerRow } from "../types/revenue";
import {
  buildDashboardSalesData,
  buildDashboardSalesRowsFromGamification,
  formatRevenueMillions,
  formatVndCompact,
  getInitials,
  monthDateRange,
  todayIso,
  type DashboardSaleRow,
} from "./DashboardTab.utils";

type RewardTone = "purple" | "amber";

type RewardCard = GamificationTaskItem & {
  tone: RewardTone;
  label: string;
};

const SAMPLE_LEDGER_ROWS: RevenueLedgerRow[] = [];

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
    description: "Vượt 10% KPI tháng — thưởng kép",
    reward: "+2.000.000đ",
    tone: "purple",
    label: "THEO TEAM",
  },
  {
    id: "task-3",
    title: "Doanh số cá nhân tuần đạt 100 triệu",
    description: "Mốc tuần · cá nhân",
    reward: "+200.000đ",
    tone: "amber",
    label: "CÁ NHÂN",
  },
  {
    id: "task-4",
    title: "Doanh số cá nhân tuần đạt 115 triệu",
    description: "Mốc tuần · cá nhân",
    reward: "+300.000đ",
    tone: "amber",
    label: "CÁ NHÂN",
  },
  {
    id: "task-5",
    title: "Doanh số cá nhân tuần đạt 130 triệu",
    description: "Mốc tuần · cá nhân",
    reward: "+500.000đ",
    tone: "amber",
    label: "CÁ NHÂN",
  },
];

const SAMPLE_GAMIFICATION_SUMMARY: GamificationDashboardSummary = {
  top_today: [],
  top_month: [],
  tasks: SAMPLE_TASKS.map(({ id, title, description, reward }) => ({
    id,
    title,
    description,
    reward,
  })),
  events: [
    {
      id: "event-1",
      title: "Gala Vinh Danh Quý II / 2026",
      date: "2026-06-14",
      description: "Đêm tôn vinh Top Sales · 14/06 · Khách sạn Lotte Hà Nội",
    },
    {
      id: "event-2",
      title: 'Đua Sprint "Bứt Tốc Tháng 6"',
      date: "2026-06-30",
      description: "Thưởng nóng 50 triệu cho team dẫn đầu doanh số",
    },
    {
      id: "event-3",
      title: "Hành Trình Đà Nẵng 2026",
      date: "2026-07-15",
      description: "Top 30 toàn quốc · 3 ngày 2 đêm · All-inclusive",
    },
    {
      id: "event-4",
      title: 'Workshop "Chốt Đơn Đỉnh Cao"',
      date: "2026-06-07",
      description: "Chia sẻ từ Top 1 Đặng Hoàng Sơn · Thứ 6 hàng tuần",
    },
  ],
  commission: {
    status: "coming_soon",
    amount: 0,
  },
};

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

function TeamIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function TargetIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
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
    <div className="relative shrink-0 overflow-hidden rounded-[18px] bg-[#6C5CE7] px-5 py-4 text-white shadow-[0_16px_36px_rgba(108,92,231,0.24)] sm:px-7 sm:py-5">
      <div className="absolute -right-10 -top-12 h-36 w-36 rounded-full bg-white/10" />
      <div className="absolute bottom-0 right-0 h-full w-36 bg-[#5949D6]/35" />
      <div className="relative z-10">
        <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-white/90">
          <TrophyIcon />
          Tính hoa hồng
        </div>
        <div className="mt-3 flex items-center justify-center">
          <div className="rounded-[16px] border border-white/20 bg-white/10 px-5 py-3 text-center backdrop-blur sm:px-8">
            <div className="text-xl font-extrabold tracking-normal sm:text-2xl">
              {isComingSoon ? "Đang phát triển" : formatVndCompact(commission?.amount ?? 0)}
            </div>
            <div className="mt-1 text-xs font-medium text-white/75">
              {isComingSoon ? "Công thức hoa hồng sẽ được cập nhật sau" : "Dữ liệu hoa hồng đang được cập nhật"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function rankProgressWidth(currentUser: GamificationCurrentUser) {
  if (currentUser.rank === 1) return "100%";
  if (currentUser.next_rank_revenue && currentUser.next_rank_revenue > 0) {
    const pct = Math.min(95, Math.max(8, (currentUser.revenue / currentUser.next_rank_revenue) * 100));
    return `${pct}%`;
  }
  return currentUser.revenue > 0 ? "35%" : "8%";
}

function RankPositionCard({
  currentUser,
  ranking,
}: {
  currentUser?: GamificationCurrentUser | null;
  ranking: DashboardSaleRow[];
}) {
  const top = ranking[0];
  const totalSales = currentUser?.total_sales ?? (ranking.length || 1);

  if (currentUser) {
    const gmv = formatVndCompact(currentUser.revenue);
    const aboveRank = currentUser.rank > 1 ? currentUser.rank - 1 : null;
    const aboveGmv =
      currentUser.next_rank_revenue != null ? formatVndCompact(currentUser.next_rank_revenue) : null;

    return (
      <div className="shrink-0 rounded-[18px] bg-[#242B3A] px-5 py-4 text-white shadow-[0_16px_36px_rgba(20,24,36,0.18)] sm:px-7 sm:py-5">
        <div className="flex items-center gap-4">
          <div className="flex h-[56px] w-[56px] items-center justify-center rounded-full border-[3px] border-[#9EA4B8] bg-[#F2F1FF] text-lg font-extrabold text-[#6C5CE7] shadow-inner">
            {getInitials(currentUser.name)}
          </div>
          <div>
            <div className="text-[10px] font-extrabold uppercase tracking-wide text-white/55">Vị trí của bạn</div>
            <div className="mt-1 flex items-end gap-2">
              <span className="text-4xl font-extrabold leading-none text-white">#{currentUser.rank}</span>
              <span className="mb-0.5 rounded-full bg-[#1BAA6F] px-2 py-0.5 text-[11px] font-bold text-white">
                / {totalSales} sales
              </span>
            </div>
          </div>
        </div>
        <p className="mt-3 text-[13px] font-semibold text-white">
          {currentUser.rank === 1 ? (
            <>
              Bạn đang dẫn bảng với <span className="text-[#FFD66B]">{gmv}</span>
            </>
          ) : currentUser.revenue > 0 && currentUser.gap && currentUser.gap > 0 ? (
            <>
              Còn <span className="text-[#FFD66B]">{formatVndCompact(currentUser.gap)}</span>
              {currentUser.next_rank_name ? ` để vượt ${currentUser.next_rank_name}` : " để lên hạng"}
            </>
          ) : (
            <>
              Chưa có doanh thu tháng này
              {currentUser.gap && currentUser.gap > 0 ? (
                <>
                  {" "}— còn <span className="text-[#FFD66B]">{formatVndCompact(currentUser.gap)}</span> để chạm top{" "}
                  {totalSales}
                </>
              ) : null}
            </>
          )}
        </p>
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/15">
          <div className="h-full rounded-full bg-[#FFD66B]" style={{ width: rankProgressWidth(currentUser) }} />
        </div>
        <div className="mt-1.5 flex justify-between text-[11px] font-semibold text-white/50">
          <span>{`#${currentUser.rank} - ${gmv}`}</span>
          <span>
            {aboveRank && aboveGmv ? `#${aboveRank} - ${aboveGmv}` : currentUser.rank === 1 && ranking[1] ? `#2 - ${formatVndCompact(ranking[1].gmv_vnd)}` : `#${Math.max(1, currentUser.rank - 1)}`}
          </span>
        </div>
      </div>
    );
  }

  const gmv = top ? formatVndCompact(top.gmv_vnd) : "0";

  return (
    <div className="shrink-0 rounded-[18px] bg-[#242B3A] px-5 py-4 text-white shadow-[0_16px_36px_rgba(20,24,36,0.18)] sm:px-7 sm:py-5">
      <div className="flex items-center gap-4">
        <div className="flex h-[56px] w-[56px] items-center justify-center rounded-full border-[3px] border-[#9EA4B8] bg-[#F2F1FF] text-lg font-extrabold text-[#6C5CE7] shadow-inner">
          {top?.initials ?? "--"}
        </div>
        <div>
          <div className="text-[10px] font-extrabold uppercase tracking-wide text-white/55">Vị trí dẫn đầu tháng</div>
          <div className="mt-1 flex items-end gap-2">
            <span className="text-4xl font-extrabold leading-none text-white">#1</span>
            <span className="mb-0.5 rounded-full bg-[#1BAA6F] px-2 py-0.5 text-[11px] font-bold text-white">Top {totalSales}</span>
          </div>
        </div>
      </div>
      <p className="mt-3 text-sm font-semibold text-white">
        {top ? `${top.sale_crm_name} đang dẫn bảng với ` : "Chưa có dữ liệu doanh thu tháng."}
        {top ? <span className="text-[#FFD66B]">{gmv}</span> : null}
      </p>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/15">
        <div className="h-full rounded-full bg-[#FFD66B]" style={{ width: top ? "78%" : "8%" }} />
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] font-semibold text-white/50">
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
    <Card className="shrink-0">
      <SectionHeader
        icon={<MedalIcon />}
        title="Vinh danh hôm nay"
        action={<span className="rounded-full bg-[#FFF0F2] px-3 py-1 text-xs font-bold text-[#FF4D5F]">{dateBadge}</span>}
      />
      <div className="space-y-1.5 p-4">
        {loading && visible.length === 0 ? <div className="py-4 text-center text-sm text-gmv-muted">Đang tải dữ liệu...</div> : null}
        {!loading && visible.length === 0 ? <div className="py-4 text-center text-sm text-gmv-muted">Chưa có doanh thu hôm nay.</div> : null}
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
  return (
    <Card className="flex min-h-0 flex-1 flex-col">
      <SectionHeader
        icon={<TrophyIcon />}
        title={`Bảng xếp hạng tháng ${new Date().getMonth() + 1}`}
        action={<span className="rounded-full bg-[#F0EBFF] px-3 py-1 text-xs font-bold text-[#6C5CE7]">{rows.length} sales</span>}
      />
      <div className="grid grid-cols-[44px_minmax(140px,1.4fr)_minmax(88px,0.8fr)_minmax(88px,0.8fr)_80px_64px] gap-2 border-b border-[#E8EAF2] px-4 py-1.5 text-[10px] font-extrabold uppercase tracking-wide text-[#9AA1B3] max-md:grid-cols-[32px_minmax(0,1fr)_70px_46px] max-md:px-3">
        <span>Hạng</span>
        <span>Nhân viên</span>
        <span className="max-md:hidden">Team</span>
        <span className="max-md:hidden">Subteam</span>
        <span className="text-right">Doanh thu</span>
        <span className="text-right whitespace-nowrap">
          <span className="md:hidden">Đơn</span>
          <span className="hidden md:inline">Đơn b.động</span>
        </span>
      </div>
      <div className="min-h-0 flex-1 divide-y divide-[#E8EAF2] overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-[#c4b5fd] max-md:overflow-visible">
        {loading && rows.length === 0 ? <div className="py-8 text-center text-sm text-gmv-muted">Đang tải bảng xếp hạng...</div> : null}
        {!loading && rows.length === 0 ? <div className="py-8 text-center text-sm text-gmv-muted">Chưa có dữ liệu tháng này.</div> : null}
        {rows.map((row, index) => (
          <div
            key={`${row.sale_crm_name}-${row.rank}`}
            className={cn(
              "grid min-h-[38px] grid-cols-[44px_minmax(140px,1.4fr)_minmax(88px,0.8fr)_minmax(88px,0.8fr)_80px_64px] items-center gap-2 px-4 text-[13px]",
              "max-md:grid-cols-[32px_minmax(0,1fr)_70px_46px] max-md:px-3",
              index === 0 && "bg-[#FFF9EC]",
              index === 1 && "bg-[#F8FAFF]",
              index === 2 && "bg-[#FFF6F1]"
            )}
          >
            <div>
              <span
                className={cn(
                  "inline-flex h-6 min-w-6 items-center justify-center rounded-[6px] px-1 text-[13px] font-extrabold",
                  index < 3 ? "bg-[#F2A900] text-white" : "text-[#9AA1B3]"
                )}
              >
                {row.rank}
              </span>
            </div>
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#F0EBFF] text-[9px] font-extrabold text-[#6C5CE7]">
                {row.initials}
              </span>
              <div className="min-w-0">
                <div className="truncate font-extrabold text-[#101426]">{row.sale_crm_name}</div>
                <div className="truncate text-[11px] text-[#8A92A6] md:hidden">
                  {[row.team, subTeamLabel(row.sub_team)].filter(Boolean).join(" · ") || "—"}
                </div>
              </div>
            </div>
            <div className="truncate text-[#4B5572] max-md:hidden">{row.team || "—"}</div>
            <div className="truncate text-[#4B5572] max-md:hidden">{subTeamLabel(row.sub_team) || "—"}</div>
            <div className="text-right font-extrabold text-[#101426]">
              <span className="md:hidden">{formatVndCompact(row.gmv_vnd)}</span>
              <span className="hidden md:inline">{formatRevenueMillions(row.gmv_vnd)}</span>
            </div>
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
    <Card className="flex min-h-0 flex-1 flex-col">
      <SectionHeader
        icon={<BoardIcon />}
        title="Bảng nhiệm vụ & thưởng tuần"
        action={<span className="rounded-full bg-[#FFF4D9] px-3 py-1 text-xs font-bold text-[#C77800]">Còn 3 ngày</span>}
      />
      <div className="min-h-0 flex-1 divide-y divide-[#E8EAF2] overflow-y-auto">
        {visibleTasks.map((item) => (
          <div key={item.id} className="flex items-center gap-4 max-md:gap-3 px-5 py-3">
            <span
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px]",
                item.tone === "purple" ? "bg-[#EEE9FF] text-[#6C5CE7]" : "bg-[#FFF0CF] text-[#D98200]"
              )}
            >
              {item.tone === "purple" ? <TeamIcon /> : <TargetIcon />}
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
            <div className="shrink-0 text-right text-lg max-md:text-base font-extrabold text-[#E56B00]">{item.reward}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

const EVENT_STYLE: Record<string, { tag: string; emoji: string; bg: string; accent: string }> = {
  "event-1": { tag: "SỰ KIỆN", emoji: "🏆", bg: "#1B1464", accent: "#15104E" },
  "event-2": { tag: "PHONG TRÀO", emoji: "🚀", bg: "#108D7E", accent: "#0E756B" },
  "event-3": { tag: "TEAM BUILDING", emoji: "🏖️", bg: "#D97706", accent: "#B45309" },
  "event-4": { tag: "ĐÀO TẠO", emoji: "🎯", bg: "#DC2626", accent: "#B91C1C" },
};

function InternalEvents({ events }: { events?: GamificationEventItem[] }) {
  const allEvents = events?.length ? events : SAMPLE_GAMIFICATION_SUMMARY.events;
  const [activeIdx, setActiveIdx] = useState(0);
  const safeIdx = Math.min(activeIdx, allEvents.length - 1);
  const ev = allEvents[safeIdx] ?? allEvents[0];

  useEffect(() => {
    if (allEvents.length <= 1) return;
    const interval = setInterval(() => {
      setActiveIdx((prev) => (prev + 1) % allEvents.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [allEvents.length]);

  if (!ev) return null;

  const style = EVENT_STYLE[ev.id] ?? EVENT_STYLE["event-2"];

  return (
    <Card className="shrink-0">
      <SectionHeader icon={<EventIcon />} title="Bảng sự kiện nội bộ" />
      <div
        className="relative overflow-hidden px-5 py-4 text-white transition-colors duration-500 sm:px-7 sm:py-5"
        style={{ backgroundColor: style.bg }}
      >
        <div className="absolute -right-8 -top-6 h-36 w-36 rounded-full bg-white/10" />
        <div className="relative z-10">
          <span className="inline-flex rounded-full bg-white/20 px-2.5 py-0.5 text-[10px] font-extrabold uppercase">{style.tag}</span>
          <div className="mt-2.5 flex items-end justify-between gap-4">
            <div>
              <h3 className="text-xl font-extrabold tracking-normal sm:text-2xl">{ev.title}</h3>
              <p className="mt-1 text-xs font-semibold text-white/90 sm:text-sm">{ev.description}</p>
            </div>
            <div
              className="hidden h-[56px] w-[72px] shrink-0 items-center justify-center rounded-[14px] text-3xl sm:flex"
              style={{ backgroundColor: style.accent }}
            >
              {style.emoji}
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            {allEvents.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setActiveIdx(idx)}
                className={cn(
                  "rounded-full transition-all",
                  idx === safeIdx ? "h-1.5 w-8 bg-white" : "h-1.5 w-1.5 bg-white/60 hover:bg-white/80"
                )}
              />
            ))}
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
  const [refreshKey, setRefreshKey] = useState(0);

  const silentRef = useRef(false);
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);
  useRealtimeTable(["so_doanh_thu", "payment_lines"], refresh);
  useRefetchOnFocus(() => { silentRef.current = true; refresh(); });

  useEffect(() => {
    let cancelled = false;
    const silent = silentRef.current;
    silentRef.current = false;
    const timer = window.setTimeout(async () => {
      if (!silent) setLoading(true);
      setUsingFallback(false);

      try {
        try {
          const summaryRes = await endpoints.dashboard.gamificationSummary();
          if (!cancelled) {
            setSummary(summaryRes.data);
            setRows([]);
            if (!silent) setLoading(false);
          }
          return;
        } catch {
          // Fall through to ledger-based fallback.
        }

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
        if (!cancelled && !silent) setLoading(false);
      }
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [refreshKey]);

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
    <div className="min-w-0 bg-[#F4F5F8] p-0 text-[#101426] md:p-1 h-[calc(100vh-64px-48px)] overflow-hidden max-md:h-auto max-md:overflow-visible">
      <div className="grid h-full gap-3 xl:grid-cols-[minmax(0,1.05fr)_minmax(380px,0.9fr)] max-md:h-auto">
        <div className="flex min-w-0 flex-col gap-3 overflow-hidden max-md:overflow-visible">
          <CommissionCard commission={summary?.commission} />
          {usingFallback ? (
            <div className="shrink-0 rounded-[12px] border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800">
              API dashboard chưa sẵn sàng, đang hiển thị dữ liệu mẫu dự phòng.
            </div>
          ) : null}
          <TodayHonors rows={salesData.today} loading={loading} />
          <MonthRanking rows={salesData.month} loading={loading} />
        </div>
        <div className="flex min-w-0 flex-col gap-3 overflow-hidden max-md:overflow-visible">
          <RankPositionCard currentUser={summary?.current_user} ranking={salesData.month} />
          <WeeklyRewards tasks={summary?.tasks ?? []} />
          <InternalEvents events={summary?.events} />
        </div>
      </div>
    </div>
  );
}
