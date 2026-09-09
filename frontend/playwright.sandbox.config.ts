// ⚠️ 9/9/2026: site sandbox Vercel hiện rewrite `/api/*` sang BE **PROD**
// (vercel.json hardcode; probe `<site>/api/healthz` trả app_env=production).
// KHÔNG chạy spec có ghi dữ liệu bằng config này tới khi rewrite được tách môi
// trường. Muốn cô lập prod: dùng `playwright.local-sandbox.config.ts`.
// Xem docs/learnings/sandbox-vercel-rewrites-api-to-prod-backend.md.
//
// Chạy e2e trực tiếp trên sandbox Vercel (FE + BE + Supabase thật) — không cần
// dev server local. Dùng khi cần smoke feature vừa deploy:
//   npx playwright test e2e/<spec> --config playwright.sandbox.config.ts
// Khác config gốc: baseURL = sandbox, KHÔNG spawn webServer (dev-mode local
// đăng nhập giả `dev_user` → không có JWT thật → mọi call BE 401).
import baseConfig from "./playwright.config";
import { defineConfig } from "@playwright/test";

export default defineConfig({
  ...baseConfig,
  use: {
    ...baseConfig.use,
    baseURL: "https://palfish-gmv-manager-sandbox.vercel.app",
  },
  webServer: undefined,
});
