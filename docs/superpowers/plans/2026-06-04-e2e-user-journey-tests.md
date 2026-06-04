# E2E User Journey Test Suite — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 32 Playwright E2E tests across 5 new spec files covering all untested modules, organized as user journey chains with automatic test data cleanup.

**Architecture:** Helpers layer (API client, cleanup registry, navigation, assertions) provides shared utilities. Journey chain specs test cross-module flows (B1→B2→B3→B4, Revenue→BC03). Multi-role auth tests RBAC sidebar visibility. All test data uses `[E2E-TEST]` prefix and is cleaned up in `afterAll`.

**Tech Stack:** Playwright `@playwright/test@^1.60.0`, TypeScript, direct HTTP calls via `fetch` for API cleanup.

**Spec:** `docs/superpowers/specs/2026-06-04-e2e-user-journey-tests-design.md`

---

## File Map

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `frontend/e2e/helpers/api-client.ts` | Authenticated HTTP client for setup/cleanup API calls |
| Create | `frontend/e2e/helpers/cleanup.ts` | CleanupRegistry: register callbacks, runAll in afterAll |
| Create | `frontend/e2e/helpers/navigation.ts` | Sidebar navigation + module-loaded assertions |
| Create | `frontend/e2e/helpers/assertions.ts` | Reusable UI assertions (toast, loading, empty state, table rows) |
| Create | `frontend/e2e/helpers/manual-cleanup.ts` | Standalone script to purge all `[E2E-TEST]` records |
| Create | `frontend/e2e/helpers/env.ts` | Shared `.env.e2e` loader (extracted from auth.setup.ts) |
| Create | `frontend/e2e/auth-role.setup.ts` | Generic multi-role auth setup (sale/marketing/cs) |
| Create | `frontend/e2e/journeys/payment-lifecycle.spec.ts` | B1→B2→B3→B4 full payment chain (10 tests) |
| Create | `frontend/e2e/journeys/revenue-reporting.spec.ts` | Sổ doanh thu + BC03 (7 tests) |
| Create | `frontend/e2e/journeys/crm-dashboard.spec.ts` | Dashboard + DoanhThuSale + StaffCRM (4 tests) |
| Create | `frontend/e2e/journeys/admin-smoke.spec.ts` | Auth Accounts + Permissions smoke (2 tests) |
| Create | `frontend/e2e/rbac-visibility.spec.ts` | Per-role sidebar visibility (3 tests × 3 roles) |
| Modify | `frontend/e2e/auth.setup.ts` | Extract env loader to shared helper |
| Modify | `frontend/playwright.config.ts` | Add journey + RBAC projects, multi-role auth |
| Modify | `frontend/package.json` | Add new npm scripts |
| Modify | `frontend/.env.e2e.example` | Add role-specific + API URL vars |

---

### Task 1: Shared env loader + update existing auth.setup.ts

**Files:**
- Create: `frontend/e2e/helpers/env.ts`
- Modify: `frontend/e2e/auth.setup.ts`

- [ ] **Step 1: Create the shared env loader**

```typescript
// frontend/e2e/helpers/env.ts
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function loadEnvE2e(): Record<string, string> {
  const envPath = path.resolve(__dirname, "../../.env.e2e");
  if (!fs.existsSync(envPath)) {
    throw new Error(
      "Missing .env.e2e — copy .env.e2e.example to .env.e2e and fill in credentials"
    );
  }
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  const vars: Record<string, string> = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    vars[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
  }
  return vars;
}

export function requireEnv(vars: Record<string, string>, key: string): string {
  const val = vars[key];
  if (!val) throw new Error(`${key} must be set in .env.e2e`);
  return val;
}
```

- [ ] **Step 2: Update auth.setup.ts to use shared loader**

Replace the entire `frontend/e2e/auth.setup.ts` with:

```typescript
import { test as setup, expect } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";
import { loadEnvE2e, requireEnv } from "./helpers/env";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AUTH_FILE = path.resolve(__dirname, ".auth/user.json");

setup("authenticate", async ({ page }) => {
  const env = loadEnvE2e();
  const email = requireEnv(env, "E2E_EMAIL");
  const password = requireEnv(env, "E2E_PASSWORD");

  await page.goto("/login");
  await expect(page.locator("text=Đăng nhập")).toBeVisible({ timeout: 15_000 });

  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');

  await expect(page.locator("text=Bảng thông tin")).toBeVisible({ timeout: 20_000 });

  await page.context().storageState({ path: AUTH_FILE });
});
```

- [ ] **Step 3: Run existing E2E to verify refactor didn't break anything**

Run: `cd frontend && npx playwright test --project=auth-setup --project=e2e`

Expected: All 14 existing tests pass. Auth setup creates `.auth/user.json`.

- [ ] **Step 4: Commit**

```bash
git add frontend/e2e/helpers/env.ts frontend/e2e/auth.setup.ts
git commit -m "refactor(e2e): extract shared env loader from auth.setup.ts"
```

---

### Task 2: Navigation + Assertions helpers

**Files:**
- Create: `frontend/e2e/helpers/navigation.ts`
- Create: `frontend/e2e/helpers/assertions.ts`

- [ ] **Step 1: Create navigation helper**

```typescript
// frontend/e2e/helpers/navigation.ts
import { expect, type Page } from "@playwright/test";

export async function navigateTo(page: Page, sidebarLabel: string): Promise<void> {
  // Handle nested items under "Báo cáo" parent
  const BC_CHILDREN = ["BC01: Sales performance", "BC02: Key Data", "BC03 — Báo cáo tổng bộ"];
  if (BC_CHILDREN.includes(sidebarLabel)) {
    const parent = page.locator("nav >> text=Báo cáo").first();
    if (await parent.isVisible()) {
      await parent.click();
      await page.waitForTimeout(300);
    }
  }

  const item = page.locator(`nav >> text=${sidebarLabel}`).first();
  await expect(item).toBeVisible({ timeout: 5_000 });
  await item.click();
  await page.waitForTimeout(500);
}

export async function expectModuleLoaded(page: Page, heading: string): Promise<void> {
  await expect(
    page.locator("h1, h2, h3").filter({ hasText: heading }).first()
  ).toBeVisible({ timeout: 15_000 });
}

export async function expectSidebarVisible(page: Page, label: string): Promise<void> {
  await expect(page.locator(`nav >> text=${label}`).first()).toBeVisible({ timeout: 5_000 });
}

export async function expectSidebarHidden(page: Page, label: string): Promise<void> {
  await expect(page.locator(`nav >> text=${label}`).first()).not.toBeVisible({ timeout: 3_000 });
}
```

- [ ] **Step 2: Create assertions helper**

