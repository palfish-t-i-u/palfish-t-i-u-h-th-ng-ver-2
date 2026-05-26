import axios from "axios";
import { resolveApiBaseUrl } from "./apiBaseUrl";
import { supabase } from "./supabase";
import type { Bc03Report, Bc03MonthlySettings, Bc03StaffOption, CreateOrderPayload, DashboardDailyTrends, DashboardLiveSummary, DashboardSummary, InvoiceOrder, Order } from "../types/order";
import type {
  LedgerCreatePayload,
  LedgerPatchPayload,
  LedgerSummaryResponse,
  RevenueKeyDataResponse,
  RevenueLedgerListResponse,
  RevenueLedgerRow,
  RevenuePivotResponse,
  GsheetSyncResponse,
} from "../types/revenue";

export const API_BASE_URL = resolveApiBaseUrl();

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000,
});

api.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const endpoints = {
  packages: {
    list: () => api.get<{ packages: string[]; source: string }>("/packages"),
  },
  orders: {
    list: () => api.get<{ orders: Order[] }>("/orders"),
    create: (payload: CreateOrderPayload & { createdBy?: string }) =>
      api.post<Order>("/orders", payload),
    patch: (
      id: string,
      body: { tienVe?: boolean; donCRM?: boolean; billImage?: string | null },
      operatorRole = "sale",
      timeout?: number
    ) =>
      api.patch<Order>(`/orders/${id}`, body, {
        headers: { "X-Operator-Role": operatorRole },
        ...(timeout ? { timeout } : {}),
      }),
    cancel: (id: string) => api.post<Order>(`/orders/${id}/cancel`),
    uploadBill: (id: string, file: Blob, filename: string) => {
      const fd = new FormData();
      fd.append("file", file, filename);
      return api.post<{ billImage: string; order: Order }>(`/orders/${id}/bill`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 60000,
      });
    },
  },
  payos: {
    createLink: (data: { amount: number; infoCode: string; maDonHang: string }) =>
      api.post<{
        checkoutUrl: string;
        qrCode: string;
        orderCode: number;
        description: string;
        transferContent: string;
        paymentLinkId?: string;
      }>("/payos/create-link", data),
    transactions: (params?: {
      limit?: number;
      from?: string;
      to?: string;
      status?: string;
      q?: string;
    }) =>
      api.get<{
        transactions: {
          id: string;
          maGiaoDichBank: string;
          soTien: number;
          noiDung: string;
          thoiGian: string;
          infoCode: string;
          trangThaiDoiSoat: string;
          maDonHang?: string;
        }[];
      }>("/payos/transactions", { params }),
  },
  infoCode: {
    create: (payload: { customerName: string; uid: string; amount: number }) =>
      api.post("/info-code", payload),
    status: (code: string) => api.get(`/info-code/${code}/status`),
  },
  webhook: {
    recentEvents: () => api.get("/webhook/events?limit=50"),
  },
  crm: {
    activate: (infoCode: string) => api.post("/crm/activate", { infoCode }),
    searchCustomers: (q: string, limit = 20) =>
      api.get<{
        customers: { crmUid: string; hoTen: string; sdt: string; diaChi: string }[];
      }>("/crm/customers", { params: { q, limit } }),
  },
  invoice: {
    getM3Pending: () =>
      api.get<{ orders: InvoiceOrder[]; count: number }>("/invoice/m3-pending"),
    saveM3CrmId: (id: string, crmOrderId: string) =>
      api.post<InvoiceOrder>("/invoice/m3-save", { id, crmOrderId }),
    approveM3Order: (id: string, taxProductName: string, crmOrderId: string) =>
      api.post<InvoiceOrder>("/invoice/m3-approve", { id, taxProductName, crmOrderId }),
    updateM3Order: (id: string, data: { taxProductName: string; crmOrderId: string }) =>
      api.post<InvoiceOrder>("/invoice/m3-approve", { id, ...data }),
    approveBulk: () =>
      api.post<{ approved: number; ids: string[] }>("/invoice/m3-approve-bulk"),
    getM4Queue: () =>
      api.get<{ orders: InvoiceOrder[]; count: number }>("/invoice/m4-queue"),
    cancelM4Queue: (id: string) =>
      api.post<{ ok: boolean; id: string }>("/invoice/m4-cancel", { id }),
    exportBatch: () =>
      api.post<Blob>("/invoice/export-batch", {}, { responseType: "blob" }),
  },
  revenue: {
    listLedger: (params?: {
      from?: string;
      to?: string;
      loai_nhap?: string;
      team?: string;
      limit?: number;
      offset?: number;
    }) => api.get<RevenueLedgerListResponse>("/revenue/ledger", { params }),
    ledgerSummary: (params?: { from?: string; to?: string; loai_nhap?: string; team?: string }) =>
      api.get<LedgerSummaryResponse>("/revenue/ledger/summary", { params }),
    createLedger: (body: LedgerCreatePayload) =>
      api.post<RevenueLedgerRow>("/revenue/ledger", body),
    patchLedger: (id: string, body: LedgerPatchPayload) =>
      api.patch<RevenueLedgerRow>(`/revenue/ledger/${id}`, body),
    deleteLedger: (id: string) =>
      api.delete<{ ok: boolean; id: string }>(`/revenue/ledger/${id}`),
    pivot: (params?: { from?: string; to?: string; team?: string }) =>
      api.get<RevenuePivotResponse>("/revenue/pivot", { params }),
    pivotSalesPerformance: (params?: { from?: string; to?: string; team?: string }) =>
      api.get<RevenuePivotResponse>("/revenue/pivot/sales-performance", { params }),
    pivotKeyData: (params?: { from?: string; to?: string; team?: string }) =>
      api.get<RevenueKeyDataResponse>("/revenue/pivot/key-data", { params }),
    syncGsheet: (body?: { dryRun?: boolean; limit?: number }) =>
      api.post<GsheetSyncResponse>("/revenue/ledger/sync-gsheet", body ?? {}, {
        timeout: 900_000,
      }),
  },
  dashboard: {
    summary: (params?: {
      range_key?: string;
      start?: string;
      end?: string;
      team?: string;
      sale?: string;
      department?: string;
    }) => api.get<DashboardSummary>("/dashboard/summary", { params }),
    dailyTrends: (params: {
      start_date: string;
      end_date: string;
      team?: string;
      sale?: string;
      department?: string;
    }) => api.get<DashboardDailyTrends>("/dashboard/daily_trends", { params }),
    liveSummary: (params: {
      start_date: string;
      end_date: string;
      team?: string;
      sale?: string;
      department?: string;
    }) => api.get<DashboardLiveSummary>("/dashboard/live_summary", { params, timeout: 120_000 }),
    filters: () => api.get<{ teams: string[]; sales: string[]; departments: string[] }>("/dashboard/filters"),
  },
  crmData: {
    tokenStatus: () =>
      api.get<{ hasToken: boolean; updatedAt: string | null }>("/crm/token-status"),
    sync: (syncDate?: string) =>
      api.post<{
        ok: boolean;
        sync_date: string;
        rows_fetched: number;
        rows_upserted: number;
        sync_mode?: string;
        department_fallback?: boolean;
      }>("/crm/sync", { sync_date: syncDate ?? null }, { timeout: 120_000 }),
    syncBackfill: (startDate: string, endDate: string, concurrency = 5) =>
      api.post<{
        ok: boolean;
        period: { start: string; end: string };
        days_ok: number;
        days_failed: number;
        concurrency?: number;
        results: { date: string; rows_upserted: number; rows_fetched: number }[];
        failed: { date: string; error: string }[];
      }>("/crm/sync/backfill", {
        start_date: startDate,
        end_date: endDate,
        concurrency,
      }, { timeout: 600_000 }),
    exportMaster: (startDate: string, endDate: string) =>
      api.get<Blob>("/crm/export-master", {
        params: { start_date: startDate, end_date: endDate },
        responseType: "blob",
        timeout: 120_000,
      }),
  },
  reports: {
    bc03: (params?: {
      range_key?: string;
      start?: string;
      end?: string;
      team?: string;
      department?: string;
    }) => api.get<Bc03Report>("/reports/bc03", { params }),
    bc03Staff: () => api.get<{ sales: Bc03StaffOption[] }>("/reports/bc03/staff"),
    monthlyGet: (month: string) =>
      api.get<Bc03MonthlySettings>("/reports/bc03/monthly", { params: { month } }),
    monthlySave: (body: {
      month: string;
      exchange_rate: number;
      kpi_rows: { sale_name: string; b2_orders: number; b4_gmv_vnd: number }[];
    }) => api.put<Bc03MonthlySettings>("/reports/bc03/monthly", body),
  },
  me: {
    get: () => api.get("/me"),
    patch: (body: {
      displayName?: string;
      phone?: string;
      crmName?: string;
    }) => api.patch("/me", body),
  },
  admin: {
    sales: (params?: { team?: string; role?: string; q?: string }) =>
      api.get("/admin/sales", { params }),
    patchSale: (
      crmName: string,
      body: {
        email?: string;
        role?: string;
        team?: string;
        subTeam?: string;
        managerEmail?: string;
        leaderEmail?: string;
        isActive?: boolean;
        displayName?: string;
        phone?: string;
      }
    ) => api.patch(`/admin/sales/${encodeURIComponent(crmName)}`, body),
    syncSales: () => api.post("/admin/sales/sync"),
    authUsers: () => api.get("/admin/auth-users"),
    patchAuthUser: (
      userId: string,
      body: { banned?: boolean; role?: string; crmName?: string }
    ) => api.patch(`/admin/auth-users/${userId}`, body),
  },
};
