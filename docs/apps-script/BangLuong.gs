/**
 * PalFish — BẢNG LƯƠNG TỰ ĐỘNG (M3 v3)
 * Sheet locale: Vietnamese → formulas dùng ; (không phải ,).
 */

const CFG = {
  bqProject:      'pf-salary',
  mainSheet:      'Bảng lương',
  dataSheet:      '_data',
  snapSheet:      '_snapshot',
  giamTruBanThan: 15500000,
  giamTruMoiNPT:  6200000,
};

const BQ_SQL = [
  "SELECT",
  "  t.code,",
  "  CASE",
  "    WHEN t.title_job LIKE '%Giám đốc%' THEN 'BOD'",
  "    WHEN UPPER(t.workplace) LIKE 'INHOUSE 2%' OR t.workplace LIKE '47 Nguy%' THEN 'Inhouse 2'",
  "    WHEN t.workplace LIKE 'Store%' THEN 'Offline'",
  "    WHEN t.title_job LIKE '%CS%' OR t.title_job LIKE '%Cleaner%' OR t.title_job LIKE '%保洁%' THEN 'CSKH'",
  "    WHEN t.title_job LIKE '%tuyển dụng%' OR t.title_job LIKE '%kế toán%' OR t.title_job LIKE '%Phiên dịch%' OR t.title_job LIKE '%Operation Leader%' OR t.title_job = 'Sales admin' THEN 'Back office'",
  "    WHEN t.title_job LIKE '%Design%' OR t.title_job LIKE '%Graphic%' OR t.title_job LIKE '%Marketing%' OR t.title_job LIKE '%@%' OR t.title_job LIKE '%full stack%' OR t.title_job LIKE '%Data%' THEN 'MKT'",
  "    WHEN t.title_job LIKE '%Teacher%' OR t.title_job LIKE '%Giáo viên%' THEN 'Head quarter'",
  "    WHEN UPPER(t.workplace) LIKE 'INHOUSE 1%' THEN 'Inhouse 1'",
  "    WHEN t.workplace LIKE 'Work from home%' THEN 'WFH'",
  "    ELSE COALESCE(t.workplace,'Khác') END AS team,",
  "  t.full_name, t.title_job, t.don_vi_cong,",
  "  TRIM(t.type_self) AS employee_type,",
  "  t.departments,",
  "  SAFE_CAST(t.basic_salary AS INT64) AS luong_co_ban,",
  "  cb.tong_cong AS cong,",
  "  t.luong_co_ban_theo_ngay_cong AS lcb_theo_ngay_cong,",
  "  t.bonus_com AS thuong_com,",
  "  t.bao_hiem_xa_hoi AS bao_hiem,",
  "  t.gmv_vnd AS gmv,",
  "  COALESCE(t.gmv_ban_moi, 0) AS gmv_ban_moi,",
  "  COALESCE(t.gmv_gioi_thieu, 0) AS gmv_gioi_thieu,",
  "  COALESCE(t.gmv_tai_ky, 0) AS gmv_tai_ky,",
  "  t.tro_cap_an_trua AS an_trua,",
  "  t.tro_cap_may_tinh AS may_tinh,",
  "  COALESCE(t.tro_cap_xe_trach_nhiem,0) AS xe_pc,",
  "  COALESCE(t.bu_tien, 0) AS bu_tien,",
  "  COALESCE(t.thue_tncn, 0) AS thue_tncn,",
  "  t.an_ca_van,",
  "  t.dien_thoai_van,",
  "  t.ghi_chu_thuong_nong,",
  "  COALESCE(t.so_nguoi_phu_thuoc, 0) AS so_npt",
  "FROM `pf-salary.payroll.C_view_bang_luong_truoc_thue` t",
  "LEFT JOIN `pf-salary.payroll.C_view_bang_luong_co_ban_theo_ngay_cong` cb ON cb.code = t.code",
  "ORDER BY",
  "  CASE team WHEN 'BOD' THEN 1 WHEN 'Inhouse 1' THEN 2 WHEN 'CSKH' THEN 3 WHEN 'Inhouse 2' THEN 4 WHEN 'Offline' THEN 5 WHEN 'Back office' THEN 6 WHEN 'MKT' THEN 7 WHEN 'Head quarter' THEN 8 ELSE 9 END,",
  "  CASE WHEN t.title_job LIKE '%Giám đốc%' THEN 1 WHEN t.title_job LIKE '%Leader%' OR t.title_job LIKE '%leader%' THEN 2 WHEN COALESCE(TRIM(t.type_self),'') NOT IN ('Chính thức','Thử việc','') THEN 4 ELSE 3 END,",
  "  t.full_name"
].join('\n');

function colIndex(key){ for(let i=0;i<COLS.length;i++) if(COLS[i].key===key) return i+1; throw 'no col '+key; }
function C(key){ return columnToLetter(colIndex(key)); }
function columnToLetter(n){ let s=''; while(n>0){ const m=(n-1)%26; s=String.fromCharCode(65+m)+s; n=(n-m-1)/26; } return s; }