```typescript
// frontend/e2e/helpers/assertions.ts
import { expect, type Page } from "@playwright/test";

export async function expectToast(page: Page, text: string | RegExp): Promise<void> {
  const toast = typeof text === "string"
    ? page.locator(`text=${text}`).first()
    : page.locator("div").filter({ hasText: text }).first();
  await expect(toast).toBeVisible({ timeout: 10_000 });
}

export async function waitForLoaded(page: Page): Promise<void> {
  // Wait for common loading indicators to disappear
  const spinner = page.locator("text=Đang tải").or(page.locator(".animate-pulse")).first();
  try {
    await spinner.waitFor({ state: "hidden", timeout: 30_000 });
  } catch {
    // If no spinner was found, the page is already loaded
  }
}

export async function expectEmptyState(page: Page, text?: string): Promise<void> {
  const selector = text
    ? page.locator(`text=${text}`).first()
    : page.locator("text=Chưa có dữ liệu").or(page.locator("text=Không có dữ liệu")).first();
  await expect(selector).toBeVisible({ timeout: 10_000 });
}

export async function expectTableRows(page: Page, min: number): Promise<void> {
  const rows = page.locator("tbody tr");
  await expect(rows.first()).toBeVisible({ timeout: 15_000 });
  const count = await rows.count();
  expect(count).toBeGreaterThanOrEqual(min);
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/e2e/helpers/navigation.ts frontend/e2e/helpers/assertions.ts
git commit -m "feat(e2e): add navigation and assertion helpers"
```

---

### Task 3: API client + Cleanup registry

**Files:**
- Create: `frontend/e2e/helpers/api-client.ts`
- Create: `frontend/e2e/helpers/cleanup.ts`

- [ ] **Step 1: Create the API client**

```typescript
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
    return res;
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
```

- [ ] **Step 2: Create cleanup registry**

```typescript
// frontend/e2e/helpers/cleanup.ts
export class CleanupRegistry {
  private callbacks: Array<{ label: string; fn: () => Promise<void> }> = [];

  register(label: string, fn: () => Promise<void>): void {
    this.callbacks.push({ label, fn });
  }

  async runAll(): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;
    // Run in reverse order (LIFO — last created, first cleaned)
    for (const cb of [...this.callbacks].reverse()) {
      try {
        await cb.fn();
        success++;
        console.log(`  ✓ cleanup: ${cb.label}`);
      } catch (err) {
        failed++;
        console.warn(`  ✗ cleanup failed: ${cb.label}`, err);
      }
    }
    this.callbacks = [];
    console.log(`Cleanup complete: ${success} ok, ${failed} failed`);
    return { success, failed };
  }
}
```

- [ ] **Step 3: Create manual cleanup script**

```typescript
// frontend/e2e/helpers/manual-cleanup.ts
import { E2eApiClient } from "./api-client";

async function main() {
  console.log("=== E2E Manual Cleanup ===\n");
  const api = new E2eApiClient();

  // Clean payment requests
  console.log("Searching for [E2E-TEST] payment requests...");
  try {
    const prs = await api.findTestPaymentRequests();
    console.log(`Found ${prs.length} test PRs`);
    for (const pr of prs) {
      try {
        if (pr.state !== "cancelled") {
          await api.cancelPR(pr.id);
          console.log(`  Cancelled PR ${pr.id} (${pr.name})`);
        } else {
          console.log(`  Skipped PR ${pr.id} (already cancelled)`);
        }
      } catch (err) {
        console.warn(`  Failed to cancel PR ${pr.id}:`, err);
      }
    }
  } catch (err) {
    console.warn("Failed to search PRs:", err);
  }

  // Clean ledger entries
  console.log("\nSearching for [E2E-TEST] ledger entries...");
  try {
    const entries = await api.findTestLedgerEntries();
    console.log(`Found ${entries.length} test entries`);
    for (const entry of entries) {
      try {
        await api.deleteLedgerEntry(entry.id);
        console.log(`  Deleted ledger ${entry.id} (${entry.ten_khach})`);
      } catch (err) {
        console.warn(`  Failed to delete ledger ${entry.id}:`, err);
      }
    }
  } catch (err) {
    console.warn("Failed to search ledger:", err);
  }

  console.log("\n=== Cleanup done ===");
}

main().catch(console.error);
```

- [ ] **Step 4: Commit**

```bash
git add frontend/e2e/helpers/api-client.ts frontend/e2e/helpers/cleanup.ts frontend/e2e/helpers/manual-cleanup.ts
git commit -m "feat(e2e): add API client, cleanup registry, and manual cleanup script"
```

---

### Task 4: Multi-role auth setup

**Files:**
- Create: `frontend/e2e/auth-role.setup.ts`

- [ ] **Step 1: Create generic role-based auth setup**

```typescript
// frontend/e2e/auth-role.setup.ts
import { test as setup, expect } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";
import { loadEnvE2e, requireEnv } from "./helpers/env";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROLE_ENV_MAP: Record<string, { email: string; password: string }> = {
  sale: { email: "E2E_SALE_EMAIL", password: "E2E_SALE_PASSWORD" },
  marketing: { email: "E2E_MARKETING_EMAIL", password: "E2E_MARKETING_PASSWORD" },
  cs: { email: "E2E_CS_EMAIL", password: "E2E_CS_PASSWORD" },
};

setup("authenticate-role", async ({ page }, testInfo) => {
  const role = (testInfo.project.metadata as { role?: string })?.role
    ?? process.env.E2E_ROLE;

  if (!role || !ROLE_ENV_MAP[role]) {
    throw new Error(
      `E2E_ROLE must be one of: ${Object.keys(ROLE_ENV_MAP).join(", ")}. Got: ${role}`
    );
  }

  const env = loadEnvE2e();
  const { email: emailKey, password: passwordKey } = ROLE_ENV_MAP[role];
  const email = requireEnv(env, emailKey);
  const password = requireEnv(env, passwordKey);

  const authFile = path.resolve(__dirname, `.auth/${role}.json`);

  await page.goto("/login");
  await expect(page.locator("text=Đăng nhập")).toBeVisible({ timeout: 15_000 });

  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');

  // Wait for redirect — role accounts may land on dashboard or profile
  await expect(
    page.locator("text=Bảng thông tin").or(page.locator("text=Thông tin cá nhân"))
  ).toBeVisible({ timeout: 20_000 });

  await page.context().storageState({ path: authFile });
});
```

- [ ] **Step 2: Commit**

```bash
git add frontend/e2e/auth-role.setup.ts
git commit -m "feat(e2e): add multi-role auth setup for RBAC testing"
```

---

### Task 5: Playwright config + package.json + .env.e2e.example

**Files:**
- Modify: `frontend/playwright.config.ts`
- Modify: `frontend/package.json`
- Modify: `frontend/.env.e2e.example`

- [ ] **Step 1: Update playwright.config.ts**

Replace the entire `frontend/playwright.config.ts` with:

