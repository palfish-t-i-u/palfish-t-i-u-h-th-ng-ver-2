// sidebar.jsx — left navigation

const SB_SECTIONS = [
  {
    label: 'Khách hàng & Đơn hàng',
    items: [
      { id: 'payments', label: 'Quản lý thanh toán', icon: 'Wallet' },
    ],
  },
  {
    label: 'Đối soát & Hóa đơn',
    items: [
      { id: 'reconciliation', label: 'Đối soát giao dịch', icon: 'History' },
      { id: 'activate',       label: 'Kích hoạt khóa học', icon: 'CheckSquare' },
      { id: 'invoice',        label: 'Xuất hóa đơn',       icon: 'Doc' },
    ],
  },
  {
    label: 'Báo cáo',
    items: [
      { id: 'revenue',   label: 'Sổ doanh thu',       icon: 'Book' },
      { id: 'reports',   label: 'Báo cáo',            icon: 'Bar', children: [
        { id: 'bc01', title: 'BC01: Sales performance', desc: 'GMV theo team × sale × tháng' },
        { id: 'bc02', title: 'BC02: Key Data',           desc: 'Then chốt quy trình bán' },
        { id: 'bc03', title: 'BC03 — Báo cáo tổng bộ',   desc: 'KPI + doanh thu / trial / referral' },
      ]},
    ],
  },
  {
    label: 'Dữ liệu',
    items: [
      { id: 'crm',       label: 'Đồng bộ CRM',        icon: 'Database' },
      { id: 'dashboard', label: 'Dashboard Sale',     icon: 'Dash' },
    ],
  },
  {
    label: 'Tài khoản & Quyền',
    items: [
      { id: 'staff',     label: 'Nhân sự Sale',       icon: 'Users' },
      { id: 'auth',      label: 'Tài khoản Auth',     icon: 'Shield' },
      { id: 'profile',   label: 'Thông tin cá nhân',  icon: 'User' },
    ],
  },
];

function Sidebar({ currentPage = 'payments', onChangePage, counts = {} }) {
  const [openReports, setOpenReports] = React.useState(true);
  const [collapsed, setCollapsed] = React.useState(false);

  React.useEffect(() => {
    document.body.classList.toggle('sb-collapsed', collapsed);
  }, [collapsed]);

  const goto = (id) => onChangePage && onChangePage(id);

  return (
    <aside
      className={`sb ${collapsed ? 'collapsed' : ''}`}
    >
      <div className="sb-brand">
        <div className="sb-logo"><Icons.Grid size={18} stroke="white" strokeWidth={2.2} /></div>
        {!collapsed && (
          <div className="sb-brand-text">
            <div className="sb-brand-name">PalFish GMV</div>
            <div className="sb-brand-sub">Reconciliation</div>
          </div>
        )}
        <button
          className="sb-toggle"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? 'Mở rộng sidebar' : 'Thu gọn sidebar'}
        >
          {collapsed ? <Icons.ChevronRight size={14} /> : <Icons.ChevronLeft size={14} />}
        </button>
      </div>

      {SB_SECTIONS.map((sect) => (
        <div key={sect.label}>
          <div className="sb-sect">{sect.label}</div>
          {sect.items.map((it) => {
            const Ico = Icons[it.icon];
            const hasChildren = !!it.children;
            const expanded = hasChildren ? openReports : false;
            const isActive = currentPage === it.id;
            const cnt = counts[it.id];
            const attention = ['reconciliation', 'activate', 'invoice'].includes(it.id) && cnt > 0;
            return (
              <React.Fragment key={it.id}>
                <div
                  className={`sb-item ${isActive ? 'active' : ''}`}
                  data-label={it.label}
                  title={collapsed ? it.label : undefined}
                  onClick={() => {
                    if (hasChildren && !collapsed) { setOpenReports(!openReports); return; }
                    goto(it.id);
                  }}
                >
                  <span className="sb-ico">{Ico ? <Ico size={17} /> : null}</span>
                  <span className="sb-label">{it.label}</span>
                  {cnt != null && cnt > 0 && (
                    <span className={`sb-count ${attention ? 'is-attention' : ''}`}>{cnt}</span>
                  )}
                  {hasChildren && (
                    <span className="sb-ico sb-chev" style={{
                      marginLeft: 'auto', transition: 'transform 160ms',
                      transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)'
                    }}>
                      <Icons.ChevronDown size={15} />
                    </span>
                  )}
                </div>
                {hasChildren && expanded && !collapsed && it.children.map((c) => (
                  <div key={c.id} className="sb-sub">
                    <div className="sb-sub-title">{c.title}</div>
                    <div className="sb-sub-desc">{c.desc}</div>
                  </div>
                ))}
              </React.Fragment>
            );
          })}
        </div>
      ))}
    </aside>
  );
}

window.Sidebar = Sidebar;
