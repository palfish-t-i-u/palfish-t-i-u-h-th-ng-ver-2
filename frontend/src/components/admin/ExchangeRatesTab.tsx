import { useEffect, useState } from "react";
import { endpoints } from "../../lib/api";
import {
  fromApiExchangeRate,
  type ExchangeRateItem,
} from "../../types/exchangeRate";

const DEFAULT_RATE_FALLBACK = 3700; // legacy hard-code, fallback nếu BE chưa có data

interface FormState {
  rate: string;
  effectiveFrom: string;
  note: string;
}

const INITIAL_FORM: FormState = {
  rate: "",
  effectiveFrom: new Date().toISOString().slice(0, 10),
  note: "",
};

function formatVnd(n: number): string {
  return n.toLocaleString("vi-VN");
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("vi-VN");
}

export default function ExchangeRatesTab() {
  const [rates, setRates] = useState<ExchangeRateItem[]>([]);
  const [currentRate, setCurrentRate] = useState<number>(DEFAULT_RATE_FALLBACK);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usingMock, setUsingMock] = useState(false);

  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);

  const loadRates = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await endpoints.admin.exchangeRates.list();
      const items = res.data.rates.map(fromApiExchangeRate);
      setRates(items);
      setCurrentRate(res.data.current_rate ?? DEFAULT_RATE_FALLBACK);
      setUsingMock(false);
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404 || status === 500 || status === undefined) {
        // BE chưa có endpoint → mock list để demo UI
        setUsingMock(true);
        setRates([
          {
            id: "mock-current",
            rateVndPerRmb: 3700,
            effectiveFrom: "2025-01-01",
            effectiveTo: undefined,
            note: "Mặc định legacy (hard-code 3700)",
            createdAt: new Date().toISOString(),
          },
        ]);
        setCurrentRate(DEFAULT_RATE_FALLBACK);
      } else {
        setError("Không tải được danh sách tỷ giá");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRates();
  }, []);

  const handleSubmit = async () => {
    const rateNum = parseInt(form.rate.replace(/\D/g, ""), 10);
    if (!rateNum || rateNum <= 0) {
      alert("Tỷ giá phải lớn hơn 0");
      return;
    }
    if (!form.effectiveFrom) {
      alert("Vui lòng chọn ngày áp dụng");
      return;
    }
    if (usingMock) {
      alert(
        "BE chưa sẵn sàng (mock data). Đợi Đức triển khai endpoint /admin/exchange-rates để lưu được."
      );
      return;
    }
    setSubmitting(true);
    try {
      await endpoints.admin.exchangeRates.create({
        rate_vnd_per_rmb: rateNum,
        effective_from: form.effectiveFrom,
        note: form.note.trim() || undefined,
      });
      setForm(INITIAL_FORM);
      await loadRates();
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data
        ?.detail;
      alert(detail || "Không lưu được tỷ giá");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (rate: ExchangeRateItem) => {
    if (!confirm(`Xóa tỷ giá ${formatVnd(rate.rateVndPerRmb)} VND/RMB (từ ${formatDate(rate.effectiveFrom)})?`)) {
      return;
    }
    if (usingMock) {
      alert("BE chưa sẵn sàng (mock data).");
      return;
    }
    try {
      await endpoints.admin.exchangeRates.remove(rate.id);
      await loadRates();
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data
        ?.detail;
      alert(detail || "Không xóa được");
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-gmv-md border border-gmv-border bg-gmv-canvas p-4 shadow-gmv-1">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold text-gmv-text-strong">Cấu hình tỷ giá GMV</h2>
            <p className="mt-1 text-xs text-gmv-muted">
              Tỷ giá quy đổi <strong>VND → RMB</strong> dùng cho cột GMV trong Sổ doanh thu và các báo cáo.
              Mỗi thay đổi áp dụng từ ngày được chọn về sau — các đợt cũ vẫn giữ nguyên tỷ giá lịch sử.
            </p>
          </div>
          <div className="shrink-0 rounded-gmv-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-right">
            <div className="text-[10px] uppercase tracking-wide text-emerald-700">Tỷ giá hiện hành</div>
            <div className="text-lg font-bold text-emerald-700">{formatVnd(currentRate)} VND</div>
            <div className="text-[10px] text-emerald-700">= 1 RMB</div>
          </div>
        </div>
        {usingMock && (
          <div className="mt-3 rounded-gmv-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            ⚠ BE chưa có endpoint <code>/admin/exchange-rates</code>. UI hiện chạy với mock data —
            đợi Đức triển khai để lưu được tỷ giá mới.
          </div>
        )}
      </div>

      <div className="rounded-gmv-md border border-gmv-border bg-gmv-canvas p-4 shadow-gmv-1">
        <h3 className="text-sm font-semibold text-gmv-text-strong">Thêm tỷ giá mới</h3>
        <p className="mt-1 text-xs text-gmv-muted">
          VD: thay đổi tỷ giá từ ngày 01/07/2026 → các dòng Pay Time từ 01/07 trở đi sẽ dùng tỷ giá mới.
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-[160px_180px_1fr_auto]">
          <div className="field">
            <label className="text-xs font-medium text-gmv-text">Tỷ giá VND/RMB *</label>
            <input
              inputMode="numeric"
              placeholder="VD: 3800"
              value={form.rate ? Number(form.rate).toLocaleString("vi-VN") : ""}
              onChange={(e) => setForm((f) => ({ ...f, rate: e.target.value.replace(/\D/g, "") }))}
              className="mt-1 w-full rounded-gmv-md border border-gmv-border bg-gmv-canvas px-2.5 py-1.5 text-sm"
            />
          </div>
          <div className="field">
            <label className="text-xs font-medium text-gmv-text">Áp dụng từ ngày *</label>
            <input
              type="date"
              value={form.effectiveFrom}
              onChange={(e) => setForm((f) => ({ ...f, effectiveFrom: e.target.value }))}
              className="mt-1 w-full rounded-gmv-md border border-gmv-border bg-gmv-canvas px-2.5 py-1.5 text-sm"
            />
          </div>
          <div className="field">
            <label className="text-xs font-medium text-gmv-text">Ghi chú (không bắt buộc)</label>
            <input
              type="text"
              placeholder="VD: Cập nhật theo tỷ giá NHNN tháng 7"
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              className="mt-1 w-full rounded-gmv-md border border-gmv-border bg-gmv-canvas px-2.5 py-1.5 text-sm"
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              disabled={submitting || !form.rate || !form.effectiveFrom}
              onClick={() => void handleSubmit()}
              className="min-h-[36px] rounded-gmv-md bg-gmv-primary px-4 py-1.5 text-sm font-medium text-white shadow-gmv-1 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Đang lưu..." : "Lưu tỷ giá mới"}
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-gmv-md border border-gmv-border bg-gmv-canvas shadow-gmv-1">
        <div className="border-b border-gmv-border px-4 py-3">
          <h3 className="text-sm font-semibold text-gmv-text-strong">Lịch sử tỷ giá</h3>
        </div>
        {error && (
          <div className="px-4 py-3 text-sm text-rose-700">{error}</div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gmv-bg text-xs uppercase text-gmv-muted">
              <tr>
                <th className="px-4 py-2 text-left">Tỷ giá VND/RMB</th>
                <th className="px-4 py-2 text-left">Áp dụng từ</th>
                <th className="px-4 py-2 text-left">Đến</th>
                <th className="px-4 py-2 text-left">Ghi chú</th>
                <th className="px-4 py-2 text-left">Người tạo</th>
                <th className="px-4 py-2 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gmv-border">
              {loading && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-gmv-muted">Đang tải...</td></tr>
              )}
              {!loading && rates.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-gmv-muted">Chưa có tỷ giá nào</td></tr>
              )}
              {rates.map((r) => {
                const isCurrent = !r.effectiveTo;
                return (
                  <tr key={r.id} className={isCurrent ? "bg-emerald-50/40" : ""}>
                    <td className="px-4 py-2 font-medium">
                      {formatVnd(r.rateVndPerRmb)}
                      {isCurrent && (
                        <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                          Hiện hành
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2">{formatDate(r.effectiveFrom)}</td>
                    <td className="px-4 py-2 text-gmv-muted">{r.effectiveTo ? formatDate(r.effectiveTo) : "—"}</td>
                    <td className="px-4 py-2 text-gmv-muted">{r.note || "—"}</td>
                    <td className="px-4 py-2 text-gmv-muted">{r.createdBy || "—"}</td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => void handleDelete(r)}
                        disabled={isCurrent}
                        title={isCurrent ? "Không thể xóa tỷ giá hiện hành" : "Xóa"}
                        className="text-xs text-rose-600 hover:underline disabled:cursor-not-allowed disabled:text-gmv-muted"
                      >
                        Xóa
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
