// revenue-page.jsx — Sổ doanh thu

const rvDateRangeFilter = window.DateRangeFilter;

// ─────────── Helpers ───────────
function rvInRange(payTime, dateRange) {
  if (!dateRange || (!dateRange.from && !dateRange.to)) return true;
  if (!payTime) return false;
  const d = new Date(payTime.replace(' ', 'T') + ':00');
  if (dateRange.from && d < new Date(dateRange.from + 'T00:00:00')) return false;
  if (dateRange.to   && d > new Date(dateRange.to   + 'T23:59:59')) return false;
  return true;
}

function RevenueTypeBadge({ type, compact }) {
  const meta = window.REVENUE_TYPE_META[type] || window.REVENUE_TYPE_META.other;
  return (
    <span className={`rv-type ${meta.cls}`} title={meta.full}>
      {compact ? meta.zh : meta.full}
    </span>
  );
}

function PaymentMethodBadge({ method }) {
  if (!method) return <span style={{ color: 'var(--text-3)' }}>—</span>;
  const ord = String(method).toLowerCase();
  let cls = 'pm-other';
  if (ord === '1st')  cls = 'pm-1';
  if (ord === '2nd')  cls = 'pm-2';
  if (ord === '3rd')  cls = 'pm-3';
  if (ord === '4th')  cls = 'pm-4';
  if (ord === 'cash') cls = 'pm-cash';
  return <span className={`pm-badge ${cls}`}>{method}</span>;
}

function SaleLabelChip({ label }) {
  if (!label) return null;
  const cls = label === 'M3' ? 'sl-m3' : label === 'TAY' ? 'sl-tay' : 'sl-off';
  return <span className={`sale-label ${cls}`}>{label}</span>;
}

// ─────────── Cross-module link card ───────────
function LinkCard({ icon, title, value, kind, onOpen, disabled }) {
  const Ico = window.Icons[icon] || window.Icons.ChevronRight;
  return (
    <div
      className={`link-card ${disabled ? 'is-disabled' : ''}`}
      onClick={() => !disabled && onOpen && onOpen()}
    >
      <div className={`link-icon ${kind}`}><Ico size={15} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="link-title">{title}</div>
        <div className="link-value">{value || '—'}</div>
      </div>
      {!disabled && <window.Icons.ChevronRight size={15} stroke="var(--text-3)" />}
    </div>
  );
}

