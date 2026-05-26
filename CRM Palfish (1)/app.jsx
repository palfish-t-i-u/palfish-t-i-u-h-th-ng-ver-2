// app.jsx — main composition (page routing across modules)

const { useState, useEffect, useMemo, useRef } = React;
const DateRangeFilter = window.DateRangeFilter;
const ReconciliationPage = window.ReconciliationPage;
const ActivationPage = window.ActivationPage;
const InvoicePage = window.InvoicePage;
const RevenuePage = window.RevenuePage;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "density": "regular",
  "showKpiRow": true,
  "showQuickFilters": true,
  "primaryColor": "#6f5cf3"
}/*EDITMODE-END*/;

// Page metadata for the topbar
const PAGE_META = {
  payments:       { title: 'Quản lý thanh toán', sub: 'Theo dõi Payment Requests, biên lai & tiến độ chuyển khoản của khách' },
  reconciliation: { title: 'Đối soát giao dịch', sub: 'Kế toán xác nhận từng giao dịch khi tiền đã về tài khoản công ty' },
  activate:       { title: 'Kích hoạt khóa học', sub: 'Admin tạo Active Request, sinh Course Code và điền Order ID tương ứng' },
  invoice:        { title: 'Xuất hóa đơn',       sub: 'Kế toán phát hành INV cho từng Course Code đã có Order ID' },
  revenue:        { title: 'Sổ doanh thu',       sub: 'Pay Time · GMV RMB = VND÷3700 — M3 tự động + điền tay + Sync sheet' },
  crm:            { title: 'Đồng bộ CRM',        sub: 'Module sắp ra mắt' },
  dashboard:      { title: 'Dashboard Sale',     sub: 'Module sắp ra mắt' },
  staff:          { title: 'Nhân sự Sale',       sub: 'Module sắp ra mắt' },
  auth:           { title: 'Tài khoản Auth',     sub: 'Module sắp ra mắt' },
  profile:        { title: 'Thông tin cá nhân',  sub: 'Module sắp ra mắt' },
};

