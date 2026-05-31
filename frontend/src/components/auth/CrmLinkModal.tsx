import { useCallback, useEffect, useMemo, useState } from "react";
import { endpoints } from "../../lib/api";
import type { SaleStaffRow } from "../../types/profile";
import { Button, Input, Select } from "../ui";
import Modal from "../ui/Modal";
import "./auth-accounts.css";

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (crmName: string) => void;
  /** Set of crmNames already linked to any auth account */
  linkedCrmNames: Set<string>;
}

export default function CrmLinkModal({ open, onClose, onConfirm, linkedCrmNames }: Props) {
  const [sales, setSales] = useState<SaleStaffRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const [subTeamFilter, setSubTeamFilter] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState("");

  const loadSales = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await endpoints.admin.sales({ q: search || undefined, team: teamFilter || undefined });
      setSales(res.data.sales || []);
    } catch {
      setError("Không tải được danh sách nhân sự CRM.");
    } finally {
      setLoading(false);
    }
  }, [search, teamFilter]);

  useEffect(() => {
    if (open) {
      setSelected(null);
      setSearch("");
      setTeamFilter("");
      setSubTeamFilter("");
      loadSales();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

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

  function handleConfirm() {
    if (!selected) return;
    onConfirm(selected);
  }

  const teams = useMemo(
    () => [...new Set(sales.map((s) => s.team).filter(Boolean))] as string[],
    [sales]
  );

  const subTeams = useMemo(
    () => [...new Set(sales.map((s) => s.subTeam).filter(Boolean))] as string[],
    [sales]
  );

  const filtered = useMemo(() => {
    let list = sales;
    if (teamFilter) list = list.filter((s) => s.team === teamFilter);
    if (subTeamFilter) list = list.filter((s) => s.subTeam === subTeamFilter);
    return list;
  }, [sales, teamFilter, subTeamFilter]);

  const selectedStaff = selected ? sales.find((s) => s.crmName === selected) : null;

  return (
    <Modal open={open} onClose={onClose} title="Chọn Nhân sự Sale để liên kết" wide>
      {/* Filters */}
      <div className="aa-crm-modal-filters">
        <div className="aa-search">
          <Input
            type="search"
            placeholder="Tìm tên CRM..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadSales()}
          />
        </div>
        <Select
          value={teamFilter}
          onChange={(e) => { setTeamFilter(e.target.value); setSubTeamFilter(""); }}
          className="min-w-[130px]"
        >
          <option value="">Tất cả team</option>
          {teams.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </Select>
        <Select
          value={subTeamFilter}
          onChange={(e) => setSubTeamFilter(e.target.value)}
          className="min-w-[130px]"
        >
          <option value="">Tất cả sub-team</option>
          {subTeams.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </Select>
        <Button size="sm" variant="primary" onClick={handleSync} disabled={syncing}>
          {syncing ? "Đang sync..." : "Sync Metabase now"}
        </Button>
      </div>

      {error && <p className="text-sm text-gmv-danger mb-3">{error}</p>}

      {/* Table */}
      <div className="aa-crm-table-wrap">
        {loading ? (
          <div className="p-6 text-center text-sm text-gmv-muted">Đang tải...</div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-center text-sm text-gmv-muted">
            Không tìm thấy nhân sự. Thử Sync Metabase.
          </div>
        ) : (
          <table className="aa-crm-table">
            <thead>
              <tr>
                <th />
                <th>CRM Name</th>
                <th>Team</th>
                <th>Sub-team</th>
                <th>Trạng thái kết nối</th>
                <th>Mã yêu cầu</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const isLinked = linkedCrmNames.has(s.crmName);
                const isSelected = selected === s.crmName;
                return (
                  <tr
                    key={s.crmName}
                    className={`${isSelected ? "selected" : ""}${isLinked ? " already-linked" : ""}`}
                    onClick={() => {
                      if (!isLinked) setSelected(isSelected ? null : s.crmName);
                    }}
                  >
                    <td>
                      <input
                        type="radio"
                        checked={isSelected}
                        disabled={isLinked}
                        readOnly
                        style={{ accentColor: "var(--gmv-primary)" }}
                      />
                    </td>
                    <td className="font-semibold text-gmv-text-strong">{s.crmName}</td>
                    <td className="text-gmv-text">{s.team || "—"}</td>
                    <td className="text-gmv-text">{s.subTeam || "—"}</td>
                    <td>
                      {isLinked ? (
                        <span className="aa-crm-link linked">
                          <span className="aa-status-dot" style={{ background: "var(--gmv-ok)" }} />
                          Đã liên kết
                        </span>
                      ) : (
                        <span className="aa-crm-link unlinked">
                          <span className="aa-status-dot" style={{ background: "var(--gmv-warn)" }} />
                          Chưa liên kết
                        </span>
                      )}
                    </td>
                    <td className="text-gmv-muted font-semibold">
                      {isLinked ? s.email?.split("@")[0] || "—" : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer */}
      <div className="aa-crm-modal-footer">
        <div className="aa-crm-modal-footer-info">
          {filtered.length} nhân sự
          {selectedStaff && (
            <>
              {" · Đã chọn: "}
              <strong>{selectedStaff.crmName}</strong>
              {selectedStaff.team && ` (${selectedStaff.team})`}
            </>
          )}
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={onClose}>
            Huỷ
          </Button>
          <Button variant="primary" onClick={handleConfirm} disabled={!selected}>
            Xác nhận liên kết
          </Button>
        </div>
      </div>
    </Modal>
  );
}
