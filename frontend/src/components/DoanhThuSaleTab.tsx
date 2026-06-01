import { Fragment, useCallback, useEffect, useState } from "react";
import { endpoints } from "../lib/api";
import { useRefetchOnFocus } from "../hooks/useRefetchOnFocus";
import { useRealtimeTable } from "../hooks/useRealtimeTable";
import type { RevenuePivotResponse } from "../types/revenue";
import Button from "./ui/Button";
import { Input } from "./ui/Input";
import { Table, TableWrap, Td, Th, Tr } from "./ui/Table";

function fmtRmb(n: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);
}

function monthStartIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export default function DoanhThuSaleTab() {
  const [data, setData] = useState<RevenuePivotResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [from, setFrom] = useState(monthStartIso());
  const [to, setTo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await endpoints.revenue.pivot({
        from: from || undefined,
        to: to || undefined,
      });
      setData(res.data);
    } catch {
      setError("Không tải được Sales Performance.");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  useRealtimeTable(["so_doanh_thu"], load);
  useRefetchOnFocus(load);

  const months = data?.months ?? [];

  return (
    <div className="space-y-4">
      <p className="text-sm text-gmv-muted">
        Bảng tự cộng từ <strong>Sổ doanh thu</strong> — GMV (RMB) theo team × sale × tháng (ngày tiền về). Chỉ xem; sửa số ở tab Sổ.
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
              <Th className="sticky left-0 z-20 bg-gmv-table-head">Team</Th>
              <Th className="sticky left-24 z-20 min-w-[10rem] bg-gmv-table-head">Sale</Th>
              {months.map((m) => (
                <Th key={m} className="min-w-[5.5rem] text-right">{m}</Th>
              ))}
              <Th className="min-w-[5.5rem] text-right">Tổng GMV</Th>
            </Tr>
          </thead>
          <tbody>
            {!data?.teams.length && !loading && (
              <Tr>
                <Td colSpan={months.length + 3} className="text-center text-gmv-muted">
                  Chưa có dữ liệu trong khoảng ngày đã chọn.
                </Td>
              </Tr>
            )}
            {data?.teams.map((team) => (
              <Fragment key={team.teamLabel}>
                <Tr key={`${team.teamLabel}-total`} className="bg-gmv-primary-soft/40 font-semibold">
                  <Td className="sticky left-0 bg-gmv-primary-soft/90">{team.teamLabel}</Td>
                  <Td className="sticky left-24 bg-gmv-primary-soft/90">Tổng</Td>
                  {months.map((m) => (
                    <Td key={m} className="text-right">{fmtRmb(team.totalRow[m] ?? 0)}</Td>
                  ))}
                  <Td className="text-right">{fmtRmb(team.totalRowSum)}</Td>
                </Tr>
                {team.sales.map((sale) => (
                  <Tr key={`${team.teamLabel}-${sale.sale}`}>
                    <Td className="sticky left-0 bg-gmv-canvas">{team.teamLabel}</Td>
                    <Td className="sticky left-24 bg-gmv-canvas">{sale.sale}</Td>
                    {months.map((m) => (
                      <Td key={m} className="text-right">{fmtRmb(sale.cells[m] ?? 0)}</Td>
                    ))}
                    <Td className="text-right font-medium">{fmtRmb(sale.total)}</Td>
                  </Tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </Table>
      </TableWrap>
    </div>
  );
}
