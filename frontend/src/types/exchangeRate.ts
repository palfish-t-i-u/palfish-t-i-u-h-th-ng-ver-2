// Tỷ giá GMV: 1 RMB = N VND. Hiện hard-code 3700.
// Mục tiêu: cho phép cấu hình theo thời kỳ (effective_from / effective_to).
export interface ExchangeRateApiRow {
  id: string;
  rate_vnd_per_rmb: number;
  effective_from: string; // ISO date YYYY-MM-DD
  effective_to?: string | null; // null = hiện hành
  note?: string | null;
  created_at: string;
  created_by?: string | null;
}

export interface ExchangeRateItem {
  id: string;
  rateVndPerRmb: number;
  effectiveFrom: string;
  effectiveTo?: string;
  note?: string;
  createdAt: string;
  createdBy?: string;
}

export interface ExchangeRatesListResponse {
  rates: ExchangeRateApiRow[];
  current_rate?: number;
}

export interface ExchangeRateUpsertPayload {
  rate_vnd_per_rmb: number;
  effective_from: string;
  note?: string;
}

export function fromApiExchangeRate(row: ExchangeRateApiRow): ExchangeRateItem {
  return {
    id: row.id,
    rateVndPerRmb: row.rate_vnd_per_rmb,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to ?? undefined,
    note: row.note ?? undefined,
    createdAt: row.created_at,
    createdBy: row.created_by ?? undefined,
  };
}
