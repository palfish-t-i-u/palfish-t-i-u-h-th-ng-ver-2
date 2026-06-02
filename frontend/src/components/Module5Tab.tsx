import { useCallback, useEffect, useState } from "react";
import { endpoints } from "../lib/api";
import { supabase } from "../lib/supabase";
import { usePermission } from "../hooks/usePermission";
import Button from "./ui/Button";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function TokenStatus({ hasToken, updatedAt }: { hasToken: boolean | null; updatedAt?: string | null }) {
  if (hasToken === null) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-gmv-bg px-4 py-3 text-sm text-gmv-muted">
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-gmv-muted" />
        Đang kiểm tra token…
      </div>
    );
  }
  if (!hasToken) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
        <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
        <span>
          <strong className="text-red-800">Chưa có token CRM.</strong> Hãy cài Extension và truy cập trang CRM.
        </span>
      </div>
    );
  }
  const fmtTime = updatedAt
    ? new Date(updatedAt).toLocaleString("vi-VN", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      })
    : "vừa rồi";
  return (
    <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700 ring-1 ring-emerald-200">
      <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
      <span>
        <strong className="text-emerald-800">Token CRM đang hoạt động</strong> — cập nhật lần cuối: {fmtTime}
      </span>
    </div>
  );
}

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onClose, 4000);
    return () => window.clearTimeout(t);
  }, [onClose]);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-3 text-sm font-medium text-white shadow-lg ring-1 ring-emerald-500/50">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M20 6L9 17l-5-5" />
      </svg>
      {message}
    </div>
  );
}

