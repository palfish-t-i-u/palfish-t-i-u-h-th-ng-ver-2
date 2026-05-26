// mock-data.jsx — sample Payment Requests

const VND = (n) => new Intl.NumberFormat('vi-VN').format(n) + ' đ';
const fmtPhone = (raw) => raw.replace(/(\d{4})(\d{3})(\d+)/, '$1 $2 $3');

// helper to make a PR
function pr({ id, name, uid, phone, country, address, ward, province, note, target, qrs, source, createdAt, cancelled }) {
  const received = qrs.filter(q => q.status === 'paid').reduce((s, q) => s + q.amount, 0);
  const doneCount = qrs.filter(q => q.status === 'paid').length;
  const totalCount = qrs.length;
  const delta = received - target;
  let state = 'pending';
  if (cancelled) state = 'cancelled';
  else if (received === 0) state = 'pending';
  else if (delta === 0) state = 'done';
  else if (delta > 0) state = 'over';
  else state = 'short';
  return {
    id, name, uid, phone, country: country || 'VN',
    address, ward: ward || '', province: province || '',
    note, target, qrs,
    source, createdAt, cancelled: !!cancelled,
    cancelledAt: cancelled?.at || null,
    cancelledReason: cancelled?.reason || null,
    received, doneCount, totalCount, delta, state,
  };
}

// QR helper with default payment method = 'qr'
const m = (over) => ({ method: 'qr', ...over });

