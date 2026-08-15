/**
 * PalFish — BẢNG LƯƠNG TỰ ĐỘNG (M3 v3)
 * Sheet locale: Vietnamese → formulas dùng ; (không phải ,).
 * ⚠ Formulas thuế/Net TẠM trong Sheet — chờ Chung chuyển compute sang BQ.
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
  "    WHEN (t.title_job LIKE '%kinh doanh%' OR t.title_job LIKE '%Sale Team%'",
  "         OR t.title_job LIKE '%tư vấn tuyển sinh%' OR t.title_job LIKE '%Sales part%')",
  "      AND UPPER(t.workplace) LIKE 'INHOUSE 1%' THEN 'Inhouse 1'",
  "    WHEN t.title_job LIKE '%CS%' OR t.title_job LIKE '%Chăm sóc%'",
  "      OR t.title_job LIKE '%Cộng tác viên%' OR t.title_job LIKE '%Vệ sinh%'",
  "      THEN 'CSKH'",
  "    WHEN (t.title_job LIKE '%kinh doanh%' OR t.title_job LIKE '%Sale Team%'",
  "         OR t.title_job LIKE '%tư vấn tuyển sinh%')",
  "      AND (UPPER(t.workplace) LIKE 'INHOUSE 2%' OR t.workplace LIKE '47 Nguy%')",
  "      THEN 'Inhouse 2'",
  "    WHEN t.workplace LIKE 'Store%' OR t.title_job LIKE '%Offline%'",
  "      OR t.title_job LIKE '%Off sale%' THEN 'Offline'",
  "    WHEN t.title_job LIKE '%hành chính%' OR t.title_job LIKE '%tuyển dụng%'",
  "      OR t.title_job LIKE '%kế toán%' OR t.title_job LIKE '%Sales Admin%'",
  "      OR t.title_job LIKE '%Sales Operation%' OR t.title_job LIKE '%Phiên dịch%'",
  "      THEN 'Back office'",
  "    WHEN t.title_job LIKE '%Marketing%' OR t.title_job LIKE '%Design%'",
  "      OR t.title_job LIKE '%Dev%' OR t.title_job LIKE '%Data%'",
  "      OR t.title_job LIKE '%developer%' OR t.title_job LIKE '%full stack%'",
  "      OR t.title_job LIKE '%Page admin%'",
  "      THEN 'MKT'",
  "    WHEN t.title_job LIKE '%Giáo viên%' OR t.title_job LIKE '%Teacher%'",
  "      THEN 'Giáo viên'",
  "    ELSE 'Khác'",
  "  END AS team,",
  "  CASE",
  "    WHEN t.title_job LIKE '%Giám đốc%' THEN 1",
  "    WHEN UPPER(t.workplace) LIKE 'INHOUSE 1%'",
  "      AND (t.title_job LIKE '%kinh doanh%' OR t.title_job LIKE '%Sale Team%'",
  "           OR t.title_job LIKE '%tư vấn tuyển sinh%' OR t.title_job LIKE '%Sales part%') THEN 2",
  "    WHEN t.title_job LIKE '%CS%' OR t.title_job LIKE '%Chăm sóc%'",
  "      OR t.title_job LIKE '%Cộng tác viên%' OR t.title_job LIKE '%Vệ sinh%' THEN 3",
  "    WHEN (UPPER(t.workplace) LIKE 'INHOUSE 2%' OR t.workplace LIKE '47 Nguy%')",
  "      AND (t.title_job LIKE '%kinh doanh%' OR t.title_job LIKE '%Sale Team%'",
  "           OR t.title_job LIKE '%tư vấn tuyển sinh%') THEN 4",
  "    WHEN t.workplace LIKE 'Store%' OR t.title_job LIKE '%Offline%'",
  "      OR t.title_job LIKE '%Off sale%' THEN 5",
  "    WHEN t.title_job LIKE '%hành chính%' OR t.title_job LIKE '%tuyển dụng%'",
  "      OR t.title_job LIKE '%kế toán%' OR t.title_job LIKE '%Sales Admin%'",
  "      OR t.title_job LIKE '%Sales Operation%' OR t.title_job LIKE '%Phiên dịch%' THEN 6",
  "    WHEN t.title_job LIKE '%Marketing%' OR t.title_job LIKE '%Design%'",
  "      OR t.title_job LIKE '%Dev%' OR t.title_job LIKE '%Data%'",
  "      OR t.title_job LIKE '%developer%' OR t.title_job LIKE '%full stack%'",
  "      OR t.title_job LIKE '%Page admin%' THEN 7",
  "    WHEN t.title_job LIKE '%Giáo viên%' OR t.title_job LIKE '%Teacher%' THEN 8",
  "    ELSE 9",
  "  END AS sort_group,",
  "  CASE",
  "    WHEN t.title_job LIKE '%Giám đốc%' OR t.title_job LIKE '%Manager%' THEN 1",
  "    WHEN t.title_job LIKE '%Leader%' OR t.title_job LIKE '%leader%' THEN 2",
  "    ELSE 3",
  "  END AS sort_rank,",
  "  t.full_name,",
  "  CASE",
  "    WHEN LOWER(t.title_job) = 'cs inter' THEN 'CS Intern'",
  "    WHEN t.title_job LIKE '%@%' THEN 'Page admin'",
  "    ELSE t.title_job",
  "  END AS title_job,",
  "  t.don_vi_cong,",
  "  cb.employee_type,",
  "  COALESCE(",
  "    SAFE_CAST(t.basic_salary_updated AS INT64),",
  "    SAFE_CAST(REGEXP_REPLACE(t.basic_salary, r'[.,]','') AS INT64)",
  "  ) AS luong_co_ban,",
  "  cb.tong_cong AS cong,",
  "  t.luong_co_ban_theo_ngay_cong AS lcb_theo_ngay_cong,",
  "  t.bonus_com AS thuong_com,",
  "  t.bao_hiem_xa_hoi AS bao_hiem,",
  "  t.gmv_vnd AS gmv,",
  "  COALESCE(t.gmv_ban_moi,0) AS gmv_ban_moi,",
  "  COALESCE(t.gmv_gioi_thieu,0) AS gmv_gioi_thieu,",
  "  COALESCE(t.gmv_tai_ky,0) AS gmv_tai_ky,",
  "  t.tro_cap_an_trua AS an_trua,",
  "  t.tro_cap_may_tinh AS may_tinh,",
  "  COALESCE(t.tro_cap_xang_xe,0) + COALESCE(t.tro_cap_trach_nhiem,0) AS xe_pc,",
  "  ARRAY_LENGTH(REGEXP_EXTRACT_ALL(COALESCE(s.dependent_information,''), r'(?:19|20)[0-9]{2}')) AS so_npt",
  "FROM (SELECT * FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY code ORDER BY code) AS rn FROM `pf-salary.payroll.C_view_bang_luong_truoc_thue`) WHERE rn = 1) t",
  "LEFT JOIN (SELECT *, ROW_NUMBER() OVER (PARTITION BY code ORDER BY code) AS rn FROM `pf-salary.payroll.C_view_bang_luong_co_ban_theo_ngay_cong`) cb ON cb.code = t.code AND cb.rn = 1",
  "LEFT JOIN (SELECT *, ROW_NUMBER() OVER (PARTITION BY code ORDER BY code) AS rn FROM `pf-salary.payroll.C_raw_staff_info_merged`) s ON s.code = t.code AND s.rn = 1",
  "ORDER BY sort_group, sort_rank, t.full_name"
].join('\n');

function colIndex(key){ for(let i=0;i<COLS.length;i++) if(COLS[i].key===key) return i+1; throw 'no col '+key; }
function C(key){ return columnToLetter(colIndex(key)); }
function columnToLetter(n){ let s=''; while(n>0){ const m=(n-1)%26; s=String.fromCharCode(65+m)+s; n=(n-m-1)/26; } return s; }

// Thuế TNCN lũy tiến 5 bậc 2026 — y hệt chị Vân. Separator ; cho Vietnamese locale.
function thueTNCN(x){
  return '=IF('+x+'<=10000000;'+x+'*5%;'
       + 'IF('+x+'<=30000000;10000000*5%+('+x+'-10000000)*10%;'
       + 'IF('+x+'<=60000000;10000000*5%+20000000*10%+('+x+'-30000000)*20%;'
       + 'IF('+x+'<=100000000;10000000*5%+20000000*10%+30000000*20%+('+x+'-60000000)*30%;'
       + '10000000*5%+20000000*10%+30000000*20%+40000000*30%+('+x+'-100000000)*35%))))';
}

const COLS = [
  { key:'stt',           h:'STT',                              role:'auto'  },
  { key:'code',          h:'Mã NV',                            role:'auto',  src:'code' },
  { key:'team',          h:'Team',                             role:'auto',  src:'team' },
  { key:'name',          h:'Name',                             role:'auto',  src:'full_name' },
  { key:'chuc_danh',     h:'Chức danh',                        role:'auto',  src:'title_job' },
  { key:'employee_type', h:'Loại NV',                          role:'auto',  src:'employee_type' },
  { key:'tong_lt',       h:'Tổng lương + thưởng',              role:'calc',  f:r=>'='+C('tong_luong')+r+'+'+C('thuong_com')+r+'+'+C('thuong_bo_sung')+r+'-'+C('khau_tru_thue')+r },
  { key:'tong_luong',    h:'Tổng lương',                       role:'calc',  f:r=>'='+C('lcb_ngay_cong')+r+'+'+C('an_trua')+r+'+'+C('may_tinh')+r+'+'+C('xe_pc')+r+'-'+C('bao_hiem')+r+'+'+C('bu_tien')+r },
  { key:'luong_cb',      h:'Lương cơ bản',                     role:'auto',  src:'luong_co_ban' },
  { key:'cong',          h:'Công',                             role:'input', src:'cong' },
  { key:'lcb_ngay_cong', h:'LCB theo ngày công',               role:'auto',  src:'lcb_theo_ngay_cong' },
  { key:'thuong_com',    h:'Thưởng COM',                       role:'input', src:'thuong_com' },
  { key:'thuong_bo_sung',h:'Thưởng bổ sung',                   role:'input', src:null },
  { key:'bao_hiem',      h:'Bảo hiểm',                         role:'input', src:'bao_hiem' },
  { key:'gmv',           h:'GMV',                              role:'auto',  src:'gmv' },
  { key:'gmv_ban_moi',   h:'GMV bán mới',                      role:'auto',  src:'gmv_ban_moi' },
  { key:'gmv_gioi_thieu',h:'GMV giới thiệu',                   role:'auto',  src:'gmv_gioi_thieu' },
  { key:'gmv_tai_ky',    h:'GMV tái ký',                        role:'auto',  src:'gmv_tai_ky' },
  { key:'an_trua',       h:'Hỗ trợ ăn trưa',                   role:'auto',  src:'an_trua' },
  { key:'may_tinh',      h:'Tiền hỗ trợ máy tính',             role:'auto',  src:'may_tinh' },
  { key:'xe_pc',         h:'Hỗ trợ tiền xe + PC trách nhiệm',  role:'input', src:'xe_pc' },
  { key:'khau_tru_thue', h:'Khấu trừ thuế',                    role:'calc',  f:r=>'='+C('thue_tncn')+r },
  { key:'bu_tien',       h:'Bù tiền',                          role:'input', src:null },
  { key:'note',          h:'Note',                             role:'input', src:null },
  { key:'npt',           h:'Số người phụ thuộc',               role:'input', src:'so_npt' },
  { key:'tong_tn',       h:'Tổng thu nhập',                    role:'calc',  f:r=>'='+C('lcb_ngay_cong')+r+'+'+C('thuong_com')+r+'+'+C('thuong_bo_sung')+r+'+'+C('an_trua')+r+'+'+C('may_tinh')+r+'+'+C('xe_pc')+r },
  { key:'gt_ban_than',   h:'Giảm trừ bản thân',                role:'calc',  f:r=>'='+CFG.giamTruBanThan },
  { key:'gt_npt',        h:'Giảm trừ NPT',                     role:'calc',  f:r=>'='+C('npt')+r+'*'+CFG.giamTruMoiNPT },
  { key:'tntt',          h:'Thu nhập tính thuế',               role:'calc',  f:r=>'=MAX(0;'+C('tong_tn')+r+'-'+C('bao_hiem')+r+'-'+C('gt_ban_than')+r+'-'+C('gt_npt')+r+')' },
  { key:'thue_tncn',     h:'Thuế TNCN',                        role:'calc',  f:r=>thueTNCN(C('tntt')+r) },
  { key:'net',           h:'Lương thực lãnh (Net)',            role:'calc',  f:r=>'='+C('tong_lt')+r },
  { key:'xn_tt',         h:'Xác nhận thông tin',               role:'status', kind:'check' },
  { key:'gui_phieu',     h:'Gửi phiếu',                        role:'status', kind:'check' },
  { key:'nv_xem',        h:'NV đã xem',                        role:'status', kind:'app' },
  { key:'nv_phan_hoi',   h:'NV phản hồi',                      role:'status', kind:'app' },
];

function onOpen(){
  SpreadsheetApp.getUi().createMenu('⚙ Bảng lương')
    .addItem('🔄 Cập nhật từ BigQuery', 'capNhatTuBigQuery')
    .addItem('📊 Đối soát với bảng Trang', 'doiSoatLuong')
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

  // Xóa sạch main sheet trước khi ghi (tránh formula cũ tạo vòng lặp)
  // Input values đã lưu trong _snapshot, sẽ khôi phục qua smart-merge
  main.getRange(1, 1, main.getMaxRows(), main.getMaxColumns()).clearContent();

  // Header
  const headers = COLS.map(c=>c.h);
  main.getRange(1,1,1,headers.length).setValues([headers])
      .setFontWeight('bold').setBackground('#0b5394').setFontColor('white')
      .setWrap(true).setHorizontalAlignment('center');
  main.setFrozenRows(1);
  main.setFrozenColumns(5);

  // Smart-merge: đọc snapshot cũ
  const snapMap = readSnap_(snap);
  const newSnap = {};

  for(let i=0; i<rows.length; i++){
    const r = i+2, d = rows[i], code = d.code;
    newSnap[code] = {};
    for(let c=0; c<COLS.length; c++){
      const col = COLS[c], cell = main.getRange(r, c+1);
      if(col.role==='auto'){
        cell.setValue(col.key==='stt' ? i+1 : d[col.src]);
      } else if(col.role==='input'){
        const autoVal = col.src ? (d[col.src]===null || d[col.src]===undefined ? '' : d[col.src]) : '';
        const cur = cell.getValue();
        const prevAuto = (snapMap[code]||{})[col.key];
        if(cur==='' || cur===null || cur===prevAuto) cell.setValue(autoVal);
        newSnap[code][col.key] = autoVal;
      } else if(col.role==='calc'){
        cell.setFormula(col.f(r));
      } else if(col.role==='status' && col.kind==='check'){
        cell.insertCheckboxes();
      }
    }
  }

  // Xoá dòng/cột thừa từ lần chạy trước
  const lastRow = main.getLastRow();
  if(lastRow > rows.length+1){
    main.getRange(rows.length+2, 1, lastRow-rows.length-1, main.getMaxColumns()).clear();
  }
  const lastCol = main.getLastColumn();
  if(lastCol > COLS.length){
    main.getRange(1, COLS.length+1, main.getMaxRows(), lastCol-COLS.length).clear();
  }

  writeSnap_(snap, newSnap);
  formatSheet_(main, rows.length);
  ss.toast('Đã cập nhật '+rows.length+' NV từ BigQuery.', 'Bảng lương', 5);
}

function formatSheet_(main, numRows){
  const numCols = COLS.length;

  // Số tiền: #,##0
  var moneyKeys = ['tong_lt','tong_luong','luong_cb','lcb_ngay_cong','thuong_com','thuong_bo_sung',
                   'bao_hiem','gmv','gmv_ban_moi','gmv_gioi_thieu','gmv_tai_ky',
                   'an_trua','may_tinh','xe_pc','khau_tru_thue','bu_tien','tong_tn','gt_ban_than',
                   'gt_npt','tntt','thue_tncn','net'];
  moneyKeys.forEach(function(k){ main.getRange(2, colIndex(k), numRows, 1).setNumberFormat('#,##0'); });

  // Màu nền theo role (match format IH1 chị Trang)
  COLS.forEach(function(col, i){
    var bg = null;
    if(col.role==='input')  bg = '#FFF3E0';  // cam nhạt = ô sửa được
    if(col.role==='calc')   bg = '#EEF2FF';  // xanh nhạt = công thức
    if(col.role==='status') bg = '#F3F4F6';  // xám nhạt  = trạng thái
    if(bg) main.getRange(2, i+1, numRows, 1).setBackground(bg);
  });

  // Headline "Tổng lương + thưởng": gold header + bold data
  var tltCol = colIndex('tong_lt');
  main.getRange(1, tltCol).setBackground('#F59E0B');
  main.getRange(2, tltCol, numRows, 1).setFontWeight('bold').setBackground('#FEF3C7');

  // "Tổng lương": green header + tint
  var tlCol = colIndex('tong_luong');
  main.getRange(1, tlCol).setBackground('#16A34A');
  main.getRange(2, tlCol, numRows, 1).setBackground('#F0FDF4');

  // Net in đậm
  main.getRange(2, colIndex('net'), numRows, 1).setFontWeight('bold');

  // Viền
  main.getRange(1, 1, numRows+1, numCols)
    .setBorder(true, true, true, true, true, true, '#D1D5DB', SpreadsheetApp.BorderStyle.SOLID);

  // Tự chỉnh độ rộng cột
  for(var i=1; i<=numCols; i++) main.autoResizeColumn(i);
}

// ---- BigQuery ----
function queryBigQuery_(){
  var req = { query: BQ_SQL, useLegacySql: false };
  var job = BigQuery.Jobs.query(req, CFG.bqProject);
  var jobId = job.jobReference.jobId;
  while(!job.jobComplete){ Utilities.sleep(1000); job = BigQuery.Jobs.getQueryResults(CFG.bqProject, jobId); }
  var fields = job.schema.fields.map(function(f){ return f.name; });
  var numericKeys = ['luong_co_ban','cong','lcb_theo_ngay_cong','thuong_com','bao_hiem','gmv','gmv_ban_moi','gmv_gioi_thieu','gmv_tai_ky','an_trua','may_tinh','xe_pc','so_npt'];
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