export default function Module5Tab() {
  const { readOnly } = usePermission("module5");
  const [syncDate, setSyncDate] = useState(yesterdayStr());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [hasToken, setHasToken] = useState<boolean | null>(null);
  const [tokenUpdatedAt, setTokenUpdatedAt] = useState<string | null>(null);

  const checkToken = useCallback(async () => {
    setHasToken(null);
    try {
      const { data, error: sbErr } = await supabase
        .from("crm_tokens")
        .select("updated_at")
        .eq("id", 1)
        .maybeSingle();
      if (sbErr || !data) {
        setHasToken(false);
      } else {
        setHasToken(true);
        setTokenUpdatedAt(data.updated_at ?? null);
      }
    } catch {
      setHasToken(false);
    }
  }, []);

  useEffect(() => {
    checkToken();
  }, [checkToken]);

  async function handleSync() {
    if (!syncDate) {
      setError("Vui lòng chọn ngày cần đồng bộ.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await endpoints.crmData.sync(syncDate);
      const { rows_upserted, rows_fetched, department_fallback, sync_date } = res.data;
      let msg = `Đồng bộ ${sync_date ?? syncDate} thành công! ${rows_upserted}/${rows_fetched} dòng.`;
      if (department_fallback) {
        msg += " Lưu ý: team CRM export rỗng — đã dùng dữ liệu org VN.";
      }
      setToast(msg);
    } catch (e: unknown) {
      const err = e as { response?: { status?: number; data?: { detail?: string } } };
      const status = err.response?.status;
      const detail = err.response?.data?.detail;
      if (status === 404) {
        setError(
          "API /crm/sync chưa có trên server — backend Render (palfish-gmv-api) chưa deploy bản mới. "
          + "Vào Render Dashboard → Manual Deploy → Deploy latest commit, đợi ~5 phút rồi thử lại."
        );
      } else {
        setError(detail || "Đồng bộ thất bại. Kiểm tra token CRM và log backend Render.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {toast && <Toast message={toast} onClose={() => setToast("")} />}

      <p className="text-sm text-gmv-text">
        Chỉ cần mở CRM để extension lấy token — bấm LẤY DỮ LIỆU tại đây, không cần Export trên PalFish.
      </p>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-gmv-text-strong">
            Trạng thái kết nối CRM
          </span>
          <button
            onClick={checkToken}
            className="text-xs text-gmv-primary hover:underline transition"
          >
            Làm mới
          </button>
        </div>
        <TokenStatus hasToken={hasToken} updatedAt={tokenUpdatedAt} />
      </div>

      <div className="rounded-xl border border-gmv-border bg-gmv-bg p-5">
        <p className="mb-4 text-sm font-semibold text-gmv-text-strong">
          Incremental sync — đúng 1 ngày / lần (cron hoặc thủ công)
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2 max-w-xs">
            <span className="mb-1.5 block text-xs font-medium text-gmv-muted">Ngày cần đồng bộ</span>
            <input
              type="date"
              value={syncDate}
              max={todayStr()}
              onChange={(e) => setSyncDate(e.target.value)}
              className="gmv-field w-full rounded-gmv-md border border-gmv-border bg-gmv-canvas px-3 py-2 text-sm text-gmv-text-strong
                         focus:border-gmv-primary focus:outline-none focus:ring-1 focus:ring-gmv-primary"
            />
          </label>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {[
            { label: "Hôm qua", fn: () => setSyncDate(yesterdayStr()) },
            { label: "Hôm nay", fn: () => setSyncDate(todayStr()) },
          ].map(({ label, fn }) => (
            <button
              key={label}
              onClick={fn}
              className="rounded-md border border-gmv-border bg-gmv-canvas px-3 py-1.5 text-xs font-medium text-gmv-text-strong
                         hover:bg-gmv-row-hover transition"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </div>
      )}

      <div className="flex items-center gap-4">
        {!readOnly && <Button
          size="md"
          variant="primary"
          disabled={loading || hasToken === false}
          onClick={handleSync}
          className="min-w-[180px] bg-orange-500 hover:bg-orange-600 disabled:opacity-50"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="animate-spin">⟳</span> Đang đồng bộ…
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.85 1.05 6.5 2.74" />
                <polyline points="21 3 21 9 15 9" />
              </svg>
              LẤY DỮ LIỆU
            </span>
          )}
        </Button>}
        {loading && (
          <p className="text-xs text-gmv-muted">
            Đang cào dữ liệu từng ngày, vui lòng chờ…
          </p>
        )}
      </div>

      <div className="rounded-xl border border-gmv-border bg-gmv-bg p-5">
        <p className="mb-3 text-sm font-semibold text-gmv-text-strong">
          Hướng dẫn cài Chrome Extension
        </p>
        <ol className="space-y-2 text-sm text-gmv-text">
          <li>
            <span className="font-medium text-gmv-text-strong">1.</span> Mở Chrome → vào{" "}
            <code className="rounded bg-gmv-bg px-1 text-xs text-gmv-text-strong ring-1 ring-gmv-border">chrome://extensions</code>
          </li>
          <li>
            <span className="font-medium text-gmv-text-strong">2.</span> Bật{" "}
            <span className="font-medium text-gmv-text-strong">Developer mode</span> ở góc phải
          </li>
          <li>
            <span className="font-medium text-gmv-text-strong">3.</span> Bấm{" "}
            <span className="font-medium text-gmv-text-strong">Load unpacked</span> → chọn thư mục{" "}
            <code className="rounded bg-gmv-bg px-1 text-xs text-gmv-text-strong ring-1 ring-gmv-border">crm-token-extension/</code>
          </li>
          <li>
            <span className="font-medium text-gmv-text-strong">4.</span> Truy cập{" "}
            <a
              href="https://sea.pri.ibanyu.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gmv-primary hover:underline"
            >
              sea.pri.ibanyu.com
            </a>{" "}
            → đăng nhập (extension tự lấy token — <strong className="text-gmv-text-strong">không cần Export</strong>)
          </li>
          <li>
            <span className="font-medium text-gmv-text-strong">5.</span> Quay lại tab này → chọn kỳ ngày → bấm{" "}
            <span className="font-medium text-gmv-text-strong">LẤY DỮ LIỆU</span>
          </li>
        </ol>
      </div>
    </div>
  );
}