const SAMPLE_PRS = [
  pr({
    id: 'PR-2026-0042',
    name: 'Nguyễn Thị Mai Anh',
    uid: '3213123123',
    phone: '0934428123',
    country: 'VN',
    address: '119, Phố Phúc Xá',
    ward: 'Phường Phúc Xá',
    province: 'Thành phố Hà Nội',
    note: 'Khách yêu cầu chuyển khoản 2 đợt — đợt 1 trước 20/05, đợt 2 sau khi nhận lương',
    target: 24_000_000,
    source: 'Bán mới',
    createdAt: '2026-05-18 09:42',
    qrs: [
      m({ idx: 1, amount: 12_000_000, status: 'paid',    createdAt: '2026-05-18 09:45', paidAt: '2026-05-18 10:12', code: 'TT-PR42-001', bank: 'MB Bank', bill: true,  method: 'qr' }),
      m({ idx: 2, amount: 12_000_000, status: 'paid',    createdAt: '2026-05-23 14:10', paidAt: '2026-05-23 16:32', code: 'TT-PR42-002', bank: 'MB Bank', bill: true,  method: 'qr' }),
    ],
  }),
  pr({
    id: 'PR-2026-0041',
    name: 'Trần Văn Hiếu',
    uid: '232323232',
    phone: '0933332232',
    country: 'VN',
    address: 'Số 12 Lê Lợi',
    ward: 'Phường Tràng Tiền',
    province: 'Thành phố Hà Nội',
    note: 'Cọc trước 5 triệu, sẽ chuyển nốt khi học thử xong',
    target: 18_500_000,
    source: 'Khách giới thiệu',
    createdAt: '2026-05-22 11:15',
    qrs: [
      m({ idx: 1, amount: 5_000_000,  status: 'paid',    createdAt: '2026-05-22 11:20', paidAt: '2026-05-22 11:48', code: 'TT-PR41-001', bank: 'Vietcombank', bill: true,  method: 'cash' }),
      m({ idx: 2, amount: 8_000_000,  status: 'paid',    createdAt: '2026-05-23 09:00', paidAt: '2026-05-23 14:05', code: 'TT-PR41-002', bank: 'Vietcombank', bill: true,  method: 'qr' }),
      m({ idx: 3, amount: 5_500_000,  status: 'pending', createdAt: '2026-05-24 08:30', paidAt: null,               code: 'TT-PR41-003', bank: 'Vietcombank', bill: true, method: 'qr' }),
    ],
  }),
  pr({
    id: 'PR-2026-0040',
    name: 'Phạm Thu Hương',
    uid: '0123456789',
    phone: '0123456789',
    country: 'VN',
    address: 'Số 4 Trần Hưng Đạo',
    ward: 'Phường Quang Trung',
    province: 'Tỉnh Hà Giang',
    note: '',
    target: 12_000_000,
    source: 'Bán mới',
    createdAt: '2026-05-24 08:02',
    qrs: [
      m({ idx: 1, amount: 12_000_000, status: 'paid', createdAt: '2026-05-24 08:05', paidAt: '2026-05-24 08:33', code: 'TT-PR40-001', bank: 'Techcombank', bill: true, method: 'card' }),
    ],
  }),
  pr({
    id: 'PR-2026-0039',
    name: 'Lê Minh Đức',
    uid: 'minhduc1990',
    phone: '0838762341',
    country: 'VN',
    address: 'Số 275 Hạ Long',
    ward: 'Phường Tuần Châu',
    province: 'Tỉnh Quảng Ninh',
    note: 'Mua 2 khoá cho 2 con — sẽ tách order sau khi đủ tiền',
    target: 36_000_000,
    source: 'Bán mới',
    createdAt: '2026-05-20 16:48',
    qrs: [
      m({ idx: 1, amount: 10_000_000, status: 'paid', createdAt: '2026-05-20 16:52', paidAt: '2026-05-20 18:10', code: 'TT-PR39-001', bank: 'BIDV', bill: true,  method: 'qr' }),
      m({ idx: 2, amount: 10_000_000, status: 'paid', createdAt: '2026-05-21 09:00', paidAt: '2026-05-21 12:45', code: 'TT-PR39-002', bank: 'BIDV', bill: true,  method: 'qr' }),
      m({ idx: 3, amount: 16_000_000, status: 'pending', createdAt: '2026-05-23 10:30', paidAt: null,            code: 'TT-PR39-003', bank: 'BIDV', bill: true, method: 'installment', installmentMonths: '6' }),
    ],
  }),
  pr({
    id: 'PR-2026-0038',
    name: 'Đặng Khánh Linh',
    uid: 'khanhlinh',
    phone: '0987234511',
    country: 'VN',
    address: 'Tổ 3 Phương Lâm',
    ward: 'Phường Phương Lâm',
    province: 'Tỉnh Bắc Kạn',
    note: 'Khách chuyển dư 200k — báo Hiền note vào sổ',
    target: 12_000_000,
    source: 'Khách giới thiệu',
    createdAt: '2026-05-19 13:22',
    qrs: [
      m({ idx: 1, amount: 12_200_000, status: 'paid', createdAt: '2026-05-19 13:25', paidAt: '2026-05-19 14:01', code: 'TT-PR38-001', bank: 'MB Bank', bill: true, method: 'qr' }),
    ],
  }),
  pr({
    id: 'PR-2026-0037',
    name: 'Vũ Hoàng Anh',
    uid: 'hoanganh23',
    phone: '0356874123',
    country: 'VN',
    address: 'Tổ 5, Đường Cầu Diễn',
    ward: 'Phường Cầu Diễn',
    province: 'Thành phố Hà Nội',
    note: '',
    target: 8_500_000,
    source: 'Bán mới',
    createdAt: '2026-05-24 19:11',
    qrs: [
      m({ idx: 1, amount: 4_000_000, status: 'paid',    createdAt: '2026-05-24 19:14', paidAt: '2026-05-24 19:42', code: 'TT-PR37-001', bank: 'Techcombank', bill: true,  method: 'cash' }),
      m({ idx: 2, amount: 4_500_000, status: 'pending', createdAt: '2026-05-25 08:00', paidAt: null,               code: 'TT-PR37-002', bank: 'PalFish POS', bill: true, method: 'card', cardLast4: '4242' }),
    ],
  }),
  pr({
    id: 'PR-2026-0036',
    name: 'Hoàng Thị Lan',
    uid: 'hoanglan_88',
    phone: '0967424123',
    country: 'VN',
    address: 'Số 1222 đường Quang Trung',
    ward: 'Phường Quang Trung',
    province: 'Tỉnh Hà Giang',
    note: 'Đã gọi xác nhận lúc 14h',
    target: 6_000_000,
    source: 'Bán mới',
    createdAt: '2026-05-23 14:00',
    qrs: [
      m({ idx: 1, amount: 6_000_000, status: 'paid', createdAt: '2026-05-23 14:05', paidAt: '2026-05-23 14:48', code: 'TT-PR36-001', bank: 'MB Bank', bill: true, method: 'qr' }),
    ],
  }),
  pr({
    id: 'PR-2026-0035',
    name: 'Bùi Quốc Khánh',
    uid: 'quockhanh',
    phone: '0838329001',
    country: 'VN',
    address: 'Số 88 Cầu Giấy',
    ward: 'Phường Dịch Vọng',
    province: 'Thành phố Hà Nội',
    note: '',
    target: 14_000_000,
    source: 'Khách giới thiệu',
    createdAt: '2026-05-22 16:30',
    qrs: [
      m({ idx: 1, amount: 7_000_000, status: 'paid', createdAt: '2026-05-22 16:35', paidAt: '2026-05-22 17:12', code: 'TT-PR35-001', bank: 'VPBank', bill: true, method: 'qr' }),
    ],
  }),
  pr({
    id: 'PR-2026-0034',
    name: 'Tô Hà Anh',
    uid: 'hoangha',
    phone: '0098328423',
    country: 'VN',
    address: 'Số 7 Trung Hoà',
    ward: 'Phường Trung Hoà',
    province: 'Thành phố Hà Nội',
    note: 'Khách chuyển nhầm 500k — sẽ hoàn lại sau',
    target: 8_000_000,
    source: 'Bán mới',
    createdAt: '2026-05-21 10:18',
    qrs: [
      m({ idx: 1, amount: 8_500_000, status: 'paid', createdAt: '2026-05-21 10:22', paidAt: '2026-05-21 11:05', code: 'TT-PR34-001', bank: 'MB Bank', bill: true, method: 'qr' }),
    ],
  }),
  pr({
    id: 'PR-2026-0033',
    name: 'Đinh Phương Thảo',
    uid: 'phuongthao',
    phone: '0398765432',
    country: 'VN',
    address: 'Số 14 Lý Thường Kiệt',
    ward: 'Phường Minh Khai',
    province: 'Tỉnh Hà Giang',
    note: '',
    target: 22_000_000,
    source: 'Bán mới',
    createdAt: '2026-05-20 09:00',
    qrs: [
      m({ idx: 1, amount: 11_000_000, status: 'paid',    createdAt: '2026-05-20 09:05', paidAt: '2026-05-20 09:48', code: 'TT-PR33-001', bank: 'Techcombank', bill: true,  method: 'qr' }),
      m({ idx: 2, amount: 11_000_000, status: 'pending', createdAt: '2026-05-25 08:30', paidAt: null,               code: 'TT-PR33-002', bank: 'Văn phòng PalFish', bill: true, method: 'cash', cashier: 'Thu Hiền' }),
    ],
  }),
  pr({
    id: 'PR-2026-0032',
    name: 'Cao Tuấn Vũ',
    uid: 'tuanvu',
    phone: '0912334455',
    country: 'VN',
    address: 'Tổ 7 Thị xã Tuyên Quang',
    ward: 'Phường Phan Thiết',
    province: 'Tỉnh Tuyên Quang',
    note: 'Khách yêu cầu tách thành 4 lần',
    target: 32_000_000,
    source: 'Khách giới thiệu',
    createdAt: '2026-05-18 14:00',
    qrs: [
      m({ idx: 1, amount: 8_000_000, status: 'paid',    createdAt: '2026-05-18 14:05', paidAt: '2026-05-18 14:32', code: 'TT-PR32-001', bank: 'BIDV', bill: true,  method: 'qr' }),
      m({ idx: 2, amount: 8_000_000, status: 'paid',    createdAt: '2026-05-20 10:00', paidAt: '2026-05-20 11:10', code: 'TT-PR32-002', bank: 'BIDV', bill: true,  method: 'qr' }),
      m({ idx: 3, amount: 8_000_000, status: 'paid',    createdAt: '2026-05-22 09:30', paidAt: '2026-05-22 10:15', code: 'TT-PR32-003', bank: 'BIDV', bill: true,  method: 'qr' }),
      m({ idx: 4, amount: 8_000_000, status: 'pending', createdAt: '2026-05-24 14:00', paidAt: null,               code: 'TT-PR32-004', bank: 'BIDV', bill: false, method: 'qr' }),
    ],
  }),
  pr({
    id: 'PR-2026-0031',
    name: 'Lý Hồng Nhung',
    uid: 'hongnhung',
    phone: '0937123456',
    country: 'VN',
    address: 'Số 28 Láng Hạ',
    ward: 'Phường Láng Hạ',
    province: 'Thành phố Hà Nội',
    note: '',
    target: 4_500_000,
    source: 'Bán mới',
    createdAt: '2026-05-25 08:45',
    qrs: [
      m({ idx: 1, amount: 4_500_000, status: 'pending', createdAt: '2026-05-25 08:50', paidAt: null, code: 'TT-PR31-001', bank: 'MB Bank', bill: false, method: 'qr' }),
    ],
  }),
  // Cancelled ones (no successful payments)
  pr({
    id: 'PR-2026-0030',
    name: 'Trịnh Văn Hùng',
    uid: 'vanhung',
    phone: '0934428192',
    country: 'VN',
    address: 'Số 5 Trần Phú',
    ward: 'Phường Yên Thịnh',
    province: 'Tỉnh Yên Bái',
    note: 'Khách đổi ý không mua nữa, nhờ huỷ.',
    target: 8_000_000,
    source: 'Bán mới',
    createdAt: '2026-05-17 10:30',
    cancelled: { at: '2026-05-19 09:10', reason: 'Khách không có nhu cầu' },
    qrs: [
      m({ idx: 1, amount: 8_000_000, status: 'pending', createdAt: '2026-05-17 10:35', paidAt: null, code: 'TT-PR30-001', bank: 'MB Bank', bill: false, method: 'qr' }),
    ],
  }),
  pr({
    id: 'PR-2026-0029',
    name: 'Nguyễn Thị Thư',
    uid: 'test25',
    phone: '0987612345',
    country: 'VN',
    address: 'Số 21 Lê Hồng Phong',
    ward: 'Phường Lê Hồng Phong',
    province: 'Tỉnh Quảng Ninh',
    note: '',
    target: 6_500_000,
    source: 'Bán mới',
    createdAt: '2026-05-16 15:22',
    cancelled: { at: '2026-05-18 10:00', reason: 'Tạo nhầm' },
    qrs: [],
  }),
];

