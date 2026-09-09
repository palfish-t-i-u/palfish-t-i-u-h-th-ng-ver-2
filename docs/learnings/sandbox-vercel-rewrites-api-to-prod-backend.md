# Site sandbox Vercel rewrite `/api` sang BE PROD — "test trên sandbox" không cô lập

**Related files:** `frontend/vercel.json`, `frontend/src/lib/apiBaseUrl.ts`, `frontend/playwright.sandbox.config.ts`, `frontend/playwright.local-sandbox.config.ts`, `frontend/.env.sandbox.example`

**Problem:** Định smoke fix sửa AR "trên sandbox trước cho an toàn" (9/9/2026) qua `https://palfish-gmv-manager-sandbox.vercel.app` + `playwright.sandbox.config.ts`. Kiểm tra trước khi ghi: `GET https://palfish-gmv-manager-sandbox.vercel.app/api/healthz` trả `{"app_env":"production","sandbox":false}` — site sandbox đang gọi **BE prod**.

**Trap:** Tin "2 project Vercel = 2 môi trường". Thực tế `frontend/vercel.json` (giống hệt trên cả nhánh `main` lẫn `sandbox`) hardcode `env.VITE_API_BASE_URL="/api"` + rewrite `/api/:path*` → `https://palfish-gmv-api.onrender.com` (prod). Env dashboard của project sandbox không thắng được `vercel.json`. Bundle sandbox (grep host `https://…` trong `/assets/index-*.js`) chỉ có Supabase **sandbox** `pxgy…` — không có host onrender nào → FE dùng `/api` tương đối → rewrite → prod. Kết quả: JWT sandbox gửi tới BE prod (401 nếu BE verify đúng — đó là lý do prod hiện **0** PR `[E2E-TEST]`; nếu BE lỏng thì ghi thẳng prod).

**Insight:** Muốn FE (code đang sửa) chạy cô lập với prod mà vẫn có auth thật: chạy Vite local `--mode sandbox` với `.env.sandbox` (`VITE_SUPABASE_URL` sandbox + `VITE_API_BASE_URL` = URL tuyệt đối Render sandbox) → `resolveApiBaseUrl()` nhánh dev trả URL tuyệt đối, không qua proxy; BE sandbox đã allow CORS `localhost:5173`; tài khoản `test.*@dev` có sẵn trong Supabase sandbox. Config sẵn: `playwright.local-sandbox.config.ts` + `E2E_API_URL_OVERRIDE` cho `E2eApiClient`.

**Rule:** TRƯỚC mọi E2E/smoke có ghi dữ liệu trên một URL "sandbox": probe `<site>/api/healthz` — phải thấy `"app_env":"sandbox"`. Không thấy → KHÔNG chạy mutation qua site đó; dùng `playwright.local-sandbox.config.ts`. Sửa gốc (chưa làm): tách rewrite theo môi trường (vd. `vercel.sandbox.json` / build-time destination) rồi verify lại bằng probe.

**Verify:** `curl -s https://palfish-gmv-manager-sandbox.vercel.app/api/healthz` — nếu vẫn `"app_env":"production"` thì bẫy còn nguyên; `grep -n "onrender" frontend/vercel.json` — 2 dòng đều trỏ `palfish-gmv-api.onrender.com`.
