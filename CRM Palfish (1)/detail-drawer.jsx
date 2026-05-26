// detail-drawer.jsx — Payment Request detail (side drawer)

const METHOD_META = {
  qr: { cls: 'method-qr', label: 'Chuyển khoản', short: 'QR', icon: 'QrCode' },
  cash: { cls: 'method-cash', label: 'Tiền mặt', short: 'CASH', icon: 'Cash' },
  card: { cls: 'method-card', label: 'Quẹt thẻ', short: 'CARD', icon: 'Bank' },
  installment: { cls: 'method-installment', label: 'Trả góp', short: 'EMI', icon: 'Sigma' }
};
const METHOD_ORDER = ['qr', 'cash', 'card', 'installment'];

function MethodBadge({ method }) {
  const meta = METHOD_META[method] || METHOD_META.qr;
  const Ico = Icons[meta.icon] || Icons.QrCode;
  return (
    <span className={`method-badge ${meta.cls}`}>
      <Ico size={11} strokeWidth={2.2} /> {meta.label}
    </span>);

}

function QrThumb({ paid, method }) {
  const meta = METHOD_META[method] || METHOD_META.qr;
  const Ico = Icons[meta.icon] || Icons.QrCode;
  if (method !== 'qr') {
    return (
      <div className={`qr-thumb ${meta.cls}`} style={{ background: 'var(--mp-bg)', color: 'var(--mp-color)', borderColor: 'transparent' }}>
        <Ico size={26} strokeWidth={1.8} />
      </div>);

  }
  return (
    <div className={`qr-thumb ${paid ? 'paid' : 'pending'}`}>
      <svg viewBox="0 0 24 24" fill="none">
        <rect x="2" y="2" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
        <rect x="4" y="4" width="2" height="2" fill="currentColor" />
        <rect x="16" y="2" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
        <rect x="18" y="4" width="2" height="2" fill="currentColor" />
        <rect x="2" y="16" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
        <rect x="4" y="18" width="2" height="2" fill="currentColor" />
        <rect x="10" y="2" width="1.5" height="1.5" fill="currentColor" />
        <rect x="12" y="3" width="1.5" height="1.5" fill="currentColor" />
        <rect x="14" y="10" width="1.5" height="1.5" fill="currentColor" />
        <rect x="11" y="10" width="1.5" height="1.5" fill="currentColor" />
        <rect x="13" y="12" width="1.5" height="1.5" fill="currentColor" />
        <rect x="10" y="14" width="1.5" height="1.5" fill="currentColor" />
        <rect x="16" y="11" width="1.5" height="1.5" fill="currentColor" />
        <rect x="18" y="14" width="1.5" height="1.5" fill="currentColor" />
        <rect x="20" y="11" width="1.5" height="1.5" fill="currentColor" />
        <rect x="10" y="17" width="1.5" height="1.5" fill="currentColor" />
        <rect x="13" y="18" width="1.5" height="1.5" fill="currentColor" />
        <rect x="16" y="18" width="1.5" height="1.5" fill="currentColor" />
        <rect x="19" y="17" width="1.5" height="1.5" fill="currentColor" />
        <rect x="20" y="20" width="1.5" height="1.5" fill="currentColor" />
        <rect x="10" y="20" width="1.5" height="1.5" fill="currentColor" />
      </svg>
    </div>);

}

