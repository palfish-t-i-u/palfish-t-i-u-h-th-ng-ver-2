import { Fragment, useCallback, useEffect, useState } from "react";
import { endpoints } from "../../lib/api";
import type { RevenueKeyDataResponse } from "../../types/revenue";
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
  stickyTableHeadSecondRow,
  stickyTableHeadTop,
} from "../ui/Table";
import { cn } from "../../lib/cn";

function fmtRmb(n: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);
}

function fmtInt(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n);
}

function fmtDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function monthStartIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

const stickyDateHead = cn(
  stickyTableHead,
  stickyTableHeadTop,
  stickyTableHeadCorner,
  "left-0 min-w-[6.5rem] text-left"
);
const stickyDateCell = "sticky left-0 z-20 bg-gmv-canvas text-left font-medium";

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

export default function BC02KeyDataReport() {
  const [data, setData] = useState<RevenueKeyDataResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [from, setFrom] = useState(monthStartIso());
  const [to, setTo] = useState("");
  const [team, setTeam] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await endpoints.revenue.pivotKeyData({
        from: from || undefined,
        to: to || undefined,
        team: team || undefined,
      });
      setData(res.data);
    } catch {
      setError("Không tải được BC02 Key Data.");
    } finally {
      setLoading(false);
    }
  }, [from, to, team]);

  useEffect(() => {
    load();
  }, [load]);

  const groups = data?.columnGroups ?? [];
  const colSpan = 3 + groups.length * 2;

  return (
    <div className="min-w-0 space-y-4 overflow-x-hidden">
      <p className="text-sm text-gmv-muted">
        BC02 — GMV theo ngày và loại nguồn (tab GMV sheet Hiếu).
        Team lọc theo cột <strong>TEAM</strong> trên SM Hanoi (cột AH) — khớp COUNTIFS tab GMV, không theo roster sale hiện tại.
        {data?.scopeLabel && (
          <>
            {" "}
            Phạm vi: <strong>{data.scopeLabel}</strong>
          </>
        )}
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-gmv-muted">
          Team
          <select
            className="mt-1 block min-h-10 rounded-gmv-md border border-gmv-border px-3 text-sm"
            value={team}
            onChange={(e) => setTeam(e.target.value)}
          >
            {TEAM_FILTERS.map((t) => (
              <option key={t.value || "all"} value={t.value}>
                {t.label}
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
          Tổng GMV (RMB): {fmtRmb(data.grandTotal.totalGmv)} · {fmtInt(data.grandTotal.totalOrders)} đơn
        </p>
      )}

      <TableScrollWrap className="max-h-[min(70vh,calc(100svh-16rem))]">
        <Table className="min-w-[1200px]">
          <thead>
            <Tr>
              <Th rowSpan={2} className={stickyDateHead}>
                Ngày
              </Th>
              <Th rowSpan={2} className={cn(stickyTableHead, stickyTableHeadTop, "min-w-[4rem] text-right")}>
                Tổng đơn
              </Th>
              <Th rowSpan={2} className={cn(stickyTableHead, stickyTableHeadTop, "min-w-[6rem] text-right")}>
                Tổng GMV (¥)
              </Th>
              {groups.map((g) => (
                <Th
                  key={g.key}
                  colSpan={2}
                  className={cn(stickyTableHead, stickyTableHeadTop, "border-l border-gmv-border text-center")}
                >
                  {g.label}
                </Th>
              ))}
            </Tr>
            <Tr>
              {groups.map((g) => (
                <Fragment key={g.key}>
                  <Th
                    className={cn(
                      stickyTableHeadSecondRow,
                      "min-w-[4rem] border-l border-gmv-border text-right text-[10px]"
                    )}
                  >
                    {g.countLabel}
                  </Th>
                  <Th
                    className={cn(
                      stickyTableHeadSecondRow,
                      "min-w-[5rem] text-right text-[10px]"
                    )}
                  >
                    {g.gmvLabel}
                  </Th>
                </Fragment>
              ))}
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
            {!loading && data && data.rows.length > 0 && (
              <Tr className="bg-amber-100 font-semibold">
                <Td className={cn(stickyDateCell, "bg-amber-100")}>Tổng cộng</Td>
                <Td className="text-right tabular-nums">{fmtInt(data.grandTotal.totalOrders)}</Td>
                <Td className="text-right tabular-nums">{fmtRmb(data.grandTotal.totalGmv)}</Td>
                {groups.map((g) => {
                  const cell = data.grandTotal.categories[g.key] ?? { count: 0, gmv: 0 };
                  return (
                    <Fragment key={g.key}>
                      <Td className="border-l border-gmv-border text-right tabular-nums">
                        {fmtInt(cell.count)}
                      </Td>
                      <Td className="text-right tabular-nums">{fmtRmb(cell.gmv)}</Td>
                    </Fragment>
                  );
                })}
              </Tr>
            )}
            {!loading && data && data.rows.length === 0 && (
              <Tr>
                <Td colSpan={colSpan} className="text-center text-gmv-muted">
                  Chưa có dữ liệu trong khoảng ngày đã chọn.
                </Td>
              </Tr>
            )}
            {data?.rows.map((row) => (
              <Tr key={row.date}>
                <Td className={stickyDateCell}>{fmtDate(row.date)}</Td>
                <Td className="text-right tabular-nums">{fmtInt(row.totalOrders)}</Td>
                <Td className="text-right tabular-nums">{fmtRmb(row.totalGmv)}</Td>
                {groups.map((g) => {
                  const cell = row.categories[g.key] ?? { count: 0, gmv: 0 };
                  return (
                    <Fragment key={g.key}>
                      <Td className="border-l border-gmv-border text-right tabular-nums">
                        {cell.count ? fmtInt(cell.count) : "—"}
                      </Td>
                      <Td className="text-right tabular-nums">{cell.gmv ? fmtRmb(cell.gmv) : "—"}</Td>
                    </Fragment>
                  );
                })}
              </Tr>
            ))}
          </tbody>
        </Table>
      </TableScrollWrap>
    </div>
  );
}
