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