const COLS = [
  // --- Identity ---
  { key:'stt',           h:'STT',                              role:'auto'  },
  { key:'code',          h:'Mã NV',                            role:'auto',  src:'code' },
  { key:'team',          h:'Team',                             role:'auto',  src:'team' },
  { key:'name',          h:'Name',                             role:'auto',  src:'full_name' },
  { key:'chuc_danh',     h:'Chức danh',                        role:'auto',  src:'title_job' },
  { key:'employee_type', h:'Loại NV',                           role:'auto',  src:'employee_type' },
  { key:'phong_ban',     h:'Phòng ban (HRIS)',                   role:'auto',  src:'departments' },
  // --- Summary ---
  { key:'tong_lt',       h:'Tổng lương + thưởng (Net)',        role:'calc',  f:r=>'='+C('tong_luong')+r+'+'+C('thuong_com')+r },
  { key:'tong_luong',    h:'Tổng lương',                       role:'calc',  f:r=>'='+C('lcb_ngay_cong')+r+'+'+C('an_trua')+r+'+'+C('may_tinh')+r+'+'+C('xe_pc')+r+'-'+C('bao_hiem')+r+'+'+C('bu_tien')+r+'-'+C('khau_tru_thue')+r },
  // --- Components (khớp bảng lương chị Trang tab 202607) ---
  { key:'luong_cb',      h:'Lương cơ bản',                     role:'auto',  src:'luong_co_ban' },
  { key:'cong',          h:'Công',                             role:'auto',  src:'cong' },
  { key:'lcb_ngay_cong', h:'LCB theo ngày công',               role:'auto',  src:'lcb_theo_ngay_cong' },
  { key:'thuong_com',    h:'Thưởng COM',                       role:'input', src:'thuong_com' },
  { key:'bao_hiem',      h:'Bảo hiểm',                         role:'auto',  src:'bao_hiem' },
  { key:'gmv',           h:'GMV',                              role:'auto',  src:'gmv' },
  { key:'gmv_ban_moi',   h:'GMV bán mới',                      role:'auto',  src:'gmv_ban_moi' },
  { key:'gmv_gioi_thieu',h:'GMV giới thiệu',                   role:'auto',  src:'gmv_gioi_thieu' },
  { key:'gmv_tai_ky',    h:'GMV tái ký',                        role:'auto',  src:'gmv_tai_ky' },
  { key:'an_trua',       h:'Hỗ trợ ăn trưa',                   role:'auto',  src:'an_trua' },
  { key:'may_tinh',      h:'Tiền hỗ trợ máy tính',             role:'auto',  src:'may_tinh' },
  { key:'xe_pc',         h:'Hỗ trợ tiền xe + PC trách nhiệm',  role:'input', src:'xe_pc' },
  { key:'khau_tru_thue', h:'Khấu trừ thuế',                    role:'auto',  src:'thue_tncn' },
  { key:'bu_tien',       h:'Bù tiền',                          role:'input', src:'bu_tien' },
  { key:'note',          h:'Note',                             role:'input', src:null },
  { key:'gc_thuong_nong',h:'Ghi chú thưởng nóng',              role:'auto',  src:'ghi_chu_thuong_nong' },
  // --- Status (khớp GATE_COLS trong PhieuLuongGate.gs — 5 cột tuần tự) ---
  { key:'xn_tt',         h:'Xác nhận thông tin',               role:'status', kind:'check' },
  { key:'gui_truoc',     h:'Gửi BL trước thuế',                role:'status', kind:'check' },
  { key:'nv_xn_truoc',   h:'NV xác nhận trước thuế',           role:'status', kind:'check' },
  { key:'gui_sau',       h:'Gửi BL sau thuế',                  role:'status', kind:'check' },
  { key:'nv_xn_sau',     h:'NV xác nhận sau thuế',             role:'status', kind:'check' },
];

function onOpen(){
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('⚙ Bảng lương')
    .addItem('🔄 (1) Cập nhật bảng lương', 'capNhatTuBigQuery')
    .addItem('📋 (2) Đối soát với bảng lương mẫu', 'doiSoatLuong')
    .addSeparator()
    .addItem('👁 Xem trước phiếu lương (dòng đang chọn)', 'xemTruocPhieuLuong')
    .addItem('📥 Xuất Excel theo Phòng ban', 'xuatExcelTheoTeam')
    .addSeparator()
    .addItem('🎨 Định dạng lại (không cần BQ)', 'dinhDangBangLuong')
    .addItem('📊 Cập nhật bảng tính thuế (tham chiếu)', 'capNhatBangThue')
    .addItem('💾 Lưu dữ liệu lương tháng này', 'luuArchiveBangLuong')
    .addSeparator()
    .addItem('🧾 Tạo tab Nhập tay (input)', 'taoTabNhapTay')
    .addItem('🗓️ Tạo tab Chấm công', 'taoTabChamCong')
    .addSeparator()
    .addItem('🔌 Cài đặt cổng gửi phiếu', 'installGateTriggers')
    .addItem('📤 Gửi phiếu đang chờ', 'flushOutbox')
    .addItem('📋 Mở hàng đợi', 'moHangDoi')
    .addItem('🔃 Đồng bộ xác nhận từ app', 'pullConfirmsFromApp')
    .addItem('🧪 Test kết nối Gate', 'testGateKetNoi')
    .addToUi();

  if (PropertiesService.getScriptProperties().getProperty('PL_DEV') === '1') {
    ui.createMenu('🧪 Chạy test')
      .addItem('chayTestThuan', 'chayTestThuan')
      .addItem('chayTestDocThat', 'chayTestDocThat')
      .addItem('Chụp baseline', 'test_chupBaseline')
      .addItem('So sánh baseline', 'test_soSanhBaseline')
      .addToUi();
  }
}

