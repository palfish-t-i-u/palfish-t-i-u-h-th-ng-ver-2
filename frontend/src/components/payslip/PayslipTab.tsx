import { useCallback, useEffect, useMemo, useState } from "react";
import { getPayslip, listPayslips } from "../../lib/api/payroll";
import { formatApiError } from "../../lib/apiErrors";
import { usePermission } from "../../hooks/usePermission";
import { useMe } from "../../hooks/useMe";
import useIsMobile from "../../hooks/useIsMobile";
import type { PayslipDetail as PayslipDetailData, PayslipListItem, PayslipStage } from "../../types/payroll";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import { Select } from "../ui/Input";
import { Table, TableScrollWrap, Td, Th, Tr, stickyTableHead, stickyTableHeadTop } from "../ui/Table";
import { RowCard, RowCardList } from "../ui/RowCard";
import Modal from "../ui/Modal";
import PayslipReauthModal, {
  isReauthValid,
  markReauthValid,
  getReauthReturn,
  clearReauthReturn,
} from "./PayslipReauthModal";
import { useAuth } from "../../hooks/useAuth";
import PayslipDetail from "./PayslipDetail";

type GroupedPayslip = {
  code: string;
  name: string | null;
  ky_luong: string;
  truoc_thue: PayslipListItem | null;
  sau_thue: PayslipListItem | null;
};

function statusBadge(item: PayslipListItem | null) {
  if (!item) return <Badge tone="neutral">—</Badge>;
  if (item.confirm_status === "confirmed") return <Badge tone="ok">Đã xác nhận</Badge>;
  if (item.review_status === "requested") return <Badge tone="warn">Yêu cầu xem lại</Badge>;
  return <Badge tone="neutral">Chờ xác nhận</Badge>;
}

function groupPayslips(items: PayslipListItem[]): GroupedPayslip[] {
  const map = new Map<string, GroupedPayslip>();
  for (const item of items) {
    const key = `${item.code}__${item.ky_luong}`;
    if (!map.has(key)) {
      map.set(key, { code: item.code, name: item.name, ky_luong: item.ky_luong, truoc_thue: null, sau_thue: null });
    }
    const g = map.get(key)!;
    if (item.stage === "truoc_thue") g.truoc_thue = item;
    else g.sau_thue = item;
  }
  return [...map.values()];
}

