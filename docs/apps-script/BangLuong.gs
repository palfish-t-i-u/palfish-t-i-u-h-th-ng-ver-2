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
  "  cb.employee_type,",
  "  COALESCE(SAFE_CAST(t.basic_salary_updated AS INT64), SAFE_CAST(t.basic_salary AS INT64)) AS luong_co_ban,",
  "  cb.tong_cong AS cong,",
  "  t.luong_co_ban_theo_ngay_cong AS lcb_theo_ngay_cong,",
  "  t.bonus_com AS thuong_com,",
  "  t.bao_hiem_xa_hoi AS bao_hiem,",
  "  t.gmv_vnd AS gmv,",
  "  t.tro_cap_an_trua AS an_trua,",
  "  t.tro_cap_may_tinh AS may_tinh,",
  "  COALESCE(t.tro_cap_xe_trach_nhiem,0) AS xe_pc,",
  "  t.an_ca_van,",
  "  t.dien_thoai_van,",
  "  t.ghi_chu_thuong_nong,",
  "  ARRAY_LENGTH(REGEXP_EXTRACT_ALL(COALESCE(s.dependent_information,''), r'(?:19|20)[0-9]{2}')) AS so_npt",
  "FROM `pf-salary.payroll.C_view_bang_luong_truoc_thue` t",
  "LEFT JOIN `pf-salary.payroll.C_view_bang_luong_co_ban_theo_ngay_cong` cb ON cb.code = t.code",
  "LEFT JOIN `pf-salary.payroll.C_raw_staff_info_merged` s ON s.code = t.code",
  "ORDER BY",
  "  CASE team WHEN 'BOD' THEN 1 WHEN 'Inhouse 1' THEN 2 WHEN 'CSKH' THEN 3 WHEN 'Inhouse 2' THEN 4 WHEN 'Offline' THEN 5 WHEN 'Back office' THEN 6 WHEN 'MKT' THEN 7 WHEN 'Head quarter' THEN 8 ELSE 9 END,",
  "  CASE WHEN t.title_job LIKE '%Giám đốc%' THEN 1 WHEN t.title_job LIKE '%Leader%' OR t.title_job LIKE '%leader%' THEN 2 WHEN COALESCE(cb.employee_type,'') IN ('CTV','TTS') THEN 4 ELSE 3 END,",
  "  t.full_name"
].join('\n');

function colIndex(key){ for(let i=0;i<COLS.length;i++) if(COLS[i].key===key) return i+1; throw 'no col '+key; }
function C(key){ return columnToLetter(colIndex(key)); }
function columnToLetter(n){ let s=''; while(n>0){ const m=(n-1)%26; s=String.fromCharCode(65+m)+s; n=(n-m-1)/26; } return s; }

// Thuế TNCN lũy tiến 5 bậc — returns formula body (no leading =).
function thueTNCN(x){
  return 'IF('+x+'<=10000000;'+x+'*5%;'
       + 'IF('+x+'<=30000000;10000000*5%+('+x+'-10000000)*10%;'
       + 'IF('+x+'<=60000000;10000000*5%+20000000*10%+('+x+'-30000000)*20%;'
       + 'IF('+x+'<=100000000;10000000*5%+20000000*10%+30000000*20%+('+x+'-60000000)*30%;'
       + '10000000*5%+20000000*10%+30000000*20%+40000000*30%+('+x+'-100000000)*35%))))';
}

