// reconciliation.jsx — Đối soát giao dịch module

const { useMemo: rcUseMemo, useState: rcUseState, useEffect: rcUseEffect } = React;
const DateRangeFilter = window.DateRangeFilter;

// Helper: derive transaction display status
function txnDisplayStatus(qr) {
  if (qr.cancelled) return 'cancelled';
  if (qr.status === 'paid') return 'confirmed';
  if (qr.status === 'rejected') return 'rejected';
  return 'awaiting';
}

const TXN_STATUS_META = {
  awaiting: { cls: 'is-over', text: 'Chờ xác nhận' },
  confirmed: { cls: 'is-done', text: 'Đã xác nhận' },
  rejected: { cls: 'is-short', text: 'Kế toán từ chối' },
  cancelled: { cls: 'is-cancelled', text: 'Sales huỷ' },
  unsent: { cls: 'is-pending', text: 'Chờ chuyển khoản' }
};

function TxnStatusBadge({ status }) {
  const meta = TXN_STATUS_META[status] || TXN_STATUS_META.unsent;
  return (
    <span className={`badge ${meta.cls}`}>
      <span className="dot" />{meta.text}
    </span>);

}

// ─────────── Bill image thumbnails (mock placeholder for uploaded bills) ───────────
function genBillSvg(qr, pr, variant = 0) {
  const palettes = [
    { bg: '#f3f7fa', accent: '#1d4ed8', label: 'MB Bank' },
    { bg: '#fdf6e3', accent: '#a96a04', label: 'Vietcombank' },
    { bg: '#f5f3fc', accent: '#6f5cf3', label: 'Techcombank' },
  ];
  const p = palettes[variant % palettes.length];
  const amount = (qr.amount || 0).toLocaleString('vi-VN') + ' đ';
  const time = qr.paidAt || qr.createdAt || '—';
  const code = qr.code || '—';
  const sender = ((pr && pr.name) || 'Khách hàng').slice(0, 22);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 480">
    <rect width="320" height="480" fill="${p.bg}"/>
    <rect x="0" y="0" width="320" height="64" fill="${p.accent}"/>
    <circle cx="34" cy="32" r="14" fill="white" fill-opacity="0.95"/>
    <text x="34" y="37" font-family="Inter, sans-serif" font-size="14" font-weight="700" fill="${p.accent}" text-anchor="middle">${(qr.bank || p.label)[0]}</text>
    <text x="58" y="28" font-family="Inter, sans-serif" font-size="10" fill="white" opacity="0.85">BIÊN LAI CHUYỂN KHOẢN</text>
    <text x="58" y="46" font-family="Inter, sans-serif" font-size="13" font-weight="700" fill="white">${qr.bank || p.label}</text>
    <g font-family="Inter, sans-serif" fill="#1c1f2a">
      <text x="20" y="100" font-size="10" fill="#5a6075">Người gửi</text>
      <text x="20" y="118" font-size="13" font-weight="600">${sender}</text>
      <line x1="20" y1="138" x2="300" y2="138" stroke="#e2e6ee" stroke-dasharray="3 3"/>
      <text x="20" y="160" font-size="10" fill="#5a6075">Số tiền</text>
      <text x="20" y="192" font-size="24" font-weight="800" fill="#ec7211" font-family="JetBrains Mono, monospace">${amount}</text>
      <line x1="20" y1="212" x2="300" y2="212" stroke="#e2e6ee" stroke-dasharray="3 3"/>
      <text x="20" y="234" font-size="10" fill="#5a6075">Nội dung</text>
      <text x="20" y="252" font-size="12" font-weight="600" font-family="JetBrains Mono, monospace">${code}</text>
      <text x="20" y="282" font-size="10" fill="#5a6075">Thời gian</text>
      <text x="20" y="300" font-size="12" font-weight="500">${time}</text>
      <g transform="translate(20, 322)">
        <rect width="140" height="26" rx="6" fill="#e7f7ee"/>
        <text x="70" y="17" font-size="11" font-weight="700" fill="#0f7a36" text-anchor="middle">GIAO DỊCH THÀNH CÔNG</text>
      </g>
      <text x="160" y="460" font-size="9" fill="#8b91a4" text-anchor="middle">PalFish CRM · Bill #${qr.idx}·${variant + 1}</text>
    </g>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function getBillsForQr(qr, pr) {
  if (!qr.bill) return [];
  const count = qr.idx % 2 === 0 ? 2 : 1;
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    src: genBillSvg(qr, pr, i),
    name: `bill_${qr.code}_${i + 1}.png`,
    uploadedAt: qr.paidAt || qr.createdAt,
  }));
}