// ─────────── Revenue Detail Drawer ───────────
function RevenueDetailDrawer({ entry, prs, ars, open, onClose, onUpdate, onOpenPr, onOpenAr, onOpenInvoice, onOpenTxn }) {
  if (!entry) return (
    <>
      <div className={`scrim ${open ? 'open' : ''}`} onClick={onClose} style={{ pointerEvents: open ? 'auto' : 'none' }} />
      <aside className={`drawer ${open ? 'open' : ''}`}></aside>
    </>
  );

  const { VND, fmtPhone } = window.MockData;
  const country = (window.COUNTRIES || []).find(c => c.code === (entry.country || 'VN')) || { dial: '+84', flag: '🇻🇳' };
  const linkedPr = entry.prId ? prs.find(p => p.id === entry.prId) : null;
  const linkedAr = entry.arId ? ars.find(a => a.id === entry.arId) : null;

  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(entry);
  React.useEffect(() => { setDraft(entry); setEditing(false); }, [entry?.id]);

  const f = editing ? draft : entry;

  const set = (k, v) => setDraft({ ...draft, [k]: v });
  const save = () => { onUpdate(draft); setEditing(false); };

  return (
    <>
      <div className={`scrim ${open ? 'open' : ''}`} onClick={onClose} style={{ pointerEvents: open ? 'auto' : 'none' }} />
      <aside className={`drawer ${open ? 'open' : ''}`} style={{ width: 'min(820px, 96vw)' }}>
        <div className="drawer-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span className="pr-id-pill" style={{ background: 'oklch(0.96 0.05 145)', color: 'oklch(0.4 0.14 150)' }}>{entry.id}</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                {f.userName}
                <SaleLabelChip label={f.saleLabel} />
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                {country.flag} {country.dial} {fmtPhone(f.phone)} · UID <strong style={{ color: 'var(--text-2)' }}>{f.uid}</strong> · Pay time <strong style={{ color: 'var(--text-2)' }}>{f.payTime}</strong>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <RevenueTypeBadge type={f.type} />
            <button className="drawer-close" onClick={onClose}><window.Icons.Close size={16} /></button>
          </div>
        </div>

        <div className="drawer-body" style={{ paddingBottom: 100 }}>
          {/* Summary cards */}
          <div className="summary-row" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
            <div className="summary">
              <div className="summary-label">Real pay (VND)</div>
              <div className="summary-value" style={{ color: 'var(--money)' }}>{VND(f.realPayVnd)}</div>
            </div>
            <div className="summary">
              <div className="summary-label">Real pay (RMB)</div>
              <div className="summary-value">{f.realPayRmb ? `¥ ${Number(f.realPayRmb).toLocaleString('vi-VN')}` : '—'}</div>
              <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 2 }}>tỉ giá VND÷3700</div>
            </div>
            <div className="summary">
              <div className="summary-label">Payment method</div>
              <div className="summary-value"><PaymentMethodBadge method={f.paymentMethod} /></div>
            </div>
            <div className="summary">
              <div className="summary-label">Loại doanh thu</div>
              <div style={{ marginTop: 6 }}><RevenueTypeBadge type={f.type} /></div>
            </div>
          </div>

          {/* Sales attribution */}
          <div className="panel">
            <div className="panel-head" style={{ marginBottom: 14 }}>
              <h4><window.Icons.User size={15} /> Phân bổ doanh thu</h4>
              {!editing ? (
                <button className="btn btn-outline btn-sm" onClick={() => setEditing(true)}><window.Icons.Pencil size={13} /> Sửa</button>
              ) : (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-outline btn-sm" onClick={() => { setEditing(false); setDraft(entry); }}>Huỷ</button>
                  <button className="btn btn-primary btn-sm" onClick={save}><window.Icons.Check size={13} strokeWidth={2.5} /> Lưu</button>
                </div>
              )}
            </div>
            <div className="info-grid">
              <div className="info-cell">
                <div className="info-label">Sales phụ trách</div>
                {!editing ? (
                  <div className="info-value">{f.saleName || '—'}</div>
                ) : (
                  <select value={draft.saleName} onChange={(e) => set('saleName', e.target.value)} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', font: 'inherit', fontSize: 13 }}>
                    {(window.SALES_PEOPLE || []).map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                )}
              </div>
              <div className="info-cell">
                <div className="info-label">Team</div>
                {!editing ? (
                  <div className="info-value">{f.team}</div>
                ) : (
                  <select value={draft.team} onChange={(e) => set('team', e.target.value)} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', font: 'inherit', fontSize: 13 }}>
                    {(window.SALES_TEAMS || []).map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                )}
              </div>
              <div className="info-cell">
                <div className="info-label">Loại</div>
                {!editing ? (
                  <div className="info-value"><RevenueTypeBadge type={f.type} /></div>
                ) : (
                  <select value={draft.type} onChange={(e) => set('type', e.target.value)} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', font: 'inherit', fontSize: 13 }}>
                    {Object.entries(window.REVENUE_TYPE_META).map(([k, v]) => <option key={k} value={k}>{v.full}</option>)}
                  </select>
                )}
              </div>
              <div className="info-cell">
                <div className="info-label">Nội dung CK</div>
                {!editing ? (
                  <div className="info-value mono">{f.noteCK || '—'}</div>
                ) : (
                  <input value={draft.noteCK} onChange={(e) => set('noteCK', e.target.value)} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', font: 'inherit', fontSize: 13, fontFamily: 'JetBrains Mono, monospace' }} />
                )}
              </div>
              <div className="info-cell">
                <div className="info-label">Order ID</div>
                {!editing ? (
                  <div className="info-value mono">{f.orderId || <span style={{ color: 'var(--text-3)' }}>chưa có</span>}</div>
                ) : (
                  <input value={draft.orderId} onChange={(e) => set('orderId', e.target.value)} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', font: 'inherit', fontSize: 13, fontFamily: 'JetBrains Mono, monospace' }} />
                )}
              </div>
              <div className="info-cell">
                <div className="info-label">Số tiền (VND)</div>
                {!editing ? (
                  <div className="info-value money">{VND(f.realPayVnd)}</div>
                ) : (
                  <input
                    value={Number(draft.realPayVnd || 0).toLocaleString('vi-VN')}
                    onChange={(e) => set('realPayVnd', Number(e.target.value.replace(/[^\d]/g, '')) || 0)}
                    style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', font: 'inherit', fontSize: 13, fontFamily: 'JetBrains Mono, monospace', color: 'var(--money)', fontWeight: 600 }}
                  />
                )}
              </div>
              <div className="info-cell full" style={{ gridColumn: '1 / -1' }}>
                <div className="info-label">Ghi chú nội bộ</div>
                {!editing ? (
                  <div className="info-value">{f.note || '—'}</div>
                ) : (
                  <textarea
                    value={draft.note || ''}
                    onChange={(e) => set('note', e.target.value)}
                    placeholder="Ghi chú nội bộ"
                    style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', font: 'inherit', fontSize: 13, minHeight: 56 }}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Cross-module links */}
          <div className="panel">
            <div className="panel-head" style={{ marginBottom: 12 }}>
              <h4><window.Icons.Database size={15} /> Liên kết các module</h4>
            </div>
            <div className="links-grid">
              <LinkCard
                icon="Wallet"
                title="Payment Request (B1)"
                value={entry.prId || 'Không liên kết'}
                kind="link-pr"
                disabled={!entry.prId}
                onOpen={() => entry.prId && onOpenPr && onOpenPr(linkedPr)}
              />
              <LinkCard
                icon="History"
                title="Đối soát giao dịch (B2)"
                value={linkedPr ? `${linkedPr.qrs.filter(q => q.status === 'paid').length} GD đã xác nhận` : 'Không liên kết'}
                kind="link-txn"
                disabled={!entry.prId}
                onOpen={() => entry.prId && onOpenTxn && onOpenTxn()}
              />
              <LinkCard
                icon="Sparkle"
                title="Active Request (B3)"
                value={entry.arId || (linkedAr ? linkedAr.id : 'Chưa kích hoạt')}
                kind="link-ar"
                disabled={!entry.arId && !linkedAr}
                onOpen={() => {
                  const id = entry.arId || linkedAr?.id;
                  if (id) onOpenAr && onOpenAr(id);
                }}
              />
              <LinkCard
                icon="Doc"
                title="Hoá đơn (B4)"
                value={entry.invoiceId || 'Chưa xuất hoá đơn'}
                kind="link-inv"
                disabled={!entry.invoiceId}
                onOpen={() => entry.invoiceId && onOpenInvoice && onOpenInvoice(entry.invoiceId)}
              />
            </div>
            {entry.courseCode && (
              <div style={{ marginTop: 12, fontSize: 11.5, color: 'var(--text-3)' }}>
                Course Code liên kết: <span className="code-chip cc" style={{ marginLeft: 6 }}><window.Icons.Sparkle size={11} /> {entry.courseCode}</span>
              </div>
            )}
          </div>

          {/* Customer info from PR if linked */}
          {linkedPr && (
            <div className="panel" style={{ padding: 16 }}>
              <div className="panel-head" style={{ marginBottom: 10 }}>
                <h4><window.Icons.User size={15} /> Thông tin khách (từ PR)</h4>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                <div className="info-cell"><div className="info-label">Tên</div><div className="info-value">{linkedPr.name}</div></div>
                <div className="info-cell"><div className="info-label">Tỉnh/TP</div><div className="info-value">{linkedPr.province || '—'}</div></div>
                <div className="info-cell"><div className="info-label">Phường/Xã</div><div className="info-value">{linkedPr.ward || '—'}</div></div>
                <div className="info-cell" style={{ gridColumn: '1 / -1' }}>
                  <div className="info-label">Địa chỉ</div>
                  <div className="info-value">{linkedPr.address || '—'}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="drawer-foot">
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-outline btn-sm"><window.Icons.Copy size={13} /> Copy RV-ID</button>
            <button className="btn btn-outline btn-sm" style={{ color: 'var(--danger)' }}><window.Icons.XCircle size={13} /> Xoá dòng</button>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-outline"><window.Icons.Download size={13} /> Xuất Excel dòng này</button>
          </div>
        </div>
      </aside>
    </>
  );
}

// ─────────── Main Page ───────────
function RevenuePage({ revenue, prs, ars, onUpdateRevenue, onAddRevenue, onOpenPr, onOpenAr, onOpenInvoice, onOpenTxn }) {
  const [dateRange, setDateRange] = React.useState({ from: '2026-02-01', to: '2026-05-25', preset: 'custom' });
  const [typeFilter, setTypeFilter] = React.useState('all');
  const [teamFilter, setTeamFilter] = React.useState('all');
  const [search, setSearch] = React.useState('');
  const [openId, setOpenId] = React.useState(null);

  const filtered = revenue.filter(r => {
    if (typeFilter !== 'all' && r.type !== typeFilter) return false;
    if (teamFilter !== 'all' && r.team !== teamFilter) return false;
    if (!rvInRange(r.payTime, dateRange)) return false;
    if (search) {
      const s = search.toLowerCase();
      return (r.userName || '').toLowerCase().includes(s) ||
             (r.uid || '').toLowerCase().includes(s) ||
             (r.phone || '').includes(s) ||
             (r.noteCK || '').toLowerCase().includes(s) ||
             (r.orderId || '').toLowerCase().includes(s) ||
             (r.saleName || '').toLowerCase().includes(s);
    }
    return true;
  });

  const { VND } = window.MockData;
  const totalGmv = filtered.reduce((s, r) => s + (r.realPayVnd || 0), 0);

  // KPIs by type
  const byType = (t) => filtered.filter(r => r.type === t);
  const sumByType = (t) => byType(t).reduce((s, r) => s + (r.realPayVnd || 0), 0);

  const todayPreset = () => {
    const today = '2026-05-26';
    setDateRange({ from: today, to: today, preset: 'today' });
  };
  const resetFilters = () => {
    setDateRange({ from: '', to: '', preset: 'all' });
    setTypeFilter('all'); setTeamFilter('all'); setSearch('');
  };

  const openRow = openId ? revenue.find(r => r.id === openId) : null;

  return (
    <div className="page">
      <div style={{ fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.55 }}>
        Lọc theo <strong style={{ color: 'var(--text-2)' }}>Pay Time</strong> (ngày tiền về). Quy đổi RMB mặc định: <strong style={{ color: 'var(--text-2)' }}>GMV (RMB) = VND ÷ 3.700</strong>.
        Mỗi dòng đại diện một khoản tiền đã ghi nhận doanh thu — có thể đến từ Payment Request, đơn lẻ offline, KOC, lives, công hải…
      </div>

      {/* Filter bar */}
      <div className="rv-filterbar">
        <div className="rv-filter-grid">
          <div className="field">
            <label>Từ ngày</label>
            <input type="date" value={dateRange.from || ''} onChange={(e) => setDateRange({ ...dateRange, from: e.target.value, preset: 'custom' })} />
          </div>
          <div className="field">
            <label>Đến ngày</label>
            <input type="date" value={dateRange.to || ''} onChange={(e) => setDateRange({ ...dateRange, to: e.target.value, preset: 'custom' })} />
          </div>
          <div className="field">
            <label>Loại doanh thu</label>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="all">Tất cả</option>
              {Object.entries(window.REVENUE_TYPE_META).map(([k, v]) => <option key={k} value={k}>{v.full}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Team</label>
            <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
              <option value="all">Tất cả teams</option>
              {(window.SALES_TEAMS || []).map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
        <div className="rv-filter-actions">
          <button className="btn btn-outline btn-sm" onClick={() => { /* refresh */ }}>Làm mới</button>
          <button className="btn btn-secondary btn-sm" onClick={todayPreset}>Hôm nay</button>
          <button className="btn btn-secondary btn-sm" onClick={resetFilters}>Reset bộ lọc</button>
          <button className="btn btn-outline btn-sm"><window.Icons.Database size={13} /> Sync Data</button>
          <button className="btn btn-primary btn-sm" onClick={() => onAddRevenue && onAddRevenue()}><window.Icons.Plus size={13} /> Thêm dòng</button>
        </div>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
        Tổng hợp theo bộ lọc: <strong style={{ color: 'var(--text-2)' }}>{dateRange.from || '—'} → {dateRange.to || 'nay'}</strong>
        {' · '}Loại: <strong style={{ color: 'var(--text-2)' }}>{typeFilter === 'all' ? 'Tất cả' : window.REVENUE_TYPE_META[typeFilter]?.full}</strong>
        {' · '}Team: <strong style={{ color: 'var(--text-2)' }}>{teamFilter === 'all' ? 'Tất cả teams' : teamFilter}</strong>
      </div>

      {/* Hero KPIs */}
      <div className="rv-hero-row">
        <div className="rv-hero rv-hero-gmv">
          <div className="kpi-label">Tổng GMV</div>
          <div className="rv-hero-value">{VND(totalGmv)}</div>
          <div className="kpi-sub">≈ ¥ {Math.round(totalGmv / 3700).toLocaleString('vi-VN')} (RMB ước tính)</div>
        </div>
        <div className="rv-hero">
          <div className="kpi-label">Số đơn</div>
          <div className="rv-hero-value">{filtered.length.toLocaleString('vi-VN')}</div>
          <div className="kpi-sub">trong khoảng lọc</div>
        </div>
      </div>

      {/* Type breakdown KPIs */}
      <div className="rv-kpi-grid">
        {[
          { k: 'lives',       label: 'LIVES',          color: 'success' },
          { k: 'offline',     label: 'OFFLINE',        color: 'info' },
          { k: 'other',       label: 'OTHER',          color: 'neutral' },
          { k: 'kho_chung',   label: '公海 - KHO CHUNG', color: 'primary' },
          { k: 'newsale_ads', label: '广告 - ADS',     color: 'danger' },
          { k: 'renew',       label: '续费 - RENEW',   color: 'warning' },
          { k: 'refer',       label: '转介绍 - REFER', color: 'pink' },
          { k: 'koc',         label: 'KOC',            color: 'teal' },
        ].map(({ k, label, color }) => {
          const arr = byType(k);
          const sum = sumByType(k);
          return (
            <div key={k} className={`rv-kpi kpi-${color}`}>
              <div className="kpi-label">{label}</div>
              <div className="rv-kpi-value">{VND(sum)}</div>
              <div className="kpi-sub">{arr.length} đơn</div>
            </div>
          );
        })}
      </div>

      {/* Table */}
      <div className="table-card">
        <div className="table-head">
          <h3>Sổ doanh thu <span className="meta">· Hiển thị {filtered.length} / {revenue.length} dòng</span></h3>
          <div className="search" style={{ minWidth: 240 }}>
            <window.Icons.Search size={14} stroke="var(--text-3)" />
            <input placeholder="Tìm tên / UID / SĐT / order / nội dung CK…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ minWidth: 170 }}>User name</th>
                <th style={{ width: 140 }}>Phone</th>
                <th style={{ width: 130 }}>UID</th>
                <th style={{ width: 120 }}>Pay time</th>
                <th style={{ width: 130, textAlign: 'right' }}>Real pay (VND)</th>
                <th style={{ width: 180 }}>Nội dung CK</th>
                <th style={{ width: 140 }}>Order ID</th>
                <th style={{ width: 60, textAlign: 'center' }}>Pay</th>
                <th style={{ width: 130 }}>Type</th>
                <th style={{ width: 130 }}>Sales</th>
                <th style={{ width: 100 }}>Team</th>
                <th style={{ width: 32 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={12}><div className="empty"><window.Icons.Search size={20} /><div>Không có dòng doanh thu nào khớp bộ lọc.</div></div></td></tr>
              )}
              {filtered.map(r => {
                const country = (window.COUNTRIES || []).find(c => c.code === (r.country || 'VN')) || { dial: '+84', flag: '🇻🇳' };
                return (
                  <tr key={r.id} className={openId === r.id ? 'selected' : ''} onClick={() => setOpenId(r.id)}>
                    <td>
                      <div className="cell-name" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {r.userName}
                      </div>
                      <div style={{ marginTop: 4 }}><SaleLabelChip label={r.saleLabel} /></div>
                    </td>
                    <td>
                      <span className="cell-phone" style={{ whiteSpace: 'nowrap', fontSize: 12.5 }}>
                        {country.dial} {window.MockData.fmtPhone(r.phone)}
                      </span>
                    </td>
                    <td><span className="cell-mono">{r.uid}</span></td>
                    <td>
                      <div className="cell-time">{r.payTime?.split(' ')[0].split('-').reverse().join('/')}</div>
                      <div className="time-relative">{r.payTime?.split(' ')[1]}</div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 700, color: 'var(--money)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                        {window.MockData.VND(r.realPayVnd)}
                      </div>
                      {r.realPayRmb && (
                        <div style={{ fontSize: 10.5, color: 'var(--text-3)' }}>¥ {Number(r.realPayRmb).toLocaleString('vi-VN')}</div>
                      )}
                    </td>
                    <td><span style={{ fontSize: 12, color: 'var(--text-2)' }}>{r.noteCK || '—'}</span></td>
                    <td><span className="cell-mono" style={{ fontSize: 11.5, color: r.orderId ? 'var(--text-2)' : 'var(--text-3)' }}>{r.orderId || '—'}</span></td>
                    <td style={{ textAlign: 'center' }}><PaymentMethodBadge method={r.paymentMethod} /></td>
                    <td><RevenueTypeBadge type={r.type} compact /></td>
                    <td><span style={{ fontSize: 12.5 }}>{r.saleName || '—'}</span></td>
                    <td><span style={{ fontSize: 12, color: 'var(--text-2)' }}>{r.team}</span></td>
                    <td><span className="row-action"><window.Icons.ChevronRight size={14} /></span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <RevenueDetailDrawer
        entry={openRow}
        prs={prs}
        ars={ars}
        open={!!openId}
        onClose={() => setOpenId(null)}
        onUpdate={(updated) => { onUpdateRevenue(updated); }}
        onOpenPr={(pr) => { setOpenId(null); onOpenPr && onOpenPr(pr); }}
        onOpenAr={(arId) => { setOpenId(null); onOpenAr && onOpenAr(arId); }}
        onOpenInvoice={() => { setOpenId(null); onOpenInvoice && onOpenInvoice(); }}
        onOpenTxn={() => { setOpenId(null); onOpenTxn && onOpenTxn(); }}
      />
    </div>
  );
}

window.RevenuePage = RevenuePage;
window.RevenueDetailDrawer = RevenueDetailDrawer;
window.RevenueTypeBadge = RevenueTypeBadge;
window.PaymentMethodBadge = PaymentMethodBadge;