export default function PayslipTab() {
  const { canView, loading: permLoading } = usePermission("payslip");
  const { profile } = useMe();
  const { session, mfaListFactors } = useAuth();
  const isMobile = useIsMobile();

  const [payslips, setPayslips] = useState<PayslipListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // TOTP factor status
  const [hasTotp, setHasTotp] = useState(false);
  const [totpFactorId, setTotpFactorId] = useState<string | null>(null);

  useEffect(() => {
    void mfaListFactors().then(({ totp }) => {
      const verified = totp.find((f) => f.status === "verified");
      setHasTotp(!!verified);
      setTotpFactorId(verified?.id ?? null);
    });
  }, [mfaListFactors]);

  const [selectedKy, setSelectedKy] = useState<string>("");

  // Re-auth flow
  const [reauthOpen, setReauthOpen] = useState(false);
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const [pendingKy, setPendingKy] = useState<string | null>(null);

  // Detail modal
  const [detailItems, setDetailItems] = useState<PayslipDetailData[] | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await listPayslips();
      setPayslips(data);
    } catch (e) {
      setError(formatApiError(e, "Không tải được danh sách phiếu lương"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canView) void fetchList();
  }, [canView, fetchList]);

  // Handle return from Google re-auth redirect
  const [returnHandled, setReturnHandled] = useState(false);
  useEffect(() => {
    if (returnHandled || !session || payslips.length === 0) return;
    const marker = getReauthReturn();
    if (!marker) return;
    setReturnHandled(true);
    clearReauthReturn();
    const tokenChanged = session.access_token !== marker.prevToken;
    const emailMatch =
      (session.user?.email ?? "").toLowerCase() === marker.email.toLowerCase();
    if (tokenChanged && emailMatch) {
      markReauthValid();
      void fetchDetail(marker.code, marker.ky);
    }
  }, [session, payslips, returnHandled]); // eslint-disable-line react-hooks/exhaustive-deps

  // Derive kỳ options from all payslips
  const kyOptions = useMemo(() => {
    const set = new Set(payslips.map((p) => p.ky_luong));
    return [...set].sort((a, b) => b.localeCompare(a)); // newest first
  }, [payslips]);

  // Auto-select most recent kỳ
  useEffect(() => {
    if (!selectedKy && kyOptions.length > 0) setSelectedKy(kyOptions[0]);
  }, [kyOptions, selectedKy]);

  // Filtered + grouped for display
  const filtered = useMemo(
    () => payslips.filter((p) => !selectedKy || p.ky_luong === selectedKy),
    [payslips, selectedKy]
  );
  const grouped = useMemo(() => groupPayslips(filtered), [filtered]);

  const openDetail = useCallback(
    async (code: string, ky: string) => {
      if (!isReauthValid()) {
        setPendingCode(code);
        setPendingKy(ky);
        setReauthOpen(true);
        return;
      }
      await fetchDetail(code, ky);
    },
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const fetchDetail = async (code: string, ky: string) => {
    const targets = payslips.filter((p) => p.code === code && p.ky_luong === ky);
    setDetailLoading(true);
    setDetailError("");
    setDetailItems(null);
    try {
      const results = await Promise.all(targets.map((t) => getPayslip(t.id)));
      // Order: truoc_thue first, sau_thue second
      results.sort((a, b) => {
        const order: Record<PayslipStage, number> = { truoc_thue: 0, sau_thue: 1 };
        return order[a.stage] - order[b.stage];
      });
      setDetailItems(results);
    } catch (e) {
      const msg = formatApiError(e, "Không tải được phiếu lương");
      if ((e as { response?: { status?: number } }).response?.status === 403) {
        setDetailError("Không có quyền xem phiếu này.");
      } else {
        setDetailError(msg);
      }
      setDetailItems([]);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleReauthSuccess = useCallback(() => {
    setReauthOpen(false);
    if (pendingCode && pendingKy) {
      void fetchDetail(pendingCode, pendingKy);
      setPendingCode(null);
      setPendingKy(null);
    }
  }, [pendingCode, pendingKy]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update a single item in payslips list (after action)
  const handleUpdate = useCallback((updated: PayslipListItem) => {
    setPayslips((prev) =>
      prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p))
    );
    setDetailItems((prev) =>
      prev ? prev.map((d) => (d.id === updated.id ? { ...d, ...updated } : d)) : prev
    );
  }, []);

  if (permLoading || loading) {
    return <div className="p-6 text-center text-sm text-gmv-muted animate-pulse">Đang tải...</div>;
  }

  if (!canView) {
    return <div className="p-6 text-center text-sm text-gmv-muted">Không có quyền xem phiếu lương.</div>;
  }

  if (error) {
    return <div className="p-6 text-center text-sm text-gmv-danger">{error}</div>;
  }

  // Empty state
  const isEmpty = grouped.length === 0;
  const emptyMsg =
    profile?.role === "sale"
      ? "Chưa được gán mã nhân viên — liên hệ HR."
      : "Chưa có phiếu lương kỳ này.";

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Bộ lọc kỳ lương */}
      {kyOptions.length > 0 && (
        <div className="flex items-center gap-2">
          <label className="shrink-0 text-sm font-medium text-gmv-text">Kỳ lương:</label>
          <Select
            value={selectedKy}
            onChange={(e) => setSelectedKy(e.target.value)}
            className="max-w-[160px]"
          >
            {kyOptions.map((ky) => (
              <option key={ky} value={ky}>
                {ky}
              </option>
            ))}
          </Select>
        </div>
      )}

      {/* Re-auth modal */}
      <PayslipReauthModal
        open={reauthOpen}
        pendingCode={pendingCode}
        pendingKy={pendingKy}
        hasTotp={hasTotp}
        totpFactorId={totpFactorId}
        onSuccess={handleReauthSuccess}
        onClose={() => {
          setReauthOpen(false);
          setPendingCode(null);
          setPendingKy(null);
        }}
      />

      {/* Detail modal */}
      <Modal
        open={detailItems !== null || detailLoading}
        onClose={() => { setDetailItems(null); setDetailError(""); }}
        title="Phiếu lương"
        wide
      >
        {detailLoading && (
          <div className="py-8 text-center text-sm text-gmv-muted animate-pulse">Đang tải phiếu...</div>
        )}
        {detailError && <p className="text-sm text-gmv-danger">{detailError}</p>}
        {detailItems && detailItems.length > 0 && (
          <PayslipDetail items={detailItems} onUpdate={handleUpdate} />
        )}
      </Modal>

      {/* Desktop table */}
      {!isMobile ? (
        <TableScrollWrap>
          <Table>
            <thead>
              <tr>
                <Th className={`${stickyTableHead} ${stickyTableHeadTop} left-0`}>Nhân viên</Th>
                <Th className={`${stickyTableHead} ${stickyTableHeadTop}`}>Kỳ</Th>
                <Th className={`${stickyTableHead} ${stickyTableHeadTop}`}>Trước thuế</Th>
                <Th className={`${stickyTableHead} ${stickyTableHeadTop}`}>Sau thuế</Th>
                <Th className={`${stickyTableHead} ${stickyTableHeadTop}`}></Th>
              </tr>
            </thead>
            <tbody>
              {isEmpty ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-sm text-gmv-muted">
                    {emptyMsg}
                  </td>
                </tr>
              ) : (
                grouped.map((g) => (
                  <Tr key={`${g.code}__${g.ky_luong}`}>
                    <Td className="text-left">
                      <p className="font-medium text-gmv-text-strong">{g.name ?? g.code}</p>
                      <p className="text-xs text-gmv-muted">{g.code}</p>
                    </Td>
                    <Td>{g.ky_luong}</Td>
                    <Td>{statusBadge(g.truoc_thue)}</Td>
                    <Td>{statusBadge(g.sau_thue)}</Td>
                    <Td>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void openDetail(g.code, g.ky_luong)}
                      >
                        Xem
                      </Button>
                    </Td>
                  </Tr>
                ))
              )}
            </tbody>
          </Table>
        </TableScrollWrap>
      ) : (
        /* Mobile cards */
        <RowCardList empty={emptyMsg}>
          {grouped.map((g) => (
            <RowCard
              key={`${g.code}__${g.ky_luong}`}
              title={g.name ?? g.code}
              badges={
                <>
                  {statusBadge(g.truoc_thue)}
                  {statusBadge(g.sau_thue)}
                </>
              }
              meta={[{ label: "Kỳ lương", value: g.ky_luong }]}
              actions={
                <Button size="sm" variant="ghost" onClick={() => void openDetail(g.code, g.ky_luong)}>
                  Xem phiếu
                </Button>
              }
            />
          ))}
        </RowCardList>
      )}
    </div>
  );
}