function ComingSoonPage({ pageId }) {
  const meta = PAGE_META[pageId] || { title: pageId };
  return (
    <div className="page" style={{ alignItems: 'center', justifyContent: 'center', minHeight: '60vh', textAlign: 'center' }}>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
        padding: '50px 60px', maxWidth: 460,
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: 14, background: 'var(--primary-50)', color: 'var(--primary)',
          display: 'grid', placeItems: 'center', margin: '0 auto 14px',
        }}><Icons.Sparkle size={24} /></div>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{meta.title}</h2>
        <div style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 6, lineHeight: 1.55 }}>
          Module này sẽ được thiết kế trong các bước kế tiếp.
          Hiện tại chỉ có <strong style={{ color: 'var(--text-2)' }}>Quản lý thanh toán</strong> và <strong style={{ color: 'var(--text-2)' }}>Đối soát giao dịch</strong> đã sẵn sàng.
        </div>
      </div>
    </div>
  );
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [prs, setPrs] = useState(window.MockData.SAMPLE_PRS);
  const [ars, setArs] = useState(window.MockData.SAMPLE_ARS);
  const [revenue, setRevenue] = useState(window.MockData.SAMPLE_REVENUE);
  const [currentPage, setCurrentPage] = useState('payments');
  const [openArId, setOpenArId] = useState(null);

  // Payments page state
  const [selected, setSelected] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [qrView, setQrView] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [tab, setTab] = useState('active');
  const [filterState, setFilterState] = useState('all');
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState({ from: '', to: '', preset: 'all' });

  useEffect(() => {
    document.body.classList.toggle('density-compact', t.density === 'compact');
  }, [t.density]);

  useEffect(() => {
    document.documentElement.style.setProperty('--primary', t.primaryColor);
  }, [t.primaryColor]);

  const activePrs = prs.filter((p) => !p.cancelled);
  const cancelledPrs = prs.filter((p) => p.cancelled);

  // Awaiting txn count for sidebar badge
  const awaitingTxnCount = useMemo(() => {
    let n = 0;
    prs.forEach(p => {
      if (p.cancelled) return;
      p.qrs.forEach(q => { if (q.status !== 'paid' && q.status !== 'rejected' && q.bill) n++; });
    });
    return n;
  }, [prs]);

  // Active Request pending count for sidebar badge
  const pendingArCount = useMemo(() => {
    return ars.filter(ar => {
      const all = ar.uids.flatMap(u => u.courses);
      const ordered = all.filter(c => c.orderId && c.orderId.trim()).length;
      return ordered < all.length;
    }).length;
  }, [ars]);

  // Map of prId -> AR (for showing "Gói học đã tạo" indicator in PR table)
  const arByPrId = useMemo(() => {
    const m = {};
    ars.forEach(ar => { if (ar.prId) m[ar.prId] = ar; });
    return m;
  }, [ars]);

  const withArCount = useMemo(() => {
    return activePrs.filter(p => arByPrId[p.id]).length;
  }, [activePrs, arByPrId]);

  // Pending-invoice count for sidebar badge (courses with orderId but not invoiced)
  const pendingInvoiceCount = useMemo(() => {
    let n = 0;
    ars.forEach(ar => {
      ar.uids.forEach(u => {
        u.courses.forEach(c => {
          if (c.orderId && c.orderId.trim() && !c.invoiced) n++;
        });
      });
    });
    return n;
  }, [ars]);

  const kpis = useMemo(() => {
    const total = activePrs.length;
    const done = activePrs.filter((p) => p.state === 'done').length;
    const short = activePrs.filter((p) => p.state === 'short' || p.state === 'pending').length;
    const over = activePrs.filter((p) => p.state === 'over').length;
    const sumTarget = activePrs.reduce((s, p) => s + p.target, 0);
    const sumReceived = activePrs.reduce((s, p) => s + p.received, 0);
    return { total, done, short, over, sumTarget, sumReceived };
  }, [prs, tab]);

  const handleSelect = (p) => { setSelected(p); setDrawerOpen(true); };
  const handleClose = () => setDrawerOpen(false);

  useEffect(() => {
    if (selected) {
      const fresh = prs.find((p) => p.id === selected.id);
      if (fresh && fresh !== selected) setSelected(fresh);
    }
  }, [prs]);

  const recompute = (p) => {
    const received = p.qrs.filter((q) => q.status === 'paid' && !q.cancelled).reduce((s, q) => s + q.amount, 0);
    const doneCount = p.qrs.filter((q) => q.status === 'paid' && !q.cancelled).length;
    const totalCount = p.qrs.filter((q) => !q.cancelled).length;
    const delta = received - p.target;
    let state = 'pending';
    if (p.cancelled) state = 'cancelled';
    else if (received === 0) state = 'pending';
    else if (delta === 0) state = 'done';
    else if (delta > 0) state = 'over';
    else state = 'short';
    return { ...p, received, doneCount, totalCount, delta, state };
  };

  const handleUpdatePr = (updated) => {
    const next = recompute(updated);
    setPrs((cur) => cur.map((p) => p.id === next.id ? next : p));
    setSelected(next);
  };

  const handleCreate = (formData) => {
    const num = prs.length + 1;
    const newPr = {
      id: `PR-2026-${String(43 + num).padStart(4, '0')}`,
      name: formData.name, uid: formData.uid, phone: formData.phone,
      country: formData.country || 'VN',
      address: formData.address || '', ward: formData.ward || '', province: formData.province || '',
      note: formData.note || '', target: formData.target,
      source: 'Bán mới',
      createdAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
      qrs: [], cancelled: false, cancelledAt: null, cancelledReason: null,
      received: 0, doneCount: 0, totalCount: 0, delta: -formData.target, state: 'pending',
    };
    setPrs([newPr, ...prs]);
    setCreateOpen(false);
    setTab('active');
    setSelected(newPr);
    setDrawerOpen(true);
    setCurrentPage('payments');
  };

  const handleCancelClick = (p, action = 'cancel') => {
    if (action === 'cancel') setCancelTarget(p);
    if (action === 'restore') {
      setPrs((cur) => cur.map((x) => x.id === p.id ? recompute({ ...x, cancelled: false, cancelledAt: null, cancelledReason: null }) : x));
    }
  };

  const handleConfirmCancel = ({ reason }) => {
    if (!cancelTarget) return;
    const at = new Date().toISOString().slice(0, 16).replace('T', ' ');
    setPrs((cur) => cur.map((x) => x.id === cancelTarget.id
      ? recompute({ ...x, cancelled: true, cancelledAt: at, cancelledReason: reason || '' })
      : x
    ));
    setCancelTarget(null);
    if (selected?.id === cancelTarget.id) setDrawerOpen(false);
  };

  // ─────────── Reconciliation handlers ───────────
  const handleConfirmTxn = (txn) => {
    const at = new Date().toISOString().slice(0, 16).replace('T', ' ');
    setPrs((cur) => cur.map((p) => p.id === txn.prId
      ? recompute({
          ...p,
          qrs: p.qrs.map((q) => q.idx === txn.idx
            ? { ...q, status: 'paid', paidAt: at, rejectedAt: null, rejectReason: null }
            : q
          ),
        })
      : p
    ));
  };

  const handleRejectTxn = (txn) => {
    const at = new Date().toISOString().slice(0, 16).replace('T', ' ');
    setPrs((cur) => cur.map((p) => p.id === txn.prId
      ? recompute({
          ...p,
          qrs: p.qrs.map((q) => q.idx === txn.idx
            ? (q.status === 'paid'
                // unconfirm — bring back to "Chờ xác nhận"
                ? { ...q, status: 'pending', paidAt: null }
                : { ...q, status: 'rejected', rejectedAt: at,
                    rejectReason: 'Không tìm thấy giao dịch khớp trên sao kê.' }
              )
            : q
          ),
        })
      : p
    ));
  };

  const handleOpenPrFromTxn = (pr) => {
    setCurrentPage('payments');
    setSelected(pr);
    setDrawerOpen(true);
  };

  // ─────────── Active Request handlers ───────────
  const handleUpdateAr = (updated) => {
    setArs((cur) => cur.map((a) => a.id === updated.id ? updated : a));
  };

  const handleCreateAr = (data) => {
    // data: { prId?, customerName, uid, packageName, amount }
    const nextNum = ars.length + 1;
    const id = `AR-2026-${String(nextNum).padStart(4, '0')}`;
    const numPart = id.replace(/[^\d]/g, '').slice(-4);
    const newAr = {
      id,
      prId: data.prId || null,
      customerName: data.customerName,
      createdAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
      createdBy: 'admin.tranminhanh',
      uids: [
        {
          uid: data.uid,
          courses: [
            {
              courseCode: `CC-${numPart}-001`,
              packageName: data.packageName,
              amount: data.amount,
              orderId: '',
            },
          ],
        },
      ],
    };
    setArs((cur) => [newAr, ...cur]);
    setCurrentPage('activate');
    setOpenArId(id);
    setDrawerOpen(false);
    return newAr;
  };

  const handleCreateArFromPr = (pr) => {
    handleCreateAr({
      prId: pr.id,
      customerName: pr.name,
      uid: pr.uid,
      packageName: '',
      amount: pr.target,
    });
  };

  const handleOpenAr = (arId) => {
    setOpenArId(arId);
  };

  const handleOpenArFromInvoice = (arId) => {
    setCurrentPage('activate');
    setOpenArId(arId);
  };

  // ───── Revenue handlers ─────
  const handleUpdateRevenue = (updated) => {
    setRevenue((cur) => cur.map((r) => r.id === updated.id ? updated : r));
  };

  const handleAddRevenue = () => {
    const nextNum = revenue.length + 1;
    const newRow = {
      id: `RV-2026-${String(nextNum).padStart(4, '0')}`,
      userName: '', saleLabel: 'M3', phone: '', country: 'VN', uid: '',
      payTime: new Date().toISOString().slice(0, 16).replace('T', ' '),
      realPayVnd: 0, realPayRmb: null,
      noteCK: '', orderId: '', paymentMethod: '1st',
      type: 'newsale_ads', saleName: '—', team: 'System',
      prId: null, arId: null, courseCode: null, invoiceId: null,
    };
    setRevenue((cur) => [newRow, ...cur]);
  };

  const filterChips = [
    { id: 'all', label: 'Tất cả', count: activePrs.length },
    { id: 'pending', label: 'Chưa TT', count: activePrs.filter((p) => p.state === 'pending').length, color: 'var(--text-2)' },
    { id: 'short', label: 'Thiếu', count: activePrs.filter((p) => p.state === 'short').length, color: 'var(--danger)' },
    { id: 'done', label: 'Đủ', count: activePrs.filter((p) => p.state === 'done').length, color: 'var(--success)' },
    { id: 'over', label: 'Thừa', count: activePrs.filter((p) => p.state === 'over').length, color: 'var(--warning)' },
  ];

  const pageMeta = PAGE_META[currentPage] || { title: currentPage, sub: '' };

  return (
    <div className="app">
      <Sidebar
        currentPage={currentPage}
        onChangePage={setCurrentPage}
        counts={{ reconciliation: awaitingTxnCount, activate: pendingArCount, invoice: pendingInvoiceCount }}
      />
      <main className="main">
        <header className="topbar" data-screen-label={pageMeta.title}>
          <div>
            <h1>{pageMeta.title}</h1>
            <div className="sub">{pageMeta.sub}</div>
          </div>
          <div className="topbar-right">
            <span className="role-pill">SYSTEM</span>
            <span className="user-email">hieuhn.mplanner@gmail.com</span>
            <button className="btn-ghost">Đăng xuất</button>
          </div>
        </header>

        {/* ─── Payments page ─── */}
        {currentPage === 'payments' && (
          <div className="page">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ fontSize: 12.5, color: 'var(--text-3)', maxWidth: 640, lineHeight: 1.55 }}>
                Mỗi <strong style={{ color: 'var(--text-2)' }}>Payment Request</strong> đại diện cho một thương vụ.
                Một PR có thể gồm <strong style={{ color: 'var(--text-2)' }}>nhiều lần thanh toán</strong> (chuyển khoản nhiều lần
                hoặc 1 lần CK cho nhiều đơn). Khi đủ 100% sẽ chuyển sang bước Active Request.
              </div>
              <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
                <Icons.Plus size={15} strokeWidth={2.3} /> Tạo Payment Request
              </button>
            </div>

            {t.showKpiRow && tab !== 'cancelled' && (
              <div className="kpi-row">
                <div className="kpi">
                  <div className="kpi-icon"><Icons.Wallet size={16} /></div>
                  <div className="kpi-label">Tổng PR đang theo dõi</div>
                  <div className="kpi-value">{kpis.total}</div>
                  <div className="kpi-sub">{kpis.done} đã đủ tiền · {kpis.short} đang thiếu</div>
                </div>
                <div className="kpi">
                  <div className="kpi-icon" style={{ background: 'var(--success-bg)', color: 'var(--success-text)' }}><Icons.Sigma size={16} /></div>
                  <div className="kpi-label">Đã thu</div>
                  <div className="kpi-value">{window.MockData.VND(kpis.sumReceived)}</div>
                  <div className="kpi-sub">{kpis.sumTarget ? Math.round(kpis.sumReceived / kpis.sumTarget * 100) : 0}% / dự kiến {window.MockData.VND(kpis.sumTarget)}</div>
                </div>
                <div className="kpi">
                  <div className="kpi-icon" style={{ background: 'var(--danger-bg)', color: 'var(--danger-text)' }}><Icons.AlertCircle size={16} /></div>
                  <div className="kpi-label">Còn thiếu</div>
                  <div className="kpi-value">{window.MockData.VND(Math.max(0, kpis.sumTarget - kpis.sumReceived))}</div>
                  <div className="kpi-sub">{kpis.short} PR cần đôn khách</div>
                </div>
                <div className="kpi">
                  <div className="kpi-icon" style={{ background: 'var(--warning-bg)', color: 'var(--warning-text)' }}><Icons.Clock size={16} /></div>
                  <div className="kpi-label">Sẵn sàng kích hoạt</div>
                  <div className="kpi-value">{kpis.done + kpis.over}</div>
                  <div className="kpi-sub">PR đủ tiền chờ chuyển B3</div>
                </div>
              </div>
            )}

            <div className="toolbar">
              <div className="search">
                <Icons.Search size={15} stroke="var(--text-3)" />
                <input
                  placeholder="Tìm theo PR-ID, tên khách, UID hoặc số điện thoại…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              {t.showQuickFilters && tab !== 'cancelled' && filterChips.map((c) => (
                <button
                  key={c.id}
                  className={`filter-chip ${filterState === c.id ? 'active' : ''}`}
                  onClick={() => setFilterState(c.id)}
                >
                  {c.color && filterState !== c.id && <span className="dot" style={{ background: c.color }} />}
                  {c.label}
                  <span style={{
                    fontWeight: 600, color: filterState === c.id ? 'var(--primary-700)' : 'var(--text-3)',
                    background: filterState === c.id ? 'white' : 'var(--surface-3)',
                    padding: '1px 7px', borderRadius: 999, fontSize: 11.5, marginLeft: 2,
                  }}>{c.count}</span>
                </button>
              ))}
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                <DateRangeFilter value={dateRange} onChange={setDateRange} />
              </div>
            </div>

            <PaymentTable
              prs={prs}
              selectedId={drawerOpen ? selected?.id : null}
              onSelect={handleSelect}
              filterState={tab === 'cancelled' ? 'all' : filterState}
              search={search}
              dateRange={dateRange}
              tab={tab}
              onTabChange={setTab}
              onCancelClick={handleCancelClick}
              activeCount={activePrs.length}
              cancelledCount={cancelledPrs.length}
              withArCount={withArCount}
              arByPrId={arByPrId}
            />
          </div>
        )}

        {/* ─── Reconciliation page ─── */}
        {currentPage === 'reconciliation' && (
          <ReconciliationPage
            prs={prs}
            onConfirmTxn={handleConfirmTxn}
            onRejectTxn={handleRejectTxn}
            onOpenPr={handleOpenPrFromTxn}
          />
        )}

        {/* ─── Activation (B3) page ─── */}
        {currentPage === 'activate' && (
          <ActivationPage
            ars={ars}
            prs={prs}
            onUpdateAr={handleUpdateAr}
            onCreateAr={handleCreateAr}
            onOpenPr={handleOpenPrFromTxn}
            openArId={openArId}
            onOpenAr={handleOpenAr}
          />
        )}

        {/* ─── Invoice (B4) page ─── */}
        {currentPage === 'invoice' && (
          <InvoicePage
            ars={ars}
            prs={prs}
            onUpdateAr={handleUpdateAr}
            onOpenAr={handleOpenArFromInvoice}
          />
        )}

        {/* ─── Revenue page ─── */}
        {currentPage === 'revenue' && (
          <RevenuePage
            revenue={revenue}
            prs={prs}
            ars={ars}
            onUpdateRevenue={handleUpdateRevenue}
            onAddRevenue={handleAddRevenue}
            onOpenPr={handleOpenPrFromTxn}
            onOpenAr={handleOpenArFromInvoice}
            onOpenInvoice={() => setCurrentPage('invoice')}
            onOpenTxn={() => setCurrentPage('reconciliation')}
          />
        )}

        {/* ─── Coming soon pages ─── */}
        {currentPage !== 'payments' && currentPage !== 'reconciliation' && currentPage !== 'activate' && currentPage !== 'invoice' && currentPage !== 'revenue' && (
          <ComingSoonPage pageId={currentPage} />
        )}
      </main>

      <DetailDrawer
        pr={selected}
        open={drawerOpen}
        onClose={handleClose}
        onUpdatePr={handleUpdatePr}
        onShowQr={(qr) => setQrView({ qr, pr: selected })}
        onCancelRequest={(p) => setCancelTarget(p)}
        onCreateActiveRequest={handleCreateArFromPr}
        onCreatePayment={(p) => { setDrawerOpen(false); setCurrentPage('reconciliation'); }}
      />

      <CreatePrModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreate}
      />

      {qrView && (
        <QrViewModal qr={qrView.qr} pr={qrView.pr} onClose={() => setQrView(null)} />
      )}

      {cancelTarget && (
        <CancelPrModal
          pr={cancelTarget}
          onClose={() => setCancelTarget(null)}
          onConfirm={handleConfirmCancel}
        />
      )}

      <TweaksPanel>
        <TweakSection label="Trang" />
        <TweakRadio
          label="Module"
          value={['payments', 'reconciliation', 'activate', 'invoice'].includes(currentPage) ? currentPage : 'payments'}
          options={['payments', 'reconciliation', 'activate', 'invoice']}
          onChange={(v) => setCurrentPage(v)}
        />
        <TweakSection label="Hiển thị" />
        <TweakRadio
          label="Độ dày bảng"
          value={t.density}
          options={['compact', 'regular']}
          onChange={(v) => setTweak('density', v)}
        />
        <TweakToggle label="Hiện thẻ KPI" value={t.showKpiRow} onChange={(v) => setTweak('showKpiRow', v)} />
        <TweakToggle label="Hiện bộ lọc nhanh" value={t.showQuickFilters} onChange={(v) => setTweak('showQuickFilters', v)} />
        <TweakSection label="Thương hiệu" />
        <TweakColor
          label="Màu chủ đạo"
          value={t.primaryColor}
          options={['#6f5cf3', '#2563eb', '#0ea5e9', '#16a34a', '#ec4899']}
          onChange={(v) => setTweak('primaryColor', v)}
        />
        <TweakSection label="Demo" />
        <TweakButton label="Mở PR đầu danh sách" onClick={() => { setCurrentPage('payments'); handleSelect(prs.find(p => !p.cancelled)); }} />
        <TweakButton label="Mở dialog tạo PR mới" onClick={() => setCreateOpen(true)} />
        <TweakButton label="Chuyển sang tab Đã huỷ" onClick={() => { setCurrentPage('payments'); setTab('cancelled'); }} />
        <TweakButton label="Mở Đối soát giao dịch" onClick={() => setCurrentPage('reconciliation')} />
        <TweakButton label="Mở Kích hoạt khoá học" onClick={() => setCurrentPage('activate')} />
        <TweakButton label="Mở Xuất hóa đơn" onClick={() => setCurrentPage('invoice')} />
        <TweakButton label="Mở Sổ doanh thu" onClick={() => setCurrentPage('revenue')} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