function QrRow({ qr, prId, onMarkPaid, onShowQr, onUploadBill, onCancelQr }) {
  const { VND } = window.MockData;
  const isQr = (qr.method || 'qr') === 'qr';
  const isCancelled = !!qr.cancelled;

  let pill;
  if (isCancelled) {
    pill = <span className="badge is-cancelled"><Icons.XCircle size={11} /> Đã huỷ</span>;
  } else if (qr.status === 'paid') {
    pill = <span className="badge is-done"><Icons.Check size={11} strokeWidth={2.5} /> Đã xác nhận</span>;
  } else {
    pill = <span className="badge is-over"><Icons.Clock size={11} /> Chờ xác nhận</span>;
  }

  return (
    <div className="qr-row v2" style={isCancelled ? { opacity: 0.55 } : null}>
      <QrThumb paid={qr.status === 'paid'} method={qr.method || 'qr'} />
      <div style={{ minWidth: 0 }}>
        <div className="qr-info-line1">
          <span style={{ fontWeight: 600, color: 'var(--text-3)', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
            Lần #{qr.idx}
          </span>
          <span className="amt">{VND(qr.amount)}</span>
          {pill}
        </div>
        <div className="qr-info-line2">
          <MethodBadge method={qr.method || 'qr'} />
          {isQr && <><span className="sep" /><span>{qr.bank}</span></>}
          <span className="sep" />
          <code>{qr.code}</code>
          <span className="sep" />
          <span>{qr.status === 'paid' ? `Xác nhận lúc ${qr.paidAt}` : `Tạo ${qr.createdAt}`}</span>
          {qr.status !== 'paid' && qr.bill && (
            <>
              <span className="sep" />
              <span
                onClick={(e) => { e.stopPropagation(); onMarkPaid(qr); }}
                title="Demo — thường do module Đối soát của kế toán thực hiện"
                style={{
                  color: 'var(--primary-700)', cursor: 'pointer',
                  textDecoration: 'underline', textDecorationStyle: 'dotted',
                  textUnderlineOffset: 2, whiteSpace: 'nowrap',
                }}
              >
                Mô phỏng kế toán xác nhận →
              </span>
            </>
          )}
        </div>
      </div>
      <div>
        <span
          className={`bill-upload ${qr.bill ? 'has-bill' : ''}`}
          onClick={(e) => {e.stopPropagation();onUploadBill(qr);}}
          title={qr.bill ? 'Đã có ảnh biên lai — nhấn để xem/thay' : 'Tải ảnh bill chuyển khoản / phiếu thu'}>

          {qr.bill ?
          <><Icons.Receipt size={13} /> Đã có biên lai</> :

          <><Icons.Upload size={13} /> Up ảnh bill</>
          }
        </span>
      </div>
      <div className="qr-actions">
        {isQr && !isCancelled && (
          <button className="btn btn-outline btn-sm" onClick={() => onShowQr(qr)}>
            <Icons.QrCode size={13} /> Xem QR
          </button>
        )}
        {!isCancelled && qr.status !== 'paid' && (
          <button
            className="btn btn-outline btn-sm"
            style={{ color: 'var(--danger)' }}
            title="Huỷ lần giao dịch này"
            onClick={() => onCancelQr && onCancelQr(qr)}
          >
            <Icons.XCircle size={13} /> Huỷ
          </button>
        )}
        {isCancelled && <span style={{ color: 'var(--text-3)', fontSize: 11.5 }}>—</span>}
      </div>
    </div>);

}

// "Tạo lần thanh toán" inline form
function AddPaymentForm({ pr, onCancel, onSubmit }) {
  const [method, setMethod] = React.useState('qr');
  const [amount, setAmount] = React.useState('');
  const [bank, setBank] = React.useState('MB Bank');
  const [cardLast4, setCardLast4] = React.useState('');
  const [installmentMonths, setInstallmentMonths] = React.useState('6');
  const [cashier, setCashier] = React.useState('');

  const remaining = Math.max(0, pr.target - pr.received);
  const { VND } = window.MockData;
  const nextIdx = (pr.qrs[pr.qrs.length - 1]?.idx || 0) + 1;
  const code = `TT-${pr.id.slice(-4)}-${String(nextIdx).padStart(3, '0')}`;

  const submit = () => {
    const n = parseInt(String(amount).replace(/\D/g, ''), 10);
    if (!n) return;
    const payload = {
      idx: nextIdx, amount: n, status: 'pending',
      createdAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
      paidAt: null, code, bill: false, method,
      bank: method === 'qr' ? bank : method === 'card' ? bank : '',
      cardLast4: method === 'card' ? cardLast4 : null,
      installmentMonths: method === 'installment' ? installmentMonths : null,
      cashier: method === 'cash' ? cashier : null
    };
    onSubmit(payload);
  };

  return (
    <div style={{
      border: '1px dashed var(--border-strong)', borderRadius: 10,
      padding: 14, background: 'var(--surface-2)', display: 'flex', flexDirection: 'column', gap: 12
    }}>
      <div>
        <div className="info-label" style={{ marginBottom: 8 }}>Phương thức thanh toán</div>
        <div className="method-grid">
          {METHOD_ORDER.map((k) => {
            const meta = METHOD_META[k];
            const Ico = Icons[meta.icon];
            return (
              <button
                key={k} type="button"
                className={`method-pick ${meta.cls} ${method === k ? 'active' : ''}`}
                onClick={() => setMethod(k)}>
                
                <span className="mp-icon"><Ico size={15} /></span>
                <span className="mp-label">{meta.label}</span>
                <span className="mp-sub">
                  {k === 'qr' && 'QR / chuyển khoản'}
                  {k === 'cash' && 'Thu trực tiếp'}
                  {k === 'card' && 'POS / thẻ tín dụng'}
                  {k === 'installment' && 'Trả nhiều kỳ'}
                </span>
              </button>);

          })}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div className="field" style={{ flex: 1, minWidth: 180 }}>
          <label>Số tiền lần này</label>
          <input
            type="text"
            placeholder={`Còn thiếu: ${VND(remaining)}`}
            value={amount}
            onChange={(e) => {
              const v = e.target.value.replace(/[^\d]/g, '');
              setAmount(v ? Number(v).toLocaleString('vi-VN') : '');
            }} />
          
        </div>

        {method === 'qr' &&
        <div className="field" style={{ flex: 1, minWidth: 180 }}>
            <label>Ngân hàng nhận</label>
            <select value={bank} onChange={(e) => setBank(e.target.value)}>
              <option>MB Bank</option>
              <option>Vietcombank</option>
              <option>Techcombank</option>
              <option>BIDV</option>
              <option>VPBank</option>
            </select>
          </div>
        }
        {method === 'card' &&
        <div className="field" style={{ flex: 1, minWidth: 180 }}>
            <label>4 số cuối thẻ</label>
            <input value={cardLast4} onChange={(e) => setCardLast4(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="•••• 4242" />
          </div>
        }
        {method === 'installment' &&
        <div className="field" style={{ flex: 1, minWidth: 180 }}>
            <label>Số kỳ trả góp</label>
            <select value={installmentMonths} onChange={(e) => setInstallmentMonths(e.target.value)}>
              <option value="3">3 tháng</option>
              <option value="6">6 tháng</option>
              <option value="9">9 tháng</option>
              <option value="12">12 tháng</option>
            </select>
          </div>
        }
        {method === 'cash' &&
        <div className="field" style={{ flex: 1, minWidth: 180 }}>
            <label>Người thu</label>
            <input value={cashier} onChange={(e) => setCashier(e.target.value)} placeholder="VD: Thu Hiền" />
          </div>
        }

        <div className="field" style={{ flex: 1.4, minWidth: 220 }}>
          <label>{method === 'qr' ? 'Nội dung CK gợi ý' : 'Mã đối soát nội bộ'}</label>
          <input
            type="text"
            value={code}
            readOnly
            style={{ color: 'var(--primary-700)', fontFamily: 'JetBrains Mono, monospace' }} />
          
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button className="btn btn-outline" onClick={onCancel}>Huỷ</button>
        <button className="btn btn-primary" onClick={submit}>
          <Icons.Sparkle size={14} /> {method === 'qr' ? 'Tạo QR & mã CK' : 'Ghi nhận lần thanh toán'}
        </button>
      </div>
    </div>);

}

function DetailDrawer({ pr, open, onClose, onUpdatePr, onShowQr, onCancelRequest, onCreateActiveRequest, onCreatePayment }) {
  const [showAdd, setShowAdd] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(null);
  const drawerBodyRef = React.useRef(null);
  const addFormRef = React.useRef(null);

  React.useEffect(() => { setShowAdd(false); setEditing(false); setDraft(null); }, [pr?.id]);

  // Scroll-to-form when AddPaymentForm becomes visible (e.g. from footer button)
  React.useEffect(() => {
    if (!showAdd) return;
    const id = setTimeout(() => {
      const body = drawerBodyRef.current;
      const target = addFormRef.current;
      if (!body || !target) return;
      const top =
        target.getBoundingClientRect().top -
        body.getBoundingClientRect().top + body.scrollTop;
      body.scrollTo({ top: top - 16, behavior: 'smooth' });
    }, 60);
    return () => clearTimeout(id);
  }, [showAdd]);

  if (!pr) return (
    <>
      <div className={`scrim ${open ? 'open' : ''}`} onClick={onClose} style={{ pointerEvents: open ? 'auto' : 'none' }} />
      <aside className={`drawer ${open ? 'open' : ''}`}></aside>
    </>);


  const { VND, fmtPhone } = window.MockData;
  const country = window.COUNTRIES.find((c) => c.code === (pr.country || 'VN')) || { dial: '+84', flag: '🇻🇳' };
  const remaining = Math.max(0, pr.target - pr.received);

  const handleAdd = (newQr) => {
    onUpdatePr({ ...pr, qrs: [...pr.qrs, newQr] });
    setShowAdd(false);
    if (onCreatePayment) onCreatePayment(pr);
  };

  const handleCancelQr = (qr) => {
    if (!confirm(`Huỷ lần giao dịch #${qr.idx} (${window.MockData.VND(qr.amount)})?\n\nGD sẽ vẫn hiện trong tab "Đã huỷ" ở mục Đối soát giao dịch.`)) return;
    onUpdatePr({
      ...pr,
      qrs: pr.qrs.map((q) => q.idx === qr.idx ? { ...q, cancelled: true, cancelledAt: new Date().toISOString().slice(0, 16).replace('T', ' ') } : q)
    });
  };

  const handleMarkPaid = (qr) => {
    onUpdatePr({
      ...pr,
      qrs: pr.qrs.map((q) => q.idx === qr.idx ? { ...q, status: 'paid', paidAt: new Date().toISOString().slice(0, 16).replace('T', ' '), bill: true } : q)
    });
  };

  const handleUploadBill = (qr) => {
    onUpdatePr({
      ...pr,
      qrs: pr.qrs.map((q) => q.idx === qr.idx ? { ...q, bill: !q.bill } : q)
    });
  };

  const canCancel = !pr.cancelled && pr.doneCount === 0;

  return (
    <>
      <div className={`scrim ${open ? 'open' : ''}`} onClick={onClose} style={{ pointerEvents: open ? 'auto' : 'none' }} />
      <aside className={`drawer ${open ? 'open' : ''}`}>
        <div className="drawer-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span className="pr-id-pill">{pr.id}</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{pr.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                Tạo bởi <strong style={{ color: 'var(--text-2)' }}>hieuhn.mplanner</strong> · {pr.createdAt}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <StatusBadge state={pr.state} />
            <button className="drawer-close" onClick={onClose}><Icons.Close size={16} /></button>
          </div>
        </div>

        <div className="drawer-body" ref={drawerBodyRef}>
          {/* Summary row */}
          <div className="summary-row">
            <div className="summary is-target">
              <div className="summary-label">Tổng dự kiến</div>
              <div className="summary-value">{VND(pr.target)}</div>
            </div>
            <div className="summary is-received">
              <div className="summary-label">Đã nhận</div>
              <div className="summary-value">{VND(pr.received)}</div>
            </div>
            <div className={`summary is-delta-${pr.state}`}>
              <div className="summary-label">
                {pr.state === 'over' ? 'Thừa' : pr.state === 'done' ? 'Chênh lệch' : 'Còn thiếu'}
              </div>
              <div className="summary-value">
                {pr.state === 'done' ? '0 đ' :
                pr.state === 'over' ? '+' + VND(Math.abs(pr.delta)) :
                VND(remaining)}
              </div>
            </div>
            <div className="summary">
              <div className="summary-label">Số lần thanh toán</div>
              <div className="summary-value">
                <span style={{ color: 'var(--primary-700)' }}>{pr.doneCount}</span>
                <span style={{ color: 'var(--text-muted)' }}>/</span>
                <span style={{ color: 'var(--text-2)' }}>{pr.totalCount}</span>
              </div>
            </div>
          </div>

          {/* B1 info */}
          <div className="panel">
            <div className="panel-head">
              <h4><Icons.User size={15} /> Thông tin khách hàng (B1)</h4>
              {!editing ? (
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => {
                    setDraft({
                      uid: pr.uid, name: pr.name, country: pr.country || 'VN',
                      phone: pr.phone, province: pr.province || '', ward: pr.ward || '',
                      address: pr.address || '', target: pr.target,
                      note: pr.note || '',
                    });
                    setEditing(true);
                  }}
                >
                  <Icons.Pencil size={13} /> Sửa
                </button>
              ) : (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => { setEditing(false); setDraft(null); }}
                  >Huỷ</button>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      onUpdatePr({ ...pr, ...draft, target: Number(String(draft.target).replace(/\D/g, '')) || pr.target });
                      setEditing(false); setDraft(null);
                    }}
                  ><Icons.Check size={13} strokeWidth={2.5} /> Lưu thay đổi</button>
                </div>
              )}
            </div>

            {!editing ? (
              <div className="info-grid">
                <div className="info-cell">
                  <div className="info-label">UID CRM</div>
                  <div className="info-value mono">{pr.uid}</div>
                </div>
                <div className="info-cell">
                  <div className="info-label">Tên khách hàng</div>
                  <div className="info-value">{pr.name}</div>
                </div>
                <div className="info-cell">
                  <div className="info-label">Số điện thoại</div>
                  <div className="info-value mono">
                    <span style={{ marginRight: 4 }}>{country.flag}</span>
                    {country.dial} {fmtPhone(pr.phone)}
                  </div>
                </div>
                <div className="info-cell">
                  <div className="info-label">Tỉnh / Thành phố</div>
                  <div className="info-value">{pr.province || '—'}</div>
                </div>
                <div className="info-cell">
                  <div className="info-label">Phường / Xã</div>
                  <div className="info-value">{pr.ward || '—'}</div>
                </div>
                <div className="info-cell">
                  <div className="info-label">Số nhà, đường</div>
                  <div className="info-value">{pr.address || '—'}</div>
                </div>
                <div className="info-cell">
                  <div className="info-label">Tổng tiền dự kiến</div>
                  <div className="info-value money">{VND(pr.target)}</div>
                </div>
                {pr.note &&
                <div className="info-cell full" style={{ gridColumn: '1 / -1' }}>
                    <div className="info-label">Ghi chú</div>
                    <div className="info-value">{pr.note}</div>
                  </div>
                }
                {pr.cancelled &&
                <div className="info-cell full" style={{ gridColumn: '1 / -1' }}>
                    <div className="info-label" style={{ color: 'var(--danger-text)' }}>Đã huỷ</div>
                    <div className="info-value" style={{ background: 'var(--danger-bg)', borderColor: 'var(--danger-bg)', color: 'var(--danger-text)' }}>
                      Huỷ lúc <strong>{pr.cancelledAt}</strong>{pr.cancelledReason ? ` · Lý do: ${pr.cancelledReason}` : ''}
                    </div>
                  </div>
                }
              </div>
            ) : (
              <div className="info-grid">
                <div className="info-cell">
                  <div className="info-label">UID CRM</div>
                  <input
                    value={draft.uid}
                    onChange={(e) => setDraft({ ...draft, uid: e.target.value })}
                    style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', font: 'inherit', fontFamily: 'JetBrains Mono, monospace', fontSize: 13 }}
                  />
                </div>
                <div className="info-cell">
                  <div className="info-label">Tên khách hàng</div>
                  <input
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', font: 'inherit', fontSize: 13 }}
                  />
                </div>
                <div className="info-cell">
                  <div className="info-label">Số điện thoại</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <CountryCombo value={draft.country} onChange={(v) => setDraft({ ...draft, country: v })} />
                    <input
                      value={draft.phone}
                      onChange={(e) => setDraft({ ...draft, phone: e.target.value.replace(/\D/g, '') })}
                      style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', font: 'inherit', fontSize: 13 }}
                    />
                  </div>
                </div>
                <div className="info-cell">
                  <div className="info-label">Tỉnh / Thành phố</div>
                  <input
                    value={draft.province}
                    onChange={(e) => setDraft({ ...draft, province: e.target.value })}
                    placeholder="Tỉnh / Thành phố"
                    style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', font: 'inherit', fontSize: 13 }}
                  />
                </div>
                <div className="info-cell">
                  <div className="info-label">Phường / Xã</div>
                  <input
                    value={draft.ward}
                    onChange={(e) => setDraft({ ...draft, ward: e.target.value })}
                    placeholder="Phường / Xã"
                    style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', font: 'inherit', fontSize: 13 }}
                  />
                </div>
                <div className="info-cell">
                  <div className="info-label">Số nhà, đường</div>
                  <input
                    value={draft.address}
                    onChange={(e) => setDraft({ ...draft, address: e.target.value })}
                    placeholder="VD: 119 Phúc Xá"
                    style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', font: 'inherit', fontSize: 13 }}
                  />
                </div>
                <div className="info-cell">
                  <div className="info-label">Tổng tiền dự kiến</div>
                  <input
                    value={typeof draft.target === 'number' ? draft.target.toLocaleString('vi-VN') : draft.target}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^\d]/g, '');
                      setDraft({ ...draft, target: v ? Number(v).toLocaleString('vi-VN') : '' });
                    }}
                    style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', font: 'inherit', fontSize: 13, color: 'var(--money)', fontWeight: 600 }}
                  />
                </div>
                <div className="info-cell full" style={{ gridColumn: '1 / -1' }}>
                  <div className="info-label">Ghi chú</div>
                  <textarea
                    value={draft.note}
                    onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                    placeholder="Ghi chú nội bộ"
                    style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', font: 'inherit', fontSize: 13, minHeight: 64, resize: 'vertical' }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Các lần thanh toán — moved ABOVE the timeline */}
          <div className="panel">
            <div className="panel-head">
              <h4>
                <Icons.Wallet size={15} /> Các lần thanh toán
                <span className="num-pill">{pr.qrs.length}</span>
              </h4>
              {!showAdd && !pr.cancelled &&
              <button className="btn btn-secondary btn-sm" onClick={() => setShowAdd(true)}>
                  <Icons.Plus size={13} /> Tạo lần thanh toán
                </button>
              }
            </div>

            <div>
              {pr.qrs.length === 0 && !showAdd &&
              <div className="empty" style={{ padding: '28px 12px' }}>
                  <Icons.Wallet size={22} />
                  <div>Chưa có lần thanh toán nào.</div>
                  {!pr.cancelled &&
                <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>
                      <Icons.Plus size={13} /> Tạo lần thanh toán đầu tiên
                    </button>
                }
                </div>
              }
              {pr.qrs.map((qr) =>
              <QrRow
                key={qr.idx}
                qr={qr}
                prId={pr.id}
                onMarkPaid={handleMarkPaid}
                onShowQr={onShowQr}
                onUploadBill={handleUploadBill}
                onCancelQr={handleCancelQr} />

              )}
            </div>

            {showAdd &&
            <div style={{ marginTop: 12 }} ref={addFormRef}>
                <AddPaymentForm pr={pr} onCancel={() => setShowAdd(false)} onSubmit={handleAdd} />
              </div>
            }
          </div>

          {/* Timeline (moved below payments) */}
          <div className="panel">
            <div className="panel-head">
              <h4><Icons.Sigma size={15} /> Tiến độ quy trình</h4>
            </div>
            <div className="timeline">
              <div className="tl-item">
                <div className="tl-dot done" />
                <div className="tl-content">
                  <div className="tl-title">B1 · Tạo Payment Request</div>
                  <div className="tl-meta">PR-ID đã được tạo · {pr.createdAt}</div>
                </div>
              </div>
              <div className="tl-item">
                <div className={`tl-dot ${pr.state === 'done' || pr.state === 'over' ? 'done' : pr.cancelled ? 'pending' : 'active'}`} />
                <div className="tl-content">
                  <div className="tl-title">B2 · Tạo lần thanh toán &amp; thu tiền</div>
                  <div className="tl-meta">
                    Đã nhận {VND(pr.received)} / {VND(pr.target)} ·
                    {' '}{pr.doneCount}/{pr.totalCount} lần
                  </div>
                </div>
              </div>
              <div className="tl-item">
                <div className={`tl-dot ${pr.state === 'done' || pr.state === 'over' ? 'active' : 'pending'}`} />
                <div className="tl-content">
                  <div className="tl-title">B3 · Active Request (Tạo khoá học)</div>
                  <div className="tl-meta">
                    {pr.state === 'done' || pr.state === 'over' ?
                    'Sẵn sàng kích hoạt — bấm "Tạo Active Request" để mở khoá học' :
                    'Sẽ mở khoá khi đủ 100% tiền'}
                  </div>
                </div>
              </div>
              <div className="tl-item">
                <div className="tl-dot pending" />
                <div className="tl-content">
                  <div className="tl-title">B4 · Yêu cầu xuất hoá đơn</div>
                  <div className="tl-meta">Sẽ xuất sau khi đủ tiền &amp; có Active code</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="drawer-foot">
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-outline btn-sm"><Icons.Copy size={13} /> Copy PR-ID</button>
            {canCancel &&
            <button
              className="btn btn-outline btn-sm"
              style={{ color: 'var(--danger)' }}
              onClick={() => onCancelRequest && onCancelRequest(pr)}>
              
                <Icons.XCircle size={13} /> Huỷ Payment Request
              </button>
            }
          </div>
          <div className="quick-create">
            {!pr.cancelled &&
            <button className="btn btn-primary" onClick={() => setShowAdd(true)} disabled={showAdd}>
                <Icons.Plus size={14} /> Tạo lần thanh toán
              </button>
            }
            <button
              className={`btn ${pr.state === 'done' || pr.state === 'over' ? 'btn-success' : 'btn-outline'}`}
              disabled={pr.state !== 'done' && pr.state !== 'over'}
              onClick={() => onCreateActiveRequest && onCreateActiveRequest(pr)}>
              
              <Icons.CheckSquare size={14} /> Tạo Active Request (B3)
            </button>
          </div>
        </div>
      </aside>
    </>);

}

window.DetailDrawer = DetailDrawer;
window.QrThumb = QrThumb;
window.MethodBadge = MethodBadge;
window.METHOD_META = METHOD_META;