// ───────── Active Requests (B3 — Kích hoạt khoá học) ─────────
const COURSE_PACKAGES = [
  '2/W- NEW 48 US-UK+2 HN',
  '2/W- NEW 96 US-UK+5 HN',
  '2/W- UPSALE 24 US-UK+1 HN',
  '2/W- UPSALE 48 PHI+5 HN',
  '2/W- UPSALE 96 PHI+10 HN',
  '2/W- UPSALE 144 PHI+15 HN',
  '3/W- COMBO 48 US-UK+2 HN',
  '5/W- VIP 96 US-UK+5 HN',
];

function buildAr({ id, prId, customerName, createdAt, createdBy = 'admin.tranminhanh', uids }) {
  return { id, prId: prId || null, customerName, createdAt, createdBy, uids };
}

const SAMPLE_ARS = [
  buildAr({
    id: 'AR-2026-0001',
    prId: 'PR-2026-0042',
    customerName: 'Nguyễn Thị Mai Anh',
    createdAt: '2026-05-23 17:00',
    uids: [
      {
        uid: '3213123123', phone: '0934428123', country: 'VN',
        courses: [
          { courseCode: 'CC-0001-001', packageName: '2/W- NEW 48 US-UK+2 HN', amount: 12_000_000, orderId: 'ORD-2026-87654', invoiced: true,  invoiceId: 'INV-2026-1042', invoicedAt: '2026-05-24 09:30', email: 'maianh.nguyen@gmail.com', taxCode: '', customerType: 'individual', companyName: '', note: 'Khách quen, xuất HĐ cá nhân' },
          { courseCode: 'CC-0001-002', packageName: '2/W- UPSALE 24 US-UK+1 HN', amount: 12_000_000, orderId: 'ORD-2026-87655', invoiced: false, invoiceId: '' },
        ],
      },
    ],
  }),
  buildAr({
    id: 'AR-2026-0002',
    prId: 'PR-2026-0040',
    customerName: 'Phạm Thu Hương',
    createdAt: '2026-05-25 09:10',
    uids: [
      {
        uid: '0123456789', phone: '0123456789', country: 'VN',
        courses: [
          { courseCode: 'CC-0002-001', packageName: '2/W- NEW 48 US-UK+2 HN', amount: 12_000_000, orderId: '', invoiced: false, invoiceId: '' },
        ],
      },
    ],
  }),
  buildAr({
    id: 'AR-2026-0003',
    prId: 'PR-2026-0038',
    customerName: 'Đặng Khánh Linh',
    createdAt: '2026-05-22 11:42',
    uids: [
      {
        uid: 'khanhlinh', phone: '0987234511', country: 'VN',
        courses: [
          { courseCode: 'CC-0003-001', packageName: '2/W- UPSALE 96 PHI+10 HN', amount: 6_000_000, orderId: 'ORD-2026-87600', invoiced: true,  invoiceId: 'INV-2026-1038', invoicedAt: '2026-05-22 15:20', email: 'khanhlinh.dang@company.vn', taxCode: '0312345678', customerType: 'business', companyName: 'Công ty TNHH Thương mại Khang Linh', note: 'Doanh nghiệp, xuất đứng tên công ty' },
        ],
      },
      {
        uid: 'linh_con_nho', phone: '0987234511', country: 'VN',
        courses: [
          { courseCode: 'CC-0003-002', packageName: '2/W- UPSALE 48 PHI+5 HN', amount: 6_000_000, orderId: '', invoiced: false, invoiceId: '' },
        ],
      },
    ],
  }),
  buildAr({
    id: 'AR-2026-0004',
    prId: 'PR-2026-0036',
    customerName: 'Hoàng Thị Lan',
    createdAt: '2026-05-24 09:15',
    uids: [
      {
        uid: 'hoanglan_88', phone: '0967424123', country: 'VN',
        courses: [
          { courseCode: 'CC-0004-001', packageName: '2/W- UPSALE 48 PHI+5 HN', amount: 6_000_000, orderId: 'ORD-2026-87612', invoiced: true, invoiceId: 'INV-2026-1036', invoicedAt: '2026-05-24 14:05', email: 'hoanglan88@gmail.com', taxCode: '', customerType: 'individual', companyName: '', note: '' },
        ],
      },
    ],
  }),
];

