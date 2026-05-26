// invoice-page.jsx — Xuất hóa đơn (B4)

const ipDateRangeFilter = window.DateRangeFilter;
const IpCountryCombo = window.CountryCombo;

// ─────────── Helpers ───────────
// Each invoice row is one course (1 Course Code → 1 INV) that has an Order ID.
// Pending = orderId filled but not yet invoiced; Issued = invoiced=true.
function deriveInvoiceRows(ars, prs) {
  const rows = [];
  ars.forEach((ar) => {
    const pr = ar.prId ? prs.find((p) => p.id === ar.prId) : null;
    ar.uids.forEach((u, uidIdx) => {
      u.courses.forEach((c, courseIdx) => {
        if (!c.orderId || !c.orderId.trim()) return;
        rows.push({
          key: `${ar.id}::${uidIdx}::${courseIdx}`,
          ar, pr, uidIdx, courseIdx, course: c, uidObj: u,
        });
      });
    });
  });
  return rows.sort((a, b) => {
    // pending first, then by ar.createdAt desc
    if (a.course.invoiced !== b.course.invoiced) return a.course.invoiced ? 1 : -1;
    return (b.ar.createdAt || '').localeCompare(a.ar.createdAt || '');
  });
}

const CUSTOMER_TYPE_META = {
  individual: { label: 'Cá nhân',      cls: 'is-active' },
  business:   { label: 'Doanh nghiệp', cls: 'is-soft-primary' },
};

function CustomerTypeBadge({ type }) {
  const meta = CUSTOMER_TYPE_META[type] || CUSTOMER_TYPE_META.individual;
  return <span className={`badge ${meta.cls}`}><span className="dot" />{meta.label}</span>;
}

// Derive default form values (course override → UID → PR → AR fallback)
function defaultsFor(row) {
  if (!row) return null;
  const { ar, pr, uidObj: u, course: c } = row;
  return {
    customerType: c.customerType || 'individual',
    name:         c.name         ?? ar.customerName,
    email:        c.email        || '',
    country:      c.country      || u.country || pr?.country || 'VN',
    phone:        c.phone        ?? (u.phone || pr?.phone || ''),
    address:      c.address      ?? (pr?.address || ''),
    ward:         c.ward         ?? (pr?.ward || ''),
    province:     c.province     ?? (pr?.province || ''),
    taxCode:      c.taxCode      || '',
    companyName:  c.companyName  || '',
    note:         c.note         || '',
  };
}

