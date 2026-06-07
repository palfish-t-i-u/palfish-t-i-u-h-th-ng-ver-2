// frontend/e2e/helpers/api-client.ts
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { loadEnvE2e } from "./env";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getApiBaseUrl(): string {
  const env = loadEnvE2e();
  return env.E2E_API_URL || "http://localhost:8000";
}

function getAccessToken(): string {
  const authFile = path.resolve(__dirname, "../.auth/user.json");
  if (!fs.existsSync(authFile)) {
    throw new Error("Auth file not found — run auth-setup first");
  }
  const state = JSON.parse(fs.readFileSync(authFile, "utf-8"));
  // Supabase stores token in localStorage under sb-*-auth-token
  for (const entry of state.origins ?? []) {
    for (const item of entry.localStorage ?? []) {
      if (item.name?.includes("auth-token")) {
        const parsed = JSON.parse(item.value);
        return parsed.access_token;
      }
    }
  }
  throw new Error("No access token found in auth storage state");
}

export class E2eApiClient {
  private baseUrl: string;
  private token: string;

  constructor() {
    this.baseUrl = getApiBaseUrl();
    this.token = getAccessToken();
  }

  private async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`API ${method} ${path} → ${res.status}: ${text}`);
    }
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return (await res.json()) as T;
    }
    return undefined as T;
  }

  // ── Payment Requests ──
  async createPR(data: {
    uid: string;
    name: string;
    phone: string;
    country: string;
    address: string;
    target: number;
    note?: string;
    email?: string;
  }): Promise<{ id: string }> {
    const res = await this.request<{ payment_request: { id: string } }>(
      "POST",
      "/api/v1/payment-requests",
      data
    );
    return { id: res.payment_request.id };
  }

  async cancelPR(id: string): Promise<void> {
    await this.request("POST", `/api/v1/payment-requests/${id}/cancel`);
  }

  // ── Active Requests ──
  async deleteActiveRequest(arId: string): Promise<void> {
    await this.request("DELETE", `/api/v1/active-requests/${arId}`);
  }

  // ── Revenue Ledger ──
  async createLedgerEntry(data: {
    ngayTienVe: string;
    tenKhach: string;
    soTienVnd: number;
    team?: string;
    loai?: string;
    note?: string;
    paymentMethod?: string;
  }): Promise<{ id: string }> {
    const res = await this.request<{ id: string }>("POST", "/revenue/ledger", data);
    return { id: res.id };
  }

  async deleteLedgerEntry(id: string): Promise<void> {
    await this.request("DELETE", `/revenue/ledger/${id}`);
  }

  // ── Cleanup search ──
  async findTestPaymentRequests(): Promise<{ id: string; name: string; state: string }[]> {
    const res = await this.request<{
      requests: { id: string; name: string; state: string }[];
    }>("GET", "/api/v1/payment-requests");
    return res.requests.filter((r) => r.name.includes("[E2E-TEST]"));
  }

  async findTestLedgerEntries(): Promise<{ id: string; ten_khach: string }[]> {
    const res = await this.request<{
      rows: { id: string; ten_khach: string }[];
    }>("GET", "/revenue/ledger?limit=200");
    return res.rows.filter((r) => r.ten_khach?.includes("[E2E-TEST]"));
  }
}
