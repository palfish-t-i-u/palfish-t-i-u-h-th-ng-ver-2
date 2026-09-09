// FE LOCAL (code đang sửa) + BE/Supabase SANDBOX thật — cô lập hoàn toàn prod.
// Khác `playwright.sandbox.config.ts` (site sandbox Vercel — hiện rewrite /api sang
// BE PROD, xem docs/learnings): ở đây Vite chạy `--mode sandbox` đọc `.env.sandbox`
// (VITE_SUPABASE_URL sandbox + VITE_API_BASE_URL = Render sandbox) → login thật,
// JWT sandbox, mọi ghi vào DB sandbox.
//   $env:E2E_API_URL_OVERRIDE="https://palfish-gmv-api-sandbox.onrender.com"
//   npx playwright test e2e/<spec> --config playwright.local-sandbox.config.ts --project=e2e
import baseConfig from "./playwright.config";
import { defineConfig } from "@playwright/test";

const PORT = 5173;

export default defineConfig({
  ...baseConfig,
  use: {
    ...baseConfig.use,
    baseURL: `http://localhost:${PORT}`,
  },
  webServer: {
    command: "npm run dev:sandbox",
    port: PORT,
    // KHÔNG tái dùng server sẵn có: `npm run dev` thường (không --mode sandbox) sẽ là
    // dev-mode giả (dev_user, không JWT) → BE 401.
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