const COLS = [
  // --- Identity ---
  { key:'stt',           h:'STT',                              role:'auto'  },
  { key:'code',          h:'Mã NV',                            role:'auto',  src:'code' },
  { key:'team',          h:'Team',                             role:'auto',  src:'team' },
  { key:'name',          h:'Name',                             role:'auto',  src:'full_name' },
  { key:'chuc_danh',     h:'Chức danh',                        role:'auto',  src:'title_job' },
  { key:'employee_type', h:'Loại NV',                           role:'auto',  src:'employee_type' },
  // --- Summary ---
  { key:'tong_lt',       h:'Tổng lương + thưởng (Net)',        role:'calc',  f:r=>'='+C('gross')+r+'-'+C('khau_tru_thue')+r },
  { key:'gross',         h:'Tổng trước thuế',                   role:'calc',  f:r=>'='+C('tong_luong')+r+'+'+C('thuong_com')+r },
  { key:'tong_luong',    h:'Tổng lương',                       role:'calc',  f:r=>'='+C('lcb_ngay_cong')+r+'+'+C('an_trua')+r+'+'+C('may_tinh')+r+'+'+C('xe_pc')+r+'-'+C('bao_hiem')+r+'+'+C('bu_tien')+r },
  // --- Components ---
  { key:'luong_cb',      h:'Lương cơ bản',                     role:'auto',  src:'luong_co_ban' },
  { key:'cong',          h:'Công',                             role:'input', src:'cong' },
  { key:'lcb_ngay_cong', h:'LCB theo ngày công',               role:'auto',  src:'lcb_theo_ngay_cong' },
  { key:'thuong_com',    h:'Thưởng COM',                       role:'input', src:'thuong_com' },
  { key:'bao_hiem',      h:'Bảo hiểm',                         role:'auto',  src:'bao_hiem' },
  { key:'gmv',           h:'GMV',                              role:'auto',  src:'gmv' },
  { key:'an_trua',       h:'Hỗ trợ ăn trưa',                   role:'auto',  src:'an_trua' },
  { key:'may_tinh',      h:'Tiền hỗ trợ máy tính',             role:'auto',  src:'may_tinh' },
  { key:'xe_pc',         h:'Hỗ trợ tiền xe + PC trách nhiệm',  role:'input', src:'xe_pc' },
  { key:'dien_thoai',    h:'Phụ cấp điện thoại',                role:'auto',  src:'dien_thoai_van' },
  { key:'khau_tru_thue', h:'Khấu trừ thuế',                    role:'calc',  f:r=>'='+C('thue_tncn')+r },
  { key:'bu_tien',       h:'Bù tiền',                          role:'input', src:null },
  { key:'ghi_chu_thuong_nong', h:'Ghi chú thưởng nóng',         role:'auto',  src:'ghi_chu_thuong_nong' },
  { key:'note',          h:'Note',                             role:'input', src:null },
  // --- Tax computation ---
  { key:'npt',           h:'Số người phụ thuộc',               role:'input', src:'so_npt' },
  { key:'tong_tn',       h:'Tổng thu nhập',                    role:'calc',  f:r=>'='+C('lcb_ngay_cong')+r+'+'+C('thuong_com')+r+'+'+C('an_trua')+r+'+'+C('may_tinh')+r+'+'+C('xe_pc')+r+'+'+C('dien_thoai')+r },
  { key:'income_col_u',  h:'TN trước thuế',                     role:'calc',  f:r=>'='+C('lcb_ngay_cong')+r+'+'+C('an_trua')+r+'+'+C('may_tinh')+r+'+'+C('xe_pc')+r+'+'+C('bu_tien')+r },
  { key:'an_ca_van',     h:'Ăn ca (thuế)',                     role:'auto',  src:'an_ca_van' },
  { key:'tnct',          h:'Thu nhập chịu thuế',               role:'calc',
    f:r=>'=IF('+C('employee_type')+r+'="Chính thức";'+C('income_col_u')+r+'-'+C('an_ca_van')+r+'-'+C('dien_thoai')+r+';'+C('income_col_u')+r+')' },
  { key:'gt_ban_than',   h:'Giảm trừ bản thân',                role:'calc',  f:r=>'='+CFG.giamTruBanThan },
  { key:'gt_npt',        h:'Giảm trừ NPT',                     role:'calc',  f:r=>'='+C('npt')+r+'*'+CFG.giamTruMoiNPT },
  { key:'tntt',          h:'Thu nhập tính thuế',               role:'calc',
    f:r=>'=IF('+C('employee_type')+r+'="Chính thức";MAX(0;'+C('tnct')+r+'-'+C('bao_hiem')+r+'-'+C('gt_ban_than')+r+'-'+C('gt_npt')+r+');'+C('tnct')+r+')' },
  { key:'thue_tncn',     h:'Thuế TNCN',                        role:'calc',
    f:r=>'=IF(OR('+C('code')+r+'="HN0051";'+C('code')+r+'="HN0164");0;IF('+C('employee_type')+r+'="Chính thức";'+thueTNCN(C('tntt')+r)+';IF('+C('tntt')+r+'>=5000000;'+C('tntt')+r+'*10%;0)))' },
  { key:'net',           h:'Lương thực lãnh (Net)',            role:'calc',  f:r=>'='+C('tong_lt')+r },
  // --- Status (khớp GATE_COLS trong PhieuLuongGate.gs — 5 cột tuần tự) ---
  { key:'xn_tt',         h:'Xác nhận thông tin',               role:'status', kind:'check' },
  { key:'gui_truoc',     h:'Gửi BL trước thuế',                role:'status', kind:'check' },
  { key:'nv_xn_truoc',   h:'NV xác nhận trước thuế',           role:'status', kind:'check' },
  { key:'gui_sau',       h:'Gửi BL sau thuế',                  role:'status', kind:'check' },
  { key:'nv_xn_sau',     h:'NV xác nhận sau thuế',             role:'status', kind:'check' },
];

