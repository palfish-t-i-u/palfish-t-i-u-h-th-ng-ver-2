// active-request.jsx — Kích hoạt khoá học (B3)

const arDateRangeFilter = window.DateRangeFilter;
const ArCountryCombo = window.CountryCombo;

// ─────────── Helpers ───────────
function flatCourses(ar) {
  return ar.uids.flatMap((u) => u.courses.map((c) => ({ ...c, uid: u.uid })));
}

function arStatus(ar) {
  const all = flatCourses(ar);
  if (all.length === 0) return 'pending_order';
  const ordered = all.filter((c) => c.orderId && c.orderId.trim()).length;
  if (ordered === 0) return 'pending_order';
  if (ordered === all.length) return 'ready_invoice';
  return 'partial_order';
}

function arTotal(ar) {
  return flatCourses(ar).reduce((s, c) => s + (c.amount || 0), 0);
}

function nextCourseCode(ar) {
  const all = flatCourses(ar);
  const arNumPart = ar.id.replace(/[^\d]/g, '').slice(-4) || '0000';
  return `CC-${arNumPart}-${String(all.length + 1).padStart(3, '0')}`;
}

const AR_STATUS_META = {
  pending_order: { cls: 'is-ar-pending', text: 'Chờ tạo đơn', icon: 'Clock' },
  partial_order: { cls: 'is-ar-partial', text: 'Đang điền Order ID', icon: 'Pencil' },
  ready_invoice: { cls: 'is-ar-ready', text: 'Sẵn sàng xuất HĐ', icon: 'CheckCircle' },
  invoiced: { cls: 'is-ar-invoiced', text: 'Đã xuất hoá đơn', icon: 'Doc' }
};

function ARStatusBadge({ status }) {
  const meta = AR_STATUS_META[status] || AR_STATUS_META.pending_order;
  return (
    <span className={`badge ${meta.cls}`}>
      <span className="dot" />{meta.text}
    </span>);

}

// ─────────── PR search combobox (for linking AR ↔ PR) ───────────
function PrSearchCombo({ prs, value, onChange, allowNone = true }) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    const close = (e) => {if (ref.current && !ref.current.contains(e.target)) setOpen(false);};
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const selectedPr = value ? prs.find((p) => p.id === value) : null;
  const filtered = prs.filter((p) => !p.cancelled).filter((p) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return p.id.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) || p.uid.toLowerCase().includes(q) || p.phone.includes(q);
  });

  return (
    <div className="pr-search-wrap" ref={ref}>
      <div
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          border: '1px solid var(--border)', borderRadius: 8,
          padding: '9px 11px', background: 'white', cursor: 'pointer',
          minHeight: 40
        }}>
        
        {selectedPr ?
        <>
            <span className="pr-id-pill">{selectedPr.id}</span>
            <span style={{ flex: 1, fontSize: 13, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedPr.name}</span>
            <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
              {window.MockData.VND(selectedPr.target)} · {selectedPr.state === 'done' ? '✓ Đủ' : selectedPr.state === 'over' ? '⚠ Thừa' : '✗ Chưa đủ'}
            </span>
          </> :

        <span style={{ flex: 1, color: 'var(--text-3)', fontSize: 13 }}>Tìm theo PR-ID, tên, UID, SĐT…</span>
        }
        <Icons.ChevronDown size={14} stroke="var(--text-3)" />
      </div>
      {open &&
      <div className="pr-search-pop">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
            <Icons.Search size={13} stroke="var(--text-3)" />
            <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Lọc nhanh…"
            style={{ flex: 1, border: 0, outline: 'none', font: 'inherit', fontSize: 13 }} />
          
          </div>
          {allowNone &&
        <div className="pr-search-opt" onClick={() => {onChange(null);setOpen(false);}}>
              <span className="pr-id-text" style={{ color: 'var(--text-3)' }}>— Không liên kết PR —</span>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Standalone</span>
              <span className="pr-meta">AR sẽ không có Payment Request gắn kèm</span>
            </div>
        }
          {filtered.length === 0 && <div style={{ padding: 12, color: 'var(--text-3)', fontSize: 12 }}>Không tìm thấy PR khớp.</div>}
          {filtered.map((p) =>
        <div key={p.id} className="pr-search-opt" onClick={() => {onChange(p.id);setOpen(false);}}>
              <span className="pr-id-text">{p.id}</span>
              <span style={{ fontSize: 12.5, color: 'var(--text-2)', textAlign: 'right' }}>{window.MockData.VND(p.target)}</span>
              <span className="pr-meta">{p.name} · UID {p.uid} · {p.state === 'done' ? 'Đủ tiền' : p.state === 'over' ? 'Thừa' : p.state === 'short' ? `Còn thiếu ${window.MockData.VND(p.target - p.received)}` : 'Chưa thanh toán'}</span>
            </div>
        )}
        </div>
      }
    </div>);

}