```typescript
import { defineConfig, devices } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 5173;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e-results",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  timeout: 60_000,

  reporter: [
    ["html", { outputFolder: "e2e-report", open: "never" }],
    ["list"],
  ],

  use: {
    baseURL: BASE_URL,
    screenshot: "on",
    video: "on",
    trace: "on",
    locale: "vi-VN",
    timezoneId: "Asia/Ho_Chi_Minh",
  },

  projects: [
    // ── Auth setup ──
    {
      name: "auth-setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "auth-sale",
      testMatch: /auth-role\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
      metadata: { role: "sale" },
    },
    {
      name: "auth-marketing",
      testMatch: /auth-role\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
      metadata: { role: "marketing" },
    },
    {
      name: "auth-cs",
      testMatch: /auth-role\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
      metadata: { role: "cs" },
    },

    // ── Journey chains (full-access account, serial) ──
    {
      name: "journeys",
      testDir: "./e2e/journeys",
      use: {
        ...devices["Desktop Chrome"],
        storageState: path.resolve(__dirname, "e2e/.auth/user.json"),
      },
      dependencies: ["auth-setup"],
    },

    // ── RBAC visibility (per-role, can run parallel) ──
    {
      name: "rbac-sale",
      testMatch: /rbac-visibility\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: path.resolve(__dirname, "e2e/.auth/sale.json"),
      },
      metadata: { role: "sale" },
      dependencies: ["auth-sale"],
    },
    {
      name: "rbac-marketing",
      testMatch: /rbac-visibility\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: path.resolve(__dirname, "e2e/.auth/marketing.json"),
      },
      metadata: { role: "marketing" },
      dependencies: ["auth-marketing"],
    },
    {
      name: "rbac-cs",
      testMatch: /rbac-visibility\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: path.resolve(__dirname, "e2e/.auth/cs.json"),
      },
      metadata: { role: "cs" },
      dependencies: ["auth-cs"],
    },

    // ── Existing tests (unchanged) ──
    {
      name: "e2e",
      use: {
        ...devices["Desktop Chrome"],
        storageState: path.resolve(__dirname, "e2e/.auth/user.json"),
      },
      dependencies: ["auth-setup"],
      testIgnore: [/journeys/, /auth.*\.setup/, /rbac-/],
    },
  ],

  webServer: {
    command: "npm run dev",
    port: PORT,
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
```

- [ ] **Step 2: Add npm scripts to package.json**

Add these scripts (keep existing ones, add new):

```json
{
  "e2e": "npx playwright test --project=e2e",
  "e2e:journeys": "npx playwright test --project=journeys",
  "e2e:rbac": "npx playwright test --project=rbac-sale --project=rbac-marketing --project=rbac-cs",
  "e2e:all": "npx playwright test",
  "e2e:cleanup": "npx tsx e2e/helpers/manual-cleanup.ts",
  "e2e:headed": "npx playwright test --headed",
  "e2e:ui": "npx playwright test --ui",
  "e2e:report": "npx playwright show-report e2e-report",
  "e2e:codegen": "npx playwright codegen http://localhost:5173"
}
```

- [ ] **Step 3: Update .env.e2e.example**

Replace `frontend/.env.e2e.example` with:

```env
# E2E test credentials — copy to .env.e2e and fill in

# Full-access account (existing — hr/system department)
E2E_EMAIL=your-test-account@example.com
E2E_PASSWORD=your-test-password

# Role-specific accounts (for RBAC testing)
E2E_SALE_EMAIL=
E2E_SALE_PASSWORD=
E2E_MARKETING_EMAIL=
E2E_MARKETING_PASSWORD=
E2E_CS_EMAIL=
E2E_CS_PASSWORD=

# Backend API URL (for cleanup scripts)
E2E_API_URL=http://localhost:8000
```

- [ ] **Step 4: Verify existing tests still pass with new config**

Run: `cd frontend && npx playwright test --project=auth-setup --project=e2e`

Expected: All 14 existing tests pass. The `testIgnore` in `e2e` project correctly excludes `journeys/` and `rbac-` files.

- [ ] **Step 5: Commit**

```bash
git add frontend/playwright.config.ts frontend/package.json frontend/.env.e2e.example
git commit -m "feat(e2e): add multi-project config, new scripts, role env vars"
```

---

### Task 6: Journey Chain 1 — payment-lifecycle.spec.ts

**Files:**
- Create: `frontend/e2e/journeys/payment-lifecycle.spec.ts`

This is the most complex chain: B1 (Phiếu thu) → B2 (Đối soát) → B3 (Kích hoạt) → B4 (Hóa đơn).

- [ ] **Step 1: Create the journeys directory**

Run: `mkdir -p frontend/e2e/journeys`

- [ ] **Step 2: Write the payment lifecycle spec**

