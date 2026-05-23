import axios from "axios";

export function formatApiError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    if (err.code === "ERR_NETWORK" || !err.response) {
      return (
        "Không kết nối được API (Render). " +
        "Đợi ~30–60 giây rồi thử lại (gói free hay ngủ). " +
        "Nếu vẫn lỗi: redeploy Vercel sau khi push code mới."
      );
    }
    const detail = err.response.data;
    if (typeof detail === "string" && detail) return detail;
    if (detail && typeof detail === "object" && "detail" in detail) {
      const d = (detail as { detail: unknown }).detail;
      if (typeof d === "string") return d;
    }
    return `${fallback} (HTTP ${err.response.status})`;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
