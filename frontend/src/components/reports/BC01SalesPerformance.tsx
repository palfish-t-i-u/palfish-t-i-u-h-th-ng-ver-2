import { Fragment, useCallback, useEffect, useState } from "react";
import { endpoints } from "../../lib/api";
import type { RevenuePivotResponse } from "../../types/revenue";
import Button from "../ui/Button";
import { GmvDataBarCell } from "../ui/DataBar";
import { Input } from "../ui/Input";
import {
  Table,
  TableScrollWrap,
  Td,
  Th,
  Tr,
  stickyTableCellRight,
  stickyTableHead,
  stickyTableHeadCorner,
  stickyTableHeadRight,
  stickyThead,
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

const grandTotalMonthBg = "bg-gmv-bc01-grand-month text-gmv-bc01-grand-month-fg";
const grandTotalSumBg =
  "bg-gmv-bc01-grand-sum text-gmv-bc01-grand-sum-fg shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.12)]";
const teamTotalBg = "bg-sky-100";

const stickyLeftTeam = cn(stickyTableHead, stickyTableHeadCorner, "left-0 min-w-[7rem]");
const stickyLeftSale = cn(stickyTableHead, "left-[7rem] min-w-[10rem] z-[35]");
const stickyRightTotalHead = cn(stickyTableHeadRight, "right-0 min-w-[5.5rem] z-[35]");

const stickyGrandTeam = cn(
  stickyTableHead,
  stickyTableHeadCorner,
  "left-0 min-w-[7rem] z-[40]",
  grandTotalMonthBg,
  "normal-case"
);
const stickyGrandSale = cn(
  stickyTableHead,
  "left-[7rem] min-w-[10rem] z-[40]",
  grandTotalMonthBg,
  "normal-case"
);
const stickyGrandTotalHead = cn(
  stickyTableHeadRight,
  "right-0 min-w-[5.5rem] z-[40]",
  grandTotalSumBg,
  "text-right normal-case"
);
const monthTh = "min-w-[5.5rem] p-0 text-right normal-case font-semibold";

const stickyCellTeam = "sticky left-0 z-20 bg-gmv-canvas shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)]";
const stickyCellSale = cn(
  stickyCellTeam,
  "left-[7rem] min-w-[10rem] z-[20]"
);
const stickyRightTotalCell = cn(stickyTableCellRight, "right-0 min-w-[5.5rem] font-medium");

const monthTd = "p-0 align-middle";

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
  const showTeamSubtotals = (data?.teams.length ?? 0) > 1;
  const showGrandTotalHeader = !loading && !!data && months.length > 0;

  return (
    <div className="min-w-0 space-y-4 overflow-x-hidden">
      <p className="text-sm text-gmv-muted">
        BC01 — GMV (RMB) theo team × sale × tháng (cột tháng = ngày tiền về). Lọc khoảng ngày
        theo Pay Time; nguồn <strong>Sổ doanh thu</strong> (= HNxHCM GMV). Thanh xanh dưới số =
        % GMV của sale so với tổng team trong cùng tháng.
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

      <TableScrollWrap className="max-h-[min(70vh,calc(100svh-16rem))]">
        <Table className="min-w-[900px]">
          <thead className={stickyThead}>
            <Tr
              className={cn(
                "bg-gmv-table-head",
                showGrandTotalHeader && "[&>th]:border-b-0"
              )}
            >
              <Th className={stickyLeftTeam}>Team</Th>
              <Th className={stickyLeftSale}>Sale</Th>
              {months.map((m) => (
                <Th key={m} className="min-w-[5.5rem] text-right">
                  {m}
                </Th>
              ))}
              <Th className={cn(stickyRightTotalHead, "text-right")}>Tổng GMV</Th>
            </Tr>
            {showGrandTotalHeader && (
              <Tr className={cn(grandTotalMonthBg, "[&>th]:border-t-0")}>
                <Th className={cn(stickyGrandTeam, "border-t-0")}>Tổng cộng</Th>
                <Th className={cn(stickyGrandSale, "border-t-0")}>—</Th>
                {months.map((m) => (
                  <Th key={m} className={cn(monthTh, grandTotalMonthBg, "border-t-0")}>
                    <GmvDataBarCell
                      value={data.grandTotalRow[m] ?? 0}
                      columnMax={0}
                      format={fmtRmb}
                      showBar={false}
                      className={grandTotalMonthBg}
                    />
                  </Th>
                ))}
                <Th
                  className={cn(
                    stickyGrandTotalHead,
                    grandTotalSumBg,
                    "border-t-0 text-base tabular-nums font-bold"
                  )}
                >
                  {fmtRmb(data.grandTotal)}
                </Th>
              </Tr>
            )}
          </thead>
          <tbody>
            {loading && !data && (
              <Tr>
                <Td colSpan={colSpan} className="text-center text-gmv-muted">
                  Đang tải…
                </Td>
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
                {showTeamSubtotals && (
                  <Tr className={cn(teamTotalBg, "font-semibold")}>
                    <Td className={cn(stickyCellTeam, teamTotalBg)}>{teamBlock.teamLabel}</Td>
                    <Td className={cn(stickyCellSale, teamTotalBg)}>Tổng</Td>
                    {months.map((m) => (
                      <Td key={m} className={cn(monthTd, teamTotalBg)}>
                        <GmvDataBarCell
                          value={teamBlock.totalRow[m] ?? 0}
                          columnMax={0}
                          format={fmtRmb}
                          showBar={false}
                          className={teamTotalBg}
                        />
                      </Td>
                    ))}
                    <Td className={cn(stickyRightTotalCell, teamTotalBg, "text-right tabular-nums")}>
                      {fmtRmb(teamBlock.totalRowSum)}
                    </Td>
                  </Tr>
                )}
                {teamBlock.sales.map((sale) => (
                  <Tr key={`${teamBlock.teamLabel}-${sale.sale}`}>
                    <Td className={stickyCellTeam}>{teamBlock.teamLabel}</Td>
                    <Td className={cn(stickyCellSale, "text-left")}>{sale.sale}</Td>
                    {months.map((m) => (
                      <Td key={m} className={monthTd}>
                        <GmvDataBarCell
                          value={sale.cells[m] ?? 0}
                          columnMax={teamBlock.totalRow[m] ?? 0}
                          format={fmtRmb}
                        />
                      </Td>
                    ))}
                    <Td className={cn(stickyRightTotalCell, "text-right tabular-nums")}>
                      {fmtRmb(sale.total)}
                    </Td>
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