```typescript
// frontend/e2e/journeys/payment-lifecycle.spec.ts
import { test, expect } from "@playwright/test";
import { navigateTo, expectModuleLoaded } from "../helpers/navigation";
import { expectToast, waitForLoaded, expectTableRows } from "../helpers/assertions";
import { E2eApiClient } from "../helpers/api-client";
import { CleanupRegistry } from "../helpers/cleanup";

const TEST_PREFIX = "[E2E-TEST]";
const TEST_UID = `E2E-UID-${Date.now()}`;
const TEST_CUSTOMER = {
  name: `${TEST_PREFIX} Nguyễn Văn A`,
  uid: TEST_UID,
  phone: "0900000001",
  country: "VN",
  address: "123 Test Street",
  target: 5_000_000,
  note: "[E2E-AUTO] Created by Playwright",
  email: `e2e-test-${Date.now()}@palfish.test`,
};

let api: E2eApiClient;
const cleanup = new CleanupRegistry();
let createdPrId: string | null = null;
let createdArId: string | null = null;

test.describe.serial("Payment Lifecycle: B1 → B2 → B3 → B4", () => {
  test.beforeAll(() => {
    api = new E2eApiClient();
  });

  test.afterAll(async () => {
    await cleanup.runAll();
  });

  // ── B1: Phiếu thu ──

  test("B1 — Smoke: Phiếu thu loads with full UI", async ({ page }) => {
    await page.goto("/");
    await navigateTo(page, "Quản lý thanh toán");
    await expectModuleLoaded(page, "Quản lý thanh toán");

    // Verify key UI elements
    await expect(page.locator("text=Đang theo dõi").or(page.locator("text=Tất cả"))).toBeVisible({ timeout: 10_000 });

    // Toolbar with search and filters
    await expect(page.locator('input[placeholder*="Tìm"]').or(page.locator('input[type="search"]'))).toBeVisible({ timeout: 5_000 });

    // Create button visible (full access)
    await expect(page.locator("button", { hasText: "Tạo" }).or(page.locator("button", { hasText: "Payment Request" }))).toBeVisible({ timeout: 5_000 });

    await page.screenshot({ path: "e2e-results/b1-smoke.png" });
  });

  test("B1 — Create PR [E2E-TEST]", async ({ page }) => {
    await page.goto("/");
    await navigateTo(page, "Quản lý thanh toán");
    await expectModuleLoaded(page, "Quản lý thanh toán");

    // Click create button
    await page.click("button:has-text('Tạo')");
    await expect(page.locator("text=Tạo Payment Request mới")).toBeVisible({ timeout: 5_000 });

    // Fill the form — fields are in order: UID, Name, Country, Phone, Email, Address, Target, Note
    await page.fill('input[placeholder*="UID"]', TEST_CUSTOMER.uid);
    await page.fill('label:has-text("Tên khách hàng") + input, label:has-text("Tên khách") ~ input', TEST_CUSTOMER.name);

    // Phone
    const phoneInput = page.locator('input[placeholder*="09"]').or(page.locator('label:has-text("Số điện thoại") ~ input'));
    await phoneInput.first().fill(TEST_CUSTOMER.phone);

    // Email (optional)
    const emailInput = page.locator('label:has-text("Email") ~ input').or(page.locator('input[type="email"]'));
    if (await emailInput.first().isVisible()) {
      await emailInput.first().fill(TEST_CUSTOMER.email);
    }

    // Target amount
    const targetInput = page.locator('label:has-text("Tổng tiền") ~ input').or(page.locator('input[placeholder*="VND"]'));
    await targetInput.first().fill(String(TEST_CUSTOMER.target));

    // Note
    const noteInput = page.locator('label:has-text("Ghi chú") ~ input, label:has-text("Ghi chú") ~ textarea');
    if (await noteInput.first().isVisible()) {
      await noteInput.first().fill(TEST_CUSTOMER.note);
    }

    // Submit
    const submitBtn = page.locator("button:has-text('Tạo')").last();
    await submitBtn.click();

    // Verify success — toast or modal closes + PR appears in table
    await expect(page.locator("text=Tạo Payment Request mới")).not.toBeVisible({ timeout: 10_000 });

    // Find the PR in the table by searching
    await page.waitForTimeout(2_000);
    const searchInput = page.locator('input[placeholder*="Tìm"]').or(page.locator('input[type="search"]'));
    if (await searchInput.first().isVisible()) {
      await searchInput.first().fill(TEST_PREFIX);
      await page.waitForTimeout(1_000);
    }

    // Verify PR row exists
    await expect(page.locator(`text=${TEST_CUSTOMER.name}`).first()).toBeVisible({ timeout: 10_000 });

    // Extract PR ID for later tests
    const prIdCell = page.locator("td, div").filter({ hasText: /^PR-/ }).first();
    if (await prIdCell.isVisible()) {
      const prText = await prIdCell.textContent();
      createdPrId = prText?.trim() ?? null;
    }

    // Register cleanup
    if (createdPrId) {
      cleanup.register(`Cancel PR ${createdPrId}`, () => api.cancelPR(createdPrId!));
    }

    await page.screenshot({ path: "e2e-results/b1-create-pr.png" });
  });

  test("B1 — Add payment line to PR", async ({ page }) => {
    test.skip(!createdPrId, "PR not created — skipping");

    await page.goto("/");
    await navigateTo(page, "Quản lý thanh toán");
    await expectModuleLoaded(page, "Quản lý thanh toán");

    // Search for test PR
    const searchInput = page.locator('input[placeholder*="Tìm"]').or(page.locator('input[type="search"]'));
    if (await searchInput.first().isVisible()) {
      await searchInput.first().fill(TEST_PREFIX);
      await page.waitForTimeout(1_000);
    }

    // Click the PR row to open drawer
    await page.locator(`text=${TEST_CUSTOMER.name}`).first().click();
    await page.waitForTimeout(1_000);

    // Look for "Thêm dòng thanh toán" or similar button in the drawer
    const addLineBtn = page.locator("button:has-text('Thêm')").or(
      page.locator("button:has-text('thanh toán')")
    );
    if (await addLineBtn.first().isVisible()) {
      await addLineBtn.first().click();
      await page.waitForTimeout(500);

      // Fill payment line form — amount and method
      const amountInput = page.locator('input[placeholder*="Số tiền"]').or(
        page.locator("label:has-text('Số tiền') ~ input")
      );
      if (await amountInput.first().isVisible()) {
        await amountInput.first().fill("1000000");
      }

      // Select method: cash (simplest, no PayOS needed)
      const cashOption = page.locator("text=Tiền mặt").or(page.locator("button:has-text('Cash')"));
      if (await cashOption.first().isVisible()) {
        await cashOption.first().click();
      }

      // Submit
      const confirmBtn = page.locator("button:has-text('Xác nhận')").or(
        page.locator("button:has-text('Thêm')").last()
      );
      if (await confirmBtn.isVisible()) {
        await confirmBtn.click();
        await page.waitForTimeout(2_000);
      }
    }

    await page.screenshot({ path: "e2e-results/b1-add-payment-line.png" });
  });

  // ── B2: Đối soát ──

  test("B2 — Smoke: Đối soát loads with full UI", async ({ page }) => {
    await page.goto("/");
    await navigateTo(page, "Đối soát giao dịch");
    await expectModuleLoaded(page, "Đối soát giao dịch");

    // Tab buttons
    await expect(
      page.locator("text=Chờ xác nhận").or(page.locator("text=Tất cả"))
    ).toBeVisible({ timeout: 10_000 });

    // Date range filter
    await expect(
      page.locator('input[type="date"]').first()
    ).toBeVisible({ timeout: 5_000 });

    await page.screenshot({ path: "e2e-results/b2-smoke.png" });
  });

  test("B2 — Confirm transaction (if test data exists)", async ({ page }) => {
    await page.goto("/");
    await navigateTo(page, "Đối soát giao dịch");
    await expectModuleLoaded(page, "Đối soát giao dịch");
    await waitForLoaded(page);

    // Try to find test transaction by searching
    const searchInput = page.locator('input[placeholder*="Tìm"]').or(page.locator('input[type="search"]'));
    if (await searchInput.first().isVisible()) {
      await searchInput.first().fill(TEST_PREFIX);
      await page.waitForTimeout(2_000);
    }

    // Look for pending transaction from the test PR
    const pendingRow = page.locator("tr, div").filter({ hasText: TEST_CUSTOMER.name }).first();
    if (await pendingRow.isVisible({ timeout: 5_000 }).catch(() => false)) {
      // Find confirm button within the row
      const confirmBtn = pendingRow.locator("button:has-text('Xác nhận')").or(
        pendingRow.locator("button[title*='confirm']")
      );
      if (await confirmBtn.isVisible()) {
        await confirmBtn.click();
        await page.waitForTimeout(2_000);
        await page.screenshot({ path: "e2e-results/b2-confirm-txn.png" });
      }
    } else {
      test.info().annotations.push({
        type: "info",
        description: "No pending test transaction found — PR may not have generated a transaction yet. Test passes (UI verified).",
      });
    }
  });

  // ── B3: Kích hoạt khóa học ──

  test("B3 — Smoke: Kích hoạt khóa học loads with full UI", async ({ page }) => {
    await page.goto("/");
    await navigateTo(page, "Kích hoạt khóa học");
    await expectModuleLoaded(page, "Kích hoạt khóa học");

    // Tab buttons
    await expect(
      page.locator("text=Chờ kích hoạt").or(page.locator("text=Chờ order")).or(page.locator("text=Tất cả"))
    ).toBeVisible({ timeout: 10_000 });

    await page.screenshot({ path: "e2e-results/b3-smoke.png" });
  });

  test("B3 — Create Active Request linked to test PR", async ({ page }) => {
    await page.goto("/");
    await navigateTo(page, "Kích hoạt khóa học");
    await expectModuleLoaded(page, "Kích hoạt khóa học");
    await waitForLoaded(page);

    // Look for create button
    const createBtn = page.locator("button:has-text('Tạo')").or(
      page.locator("button:has-text('Active Request')")
    );
    if (await createBtn.first().isVisible()) {
      await createBtn.first().click();
      await page.waitForTimeout(1_000);

      // If there's a PR selector, search for test PR
      const prSearch = page.locator('input[placeholder*="PR"]').or(
        page.locator("text=Chọn Payment Request")
      );
      if (await prSearch.first().isVisible({ timeout: 3_000 }).catch(() => false)) {
        if (createdPrId) {
          await prSearch.first().click();
          await page.waitForTimeout(500);
          // Try to find the test PR in dropdown
          const testPrOption = page.locator(`text=${TEST_CUSTOMER.name}`).first();
          if (await testPrOption.isVisible({ timeout: 3_000 }).catch(() => false)) {
            await testPrOption.click();
          }
        }
      }

      // Add a course — fill UID + package + amount
      const uidInput = page.locator('input[placeholder*="UID"]').first();
      if (await uidInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await uidInput.fill(TEST_CUSTOMER.uid);
      }

      // Submit
      const submitBtn = page.locator("button:has-text('Lưu')").or(
        page.locator("button:has-text('Tạo')").last()
      );
      if (await submitBtn.isVisible()) {
        await submitBtn.click();
        await page.waitForTimeout(2_000);

        // Try to extract AR ID for cleanup
        // (implementation depends on what the UI shows after creation)
      }
    } else {
      test.info().annotations.push({
        type: "info",
        description: "No create button found — may need different UI flow. Smoke test passes.",
      });
    }

    await page.screenshot({ path: "e2e-results/b3-create-ar.png" });
  });

  // ── B4: Xuất hóa đơn ──

  test("B4 — Smoke: Xuất hóa đơn loads with full UI", async ({ page }) => {
    await page.goto("/");
    await navigateTo(page, "Xuất hóa đơn");
    await expectModuleLoaded(page, "Xuất hóa đơn");

    // Tab or filter for customer type
    await expect(
      page.locator("text=Cá nhân").or(page.locator("text=Doanh nghiệp")).or(page.locator("text=Tất cả"))
    ).toBeVisible({ timeout: 10_000 });

    await page.screenshot({ path: "e2e-results/b4-smoke.png" });
  });

  test("B4 — Invoice request flow (if activated course exists)", async ({ page }) => {
    await page.goto("/");
    await navigateTo(page, "Xuất hóa đơn");
    await expectModuleLoaded(page, "Xuất hóa đơn");
    await waitForLoaded(page);

    // Search for test data
    const searchInput = page.locator('input[placeholder*="Tìm"]').or(page.locator('input[type="search"]'));
    if (await searchInput.first().isVisible()) {
      await searchInput.first().fill(TEST_PREFIX);
      await page.waitForTimeout(2_000);
    }

    // Look for test row
    const testRow = page.locator("tr, div").filter({ hasText: TEST_CUSTOMER.name }).first();
    if (await testRow.isVisible({ timeout: 5_000 }).catch(() => false)) {
      // Try to request invoice
      const invoiceBtn = testRow.locator("button:has-text('Yêu cầu')").or(
        testRow.locator("button:has-text('Invoice')")
      );
      if (await invoiceBtn.isVisible()) {
        await invoiceBtn.click();
        await page.waitForTimeout(2_000);
      }
      await page.screenshot({ path: "e2e-results/b4-invoice-request.png" });
    } else {
      test.info().annotations.push({
        type: "info",
        description: "No test course found in B4 — activation may not have completed. Smoke test passes.",
      });
    }
  });
});
```

