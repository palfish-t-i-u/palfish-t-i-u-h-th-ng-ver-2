export interface GamificationTopSale {
  id: string;
  name: string;
  revenue: number;
  avatar_url?: string | null;
  team?: string | null;
  sub_team?: string | null;
}

export interface GamificationTaskItem {
  id: string;
  title: string;
  description: string;
  reward: string;
}

export interface GamificationEventItem {
  id: string;
  title: string;
  date: string;
  description: string;
}

export interface GamificationCommission {
  status: string;
  amount: number;
}

export interface GamificationCurrentUser {
  rank: number;
  name: string;
  revenue: number;
  total_sales: number;
  next_rank_name?: string | null;
  next_rank_revenue?: number | null;
  gap?: number;
}

export interface GamificationDashboardSummary {
  top_today: GamificationTopSale[];
  top_month: GamificationTopSale[];
  tasks: GamificationTaskItem[];
  events: GamificationEventItem[];
  commission: GamificationCommission;
  current_user?: GamificationCurrentUser | null;
}