// ─────────── AR Drawer — main edit surface ───────────
function ARDrawer({ ar, pr, open, onClose, onUpdate, onOpenPr }) {
  if (!ar) return (
    <>
      <div className={`scrim ${open ? 'open' : ''}`} onClick={onClose} style={{ pointerEvents: open ? 'auto' : 'none' }} />
      <aside className={`drawer ${open ? 'open' : ''}`}></aside>
    </>);


  const { VND, fmtPhone } = window.MockData;
  const status = arStatus(ar);
  const total = arTotal(ar);
  const allCourses = flatCourses(ar);
  const orderedCount = allCourses.filter((c) => c.orderId && c.orderId.trim()).length;
  const invoicedCount = allCourses.filter((c) => c.invoiced).length;
  // Match check vs PR.received (real money received), NOT target.
  // Negative gap = leftover money for future PR offset; positive = need more money.
  const receivedGap = pr ? total - pr.received : 0;

  const updateCourse = (uidIdx, courseIdx, patch) => {
    const nextUids = ar.uids.map((u, i) => {
      if (i !== uidIdx) return u;
      return {
        ...u,
        courses: u.courses.map((c, j) => j === courseIdx ? { ...c, ...patch } : c)
      };
    });
    onUpdate({ ...ar, uids: nextUids });
  };

  const removeCourse = (uidIdx, courseIdx) => {
    const u = ar.uids[uidIdx];
    if (u.courses.length === 1 && ar.uids.length === 1) return; // keep at least 1
    const nextUid = { ...u, courses: u.courses.filter((_, j) => j !== courseIdx) };
    const nextUids = nextUid.courses.length === 0 ?
    ar.uids.filter((_, i) => i !== uidIdx) :
    ar.uids.map((u2, i) => i === uidIdx ? nextUid : u2);
    onUpdate({ ...ar, uids: nextUids });
  };

  const addCourse = (uidIdx) => {
    const newCode = nextCourseCode(ar);
    const u = ar.uids[uidIdx];
    const remaining = pr ? Math.max(0, pr.target - total) : 0;
    const nextUid = {
      ...u,
      courses: [...u.courses, {
        courseCode: newCode,
        packageName: '',
        amount: remaining || 0,
        orderId: ''
      }]
    };
    onUpdate({ ...ar, uids: ar.uids.map((u2, i) => i === uidIdx ? nextUid : u2) });
  };

  const addUid = () => {
    const newCode = nextCourseCode({ ...ar, uids: ar.uids });
    const remaining = pr ? Math.max(0, pr.target - total) : 0;
    onUpdate({
      ...ar,
      uids: [...ar.uids, {
        uid: '',
        courses: [{
          courseCode: newCode,
          packageName: '',
          amount: remaining || 0,
          orderId: ''
        }]
      }]
    });
  };

  const updateUidValue = (uidIdx, newUid) => {
    onUpdate({ ...ar, uids: ar.uids.map((u, i) => i === uidIdx ? { ...u, uid: newUid } : u) });
  };

  const updateUidPhone = (uidIdx, phone) => {
    onUpdate({ ...ar, uids: ar.uids.map((u, i) => i === uidIdx ? { ...u, phone: phone.replace(/\D/g, '') } : u) });
  };

  const updateUidCountry = (uidIdx, country) => {
    onUpdate({ ...ar, uids: ar.uids.map((u, i) => i === uidIdx ? { ...u, country } : u) });
  };

  const invoiceCourse = (uidIdx, courseIdx) => {
    // Auto-generate INV ID; in real life this comes from B4 invoicing module
    const seq = String(100 + invoicedCount + 1);
    const invId = `INV-2026-1${seq.slice(-3)}`;
    updateCourse(uidIdx, courseIdx, { invoiced: true, invoiceId: invId });
  };

  const unInvoiceCourse = (uidIdx, courseIdx) => {
    updateCourse(uidIdx, courseIdx, { invoiced: false, invoiceId: '' });
  };

  return (
    <>
      <div className={`scrim ${open ? 'open' : ''}`} onClick={onClose} style={{ pointerEvents: open ? 'auto' : 'none' }} />
      <aside className={`drawer ${open ? 'open' : ''}`} style={{ width: 'min(1020px, 96vw)' }}>
        <div className="drawer-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span className="ar-id-pill">{ar.id}</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{ar.customerName}</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                {pr ? <>Liên kết <strong style={{ color: 'var(--primary-700)' }}>{pr.id}</strong> · </> : <>Standalone · </>}
                Tạo bởi <strong style={{ color: 'var(--text-2)' }}>{ar.createdBy}</strong> · {ar.createdAt}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <ARStatusBadge status={status} />
            <button className="drawer-close" onClick={onClose}><Icons.Close size={16} /></button>
          </div>
        </div>

        <div className="drawer-body ar-drawer-body">
          {/* Summary */}
          <div className="summary-row" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
            <div className="summary">
              <div className="summary-label">Tổng giá trị courses</div>
              <div className="summary-value" style={{ color: 'var(--money)' }}>{VND(total)}</div>
            </div>
            {pr &&
            <div className={`summary ${receivedGap === 0 ? 'is-delta-done' : receivedGap > 0 ? 'is-delta-short' : 'is-delta-over'}`}>
                <div className="summary-label">So với đã nhận</div>
                <div className="summary-value">
                  {receivedGap === 0 ? '✓ Khớp' :
                receivedGap > 0 ? `Thiếu ${VND(receivedGap)}` :
                `Dư ${VND(Math.abs(receivedGap))}`}
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 2 }}>
                  PR đã nhận {VND(pr.received)}
                </div>
              </div>
            }
            <div className="summary">
              <div className="summary-label">Số UID · Khoá học</div>
              <div className="summary-value">
                <span style={{ color: 'var(--primary-700)' }}>{ar.uids.length}</span>
                <span style={{ color: 'var(--text-muted)', margin: '0 4px' }}>·</span>
                <span style={{ color: 'var(--text)' }}>{allCourses.length}</span>
              </div>
            </div>
            <div className="summary">
              <div className="summary-label">Order ID đã điền</div>
              <div className="summary-value">
                <span style={{ color: orderedCount === allCourses.length && allCourses.length > 0 ? 'var(--success-text)' : 'var(--warning-text)' }}>{orderedCount}</span>
                <span style={{ color: 'var(--text-muted)', margin: '0 4px' }}>/</span>
                <span style={{ color: 'var(--text-2)' }}>{allCourses.length}</span>
              </div>
            </div>
            <div className="summary">
              <div className="summary-label">Đã xuất hoá đơn</div>
              <div className="summary-value">
                <span style={{ color: 'var(--success-text)' }}>{invoicedCount}</span>
                <span style={{ color: 'var(--text-muted)', margin: '0 4px' }}>/</span>
                <span style={{ color: 'var(--text-2)' }}>{allCourses.length}</span>
              </div>
            </div>
          </div>

          {/* Match check vs PR.received (real money in) */}
          {pr && (
          receivedGap === 0 && pr.received > 0 ?
          <div className="match-ok">
                <Icons.CheckCircle size={16} />
                <span>Tổng courses (<strong>{VND(total)}</strong>) khớp với <strong>{VND(pr.received)}</strong> đã nhận từ PR — sẵn sàng cho B4.</span>
              </div> :

          receivedGap > 0 ?
          <div className="match-warning">
                <Icons.AlertCircle size={16} />
                <span>Tổng courses (<strong>{VND(total)}</strong>) đang <strong>nhiều hơn</strong> tiền đã nhận ({VND(pr.received)}) — thiếu <strong>{VND(receivedGap)}</strong>. Cần chờ khách CK thêm hoặc giảm bớt khoá học trước khi xuất hoá đơn.</span>
              </div> :

          <div className="match-warning" style={{ background: 'var(--info-bg)', borderColor: '#a8c5f0', color: 'var(--info-text)' }}>
                <Icons.AlertCircle size={16} />
                <span>Tổng courses (<strong>{VND(total)}</strong>) <strong>ít hơn</strong> tiền đã nhận ({VND(pr.received)}) — phần dư <strong>{VND(Math.abs(receivedGap))}</strong> sẽ được giữ lại để cấn trừ cho PR tương lai của khách.</span>
              </div>)

          }

          {/* Linked PR card */}
          {pr ?
          <div className="panel" style={{ padding: 14 }}>
              <div className="panel-head" style={{ marginBottom: 10 }}>
                <h4><Icons.Wallet size={15} /> Payment Request liên kết</h4>
                <button className="btn btn-outline btn-sm" onClick={() => onOpenPr && onOpenPr(pr)}>
                  <Icons.ArrowRight size={13} /> Mở PR
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
                <div className="info-cell"><div className="info-label">PR-ID</div><div className="info-value mono"><span className="pr-id-pill">{pr.id}</span></div></div>
                <div className="info-cell"><div className="info-label">Tổng dự kiến</div><div className="info-value money">{VND(pr.target)}</div></div>
                <div className="info-cell"><div className="info-label">Đã nhận</div><div className="info-value money" style={{ color: 'var(--success-text)' }}>{VND(pr.received)}</div></div>
                <div className="info-cell"><div className="info-label">Số lần TT</div><div className="info-value">{pr.doneCount}/{pr.totalCount}</div></div>
              </div>
            </div> :

          <div className="panel" style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
              width: 36, height: 36, borderRadius: 9,
              background: 'var(--surface-3)', color: 'var(--text-3)',
              display: 'grid', placeItems: 'center'
            }}>
                <Icons.AlertCircle size={16} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>Active Request standalone</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
                  AR này không gắn với Payment Request — admin tự nhập từ kênh khác (sao kê tay, đối tác, v.v.).
                </div>
              </div>
            </div>
          }

          {/* UID groups */}
          {ar.uids.map((u, uidIdx) =>
          <div key={uidIdx} className="uid-group">
              <div className="uid-group-head">
                <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
                  UID #{uidIdx + 1}
                </div>
                <input
                className="uid-mono"
                value={u.uid}
                onChange={(e) => updateUidValue(uidIdx, e.target.value)}
                placeholder="Nhập UID học viên…"
                style={{ width: 180, fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 700, padding: '4px 10px' }} />
                <span style={{ width: 1, height: 22, background: 'var(--border-strong)' }}></span>
                <span style={{ fontSize: 10.5, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>SĐT</span>
                {ArCountryCombo &&
              <ArCountryCombo
                value={u.country || 'VN'}
                onChange={(v) => updateUidCountry(uidIdx, v)} />

              }
                <input
                value={u.phone || ''}
                onChange={(e) => updateUidPhone(uidIdx, e.target.value)}
                placeholder="9xx xxx xxx"
                style={{
                  width: 140, fontFamily: 'JetBrains Mono, monospace', fontSize: 12.5,
                  border: '1px solid var(--border)', borderRadius: 8,
                  padding: '7px 10px', outline: 'none', background: 'white',
                  fontVariantNumeric: 'tabular-nums'
                }} />
              
                {uidIdx === 0 && pr && u.uid === pr.uid &&
              <span className="badge is-soft-primary" style={{ fontSize: 10 }}>
                    <Icons.Check size={10} strokeWidth={2.5} /> UID từ PR
                  </span>
              }
                <span className="spacer" />
                <span className="num-pill">{u.courses.length} khoá</span>
                {ar.uids.length > 1 &&
              <button
                className="btn btn-outline btn-sm"
                style={{ color: 'var(--danger)' }}
                onClick={() => onUpdate({ ...ar, uids: ar.uids.filter((_, i) => i !== uidIdx) })}>

                    <Icons.XCircle size={13} /> Xoá UID
                  </button>
              }
              </div>
              <div className="course-row-head">
                <span></span>
                <span>Gói học</span>
                <span style={{ textAlign: 'right' }}>Số tiền</span>
                <span>Course Code</span>
                <span>Order ID</span>
                <span>Xuất HĐ</span>
                <span></span>
              </div>
              {u.courses.map((c, courseIdx) =>
            <div key={courseIdx} className="course-row">
                  <div className="idx-bubble">{courseIdx + 1}</div>
                  <div className="pkg-name">
                    <input
                  list={`packages-${ar.id}`}
                  value={c.packageName}
                  onChange={(e) => updateCourse(uidIdx, courseIdx, { packageName: e.target.value })}
                  placeholder="VD: 2/W- NEW 48 US-UK+2 HN" />
                
                  </div>
                  <input
                className="amt-input"
                value={c.amount ? Number(c.amount).toLocaleString('vi-VN') : ''}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^\d]/g, '');
                  updateCourse(uidIdx, courseIdx, { amount: v ? Number(v) : 0 });
                }}
                placeholder="0" />
              
                  <span className="code-chip cc">
                    <Icons.Sparkle size={11} /> {c.courseCode}
                  </span>
                  <input
                className={`order-input ${c.orderId && c.orderId.trim() ? 'has' : ''}`}
                value={c.orderId || ''}
                onChange={(e) => updateCourse(uidIdx, courseIdx, { orderId: e.target.value })}
                placeholder="ORD-XXXX-XXXXX"
                title="Admin điền sau khi tạo đơn ở hệ thống khác" />
              
                  <div className="invoice-cell">
                    {c.invoiced ?
                <span
                  className="invoice-chip"
                  onClick={() => unInvoiceCourse(uidIdx, courseIdx)}
                  title="Đã xuất HĐ. Click để huỷ phát hành (demo).">
                  
                        <Icons.Doc size={11} /> {c.invoiceId}
                      </span> :

                <button
                  className="btn-invoice"
                  disabled={!(c.orderId && c.orderId.trim())}
                  title={c.orderId ? 'Xuất hóa đơn cho khoá này' : 'Cần điền Order ID trước'}
                  onClick={() => invoiceCourse(uidIdx, courseIdx)}>
                  
                        <Icons.Doc size={12} /> Xuất HĐ
                      </button>
                }
                  </div>
                  <button
                className="remove-btn"
                onClick={() => removeCourse(uidIdx, courseIdx)}
                title="Xoá khoá học">
                
                    <Icons.Close size={14} />
                  </button>
                </div>
            )}
              <datalist id={`packages-${ar.id}`}>
                {(window.COURSE_PACKAGES || []).map((p) => <option key={p} value={p} />)}
              </datalist>
              <div className="uid-group-foot">
                <span className="uid-add-link" onClick={() => addCourse(uidIdx)}>
                  <Icons.Plus size={13} /> Thêm gói học cho UID này
                </span>
                <span style={{ color: 'var(--text-3)' }}>
                  Tổng UID này: <strong style={{ color: 'var(--text)' }}>{VND(u.courses.reduce((s, c) => s + (c.amount || 0), 0))}</strong>
                </span>
              </div>
            </div>
          )}

          <div className="add-uid-card" onClick={addUid}>
            <Icons.Plus size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
            Thêm UID khác (cho phép 1 PR mua nhiều khoá cho nhiều người)
          </div>
        </div>

        <div className="drawer-foot">
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-outline btn-sm"><Icons.Copy size={13} /> Copy AR-ID</button>
            <button className="btn btn-outline btn-sm" style={{ color: 'var(--danger)' }}>Huỷ AR</button>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className={`btn ${status === 'ready_invoice' ? 'btn-success' : 'btn-outline'}`}
              disabled={status !== 'ready_invoice'}>
              
              <Icons.Doc size={14} /> Yêu cầu xuất hoá đơn (B4)
            </button>
          </div>
        </div>
      </aside>
    </>);

}