// ───────── Revenue Ledger (Sổ doanh thu) ─────────
const REVENUE_TYPE_META = {
  newsale_ads: { vi: 'Bán mới',     zh: '广告',       full: '广告 - ADS',           cls: 'type-ads' },
  offline:     { vi: 'Offline',     zh: 'OFFLINE',    full: 'OFFLINE',              cls: 'type-offline' },
  refer:       { vi: 'Giới thiệu',  zh: '转介绍',     full: '转介绍 - REFER',       cls: 'type-refer' },
  renew:       { vi: 'Tái tục',     zh: '续费',       full: '续费 - RENEW',         cls: 'type-renew' },
  koc:         { vi: 'KOC',         zh: 'KOC',        full: 'KOC',                  cls: 'type-koc' },
  lives:       { vi: 'Lives',       zh: '直播',       full: 'LIVES',                cls: 'type-lives' },
  kho_chung:   { vi: 'Kho chung',   zh: '公海',       full: '公海 - KHO CHUNG',     cls: 'type-kho' },
  other:       { vi: 'Khác',        zh: 'OTHER',     full: 'OTHER',                cls: 'type-other' },
};

const SALES_TEAMS = ['System', 'Inhouse 1', 'Inhouse 2', 'TAY 1', 'TAY 2'];
const SALES_PEOPLE = ['—', 'Hồ Thị Thanh', 'Đặng Kim Thượng', 'Trần Thu Hiền', 'Nguyễn Anh Tuấn', 'Phan Thuỳ Linh', 'Vũ Hồng Hà', 'Bùi Quang Minh'];

