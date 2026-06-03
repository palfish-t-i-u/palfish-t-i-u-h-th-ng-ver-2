import { test as setup, expect } from "@playwright/test";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AUTH_FILE = path.resolve(__dirname, ".auth/user.json");

function loadEnvE2e() {
  const envPath = path.resolve(__dirname, "../.env.e2e");
  if (!fs.existsSync(envPath)) {
    throw new Error(
      "Missing .env.e2e — copy .env.e2e.example to .env.e2e and fill in E2E_EMAIL + E2E_PASSWORD"
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

setup("authenticate", async ({ page }) => {
  const env = loadEnvE2e();
  const email = env.E2E_EMAIL;
  const password = env.E2E_PASSWORD;

  if (!email || !password) {
    throw new Error("E2E_EMAIL and E2E_PASSWORD must be set in .env.e2e");
  }

  await page.goto("/login");
  await expect(page.locator("text=Đăng nhập")).toBeVisible({ timeout: 15_000 });

  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');

  // Wait for redirect to main page (sidebar appears)
  await expect(page.locator("text=Bảng thông tin")).toBeVisible({ timeout: 20_000 });

  await page.context().storageState({ path: AUTH_FILE });
});
