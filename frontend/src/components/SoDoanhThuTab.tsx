import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { endpoints } from "../lib/api";
import { formatApiError } from "../lib/apiErrors";
import { useRefetchOnFocus } from "../hooks/useRefetchOnFocus";
import { useRealtimeTable } from "../hooks/useRealtimeTable";
import { cn } from "../lib/cn";
import { formatVndNumber } from "../lib/vndFormat";
import useIsMobile from "../hooks/useIsMobile";
import LedgerRowCards from "./LedgerRowCards";
import { fmtPayTime, orderIdDisplay } from "../lib/ledgerFormat";
import {
  ledgerPillBase,
  paymentMethodCellClass,
  typeCellClass,
  typeDisplayLabel,
} from "../lib/ledgerCellStyle";
import { LEDGER_VND_RMB_RATE } from "../lib/loaiLabel";
import { LEDGER_CHANGED } from "../lib/ledgerEvents";
import type { LedgerPatchPayload, LedgerSummaryResponse, RevenueLedgerRow } from "../types/revenue";
import LedgerFormModal, {
  emptyLedgerForm,
  type LedgerFormState,
} from "./LedgerFormModal";
import LedgerSummaryCards from "./LedgerSummaryCards";
import { usePermission } from "../hooks/usePermission";
import { useMe } from "../hooks/useMe";
import { useColumnVisibility } from "../hooks/useColumnVisibility";
import Button from "./ui/Button";
import Badge from "./ui/Badge";
import Tooltip from "./ui/Tooltip";
import { Input } from "./ui/Input";
import Modal from "./ui/Modal";
import ColumnVisibilityMenu from "./ui/ColumnVisibilityMenu";
import ExchangeRatesPanel from "./admin/ExchangeRatesPanel";
import { HdsdLink } from "./help/HdsdLink";
import {
  Table,
  TableScrollWrap,
  Td,
  Th,
  Tr,
  stickyTableHead,
  stickyTableHeadTop,
} from "./ui/Table";

const PAGE_SIZE = 60;

const LEDGER_TEAM_OPTIONS = [
  { value: "", label: "Tất cả teams" },
  { value: "Inhouse 1", label: "Inhouse 1 (GMV In-house)" },
  { value: "Inhouse 2", label: "Inhouse 2" },
  { value: "HCM (Online)", label: "HCM (Online)" },
  { value: "Linh Dam (Store)", label: "Linh Dam (Store)" },
  { value: "An Binh (Store)", label: "An Binh (Store)" },
  { value: "Offline", label: "Offline" },
] as const;

const GSHEET_SYNC_TOOLTIP = (
  <>
    <p className="font-semibold text-gmv-text-strong">
      Sync Data từ sheet All File Thu Hiền vào Sổ doanh thu
    </p>
    <p className="mt-1.5 text-gmv-muted">
      Tải tab SM Hanoi + HCM REV từ Google Sheet và thêm dòng mới vào Sổ (có check trùng — không
      xóa/sửa dòng cũ).
    </p>
    <p className="mt-1.5 text-amber-800">
      Thời gian ước lượng: 5–15 phút nếu lần đầu sync dữ liệu hoặc còn nhiều dòng mới (~14.000
      dòng); 2–5 phút nếu trước đó đã sync phần lớn. Không đóng tab trong lúc chờ.
    </p>
  </>
);

const GSHEET_SYNC_CONFIRM =
  "Sync dữ liệu từ Google Sheet «All File Thu Hiền» (tab SM Hanoi + HCM REV)?\n\n" +
  "• Chỉ thêm dòng mới — không xóa/sửa dòng đã có\n" +
  "• Lần đầu hoặc nhiều dòng mới: khoảng 5–15 phút (~14.000 dòng)\n" +
  "• Lần sau (đã sync phần lớn): khoảng 2–5 phút\n\n" +
  "Không đóng tab và không bấm lại nút trong lúc chờ.";