/* ================== TAB NHẬP TAY (kho input duy nhất) ==================
 * Chung nới bảng BQ C_imput_bao_hiem_tro_cap để chứa mọi ô input.
 * Nguồn hiện có = tab "Lương đóng BHXH" ở sheet HRIS.
 * Ta tạo 1 tab "Nhập tay" TRÊN CHÍNH sheet Bảng lương tự động: import data hiện
 * có + thêm cột input của app → 1 CHỖ DUY NHẤT để chị Trang điền tay.
 * Sau đó Chung tự nối tab này ngược lên BQ.
 */
const INPUT_CFG = {
  srcSheetId:  '168xXReeOhfsTB_9mhurmM-WgUElYf6TvLwb1n2P47Fc',
  srcTabName:  'Lương đóng BHXH',
  destTabName: 'Nhập tay',
  // Cột input của app KHÔNG có sẵn ở tab nguồn (bù tiền + xe+PC đã có bên nguồn).
  // NPT bỏ — Chung: lấy từ nguồn Vân (so_nguoi_phu_thuoc đã có trong BQ).
  extraInputCols: ['Thưởng COM (nhập tay)', 'Khấu trừ thuế (nhập tay)', 'Note'],
};

function taoTabNhapTay(){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();

  // Tab đã tồn tại: KHÔNG import đè (giữ data Trang đã điền), chỉ THÊM cột input còn thiếu.
  const existing = ss.getSheetByName(INPUT_CFG.destTabName);
  if(existing){
    const lastCol = existing.getLastColumn();
    const hdr = existing.getRange(1, 1, 1, lastCol).getValues()[0].map(function(x){ return String(x).trim(); });
    const missing = INPUT_CFG.extraInputCols.filter(function(h){ return hdr.indexOf(h) < 0; });
    if(!missing.length){ ui.alert('Tab "'+INPUT_CFG.destTabName+'" đã đủ cột — không cần làm gì.'); return; }
    existing.getRange(1, lastCol+1, 1, missing.length).setValues([missing])
      .setFontWeight('bold').setBackground('#0b5394').setFontColor('white')
      .setWrap(true).setHorizontalAlignment('center');
    const nRows = existing.getLastRow();
    if(nRows > 1) existing.getRange(2, lastCol+1, nRows-1, missing.length).setBackground('#FFF8E1');
    for(let k=lastCol+1; k<=lastCol+missing.length; k++) existing.autoResizeColumn(k);
    ui.alert('Đã THÊM cột input còn thiếu vào "'+INPUT_CFG.destTabName+'": '+missing.join(', ')+'.\n\n(Không đụng data cũ.)');
    return;
  }

  // 1. Đọc tab nguồn "Lương đóng BHXH" (live, cross-spreadsheet)
  let srcSS;
  try { srcSS = SpreadsheetApp.openById(INPUT_CFG.srcSheetId); }
  catch(e){ ui.alert('Không mở được sheet HRIS nguồn. Kiểm tra quyền truy cập.\n\n'+e); return; }
  const src = srcSS.getSheetByName(INPUT_CFG.srcTabName);
  if(!src){ ui.alert('Không thấy tab "'+INPUT_CFG.srcTabName+'" trong sheet HRIS.'); return; }
  const srcData = src.getDataRange().getValues();
  if(srcData.length < 1){ ui.alert('Tab nguồn rỗng.'); return; }
  const nCols = srcData[0].length;

  // 2. Tạo tab đích + ghi data nguồn (import 1 lần)
  const dest = ss.insertSheet(INPUT_CFG.destTabName);
  dest.getRange(1, 1, srcData.length, nCols).setValues(srcData);

  // 3. Thêm cột input của app (chỉ header, dữ liệu để trống cho Trang điền)
  const extra = INPUT_CFG.extraInputCols;
  if(extra.length) dest.getRange(1, nCols+1, 1, extra.length).setValues([extra]);

  // 4. Format: freeze header, header xanh, cột input app tô vàng
  dest.setFrozenRows(1);
  dest.getRange(1, 1, 1, nCols + extra.length)
      .setFontWeight('bold').setBackground('#0b5394').setFontColor('white')
      .setWrap(true).setHorizontalAlignment('center');
  if(srcData.length > 1 && extra.length){
    dest.getRange(2, nCols+1, srcData.length-1, extra.length).setBackground('#FFF8E1');
  }
  for(let i=1; i<=nCols+extra.length; i++) dest.autoResizeColumn(i);

  ui.alert('Đã tạo tab "'+INPUT_CFG.destTabName+'".\n\n'+
    (srcData.length-1)+' dòng · '+nCols+' cột từ "'+INPUT_CFG.srcTabName+'" + '+
    extra.length+' cột input app (tô vàng).\n\n'+
    'Giờ nhờ Chung nối tab này ngược lên BQ (C_imput_bao_hiem_tro_cap nới rộng). '+
    'Từ nay chị Trang chỉ điền input Ở ĐÂY.');
}

