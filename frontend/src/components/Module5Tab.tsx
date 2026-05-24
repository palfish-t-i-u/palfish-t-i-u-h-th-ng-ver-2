import { useCallback, useEffect, useState } from "react";
import { endpoints } from "../lib/api";
import { supabase } from "../lib/supabase";
import Button from "./ui/Button";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function firstDayOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function TokenStatus({ hasToken, updatedAt }: { hasToken: boolean | null; updatedAt?: string | null }) {
  if (hasToken === null) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-3 text-sm text-slate-400">
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-slate-500" />
        Đang kiểm tra token…
      </div>
    );
  }
  if (!hasToken) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-red-950/60 px-4 py-3 text-sm text-red-300 ring-1 ring-red-800">
        <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
        <span>
          <strong className="text-red-200">Chưa có token CRM.</strong> Hãy cài Extension và truy cập trang CRM.
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
    <div className="flex items-center gap-2 rounded-lg bg-emerald-950/60 px-4 py-3 text-sm text-emerald-300 ring-1 ring-emerald-800">
      <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#4ade80]" />
      <span>
        <strong className="text-emerald-200">Token CRM đang hoạt động</strong> — cập nhật lần cuối: {fmtTime}
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
  const [startDate, setStartDate] = useState(firstDayOfMonth());
  const [endDate, setEndDate] = useState(todayStr());
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
    if (!startDate || !endDate) {
      setError("Vui lòng chọn đủ Từ ngày và Đến ngày.");
      return;
    }
    if (endDate < startDate) {
      setError("Đến ngày phải >= Từ ngày.");
      return;
    }

    const days =
      (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86_400_000;
    if (days >= 31) {
      setError("Dải ngày tối đa 31 ngày. Vui lòng thu hẹp khoảng thời gian.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await endpoints.crmData.sync(startDate, endDate);
      const { rows_upserted, rows_fetched, days_failed, department_fallback, summary_rows, daily_rows } = res.data;
      let msg = `Đồng bộ thành công! ${rows_upserted}/${rows_fetched} dòng (summary: ${summary_rows ?? "?"}, daily: ${daily_rows ?? "?"}).`;
      if (department_fallback) {
        msg += " Lưu ý: team CRM export rỗng — đã dùng dữ liệu org VN.";
      }
      if (days_failed?.length > 0) {
        msg += ` (${days_failed.length} ngày lỗi)`;
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
    <div className="space-y-6 p-6">
      {toast && <Toast message={toast} onClose={() => setToast("")} />}

      <div>
        <h2 className="text-xl font-bold text-slate-100">
          Module 5 — Đồng bộ dữ liệu CRM
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Chỉ cần mở CRM để extension lấy token — bấm LẤY DỮ LIỆU tại đây, không cần Export trên PalFish.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Trạng thái kết nối CRM
          </span>
          <button
            onClick={checkToken}
            className="text-xs text-blue-400 hover:text-blue-300 transition"
          >
            Làm mới
          </button>
        </div>
        <TokenStatus hasToken={hasToken} updatedAt={tokenUpdatedAt} />
      </div>

      <div className="rounded-xl bg-slate-800/60 p-5 ring-1 ring-slate-700">
        <p className="mb-4 text-sm font-semibold text-slate-300">Chọn dải ngày cần đồng bộ</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-400">Từ ngày</span>
            <input
              type="date"
              value={startDate}
              max={endDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100
                         focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-400">Đến ngày</span>
            <input
              type="date"
              value={endDate}
              min={startDate}
              max={todayStr()}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100
                         focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </label>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {[
            { label: "Hôm nay", fn: () => { setStartDate(todayStr()); setEndDate(todayStr()); } },
            {
              label: "7 ngày qua",
              fn: () => {
                const d = new Date();
                const from = new Date(d);
                from.setDate(d.getDate() - 6);
                setStartDate(from.toISOString().slice(0, 10));
                setEndDate(todayStr());
              },
            },
            { label: "Tháng này", fn: () => { setStartDate(firstDayOfMonth()); setEndDate(todayStr()); } },
          ].map(({ label, fn }) => (
            <button
              key={label}
              onClick={fn}
              className="rounded-md bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300
                         hover:bg-slate-600 transition"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-950/60 px-4 py-3 text-sm text-red-300 ring-1 ring-red-800">
          {error}
        </div>
      )}

      <div className="flex items-center gap-4">
        <Button
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
        </Button>
        {loading && (
          <p className="text-xs text-slate-400">
            Đang cào dữ liệu từng ngày, vui lòng chờ…
          </p>
        )}
      </div>

      <div className="rounded-xl bg-slate-800/40 p-5 ring-1 ring-slate-700/50">
        <p className="mb-3 text-sm font-semibold text-slate-300">
          Hướng dẫn cài Chrome Extension
        </p>
        <ol className="space-y-2 text-sm text-slate-400">
          <li>
            <span className="font-medium text-slate-300">1.</span> Mở Chrome → vào{" "}
            <code className="rounded bg-slate-700 px-1 text-xs text-slate-200">chrome://extensions</code>
          </li>
          <li>
            <span className="font-medium text-slate-300">2.</span> Bật{" "}
            <span className="font-medium text-slate-200">Developer mode</span> ở góc phải
          </li>
          <li>
            <span className="font-medium text-slate-300">3.</span> Bấm{" "}
            <span className="font-medium text-slate-200">Load unpacked</span> → chọn thư mục{" "}
            <code className="rounded bg-slate-700 px-1 text-xs text-slate-200">crm-token-extension/</code>
          </li>
          <li>
            <span className="font-medium text-slate-300">4.</span> Truy cập{" "}
            <a
              href="https://sea.pri.ibanyu.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:underline"
            >
              sea.pri.ibanyu.com
            </a>{" "}
            → đăng nhập (extension tự lấy token — <strong className="text-slate-200">không cần Export</strong>)
          </li>
          <li>
            <span className="font-medium text-slate-300">5.</span> Quay lại tab này → chọn kỳ ngày → bấm{" "}
            <span className="font-medium text-slate-200">LẤY DỮ LIỆU</span>
          </li>
        </ol>
      </div>
    </div>
  );
}