// ─────────── Create AR Modal ───────────
function ARCreateModal({ open, onClose, prs, prefillPr, onCreate }) {
  const [linkedPrId, setLinkedPrId] = React.useState(null);
  const [firstUid, setFirstUid] = React.useState('');
  const [pkgName, setPkgName] = React.useState('');
  const [amount, setAmount] = React.useState('');
  const [customerName, setCustomerName] = React.useState('');

  React.useEffect(() => {
    if (!open) return;
    if (prefillPr) {
      setLinkedPrId(prefillPr.id);
      setFirstUid(prefillPr.uid);
      setCustomerName(prefillPr.name);
      setAmount(prefillPr.target ? prefillPr.target.toLocaleString('vi-VN') : '');
      setPkgName('');
    } else {
      setLinkedPrId(null);
      setFirstUid('');
      setCustomerName('');
      setAmount('');
      setPkgName('');
    }
  }, [open, prefillPr]);

  if (!open) return null;

  const linkedPr = linkedPrId ? prs.find((p) => p.id === linkedPrId) : null;
  const amountNum = parseInt(String(amount).replace(/\D/g, ''), 10) || 0;
  const canSubmit = firstUid && pkgName && amountNum > 0 && (linkedPr ? true : customerName);

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" style={{ width: 'min(720px, 100%)' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h3>Tạo Active Request mới</h3>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              Bước 3 · Đăng ký khoá học cho UID khách hàng, hệ thống xuất ra Course Code dùng để đối chiếu hoá đơn.
            </div>
          </div>
          <button className="drawer-close" onClick={onClose}><Icons.Close size={16} /></button>
        </div>
        <div className="modal-body">
          <div className="field">
            <label>Liên kết Payment Request <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>(khuyến nghị)</span></label>
            <PrSearchCombo
              prs={prs}
              value={linkedPrId}
              onChange={(id) => {
                setLinkedPrId(id);
                if (id) {
                  const p = prs.find((x) => x.id === id);
                  if (p) {setFirstUid(p.uid);setCustomerName(p.name);if (!amount) setAmount(p.target.toLocaleString('vi-VN'));}
                }
              }} />
            
            {linkedPr && linkedPr.state !== 'done' && linkedPr.state !== 'over' &&
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--warning-text)', display: 'flex', gap: 6, alignItems: 'center' }}>
                <Icons.AlertCircle size={13} /> PR này chưa thanh toán đủ — thường chỉ kích hoạt khi đủ tiền. Vẫn cho phép tạo để demo.
              </div>
            }
          </div>

          {!linkedPr &&
          <div className="field">
              <label>Tên khách hàng <span style={{ color: 'var(--danger)' }}>*</span></label>
              <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Họ và tên" />
            
            </div>
          }

          <div style={{
            border: '1px solid var(--border)', borderRadius: 10, padding: 14,
            background: 'var(--surface-2)'
          }}>
            <div className="info-label" style={{ marginBottom: 10 }}>Khoá học đầu tiên</div>
            <div className="field-row" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 10 }}>
              <div className="field">
                <label>UID học viên <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input
                  value={firstUid}
                  onChange={(e) => setFirstUid(e.target.value)}
                  placeholder="UID CRM hoặc UID nội bộ"
                  style={{ fontFamily: 'JetBrains Mono, monospace' }} />
                
                {linkedPr && firstUid === linkedPr.uid &&
                <div style={{ fontSize: 11, color: 'var(--primary-700)', marginTop: 4 }}>
                    ✓ UID 1 lấy từ PR (có thể sửa).
                  </div>
                }
              </div>
              <div className="field">
                <label>Số tiền khoá học <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input
                  value={amount}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^\d]/g, '');
                    setAmount(v ? Number(v).toLocaleString('vi-VN') : '');
                  }}
                  placeholder="VD: 12.000.000" />
                
              </div>
            </div>
            <div className="field">
              <label>Gói học <span style={{ color: 'var(--danger)' }}>*</span></label>
              <input
                list="ar-create-packages"
                value={pkgName}
                onChange={(e) => setPkgName(e.target.value)}
                placeholder="Bắt đầu nhập hoặc chọn từ danh sách…" />
              
              <datalist id="ar-create-packages">
                {(window.COURSE_PACKAGES || []).map((p) => <option key={p} value={p} />)}
              </datalist>
            </div>
          </div>

          <div style={{
            background: 'var(--primary-50)', border: '1px solid var(--primary-100)',
            borderRadius: 10, padding: '10px 12px', display: 'flex', gap: 10, alignItems: 'flex-start'
          }}>
            <Icons.AlertCircle size={16} stroke="var(--primary-700)" />
            <div style={{ fontSize: 12, color: 'var(--primary-700)', lineHeight: 1.5 }}>
              Sau khi tạo, hệ thống sinh <strong>Course Code</strong> tự động. Bạn có thể thêm UID khác / khoá học khác trong trang chi tiết.
              Order ID sẽ được Admin điền tay sau khi tạo đơn ở hệ thống khác.
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-outline" onClick={onClose}>Huỷ</button>
          <button
            className="btn btn-primary"
            disabled={!canSubmit}
            style={!canSubmit ? { opacity: 0.4, cursor: 'not-allowed' } : {}}
            onClick={() => canSubmit && onCreate({
              prId: linkedPrId,
              customerName: linkedPr ? linkedPr.name : customerName,
              uid: firstUid,
              packageName: pkgName,
              amount: amountNum
            })}>
            
            <Icons.Plus size={14} /> Tạo AR &amp; mở chi tiết
          </button>
        </div>
      </div>
    </div>);

}