/* Tab CHẤM CÔNG — 1 nơi duy nhất chị Trang copy-paste bảng công tháng.
 * Nguồn công của Trang là sheet riêng, đổi mỗi tháng → để trống cho Trang dán.
 * Chung nối tab này lên BQ → script lấy ngày công (cong) từ BQ như hiện tại.
 */
function taoTabChamCong(){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const name = 'Chấm công';
  if(ss.getSheetByName(name)){
    ui.alert('Tab "'+name+'" đã tồn tại — KHÔNG tạo lại (tránh xoá bảng chị Trang đã dán).\n\n'+
      'Hàng tháng chị Trang cứ dán chấm công tháng mới ĐÈ LÊN tab này.');
    return;
  }
  ss.insertSheet(name);
  ui.alert('Đã tạo tab trống "'+name+'".\n\n'+
    'Hàng tháng chị Trang copy-paste bảng chấm công của chị vào đây (dán từ ô A1, kèm cả header của chị).\n\n'+
    'Chung nối tab này lên BQ → script tự lấy ngày công từ đó. Chỉ cập nhật ở 1 nơi duy nhất.');
}

function capNhatTuBigQuery(){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  var lk = LockService.getDocumentLock();
  if(!lk.tryLock(0)){ ss.toast('Đang có thao tác khác chạy, chờ chút.','Bảng lương',5); return; }
  try{
  const rows = queryBigQuery_();
  if(!rows.length){ ss.toast('Không có dữ liệu từ BigQuery.','Lỗi',5); return; }

  const data = ensureSheet_(ss, CFG.dataSheet, true);
  let snap = ss.getSheetByName(CFG.snapSheet);
  if(!snap){ snap = ss.insertSheet(CFG.snapSheet); snap.hideSheet(); }
  let snapMap = readSnap_(snap);
  const main = ensureSheet_(ss, CFG.mainSheet, false);

  writeRaw_(data, rows);

  const headers = COLS.map(c=>c.h);
  plAssertHeadersUnique_(headers);
  plAssertCodesUnique_(rows);
  ensureGridWidth_(main, headers.length);

  // Đọc dữ liệu cũ TRƯỚC khi clear — key theo Mã NV + TÊN cột (không theo vị trí dòng).
  // Bền với đổi thứ tự dòng (ORDER BY) VÀ đổi layout cột → giá trị điền tay không lệch/mất.
  const oldRange = main.getLastRow() > 1 ? main.getDataRange().getValues() : [];
  const oldHdr = oldRange.length ? oldRange[0].map(function(x){ return String(x).trim(); }) : [];
  const oldCodeIdx = oldHdr.indexOf('Mã NV');
  const oldByCode = {};
  if (oldRange.length > 1 && oldCodeIdx >= 0) {
    for (let i = 1; i < oldRange.length; i++) {
      const oc = String(oldRange[i][oldCodeIdx] || '').trim();
      if (oc) oldByCode[oc] = oldRange[i];
    }
  }
  const oldVal = function(code, headerName){
    const row = oldByCode[code]; if (!row) return '';
    const idx = oldHdr.indexOf(headerName);
    return idx >= 0 ? row[idx] : '';
  };

  // Detect column layout change → clear stale data (snapshot cột src không còn tin được)
  const layoutChanged = oldHdr.length !== headers.length ||
    headers.some((h, i) => h !== (oldHdr[i] || ''));
  if (layoutChanged && main.getLastRow() > 1) {
    const clearRange = main.getRange(2, 1, main.getLastRow() - 1, Math.max(oldHdr.length, headers.length));
    clearRange.clear();
    clearRange.clearDataValidations();
    // KHÔNG reset snapMap — readSnap_ map theo code + TÊN key, độc lập vị trí cột. Reset = nuốt Thưởng COM / Xe+PC / Bù tiền.
  }

  // Header
  main.getRange(1,1,1,headers.length).setValues([headers])
      .setFontWeight('bold').setBackground('#0b5394').setFontColor('white')
      .setWrap(true).setHorizontalAlignment('center');
  main.setFrozenRows(1);
  main.setFrozenColumns(colIndex('employee_type'));

  const newSnap = {};

  // Build all values + collect formula/checkbox columns
  const allVals = [];
  const formulaCols = {};
  const checkboxCols = [];

  for(let i=0; i<rows.length; i++){
    const r = i+2, d = rows[i], code = String(d.code||'').trim();
    newSnap[code] = {};
    const rowVals = [];

    for(let c=0; c<COLS.length; c++){
      const col = COLS[c];
      if(col.role==='auto'){
        rowVals.push(col.key==='stt' ? i+1 : (d[col.src]===null||d[col.src]===undefined ? '' : d[col.src]));
      } else if(col.role==='input'){
        const cur = oldVal(code, col.h);
        if(!col.src){
          // Input-only (Bù tiền, Note): KHÔNG có nguồn BQ → LUÔN giữ giá trị điền tay
          rowVals.push((cur===''||cur===null) ? '' : cur);
          newSnap[code][col.key] = '';
        } else {
          const autoVal = d[col.src]===null||d[col.src]===undefined ? '' : d[col.src];
          const prevAuto = (snapMap[code]||{})[col.key];
          rowVals.push((cur===''||cur===null||cur===prevAuto||prevAuto===undefined) ? autoVal : cur);
          newSnap[code][col.key] = autoVal;
        }
      } else if(col.role==='calc'){
        rowVals.push('');
        if(!formulaCols[c]) formulaCols[c] = [];
        formulaCols[c].push([col.f(r)]);
      } else if(col.role==='status' && col.kind==='check'){
        rowVals.push(false);
        if(i===0) checkboxCols.push(c);
      } else {
        rowVals.push('');
      }
    }
    allVals.push(rowVals);
  }

  // 1 batch write all values (~1 RPC instead of ~3600)
  main.getRange(2, 1, allVals.length, COLS.length).setValues(allVals);

  // Overlay formulas per column (~15 RPCs instead of ~1500)
  for(const ci in formulaCols){
    main.getRange(2, parseInt(ci)+1, formulaCols[ci].length, 1).setFormulas(formulaCols[ci]);
  }

  // Clear stale data validations (checkbox cũ ở vị trí cũ) rồi gắn checkbox mới
  main.getRange(2, 1, rows.length, COLS.length).clearDataValidations();
  checkboxCols.forEach(c => main.getRange(2, c+1, rows.length, 1).insertCheckboxes());

  // Clear excess rows
  const lastRow = main.getLastRow();
  if(lastRow > rows.length+1){
    var clearRange = main.getRange(rows.length+2, 1, lastRow-rows.length-1, COLS.length);
    clearRange.clear();
    clearRange.clearDataValidations();
  }

  // Clear excess columns (layout cũ rộng hơn → cột thừa còn nằm bên phải)
  const maxCols = main.getMaxColumns();
  if(maxCols > COLS.length){
    const excessRange = main.getRange(1, COLS.length+1, main.getMaxRows(), maxCols - COLS.length);
    excessRange.clear();
    excessRange.clearDataValidations();
  }

  writeSnap_(snap, newSnap);
  formatSheet_(main, rows.length);
  restoreGateTicks_(main);   // tick lại 5 cột trạng thái từ _gate_state (sống qua refresh BQ)
  ss.toast('Đã cập nhật '+rows.length+' NV từ BigQuery.', 'Bảng lương', 5);
  } finally { lk.releaseLock(); }
}

