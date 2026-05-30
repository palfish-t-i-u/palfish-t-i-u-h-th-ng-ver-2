export interface GamificationTopSale {
  id: string;
  name: string;
  revenue: number;
  avatar_url?: string | null;
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

export interface GamificationDashboardSummary {
  top_today: GamificationTopSale[];
  top_month: GamificationTopSale[];
  tasks: GamificationTaskItem[];
  events: GamificationEventItem[];
  commission: GamificationCommission;
}
