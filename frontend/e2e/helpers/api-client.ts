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

function tryGetAccessToken(): string | null {
  const authFile = path.resolve(__dirname, "../.auth/user.json");
  if (!fs.existsSync(authFile)) return null;
  const state = JSON.parse(fs.readFileSync(authFile, "utf-8"));
  // Supabase stores token in localStorage under sb-*-auth-token
  for (const entry of state.origins ?? []) {
    for (const item of entry.localStorage ?? []) {
      if (item.name?.includes("auth-token")) {
        try {
          const parsed = JSON.parse(item.value);
          if (parsed.access_token) return parsed.access_token;
        } catch {
          // malformed entry — skip
        }
      }
    }
  }
  return null;
}

function getAccessToken(): string {
  const token = tryGetAccessToken();
  if (token) return token;
  throw new Error(
    "No access token found in auth storage state — tests that call the real API " +
      "must run against a Supabase-backed environment (not dev-mode localhost). " +
      "Run auth-setup against the sandbox URL or set E2E_EMAIL/PASSWORD to a real account."
  );
}

export class E2eApiClient {
  private baseUrl: string;
  private token: string;

  /**
   * Returns true when a real Supabase JWT exists in the auth state file.
   * Use this to skip API-dependent tests in local dev-mode runs:
   *   test.skip(!E2eApiClient.isAvailable(), "Requires real Supabase auth (not dev mode)");
   */
  static isAvailable(): boolean {
    return tryGetAccessToken() !== null;
  }

  /**
   * @param baseUrl — override E2E_API_URL (vd. chạy spec trên sandbox Vercel mà
   *   `.env.e2e` vẫn trỏ localhost: truyền `process.env.E2E_API_URL_OVERRIDE`).
   */
  constructor(baseUrl?: string) {
    this.baseUrl = (baseUrl?.trim().replace(/\/$/, "") || "") || getApiBaseUrl();
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
    uid?: string;
    name: string;
    phone: string;
    country: string;
    address: string;
    target: number;
    lead_source?: string;
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

  async createPaymentLine(
    prId: string,
    data: { amount: number; method?: string }
  ): Promise<{ id: string; code: string; transferContent: string }> {
    const res = await this.request<{
      payment_line: { id: string; transfer_code: string; transfer_content: string };
    }>("POST", `/api/v1/payment-requests/${prId}/payment-lines`, {
      amount: data.amount,
      method: data.method ?? "qr",
    });
    return {
      id: res.payment_line.id,
      code: res.payment_line.transfer_code,
      transferContent: res.payment_line.transfer_content,
    };
  }

  /** Up ảnh bill cho 1 lần TT (BE chặn tạo AR khi line đã thu tiền mà chưa có bill). */
  async uploadBill(lineId: string, png: Uint8Array, filename = "e2e-bill.png"): Promise<void> {
    const fd = new FormData();
    fd.append("file", new Blob([png], { type: "image/png" }), filename);
    const res = await fetch(`${this.baseUrl}/api/v1/payment-lines/${lineId}/bill`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}` },
      body: fd,
    });
    if (!res.ok) {
      throw new Error(`API POST /api/v1/payment-lines/${lineId}/bill → ${res.status}: ${await res.text().catch(() => "")}`);
    }
  }

  /** Xác nhận tay 1 lần TT (cần quyền confirm — tài khoản E2E admin có). */
  async patchLineStatus(lineId: string, status: "paid" | "pending" | "rejected"): Promise<void> {
    await this.request("PATCH", `/api/v1/transactions/${lineId}/status`, { status });
  }

  // ── Active Requests ──
  /** Báo đơn (tạo AR) gắn PR — body giống FE `CreateActiveRequestPayload`. */
  async createActiveRequest(
    prId: string,
    body: {
      uids: { uid: string; phone?: string; country?: string; courses: { name: string; amount: number }[] }[];
      hold_activation?: boolean;
    }
  ): Promise<{ id: string }> {
    const res = await this.request<{ id: string }>(
      "POST",
      `/api/v1/payment-requests/${prId}/active-requests`,
      body
    );
    return { id: res.id };
  }

  /** Đọc AR thô từ server (verify persist sau khi Lưu). */
  async getActiveRequest(arId: string): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>("GET", `/api/v1/active-requests/${arId}`);
  }

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
  /** PR [E2E-TEST] kèm line (id + status) — để dọn PR đã nhận tiền: reject line rồi cancel. */
  async listTestPaymentRequestsRaw(): Promise<
    { id: string; name: string; state: string; payments: { id: string; status: string }[] }[]
  > {
    const res = await this.request<{ requests: Record<string, unknown>[] }>(
      "GET",
      "/api/v1/payment-requests?limit=200"
    );
    return (res.requests ?? [])
      .filter((r) => String(r.name ?? "").includes("[E2E-TEST]"))
      .map((r) => ({
        id: String(r.id),
        name: String(r.name),
        state: String(r.state ?? ""),
        payments: (Array.isArray(r.payments) ? (r.payments as Record<string, unknown>[]) : []).map((p) => ({
          id: String(p.id),
          status: String(p.status ?? ""),
        })),
      }));
  }

  /** Danh sách AR thô (id + pr_id) — tìm AR gắn PR test để xoá trước khi cancel PR. */
  async listActiveRequestsRaw(): Promise<{ id: string; pr_id: string | null }[]> {
    const rows = await this.request<Record<string, unknown>[]>("GET", "/api/v1/active-requests");
    return (Array.isArray(rows) ? rows : []).map((r) => ({
      id: String(r.id),
      pr_id: r.pr_id ? String(r.pr_id) : null,
    }));
  }

  async findTestPaymentRequests(): Promise<{ id: string; name: string; state: string }[]> {
    const res = await this.request<{
      requests: { id: string; name: string; state: string }[];
    }>("GET", "/api/v1/payment-requests");
    return res.requests.filter((r) => r.name.includes("[E2E-TEST]"));
  }

  async findTestLedgerEntries(): Promise<{ id: string; tenKhach: string }[]> {
    const res = await this.request<{
      rows: { id: string; tenKhach: string }[];
    }>("GET", "/revenue/ledger?limit=200");
    return res.rows.filter((r) => r.tenKhach?.includes("[E2E-TEST]"));
  }
}
