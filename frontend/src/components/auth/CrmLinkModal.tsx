import { useCallback, useEffect, useState } from "react";
import { endpoints } from "../../lib/api";
import type { SaleStaffRow } from "../../types/profile";
import { Button, Input } from "../ui";
import Modal from "../ui/Modal";
import "./auth-accounts.css";

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (crmName: string) => void;
  linkedCrmNames: Set<string>;
}

export default function CrmLinkModal({ open, onClose, onConfirm, linkedCrmNames }: Props) {
  const [sales, setSales] = useState<SaleStaffRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
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

  const teams = [...new Set(sales.map((s) => s.team).filter(Boolean))] as string[];

  return (
    <Modal open={open} onClose={onClose} title="Liên kết nhân sự CRM" wide>
      <div className="aa-crm-modal-header">
        <div className="aa-search">
          <Input
            type="search"
            placeholder="Tìm tên nhân sự..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadSales()}
          />
        </div>
        {teams.length > 0 && (
          <select
            className="gmv-field px-2 py-2 border border-gmv-border rounded-gmv-md text-sm bg-gmv-canvas"
            value={teamFilter}
            onChange={(e) => { setTeamFilter(e.target.value); }}
          >
            <option value="">Tất cả team</option>
            {teams.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        )}
        <Button size="sm" variant="secondary" onClick={() => loadSales()}>
          Tìm
        </Button>
        <Button size="sm" variant="primary" onClick={handleSync} disabled={syncing}>
          {syncing ? "Đang sync..." : "Sync Metabase"}
        </Button>
      </div>

      {error && <p className="text-sm text-gmv-danger mb-3">{error}</p>}

      <div className="aa-crm-staff-list">
        {loading ? (
          <div className="p-6 text-center text-sm text-gmv-muted">Đang tải...</div>
        ) : sales.length === 0 ? (
          <div className="p-6 text-center text-sm text-gmv-muted">
            Không tìm thấy nhân sự. Thử Sync Metabase.
          </div>
        ) : (
          sales
            .filter((s) => !teamFilter || s.team === teamFilter)
            .map((s) => {
              const isLinked = linkedCrmNames.has(s.crmName);
              const isSelected = selected === s.crmName;
              return (
                <div
                  key={s.crmName}
                  className={`aa-crm-staff-row${isSelected ? " selected" : ""}${isLinked ? " already-linked" : ""}`}
                  onClick={() => {
                    if (!isLinked) setSelected(isSelected ? null : s.crmName);
                  }}
                >
                  <input
                    type="radio"
                    checked={isSelected}
                    disabled={isLinked}
                    readOnly
                    style={{ accentColor: "var(--gmv-primary)" }}
                  />
                  <span className="aa-crm-staff-name">{s.crmName}</span>
                  <span className="aa-crm-staff-team">{s.team}{s.subTeam ? ` / ${s.subTeam}` : ""}</span>
                  {isLinked && <span className="aa-crm-staff-linked-tag">Đã liên kết</span>}
                </div>
              );
            })
        )}
      </div>

      <div className="mt-4 flex justify-end gap-3">
        <Button variant="secondary" onClick={onClose}>
          Huỷ
        </Button>
        <Button variant="primary" onClick={handleConfirm} disabled={!selected}>
          Xác nhận liên kết
        </Button>
      </div>
    </Modal>
  );
}
