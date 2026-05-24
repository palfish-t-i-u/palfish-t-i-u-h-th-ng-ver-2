import { useCallback, useEffect, useState } from "react";
import { endpoints } from "../../lib/api";
import type { RevenueKeyDataResponse } from "../../types/revenue";
import Button from "../ui/Button";
import { Input } from "../ui/Input";
import { Table, TableWrap, Td, Th, Tr } from "../ui/Table";

function fmtRmb(n: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);
}

function monthStartIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export default function BC02KeyDataReport() {
  const [data, setData] = useState<RevenueKeyDataResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [from, setFrom] = useState(monthStartIso());
  const [to, setTo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await endpoints.revenue.pivotKeyData({
        from: from || undefined,
        to: to || undefined,
      });
      setData(res.data);
    } catch {
      setError("Không tải được BC02 Key Data.");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const months = data?.months ?? [];

  return (
    <div className="space-y-4">
      <p className="text-sm text-gmv-muted">
        BC02 — GMV (RMB) theo loại nguồn × tháng (ngày tiền về). Dữ liệu từ{" "}
        <strong>Sổ doanh thu</strong>; chỉ xem.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-gmv-muted">
          Từ ngày
          <Input type="date" className="mt-1" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="text-sm text-gmv-muted">
          Đến ngày
          <Input type="date" className="mt-1" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <Button variant="secondary" onClick={load} disabled={loading}>
          {loading ? "Đang tải…" : "Làm mới"}
        </Button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {data && (
        <p className="text-sm font-medium text-gmv-text-strong">
          Tổng GMV (RMB): {fmtRmb(data.grandTotal)}
        </p>
      )}

      <TableWrap>
        <Table>
          <thead>
            <Tr>
              <Th className="sticky left-0 z-20 min-w-[10rem] bg-gmv-table-head text-left">Loại</Th>
              {months.map((m) => (
                <Th key={m} className="min-w-[5.5rem] text-right">
                  {m}
                </Th>
              ))}
              <Th className="min-w-[5.5rem] text-right">Tổng GMV</Th>
            </Tr>
          </thead>
          <tbody>
            {loading && !data && (
              <Tr>
                <Td colSpan={months.length + 2} className="text-center text-gmv-muted">
                  Đang tải…
                </Td>
              </Tr>
            )}
            {!loading && data && months.length > 0 && (
              <Tr className="bg-amber-100 font-semibold">
                <Td className="sticky left-0 bg-amber-100 text-left">Tổng cộng</Td>
                {months.map((m) => (
                  <Td key={m} className="text-right">
                    {fmtRmb(data.grandTotalRow[m] ?? 0)}
                  </Td>
                ))}
                <Td className="text-right">{fmtRmb(data.grandTotal)}</Td>
              </Tr>
            )}
            {!loading && data && data.grandTotal === 0 && (
              <Tr>
                <Td colSpan={Math.max(months.length + 2, 2)} className="text-center text-gmv-muted">
                  Chưa có dữ liệu trong khoảng ngày đã chọn.
                </Td>
              </Tr>
            )}
            {data?.types.map((row) =>
              data.grandTotal === 0 ? null : (
                <Tr key={row.typeLabel}>
                  <Td className="sticky left-0 bg-gmv-canvas text-left font-medium">{row.typeLabel}</Td>
                  {months.map((m) => (
                    <Td key={m} className="text-right">
                      {fmtRmb(row.cells[m] ?? 0)}
                    </Td>
                  ))}
                  <Td className="text-right font-medium">{fmtRmb(row.total)}</Td>
                </Tr>
              )
            )}
          </tbody>
        </Table>
      </TableWrap>
    </div>
  );
}