// Độ rộng cột cố định theo key (px) — hết cảnh autoResize làm dồn ứ / nhảy loạn.
const COL_WIDTH = {
  stt:38, code:72, team:80, name:150, chuc_danh:135, employee_type:80, phong_ban:110,
  cong:52, note:150,
};
const MONEY_KEYS = ['tong_lt','tong_luong','luong_cb','lcb_ngay_cong','thuong_com','bao_hiem',
                    'gmv','gmv_ban_moi','gmv_gioi_thieu','gmv_tai_ky',
                    'an_trua','may_tinh','xe_pc','khau_tru_thue','bu_tien'];

function formatSheet_(main, numRows){
  const numCols = COLS.length;

  // Header: wrap + căn giữa + cao hàng để chữ dài không bị cắt
  main.getRange(1, 1, 1, numCols)
      .setWrap(true).setVerticalAlignment('middle').setHorizontalAlignment('center')
      .setFontWeight('bold').setBackground('#0b5394').setFontColor('white');
  main.setRowHeight(1, 42);

  // Số tiền: #,##0 (âm hiện -X). Giá trị vẫn là SỐ → không ảnh hưởng lookup/BQ.
  MONEY_KEYS.forEach(function(k){ main.getRange(2, colIndex(k), numRows, 1).setNumberFormat('#,##0'); });

  // Màu theo role
  COLS.forEach(function(col, i){
    var bg = null;
    if(col.role==='input')  bg = '#FFF8E1';   // vàng = điền tay
    if(col.role==='calc')   bg = '#EEF2FF';   // xanh nhạt = công thức
    if(col.role==='status') bg = '#F3F4F6';   // xám = trạng thái
    if(bg) main.getRange(2, i+1, numRows, 1).setBackground(bg);
  });

  // 2 cột tổng in đậm
  ['tong_lt','tong_luong'].forEach(function(k){
    main.getRange(2, colIndex(k), numRows, 1).setFontWeight('bold');
  });

  main.getRange(1, 1, numRows+1, numCols)
    .setBorder(true, true, true, true, true, true, '#D1D5DB', SpreadsheetApp.BorderStyle.SOLID);

  // Độ rộng cột cố định (money mặc định 105, còn lại theo COL_WIDTH)
  COLS.forEach(function(col, i){
    var w = COL_WIDTH[col.key] || (col.role==='status' ? 95 : 105);
    main.setColumnWidth(i+1, w);
  });
}