function rv({ id, userName, saleLabel = 'M3', phone, country = 'VN', uid, payTime, realPayVnd, realPayRmb = null, noteCK = '', orderId = '', paymentMethod = '1st', type, saleName = '—', team = 'System', prId = null, arId = null, courseCode = null, invoiceId = null, note = '' }) {
  return { id, userName, saleLabel, phone, country, uid, payTime, realPayVnd, realPayRmb, noteCK, orderId, paymentMethod, type, saleName, team, prId, arId, courseCode, invoiceId, note };
}

const SAMPLE_REVENUE = [
  // ── Derived from existing PRs (cross-module-linked) ──
  rv({ id: 'RV-2026-0001', userName: 'Nguyễn Thị Mai Anh', saleLabel: 'M3', phone: '0934428123', uid: '3213123123', payTime: '2026-05-18 10:12', realPayVnd: 12_000_000, noteCK: 'Thanh toan KH042', orderId: 'ORD-2026-87654', paymentMethod: '1st', type: 'newsale_ads', saleName: 'Hồ Thị Thanh', team: 'Inhouse 1', prId: 'PR-2026-0042', arId: 'AR-2026-0001', courseCode: 'CC-0001-001', invoiceId: 'INV-2026-1042' }),
  rv({ id: 'RV-2026-0002', userName: 'Nguyễn Thị Mai Anh', saleLabel: 'M3', phone: '0934428123', uid: '3213123123', payTime: '2026-05-23 16:32', realPayVnd: 12_000_000, noteCK: 'Thanh toan KH042', orderId: 'ORD-2026-87655', paymentMethod: '2nd', type: 'newsale_ads', saleName: 'Hồ Thị Thanh', team: 'Inhouse 1', prId: 'PR-2026-0042', arId: 'AR-2026-0001', courseCode: 'CC-0001-002' }),
  rv({ id: 'RV-2026-0003', userName: 'Trần Văn Hiếu',      saleLabel: 'M3', phone: '0933332232', uid: '232323232',  payTime: '2026-05-22 11:48', realPayVnd: 5_000_000,  noteCK: 'Thanh toan KH041', orderId: '',                paymentMethod: '1st', type: 'refer', saleName: 'Đặng Kim Thượng', team: 'Inhouse 1', prId: 'PR-2026-0041' }),
  rv({ id: 'RV-2026-0004', userName: 'Trần Văn Hiếu',      saleLabel: 'M3', phone: '0933332232', uid: '232323232',  payTime: '2026-05-23 14:05', realPayVnd: 8_000_000,  noteCK: 'Thanh toan KH041', orderId: '',                paymentMethod: '2nd', type: 'refer', saleName: 'Đặng Kim Thượng', team: 'Inhouse 1', prId: 'PR-2026-0041' }),
  rv({ id: 'RV-2026-0005', userName: 'Phạm Thu Hương',     saleLabel: 'M3', phone: '0123456789', uid: '0123456789', payTime: '2026-05-24 08:33', realPayVnd: 12_000_000, noteCK: 'Thanh toan KH040', orderId: '',                paymentMethod: '1st', type: 'newsale_ads', saleName: 'Trần Thu Hiền', team: 'Inhouse 2', prId: 'PR-2026-0040', arId: 'AR-2026-0002', courseCode: 'CC-0002-001' }),
  rv({ id: 'RV-2026-0006', userName: 'Lê Minh Đức',        saleLabel: 'M3', phone: '0838762341', uid: 'minhduc1990', payTime: '2026-05-20 18:10', realPayVnd: 10_000_000, noteCK: 'Thanh toan KH039', orderId: '',                paymentMethod: '1st', type: 'newsale_ads', saleName: 'Nguyễn Anh Tuấn', team: 'Inhouse 2', prId: 'PR-2026-0039' }),
  rv({ id: 'RV-2026-0007', userName: 'Lê Minh Đức',        saleLabel: 'M3', phone: '0838762341', uid: 'minhduc1990', payTime: '2026-05-21 12:45', realPayVnd: 10_000_000, noteCK: 'Thanh toan KH039', orderId: '',                paymentMethod: '2nd', type: 'newsale_ads', saleName: 'Nguyễn Anh Tuấn', team: 'Inhouse 2', prId: 'PR-2026-0039' }),
  rv({ id: 'RV-2026-0008', userName: 'Đặng Khánh Linh',    saleLabel: 'M3', phone: '0987234511', uid: 'khanhlinh', payTime: '2026-05-19 14:01', realPayVnd: 12_200_000, noteCK: 'Thanh toan KH038', orderId: 'ORD-2026-87600', paymentMethod: '1st', type: 'refer', saleName: 'Phan Thuỳ Linh', team: 'TAY 1', prId: 'PR-2026-0038', arId: 'AR-2026-0003', courseCode: 'CC-0003-001', invoiceId: 'INV-2026-1038' }),
  rv({ id: 'RV-2026-0009', userName: 'Hoàng Thị Lan',      saleLabel: 'M3', phone: '0967424123', uid: 'hoanglan_88', payTime: '2026-05-23 14:48', realPayVnd: 6_000_000, noteCK: 'Thanh toan KH036', orderId: 'ORD-2026-87612', paymentMethod: '1st', type: 'newsale_ads', saleName: 'Vũ Hồng Hà', team: 'Inhouse 1', prId: 'PR-2026-0036', arId: 'AR-2026-0004', courseCode: 'CC-0004-001', invoiceId: 'INV-2026-1036' }),

  // ── Standalone external entries (sync sheet / hand-entered) for type variety ──
  rv({ id: 'RV-2026-0010', userName: 'Minh',          saleLabel: 'TAY', phone: '944022155', country: 'VN', uid: '3311861764', payTime: '2026-05-24 09:00', realPayVnd: 9_010_000, realPayRmb: 2436, noteCK: '—', orderId: '—', paymentMethod: '1st', type: 'refer',   saleName: 'Hồ Thị Thanh',    team: 'Inhouse 1' }),
  rv({ id: 'RV-2026-0011', userName: 'Minh',          saleLabel: 'TAY', phone: '944022155', country: 'VN', uid: '3311861764', payTime: '2026-05-24 09:30', realPayVnd: 4_440_000, realPayRmb: 1200, noteCK: '—', orderId: '—', paymentMethod: '1st', type: 'refer',   saleName: 'Hồ Thị Thanh',    team: 'Inhouse 1' }),
  rv({ id: 'RV-2026-0012', userName: 'Thu Hà',        saleLabel: 'TAY', phone: '972367236', country: 'VN', uid: '3302173275', payTime: '2026-05-24 10:20', realPayVnd: 16_430_000, realPayRmb: 4441, noteCK: 'Renew KH012', orderId: '7473205878', paymentMethod: '2nd', type: 'renew',  saleName: 'Đặng Kim Thượng', team: 'Inhouse 1' }),
  rv({ id: 'RV-2026-0013', userName: 'Quỳnh Anh',     saleLabel: 'TAY', phone: '989112233', uid: '3304562215', payTime: '2026-05-24 11:15', realPayVnd: 22_800_000, realPayRmb: 6162, noteCK: 'Renew KH015', orderId: '7473205911', paymentMethod: '3rd', type: 'renew',  saleName: 'Đặng Kim Thượng', team: 'Inhouse 1' }),
  rv({ id: 'RV-2026-0014', userName: 'Vũ Thanh Bình', saleLabel: 'TAY', phone: '912345601', uid: '3309887701', payTime: '2026-05-22 19:40', realPayVnd: 18_500_000, realPayRmb: 5000, noteCK: '直播 KH022', orderId: '—', paymentMethod: '1st', type: 'lives', saleName: 'Trần Thu Hiền',  team: 'TAY 1' }),
  rv({ id: 'RV-2026-0015', userName: 'Cao Tuấn Vũ',   saleLabel: 'M3', phone: '0912334455', uid: 'tuanvu', payTime: '2026-05-18 14:32', realPayVnd: 8_000_000, noteCK: 'Thanh toan KH032', orderId: '—', paymentMethod: '1st', type: 'refer', saleName: 'Phan Thuỳ Linh', team: 'TAY 1', prId: 'PR-2026-0032' }),
  rv({ id: 'RV-2026-0016', userName: 'Bùi Thị Hằng',  saleLabel: 'OFF', phone: '0901223344', uid: 'hangbui', payTime: '2026-05-20 15:00', realPayVnd: 14_800_000, noteCK: 'Offline cash KH055', orderId: 'ORD-OFF-2255', paymentMethod: 'Cash', type: 'offline', saleName: 'Bùi Quang Minh', team: 'TAY 2' }),
  rv({ id: 'RV-2026-0017', userName: 'Trịnh Lan Phương', saleLabel: 'OFF', phone: '0976554433', uid: 'phuongtl', payTime: '2026-05-21 16:30', realPayVnd: 27_200_000, noteCK: 'Offline POS', orderId: 'ORD-OFF-2256', paymentMethod: 'Cash', type: 'offline', saleName: 'Bùi Quang Minh', team: 'TAY 2' }),
  rv({ id: 'RV-2026-0018', userName: 'Lê Phương Mai', saleLabel: 'TAY', phone: '0989778899', uid: '3310221103', payTime: '2026-05-19 20:15', realPayVnd: 38_400_000, realPayRmb: 10378, noteCK: 'ADS landing 03', orderId: '7473205955', paymentMethod: '1st', type: 'newsale_ads', saleName: 'Vũ Hồng Hà', team: 'Inhouse 2' }),
  rv({ id: 'RV-2026-0019', userName: 'Lý Quốc Bảo',    saleLabel: 'TAY', phone: '0938111223', uid: '3315002211', payTime: '2026-05-17 22:00', realPayVnd: 16_900_000, realPayRmb: 4567, noteCK: 'ADS FB ROAS', orderId: '7473206011', paymentMethod: '1st', type: 'newsale_ads', saleName: 'Nguyễn Anh Tuấn', team: 'Inhouse 2' }),
  rv({ id: 'RV-2026-0020', userName: 'Tô Văn Đông',   saleLabel: 'OFF', phone: '0907456712', uid: 'dongtv', payTime: '2026-05-22 14:10', realPayVnd: 8_400_000, noteCK: '直播 KH060', orderId: '—', paymentMethod: '1st', type: 'lives', saleName: 'Trần Thu Hiền', team: 'TAY 1' }),
  rv({ id: 'RV-2026-0021', userName: 'Đào Mai Anh',    saleLabel: 'M3', phone: '0917221145', uid: '3320001144', payTime: '2026-05-25 09:30', realPayVnd: 5_500_000, noteCK: 'KOC partner Hoa Tâm', orderId: '—', paymentMethod: '1st', type: 'koc', saleName: 'Hồ Thị Thanh', team: 'Inhouse 1' }),
  rv({ id: 'RV-2026-0022', userName: 'Hoàng Quốc Anh', saleLabel: 'M3', phone: '0902334455', uid: 'quocanh01', payTime: '2026-05-13 11:05', realPayVnd: 12_600_000, noteCK: '公海 inbound', orderId: '—', paymentMethod: '1st', type: 'kho_chung', saleName: '—', team: 'System' }),
  rv({ id: 'RV-2026-0023', userName: 'Phan Thị Hồng', saleLabel: 'M3', phone: '0966112233', uid: 'hongphan', payTime: '2026-05-14 15:42', realPayVnd: 9_900_000,  noteCK: '公海 - inbound landing', orderId: '—', paymentMethod: '1st', type: 'kho_chung', saleName: '—', team: 'System' }),
  rv({ id: 'RV-2026-0024', userName: 'Mai Quỳnh Hoa',  saleLabel: 'TAY', phone: '0907812345', uid: '3322201199', payTime: '2026-05-16 17:30', realPayVnd: 24_000_000, realPayRmb: 6486, noteCK: 'Renew Y2', orderId: '7473206155', paymentMethod: '2nd', type: 'renew', saleName: 'Đặng Kim Thượng', team: 'TAY 2' }),
  rv({ id: 'RV-2026-0025', userName: 'Đinh Việt Anh', saleLabel: 'TAY', phone: '0915334712', uid: '3328770011', payTime: '2026-05-15 08:50', realPayVnd: 7_200_000, noteCK: '直播 KH077', orderId: '—', paymentMethod: '1st', type: 'lives', saleName: 'Hồ Thị Thanh', team: 'TAY 1' }),
  rv({ id: 'RV-2026-0026', userName: 'Nguyễn Minh Quang', saleLabel: 'OFF', phone: '0908112266', uid: 'minhquang', payTime: '2026-05-11 14:00', realPayVnd: 19_500_000, noteCK: 'Offline POS HCM', orderId: 'ORD-OFF-2261', paymentMethod: 'Cash', type: 'offline', saleName: 'Bùi Quang Minh', team: 'TAY 2' }),
  rv({ id: 'RV-2026-0027', userName: 'Trần Bảo Ngọc', saleLabel: 'M3', phone: '0908445566', uid: 'baongoc', payTime: '2026-05-10 10:30', realPayVnd: 4_200_000, noteCK: 'KOC Linh Trang', orderId: '—', paymentMethod: '1st', type: 'koc', saleName: 'Phan Thuỳ Linh', team: 'Inhouse 1' }),
  rv({ id: 'RV-2026-0028', userName: 'Phạm Đình Hùng', saleLabel: 'M3', phone: '0904887766', uid: 'hungpd', payTime: '2026-05-08 16:20', realPayVnd: 31_800_000, noteCK: '公海 - hot lead Q2', orderId: '—', paymentMethod: '1st', type: 'kho_chung', saleName: '—', team: 'System' }),
  rv({ id: 'RV-2026-0029', userName: 'Đỗ Quang Huy',  saleLabel: 'TAY', phone: '0931455667', uid: '3331221001', payTime: '2026-05-19 09:00', realPayVnd: 13_800_000, realPayRmb: 3729, noteCK: '续费 Y1→Y2', orderId: '7473206211', paymentMethod: '2nd', type: 'renew', saleName: 'Vũ Hồng Hà', team: 'Inhouse 2' }),
  rv({ id: 'RV-2026-0030', userName: 'Trương Quỳnh Trang', saleLabel: 'M3', phone: '0925778899', uid: 'qtrang', payTime: '2026-05-09 12:15', realPayVnd: 6_800_000, noteCK: 'Bán mới landing OK', orderId: '—', paymentMethod: '1st', type: 'newsale_ads', saleName: 'Nguyễn Anh Tuấn', team: 'Inhouse 2' }),
];

window.MockData = { SAMPLE_PRS, SAMPLE_ARS, SAMPLE_REVENUE, VND, fmtPhone };
window.COURSE_PACKAGES = COURSE_PACKAGES;
window.REVENUE_TYPE_META = REVENUE_TYPE_META;
window.SALES_PEOPLE = SALES_PEOPLE;
window.SALES_TEAMS = SALES_TEAMS;
