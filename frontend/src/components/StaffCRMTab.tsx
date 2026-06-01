import { useCallback, useEffect, useState } from "react";
import { useMe } from "../hooks/useMe";
import { endpoints } from "../lib/api";
import type { RoleLevel, SaleStaffRow } from "../types/profile";
import { Button, Input, Select } from "./ui";
import Badge from "./ui/Badge";
import { TableWrap } from "./ui/Table";

const ROLE_OPTIONS: RoleLevel[] = ["sale", "leader", "manager", "system"];

export default function StaffCRMTab() {
  const { profile } = useMe();
  const [sales, setSales] = useState<SaleStaffRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [filterQ, setFilterQ] = useState("");

  const canManage = profile?.canManageStaff ?? false;

  const loadSales = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await endpoints.admin.sales({ q: filterQ || undefined });
      setSales(res.data.sales || []);
    } catch (e: unknown) {
      setError("Không tải danh sách nhân sự CRM.");
      console.warn(e);
    } finally {
      setLoading(false);
    }
  }, [filterQ]);

  useEffect(() => {
    loadSales();
  }, [loadSales]);

  async function handleSync() {
    setSyncing(true);
    try {
      await endpoints.admin.syncSales();
      await loadSales();
    } catch {
      setError("Sync Metabase thất bại.");
    } finally {
      setSyncing(false);
    }
  }

  async function patchSaleRole(crmName: string, role: string) {
    try {
      await endpoints.admin.patchSale(crmName, { role });
      await loadSales();
    } catch {
      setError(`Không cập nhật role cho ${crmName}`);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-gmv-md border border-gmv-primary/20 bg-gmv-primary-soft p-4">
        <p className="text-sm font-medium text-gmv-primary">
          Master data từ Metabase — đồng bộ 24h/lần. Phân quyền nghiệp vụ (ai xem đơn của ai).
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          placeholder="Tìm tên CRM…"
          value={filterQ}
          onChange={(e) => setFilterQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && loadSales()}
          className="min-w-[220px] max-w-xs"
        />
        <Button type="button" variant="secondary" size="sm" onClick={loadSales}>
          Tìm
        </Button>
        {canManage && (
          <Button type="button" variant="primary" size="sm" onClick={handleSync} disabled={syncing}>
            {syncing ? "Đang sync…" : "Sync Metabase now"}
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-gmv-danger">{error}</p>}
      {loading && <p className="text-sm text-gmv-muted">Đang tải…</p>}

      {!loading && (
        <TableWrap>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gmv-border bg-gmv-table-head text-left text-xs font-semibold uppercase tracking-wide text-gmv-text-strong">
                <th className="px-4 py-3">CRM name</th>
                <th className="px-4 py-3">Email link</th>
                <th className="px-4 py-3">Team</th>
                <th className="px-4 py-3">Sub-team</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((s) => (
                <tr
                  key={s.id || s.crmName}
                  className="border-b border-gmv-border last:border-0 hover:bg-gmv-row-hover"
                >
                  <td className="px-4 py-2 font-medium text-gmv-text-strong">{s.crmName}</td>
                  <td className="px-4 py-2 text-gmv-text">
                    {s.email || <span className="italic text-gmv-text-secondary">chưa link</span>}
                  </td>
                  <td className="px-4 py-2 text-gmv-text">{s.team || "—"}</td>
                  <td className="px-4 py-2 text-gmv-text">{s.subTeam || "—"}</td>
                  <td className="px-4 py-2">
                    {canManage ? (
                      <Select
                        value={s.role}
                        onChange={(e) => patchSaleRole(s.crmName, e.target.value)}
                        className="w-auto py-1 text-xs"
                      >
                        {ROLE_OPTIONS.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <span className="text-gmv-text">{s.role}</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {s.isActive ? (
                      <Badge tone="ok" className="normal-case">
                        Hoạt động
                      </Badge>
                    ) : (
                      <Badge tone="neutral" className="normal-case">
                        Tắt
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {sales.length === 0 && (
            <p className="px-4 py-6 text-sm text-gmv-muted">
              Chưa có dữ liệu — chạy SQL patch v2 và Sync (System).
            </p>
          )}
        </TableWrap>
      )}
    </div>
  );
}
