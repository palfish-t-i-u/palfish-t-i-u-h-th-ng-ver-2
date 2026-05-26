// table.jsx — Payment Requests table

function StatusBadge({ state }) {
  const map = {
    done: { cls: 'is-done', text: 'Đủ' },
    short: { cls: 'is-short', text: 'Thiếu' },
    over: { cls: 'is-over', text: 'Thừa' },
    pending: { cls: 'is-pending', text: 'Chưa thanh toán' },
    cancelled: { cls: 'is-cancelled', text: 'Đã huỷ' }
  };
  const m = map[state] || map.pending;
  return <span className={`badge ${m.cls}`}><span className="dot" />{m.text}</span>;
}

function ProgressCell({ received, target }) {
  const pct = target === 0 ? 0 : Math.min(100, Math.round(received / target * 100));
  let cls = 'is-low';
  if (pct >= 100) cls = received > target ? 'is-over' : 'is-done';else
  if (pct >= 50) cls = 'is-mid';
  return (
    <div className="prog">
      <div className="prog-bar">
        <div className={`prog-fill ${cls}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <div className="prog-meta">
        <span><strong>{window.MockData.VND(received)}</strong></span>
        <span>{pct}%</span>
      </div>
    </div>);

}

function DeltaCell({ state, delta }) {
  const { VND } = window.MockData;
  if (state === 'done') return <span className="delta is-done">Đã đủ</span>;
  if (state === 'pending' || state === 'cancelled') return <span style={{ color: 'var(--text-3)' }}>—</span>;
  const abs = Math.abs(delta);
  return (
    <span className={`delta ${state === 'over' ? 'is-over' : 'is-short'}`}>
      {state === 'over' ? '+' : '−'}{VND(abs)}
    </span>);

}

function QrCountCell({ done, total }) {
  return (
    <span className="qr-count">
      <span className="num-done">{done}</span>
      <span className="slash">/</span>
      <span className="num-total">{total}</span>
      <span style={{ color: 'var(--text-3)', fontWeight: 500, fontSize: 11.5, marginLeft: 4 }}>lần</span>
    </span>);

}

// Relative time helper (rough)
function relativeFrom(dateStr) {
  // dateStr is "YYYY-MM-DD HH:mm"
  if (!dateStr) return '';
  const d = new Date(dateStr.replace(' ', 'T') + ':00+07:00');
  const now = new Date('2026-05-25T22:30:00+07:00'); // pin to "today" for demo realism
  const diffMin = Math.round((now - d) / 60000);
  if (diffMin < 1) return 'vừa xong';
  if (diffMin < 60) return `${diffMin} phút trước`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH} giờ trước`;
  const diffD = Math.round(diffH / 24);
  if (diffD < 30) return `${diffD} ngày trước`;
  return `${Math.round(diffD / 30)} tháng trước`;
}

function inDateRange(dateStr, dateRange) {
  if (!dateRange || !dateRange.from && !dateRange.to) return true;
  if (!dateStr) return false;
  const d = new Date(dateStr.replace(' ', 'T') + ':00');
  if (dateRange.from && d < new Date(dateRange.from + 'T00:00:00')) return false;
  if (dateRange.to && d > new Date(dateRange.to + 'T23:59:59')) return false;
  return true;
}

function PaymentTable({ prs, selectedId, onSelect, filterState, search, dateRange, tab, onTabChange, onCancelClick, activeCount, cancelledCount, withArCount, arByPrId }) {
  const filtered = prs.filter((p) => {
    // tab filter
    if (tab === 'cancelled' && !p.cancelled) return false;
    if (tab !== 'cancelled' && p.cancelled) return false;
    if (tab === 'with_ar' && !(arByPrId && arByPrId[p.id])) return false;

    if (filterState !== 'all' && p.state !== filterState) return false;
    if (!inDateRange(p.createdAt, dateRange)) return false;
    if (search) {
      const s = search.toLowerCase();
      return (
        p.id.toLowerCase().includes(s) ||
        p.name.toLowerCase().includes(s) ||
        p.uid.toLowerCase().includes(s) ||
        p.phone.includes(s));

    }
    return true;
  });

  return (
    <div className="table-card has-tabs">
      <div className="table-head with-tabs">
        <div className="tabs">
          <div
            className={`tab ${tab === 'active' ? 'active' : ''}`}
            onClick={() => onTabChange && onTabChange('active')}>
            <Icons.Wallet size={15} /> Đang theo dõi
            <span className="tab-count">{activeCount}</span>
          </div>
          <div
            className={`tab ${tab === 'with_ar' ? 'active' : ''}`}
            onClick={() => onTabChange && onTabChange('with_ar')}>
            <Icons.Sparkle size={15} /> Gói học đã tạo
            <span className="tab-count">{withArCount || 0}</span>
          </div>
          <div
            className={`tab ${tab === 'cancelled' ? 'active' : ''}`}
            onClick={() => onTabChange && onTabChange('cancelled')}>
            <Icons.XCircle size={15} /> Đã huỷ
            <span className="tab-count">{cancelledCount}</span>
          </div>
        </div>
        <span className="right-meta">{filtered.length} kết quả</span>
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: 130 }}>Tạo lúc</th>
              <th style={{ width: 120 }}>PR-ID</th>
              <th style={{ minWidth: 180 }}>Tên khách hàng</th>
              <th style={{ width: 200 }}>UID / SĐT</th>
              <th style={{ textAlign: 'center', width: 90 }}>Số lần TT</th>
              <th style={{ width: 200 }}>Tiến trình thanh toán</th>
              <th style={{ width: 130 }}>Trạng thái</th>
              <th style={{ width: 140 }}>Chênh lệch</th>
              <th style={{ width: 130, textAlign: 'center' }}>TT Gói học</th>
              <th style={{ width: 70, textAlign: 'center' }}>{tab === 'cancelled' ? 'Khôi phục' : 'Huỷ'}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => {
              const canCancel = !p.cancelled && p.doneCount === 0;
              const country = (window.COUNTRIES || []).find((c) => c.code === (p.country || 'VN')) || { dial: '+84', flag: '🇻🇳' };
              return (
                <tr
                  key={p.id}
                  className={`${selectedId === p.id ? 'selected' : ''} ${p.cancelled ? 'is-cancelled' : ''}`}
                  onClick={() => onSelect(p)}>
                  
                  <td>
                    <div className="cell-time">{p.createdAt.split(' ')[0].split('-').reverse().join('/')}</div>
                    <div className="time-relative" title={relativeFrom(p.createdAt)}>{p.createdAt.split(' ')[1]}</div>
                  </td>
                  <td>
                    <span className="cell-pr">
                      {p.id}
                      <Icons.Copy className="copy" size={13} />
                    </span>
                  </td>
                  <td>
                    <div className="cell-name">{p.name}</div>
                    <div className="cell-sub" title={`${p.address}, ${p.ward}, ${p.province}`}>
                      {[p.ward, p.province].filter(Boolean).join(', ').slice(0, 38) || '—'}
                    </div>
                  </td>
                  <td>
                    <div className="uid-phone">
                      <div className="uid-line">{p.uid}</div>
                      <div className="phone-line">
                        <span style={{ fontSize: 12 }}>{country.flag}</span>
                        {country.dial} {window.MockData.fmtPhone(p.phone)}
                      </div>
                    </div>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <QrCountCell done={p.doneCount} total={p.totalCount} />
                  </td>
                  <td>
                    {p.cancelled ?
                    <span style={{ color: 'var(--text-3)', fontSize: 12 }}>Huỷ {p.cancelledAt?.split(' ')[0]}</span> :
                    <ProgressCell received={p.received} target={p.target} />
                    }
                  </td>
                  <td><StatusBadge state={p.state} /></td>
                  <td><DeltaCell state={p.state} delta={p.delta} /></td>
                  <td style={{ textAlign: 'center' }}>
                    {arByPrId && arByPrId[p.id] ? (
                      <span className="badge is-done" title={`Active Request: ${arByPrId[p.id].id}`}>
                        <Icons.Check size={11} strokeWidth={2.5} /> Đã tạo
                      </span>
                    ) : (
                      <span className="badge is-pending">
                        — Chưa tạo
                      </span>
                    )}
                  </td>
                  <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                    {tab === 'cancelled' ?
                    <button
                      className="btn-cancel-row"
                      title="Khôi phục"
                      style={{ color: 'var(--success)' }}
                      onClick={() => onCancelClick && onCancelClick(p, 'restore')}>
                      
                        <Icons.CheckCircle size={16} />
                      </button> :

                    <button
                      className="btn-cancel-row"
                      disabled={!canCancel}
                      title={canCancel ? 'Huỷ Payment Request' : 'Đã có lần TT thành công — không thể huỷ'}
                      onClick={() => canCancel && onCancelClick && onCancelClick(p, 'cancel')}>
                      
                        <Icons.XCircle size={16} />
                      </button>
                    }
                  </td>
                </tr>);

            })}
            {filtered.length === 0 &&
            <tr>
                <td colSpan={10}>
                  <div className="empty">
                    <Icons.Search size={20} />
                    <div>Không có Payment Request nào khớp với điều kiện lọc.</div>
                  </div>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <div className="pagi">
        <span>Hiển thị 1–{filtered.length} trong {tab === 'cancelled' ? prs.filter((p) => p.cancelled).length : tab === 'with_ar' ? (withArCount || 0) : prs.filter((p) => !p.cancelled).length} kết quả</span>
        <div className="pagi-btns">
          <button className="pagi-btn"><Icons.ChevronLeft size={13} /></button>
          <button className="pagi-btn active">1</button>
          <button className="pagi-btn">2</button>
          <button className="pagi-btn">3</button>
          <button className="pagi-btn"><Icons.ChevronRight size={13} /></button>
        </div>
      </div>
    </div>);

}

window.PaymentTable = PaymentTable;
window.StatusBadge = StatusBadge;
window.ProgressCell = ProgressCell;
window.DeltaCell = DeltaCell;