import { useCallback, useEffect, useState } from "react";
import { endpoints } from "../../lib/api";
import { formatApiError } from "../../lib/apiErrors";
import { useTeamScope } from "../../hooks/useTeamScope";
import useIsMobile from "../../hooks/useIsMobile";
import {
  CASH_IN_GROUP_LABELS,
  CASH_IN_TAXONOMY,
  mapCashInReport,
  type CashInReport,
  type CashInRow,
} from "../../types/cashIn";
import Button from "../ui/Button";
import Badge from "../ui/Badge";
import { Input } from "../ui/Input";
import { Table, TableScrollWrap, Td, Th, Tr, stickyThead } from "../ui/Table";
import { cn } from "../../lib/cn";
import BC04CashInRowCards from "./BC04CashInRowCards";
import { downloadCashInXlsx } from "../../utils/cashInXlsxExport";

function fmtVnd(n: number): string {
  return new Intl.NumberFormat("vi-VN").format(Math.round(n));
}

function fmtRmb(n: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function monthStartIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const GROUP_BADGE_TONE: Record<CashInRow["group"], "primary" | "ok" | "warn" | "neutral"> = {
  khach_tra: "primary",
  the: "ok",
  the_gop: "ok",
  rut_tiktok: "warn",
  khac: "neutral",
};

export default function BC04CashInReport() {
  const { teamFilters, defaultTeam, isRestricted } = useTeamScope();
  const isMobile = useIsMobile();
  const [data, setData] = useState<CashInReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [from, setFrom] = useState(todayIso());
  const [to, setTo] = useState(todayIso());
  const [team, setTeam] = useState(defaultTeam);
  const [openingBalance, setOpeningBalance] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await endpoints.reports.cashIn({
        from,
        to,
        opening_balance: Number(openingBalance) || 0,
        team: team || undefined,
      });
      setData(mapCashInReport(res.data));
    } catch (err) {
      setError(formatApiError(err, "Không tải được BC04 — Dòng tiền về."));
    } finally {
      setLoading(false);
    }
  }, [from, to, team, openingBalance]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveAnnotation = useCallback(
    async (row: CashInRow, patch: { businessLine?: string; mainCat?: string; detail?: string; note?: string }) => {
      const key = `${row.source}:${row.txnId}`;
      setSavingKey(key);
      try {
        await endpoints.reports.cashInAnnotation(row.source, row.txnId, {
          business_line: patch.businessLine,
          main_cat: patch.mainCat,
          detail: patch.detail,
          note: patch.note,
        });
        setData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            rows: prev.rows.map((r) =>
              r.source === row.source && r.txnId === row.txnId
                ? {
                    ...r,
                    businessLine: patch.businessLine ?? r.businessLine,
                    mainCat: patch.mainCat ?? r.mainCat,
                    detail: patch.detail ?? r.detail,
                    note: patch.note ?? r.note,
                  }
                : r
            ),
          };
        });
      } catch (err) {
        setError(formatApiError(err, "Không lưu được phân loại."));
      } finally {
        setSavingKey(null);
      }
    },
    []
  );

  const handleClassify = useCallback(
    (row: CashInRow, taxonomyLabel: string) => {
      const opt = CASH_IN_TAXONOMY.find((o) => o.label === taxonomyLabel);
      if (!opt) return;
      saveAnnotation(row, { businessLine: opt.businessLine, mainCat: opt.mainCat, detail: opt.detail });
    },
    [saveAnnotation]
  );

  const handleNoteBlur = useCallback(
    (row: CashInRow, note: string) => {
      if (note === (row.note ?? "")) return;
      saveAnnotation(row, { note });
    },
    [saveAnnotation]
  );

  const rows = data?.rows ?? [];

  return (
    <div className="min-w-0 space-y-4 overflow-x-hidden">
      {!isMobile && (
        <p className="text-sm text-gmv-muted">
          BC04 — thống kê mọi khoản tiền thực về TK MB Hà Nội mỗi ngày (CK khách, cọc, tiền thẻ, rút TikTok, khoản khác).
        </p>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-gmv-muted">
          Team
          <select
            className="mt-1 block min-h-10 w-full min-w-0 max-w-full rounded-gmv-md border border-gmv-border px-3 text-sm"
            value={team}
            onChange={(e) => setTeam(e.target.value)}
          >
            {teamFilters.map((t) => (
              <option key={t.value || "all"} value={t.value} disabled={isRestricted && t.value !== team}>
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
        <label className="text-sm text-gmv-muted">
          Số dư đầu kỳ (VND)
          <Input
            type="number"
            className="mt-1 w-40"
            placeholder="Nhập từ sao kê"
            value={openingBalance}
            onChange={(e) => setOpeningBalance(e.target.value)}
          />
        </label>
        <Button variant="secondary" onClick={load} disabled={loading}>
          {loading ? "Đang tải…" : "Làm mới"}
        </Button>
        <Button
          variant="primary"
          onClick={() => data && downloadCashInXlsx(data, { from, to })}
          disabled={!data || rows.length === 0}
        >
          Xuất Excel
        </Button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {data && (
        <div className="flex flex-wrap gap-4 text-sm font-medium text-gmv-text-strong">
          <span>Thu vào: {fmtVnd(data.summary.totalInput)} đ</span>
          <span>Thu RMB: ¥{fmtRmb(data.summary.totalRmb)}</span>
          <span>Số dư đầu kỳ: {fmtVnd(data.summary.openingBalance)} đ</span>
          <span>Số dư cuối kỳ: {fmtVnd(data.summary.closingBalance)} đ</span>
          <span className="text-gmv-muted">Tỷ giá: {data.summary.rate}</span>
        </div>
      )}

      {isMobile ? (
        <BC04CashInRowCards
          rows={rows}
          loading={loading}
          savingKey={savingKey}
          onClassify={handleClassify}
          onNoteBlur={handleNoteBlur}
        />
      ) : (
        <TableScrollWrap className="max-h-[min(70vh,calc(100svh-16rem))]">
          <Table className="min-w-[1400px]">
            <thead className={stickyThead}>
              <Tr>
                <Th className="min-w-[5.5rem]">Ngày</Th>
                <Th className="min-w-[8rem]">Nội dung</Th>
                <Th className="min-w-[7rem] text-right">Thu vào (VND)</Th>
                <Th className="min-w-[8rem] text-right">Số dư (VND)</Th>
                <Th className="min-w-[7rem]">Dòng nghiệp vụ</Th>
                <Th className="min-w-[6rem]">Đội</Th>
                <Th className="min-w-[10rem]">Ghi chú</Th>
                <Th className="min-w-[6rem] text-right">Thu RMB</Th>
                <Th className="min-w-[5rem]">Nguồn</Th>
              </Tr>
            </thead>
            <tbody>
              {loading && !data && (
                <Tr>
                  <Td colSpan={9} className="text-center text-gmv-muted">
                    Đang tải…
                  </Td>
                </Tr>
              )}
              {!loading && rows.length === 0 && (
                <Tr>
                  <Td colSpan={9} className="text-center text-gmv-muted">
                    Không có khoản tiền về trong khoảng ngày đã chọn.
                  </Td>
                </Tr>
              )}
              {rows.map((row) => {
                const key = `${row.source}:${row.txnId}`;
                const currentLabel =
                  CASH_IN_TAXONOMY.find((o) => o.businessLine === row.businessLine && o.mainCat === row.mainCat)
                    ?.label ?? "";
                return (
                  <Tr key={key}>
                    <Td className="whitespace-nowrap">{fmtDate(row.date)}</Td>
                    <Td>
                      <Badge tone={GROUP_BADGE_TONE[row.group]}>{CASH_IN_GROUP_LABELS[row.group]}</Badge>
                    </Td>
                    <Td className="text-right tabular-nums">{fmtVnd(row.input)}</Td>
                    <Td className="text-right tabular-nums">{fmtVnd(row.balance)}</Td>
                    <Td>
                      <select
                        className="min-h-9 w-full min-w-0 rounded-gmv-sm border border-gmv-border px-2 text-xs"
                        value={currentLabel}
                        disabled={savingKey === key}
                        onChange={(e) => handleClassify(row, e.target.value)}
                      >
                        <option value="">— Chọn phân loại —</option>
                        {CASH_IN_TAXONOMY.map((o) => (
                          <option key={o.label} value={o.label}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </Td>
                    <Td className="whitespace-nowrap text-xs">{row.team ?? "—"}</Td>
                    <Td>
                      <input
                        className="min-h-9 w-full min-w-0 rounded-gmv-sm border border-gmv-border px-2 text-xs"
                        defaultValue={row.note ?? ""}
                        disabled={savingKey === key}
                        onBlur={(e) => handleNoteBlur(row, e.target.value)}
                      />
                    </Td>
                    <Td className="text-right tabular-nums">{fmtRmb(row.rmb)}</Td>
                    <Td className={cn("whitespace-nowrap text-xs text-gmv-muted")}>{row.dataSource}</Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </TableScrollWrap>
      )}
    </div>
  );
}
