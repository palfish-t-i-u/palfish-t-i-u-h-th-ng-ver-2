import axios from "axios";
import { resolveApiBaseUrl } from "./apiBaseUrl";
import { supabase } from "./supabase";
import type { CreateOrderPayload, InvoiceOrder, Order } from "../types/order";
import type {
  LedgerCreatePayload,
  LedgerPatchPayload,
  RevenueLedgerRow,
  RevenuePivotResponse,
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
      api.post<{ checkoutUrl: string; qrCode: string; orderCode: number; description: string }>(
        "/payos/create-link",
        data
      ),
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
    listLedger: (params?: { from?: string; to?: string; loai_nhap?: string }) =>
      api.get<{ rows: RevenueLedgerRow[]; count: number }>("/revenue/ledger", { params }),
    createLedger: (body: LedgerCreatePayload) =>
      api.post<RevenueLedgerRow>("/revenue/ledger", body),
    patchLedger: (id: string, body: LedgerPatchPayload) =>
      api.patch<RevenueLedgerRow>(`/revenue/ledger/${id}`, body),
    pivot: (params?: { from?: string; to?: string; team?: string }) =>
      api.get<RevenuePivotResponse>("/revenue/pivot", { params }),
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