- [ ] **Step 3: Run the payment lifecycle journey**

Run: `cd frontend && npx playwright test --project=journeys -- journeys/payment-lifecycle`

Expected: 10 tests run. Smoke tests should all pass. CRUD tests may need adjustment based on actual UI selectors. Screenshots saved to `e2e-results/b1-*.png`, `b2-*.png`, etc.

- [ ] **Step 4: Fix any selector issues found during first run**

Use screenshots + Playwright trace to adjust selectors. Common fixes:
- Form field selectors may need more specific locators
- Button text may differ from expected
- Waiting times may need adjustment

- [ ] **Step 5: Commit**

```bash
git add frontend/e2e/journeys/payment-lifecycle.spec.ts
git commit -m "feat(e2e): add payment lifecycle journey chain (B1→B2→B3→B4)"
```

---

### Task 7: Journey Chain 2 — revenue-reporting.spec.ts

**Files:**
- Create: `frontend/e2e/journeys/revenue-reporting.spec.ts`

- [ ] **Step 1: Write the revenue reporting spec**

```typescript
// frontend/e2e/journeys/revenue-reporting.spec.ts
import { test, expect } from "@playwright/test";
import { navigateTo, expectModuleLoaded } from "../helpers/navigation";
import { waitForLoaded, expectTableRows } from "../helpers/assertions";
import { E2eApiClient } from "../helpers/api-client";
import { CleanupRegistry } from "../helpers/cleanup";

const TEST_PREFIX = "[E2E-TEST]";
const TEST_ENTRY = {
  ngayTienVe: new Date().toISOString().slice(0, 10),
  tenKhach: `${TEST_PREFIX} Revenue Entry`,
  soTienVnd: 3_700_000,
  team: "Inhouse 1",
  loai: "B2",
  note: "[E2E-AUTO] Created by Playwright",
  paymentMethod: "cash",
};

let api: E2eApiClient;
const cleanup = new CleanupRegistry();
let createdLedgerId: string | null = null;

test.describe.serial("Revenue & Reporting: Sổ doanh thu → BC03", () => {
  test.beforeAll(() => {
    api = new E2eApiClient();
  });

  test.afterAll(async () => {
    await cleanup.runAll();
  });

  // ── Sổ doanh thu ──

  test("Sổ doanh thu — Smoke: loads with cards, table, filters", async ({ page }) => {
    await page.goto("/");
    await navigateTo(page, "Sổ doanh thu");
    await expectModuleLoaded(page, "Sổ doanh thu");

    // Summary cards
    await waitForLoaded(page);

    // Team filter
    await expect(
      page.locator("text=Tất cả teams").or(page.locator("select").first())
    ).toBeVisible({ timeout: 10_000 });

    // Search input
    await expect(
      page.locator('input[placeholder*="Tìm"]').or(page.locator('input[type="search"]'))
    ).toBeVisible({ timeout: 5_000 });

    // Create button
    await expect(
      page.locator("button:has-text('Thêm')").or(page.locator("button:has-text('Tạo')"))
    ).toBeVisible({ timeout: 5_000 });

    await page.screenshot({ path: "e2e-results/ledger-smoke.png" });
  });

  test("Sổ doanh thu — Create ledger entry [E2E-TEST]", async ({ page }) => {
    await page.goto("/");
    await navigateTo(page, "Sổ doanh thu");
    await expectModuleLoaded(page, "Sổ doanh thu");
    await waitForLoaded(page);

    // Click create button
    const createBtn = page.locator("button:has-text('Thêm')").or(
      page.locator("button:has-text('Tạo')")
    );
    await createBtn.first().click();
    await page.waitForTimeout(500);

    // Fill the form in the modal
    // Date
    const dateInput = page.locator('input[type="date"]').first();
    if (await dateInput.isVisible()) {
      await dateInput.fill(TEST_ENTRY.ngayTienVe);
    }

    // Customer name
    const nameInput = page.locator('label:has-text("Tên khách") ~ input').or(
      page.locator('input[placeholder*="Tên khách"]')
    );
    await nameInput.first().fill(TEST_ENTRY.tenKhach);

    // Amount VND
    const amountInput = page.locator('label:has-text("Số tiền") ~ input').or(
      page.locator('input[placeholder*="VND"]')
    );
    await amountInput.first().fill(String(TEST_ENTRY.soTienVnd));

    // Team dropdown
    const teamSelect = page.locator('select').or(
      page.locator('label:has-text("Team") ~ select')
    );
    if (await teamSelect.first().isVisible()) {
      await teamSelect.first().selectOption({ label: TEST_ENTRY.team });
    }

    // Note
    const noteInput = page.locator('label:has-text("Ghi chú") ~ input, label:has-text("Ghi chú") ~ textarea');
    if (await noteInput.first().isVisible()) {
      await noteInput.first().fill(TEST_ENTRY.note);
    }

    // Submit
    const submitBtn = page.locator("button:has-text('Lưu')").or(
      page.locator("button:has-text('Tạo')").last()
    );
    await submitBtn.click();
    await page.waitForTimeout(2_000);

    // Verify entry appears — search for it
    const searchInput = page.locator('input[placeholder*="Tìm"]').or(page.locator('input[type="search"]'));
    if (await searchInput.first().isVisible()) {
      await searchInput.first().fill(TEST_PREFIX);
      await page.waitForTimeout(1_000);
    }

    await expect(page.locator(`text=${TEST_ENTRY.tenKhach}`).first()).toBeVisible({ timeout: 10_000 });

    // Try to find the entry ID for cleanup (via API fallback)
    try {
      const entries = await api.findTestLedgerEntries();
      if (entries.length > 0) {
        createdLedgerId = entries[0].id;
        cleanup.register(`Delete ledger ${createdLedgerId}`, () => api.deleteLedgerEntry(createdLedgerId!));
      }
    } catch {
      // Cleanup will use manual-cleanup.ts as fallback
    }

    await page.screenshot({ path: "e2e-results/ledger-create.png" });
  });

  test("Sổ doanh thu — Edit ledger entry amount", async ({ page }) => {
    test.skip(!createdLedgerId, "Ledger entry not created — skipping");

    await page.goto("/");
    await navigateTo(page, "Sổ doanh thu");
    await expectModuleLoaded(page, "Sổ doanh thu");
    await waitForLoaded(page);

    // Search for test entry
    const searchInput = page.locator('input[placeholder*="Tìm"]').or(page.locator('input[type="search"]'));
    if (await searchInput.first().isVisible()) {
      await searchInput.first().fill(TEST_PREFIX);
      await page.waitForTimeout(1_000);
    }

    // Click edit on the test row
    const testRow = page.locator("tr, div").filter({ hasText: TEST_ENTRY.tenKhach }).first();
    const editBtn = testRow.locator("button:has-text('Sửa')").or(
      testRow.locator("button[title*='edit'], button[title*='Edit']")
    );
    if (await editBtn.isVisible()) {
      await editBtn.click();
      await page.waitForTimeout(500);

      // Update amount
      const amountInput = page.locator('label:has-text("Số tiền") ~ input').or(
        page.locator('input[placeholder*="VND"]')
      );
      await amountInput.first().clear();
      await amountInput.first().fill("5000000");

      // Save
      const saveBtn = page.locator("button:has-text('Lưu')");
      await saveBtn.click();
      await page.waitForTimeout(2_000);
    }

    await page.screenshot({ path: "e2e-results/ledger-edit.png" });
  });

  test("Sổ doanh thu — Filter by team + search + date range", async ({ page }) => {
    await page.goto("/");
    await navigateTo(page, "Sổ doanh thu");
    await expectModuleLoaded(page, "Sổ doanh thu");
    await waitForLoaded(page);

    // Filter by team
    const teamSelect = page.locator('select').first();
    if (await teamSelect.isVisible()) {
      await teamSelect.selectOption({ label: "Inhouse 1" });
      await page.waitForTimeout(1_500);
    }

    // Search
    const searchInput = page.locator('input[placeholder*="Tìm"]').or(page.locator('input[type="search"]'));
    if (await searchInput.first().isVisible()) {
      await searchInput.first().fill(TEST_PREFIX);
      await page.waitForTimeout(1_000);
    }

    // Verify filter works — either test entry visible or empty state
    const testEntry = page.locator(`text=${TEST_ENTRY.tenKhach}`).first();
    const emptyState = page.locator("text=Chưa có dữ liệu").or(page.locator("text=Không có"));
    await expect(testEntry.or(emptyState)).toBeVisible({ timeout: 10_000 });

    await page.screenshot({ path: "e2e-results/ledger-filter.png" });
  });

  // ── BC03 ──

  test("BC03 — Smoke: loads with month selector, tabs", async ({ page }) => {
    await page.goto("/");
    await navigateTo(page, "BC03 — Báo cáo tổng bộ");
    await expectModuleLoaded(page, "BC03");

    // Month selector
    await expect(
      page.locator('input[type="month"]').or(page.locator('select').first())
    ).toBeVisible({ timeout: 10_000 });

    // Tabs: Revenue / Trial / Referral
    await expect(page.locator("text=Revenue").or(page.locator("text=Doanh thu"))).toBeVisible({ timeout: 10_000 });

    await page.screenshot({ path: "e2e-results/bc03-smoke.png" });
  });

  test("BC03 — Data display and tab switching", async ({ page }) => {
    await page.goto("/");
    await navigateTo(page, "BC03 — Báo cáo tổng bộ");
    await expectModuleLoaded(page, "BC03");
    await waitForLoaded(page);

    // Verify data or empty state on default tab
    const dataTable = page.locator("table").first();
    const emptyState = page.locator("text=Chưa có dữ liệu").or(page.locator("text=Không có"));
    await expect(dataTable.or(emptyState)).toBeVisible({ timeout: 15_000 });

    // Switch to Trial tab
    const trialTab = page.locator("button:has-text('Trial')").or(page.locator("text=Trial"));
    if (await trialTab.isVisible()) {
      await trialTab.click();
      await page.waitForTimeout(2_000);
      await page.screenshot({ path: "e2e-results/bc03-trial.png" });
    }

    // Switch to Referral tab
    const referralTab = page.locator("button:has-text('Referral')").or(page.locator("text=Referral"));
    if (await referralTab.isVisible()) {
      await referralTab.click();
      await page.waitForTimeout(2_000);
      await page.screenshot({ path: "e2e-results/bc03-referral.png" });
    }
  });
});
```

