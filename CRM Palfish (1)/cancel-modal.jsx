// cancel-modal.jsx — confirm cancellation by typing DELETE

function CancelPrModal({ pr, onClose, onConfirm }) {
  const [text, setText] = React.useState('');
  const [reason, setReason] = React.useState('');
  React.useEffect(() => { setText(''); setReason(''); }, [pr?.id]);
  if (!pr) return null;

  const ok = text.trim().toUpperCase() === 'DELETE';

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal cancel-modal" style={{ width: 'min(500px, 100%)' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <div className="danger-icon"><Icons.AlertCircle size={22} /></div>
            <div>
              <h3 style={{ color: 'var(--text)' }}>Huỷ Payment Request?</h3>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                PR sẽ chuyển sang tab "Đã huỷ" — không bị xoá vĩnh viễn.
              </div>
            </div>
          </div>
          <button className="drawer-close" onClick={onClose}><Icons.Close size={16} /></button>
        </div>
        <div className="modal-body" style={{ gap: 16 }}>
          <div style={{
            background: 'var(--surface-2)', border: '1px solid var(--border)',
            borderRadius: 10, padding: '10px 12px',
            display: 'flex', gap: 12, alignItems: 'center',
          }}>
            <span className="pr-id-pill">{pr.id}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{pr.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                {window.MockData.VND(pr.target)} · {pr.qrs.length} lần TT đã tạo · chưa nhận tiền
              </div>
            </div>
          </div>

          <div className="field">
            <label>Lý do huỷ <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>(không bắt buộc)</span></label>
            <textarea
              placeholder="VD: Khách đổi ý, tạo nhầm, trùng PR-ID khác…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              style={{ minHeight: 60 }}
            />
          </div>

          <div className="field">
            <label>Gõ <code style={{
              background: 'var(--danger-bg)', color: 'var(--danger-text)',
              padding: '1px 6px', borderRadius: 4, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace',
            }}>DELETE</code> để xác nhận</label>
            <input
              className="delete-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="DELETE"
              autoFocus
            />
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-outline" onClick={onClose}>Quay lại</button>
          <button
            className="btn btn-danger"
            disabled={!ok}
            onClick={() => ok && onConfirm({ reason })}
          >
            <Icons.XCircle size={14} /> Huỷ Payment Request
          </button>
        </div>
      </div>
    </div>
  );
}

window.CancelPrModal = CancelPrModal;