// Menu: chạy format riêng (không cần cập nhật BQ) — sửa layout mà không reset data.
function dinhDangBangLuong(){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  var lk = LockService.getDocumentLock();
  if(!lk.tryLock(0)){ ss.toast('Đang có thao tác khác chạy, chờ chút.','Bảng lương',5); return; }
  try{
  const main = ss.getSheetByName(CFG.mainSheet);
  if(!main){ ss.toast('Chưa có tab "'+CFG.mainSheet+'".','Lỗi',5); return; }
  const numRows = Math.max(1, main.getLastRow()-1);
  formatSheet_(main, numRows);
  ss.toast('Đã định dạng lại Bảng lương (wrap, #,##0, độ rộng cột, màu).','✓',5);
  } finally { lk.releaseLock(); }
}

// ---- BigQuery ----
function queryBigQuery_(){
  var req = { query: BQ_SQL, useLegacySql: false };
  var job = BigQuery.Jobs.query(req, CFG.bqProject);
  var jobId = job.jobReference.jobId;
  while(!job.jobComplete){ Utilities.sleep(1000); job = BigQuery.Jobs.getQueryResults(CFG.bqProject, jobId); }
  var fields = job.schema.fields.map(function(f){ return f.name; });
  var numericKeys = ['luong_co_ban','cong','lcb_theo_ngay_cong','thuong_com','bao_hiem','gmv',
                     'an_trua','may_tinh','xe_pc','bu_tien','thue_tncn',
                     'gmv_ban_moi','gmv_gioi_thieu','gmv_tai_ky',
                     'so_npt','an_ca_van','dien_thoai_van'];
  var out = [];
  (job.rows||[]).forEach(function(row){
    var o = {};
    row.f.forEach(function(cell,i){ var v=cell.v; o[fields[i]] = v; });
    numericKeys.forEach(function(k){ if(o[k]!==null && o[k]!==undefined && o[k]!=='') o[k]=Number(o[k]); });
    out.push(o);
  });
  return out;
}

// ---- tiện ích sheet ----
function ensureSheet_(ss, name, hide){
  var sh = ss.getSheetByName(name);
  if(!sh){ sh = ss.insertSheet(name); if(hide) sh.hideSheet(); }
  if(name!==CFG.mainSheet) sh.clearContents();
  return sh;
}

function writeRaw_(sh, rows){
  if(!rows.length) return;
  var keys = Object.keys(rows[0]); ensureGridWidth_(sh, keys.length);
  var vals = [keys].concat(rows.map(function(r){ return keys.map(function(k){ return r[k]; }); }));
  sh.getRange(1,1,vals.length,keys.length).setValues(vals);
}

function readSnap_(sh){
  var rng = sh.getDataRange().getValues(); if(rng.length<2) return {};
  var hdr = rng[0], map = {};
  for(var i=1;i<rng.length;i++){ var code=rng[i][0]; map[code]={}; for(var j=1;j<hdr.length;j++) map[code][hdr[j]]=rng[i][j]; }
  return map;
}

function writeSnap_(sh, snap){
  sh.clearContents();
  var inputKeys = COLS.filter(function(c){ return c.role==='input'; }).map(function(c){ return c.key; });
  var codes = Object.keys(snap);
  var vals = [['code'].concat(inputKeys)];
  codes.forEach(function(code){ vals.push([code].concat(inputKeys.map(function(k){ return snap[code][k]; }))); });
  sh.getRange(1,1,vals.length,vals[0].length).setValues(vals);
}

function ensureGridWidth_(sh, n){ var m = sh.getMaxColumns(); if(m < n) sh.insertColumnsAfter(m, n - m); }

function plAssertHeadersUnique_(headers){
  var seen = {}, dupes = [];
  for (var i = 0; i < headers.length; i++){
    var h = String(headers[i]||'').trim();
    if (!h) throw 'Nhãn cột ở vị trí ' + (i+1) + ' bị rỗng';
    if (seen[h]) dupes.push(h);
    seen[h] = true;
  }
  if (dupes.length) throw 'Nhãn cột trùng: ' + dupes.join(', ');
}

function plAssertCodesUnique_(rows){
  var seen = {}, dupes = [];
  for (var i = 0; i < rows.length; i++){
    var c = String(rows[i].code||'').trim();
    if (c && seen[c]) dupes.push(c);
    if (c) seen[c] = true;
  }
  if (dupes.length) throw 'Mã NV trùng: ' + dupes.join(', ');
}

