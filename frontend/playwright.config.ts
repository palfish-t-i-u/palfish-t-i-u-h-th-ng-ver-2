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
    {
      name: "auth-setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "e2e",
      use: {
        ...devices["Desktop Chrome"],
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