function BillLightbox({ src, name, onClose }) {
  if (!src) return null;
  return (
    <div className="modal-scrim" onClick={onClose} style={{ zIndex: 90 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: '90vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'white' }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{name}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <a href={src} download={name} className="btn btn-outline btn-sm" style={{ background: 'rgba(255,255,255,0.95)' }}>
              <Icons.Download size={13} /> Tải xuống
            </a>
            <button className="drawer-close" onClick={onClose} style={{ background: 'rgba(255,255,255,0.95)' }}><Icons.Close size={16} /></button>
          </div>
        </div>
        <img src={src} alt={name} style={{ maxWidth: '90vw', maxHeight: '82vh', borderRadius: 12, background: 'white', boxShadow: '0 30px 80px rgba(0,0,0,0.5)' }} />
      </div>
    </div>
  );
}

// ─────────── Bill receipt visual placeholder ───────────
function BillReceiptArt({ qr, pr, stamp }) {
  const { VND, fmtPhone } = window.MockData;
  const country = window.COUNTRIES.find((c) => c.code === (pr.country || 'VN')) || { dial: '+84', flag: '🇻🇳' };
  const isCash = qr.method === 'cash';
  const isCard = qr.method === 'card';
  return (
    <div className={`bill-art has`}>
      <div style={{ position: 'absolute', top: 14, left: 16, right: 16, textAlign: 'left' }}>
        <div style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}>
          {isCash ? 'Phiếu thu tiền mặt' : isCard ? 'Hoá đơn POS' : 'Biên lai chuyển khoản'}
        </div>
        <div style={{ fontWeight: 700, fontSize: 13, marginTop: 2, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {qr.bank || (isCash ? 'PalFish Vietnam · Văn phòng' : 'POS · PalFish Vietnam')}
        </div>
      </div>
      {stamp && <span className="stamp">{stamp}</span>}
      <div style={{
        marginTop: 44, textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 5,
        fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5, color: 'var(--text-2)',
        width: '100%'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ color: 'var(--text-3)', flex: '0 0 auto' }}>Mã GD</span>
          <span style={{ fontWeight: 600, color: 'var(--text)', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{qr.code}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ color: 'var(--text-3)', flex: '0 0 auto' }}>Thời gian</span>
          <span style={{ whiteSpace: 'nowrap' }}>{qr.paidAt || qr.createdAt}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ color: 'var(--text-3)', flex: '0 0 auto' }}>Người gửi</span>
          <span style={{ textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pr.name}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ color: 'var(--text-3)', flex: '0 0 auto' }}>SĐT</span>
          <span style={{ whiteSpace: 'nowrap' }}>{country.dial} {fmtPhone(pr.phone)}</span>
        </div>
        {qr.cardLast4 &&
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ color: 'var(--text-3)', flex: '0 0 auto' }}>Thẻ</span>
            <span style={{ whiteSpace: 'nowrap' }}>•••• {qr.cardLast4}</span>
          </div>
        }
        {qr.installmentMonths &&
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ color: 'var(--text-3)', flex: '0 0 auto' }}>Trả góp</span>
            <span style={{ whiteSpace: 'nowrap' }}>{qr.installmentMonths} tháng</span>
          </div>
        }
        {qr.cashier &&
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ color: 'var(--text-3)', flex: '0 0 auto' }}>Người thu</span>
            <span style={{ whiteSpace: 'nowrap' }}>{qr.cashier}</span>
          </div>
        }
      </div>
      <div style={{
        marginTop: 14, paddingTop: 10, borderTop: '1px dashed var(--border-strong)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, width: '100%'
      }}>
        <span style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
          Số tiền
        </span>
        <span style={{ fontSize: 19, fontWeight: 800, color: 'var(--money)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {VND(qr.amount)}
        </span>
      </div>
    </div>);

}