// Helper: chạy BQ query job, trả về rows (array). Tự lấy location từ response.
function bqRunJob_(config) {
  var insertResp = BigQuery.Jobs.insert({ configuration: config }, CFG.bqProject);
  var jobId = insertResp.jobReference.jobId;
  var loc = (insertResp.jobReference && insertResp.jobReference.location) || undefined;
  var opts = loc ? { location: loc } : {};
  var status = BigQuery.Jobs.get(CFG.bqProject, jobId, opts);
  while (status.status.state !== 'DONE') {
    Utilities.sleep(1000);
    status = BigQuery.Jobs.get(CFG.bqProject, jobId, opts);
  }
  if (status.status.errorResult) throw new Error(status.status.errorResult.message);
  var res = BigQuery.Jobs.getQueryResults(CFG.bqProject, jobId, opts);
  return res.rows || [];
}

function bqQueryCount_(sql) {
  var rows = bqRunJob_({ query: { query: sql, useLegacySql: false } });
  return parseInt((rows[0] && rows[0].f[0].v) || '0', 10);
}

function bqRunDml_(sql) {
  bqRunJob_({ query: { query: sql, useLegacySql: false } });
}

function luuArchiveBangLuong() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();
  var lk = LockService.getDocumentLock();
  if (!lk.tryLock(0)) { ss.toast('Đang có thao tác khác chạy, chờ chút.', 'Bảng lương', 5); return; }
  try {
    var main = ss.getSheetByName(CFG.mainSheet);
    if (!main) { ss.toast('Chưa có tab "' + CFG.mainSheet + '".', 'Lỗi', 5); return; }

    var allVals = main.getDataRange().getValues();
    if (allVals.length < 2) { ss.toast('Bảng lương chưa có dữ liệu.', 'Lỗi', 5); return; }

    var hdr = allVals[0].map(function(h) { return String(h).trim(); });
    var ky = kyLuongHienTai_();

    // Check duplicate — table chưa tồn tại lần đầu → bỏ qua, ghi thẳng
    // Dùng Jobs.insert (thay Jobs.query) để lấy location từ response → poll đúng region
    var cnt = 0;
    try {
      cnt = bqQueryCount_('SELECT COUNT(*) AS cnt FROM `pf-salary.payroll.M_bang_luong_archive` WHERE ky_luong = "' + ky + '"');
    } catch (e) {
      if (String(e).indexOf('Not found') < 0) throw e;
    }
    if (cnt > 0) {
      var resp = ui.alert('Kỳ lương ' + ky + ' đã có ' + cnt + ' dòng trong BigQuery.\nGhi đè?', ui.ButtonSet.YES_NO);
      if (resp !== ui.Button.YES) return;
      bqRunDml_('DELETE FROM `pf-salary.payroll.M_bang_luong_archive` WHERE ky_luong = "' + ky + '"');
    }

    // Map header thực của sheet → BQ field (xác định từ debugArchiveHeaders 2026-08-24)
    // COLS đã thay đổi (35 entries) trong khi sheet vẫn dùng layout 30 cột cũ
    // → không dùng positional COLS, match bằng header string thực tế
    var ARCHIVE_FIELD_MAP = [
      { h: 'STT',                              key: 'stt',            type: 'INTEGER' },
      { h: 'Mã NV',                            key: 'code',           type: 'STRING'  },
      { h: 'Khối',                             key: 'team',           type: 'STRING'  },
      { h: 'Name',                             key: 'name',           type: 'STRING'  },
      { h: 'Chức danh',                        key: 'chuc_danh',      type: 'STRING'  },
      { h: 'Loại NV',                          key: 'employee_type',  type: 'STRING'  },
      { h: 'Phòng ban (HRIS)',                 key: 'phong_ban',      type: 'STRING'  },
      { h: 'Tổng lương + thưởng (Net)',        key: 'tong_lt',        type: 'INTEGER' },
      { h: 'Tổng lương',                       key: 'tong_luong',     type: 'INTEGER' },
      { h: 'Lương cơ bản',                     key: 'luong_cb',       type: 'INTEGER' },
      { h: 'Công',                             key: 'cong',           type: 'FLOAT'   },
      { h: 'LCB theo ngày công',               key: 'lcb_ngay_cong',  type: 'INTEGER' },
      { h: 'Thưởng COM',                       key: 'thuong_com',     type: 'INTEGER' },
      { h: 'Bảo hiểm',                         key: 'bao_hiem',       type: 'INTEGER' },
      { h: 'GMV',                              key: 'gmv',            type: 'INTEGER' },
      { h: 'GMV bán mới',                      key: 'gmv_ban_moi',    type: 'INTEGER' },
      { h: 'GMV giới thiệu',                   key: 'gmv_gioi_thieu', type: 'INTEGER' },
      { h: 'GMV tái ký',                       key: 'gmv_tai_ky',     type: 'INTEGER' },
      { h: 'Hỗ trợ ăn trưa',                  key: 'an_trua',        type: 'INTEGER' },
      { h: 'Tiền hỗ trợ máy tính',            key: 'may_tinh',       type: 'INTEGER' },
      { h: 'Hỗ trợ tiền xe + PC trách nhiệm', key: 'xe_pc',          type: 'INTEGER' },
      { h: 'Khấu trừ thuế',                    key: 'khau_tru_thue',  type: 'INTEGER' },
      { h: 'Bù tiền',                          key: 'bu_tien',        type: 'INTEGER' },
      { h: 'Note',                             key: 'note',           type: 'STRING'  },
      { h: 'Ghi chú thưởng nóng',             key: 'gc_thuong_nong', type: 'STRING'  },
      { h: 'Xác nhận thông tin',               key: 'xn_tt',          type: 'BOOLEAN' },
      { h: 'Gửi BL trước thuế',               key: 'gui_truoc',      type: 'BOOLEAN' },
      { h: 'NV xác nhận trước thuế',          key: 'nv_xn_truoc',    type: 'BOOLEAN' },
      { h: 'Gửi BL sau thuế',                 key: 'gui_sau',        type: 'BOOLEAN' },
      { h: 'NV xác nhận sau thuế',            key: 'nv_xn_sau',      type: 'BOOLEAN' },
    ];

    var colIdx = {};
    for (var f = 0; f < ARCHIVE_FIELD_MAP.length; f++) {
      var fi = ARCHIVE_FIELD_MAP[f];
      var pos = -1;
      for (var hi = 0; hi < hdr.length; hi++) {
        if (hdr[hi] === fi.h) { pos = hi; break; }
      }
      colIdx[fi.key] = pos;
    }

    var rows = [];
    for (var i = 1; i < allVals.length; i++) {
      var row = allVals[i];
      var code = String(row[colIdx['code']] || '').trim();
      if (!code) continue;

      var obj = { ky_luong: ky };
      for (var f = 0; f < ARCHIVE_FIELD_MAP.length; f++) {
        var fi = ARCHIVE_FIELD_MAP[f];
        var pos = colIdx[fi.key];
        var val = (pos >= 0 && pos < row.length) ? row[pos] : '';
        if (fi.type === 'INTEGER') {
          obj[fi.key] = (val === '' || val === null || val === undefined) ? null : parseInt(String(val).replace(/[^0-9\-]/g, ''), 10) || 0;
        } else if (fi.type === 'FLOAT') {
          obj[fi.key] = (val === '' || val === null || val === undefined) ? null : parseFloat(String(val)) || 0;
        } else if (fi.type === 'BOOLEAN') {
          obj[fi.key] = val === true || val === 'TRUE' || val === 'true';
        } else {
          obj[fi.key] = val === null || val === undefined ? '' : String(val);
        }
      }
      rows.push(obj);
    }

    if (!rows.length) { ss.toast('Không có dòng hợp lệ để lưu.', 'Lỗi', 5); return; }

    // Build schema from ARCHIVE_FIELD_MAP
    var schemaFields = [{ name: 'ky_luong', type: 'STRING', mode: 'NULLABLE' }];
    ARCHIVE_FIELD_MAP.forEach(function(fi) {
      schemaFields.push({ name: fi.key, type: fi.type, mode: 'NULLABLE' });
    });

    // JSON Lines blob
    var jsonLines = rows.map(function(r) { return JSON.stringify(r); }).join('\n');
    var blob = Utilities.newBlob(jsonLines, 'application/octet-stream');

    var job = {
      configuration: {
        load: {
          destinationTable: { projectId: CFG.bqProject, datasetId: 'payroll', tableId: 'M_bang_luong_archive' },
          sourceFormat: 'NEWLINE_DELIMITED_JSON',
          writeDisposition: 'WRITE_APPEND',
          createDisposition: 'CREATE_IF_NEEDED',
          schema: { fields: schemaFields }
        }
      }
    };

    var loadJob = BigQuery.Jobs.insert(job, CFG.bqProject, blob);
    var jobId = loadJob.jobReference.jobId;
    var jobLocation = (loadJob.jobReference && loadJob.jobReference.location) || undefined;
    var getOpts = jobLocation ? { location: jobLocation } : {};
    var status = BigQuery.Jobs.get(CFG.bqProject, jobId, getOpts);
    while (status.status.state !== 'DONE') {
      Utilities.sleep(1500);
      status = BigQuery.Jobs.get(CFG.bqProject, jobId, getOpts);
    }
    if (status.status.errorResult) {
      ui.alert('Lỗi BigQuery: ' + status.status.errorResult.message);
      return;
    }

    ss.toast('Đã lưu ' + rows.length + ' dòng kỳ ' + ky + ' vào BigQuery.', '✓', 6);
  } finally {
    lk.releaseLock();
  }
}

function xuatExcelTheoTeam(){
  var html = HtmlService.createHtmlOutputFromFile('Xuất file phòng ban')
    .setWidth(620).setHeight(720).setTitle('Xuất Excel theo Phòng ban');
  SpreadsheetApp.getActiveSpreadsheet().show(html);
}
