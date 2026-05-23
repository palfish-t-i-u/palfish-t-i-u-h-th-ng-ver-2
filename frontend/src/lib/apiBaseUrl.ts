/** Render trực tiếp (local preview / fallback) */
export const PRODUCTION_API_DIRECT = "https://palfish-gmv-api.onrender.com";

/** Vercel proxy — vercel.json rewrite /api → Render (tránh CORS + localhost) */
export const PRODUCTION_API_PROXY = "/api";

const LOCAL_API = "http://localhost:8000";

function isLocalUrl(url: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(url);
}

function isRelativeApi(url: string): boolean {
  return url.startsWith("/") && !url.startsWith("//");
}

/**
 * Production: mặc định /api (cùng domain Vercel → Render).
 * Dev: localhost:8000
 */
export function resolveApiBaseUrl(): string {
  const fromEnv = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim().replace(/\/$/, "");

  if (import.meta.env.PROD) {
    if (fromEnv && (isRelativeApi(fromEnv) || !isLocalUrl(fromEnv))) return fromEnv;
    return PRODUCTION_API_PROXY;
  }

  if (fromEnv && !isLocalUrl(fromEnv) && !isRelativeApi(fromEnv)) return fromEnv;
  return LOCAL_API;
}
