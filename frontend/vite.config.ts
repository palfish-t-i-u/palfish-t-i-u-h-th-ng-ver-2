import { defineConfig, mergeConfig } from "vite";
import { defineConfig as defineVitestConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default mergeConfig(
  defineConfig({
    plugins: [react()],
    server: {
      proxy: {
        "/api": {
          target: "http://localhost:8000",
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api/, ""),
        },
      },
      // Playwright liên tục ghi trace/video/screenshot vào e2e-results/ và
      // e2e-report/ trong lúc chạy — nếu không loại trừ, watcher của Vite coi
      // đó là thay đổi code và full-reload trang đang test giữa chừng, gây
      // timeout hàng loạt không liên quan gì đến bug thật.
      watch: {
        ignored: ["**/e2e-results/**", "**/e2e-report/**"],
      },
    },
  }),
  defineVitestConfig({
    test: {
      globals: true,
      environment: "jsdom",
      setupFiles: "./src/test/setup.ts",
      css: false,
      // forks pool fails on Windows paths with non-ASCII chars; threads pool works
      pool: "threads",
      // Tránh Vitest nuốt nhầm các file Playwright (frontend/e2e/*.spec.ts)
      include: ["src/**/*.{test,spec}.{ts,tsx}"],
      exclude: ["e2e/**", "node_modules/**", "dist/**"],
      env: {
        VITE_API_BASE_URL: "http://localhost:8000",
        VITE_SUPABASE_URL: "https://test.supabase.co",
        VITE_SUPABASE_ANON_KEY: "test-anon-key",
      },
    },
  })
);