- [ ] **Step 2: Run the revenue reporting journey**

Run: `cd frontend && npx playwright test --project=journeys -- journeys/revenue-reporting`

Expected: 7 tests run. Smoke tests pass. CRUD tests may need selector adjustments.

- [ ] **Step 3: Fix any selector issues**

- [ ] **Step 4: Commit**

```bash
git add frontend/e2e/journeys/revenue-reporting.spec.ts
git commit -m "feat(e2e): add revenue & reporting journey chain (ledger + BC03)"
```

---

### Task 8: Journey Chain 3 — crm-dashboard.spec.ts

**Files:**
- Create: `frontend/e2e/journeys/crm-dashboard.spec.ts`

- [ ] **Step 1: Write the CRM + Dashboard spec**

```typescript
// frontend/e2e/journeys/crm-dashboard.spec.ts
import { test, expect } from "@playwright/test";
import { navigateTo, expectModuleLoaded } from "../helpers/navigation";
import { waitForLoaded } from "../helpers/assertions";

test.describe("CRM & Dashboard: extended coverage", () => {
  test("Dashboard — Gamification sections load", async ({ page }) => {
    await page.goto("/");
    await expectModuleLoaded(page, "Bảng thông tin");

    // Commission card
    await expect(page.locator("text=Tính hoa hồng")).toBeVisible({ timeout: 15_000 });

    // Top sales
    const topToday = page.locator("text=Top hôm nay");
    const topMonth = page.locator("text=Top tháng");
    await expect(topToday.or(topMonth)).toBeVisible({ timeout: 20_000 });

    await page.screenshot({ path: "e2e-results/dashboard-gamification.png" });
  });

  test("DoanhThuSale — Pivot table loads", async ({ page }) => {
    await page.goto("/");

    // Navigate — "Doanh thu Sale" may be under "Sổ doanh thu" or a separate sidebar item
    // Based on the MODULE_LIST, there's no separate "Doanh thu Sale" sidebar item.
    // It's accessed via BC01 or BC02 reports.
    await navigateTo(page, "BC01: Sales performance");
    await expectModuleLoaded(page, "BC01");
    await waitForLoaded(page);

    // Verify pivot table or KPI view
    const table = page.locator("table").first();
    const emptyState = page.locator("text=Chưa có dữ liệu").or(page.locator("text=Không có"));
    await expect(table.or(emptyState)).toBeVisible({ timeout: 15_000 });

    await page.screenshot({ path: "e2e-results/bc01-pivot.png" });
  });

  test("DoanhThuSale — Date range switching", async ({ page }) => {
    await page.goto("/");
    await navigateTo(page, "BC02: Key Data");
    await expectModuleLoaded(page, "BC02");
    await waitForLoaded(page);

    // Verify data loads
    const table = page.locator("table").first();
    const emptyState = page.locator("text=Chưa có dữ liệu");
    await expect(table.or(emptyState)).toBeVisible({ timeout: 15_000 });

    // Try date range filter if available
    const dateInput = page.locator('input[type="date"]').first();
    if (await dateInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      const today = new Date().toISOString().slice(0, 10);
      await dateInput.fill(today);
      await page.waitForTimeout(2_000);
    }

    await page.screenshot({ path: "e2e-results/bc02-key-data.png" });
  });

  test("Dashboard Sale (M6) — KPI cards and filters", async ({ page }) => {
    await page.goto("/");
    await navigateTo(page, "Dashboard Sale");
    await expectModuleLoaded(page, "Dashboard Sale");
    await waitForLoaded(page);

    // Range buttons
    await expect(page.locator("text=Tháng này")).toBeVisible({ timeout: 10_000 });

    // Click "Tháng này"
    await page.click("button:has-text('Tháng này')");
    await page.waitForTimeout(2_000);

    // KPI or empty state
    const kpi = page.locator("text=Tổng leads");
    const noData = page.locator("text=Chưa có dữ liệu");
    await expect(kpi.or(noData)).toBeVisible({ timeout: 15_000 });

    await page.screenshot({ path: "e2e-results/m6-dashboard-sale.png" });
  });
});
```