function rowToForm(row: RevenueLedgerRow): LedgerFormState {
  return {
    ngayTienVe: row.ngayTienVe,
    tenKhach: row.tenKhach,
    sdt: row.sdt,
    uid: row.uid,
    goiHoc: row.goiHoc,
    soTienVnd: row.soTienVnd,
    gmvRmb: row.gmvRmb,
    saleCrmName: row.saleCrmName,
    team: row.team,
    loai: row.loai,
    loai2: row.loai2,
    note: row.note,
    note2: row.note2,
    paymentMethod: row.paymentMethod,
  };
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function filterParams(from: string, to: string, loaiFilter: string, teamFilter: string, search?: string) {
  return {
    from: from || undefined,
    to: to || undefined,
    loai_nhap: loaiFilter || undefined,
    team: teamFilter || undefined,
    search: search || undefined,
  };
}

export type LedgerCellCtx = {
  deletingId: string | null;
  openEdit: (row: RevenueLedgerRow) => void;
  handleDelete: (row: RevenueLedgerRow) => void;
};

export type LedgerColumnDef = {
  key: string;
  label: string;
  thClass?: string;
  hideable: boolean;
  renderTd: (row: RevenueLedgerRow, ctx: LedgerCellCtx) => ReactNode;
};

// Nguồn sự thật duy nhất cho cột: header + body + colSpan đều derive từ đây.
export const LEDGER_COLUMNS: readonly LedgerColumnDef[] = [
  {
    key: "userName",
    label: "User Name",
    thClass: "min-w-[9rem]",
    hideable: false,
    renderTd: (row) => (
      <Td className="text-left">
        <div className="font-medium text-gmv-text-strong">{row.tenKhach || "—"}</div>
        <Badge tone={row.loaiNhap === "tu_dong" ? "primary" : "neutral"} className="mt-1">
          {row.loaiNhap === "tu_dong" ? "M3" : "Tay"}
        </Badge>
      </Td>
    ),
  },
  {
    key: "phone",
    label: "Phone",
    hideable: true,
    renderTd: (row) => <Td className="text-left text-sm">{row.sdt || "—"}</Td>,
  },
  {
    key: "uid",
    label: "UID",
    hideable: true,
    renderTd: (row) => <Td className="text-left text-sm">{row.uid || "—"}</Td>,
  },
  {
    key: "payTime",
    label: "Pay Time",
    hideable: true,
    renderTd: (row) => (
      <Td className="whitespace-nowrap text-sm">{fmtPayTime(row.payTime || row.ngayTienVe)}</Td>
    ),
  },
  {
    key: "realPay",
    label: "Real Pay (VND)",
    thClass: "min-w-[9.5rem]",
    hideable: true,
    renderTd: (row) => (
      <Td className="min-w-[9.5rem] px-3 text-right text-sm font-medium tabular-nums">
        <span className="inline-block max-w-full break-all leading-snug">
          {formatVndNumber(row.soTienVnd) || "—"}
        </span>
      </Td>
    ),
  },
  {
    key: "infoCode",
    label: "Nội dung CK",
    thClass: "min-w-[10rem]",
    hideable: true,
    renderTd: (row) => <Td className="text-left text-xs font-mono">{row.infoCode || "—"}</Td>,
  },
  {
    key: "orderId",
    label: "ID đơn hàng",
    thClass: "min-w-[7rem]",
    hideable: true,
    renderTd: (row) => <Td className="text-left text-sm font-mono">{orderIdDisplay(row)}</Td>,
  },
  {
    key: "paymentMethod",
    label: "Payment method",
    hideable: true,
    renderTd: (row) => (
      <Td className="text-center">
        {row.paymentMethod ? (
          <span
            className={cn(ledgerPillBase, paymentMethodCellClass(row.paymentMethod))}
            title={row.paymentMethod}
          >
            {row.paymentMethod}
          </span>
        ) : (
          "—"
        )}
      </Td>
    ),
  },
  {
    key: "type",
    label: "Type",
    hideable: true,
    renderTd: (row) => (
      <Td className="text-center">
        {typeDisplayLabel(row.loai, row.loai2) !== "—" ? (
          <span
            className={cn(ledgerPillBase, typeCellClass(row.loai, row.loai2))}
            title={typeDisplayLabel(row.loai, row.loai2)}
          >
            {typeDisplayLabel(row.loai, row.loai2)}
          </span>
        ) : (
          "—"
        )}
      </Td>
    ),
  },
  {
    key: "sales",
    label: "Sales",
    hideable: true,
    renderTd: (row) => <Td className="text-left text-sm">{row.saleCrmName || "—"}</Td>,
  },
  {
    key: "team",
    label: "Team",
    hideable: true,
    renderTd: (row) => <Td className="text-left text-sm">{row.team || "—"}</Td>,
  },
  {
    key: "actions",
    label: "Thao tác",
    thClass: "min-w-[9rem]",
    hideable: true,
    renderTd: (row, ctx) => (
      <Td>
        <div className="flex flex-wrap justify-center gap-1.5">
          <Button type="button" size="sm" variant="ghost" onClick={() => ctx.openEdit(row)}>
            Chỉnh sửa
          </Button>
          {row.loaiNhap === "tay" && (
            <Button
              type="button"
              size="sm"
              variant="danger"
              disabled={ctx.deletingId === row.id}
              onClick={() => ctx.handleDelete(row)}
            >
              {ctx.deletingId === row.id ? "…" : "Xóa"}
            </Button>
          )}
        </div>
      </Td>
    ),
  },
];

export default function SoDoanhThuTab() {
  const { readOnly } = usePermission("revenueLedger");
  const { profile } = useMe();
  // Tỷ giá là cấu hình hệ thống cấp HR/admin — không phải tất cả ai sửa được Sổ DT đều được sửa tỷ giá.
  const canConfigRate = profile?.role === "system" || profile?.department === "hr";
  const [rateModalOpen, setRateModalOpen] = useState(false);
  const [rows, setRows] = useState<RevenueLedgerRow[]>([]);
  const [summary, setSummary] = useState<LedgerSummaryResponse | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const [draftFrom, setDraftFrom] = useState("");
  const [draftTo, setDraftTo] = useState("");
  const [appliedFrom, setAppliedFrom] = useState("");
  const [appliedTo, setAppliedTo] = useState("");
  const [draftLoai, setDraftLoai] = useState("");
  const [appliedLoai, setAppliedLoai] = useState("");
  const [draftTeam, setDraftTeam] = useState("");
  const [appliedTeam, setAppliedTeam] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [modalInitial, setModalInitial] = useState<LedgerFormState>(emptyLedgerForm());
  const [editRow, setEditRow] = useState<RevenueLedgerRow | null>(null);
  const [modalSaving, setModalSaving] = useState(false);
  const [modalError, setModalError] = useState("");

  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [syncError, setSyncError] = useState("");

  const loadMoreRef = useRef<HTMLTableRowElement | null>(null);
  const loadingMoreRef = useRef(false);

  const fetchPage = useCallback(
    async (offset: number, replace: boolean) => {
      const params = {
        ...filterParams(appliedFrom, appliedTo, appliedLoai, appliedTeam, appliedSearch),
        limit: PAGE_SIZE,
        offset,
      };
      const res = await endpoints.revenue.listLedger(params);
      setTotalCount(res.data.count);
      setHasMore(res.data.hasMore);
      setRows((prev) => (replace ? res.data.rows : [...prev, ...res.data.rows]));
      return res.data;
    },
    [appliedFrom, appliedTo, appliedLoai, appliedTeam, appliedSearch]
  );

  const reloadAll = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setError("");
    try {
      const summaryParams = filterParams(appliedFrom, appliedTo, appliedLoai, appliedTeam);
      const [summaryRes] = await Promise.all([
        endpoints.revenue.ledgerSummary(summaryParams),
        fetchPage(0, true),
      ]);
      setSummary(summaryRes.data);
    } catch (err) {
      setError(formatApiError(err, "Không tải được Sổ doanh thu."));
      setRows([]);
      setSummary(null);
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [appliedFrom, appliedTo, appliedLoai, appliedTeam, appliedSearch, fetchPage]);

  useEffect(() => {
    reloadAll();
  }, [reloadAll]);

  useEffect(() => {
    const onLedgerChanged = () => {
      reloadAll();
    };
    window.addEventListener(LEDGER_CHANGED, onLedgerChanged);
    return () => window.removeEventListener(LEDGER_CHANGED, onLedgerChanged);
  }, [reloadAll]);

  useRealtimeTable(["so_doanh_thu"], reloadAll);
  useRefetchOnFocus(() => reloadAll({ silent: true }));

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMore || loading) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      await fetchPage(rows.length, false);
    } catch {
      setError("Không tải thêm được dòng.");
    } finally {
      setLoadingMore(false);
      loadingMoreRef.current = false;
    }
  }, [fetchPage, hasMore, loading, rows.length]);

  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el || !hasMore) return;
    const root = el.closest(".gmv-table-scroll");
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { root, rootMargin: "120px", threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadMore, rows.length]);

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setAppliedSearch(searchTerm.trim());
    }, 400);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [searchTerm]);

  function applyFilters() {
    const unchanged =
      draftFrom === appliedFrom &&
      draftTo === appliedTo &&
      draftLoai === appliedLoai &&
      draftTeam === appliedTeam;
    setAppliedFrom(draftFrom);
    setAppliedTo(draftTo);
    setAppliedLoai(draftLoai);
    setAppliedTeam(draftTeam);
    if (unchanged) reloadAll();
  }

  function resetFilters() {
    setDraftFrom("");
    setDraftTo("");
    setDraftLoai("");
    setDraftTeam("");
    setAppliedFrom("");
    setAppliedTo("");
    setAppliedLoai("");
    setAppliedTeam("");
    setSearchTerm("");
    setAppliedSearch("");
  }

  function setTodayFilter() {
    const t = todayIso();
    setDraftFrom(t);
    setDraftTo(t);
    setAppliedFrom(t);
    setAppliedTo(t);
  }

  const hasActiveFilter = Boolean(appliedFrom || appliedTo || appliedLoai || appliedTeam || appliedSearch);
  const draftDirty =
    draftFrom !== appliedFrom ||
    draftTo !== appliedTo ||
    draftLoai !== appliedLoai ||
    draftTeam !== appliedTeam;

  function openCreate() {
    setModalMode("create");
    setEditRow(null);
    setModalInitial(emptyLedgerForm());
    setModalError("");
    setModalOpen(true);
  }

  function openEdit(row: RevenueLedgerRow) {
    setModalMode("edit");
    setEditRow(row);
    setModalInitial(rowToForm(row));
    setModalError("");
    setModalOpen(true);
  }

  function closeModal() {
    if (modalSaving) return;
    setModalOpen(false);
    setEditRow(null);
    setModalError("");
  }

  async function handleModalSave(payload: LedgerFormState) {
    setModalSaving(true);
    setModalError("");
    setError("");
    const body: LedgerPatchPayload = {
      ngayTienVe: payload.ngayTienVe,
      tenKhach: payload.tenKhach,
      sdt: payload.sdt,
      uid: payload.uid,
      goiHoc: payload.goiHoc,
      soTienVnd: payload.soTienVnd,
      gmvRmb: payload.gmvRmb,
      paymentMethod: payload.paymentMethod,
      loai: payload.loai,
      loai2: payload.loai2,
      saleCrmName: payload.saleCrmName,
      team: payload.team,
      note: payload.note,
      note2: payload.note2,
    };
    try {
      if (modalMode === "create") {
        await endpoints.revenue.createLedger({
          ...body,
          ngayTienVe: payload.ngayTienVe,
        });
      } else if (editRow) {
        await endpoints.revenue.patchLedger(editRow.id, body);
      }
      setModalOpen(false);
      setEditRow(null);
      reloadAll();
    } catch {
      setModalError(modalMode === "create" ? "Không thêm được dòng mới." : "Lưu thất bại.");
    } finally {
      setModalSaving(false);
    }
  }

  async function handleDelete(row: RevenueLedgerRow) {
    const label = row.tenKhach || row.maDonHang || "dòng này";
    if (!window.confirm(`Xóa dòng "${label}"? Không khôi phục được.`)) return;
    setError("");
    setDeletingId(row.id);
    try {
      await endpoints.revenue.deleteLedger(row.id);
      reloadAll();
    } catch {
      setError("Không xóa được dòng.");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleSyncGsheet() {
    if (syncing) return;
    if (!window.confirm(GSHEET_SYNC_CONFIRM)) return;
    setSyncing(true);
    setSyncError("");
    setSyncMessage("");
    setError("");
    try {
      const res = await endpoints.revenue.syncGsheet();
      const { inserted, skippedExisting, skippedLoose, fetched } = res.data;
      const totalSkipped = skippedExisting + (skippedLoose || 0);
      const looseNote = skippedLoose ? ` (${skippedLoose} trùng cross-source)` : "";
      setSyncMessage(
        `Sync xong: thêm ${inserted.toLocaleString("vi-VN")} dòng mới` +
          ` (bỏ qua ${totalSkipped.toLocaleString("vi-VN")} đã có${looseNote}, đọc ${fetched.toLocaleString("vi-VN")} từ sheet).`
      );
      await reloadAll();
    } catch (err) {
      setSyncError(formatApiError(err, "Sync Google Sheet thất bại."));
    } finally {
      setSyncing(false);
    }
  }

  // readOnly: loại hẳn cột Thao tác khỏi cả header + body (fix bug lệch cột cũ).
  const baseColumns = readOnly ? LEDGER_COLUMNS.filter((c) => c.key !== "actions") : LEDGER_COLUMNS;
  const { isVisible, toggle, showAll, visibleCount } = useColumnVisibility(
    "soDoanhThu",
    baseColumns.map((c) => c.key)
  );
  const visibleColumns = baseColumns.filter((c) => isVisible(c.key));
  const cellCtx: LedgerCellCtx = { deletingId, openEdit, handleDelete };
  const isMobile = useIsMobile();

  return (
    <div className="min-w-0 space-y-4 overflow-x-hidden">
      <p className="text-xs text-gmv-muted">
        Sổ doanh thu: lọc theo <span className="font-medium text-gmv-text">Pay Time</span> (ngày tiền về PR,
        không phải ngày kích hoạt). Dòng tự động từ B3 chỉ xuất hiện sau khi{" "}
        <span className="font-medium text-gmv-text">lưu Order ID</span> — tab tự làm mới khi có thay đổi.
        Quy đổi RMB mặc định:{" "}
        <span className="font-medium text-gmv-text">
          GMV (RMB) = VND ÷ {LEDGER_VND_RMB_RATE.toLocaleString("vi-VN")}
        </span>
        .
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-gmv-muted">
          Từ ngày
          <Input
            type="date"
            className="mt-1"
            value={draftFrom}
            onChange={(e) => setDraftFrom(e.target.value)}
          />
        </label>
        <label className="text-sm text-gmv-muted">
          Đến ngày
          <Input
            type="date"
            className="mt-1"
            value={draftTo}
            onChange={(e) => setDraftTo(e.target.value)}
          />
        </label>
        <label className="text-sm text-gmv-muted">
          Nguồn dòng
          <select
            className="mt-1 block min-h-10 rounded-gmv-md border border-gmv-border px-3 text-sm"
            value={draftLoai}
            onChange={(e) => setDraftLoai(e.target.value)}
          >
            <option value="">Tất cả</option>
            <option value="tu_dong">Tự động (M3)</option>
            <option value="tay">Điền tay</option>
          </select>
        </label>
        <label className="text-sm text-gmv-muted">
          Team
          <select
            className="mt-1 block min-h-10 rounded-gmv-md border border-gmv-border px-3 text-sm"
            value={draftTeam}
            onChange={(e) => setDraftTeam(e.target.value)}
          >
            {LEDGER_TEAM_OPTIONS.map(({ value, label }) => (
              <option key={value || "all"} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <Button variant="secondary" onClick={applyFilters} disabled={loading}>
          {loading ? "Đang tải…" : "Làm mới"}
        </Button>
        <Button variant="ghost" onClick={setTodayFilter}>
          Hôm nay
        </Button>
        <Button variant="ghost" onClick={resetFilters} disabled={!hasActiveFilter && !draftDirty}>
          Reset bộ lọc
        </Button>
        {!readOnly && (
          <Tooltip content={GSHEET_SYNC_TOOLTIP} align="end" panelClassName="max-w-md">
            <Button
              variant="secondary"
              onClick={handleSyncGsheet}
              disabled={syncing || loading}
            >
              {syncing ? "Đang sync…" : "Sync Data"}
            </Button>
          </Tooltip>
        )}
        {canConfigRate && (
          <Button variant="ghost" onClick={() => setRateModalOpen(true)}>
            Cấu hình tỷ giá
          </Button>
        )}
        {!readOnly && <Button onClick={openCreate}>+ Thêm dòng</Button>}
      </div>

      <Modal
        open={rateModalOpen}
        onClose={() => setRateModalOpen(false)}
        wide
        className="max-w-4xl"
        headerExtra={<HdsdLink mode="topic" moduleSlug="revenueLedger" topicSlug="quy-doi-ty-gia" />}
      >
        <ExchangeRatesPanel />
      </Modal>

      {syncing && (
        <p className="text-xs text-gmv-primary">
          Đang tải sheet và ghi Supabase — có thể mất vài phút, vui lòng chờ…
        </p>
      )}
      {syncMessage && !syncing && (
        <p className="text-xs text-gmv-ok">{syncMessage}</p>
      )}
      {syncError && !syncing && (
        <p className="text-xs text-red-600">{syncError}</p>
      )}

      {!appliedFrom && !appliedTo && (
        <p className="text-xs text-amber-700">
          Đang xem tất cả ngày — bảng tải từng {PAGE_SIZE} dòng khi cuộn. Nên chọn khoảng ngày để nhanh hơn.
        </p>
      )}

      <LedgerSummaryCards
        summary={summary}
        from={appliedFrom}
        to={appliedTo}
        team={appliedTeam}
        loading={loading}
      />

      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* ── SEARCH BAR ── */}
      <div className="relative">
        <svg
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gmv-muted"
          fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Tìm theo tên khách, SĐT, UID, sale, mã đơn..."
          className="w-full rounded-lg border border-gmv-border bg-gmv-canvas py-2.5 pl-10 pr-10 text-sm text-gmv-text-strong placeholder:text-gmv-muted focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
        {searchTerm && (
          <button
            type="button"
            onClick={() => { setSearchTerm(""); setAppliedSearch(""); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-0.5 text-gmv-muted hover:text-gmv-text"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-gmv-muted">
          {appliedSearch
            ? totalCount > 0
              ? <>Tìm thấy {totalCount.toLocaleString("vi-VN")} dòng cho "<span className="font-medium text-gmv-text">{appliedSearch}</span>"{loadingMore && " · đang tải thêm…"}</>
              : <>Không tìm thấy dòng nào cho "<span className="font-medium text-gmv-text">{appliedSearch}</span>"</>
            : <>Hiển thị {rows.length.toLocaleString("vi-VN")} / {totalCount.toLocaleString("vi-VN")} dòng{loadingMore && " · đang tải thêm…"}</>
          }
          {visibleCount < baseColumns.length && (
            <> · {baseColumns.length - visibleCount} cột đang ẩn</>
          )}
        </p>
        {!isMobile && (
          <ColumnVisibilityMenu
            columns={baseColumns.map((c) => ({ key: c.key, label: c.label, hideable: c.hideable }))}
            isVisible={isVisible}
            onToggle={toggle}
            onShowAll={showAll}
            visibleCount={visibleCount}
          />
        )}
      </div>

      {isMobile ? (
        <LedgerRowCards
          rows={rows}
          readOnly={readOnly}
          deletingId={deletingId}
          onEdit={openEdit}
          onDelete={handleDelete}
          hasMore={hasMore}
          loadingMore={loadingMore}
          onLoadMore={loadMore}
          emptyText={
            loading
              ? "Đang tải…"
              : hasActiveFilter
                ? "Không có dòng trong khoảng đã lọc — thử Reset bộ lọc hoặc mở rộng ngày."
                : "Chưa có dòng — bấm Thêm dòng hoặc xác nhận M3."
          }
        />
      ) : (
        <TableScrollWrap>
          <Table className="min-w-[1280px]">
            <thead>
              <Tr>
                {visibleColumns.map((c) => (
                  <Th key={c.key} className={cn(stickyTableHead, stickyTableHeadTop, c.thClass)}>
                    {c.label}
                  </Th>
                ))}
              </Tr>
            </thead>
            <tbody>
              {rows.length === 0 && !loading && (
                <Tr>
                  <Td colSpan={visibleColumns.length} className="text-center text-gmv-muted">
                    {hasActiveFilter
                      ? "Không có dòng trong khoảng đã lọc — thử Reset bộ lọc hoặc mở rộng ngày."
                      : "Chưa có dòng — bấm Thêm dòng hoặc xác nhận M3."}
                  </Td>
                </Tr>
              )}
              {rows.map((row) => (
                <Tr key={row.id} className={deletingId === row.id ? "opacity-60" : ""}>
                  {visibleColumns.map((c) => (
                    <Fragment key={c.key}>{c.renderTd(row, cellCtx)}</Fragment>
                  ))}
                </Tr>
              ))}
              {hasMore && (
                <Tr ref={loadMoreRef}>
                  <Td colSpan={visibleColumns.length} className="py-3 text-center text-sm text-gmv-muted">
                    {loadingMore ? "Đang tải thêm…" : "Cuộn xuống để tải thêm"}
                  </Td>
                </Tr>
              )}
            </tbody>
          </Table>
        </TableScrollWrap>
      )}

      <LedgerFormModal
        open={modalOpen}
        mode={modalMode}
        initial={modalInitial}
        rowMeta={
          editRow
            ? {
                loaiNhap: editRow.loaiNhap,
                maDonHang: editRow.maDonHang,
                crmOrderId: editRow.crmOrderId,
              }
            : undefined
        }
        saving={modalSaving}
        error={modalError}
        onClose={closeModal}
        onSave={handleModalSave}
      />
    </div>
  );
}
