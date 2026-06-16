import { useEffect, useMemo, useState } from "react";
import { endpoints } from "../../lib/api";
import {
  fromApiExchangeRate,
  type ExchangeRateItem,
} from "../../types/exchangeRate";

const DEFAULT_RATE_FALLBACK = 3700;

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

// Row "current" = effective_from <= today gần nhất. BE không có effective_to.
function findCurrentIndex(sortedDesc: ExchangeRateItem[]): number {
  const today = new Date().toISOString().slice(0, 10);
  return sortedDesc.findIndex((r) => r.effectiveFrom <= today);
}

export default function ExchangeRatesPanel() {
  const [rates, setRates] = useState<ExchangeRateItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usingMock, setUsingMock] = useState(false);

  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);

  const currentIndex = useMemo(() => findCurrentIndex(rates), [rates]);
  const currentRate = currentIndex >= 0 ? rates[currentIndex].rate : DEFAULT_RATE_FALLBACK;

  const loadRates = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await endpoints.exchangeRates.list();
      // BE đã order effective_from DESC.
      const items = (res.data.rates || []).map(fromApiExchangeRate);
      setRates(items);
      setUsingMock(false);
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404 || status === 500 || status === undefined) {
        setUsingMock(true);
        setRates([
          {
            id: "mock-2020-01-01",
            rate: 3700,
            effectiveFrom: "2020-01-01",
            note: "Mặc định legacy (mock — BE chưa sẵn sàng)",
            createdAt: new Date().toISOString(),
          },
        ]);
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
      alert("BE chưa sẵn sàng. Deploy commit mới của Đức rồi thử lại.");
      return;
    }
    // Nếu đã có row trùng ngày → BE upsert sẽ ghi đè. Cảnh báo trước.
    const exists = rates.find((r) => r.effectiveFrom === form.effectiveFrom);
    if (exists && !confirm(
      `Đã có tỷ giá ${formatVnd(exists.rate)} VND áp dụng từ ${formatDate(exists.effectiveFrom)}.\n` +
      `Lưu mới sẽ ghi đè (upsert theo effective_from). Tiếp tục?`
    )) {
      return;
    }
    setSubmitting(true);
    try {
      await endpoints.exchangeRates.upsert({
        rate: rateNum,
        effective_from: form.effectiveFrom,
        note: form.note.trim() || undefined,
      });
      setForm(INITIAL_FORM);
      await loadRates();
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data
        ?.detail;
      alert(typeof detail === "string" ? detail : "Không lưu được tỷ giá");
    } finally {
      setSubmitting(false);
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
            ⚠ BE chưa trả dữ liệu (có thể chưa deploy commit mới). UI đang hiển thị mock.
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
          <p className="mt-0.5 text-[11px] text-gmv-muted">
            BE chưa hỗ trợ sửa/xoá tỷ giá đã lưu. Cần điều chỉnh thì thêm tỷ giá mới cùng ngày để ghi đè (upsert).
          </p>
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
                <th className="px-4 py-2 text-left">Ghi chú</th>
                <th className="px-4 py-2 text-left">Người tạo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gmv-border">
              {loading && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-gmv-muted">Đang tải...</td></tr>
              )}
              {!loading && rates.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-gmv-muted">Chưa có tỷ giá nào</td></tr>
              )}
              {rates.map((r, idx) => {
                const isCurrent = idx === currentIndex;
                return (
                  <tr key={r.id} className={isCurrent ? "bg-emerald-50/40" : ""}>
                    <td className="px-4 py-2 font-medium">
                      {formatVnd(r.rate)}
                      {isCurrent && (
                        <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                          Hiện hành
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2">{formatDate(r.effectiveFrom)}</td>
                    <td className="px-4 py-2 text-gmv-muted">{r.note || "—"}</td>
                    <td className="px-4 py-2 text-gmv-muted">{r.createdBy || "—"}</td>
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