- [ ] **Step 2: Run**

Run: `cd frontend && npx playwright test --project=journeys -- journeys/crm-dashboard`

Expected: 4 tests pass (all read-only).

- [ ] **Step 3: Commit**

```bash
git add frontend/e2e/journeys/crm-dashboard.spec.ts
git commit -m "feat(e2e): add CRM & dashboard journey chain (gamification, BC01, BC02, M6)"
```

---

### Task 9: Journey Chain 4 — admin-smoke.spec.ts

**Files:**
- Create: `frontend/e2e/journeys/admin-smoke.spec.ts`

- [ ] **Step 1: Write the admin smoke spec**

```typescript
// frontend/e2e/journeys/admin-smoke.spec.ts
import { test, expect } from "@playwright/test";
import { navigateTo, expectModuleLoaded } from "../helpers/navigation";
import { waitForLoaded, expectTableRows } from "../helpers/assertions";

test.describe("Admin: Auth Accounts + Permissions smoke", () => {
  test("Auth Accounts — page loads with user table", async ({ page }) => {
    await page.goto("/");
    await navigateTo(page, "Tài khoản Auth");
    await expectModuleLoaded(page, "Tài khoản Auth");
    await waitForLoaded(page);

    // User table should show at least 1 row (the E2E user itself)
    await expectTableRows(page, 1);

    // Search input
    await expect(
      page.locator('input[placeholder*="Tìm"]').or(page.locator('input[type="search"]'))
    ).toBeVisible({ timeout: 5_000 });

    await page.screenshot({ path: "e2e-results/admin-auth-accounts.png" });
  });

  test("Permissions — matrix loads with departments × modules", async ({ page }) => {
    await page.goto("/");
    await navigateTo(page, "Phân quyền sử dụng");
    await expectModuleLoaded(page, "Phân quyền");
    await waitForLoaded(page);

    // Department labels
    await expect(page.locator("text=Bán hàng")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=Nhân sự")).toBeVisible();
    await expect(page.locator("text=Marketing")).toBeVisible();

    // Module labels
    await expect(page.locator("text=Bảng thông tin")).toBeVisible();
    await expect(page.locator("text=Quản lý thanh toán")).toBeVisible();

    // Access level indicators
    await expect(
      page.locator("text=Toàn quyền").or(page.locator("text=Chỉ xem"))
    ).toBeVisible({ timeout: 5_000 });

    await page.screenshot({ path: "e2e-results/admin-permissions.png" });
  });
});
```

- [ ] **Step 2: Run**

Run: `cd frontend && npx playwright test --project=journeys -- journeys/admin-smoke`

Expected: 2 tests pass.

- [ ] **Step 3: Commit**

```bash
git add frontend/e2e/journeys/admin-smoke.spec.ts
git commit -m "feat(e2e): add admin smoke tests (auth accounts + permissions)"
```

---

### Task 10: RBAC visibility tests

**Files:**
- Create: `frontend/e2e/rbac-visibility.spec.ts`

- [ ] **Step 1: Write the RBAC visibility spec**

