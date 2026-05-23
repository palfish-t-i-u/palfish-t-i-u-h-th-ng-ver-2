import { useCallback, useEffect, useState } from "react";
import { endpoints } from "../lib/api";
import { supabase } from "../lib/supabase";
import Button from "./ui/Button";

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function firstDayOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// --------------------------------------------------------------------------
// Sub-components
// --------------------------------------------------------------------------
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

// --------------------------------------------------------------------------
// Main component
// --------------------------------------------------------------------------
export default function Module5Tab() {
  const [startDate, setStartDate] = useState(firstDayOfMonth());
  const [endDate, setEndDate] = useState(todayStr());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [hasToken, setHasToken] = useState<boolean | null>(null);
  const [tokenUpdatedAt, setTokenUpdatedAt] = useState<string | null>(null);

  // Đọc token status thẳng từ Supabase — không qua backend Render
  const checkToken = useCallback(async () => {
    setHasToken(null);
    try {
      const { data, error } = await supabase
        .from("crm_tokens")
        .select("updated_at")
        .eq("id", 1)
        .maybeSingle();
      if (error || !data) {
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

  async function handleExport() {
    if (!startDate || !endDate) {
      setError("Vui lòng chọn đủ Từ ngày và Đến ngày.");
      return;
    }
    if (endDate < startDate) {
      setError("Đến ngày phải >= Từ ngày.");
      return;
    }

    const days =
      (new Date(endDate).getTime() - new Date(startDate).getTime()) /
      86_400_000;
    if (days >= 31) {
      setError("Dải ngày tối đa 31 ngày. Vui lòng thu hẹp khoảng thời gian.");
      return;
    }

    setLoading(true);
    setError("");
    setSuccessMsg("");

    try {
      const res = await endpoints.crmData.exportMaster(startDate, endDate);
      const blob = res.data;
      const label = `${startDate}_to_${endDate}`.replace(/-/g, "");
      downloadBlob(blob, `Master_Sales_Data_${label}.xlsx`);
      setSuccessMsg(`Tải file thành công! (${startDate} → ${endDate})`);
    } catch (e: unknown) {
      // Khi responseType="blob", axios trả lỗi dưới dạng Blob → cần parse thủ công
      try {
        const errData = (e as { response?: { data?: unknown } })?.response?.data;
        if (errData instanceof Blob) {
          const text = await errData.text();
          const parsed = JSON.parse(text);
          setError(parsed?.detail || text || "Xuất dữ liệu thất bại.");
        } else {
          const detail = (errData as { detail?: string })?.detail;
          setError(detail || "Xuất dữ liệu thất bại. Kiểm tra log backend.");
        }
      } catch {
        setError("Xuất dữ liệu thất bại. Kiểm tra log backend để biết chi tiết.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-100">
          Module 5 — Đồng bộ dữ liệu CRM
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Lấy dữ liệu Sale từ CRM PalFish theo dải ngày, gộp thành 1 file Excel Master để download.
        </p>
      </div>

      {/* Token status */}
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

      {/* Date range picker */}
      <div className="rounded-xl bg-slate-800/60 p-5 ring-1 ring-slate-700">
        <p className="mb-4 text-sm font-semibold text-slate-300">Chọn dải ngày cần lấy dữ liệu</p>
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

        {/* Quick range buttons */}
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

      {/* Error / success */}
      {error && (
        <div className="rounded-lg bg-red-950/60 px-4 py-3 text-sm text-red-300 ring-1 ring-red-800">
          {error}
        </div>
      )}
      {successMsg && (
        <div className="rounded-lg bg-emerald-950/60 px-4 py-3 text-sm text-emerald-300 ring-1 ring-emerald-800">
          ✓ {successMsg}
        </div>
      )}

      {/* Action */}
      <div className="flex items-center gap-4">
        <Button
          size="md"
          variant="primary"
          disabled={loading || hasToken === false}
          onClick={handleExport}
          className="min-w-[180px] bg-orange-500 hover:bg-orange-600 disabled:opacity-50"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="animate-spin">⟳</span> Đang lấy dữ liệu…
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
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

      {/* Setup guide */}
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
            <span className="font-medium text-slate-200">"Developer mode"</span> ở góc phải
          </li>
          <li>
            <span className="font-medium text-slate-300">3.</span> Bấm{" "}
            <span className="font-medium text-slate-200">"Load unpacked"</span> → chọn thư mục{" "}
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
            → đăng nhập → <strong className="text-slate-200">bấm Export/Tải dữ liệu 1 lần</strong>{" "}
            (extension sẽ bắt token + payload thật)
          </li>
          <li>
            <span className="font-medium text-slate-300">5.</span> Quay lại tab này → bấm{" "}
            <span className="font-medium text-slate-200">Làm mới</span> token →{" "}
            <span className="font-medium text-slate-200">LẤY DỮ LIỆU</span>
          </li>
        </ol>
      </div>
    </div>
  );
}