function onOpen(){
  SpreadsheetApp.getUi().createMenu('⚙ Bảng lương')
    .addItem('🔄 Cập nhật từ BigQuery', 'capNhatTuBigQuery')
    .addItem('📊 Cập nhật bảng tính thuế', 'capNhatBangThue')
    .addItem('📊 Đối soát với bảng Trang', 'doiSoatLuong')
    .addSeparator()
    .addItem('🔌 Cài đặt cổng gửi phiếu', 'installGateTriggers')
    .addItem('📤 Gửi phiếu đang chờ', 'flushOutbox')
    .addItem('📋 Mở hàng đợi', 'moHangDoi')
    .addToUi();
}

function capNhatTuBigQuery(){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const rows = queryBigQuery_();
  if(!rows.length){ ss.toast('Không có dữ liệu từ BigQuery.','Lỗi',5); return; }

  const data = ensureSheet_(ss, CFG.dataSheet, true);
  const snap = ensureSheet_(ss, CFG.snapSheet, true);
  const main = ensureSheet_(ss, CFG.mainSheet, false);

  writeRaw_(data, rows);

  const headers = COLS.map(c=>c.h);

  // Detect column layout change → clear stale data
  const existingHeaders = main.getLastColumn() > 0
    ? main.getRange(1, 1, 1, main.getLastColumn()).getValues()[0].map(String)
    : [];
  const layoutChanged = existingHeaders.length !== headers.length ||
    headers.some((h, i) => h !== (existingHeaders[i] || '').trim());
  if (layoutChanged && main.getLastRow() > 1) {
    main.getRange(2, 1, main.getLastRow() - 1, Math.max(existingHeaders.length, headers.length)).clear();
    snap.clearContents();
  }

  // Header
  main.getRange(1,1,1,headers.length).setValues([headers])
      .setFontWeight('bold').setBackground('#0b5394').setFontColor('white')
      .setWrap(true).setHorizontalAlignment('center');
  main.setFrozenRows(1);
  main.setFrozenColumns(colIndex('employee_type'));

  // Batch read existing data + snapshot for smart-merge
  const snapMap = readSnap_(snap);
  const existingData = (!layoutChanged && main.getLastRow() > 1)
    ? main.getRange(2, 1, Math.min(main.getLastRow()-1, rows.length), COLS.length).getValues()
    : [];
  const newSnap = {};

  // Build all values + collect formula/checkbox columns
  const allVals = [];
  const formulaCols = {};
  const checkboxCols = [];

  for(let i=0; i<rows.length; i++){
    const r = i+2, d = rows[i], code = d.code;
    newSnap[code] = {};
    const rowVals = [];

    for(let c=0; c<COLS.length; c++){
      const col = COLS[c];
      if(col.role==='auto'){
        rowVals.push(col.key==='stt' ? i+1 : (d[col.src]===null||d[col.src]===undefined ? '' : d[col.src]));
      } else if(col.role==='input'){
        const autoVal = col.src ? (d[col.src]===null||d[col.src]===undefined ? '' : d[col.src]) : '';
        const cur = existingData[i] ? existingData[i][c] : '';
        const prevAuto = (snapMap[code]||{})[col.key];
        rowVals.push((cur===''||cur===null||cur===prevAuto||prevAuto===undefined) ? autoVal : cur);
        newSnap[code][col.key] = autoVal;
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

  // Checkboxes per column (~5 RPCs instead of ~500)
  checkboxCols.forEach(c => main.getRange(2, c+1, rows.length, 1).insertCheckboxes());

  // Clear excess rows
  const lastRow = main.getLastRow();
  if(lastRow > rows.length+1){
    main.getRange(rows.length+2, 1, lastRow-rows.length-1, COLS.length).clear();
  }

  writeSnap_(snap, newSnap);
  formatSheet_(main, rows.length);
  ss.toast('Đã cập nhật '+rows.length+' NV từ BigQuery.', 'Bảng lương', 5);
}

function formatSheet_(main, numRows){
  const numCols = COLS.length;

  var moneyKeys = ['tong_lt','gross','tong_luong','luong_cb','lcb_ngay_cong','thuong_com','bao_hiem','gmv',
                   'an_trua','may_tinh','xe_pc','dien_thoai','khau_tru_thue','bu_tien','tong_tn',
                   'income_col_u','an_ca_van','tnct','gt_ban_than','gt_npt','tntt','thue_tncn','net'];
  moneyKeys.forEach(function(k){ main.getRange(2, colIndex(k), numRows, 1).setNumberFormat('#,##0'); });

  COLS.forEach(function(col, i){
    var bg = null;
    if(col.role==='input')  bg = '#FFF8E1';
    if(col.role==='calc')   bg = '#EEF2FF';
    if(col.role==='status') bg = '#F3F4F6';
    if(bg) main.getRange(2, i+1, numRows, 1).setBackground(bg);
  });

  ['tong_lt','gross','net'].forEach(function(k){
    main.getRange(2, colIndex(k), numRows, 1).setFontWeight('bold');
  });

  main.getRange(1, 1, numRows+1, numCols)
    .setBorder(true, true, true, true, true, true, '#D1D5DB', SpreadsheetApp.BorderStyle.SOLID);

  for(var i=1; i<=numCols; i++) main.autoResizeColumn(i);
}

// ---- BigQuery ----
function queryBigQuery_(){
  var req = { query: BQ_SQL, useLegacySql: false };
  var job = BigQuery.Jobs.query(req, CFG.bqProject);
  var jobId = job.jobReference.jobId;
  while(!job.jobComplete){ Utilities.sleep(1000); job = BigQuery.Jobs.getQueryResults(CFG.bqProject, jobId); }
  var fields = job.schema.fields.map(function(f){ return f.name; });
  var numericKeys = ['luong_co_ban','cong','lcb_theo_ngay_cong','thuong_com','bao_hiem','gmv',
                     'an_trua','may_tinh','xe_pc','so_npt','an_ca_van','dien_thoai_van'];
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
  var keys = Object.keys(rows[0]);
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
  var inputKeys = COLS.filter(function(c){ return c.role==='input'; }).map(function(c){ return c.key; });
  var codes = Object.keys(snap);
  var vals = [['code'].concat(inputKeys)];
  codes.forEach(function(code){ vals.push([code].concat(inputKeys.map(function(k){ return snap[code][k]; }))); });
  sh.getRange(1,1,vals.length,vals[0].length).setValues(vals);
}