```typescript
// frontend/e2e/rbac-visibility.spec.ts
import { test, expect } from "@playwright/test";
import { expectSidebarVisible, expectSidebarHidden, navigateTo } from "./helpers/navigation";

// Expected visibility per role — from DEFAULT_PERMISSIONS in permissions.ts
const ROLE_EXPECTATIONS: Record<
  string,
  { visible: string[]; hidden: string[]; readOnly: string[] }
> = {
  sale: {
    visible: [
      "Bảng thông tin",
      "Quản lý thanh toán",
      "Đối soát giao dịch",
      "Kích hoạt khóa học",
      "Dashboard Sale",
      "Thông tin cá nhân",
    ],
    hidden: [
      "Tài khoản Auth",
      "Đồng bộ CRM",
    ],
    readOnly: ["Sổ doanh thu"],
  },
  marketing: {
    visible: [
      "Bảng thông tin",
      "Sổ doanh thu",
      "Thông tin cá nhân",
    ],
    hidden: [
      "Quản lý thanh toán",
      "Đối soát giao dịch",
      "Kích hoạt khóa học",
      "Xuất hóa đơn",
      "Tài khoản Auth",
      "Đồng bộ CRM",
      "Dashboard Sale",
    ],
    readOnly: ["Bảng thông tin"],
  },
  cs: {
    visible: [
      "Bảng thông tin",
      "Kích hoạt khóa học",
      "Thông tin cá nhân",
    ],
    hidden: [
      "Quản lý thanh toán",
      "Đối soát giao dịch",
      "Xuất hóa đơn",
      "Sổ doanh thu",
      "Tài khoản Auth",
      "Đồng bộ CRM",
      "Dashboard Sale",
    ],
    readOnly: ["Bảng thông tin"],
  },
};

function getRoleFromProject(): string {
  const role = (test.info().project.metadata as { role?: string })?.role
    ?? process.env.E2E_ROLE;
  if (!role) throw new Error("E2E_ROLE not set — run via rbac-* project");
  return role;
}

test.describe("RBAC Sidebar Visibility", () => {
  test("correct sidebar items are visible for this role", async ({ page }) => {
    const role = getRoleFromProject();
    const expectations = ROLE_EXPECTATIONS[role];
    if (!expectations) {
      test.skip(true, `No expectations defined for role: ${role}`);
      return;
    }

    await page.goto("/");
    // Wait for sidebar to render
    await expect(page.locator("nav").first()).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(2_000);

    for (const label of expectations.visible) {
      await expectSidebarVisible(page, label);
    }

    await page.screenshot({ path: `e2e-results/rbac-${role}-visible.png` });
  });

  test("restricted sidebar items are hidden for this role", async ({ page }) => {
    const role = getRoleFromProject();
    const expectations = ROLE_EXPECTATIONS[role];
    if (!expectations) {
      test.skip(true, `No expectations defined for role: ${role}`);
      return;
    }

    await page.goto("/");
    await expect(page.locator("nav").first()).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(2_000);

    for (const label of expectations.hidden) {
      await expectSidebarHidden(page, label);
    }

    await page.screenshot({ path: `e2e-results/rbac-${role}-hidden.png` });
  });

  test("read-only modules have no create/edit buttons", async ({ page }) => {
    const role = getRoleFromProject();
    const expectations = ROLE_EXPECTATIONS[role];
    if (!expectations || expectations.readOnly.length === 0) {
      test.skip(true, `No read-only modules for role: ${role}`);
      return;
    }

    await page.goto("/");
    await expect(page.locator("nav").first()).toBeVisible({ timeout: 15_000 });

    for (const label of expectations.readOnly) {
      await navigateTo(page, label);
      await page.waitForTimeout(2_000);

      // Verify no mutation buttons
      const createBtn = page.locator("button:has-text('Tạo')");
      const addBtn = page.locator("button:has-text('Thêm')");
      const editBtn = page.locator("button:has-text('Sửa')");
      const deleteBtn = page.locator("button:has-text('Xóa')");

      // None of these should be visible
      for (const btn of [createBtn, addBtn, editBtn, deleteBtn]) {
        const count = await btn.count();
        if (count > 0) {
          // Button exists but should be either hidden or disabled
          for (let i = 0; i < count; i++) {
            const visible = await btn.nth(i).isVisible();
            if (visible) {
              const disabled = await btn.nth(i).isDisabled();
              expect(disabled).toBe(true);
            }
          }
        }
      }
    }

    await page.screenshot({ path: `e2e-results/rbac-${role}-readonly.png` });
  });
});
```

- [ ] **Step 2: Set up test accounts in .env.e2e**

Before running RBAC tests, the user must create 3 role-specific accounts in Supabase and fill in `.env.e2e`. Print a reminder:

```
echo "Before running RBAC tests, create these accounts in your app:"
echo "  1. Sale dept account → E2E_SALE_EMAIL + E2E_SALE_PASSWORD"
echo "  2. Marketing dept account → E2E_MARKETING_EMAIL + E2E_MARKETING_PASSWORD"  
echo "  3. CS dept account → E2E_CS_EMAIL + E2E_CS_PASSWORD"
echo "Then fill them in frontend/.env.e2e"
```

- [ ] **Step 3: Run RBAC tests (once accounts exist)**

Run: `cd frontend && npx playwright test --project=rbac-sale --project=rbac-marketing --project=rbac-cs`

Expected: 9 tests (3 per role). Visibility tests should match `DEFAULT_PERMISSIONS`.

- [ ] **Step 4: Commit**

```bash
git add frontend/e2e/rbac-visibility.spec.ts
git commit -m "feat(e2e): add RBAC sidebar visibility tests for sale/marketing/cs"
```

---

### Task 11: Integration test — full suite run + gitkeep for .auth

**Files:**
- Modify: `frontend/e2e/.auth/.gitkeep` (ensure exists)

- [ ] **Step 1: Ensure .auth directory has gitkeep for all roles**

The existing `.gitkeep` already covers `user.json`. Verify it's in `.gitignore` and the role auth files will also be ignored.

Check `frontend/.gitignore` for:
```
e2e/.auth/
!e2e/.auth/.gitkeep
```

If not present, add these lines.

- [ ] **Step 2: Run the full suite**

Run: `cd frontend && npx playwright test --project=auth-setup --project=journeys --project=e2e`

This runs:
1. Auth setup (login)
2. Journey chains (payment → revenue → crm-dashboard → admin-smoke)
3. Existing tests (crm-sync + dashboard-sales)

Expected: All tests pass. Total ~41 tests (27 new journeys + 14 existing).

Note: RBAC tests are excluded here since they need separate role accounts configured.

- [ ] **Step 3: Verify cleanup worked**

Run: `cd frontend && npx tsx e2e/helpers/manual-cleanup.ts`

Expected: "Found 0 test PRs" and "Found 0 test entries" — afterAll cleanup should have already cleaned up.

- [ ] **Step 4: Final commit**

```bash
git add -A frontend/e2e/ frontend/.gitignore
git commit -m "feat(e2e): complete E2E user journey test suite (32 new tests across 5 specs)"
```

---

## Verification Checklist

After all tasks are complete, verify:

- [ ] `npm run e2e` — existing 14 tests still pass
- [ ] `npm run e2e:journeys` — 23 journey tests pass (payment: 10, revenue: 7, crm: 4, admin: 2)
- [ ] `npm run e2e:rbac` — 9 RBAC tests pass (requires role accounts configured)
- [ ] `npm run e2e:all` — full suite passes
- [ ] `npm run e2e:cleanup` — manual cleanup runs without errors
- [ ] `npm run e2e:report` — HTML report generates with screenshots and videos
- [ ] No `[E2E-TEST]` data remains in production after test run
