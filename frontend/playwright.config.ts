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
      testIgnore: [/journeys/, /auth.*\.setup/, /rbac-/, /mobile-/],
    },

    // ── Mobile viewport (375×812 worst-case = iPhone SE/13 mini) ──
    {
      name: "mobile",
      testMatch: /mobile-.*\.spec\.ts/,
      use: {
        ...devices["Pixel 5"],
        viewport: { width: 375, height: 812 },
        storageState: path.resolve(__dirname, "e2e/.auth/user.json"),
      },
      dependencies: ["auth-setup"],
    },
  ],

  webServer: {
    command: "npm run dev",
    port: PORT,
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