// ─────────── AR list page ───────────
function ActivationPage({ ars, prs, onUpdateAr, onCreateAr, onOpenPr, openArId, onOpenAr }) {
  const [search, setSearch] = React.useState('');
  const [tab, setTab] = React.useState('all');
  const [dateRange, setDateRange] = React.useState({ from: '', to: '', preset: 'all' });
  const [createOpen, setCreateOpen] = React.useState(false);

  const enriched = React.useMemo(() => ars.map((ar) => {
    const status = arStatus(ar);
    const total = arTotal(ar);
    const all = flatCourses(ar);
    const ordered = all.filter((c) => c.orderId && c.orderId.trim()).length;
    const activatedAmount = all.filter((c) => c.orderId && c.orderId.trim()).reduce((s, c) => s + (c.amount || 0), 0);
    return { ...ar, status, total, totalCourses: all.length, orderedCount: ordered, activatedAmount };
  }), [ars]);

  const counts = React.useMemo(() => ({
    all: enriched.length,
    pending_order: enriched.filter((a) => a.status === 'pending_order').length,
    partial_order: enriched.filter((a) => a.status === 'partial_order').length,
    ready_invoice: enriched.filter((a) => a.status === 'ready_invoice').length
  }), [enriched]);

  const filtered = enriched.filter((a) => {
    if (tab !== 'all' && a.status !== tab) return false;
    if (dateRange.from || dateRange.to) {
      const d = new Date((a.createdAt || '').replace(' ', 'T') + ':00');
      if (dateRange.from && d < new Date(dateRange.from + 'T00:00:00')) return false;
      if (dateRange.to && d > new Date(dateRange.to + 'T23:59:59')) return false;
    }
    if (search) {
      const s = search.toLowerCase();
      const allCodes = flatCourses(a).map((c) => c.courseCode + ' ' + (c.orderId || '')).join(' ').toLowerCase();
      return (
        a.id.toLowerCase().includes(s) ||
        a.customerName.toLowerCase().includes(s) ||
        (a.prId || '').toLowerCase().includes(s) ||
        a.uids.some((u) => u.uid.toLowerCase().includes(s)) ||
        allCodes.includes(s));

    }
    return true;
  });

  const openAr = openArId ? enriched.find((a) => a.id === openArId) : null;
  const openPr = openAr?.prId ? prs.find((p) => p.id === openAr.prId) : null;

  const sumReady = enriched.filter((a) => a.status === 'ready_invoice').reduce((s, a) => s + a.total, 0);

  const handleCreate = (data) => {
    onCreateAr(data);
    setCreateOpen(false);
  };

  const tabs = [
  { id: 'pending_order', label: 'Chờ tạo đơn', icon: 'Clock' },
  { id: 'partial_order', label: 'Đang điền Order ID', icon: 'Pencil' },
  { id: 'ready_invoice', label: 'Sẵn sàng xuất HĐ', icon: 'CheckCircle' },
  { id: 'all', label: 'Tất cả', icon: 'Database' }];


  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ fontSize: 12.5, color: 'var(--text-3)', maxWidth: 720, lineHeight: 1.55 }}>
          Sau khi PR đủ tiền, admin tạo <strong style={{ color: 'var(--text-2)' }}>Active Request</strong> để kích hoạt khoá học cho UID khách.
          Mỗi khoá sinh ra <strong style={{ color: 'var(--text-2)' }}>Course Code</strong>. Admin sang hệ thống khác tạo đơn và <strong style={{ color: 'var(--text-2)' }}>điền tay Order ID</strong> tương ứng từng Course Code.
        </div>
        <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
          <Icons.Plus size={15} strokeWidth={2.3} /> Tạo Active Request
        </button>
      </div>

      <div className="kpi-row">
        <div className="kpi">
          <div className="kpi-icon"><Icons.Sparkle size={16} /></div>
          <div className="kpi-label">Tổng Active Request</div>
          <div className="kpi-value">{counts.all}</div>
          <div className="kpi-sub">{enriched.reduce((s, a) => s + a.totalCourses, 0)} khoá học</div>
        </div>
        <div className="kpi">
          <div className="kpi-icon" style={{ background: 'var(--warning-bg)', color: 'var(--warning-text)' }}><Icons.Clock size={16} /></div>
          <div className="kpi-label">Chờ tạo đơn</div>
          <div className="kpi-value">{counts.pending_order}</div>
          <div className="kpi-sub">Chưa có Order ID nào</div>
        </div>
        <div className="kpi">
          <div className="kpi-icon" style={{ background: 'var(--info-bg)', color: 'var(--info-text)' }}><Icons.Pencil size={16} /></div>
          <div className="kpi-label">Đang điền Order ID</div>
          <div className="kpi-value">{counts.partial_order}</div>
          <div className="kpi-sub">Admin đang xử lý</div>
        </div>
        <div className="kpi">
          <div className="kpi-icon" style={{ background: 'var(--success-bg)', color: 'var(--success-text)' }}><Icons.CheckCircle size={16} /></div>
          <div className="kpi-label">Sẵn sàng xuất HĐ</div>
          <div className="kpi-value">{counts.ready_invoice}</div>
          <div className="kpi-sub">{window.MockData.VND(sumReady)} chờ B4</div>
        </div>
      </div>

      <div className="toolbar">
        <div className="search">
          <Icons.Search size={15} stroke="var(--text-3)" />
          <input
            placeholder="Tìm theo AR-ID, PR-ID, tên khách, UID, Course Code, Order ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)} />
          
        </div>
        <div style={{ marginLeft: 'auto' }}>
          {arDateRangeFilter && React.createElement(arDateRangeFilter, { value: dateRange, onChange: setDateRange })}
        </div>
      </div>

      <div className="table-card has-tabs">
        <div className="table-head with-tabs">
          <div className="tabs">
            {tabs.map((tc) => {
              const Ico = Icons[tc.icon];
              const isActive = tab === tc.id;
              return (
                <div
                  key={tc.id}
                  className={`tab ${isActive ? 'active' : ''}`}
                  onClick={() => setTab(tc.id)}>
                  
                  <Ico size={14} /> {tc.label}
                  <span className="tab-count">{counts[tc.id]}</span>
                </div>);

            })}
          </div>
          <span className="right-meta">{filtered.length} kết quả</span>
        </div>

        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 130 }}>AR-ID</th>
                <th style={{ width: 130 }}>PR liên kết</th>
                <th>Khách hàng</th>
                <th style={{ textAlign: 'center', width: 110 }}>UID · Khoá</th>
                <th style={{ width: 180, textAlign: 'right' }}>Giá trị courses</th>
                <th style={{ textAlign: 'center', width: 120 }}>Order ID</th>
                <th style={{ width: 160 }}>Trạng thái</th>
                <th style={{ width: 130 }}>Tạo lúc</th>
                <th style={{ width: 50 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 &&
              <tr>
                  <td colSpan={9}>
                    <div className="empty">
                      <Icons.Sparkle size={20} />
                      <div>Chưa có Active Request nào khớp với điều kiện lọc.</div>
                    </div>
                  </td>
                </tr>
              }
              {filtered.map((a) =>
              <tr
                key={a.id}
                className={openArId === a.id ? 'selected' : ''}
                onClick={() => onOpenAr(a.id)}>
                
                  <td><span className="ar-id-pill">{a.id}</span></td>
                  <td>
                    {a.prId ?
                  <span className="pr-id-pill" style={{ fontSize: 11.5 }}>{a.prId}</span> :

                  <span style={{ color: 'var(--text-3)', fontSize: 12 }}>— Standalone —</span>
                  }
                  </td>
                  <td>
                    <div className="cell-name">{a.customerName}</div>
                    <div className="cell-sub">UID: {a.uids[0]?.uid || '—'}</div>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span className="qr-count">
                      <span className="num-done">{a.uids.length}</span>
                      <span style={{ color: 'var(--text-muted)', margin: '0 2px' }}>·</span>
                      <span className="num-total">{a.totalCourses}</span>
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <span style={{ fontWeight: 700, color: 'var(--money)', fontVariantNumeric: 'tabular-nums' }}>
                      {window.MockData.VND(a.total)}
                    </span>
                    <div style={{ fontSize: 11, marginTop: 3, color: a.activatedAmount === a.total ? 'var(--success-text)' : 'var(--text-3)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      {a.activatedAmount > 0 ?
                    <>
                          <Icons.Check size={11} strokeWidth={2.5} stroke="var(--success-text)" style={{ verticalAlign: 'middle', marginRight: 2 }} />
                          <span style={{ color: 'var(--success-text)', fontWeight: 600 }}>{window.MockData.VND(a.activatedAmount)}</span>
                          <span style={{ color: 'var(--text-3)' }}> đã kích hoạt</span>
                        </> :

                    <span style={{ color: 'var(--text-3)' }}>Chưa kích hoạt</span>
                    }
                    </div>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span className="qr-count" style={{ fontSize: 13 }}>
                      <span className="num-done" style={{ color: a.orderedCount === a.totalCourses ? 'var(--success-text)' : 'var(--warning-text)' }}>{a.orderedCount}</span>
                      <span className="slash">/</span>
                      <span className="num-total">{a.totalCourses}</span>
                    </span>
                  </td>
                  <td><ARStatusBadge status={a.status} /></td>
                  <td>
                    <div className="cell-time">{a.createdAt?.split(' ')[0].split('-').reverse().join('/')}</div>
                    <div className="time-relative">{a.createdAt?.split(' ')[1]}</div>
                  </td>
                  <td>
                    <span className="row-action"><Icons.ChevronRight size={15} /></span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="pagi">
          <span>Hiển thị 1–{filtered.length} trong {counts.all} kết quả</span>
          <div className="pagi-btns">
            <button className="pagi-btn"><Icons.ChevronLeft size={13} /></button>
            <button className="pagi-btn active">1</button>
            <button className="pagi-btn">2</button>
            <button className="pagi-btn"><Icons.ChevronRight size={13} /></button>
          </div>
        </div>
      </div>

      <ARDrawer
        ar={openAr}
        pr={openPr}
        open={!!openArId}
        onClose={() => onOpenAr(null)}
        onUpdate={onUpdateAr}
        onOpenPr={onOpenPr} />
      

      <ARCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        prs={prs}
        prefillPr={null}
        onCreate={handleCreate} />
      
    </div>);

}

window.ActivationPage = ActivationPage;
window.ARDrawer = ARDrawer;
window.ARCreateModal = ARCreateModal;
window.ARStatusBadge = ARStatusBadge;
window.arStatus = arStatus;
window.arTotal = arTotal;
window.nextCourseCode = nextCourseCode;
window.flatCourses = flatCourses;