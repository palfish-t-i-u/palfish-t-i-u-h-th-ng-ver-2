import { useState, useMemo } from "react";
import Modal from "../ui/Modal";
import { Button, Input } from "../ui";
import type { AuthUserRow } from "../../types/profile";
import { endpoints } from "../../lib/api";

interface Props {
  open: boolean;
  onClose: () => void;
  onDeleted: () => void;
  users: AuthUserRow[];
}

function statusOf(u: AuthUserRow): "activated" | "pending" | "banned" {
  if (u.isBanned) return "banned";
  if (u.isActivated) return "activated";
  return "pending";
}

function statusLabel(s: "activated" | "pending" | "banned") {
  if (s === "activated") return "Đã kích hoạt";
  if (s === "banned") return "Đã khoá";
  return "Chờ kích hoạt";
}

export default function DeleteAccountsModal({ open, onClose, onDeleted, users }: Props) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [failedItems, setFailedItems] = useState<
    { userId: string; email: string | null; error: string }[]
  >([]);

  const filtered = useMemo(() => {
    if (!search) return users;
    const q = search.toLowerCase();
    return users.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        (u.crmName || "").toLowerCase().includes(q) ||
        (u.fullName || "").toLowerCase().includes(q)
    );
  }, [users, search]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Số rows đang hiển thị đã được chọn — dùng cho trạng thái header checkbox
  const filteredSelectedCount = useMemo(
    () => filtered.reduce((n, u) => (selected.has(u.id) ? n + 1 : n), 0),
    [filtered, selected]
  );
  const allFilteredSelected =
    filtered.length > 0 && filteredSelectedCount === filtered.length;
  const someFilteredSelected =
    filteredSelectedCount > 0 && filteredSelectedCount < filtered.length;

  function toggleAll() {
    if (filtered.length === 0) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        // Chỉ bỏ chọn các rows đang hiển thị (giữ nguyên các lựa chọn đang bị ẩn)
        for (const u of filtered) next.delete(u.id);
      } else {
        // Chỉ thêm các rows đang hiển thị (không đụng vào các lựa chọn ngoài bộ lọc)
        for (const u of filtered) next.add(u.id);
      }
      return next;
    });
  }

  const selectedUsers = users.filter((u) => selected.has(u.id));

  async function handleDelete() {
    if (selected.size === 0) return;
    setLoading(true);
    setError("");
    setFailedItems([]);
    try {
      const res = await endpoints.admin.bulkDeleteAuthUsers([...selected]);
      const fails = res.data.errors || [];
      // Luôn reload danh sách để phản ánh các tài khoản đã thực sự bị xóa
      onDeleted();

      if (fails.length > 0) {
        // Có lỗi → KHÔNG đóng modal, hiển thị danh sách lỗi cho admin xem
        setFailedItems(fails);
        // Bỏ chọn các user đã xóa thành công, giữ lại các user lỗi để admin xử lý tiếp
        const deletedSet = new Set(res.data.deletedIds || []);
        setSelected((prev) => {
          const next = new Set<string>();
          for (const id of prev) if (!deletedSet.has(id)) next.add(id);
          return next;
        });
        setConfirming(false);
        setError(
          `Đã xóa ${res.data.deleted}/${selected.size} tài khoản. ${fails.length} tài khoản không xóa được — xem chi tiết bên dưới.`
        );
      } else {
        // Tất cả thành công → đóng modal
        handleClose();
      }
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      setError(err?.response?.data?.detail || "Xóa thất bại, vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    if (loading) return;
    setSearch("");
    setSelected(new Set());
    setConfirming(false);
    setError("");
    setFailedItems([]);
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title="Chọn tài khoản để xóa" wide>
      {!confirming ? (
        <>
          {/* Search */}
          <div className="mb-3">
            <Input
              type="search"
              placeholder="Tìm email, tên CRM..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* List */}
          <div className="aa-delete-list">
            {/* Header */}
            <div className="aa-delete-list-header">
              <label className="aa-delete-checkbox-wrap">
                <input
                  type="checkbox"
                  className="aa-delete-checkbox"
                  checked={allFilteredSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someFilteredSelected;
                  }}
                  onChange={toggleAll}
                />
              </label>
              <span className="aa-delete-col-email">Email đăng ký</span>
              <span className="aa-delete-col-crm">Họ và tên trên CRM</span>
              <span className="aa-delete-col-status">Trạng thái</span>
            </div>

            {/* Scrollable rows */}
            <div className="aa-delete-list-body">
              {filtered.length === 0 ? (
                <div className="aa-delete-empty">Không tìm thấy tài khoản phù hợp</div>
              ) : (
                filtered.map((u) => {
                  const st = statusOf(u);
                  const isSelected = selected.has(u.id);
                  return (
                    <div
                      key={u.id}
                      className={`aa-delete-row${isSelected ? " selected" : ""}`}
                      onClick={() => toggle(u.id)}
                    >
                      <label
                        className="aa-delete-checkbox-wrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          className="aa-delete-checkbox"
                          checked={isSelected}
                          onChange={() => toggle(u.id)}
                        />
                      </label>
                      <span className="aa-delete-col-email">{u.email}</span>
                      <span className="aa-delete-col-crm">
                        {u.crmName || u.fullName || "—"}
                      </span>
                      <span className={`aa-delete-col-status aa-status ${st}`}>
                        <span className="aa-status-dot" />
                        {statusLabel(st)}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Báo kết quả + danh sách lỗi (nếu có) */}
          {error && (
            <div className="aa-delete-error-banner" role="alert">
              {error}
            </div>
          )}
          {failedItems.length > 0 && (
            <div className="aa-delete-error-list">
              <div className="aa-delete-error-list-title">
                Tài khoản không xóa được:
              </div>
              {failedItems.map((it) => (
                <div key={it.userId} className="aa-delete-error-item">
                  <span className="aa-delete-error-email">
                    {it.email || it.userId}
                  </span>
                  <span className="aa-delete-error-reason">— {it.error}</span>
                </div>
              ))}
            </div>
          )}

          {/* Footer */}
          <div className="aa-delete-footer">
            <span className="aa-delete-footer-info">
              {selected.size > 0 ? (
                <>
                  Đã chọn <strong>{selected.size}</strong> tài khoản
                </>
              ) : (
                "Chọn các tài khoản muốn xóa"
              )}
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={handleClose}>
                Hủy
              </Button>
              <Button
                variant="danger"
                disabled={selected.size === 0}
                onClick={() => setConfirming(true)}
              >
                Xóa tài khoản
              </Button>
            </div>
          </div>
        </>
      ) : (
        /* Confirmation step */
        <>
          <div className="aa-delete-confirm">
            <div className="aa-delete-confirm-icon">⚠️</div>
            <p className="aa-delete-confirm-title">
              Xác nhận xóa {selected.size} tài khoản?
            </p>
            <p className="aa-delete-confirm-desc">
              Hành động này <strong>không thể hoàn tác</strong>. Các tài khoản sau sẽ bị
              xóa vĩnh viễn:
            </p>
            <div className="aa-delete-confirm-list">
              {selectedUsers.map((u) => (
                <div key={u.id} className="aa-delete-confirm-item">
                  <span className="aa-delete-confirm-email">{u.email}</span>
                  {(u.crmName || u.fullName) && (
                    <span className="aa-delete-confirm-crm">
                      ({u.crmName || u.fullName})
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-gmv-danger mt-3 text-center">{error}</p>}

          <div className="aa-delete-footer mt-4">
            <span />
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => setConfirming(false)}
                disabled={loading}
              >
                Quay lại
              </Button>
              <Button variant="danger" onClick={handleDelete} disabled={loading}>
                {loading ? "Đang xóa…" : `Xóa ${selected.size} tài khoản`}
              </Button>
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}