// ─────────── Invoice Detail Drawer ───────────
function InvoiceDetailDrawer({ row, open, onClose, onSave, onIssue, onRevoke, onOpenAr }) {
  // Per-row form state — preserved across re-renders & row switches without
  // stale data (each row.key has its own override map). Always derives from
  // defaultsFor(row) so there is no null window between render and effect.
  const [forms, setForms] = React.useState({});

  if (!row) return (
    <>
      <div className={`scrim ${open ? 'open' : ''}`} onClick={onClose} style={{ pointerEvents: open ? 'auto' : 'none' }} />
      <aside className={`drawer ${open ? 'open' : ''}`}></aside>
    </>
  );

  const defaults = defaultsFor(row);
  const form = forms[row.key] || defaults;
  const set = (k, v) => {
    setForms((prev) => ({
      ...prev,
      [row.key]: { ...(prev[row.key] || defaults), [k]: v },
    }));
  };

  const { ar, pr, course: c, uidObj: u } = row;
  const { VND, fmtPhone } = window.MockData;
  const isIssued = !!c.invoiced;
  const country = (window.COUNTRIES || []).find((x) => x.code === form.country) || { dial: '+84', flag: '🇻🇳' };

  const handleIssue = () => {
    onIssue(row.key, form);
    // clear local overrides for this row so future opens start fresh from saved values
    setForms((prev) => { const next = { ...prev }; delete next[row.key]; return next; });
  };
  const handleSaveDraft = () => {
    onSave(row.key, form);
    setForms((prev) => { const next = { ...prev }; delete next[row.key]; return next; });
  };
  const handleRevoke = () => {
    if (confirm('Huỷ phát hành hoá đơn này?')) onRevoke(row.key);
  };

  return (
    <>
      <div className={`scrim ${open ? 'open' : ''}`} onClick={onClose} style={{ pointerEvents: open ? 'auto' : 'none' }} />
      <aside className={`drawer ${open ? 'open' : ''}`} style={{ width: 'min(820px, 96vw)' }}>
        <div className="drawer-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {isIssued ? (
              <span className="invoice-chip" style={{ fontSize: 13, padding: '5px 11px' }}>
                <Icons.Doc size={13} /> {c.invoiceId}
              </span>
            ) : (
              <span className="code-chip cc" style={{ fontSize: 13, padding: '5px 11px' }}>
                <Icons.Sparkle size={13} /> {c.courseCode}
              </span>
            )}
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{form.name || ar.customerName}</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                {isIssued
                  ? <>Đã xuất lúc <strong style={{ color: 'var(--success-text)' }}>{c.invoicedAt || '—'}</strong></>
                  : <>Chờ xuất · Order ID <strong style={{ color: 'var(--text-2)' }}>{c.orderId}</strong></>
                }
                {' · '}
                <strong style={{ color: 'var(--primary-700)' }}>{ar.id}</strong>
                {ar.prId && <> · <strong style={{ color: 'var(--primary-700)' }}>{ar.prId}</strong></>}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className={`badge ${isIssued ? 'is-done' : 'is-over'}`}>
              <span className="dot" />{isIssued ? 'Đã xuất' : 'Chờ xuất'}
            </span>
            <button className="drawer-close" onClick={onClose}><Icons.Close size={16} /></button>
          </div>
        </div>

        <div className="drawer-body" style={{ paddingBottom: 100 }}>
          {/* Quick summary */}
          <div className="summary-row" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <div className="summary">
              <div className="summary-label">Số tiền cần xuất</div>
              <div className="summary-value" style={{ color: 'var(--money)' }}>{VND(c.amount)}</div>
            </div>
            <div className="summary">
              <div className="summary-label">Course Code</div>
              <div className="summary-value" style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 14 }}>{c.courseCode}</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>Gói: {c.packageName || '—'}</div>
            </div>
            <div className="summary">
              <div className="summary-label">Order ID đối chiếu</div>
              <div className="summary-value" style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 14, color: 'var(--success-text)' }}>{c.orderId}</div>
            </div>
          </div>

          {/* Customer type */}
          <div className="panel">
            <div className="panel-head" style={{ marginBottom: 14 }}>
              <h4><Icons.User size={15} /> Loại khách hàng</h4>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              {['individual', 'business'].map((t) => {
                const meta = CUSTOMER_TYPE_META[t];
                const active = form.customerType === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => set('customerType', t)}
                    className={`method-pick ${active ? 'active' : ''}`}
                    style={{
                      flex: 1, padding: '12px 14px',
                      borderColor: active ? 'var(--primary)' : 'var(--border)',
                      background: active ? 'var(--primary-50)' : 'white',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: 8,
                        background: active ? 'var(--primary)' : 'var(--surface-3)',
                        color: active ? 'white' : 'var(--text-3)',
                        display: 'grid', placeItems: 'center',
                      }}>
                        {t === 'individual' ? <Icons.User size={15} /> : <Icons.Bank size={15} />}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13.5, color: active ? 'var(--primary-700)' : 'var(--text)' }}>{meta.label}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                          {t === 'individual' ? 'Xuất HĐ cho cá nhân, không cần MST' : 'Xuất HĐ cho công ty, cần MST + tên DN'}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Info form */}
          <div className="panel">
            <div className="panel-head" style={{ marginBottom: 14 }}>
              <h4><Icons.Doc size={15} /> Thông tin xuất hoá đơn</h4>
              {ar && (
                <button className="btn btn-outline btn-sm" onClick={() => onOpenAr && onOpenAr(ar.id)}>
                  <Icons.ArrowRight size={13} /> Mở AR
                </button>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {form.customerType === 'business' && (
                <>
                  <div className="field" style={{ gridColumn: '1 / -1' }}>
                    <label>Tên công ty <span style={{ color: 'var(--danger)' }}>*</span></label>
                    <input
                      value={form.companyName}
                      onChange={(e) => set('companyName', e.target.value)}
                      placeholder="VD: Công ty TNHH ABC"
                    />
                  </div>
                  <div className="field">
                    <label>Mã số thuế <span style={{ color: 'var(--danger)' }}>*</span></label>
                    <input
                      value={form.taxCode}
                      onChange={(e) => set('taxCode', e.target.value.replace(/[^\d-]/g, ''))}
                      placeholder="VD: 0312345678"
                      style={{ fontFamily: 'JetBrains Mono, monospace' }}
                    />
                  </div>
                  <div className="field">
                    <label>Người đại diện</label>
                    <input
                      value={form.name}
                      onChange={(e) => set('name', e.target.value)}
                      placeholder="Họ và tên người đại diện"
                    />
                  </div>
                </>
              )}
              {form.customerType === 'individual' && (
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <label>Tên khách hàng <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <input
                    value={form.name}
                    onChange={(e) => set('name', e.target.value)}
                    placeholder="Họ và tên"
                  />
                </div>
              )}

              <div className="field">
                <label>Email <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>(không bắt buộc)</span></label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => set('email', e.target.value)}
                  placeholder="hoadon@example.com"
                />
              </div>

              <div className="field">
                <label>UID học viên</label>
                <input
                  value={u?.uid || ''}
                  readOnly
                  style={{ fontFamily: 'JetBrains Mono, monospace', background: 'var(--surface-2)', color: 'var(--text-2)' }}
                />
              </div>

              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>Số điện thoại</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {IpCountryCombo && (
                    <IpCountryCombo value={form.country} onChange={(v) => set('country', v)} />
                  )}
                  <input
                    style={{ flex: 1 }}
                    value={form.phone}
                    onChange={(e) => set('phone', e.target.value.replace(/\D/g, ''))}
                    placeholder="9xx xxx xxx"
                  />
                </div>
              </div>

              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>Địa chỉ trên hoá đơn</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                  <input
                    value={form.province}
                    onChange={(e) => set('province', e.target.value)}
                    placeholder="Tỉnh / Thành phố"
                  />
                  <input
                    value={form.ward}
                    onChange={(e) => set('ward', e.target.value)}
                    placeholder="Phường / Xã"
                  />
                </div>
                <input
                  value={form.address}
                  onChange={(e) => set('address', e.target.value)}
                  placeholder="Số nhà, đường"
                />
              </div>

              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>Ghi chú</label>
                <textarea
                  value={form.note}
                  onChange={(e) => set('note', e.target.value)}
                  placeholder="Ghi chú nội bộ về hoá đơn này (mục đích thuế, kế toán, v.v.)"
                />
              </div>
            </div>
          </div>

          {(() => {
            const missing = [];
            if (!form.name) missing.push('tên');
            if (!form.phone) missing.push('SĐT');
            if (!form.address && !form.ward && !form.province) missing.push('địa chỉ');
            if (missing.length === 0) {
              return (
                <div className="match-ok">
                  <Icons.CheckCircle size={16} />
                  <span>Đã đủ thông tin bắt buộc (tên, SĐT, địa chỉ) — sẵn sàng xuất hoá đơn. Email và MST không bắt buộc.</span>
                </div>
              );
            }
            return (
              <div className="match-warning">
                <Icons.AlertCircle size={16} />
                <span>Cần bổ sung <strong>{missing.join(', ')}</strong> trước khi xuất hoá đơn. Email và MST không bắt buộc.</span>
              </div>
            );
          })()}

          {isIssued && (
            <div className="match-ok">
              <Icons.CheckCircle size={16} />
              <span>
                Hoá đơn <strong>{c.invoiceId}</strong> đã được phát hành lúc <strong>{c.invoicedAt}</strong>.
                Mọi thay đổi cần được phát hành lại để cập nhật bản chính thức.
              </span>
            </div>
          )}
        </div>

        <div className="drawer-foot">
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-outline btn-sm"><Icons.Copy size={13} /> Copy {isIssued ? 'INV' : 'CC'}</button>
            {isIssued && (
              <button className="btn btn-outline btn-sm"><Icons.Download size={13} /> Tải PDF</button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {isIssued ? (
              <>
                <button className="btn btn-outline" style={{ color: 'var(--danger)' }} onClick={handleRevoke}>
                  <Icons.XCircle size={14} /> Huỷ phát hành
                </button>
                <button className="btn btn-primary" onClick={handleSaveDraft}>
                  <Icons.Check size={14} strokeWidth={2.5} /> Lưu thay đổi
                </button>
              </>
            ) : (
              <>
                <button className="btn btn-outline" onClick={handleSaveDraft}>
                  <Icons.Pencil size={14} /> Lưu nháp
                </button>
                <button
                  className="btn btn-success"
                  onClick={handleIssue}
                  disabled={!form.name || !form.phone || (!form.address && !form.ward && !form.province)}
                  title={(!form.name || !form.phone || (!form.address && !form.ward && !form.province)) ? 'Cần điền tên, SĐT và địa chỉ trước' : 'Phát hành hoá đơn'}
                >
                  <Icons.Doc size={14} /> Xuất hoá đơn
                </button>
              </>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

// ─────────── Main Invoice Page ───────────
function InvoicePage({ ars, prs, onUpdateAr, onOpenAr }) {
  const [tab, setTab] = React.useState('pending'); // 'pending' | 'issued'
  const [search, setSearch] = React.useState('');
  const [dateRange, setDateRange] = React.useState({ from: '', to: '', preset: 'all' });
  const [openKey, setOpenKey] = React.useState(null);
  const [selectedKeys, setSelectedKeys] = React.useState(new Set());

  // Reset selection when leaving pending tab / changing filters
  React.useEffect(() => { setSelectedKeys(new Set()); }, [tab, search, dateRange.from, dateRange.to]);

  const rows = React.useMemo(() => deriveInvoiceRows(ars, prs), [ars, prs]);
  const pending = rows.filter((r) => !r.course.invoiced);
  const issued = rows.filter((r) => r.course.invoiced);

  const list = tab === 'pending' ? pending : issued;

  const filtered = list.filter((r) => {
    if (dateRange.from || dateRange.to) {
      const ts = tab === 'issued' ? r.course.invoicedAt : r.ar.createdAt;
      const d = new Date((ts || '').replace(' ', 'T') + ':00');
      if (dateRange.from && d < new Date(dateRange.from + 'T00:00:00')) return false;
      if (dateRange.to   && d > new Date(dateRange.to + 'T23:59:59')) return false;
    }
    if (search) {
      const s = search.toLowerCase();
      return (
        r.ar.customerName.toLowerCase().includes(s) ||
        r.uidObj.uid.toLowerCase().includes(s) ||
        r.course.courseCode.toLowerCase().includes(s) ||
        (r.course.invoiceId || '').toLowerCase().includes(s) ||
        (r.course.orderId || '').toLowerCase().includes(s) ||
        r.ar.id.toLowerCase().includes(s) ||
        (r.pr?.id || '').toLowerCase().includes(s) ||
        (r.uidObj.phone || '').includes(s)
      );
    }
    return true;
  });

  const updateCourse = (key, patch) => {
    const [arId, uidIdxStr, courseIdxStr] = key.split('::');
    const uidIdx = +uidIdxStr;
    const courseIdx = +courseIdxStr;
    const ar = ars.find((a) => a.id === arId);
    if (!ar) return;
    const nextUids = ar.uids.map((u, i) => {
      if (i !== uidIdx) return u;
      return { ...u, courses: u.courses.map((cc, j) => j === courseIdx ? { ...cc, ...patch } : cc) };
    });
    onUpdateAr({ ...ar, uids: nextUids });
  };

  const handleSave = (key, formData) => {
    updateCourse(key, formData);
  };

  const handleIssue = (key, formData) => {
    const seq = String(100 + issued.length + 1);
    const invId = `INV-2026-1${seq.slice(-3)}`;
    const invAt = new Date().toISOString().slice(0, 16).replace('T', ' ');
    updateCourse(key, { ...formData, invoiced: true, invoiceId: invId, invoicedAt: invAt });
  };

  const handleRevoke = (key) => {
    updateCourse(key, { invoiced: false, invoiceId: '', invoicedAt: '' });
  };

  // Per-row completeness check (name + phone + at least one address field)
  const isRowComplete = (r) => {
    const d = defaultsFor(r);
    return !!(d.name && d.phone && (d.address || d.ward || d.province));
  };

  const toggleSelect = (key) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  const toggleSelectAll = (visibleRows) => {
    const selectable = visibleRows.filter(isRowComplete).map((r) => r.key);
    setSelectedKeys((prev) => {
      const allChecked = selectable.length > 0 && selectable.every((k) => prev.has(k));
      return allChecked ? new Set() : new Set(selectable);
    });
  };

  // Bulk issue: group by AR to avoid concurrent setAr race conditions
  const handleBulkIssue = () => {
    const groupedByAr = {};
    selectedKeys.forEach((key) => {
      const [arId, uidIdxStr, courseIdxStr] = key.split('::');
      if (!groupedByAr[arId]) groupedByAr[arId] = [];
      groupedByAr[arId].push({ key, uidIdx: +uidIdxStr, courseIdx: +courseIdxStr });
    });
    let seq = issued.length;
    Object.entries(groupedByAr).forEach(([arId, items]) => {
      const ar = ars.find((a) => a.id === arId);
      if (!ar) return;
      let nextUids = ar.uids;
      items.forEach(({ key, uidIdx, courseIdx }) => {
        const row = rows.find((r) => r.key === key);
        if (!row || !isRowComplete(row)) return;
        seq += 1;
        const invId = `INV-2026-1${String(seq).padStart(3, '0').slice(-3)}`;
        const invAt = new Date().toISOString().slice(0, 16).replace('T', ' ');
        const d = defaultsFor(row);
        nextUids = nextUids.map((u, i) => i === uidIdx ? {
          ...u,
          courses: u.courses.map((cc, j) => j === courseIdx ? {
            ...cc, ...d, invoiced: true, invoiceId: invId, invoicedAt: invAt,
          } : cc),
        } : u);
      });
      onUpdateAr({ ...ar, uids: nextUids });
    });
    setSelectedKeys(new Set());
  };

  const openRow = openKey ? rows.find((r) => r.key === openKey) : null;

  const sumPending = pending.reduce((s, r) => s + (r.course.amount || 0), 0);
  const sumIssued  = issued.reduce((s, r) => s + (r.course.amount || 0), 0);

  const formatAddress = (row) => {
    const c = row.course;
    const pr = row.pr;
    const parts = [
      c.address ?? pr?.address,
      c.ward    ?? pr?.ward,
      c.province?? pr?.province,
    ].filter(Boolean);
    return parts.join(', ') || '—';
  };

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ fontSize: 12.5, color: 'var(--text-3)', maxWidth: 720, lineHeight: 1.55 }}>
          Mỗi <strong style={{ color: 'var(--text-2)' }}>Course Code</strong> có Order ID là một đầu việc xuất hoá đơn.
          Kế toán điền loại khách (cá nhân/doanh nghiệp), xác nhận đủ <strong style={{ color: 'var(--text-2)' }}>tên / SĐT / địa chỉ</strong> rồi bấm <strong style={{ color: 'var(--text-2)' }}>Xuất hoá đơn</strong> để sinh INV.
        </div>
      </div>

      <div className="kpi-row">
        <div className="kpi">
          <div className="kpi-icon" style={{ background: 'var(--warning-bg)', color: 'var(--warning-text)' }}><Icons.Clock size={16} /></div>
          <div className="kpi-label">Chờ xuất hoá đơn</div>
          <div className="kpi-value">{pending.length}</div>
          <div className="kpi-sub">{window.MockData.VND(sumPending)} chờ xuất</div>
        </div>
        <div className="kpi">
          <div className="kpi-icon" style={{ background: 'var(--success-bg)', color: 'var(--success-text)' }}><Icons.CheckCircle size={16} /></div>
          <div className="kpi-label">Đã xuất</div>
          <div className="kpi-value">{issued.length}</div>
          <div className="kpi-sub">{window.MockData.VND(sumIssued)} đã phát hành</div>
        </div>
        <div className="kpi">
          <div className="kpi-icon"><Icons.Database size={16} /></div>
          <div className="kpi-label">Tổng hoá đơn</div>
          <div className="kpi-value">{rows.length}</div>
          <div className="kpi-sub">{window.MockData.VND(sumPending + sumIssued)} giá trị</div>
        </div>
        <div className="kpi">
          <div className="kpi-icon" style={{ background: 'var(--primary-50)', color: 'var(--primary-700)' }}><Icons.Sigma size={16} /></div>
          <div className="kpi-label">Tỉ lệ đã xuất</div>
          <div className="kpi-value">{rows.length > 0 ? Math.round(issued.length / rows.length * 100) : 0}%</div>
          <div className="kpi-sub">trên toàn bộ INV</div>
        </div>
      </div>

      <div className="toolbar">
        <div className="search">
          <Icons.Search size={15} stroke="var(--text-3)" />
          <input
            placeholder="Tìm theo INV, Course Code, Order ID, AR-ID, PR-ID, tên, UID, SĐT…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div style={{ marginLeft: 'auto' }}>
          {ipDateRangeFilter && React.createElement(ipDateRangeFilter, { value: dateRange, onChange: setDateRange })}
        </div>
      </div>

      <div className="table-card has-tabs">
        <div className="table-head with-tabs">
          <div className="tabs">
            <div
              className={`tab ${tab === 'pending' ? 'active' : ''}`}
              onClick={() => setTab('pending')}
            >
              <Icons.Clock size={14} /> Chờ xuất
              <span className={`tab-count ${pending.length > 0 && tab !== 'pending' ? 'is-attention' : ''}`}>{pending.length}</span>
            </div>
            <div
              className={`tab ${tab === 'issued' ? 'active' : ''}`}
              onClick={() => setTab('issued')}
            >
              <Icons.CheckCircle size={14} /> Đã xuất
              <span className="tab-count">{issued.length}</span>
            </div>
          </div>
          <span className="right-meta">{filtered.length} kết quả</span>
        </div>

        {tab === 'pending' && selectedKeys.size > 0 && (
          <div className="bulk-bar">
            <Icons.CheckCircle size={16} />
            <span><span className="count">{selectedKeys.size}</span> hoá đơn đã chọn · Tổng {window.MockData.VND(
              [...selectedKeys].reduce((s, k) => s + (rows.find((r) => r.key === k)?.course?.amount || 0), 0)
            )}</span>
            <div className="spacer" />
            <div className="bulk-actions">
              <button className="btn btn-outline btn-sm" onClick={() => setSelectedKeys(new Set())}>Bỏ chọn</button>
              <button className="btn btn-success btn-sm" onClick={handleBulkIssue}>
                <Icons.Doc size={13} /> Xuất hoá đơn hàng loạt
              </button>
            </div>
          </div>
        )}

        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                {tab === 'pending' && (
                  <th className="check-col" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={(() => {
                        const sel = filtered.filter(isRowComplete);
                        return sel.length > 0 && sel.every((r) => selectedKeys.has(r.key));
                      })()}
                      onChange={() => toggleSelectAll(filtered)}
                      title="Chọn tất cả hoá đơn đủ thông tin trên trang này"
                    />
                  </th>
                )}
                <th style={{ minWidth: 170 }}>Tên khách hàng</th>
                <th style={{ width: 150 }}>Số điện thoại</th>
                <th style={{ width: 110 }}>UID</th>
                <th style={{ minWidth: 200 }}>Địa chỉ</th>
                <th style={{ width: 130, textAlign: 'right' }}>Số tiền cần xuất</th>
                <th style={{ width: 140 }}>{tab === 'issued' ? 'Mã INV' : 'Course Code'}</th>
                <th style={{ width: 120 }}>{tab === 'issued' ? 'Xuất lúc' : 'AR tạo lúc'}</th>
                <th style={{ width: 110, textAlign: 'center' }}>Loại KH</th>
                <th style={{ width: 36 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={tab === 'pending' ? 10 : 9}>
                    <div className="empty">
                      <Icons.Doc size={20} />
                      <div>
                        {tab === 'pending' ? 'Không có hoá đơn nào đang chờ xuất.' : 'Chưa có hoá đơn nào được phát hành.'}
                      </div>
                    </div>
                  </td>
                </tr>
              )}
              {filtered.map((r) => {
                const d = defaultsFor(r);
                const country = (window.COUNTRIES || []).find((x) => x.code === d.country) || { dial: '+84', flag: '🇻🇳' };
                const isIssued = !!r.course.invoiced;
                const complete = isRowComplete(r);
                return (
                  <tr
                    key={r.key}
                    className={openKey === r.key ? 'selected' : ''}
                    onClick={() => setOpenKey(r.key)}
                  >
                    {tab === 'pending' && (
                      <td className="check-col" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          disabled={!complete}
                          checked={selectedKeys.has(r.key)}
                          onChange={() => toggleSelect(r.key)}
                          title={complete ? 'Chọn hoá đơn này' : 'Cần đủ tên / SĐT / địa chỉ mới chọn được'}
                        />
                      </td>
                    )}
                    <td>
                      <div className="cell-name">{d.name || <span style={{ color: 'var(--warning-text)' }}>⚠ Thiếu tên</span>}</div>
                      <div className="cell-sub" style={{ color: 'var(--text-3)' }}>
                        {(() => {
                          const missing = [];
                          if (!d.name) missing.push('tên');
                          if (!d.phone) missing.push('SĐT');
                          if (!d.address && !d.ward && !d.province) missing.push('địa chỉ');
                          if (missing.length === 0) {
                            return <span style={{ color: 'var(--success-text)' }}><Icons.Check size={11} strokeWidth={2.5} style={{ verticalAlign: 'middle', marginRight: 2 }} /> Đủ thông tin</span>;
                          }
                          return <span style={{ color: 'var(--warning-text)' }}>⚠ Thiếu: {missing.join(', ')}</span>;
                        })()}
                      </div>
                    </td>
                    <td>
                      <span className="cell-phone" style={{ whiteSpace: 'nowrap' }}>
                        <span style={{ marginRight: 4 }}>{country.flag}</span>
                        {country.dial} {window.MockData.fmtPhone(d.phone)}
                      </span>
                    </td>
                    <td><span className="cell-mono">{r.uidObj.uid}</span></td>
                    <td>
                      <div className="cell-sub" style={{
                        color: 'var(--text-2)', whiteSpace: 'nowrap',
                        overflow: 'hidden', textOverflow: 'ellipsis',
                        maxWidth: 280,
                      }} title={formatAddress(r)}>
                        {formatAddress(r)}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span style={{ fontWeight: 700, color: 'var(--money)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                        {window.MockData.VND(r.course.amount)}
                      </span>
                    </td>
                    <td>
                      {isIssued ? (
                        <span className="invoice-chip"><Icons.Doc size={11} /> {r.course.invoiceId}</span>
                      ) : (
                        <span className="code-chip cc"><Icons.Sparkle size={11} /> {r.course.courseCode}</span>
                      )}
                    </td>
                    <td>
                      <div className="cell-time">
                        {(isIssued ? r.course.invoicedAt : r.ar.createdAt)?.split(' ')[0].split('-').reverse().join('/') || '—'}
                      </div>
                      <div className="time-relative">
                        {(isIssued ? r.course.invoicedAt : r.ar.createdAt)?.split(' ')[1]}
                      </div>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <CustomerTypeBadge type={d.customerType} />
                    </td>
                    <td>
                      <span className="row-action"><Icons.ChevronRight size={15} /></span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="pagi">
          <span>Hiển thị 1–{filtered.length} trong {list.length} kết quả</span>
          <div className="pagi-btns">
            <button className="pagi-btn"><Icons.ChevronLeft size={13} /></button>
            <button className="pagi-btn active">1</button>
            <button className="pagi-btn">2</button>
            <button className="pagi-btn"><Icons.ChevronRight size={13} /></button>
          </div>
        </div>
      </div>

      <InvoiceDetailDrawer
        row={openRow}
        open={!!openKey}
        onClose={() => setOpenKey(null)}
        onSave={handleSave}
        onIssue={handleIssue}
        onRevoke={handleRevoke}
        onOpenAr={onOpenAr}
      />
    </div>
  );
}

window.InvoicePage = InvoicePage;
window.InvoiceDetailDrawer = InvoiceDetailDrawer;
window.CustomerTypeBadge = CustomerTypeBadge;
window.deriveInvoiceRows = deriveInvoiceRows;