// ─────────── Transaction Detail Drawer ───────────
function TxnDetailDrawer({ txn, pr, open, onClose, onConfirm, onReject, onOpenPr }) {
  if (!txn || !pr) return (
    <>
      <div className={`scrim ${open ? 'open' : ''}`} onClick={onClose} style={{ pointerEvents: open ? 'auto' : 'none' }} />
      <aside className={`drawer ${open ? 'open' : ''}`}></aside>
    </>);


  const { VND, fmtPhone } = window.MockData;
  const country = window.COUNTRIES.find((c) => c.code === (pr.country || 'VN')) || { dial: '+84', flag: '🇻🇳' };
  const status = txnDisplayStatus(txn);
  const method = window.METHOD_META[txn.method || 'qr'];
  const [lightboxBill, setLightboxBill] = React.useState(null);
  const billImages = getBillsForQr(txn, pr);

  const pct = pr.target ? Math.min(100, Math.round(pr.received / pr.target * 100)) : 0;

  return (
    <>
      <div className={`scrim ${open ? 'open' : ''}`} onClick={onClose} style={{ pointerEvents: open ? 'auto' : 'none' }} />
      <aside className={`drawer ${open ? 'open' : ''}`} style={{ width: 'min(720px, 92vw)' }}>
        <div className="drawer-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span className="pr-id-pill" style={{ background: 'var(--surface-3)', color: 'var(--text-2)', fontFamily: 'JetBrains Mono, monospace' }}>{txn.code}</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{window.MockData.VND(txn.amount)}</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                Lần #{txn.idx} của <strong style={{ color: 'var(--text-2)' }}>{pr.id}</strong> · {pr.name}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <TxnStatusBadge status={status} />
            <button className="drawer-close" onClick={onClose}><Icons.Close size={16} /></button>
          </div>
        </div>

        <div className="drawer-body txn-drawer-body" style={{ paddingBottom: 100 }}>
          {/* Bill preview */}
          <div className="txn-bill-zone">
            {billImages.length > 0 ? (
              <>
                <div className="bill-thumb-grid">
                  {billImages.map((b) => (
                    <div
                      key={b.id}
                      className="bill-thumb"
                      onClick={() => setLightboxBill(b)}
                      title="Click để phóng to"
                    >
                      <img src={b.src} alt={b.name} />
                      <div className="bill-thumb-overlay">
                        <Icons.Image size={12} /> #{b.id + 1}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 8, textAlign: 'center' }}>
                  {billImages.length} ảnh đã upload · Click thumb để phóng to
                </div>
              </>
            ) : (
              <div className="bill-art">
                <div>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
                  <div style={{ fontWeight: 600, color: 'var(--text-2)' }}>Chưa có biên lai</div>
                  <div style={{ fontSize: 11, marginTop: 4 }}>
                    Sales chưa upload ảnh bill cho lần thanh toán này.
                  </div>
                </div>
              </div>
            )}
            <div className="actions">
              {billImages.length > 0 ? (
                <>
                  <button className="btn btn-outline btn-sm" onClick={() => setLightboxBill(billImages[0])}>
                    <Icons.Image size={13} /> Phóng to
                  </button>
                  <button className="btn btn-outline btn-sm"><Icons.Upload size={13} /> Thêm ảnh</button>
                </>
              ) : (
                <button className="btn btn-outline btn-sm" disabled style={{ opacity: 0.5 }}>
                  <Icons.Upload size={13} /> Chờ sales up bill
                </button>
              )}
            </div>
          </div>

          {/* Right column: info + actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="panel" style={{ padding: 16 }}>
              <div className="panel-head" style={{ marginBottom: 10 }}>
                <h4>Thông tin giao dịch</h4>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="info-cell">
                  <div className="info-label">Phương thức</div>
                  <div className="info-value">
                    <span className={`method-badge ${method.cls}`} style={{ marginTop: 2 }}>
                      {React.createElement(Icons[method.icon] || Icons.QrCode, { size: 11, strokeWidth: 2.2 })} {method.label}
                    </span>
                  </div>
                </div>
                <div className="info-cell">
                  <div className="info-label">{txn.method === 'cash' ? 'Người thu' : txn.method === 'card' ? '4 số cuối' : 'Ngân hàng nhận'}</div>
                  <div className="info-value">
                    {txn.method === 'cash' && (txn.cashier || '—')}
                    {txn.method === 'card' && (txn.cardLast4 ? `•••• ${txn.cardLast4}` : '—')}
                    {txn.method === 'installment' && `${txn.bank || '—'} · ${txn.installmentMonths || '—'} tháng`}
                    {txn.method === 'qr' && (txn.bank || '—')}
                  </div>
                </div>
                <div className="info-cell">
                  <div className="info-label">Số tiền</div>
                  <div className="info-value money">{window.MockData.VND(txn.amount)}</div>
                </div>
                <div className="info-cell">
                  <div className="info-label">Mã đối soát</div>
                  <div className="info-value mono">{txn.code}</div>
                </div>
                <div className="info-cell">
                  <div className="info-label">Sales tạo lúc</div>
                  <div className="info-value mono">{txn.createdAt}</div>
                </div>
                <div className="info-cell">
                  <div className="info-label">Sales upload bill</div>
                  <div className="info-value">
                    {txn.bill ? <span style={{ color: 'var(--success-text)', fontWeight: 600 }}>✓ Đã upload</span> : <span style={{ color: 'var(--text-3)' }}>Chưa</span>}
                  </div>
                </div>
                {status === 'confirmed' &&
                <div className="info-cell" style={{ gridColumn: '1 / -1' }}>
                    <div className="info-label">Kế toán xác nhận lúc</div>
                    <div className="info-value">
                      <strong style={{ color: 'var(--success-text)' }}>{txn.paidAt}</strong> · Tiền đã về tài khoản PalFish
                    </div>
                  </div>
                }
                {status === 'rejected' &&
                <div className="info-cell" style={{ gridColumn: '1 / -1' }}>
                    <div className="info-label" style={{ color: 'var(--danger-text)' }}>Đã từ chối</div>
                    <div className="info-value" style={{ background: 'var(--danger-bg)', borderColor: 'var(--danger-bg)', color: 'var(--danger-text)' }}>
                      {txn.rejectReason || 'Không tìm thấy giao dịch khớp trên sao kê ngân hàng.'}
                    </div>
                  </div>
                }
              </div>
            </div>

            {/* Linked PR */}
            <div className="panel" style={{ padding: 16 }}>
              <div className="panel-head" style={{ marginBottom: 10 }}>
                <h4>Payment Request liên kết</h4>
              </div>
              <div className="linked-pr-card" onClick={() => onOpenPr && onOpenPr(pr)}>
                <div className="icon-block"><Icons.Wallet size={18} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>
                    {pr.id} · {pr.name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>
                    UID {pr.uid} · {country.flag} {country.dial} {fmtPhone(pr.phone)}
                  </div>
                  <div className="mini-prog">
                    <div style={{ width: `${pct}%` }} />
                  </div>
                  <div style={{ fontSize: 11, marginTop: 4, color: 'var(--text-3)' }}>
                    Đã nhận <strong style={{ color: 'var(--text)' }}>{window.MockData.VND(pr.received)}</strong> / {window.MockData.VND(pr.target)} ({pct}%)
                  </div>
                </div>
                <Icons.ChevronRight size={16} stroke="var(--text-3)" />
              </div>
            </div>
          </div>
        </div>

        <div className="drawer-foot">
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
            Xác nhận sẽ cập nhật trạng thái về <strong style={{ color: 'var(--success-text)' }}>Đã xác nhận</strong> trên Payment Request.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {status === 'awaiting' &&
            <>
                <button className="btn btn-outline" style={{ color: 'var(--danger)' }} onClick={() => onReject && onReject(txn, pr)}>
                  <Icons.XCircle size={14} /> Từ chối
                </button>
                <button className="btn btn-success" onClick={() => onConfirm && onConfirm(txn, pr)}>
                  <Icons.Check size={14} strokeWidth={2.5} /> Xác nhận tiền về
                </button>
              </>
            }
            {status === 'rejected' &&
            <button className="btn btn-outline" onClick={() => onConfirm && onConfirm(txn, pr)}>
                <Icons.History size={14} /> Mở lại — Xác nhận
              </button>
            }
            {status === 'confirmed' &&
            <button className="btn btn-outline" style={{ color: 'var(--danger)' }} onClick={() => onReject && onReject(txn, pr)}>
                <Icons.XCircle size={14} /> Hoàn tác xác nhận
              </button>
            }
            {status === 'unsent' &&
            <button className="btn btn-outline" disabled style={{ opacity: 0.5 }}>
                Đợi sales upload bill
              </button>
            }
            {status === 'cancelled' &&
            <button className="btn btn-outline" disabled style={{ opacity: 0.5 }}>
                <Icons.XCircle size={14} /> Đã huỷ bởi sales
              </button>
            }
          </div>
        </div>
        {lightboxBill && (
          <BillLightbox
            src={lightboxBill.src}
            name={lightboxBill.name}
            onClose={() => setLightboxBill(null)}
          />
        )}
      </aside>
    </>);

}

// ─────────── Main Reconciliation Page ───────────
function ReconciliationPage({ prs, onConfirmTxn, onRejectTxn, onOpenPr }) {
  const [tab, setTab] = rcUseState('awaiting'); // default: chờ xác nhận
  const [search, setSearch] = rcUseState('');
  const [methodFilter, setMethodFilter] = rcUseState('all');
  const [dateRange, setDateRange] = rcUseState({ from: '', to: '', preset: 'all' });
  const [selectedIds, setSelectedIds] = rcUseState(new Set());
  const [drawerTxn, setDrawerTxn] = rcUseState(null);
  const [drawerOpen, setDrawerOpen] = rcUseState(false);

  // Flatten all transactions from non-cancelled PRs
  const transactions = rcUseMemo(() => {
    return prs.filter((p) => !p.cancelled).flatMap((p) =>
    p.qrs.map((qr) => ({
      // unique key: prId + idx
      key: `${p.id}::${qr.idx}`,
      prId: p.id, prName: p.name, prUid: p.uid, prPhone: p.phone, prCountry: p.country,
      ...qr
    }))
    ).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [prs]);

  const counts = rcUseMemo(() => ({
    all: transactions.length,
    awaiting: transactions.filter((t) => txnDisplayStatus(t) === 'awaiting').length,
    confirmed: transactions.filter((t) => txnDisplayStatus(t) === 'confirmed').length,
    cancelled: transactions.filter((t) => {const s = txnDisplayStatus(t);return s === 'cancelled' || s === 'rejected';}).length,
    rejected: transactions.filter((t) => txnDisplayStatus(t) === 'rejected').length,
    unsent: 0
  }), [transactions]);

  const sums = rcUseMemo(() => ({
    awaiting: transactions.filter((t) => txnDisplayStatus(t) === 'awaiting').reduce((s, t) => s + t.amount, 0),
    confirmed: transactions.filter((t) => txnDisplayStatus(t) === 'confirmed').reduce((s, t) => s + t.amount, 0)
  }), [transactions]);

  // Apply filters
  const filtered = rcUseMemo(() => {
    return transactions.filter((t) => {
      const status = txnDisplayStatus(t);
      // "Đã huỷ" tab shows both sales-cancelled AND accountant-rejected
      if (tab === 'cancelled') {
        if (status !== 'cancelled' && status !== 'rejected') return false;
      } else if (tab !== 'all' && status !== tab) return false;
      if (methodFilter !== 'all' && (t.method || 'qr') !== methodFilter) return false;
      if (dateRange.from || dateRange.to) {
        const d = new Date((t.createdAt || '').replace(' ', 'T') + ':00');
        if (dateRange.from && d < new Date(dateRange.from + 'T00:00:00')) return false;
        if (dateRange.to && d > new Date(dateRange.to + 'T23:59:59')) return false;
      }
      if (search) {
        const s = search.toLowerCase();
        return (
          t.code.toLowerCase().includes(s) ||
          t.prId.toLowerCase().includes(s) ||
          t.prName.toLowerCase().includes(s) ||
          t.prUid.toLowerCase().includes(s) ||
          (t.bank || '').toLowerCase().includes(s));

      }
      return true;
    });
  }, [transactions, tab, search, methodFilter, dateRange]);

  // Reset selection when filter/tab changes
  rcUseEffect(() => {setSelectedIds(new Set());}, [tab, search, methodFilter, dateRange]);

  const handleSelect = (txn) => {
    setDrawerTxn(txn);
    setDrawerOpen(true);
  };
  const handleClose = () => setDrawerOpen(false);

  // Keep drawer txn in sync with prs (after confirm/reject)
  rcUseEffect(() => {
    if (!drawerTxn) return;
    const fresh = transactions.find((t) => t.key === drawerTxn.key);
    if (fresh && fresh !== drawerTxn) setDrawerTxn(fresh);
  }, [transactions]);

  const toggleSelect = (key) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);else next.add(key);
      return next;
    });
  };
  const toggleSelectAll = () => {
    const selectableIds = filtered.filter((t) => txnDisplayStatus(t) === 'awaiting').map((t) => t.key);
    setSelectedIds((prev) => {
      const allSelected = selectableIds.length > 0 && selectableIds.every((id) => prev.has(id));
      return allSelected ? new Set() : new Set(selectableIds);
    });
  };

  const handleBulkConfirm = () => {
    selectedIds.forEach((key) => {
      const t = transactions.find((x) => x.key === key);
      if (t) onConfirmTxn && onConfirmTxn(t);
    });
    setSelectedIds(new Set());
  };
  const handleBulkReject = () => {
    selectedIds.forEach((key) => {
      const t = transactions.find((x) => x.key === key);
      if (t) onRejectTxn && onRejectTxn(t);
    });
    setSelectedIds(new Set());
  };

  const tabConfig = [
  { id: 'awaiting', label: 'Chờ xác nhận', icon: 'Clock', attention: true },
  { id: 'confirmed', label: 'Đã xác nhận', icon: 'CheckCircle' },
  { id: 'cancelled', label: 'Đã huỷ', icon: 'XCircle' },
  { id: 'all', label: 'Tất cả', icon: 'Database' }];


  const methodChips = [
  { id: 'all', label: 'Mọi phương thức' },
  { id: 'qr', label: 'Chuyển khoản' },
  { id: 'cash', label: 'Tiền mặt' },
  { id: 'card', label: 'Quẹt thẻ' },
  { id: 'installment', label: 'Trả góp' }];


  // Find parent PR for any txn
  const findPr = (txn) => prs.find((p) => p.id === txn.prId);

  return (
    <div className="page">
      {/* Intro + KPI */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ fontSize: 12.5, color: 'var(--text-3)', maxWidth: 720, lineHeight: 1.55 }}>
          Kế toán đối chiếu từng giao dịch với <strong style={{ color: 'var(--text-2)' }}>sao kê ngân hàng / phiếu thu / báo cáo POS</strong>,
          xác nhận khi tiền đã thực sự về tài khoản PalFish.
          Mỗi lần xác nhận sẽ cập nhật ngay trạng thái lên Payment Request tương ứng.
        </div>
      </div>

      <div className="kpi-row">
        <div className="kpi">
          <div className="kpi-icon" style={{ background: 'var(--warning-bg)', color: 'var(--warning-text)' }}><Icons.Clock size={16} /></div>
          <div className="kpi-label">Chờ kế toán xác nhận</div>
          <div className="kpi-value">{counts.awaiting}</div>
          <div className="kpi-sub">{window.MockData.VND(sums.awaiting)} chờ đối soát</div>
        </div>
        <div className="kpi">
          <div className="kpi-icon" style={{ background: 'var(--success-bg)', color: 'var(--success-text)' }}><Icons.CheckCircle size={16} /></div>
          <div className="kpi-label">Đã xác nhận</div>
          <div className="kpi-value">{counts.confirmed}</div>
          <div className="kpi-sub">{window.MockData.VND(sums.confirmed)} tiền đã về</div>
        </div>
        <div className="kpi">
          <div className="kpi-icon" style={{ background: 'var(--danger-bg)', color: 'var(--danger-text)' }}><Icons.XCircle size={16} /></div>
          <div className="kpi-label">Từ chối</div>
          <div className="kpi-value">{counts.rejected}</div>
          <div className="kpi-sub">Không khớp sao kê</div>
        </div>
        <div className="kpi">
          <div className="kpi-icon"><Icons.Database size={16} /></div>
          <div className="kpi-label">Tổng giao dịch</div>
          <div className="kpi-value">{counts.all}</div>
          <div className="kpi-sub">{counts.unsent} chưa có bill</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="toolbar">
        <div className="search">
          <Icons.Search size={15} stroke="var(--text-3)" />
          <input
            placeholder="Tìm theo mã GD, PR-ID, tên khách hoặc ngân hàng…"
            value={search}
            onChange={(e) => setSearch(e.target.value)} />
          
        </div>
        {methodChips.map((c) =>
        <button
          key={c.id}
          className={`filter-chip ${methodFilter === c.id ? 'active' : ''}`}
          onClick={() => setMethodFilter(c.id)}>
          {c.label}</button>
        )}
        <div style={{ marginLeft: 'auto' }}>
          <DateRangeFilter value={dateRange} onChange={setDateRange} />
        </div>
      </div>

      <div className="table-card has-tabs">
        <div className="table-head with-tabs">
          <div className="tabs">
            {tabConfig.map((tc) => {
              const Ico = Icons[tc.icon];
              const isActive = tab === tc.id;
              return (
                <div
                  key={tc.id}
                  className={`tab ${isActive ? 'active' : ''}`}
                  onClick={() => setTab(tc.id)}>
                  
                  <Ico size={14} /> {tc.label}
                  <span className={`tab-count ${tc.attention && counts[tc.id] > 0 && !isActive ? 'is-attention' : ''}`}>{counts[tc.id]}</span>
                </div>);

            })}
          </div>
          <span className="right-meta">{filtered.length} kết quả</span>
        </div>

        {selectedIds.size > 0 &&
        <div className="bulk-bar">
            <Icons.CheckCircle size={16} />
            <span><span className="count">{selectedIds.size}</span> giao dịch đã chọn · Tổng {window.MockData.VND(
              [...selectedIds].reduce((s, k) => s + (transactions.find((t) => t.key === k)?.amount || 0), 0)
            )}</span>
            <div className="spacer" />
            <div className="bulk-actions">
              <button className="btn btn-outline btn-sm" onClick={() => setSelectedIds(new Set())}>Bỏ chọn</button>
              <button className="btn btn-outline btn-sm" style={{ color: 'var(--danger)' }} onClick={handleBulkReject}>
                <Icons.XCircle size={13} /> Từ chối đã chọn
              </button>
              <button className="btn btn-success btn-sm" onClick={handleBulkConfirm}>
                <Icons.Check size={13} strokeWidth={2.5} /> Xác nhận đã chọn
              </button>
            </div>
          </div>
        }

        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th className="check-col" onClick={(e) => e.stopPropagation()}>
                  {tab === 'awaiting' &&
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && filtered.filter((t) => txnDisplayStatus(t) === 'awaiting').every((t) => selectedIds.has(t.key))}
                    onChange={toggleSelectAll} />

                  }
                </th>
                <th style={{ width: 140 }}>Thời gian</th>
                <th style={{ width: 145 }}>Mã GD</th>
                <th style={{ minWidth: 200 }}>Payment Request</th>
                <th style={{ width: 150 }}>Phương thức</th>
                <th style={{ width: 165 }}>Ngân hàng / Chi tiết</th>
                <th style={{ width: 140, textAlign: 'right' }}>Số tiền</th>
                <th style={{ width: 80, textAlign: 'center' }}>Biên lai</th>
                <th style={{ width: 140 }}>Trạng thái</th>
                <th style={{ width: 100, textAlign: 'center' }}>Hành động</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 &&
              <tr>
                  <td colSpan={10}>
                    <div className="empty">
                      <Icons.CheckCircle size={20} />
                      <div>Không có giao dịch nào khớp với điều kiện lọc.</div>
                    </div>
                  </td>
                </tr>
              }
              {filtered.map((t) => {
                const status = txnDisplayStatus(t);
                const method = window.METHOD_META[t.method || 'qr'];
                const MIco = Icons[method.icon] || Icons.QrCode;
                const pr = findPr(t);
                return (
                  <tr
                    key={t.key}
                    className={drawerOpen && drawerTxn?.key === t.key ? 'selected' : ''}
                    onClick={() => handleSelect(t)}>
                    
                    <td className="check-col" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        disabled={status !== 'awaiting'}
                        checked={selectedIds.has(t.key)}
                        onChange={() => toggleSelect(t.key)} />
                      
                    </td>
                    <td>
                      <div className="cell-time">{t.createdAt?.split(' ')[0].split('-').reverse().join('/')}</div>
                      <div className="time-relative">{t.createdAt?.split(' ')[1]}</div>
                    </td>
                    <td><span className="cell-mono">{t.code}</span></td>
                    <td>
                      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, fontWeight: 700, color: 'var(--primary-700)' }}>
                        {t.prId}
                      </div>
                      <div className="cell-sub" style={{ color: 'var(--text-2)' }}>{t.prName}</div>
                    </td>
                    <td>
                      <span className={`method-badge ${method.cls}`}>
                        <MIco size={11} strokeWidth={2.2} /> {method.label}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
                        {t.method === 'cash' && (t.cashier ? `Người thu: ${t.cashier}` : '—')}
                        {t.method === 'card' && (t.cardLast4 ? `•••• ${t.cardLast4}` : t.bank || '—')}
                        {t.method === 'installment' && `${t.bank || '—'}`}
                        {t.method === 'qr' && (t.bank || '—')}
                      </div>
                      {t.method === 'installment' &&
                      <div className="cell-sub">{t.installmentMonths} tháng</div>
                      }
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="txn-amount" style={{ color: 'var(--money)' }}>
                        {window.MockData.VND(t.amount)}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`txn-bill-preview ${t.bill ? 'has' : ''}`} title={t.bill ? 'Có biên lai' : 'Chưa có biên lai'}>
                        {t.bill ? <Icons.Receipt /> : <Icons.Image />}
                      </span>
                    </td>
                    <td><TxnStatusBadge status={status} /></td>
                    <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                      {status === 'awaiting' ?
                      <div className="row-quick-actions">
                          <button
                          className="btn-icon-success"
                          title="Xác nhận tiền về"
                          onClick={() => onConfirmTxn && onConfirmTxn(t)}>
                          <Icons.Check size={14} strokeWidth={2.5} /></button>
                          <button
                          className="btn-icon-danger"
                          title="Từ chối"
                          onClick={() => onRejectTxn && onRejectTxn(t)}>
                          <Icons.Close size={14} strokeWidth={2.2} /></button>
                        </div> :

                      <button className="row-action" title="Xem chi tiết">
                          <Icons.ChevronRight size={15} />
                        </button>
                      }
                    </td>
                  </tr>);

              })}
            </tbody>
          </table>
        </div>
        <div className="pagi">
          <span>Hiển thị 1–{filtered.length} trong {counts[tab] || counts.all} kết quả</span>
          <div className="pagi-btns">
            <button className="pagi-btn"><Icons.ChevronLeft size={13} /></button>
            <button className="pagi-btn active">1</button>
            <button className="pagi-btn">2</button>
            <button className="pagi-btn">3</button>
            <button className="pagi-btn"><Icons.ChevronRight size={13} /></button>
          </div>
        </div>
      </div>

      <TxnDetailDrawer
        txn={drawerTxn}
        pr={drawerTxn ? findPr(drawerTxn) : null}
        open={drawerOpen}
        onClose={handleClose}
        onConfirm={(txn, pr) => onConfirmTxn && onConfirmTxn(txn)}
        onReject={(txn, pr) => onRejectTxn && onRejectTxn(txn)}
        onOpenPr={(pr) => {setDrawerOpen(false);onOpenPr && onOpenPr(pr);}} />
      
    </div>);

}

window.ReconciliationPage = ReconciliationPage;
window.TxnDetailDrawer = TxnDetailDrawer;
window.TxnStatusBadge = TxnStatusBadge;
window.txnDisplayStatus = txnDisplayStatus;