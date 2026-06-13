// Khớp BE schema từ Đức (fb83b5f, revenue_routes.py):
// table exchange_rates: { effective_from (PK), rate, note, created_at, created_by, id (uuid auto) }
// BE chỉ có GET list + POST upsert (không có PATCH/DELETE) → FE bỏ Xóa/Sửa, chỉ thêm mới.
// effective_to không tồn tại — "current" tính bằng row mới nhất có effective_from <= today.
export interface ExchangeRateApiRow {
  id?: string; // uuid auto-thêm bởi Supabase
  effective_from: string; // PK, ISO date YYYY-MM-DD
  rate: number;
  note?: string | null;
  created_at: string;
  created_by?: string | null;
}

export interface ExchangeRateItem {
  id: string; // dùng effective_from làm key UI nếu BE không trả uuid
  rate: number;
  effectiveFrom: string;
  note?: string;
  createdAt: string;
  createdBy?: string;
}

export interface ExchangeRatesListResponse {
  rates: ExchangeRateApiRow[];
}

export interface ExchangeRateUpsertPayload {
  rate: number;
  effective_from: string;
  note?: string;
}

export function fromApiExchangeRate(row: ExchangeRateApiRow): ExchangeRateItem {
  return {
    id: row.id ?? row.effective_from,
    rate: Number(row.rate),
    effectiveFrom: row.effective_from,
    note: row.note ?? undefined,
    createdAt: row.created_at,
    createdBy: row.created_by ?? undefined,
  };
}
