import { Fragment, useCallback, useEffect, useState } from "react";
import { endpoints } from "../../lib/api";
import type { RevenuePivotResponse } from "../../types/revenue";
import Button from "../ui/Button";
import { Input } from "../ui/Input";
import {
  Table,
  TableScrollWrap,
  Td,
  Th,
  Tr,
  stickyTableHead,
  stickyTableHeadCorner,
  stickyTableHeadTop,
} from "../ui/Table";
import { cn } from "../../lib/cn";

function fmtRmb(n: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);
}

function monthStartIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

const TEAM_FILTERS = [
  { value: "", label: "Toàn công ty" },
  { value: "Inhouse 1", label: "Inhouse 1" },
  { value: "Inhouse 2", label: "Inhouse 2" },
  { value: "HCM (Online)", label: "HCM (Online)" },
  { value: "Linh Dam (Store)", label: "Linh Dam (Store)" },
  { value: "Offline", label: "Offline" },
  { value: "An Binh (Store)", label: "An Binh (Store)" },
  { value: "Khác", label: "Khác" },
] as const;

const stickyLeftTeam = cn(stickyTableHead, stickyTableHeadTop, stickyTableHeadCorner, "left-0 min-w-[7rem]");
const stickyLeftSale = cn(
  stickyTableHead,
  stickyTableHeadTop,
  "left-[7rem] min-w-[10rem] z-[35]"
);
const stickyCellTeam = "sticky left-0 z-20 bg-gmv-canvas";
const stickyCellSale = "sticky left-[7rem] z-20 min-w-[10rem] bg-gmv-canvas";

export default function BC01SalesPerformance() {
  const [data, setData] = useState<RevenuePivotResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [from, setFrom] = useState(monthStartIso());
  const [to, setTo] = useState("");
  const [team, setTeam] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await endpoints.revenue.pivotSalesPerformance({
        from: from || undefined,
        to: to || undefined,
        team: team || undefined,
      });
      setData(res.data);
    } catch {
      setError("Không tải được BC01 Sales Performance.");
    } finally {
      setLoading(false);
    }
  }, [from, to, team]);

  useEffect(() => {
    load();
  }, [load]);

  const months = data?.months ?? [];
  const colSpan = months.length + 3;

  return (
    <div className="min-w-0 space-y-4 overflow-x-hidden">
      <p className="text-sm text-gmv-muted">
        BC01 — GMV (RMB) theo team × sale × tháng (ngày tiền về). Dữ liệu từ{" "}
        <strong>Sổ doanh thu</strong>; chỉ xem.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-gmv-muted">
          Team
          <select
            className="mt-1 block min-h-10 rounded-gmv-md border border-gmv-border px-3 text-sm"
            value={team}
            onChange={(e) => setTeam(e.target.value)}
          >
            {TEAM_FILTERS.map((opt) => (
              <option key={opt.value || "all"} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
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

      <TableScrollWrap>
        <Table className="min-w-[900px]">
          <thead>
            <Tr>
              <Th className={stickyLeftTeam}>Team</Th>
              <Th className={stickyLeftSale}>Sale</Th>
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
                <Td colSpan={colSpan} className="text-center text-gmv-muted">
                  Đang tải…
                </Td>
              </Tr>
            )}
            {!loading && data && months.length > 0 && (
              <Tr className="bg-amber-100 font-semibold">
                <Td className={cn(stickyCellTeam, "bg-amber-100")}>Tổng cộng</Td>
                <Td className={cn(stickyCellSale, "bg-amber-100")}>—</Td>
                {months.map((m) => (
                  <Td key={m} className="text-right">
                    {fmtRmb(data.grandTotalRow[m] ?? 0)}
                  </Td>
                ))}
                <Td className="text-right">{fmtRmb(data.grandTotal)}</Td>
              </Tr>
            )}
            {!data?.teams.length && !loading && (
              <Tr>
                <Td colSpan={Math.max(colSpan, 3)} className="text-center text-gmv-muted">
                  Chưa có dữ liệu trong khoảng ngày đã chọn.
                </Td>
              </Tr>
            )}
            {data?.teams.map((teamBlock) => (
              <Fragment key={teamBlock.teamLabel}>
                <Tr className="bg-gmv-primary-soft/40 font-semibold">
                  <Td className={cn(stickyCellTeam, "bg-gmv-primary-soft/90")}>{teamBlock.teamLabel}</Td>
                  <Td className={cn(stickyCellSale, "bg-gmv-primary-soft/90")}>Tổng</Td>
                  {months.map((m) => (
                    <Td key={m} className="text-right">
                      {fmtRmb(teamBlock.totalRow[m] ?? 0)}
                    </Td>
                  ))}
                  <Td className="text-right">{fmtRmb(teamBlock.totalRowSum)}</Td>
                </Tr>
                {teamBlock.sales.map((sale) => (
                  <Tr key={`${teamBlock.teamLabel}-${sale.sale}`}>
                    <Td className={stickyCellTeam}>{teamBlock.teamLabel}</Td>
                    <Td className={cn(stickyCellSale, "text-left")}>{sale.sale}</Td>
                    {months.map((m) => (
                      <Td key={m} className="text-right tabular-nums">
                        {fmtRmb(sale.cells[m] ?? 0)}
                      </Td>
                    ))}
                    <Td className="text-right font-medium tabular-nums">{fmtRmb(sale.total)}</Td>
                  </Tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </Table>
      </TableScrollWrap>
    </div>
  );
}
