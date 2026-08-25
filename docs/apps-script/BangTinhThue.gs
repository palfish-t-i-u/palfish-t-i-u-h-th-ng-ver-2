/**
 * PalFish — BẢNG TÍNH THUẾ + BẢO HIỂM (Tab chị Vân)
 *
 * Mirror layout "Lương test.xlsx" của chị Vân.
 * Companion file cho BangLuong.gs (tab chị Trang).
 *
 * CÁCH DÙNG:
 * 1. Paste file này vào Apps Script project đã có BangLuong.gs
 * 2. Trong BangLuong.gs, sửa onOpen() thêm dòng:
 *      .addItem('📊 Cập nhật bảng tính thuế', 'capNhatBangThue')
 * 3. Chạy capNhatBangThue() từ menu hoặc Run
 *
 * Sheet locale: Vietnamese → formulas dùng ; (không phải ,)
 *
 * Thuế TNCN 2026 — 5 bậc lũy tiến (Luật TNCN 2025, hiệu lực 01/01/2026):
 *   ≤10tr=5% | 10-30tr=10% | 30-60tr=20% | 60-100tr=30% | >100tr=35%
 * KHÔNG phải Chính thức (Thử việc / TTS / CTV): 10% flat nếu ≥5tr, 0 nếu <5tr.
 *
 * Ngoại lệ: HN0051 Nguyễn Thị Sương Mai, HN0163 Nguyễn Thị Thắm, HN0164 Nguyễn Thị Oanh → thuế = 0.
 *
 * ⚠ FIX so với BangLuong.gs: nhánh >100tr bỏ cụm 30tr×20% thừa (dư 6tr thuế).
 */

/* ======== CONFIG ======== */

var THUE_CFG = {
  bqProject: 'pf-salary',
  sheetName: 'Bảng tính thuế',
  dataSheet: '_data_thue',
};

/* ======== SQL ======== */

var SQL_THUE = [
  "SELECT",
  "  t.code,",
  "  t.full_name,",
  "  CASE",
  "    WHEN t.title_job = 'CS Inter' THEN 'CS Intern'",
  "    WHEN t.title_job LIKE '%@%' THEN 'Page admin'",
  "    ELSE t.title_job",
  "  END AS title_job,",
  "  COALESCE(TRIM(t.type_self), 'N/A') AS employee_type,",
  "  COALESCE(t.luong_dong_bao_hiem, 0) AS luong_co_dinh,",
  "  cb.tong_cong AS ngay_cong,",
  "  COALESCE(t.income_col_u, 0) AS income_col_u_val,",
  "  COALESCE(t.an_ca_van, 0) AS an_ca,",
  "  COALESCE(t.xang_xe_van, 0) AS xang_xe,",
  "  COALESCE(t.dien_thoai_van, 0) AS dien_thoai,",
  "  COALESCE(t.tro_cap_may_tinh, 0) AS may_tinh_val,",
  "  t.luong_dong_bao_hiem AS luong_dong_bh,",
  "  COALESCE(t.so_nguoi_phu_thuoc, 0) AS so_npt",
  "FROM `pf-salary.payroll.C_view_bang_luong_truoc_thue` t",
  "LEFT JOIN (",
  "  SELECT code, tong_cong,",
  "    ROW_NUMBER() OVER (PARTITION BY code ORDER BY code) AS rn",
  "  FROM `pf-salary.payroll.C_view_bang_luong_co_ban_theo_ngay_cong`",
  ") cb ON cb.code = t.code AND cb.rn = 1",
  "ORDER BY",
  "  CASE",
  "    WHEN t.title_job LIKE '%Giám đốc%' THEN 1",
  "    WHEN UPPER(t.workplace) LIKE 'INHOUSE 2%' OR t.workplace LIKE '47 Nguy%' THEN 4",
  "    WHEN t.workplace LIKE 'Store%' THEN 5",
  "    WHEN t.title_job LIKE '%CS%' OR t.title_job LIKE '%Cleaner%' OR t.title_job LIKE '%保洁%' THEN 3",
  "    WHEN t.title_job LIKE '%tuyển dụng%' OR t.title_job LIKE '%kế toán%' OR t.title_job LIKE '%Phiên dịch%' OR t.title_job LIKE '%Operation Leader%' OR t.title_job = 'Sales admin' THEN 6",
  "    WHEN t.title_job LIKE '%Design%' OR t.title_job LIKE '%Graphic%' OR t.title_job LIKE '%Marketing%' OR t.title_job LIKE '%@%' OR t.title_job LIKE '%full stack%' OR t.title_job LIKE '%Data%' THEN 7",
  "    WHEN t.title_job LIKE '%Teacher%' OR t.title_job LIKE '%Giáo viên%' THEN 8",
  "    WHEN UPPER(t.workplace) LIKE 'INHOUSE 1%' THEN 2",
  "    ELSE 9 END,",
  "  CASE WHEN t.title_job LIKE '%Giám đốc%' THEN 1 WHEN t.title_job LIKE '%Leader%' OR t.title_job LIKE '%leader%' THEN 2 WHEN COALESCE(TRIM(t.type_self),'') NOT IN ('Chính thức','Thử việc','') THEN 4 ELSE 3 END,",
  "  t.full_name"
].join('\n');

/* ======== COLUMN MAP (A=1 .. AD=30) ======== */

var C_ = {
  stt:1, code:2, name:3, chuc_vu:4, loai_nv:5,
  luong_cd:6, ngay_cong:7, nghi_tet:8, luong_huong:9,
  thuong_ds:10, thuong_tet:11, khac:12,
  an_ca:13, chuyen_can:14, xang_xe:15, dien_thoai:16,
  tong_tn:17, gt_bt:18, gt_npt:19, tong_gt:20,
  tn_ct:21, tn_tt:22, thue_tncn:23,
  luong_tt:24,
  luong_bh:25, bhxh:26, bhyt:27, bhtn:28, bh_tong:29,
  so_npt:30,
  // Hidden columns — tax pipeline (Chung)
  may_tinh_h:31,
};
var NUM_COLS = 30;
var TOTAL_COLS = 31;

function cl_(n) {
  var s = '';
  while (n > 0) { var m = (n-1) % 26; s = String.fromCharCode(65+m) + s; n = (n-m-1) / 26; }
  return s;
}

function n_(v) { return (v === null || v === undefined || v === '') ? 0 : Number(v); }

/* ======== MAIN ======== */

function capNhatBangThue() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var rows = queryBQ_thue_();
  if (!rows.length) { ss.toast('Không có dữ liệu từ BigQuery.', 'Lỗi', 5); return; }

  var dt = ensureSheet_t_(ss, THUE_CFG.dataSheet, true);
  var sh = ensureSheet_t_(ss, THUE_CFG.sheetName, false);

  writeRaw_t_(dt, rows);
  buildHeaders_t_(sh);
  fillData_t_(sh, rows);
  formatThue_t_(sh, rows.length);

  ss.toast('Đã cập nhật ' + rows.length + ' NV vào bảng tính thuế.', '✓', 5);
}

/* ======== HEADERS (row 1-5) ======== */

function buildHeaders_t_(sh) {
  sh.clearContents();
  sh.clearFormats();

  // Row 1: title (không merge — tránh xung đột với frozenColumns)
  sh.getRange(1, 2).setValue('BẢNG TÍNH THUẾ TNCN + BẢO HIỂM')
    .setFontWeight('bold').setFontSize(13);
  sh.getRange(1, 1, 1, NUM_COLS)
    .setBackground('#1a3c5e').setFontColor('white');

  // Row 2: config (bắt đầu từ cột B)
  sh.getRange(2, 2).setValue('Ngày công chuẩn:');
  sh.getRange(2, 3).setValue(24).setFontWeight('bold');
  sh.getRange(2, 5).setValue('Kỳ lương:');

  // Row 3: main headers
  var h3 = arr_(NUM_COLS, '');
  h3[C_.stt-1]       = 'TT';
  h3[C_.code-1]      = 'Mã NV';
  h3[C_.name-1]      = 'Họ và tên';
  h3[C_.chuc_vu-1]   = 'Chức vụ';
  h3[C_.loai_nv-1]   = 'Loại NV';
  h3[C_.luong_cd-1]  = 'Lương cố định';
  h3[C_.ngay_cong-1] = 'Ngày công';
  h3[C_.nghi_tet-1]  = 'Nghỉ tết';
  h3[C_.luong_huong-1] = 'LCĐ được hưởng';
  h3[C_.thuong_ds-1] = 'Thưởng doanh số';
  h3[C_.thuong_tet-1]= 'Thưởng lễ tết';
  h3[C_.khac-1]      = 'Khác';
  h3[C_.an_ca-1]     = 'PHỤ CẤP';
  h3[C_.tong_tn-1]   = 'THUẾ TNCN';
  h3[C_.luong_tt-1]  = 'Lương thanh toán';
  h3[C_.luong_bh-1]  = 'Lương đóng BH';
  h3[C_.bhxh-1]      = 'BẢO HIỂM';
  h3[C_.so_npt-1]    = 'Số NPT';
  sh.getRange(3, 1, 1, NUM_COLS).setValues([h3]);

  // Merge single-col headers (row 3-4)
  var singles = [
    C_.stt, C_.code, C_.name, C_.chuc_vu, C_.loai_nv,
    C_.luong_cd, C_.ngay_cong, C_.nghi_tet, C_.luong_huong,
    C_.thuong_ds, C_.thuong_tet, C_.khac,
    C_.luong_tt, C_.luong_bh, C_.so_npt
  ];
  singles.forEach(function(c) { sh.getRange(3, c, 2, 1).merge(); });

  // Merge group header spans (row 3 only)
  sh.getRange(3, C_.an_ca, 1, 4).merge();    // Phụ cấp M-P
  sh.getRange(3, C_.tong_tn, 1, 7).merge();  // Thuế Q-W
  sh.getRange(3, C_.bhxh, 1, 4).merge();     // BH Z-AC

  // Row 4: sub-headers
  var h4 = arr_(NUM_COLS, '');
  h4[C_.an_ca-1]     = 'Ăn ca';
  h4[C_.chuyen_can-1]= 'Chuyên cần';
  h4[C_.xang_xe-1]   = 'Xăng xe';
  h4[C_.dien_thoai-1]= 'Điện thoại';
  h4[C_.tong_tn-1]   = 'Tổng thu nhập';
  h4[C_.gt_bt-1]     = 'GT bản thân';
  h4[C_.gt_npt-1]    = 'GT phụ thuộc';
  h4[C_.tong_gt-1]   = 'Tổng giảm trừ';
  h4[C_.tn_ct-1]     = 'TN chịu thuế';
  h4[C_.tn_tt-1]     = 'TN tính thuế';
  h4[C_.thue_tncn-1] = 'Thuế TNCN';
  h4[C_.bhxh-1]      = 'BHXH 8%';
  h4[C_.bhyt-1]      = 'BHYT 1,5%';
  h4[C_.bhtn-1]      = 'BHTN 1%';
  h4[C_.bh_tong-1]   = 'Tổng BH 10,5%';
  sh.getRange(4, 1, 1, NUM_COLS).setValues([h4]);

  // Style row 3-4
  sh.getRange(3, 1, 2, NUM_COLS)
    .setFontWeight('bold').setWrap(true).setFontSize(10)
    .setHorizontalAlignment('center').setVerticalAlignment('middle')
    .setBackground('#0b5394').setFontColor('white')
    .setBorder(true,true,true,true,true,true,'#ffffff',SpreadsheetApp.BorderStyle.SOLID);

  // Group colors
  sh.getRange(3, C_.an_ca, 2, 4).setBackground('#15803d');
  sh.getRange(3, C_.tong_tn, 2, 7).setBackground('#b45309');
  sh.getRange(3, C_.bhxh, 2, 4).setBackground('#7c3aed');

  // Row 5: note row
  sh.getRange(5, C_.loai_nv).setValue('Chính thức = lũy tiến · Thử việc / TTS / CTV = 10% flat');
  sh.getRange(5, 1, 1, NUM_COLS).setBackground('#F3F4F6')
    .setFontSize(9).setFontColor('#6b7280');
  // Merge note chỉ trong vùng không frozen (cột 4+)
  if(C_.loai_nv > 3) {
    sh.getRange(5, C_.loai_nv, 1, NUM_COLS - C_.loai_nv + 1).merge();
  }

  sh.setFrozenRows(5);
  sh.setFrozenColumns(3);
}

/* ======== DATA + FORMULAS (row 6+) ======== */

function fillData_t_(sh, rows) {
  var n = rows.length;
  var SR = 6; // start row

  // ---- Phase 1: Build value array ----
  var vals = [];
  for (var i = 0; i < n; i++) {
    var d = rows[i];
    var row = arr_(NUM_COLS, '');
    row[C_.stt-1]       = i + 1;
    row[C_.code-1]      = d.code;
    row[C_.name-1]      = d.full_name;
    row[C_.chuc_vu-1]   = d.title_job;
    row[C_.loai_nv-1]   = d.employee_type;
    row[C_.luong_cd-1]  = n_(d.luong_co_dinh);
    row[C_.ngay_cong-1] = n_(d.ngay_cong);
    row[C_.nghi_tet-1]  = 0;
    row[C_.tong_tn-1]   = n_(d.income_col_u_val);
    row[C_.an_ca-1]     = n_(d.an_ca);
    row[C_.xang_xe-1]   = n_(d.xang_xe);
    row[C_.dien_thoai-1]= n_(d.dien_thoai);
    row[C_.luong_bh-1]  = n_(d.luong_dong_bh);
    row[C_.so_npt-1]    = n_(d.so_npt);
    vals.push(row);
  }
  sh.getRange(SR, 1, n, NUM_COLS).setValues(vals);

  // ---- Phase 1b: Write hidden tax column (31) ----
  var hiddenVals = [];
  for (var i = 0; i < n; i++) {
    hiddenVals.push([n_(rows[i].may_tinh_val)]);
  }
  sh.getRange(SR, C_.may_tinh_h, n, 1).setValues(hiddenVals).setNumberFormat('#,##0');
  sh.hideColumns(C_.may_tinh_h, 1);

  // ---- Phase 2: Overlay formula columns ----
  var fc = function(col) { return cl_(col); };

  // I: LCĐ được hưởng = Lương cố định (= lương đóng BH, không nhân ngày công)
  setFormulaCol_(sh, SR, n, C_.luong_huong, function(r) {
    return '=' + fc(C_.luong_cd)+r;
  });

  // Q: Tổng thu nhập = income_col_u từ BQ (đã điền ở Phase 1, KHÔNG overlay formula)

  // J: Thưởng doanh số = Tổng TN − LCĐ hưởng − Ăn ca − Xăng xe − ĐT (derived)
  setFormulaCol_(sh, SR, n, C_.thuong_ds, function(r) {
    return '=' + fc(C_.tong_tn)+r + '-' + fc(C_.luong_huong)+r + '-' + fc(C_.an_ca)+r + '-' + fc(C_.xang_xe)+r + '-' + fc(C_.dien_thoai)+r;
  });

  // R: GT bản thân (chỉ Chính thức mới có giảm trừ; flat 10% = không giảm trừ)
  setFormulaCol_(sh, SR, n, C_.gt_bt, function(r) {
    var E = fc(C_.loai_nv)+r;
    return '=IF('+E+'="Chính thức";15500000;0)';
  });

  // S: GT phụ thuộc (chỉ Chính thức mới có giảm trừ)
  setFormulaCol_(sh, SR, n, C_.gt_npt, function(r) {
    var E = fc(C_.loai_nv)+r;
    return '=IF('+E+'="Chính thức";'+fc(C_.so_npt)+r+'*6200000;0)';
  });

  // T: Tổng giảm trừ
  setFormulaCol_(sh, SR, n, C_.tong_gt, function(r) {
    return '=' + fc(C_.gt_bt)+r + '+' + fc(C_.gt_npt)+r;
  });

  // U: TN chịu thuế — pipeline Chung (Tổng TN = income_col_u = anchor)
  // Chính thức: income_col_u − an_ca_van − dien_thoai (→ lũy tiến)
  // Thử việc / TTS / CTV: income_col_u (giữ nguyên → flat 10%)
  setFormulaCol_(sh, SR, n, C_.tn_ct, function(r) {
    var E = fc(C_.loai_nv)+r;
    var Q = fc(C_.tong_tn)+r;
    return '=IF('+E+'="Chính thức";'+Q+'-'+fc(C_.an_ca)+r+'-'+fc(C_.dien_thoai)+r+';'+Q+')';
  });

  // Z-AB: BH breakdown — chỉ Chính thức + Thử việc đóng BH; CTV/TTS (mọi nhãn) = 0.
  setFormulaCol_(sh, SR, n, C_.bhxh, function(r) {
    var E = fc(C_.loai_nv)+r, Y = fc(C_.luong_bh)+r;
    return '=IF(OR('+E+'="Chính thức";'+E+'="Thử việc");'+Y+'*8%;0)';
  });
  setFormulaCol_(sh, SR, n, C_.bhyt, function(r) {
    var E = fc(C_.loai_nv)+r, Y = fc(C_.luong_bh)+r;
    return '=IF(OR('+E+'="Chính thức";'+E+'="Thử việc");'+Y+'*15/1000;0)';
  });
  setFormulaCol_(sh, SR, n, C_.bhtn, function(r) {
    var E = fc(C_.loai_nv)+r, Y = fc(C_.luong_bh)+r;
    return '=IF(OR('+E+'="Chính thức";'+E+'="Thử việc");'+Y+'*1%;0)';
  });

  // AC: Tổng BH
  setFormulaCol_(sh, SR, n, C_.bh_tong, function(r) {
    return '=' + fc(C_.bhxh)+r + '+' + fc(C_.bhyt)+r + '+' + fc(C_.bhtn)+r;
  });

  // V: TN tính thuế = MAX(0; TN chịu thuế - Tổng GT - Tổng BH)
  setFormulaCol_(sh, SR, n, C_.tn_tt, function(r) {
    return '=MAX(0;' + fc(C_.tn_ct)+r + '-' + fc(C_.tong_gt)+r + '-' + fc(C_.bh_tong)+r + ')';
  });

  // W: Thuế TNCN
  setFormulaCol_(sh, SR, n, C_.thue_tncn, function(r) {
    return thueTNCN_v_(r);
  });

  // X: Lương thanh toán = Tổng TN - Thuế - Tổng BH
  setFormulaCol_(sh, SR, n, C_.luong_tt, function(r) {
    return '=' + fc(C_.tong_tn)+r + '-' + fc(C_.thue_tncn)+r + '-' + fc(C_.bh_tong)+r;
  });

  // Clean excess rows
  var lastRow = sh.getLastRow();
  if (lastRow > SR + n - 1) {
    sh.getRange(SR + n, 1, lastRow - SR - n + 1, NUM_COLS).clear();
  }
}

/**
 * Thuế TNCN theo loại NV:
 * - Chính thức: lũy tiến 5 bậc 2026 trên TN tính thuế
 * - Thử việc / TTS / CTV: 10% flat nếu tổng TN ≥ 5tr, 0 nếu < 5tr (KHÔNG trừ ăn ca)
 * - Ngoại lệ: HN0051, HN0163, HN0164 → thuế = 0
 */
function thueTNCN_v_(r) {
  var B = cl_(C_.code)+r;
  var E = cl_(C_.loai_nv)+r;
  var U = cl_(C_.tn_ct)+r;
  var V = cl_(C_.tn_tt)+r;

  var flat10 = 'IF('+U+'<5000000;0;'+U+'*10%)';

  var prog =
    'IF('+V+'<=0;0;' +
    'IF('+V+'<=10000000;'+V+'*5%;' +
    'IF('+V+'<=30000000;500000+('+V+'-10000000)*10%;' +
    'IF('+V+'<=60000000;2500000+('+V+'-30000000)*20%;' +
    'IF('+V+'<=100000000;8500000+('+V+'-60000000)*30%;' +
    '20500000+('+V+'-100000000)*35%)))))';

  return '=IF(OR('+B+'="HN0051";'+B+'="HN0163";'+B+'="HN0164");0;IF('+E+'="Chính thức";'+prog+';'+flat10+'))';
}

/* ======== FORMAT ======== */

function formatThue_t_(sh, numRows) {
  var SR = 6;

  // Number format #,##0 for money columns
  var moneyCols = [
    C_.luong_cd, C_.luong_huong, C_.thuong_ds, C_.thuong_tet, C_.khac,
    C_.an_ca, C_.chuyen_can, C_.xang_xe, C_.dien_thoai,
    C_.tong_tn, C_.gt_bt, C_.gt_npt, C_.tong_gt,
    C_.tn_ct, C_.tn_tt, C_.thue_tncn,
    C_.luong_tt, C_.luong_bh,
    C_.bhxh, C_.bhyt, C_.bhtn, C_.bh_tong
  ];
  moneyCols.forEach(function(c) {
    sh.getRange(SR, c, numRows, 1).setNumberFormat('#,##0');
  });

  // Color: input cells (vàng nhạt)
  var inputCols = [C_.ngay_cong, C_.nghi_tet, C_.thuong_ds,
                   C_.thuong_tet, C_.khac, C_.chuyen_can,
                   C_.xang_xe, C_.dien_thoai, C_.so_npt, C_.luong_bh];
  inputCols.forEach(function(c) {
    sh.getRange(SR, c, numRows, 1).setBackground('#FFF8E1');
  });

  // Color: calc cells (xanh nhạt)
  var calcCols = [C_.luong_huong, C_.tong_tn, C_.gt_bt, C_.gt_npt, C_.tong_gt,
                  C_.tn_ct, C_.tn_tt, C_.thue_tncn,
                  C_.bhxh, C_.bhyt, C_.bhtn, C_.bh_tong];
  calcCols.forEach(function(c) {
    sh.getRange(SR, c, numRows, 1).setBackground('#EEF2FF');
  });

  // Headline bold: Lương TT + Thuế TNCN
  [C_.luong_tt, C_.thue_tncn].forEach(function(c) {
    sh.getRange(SR, c, numRows, 1).setFontWeight('bold');
  });

  // Lương thanh toán = xanh đậm nền
  sh.getRange(SR, C_.luong_tt, numRows, 1).setBackground('#DBEAFE');

  // Border
  sh.getRange(3, 1, numRows + 3, NUM_COLS)
    .setBorder(true,true,true,true,true,true,'#D1D5DB',SpreadsheetApp.BorderStyle.SOLID);

  // Auto-resize
  for (var i = 1; i <= NUM_COLS; i++) sh.autoResizeColumn(i);

  // Fixed/min widths
  sh.setColumnWidth(C_.stt, 36);
  sh.setColumnWidth(C_.name, 160);
  sh.setColumnWidth(C_.chuc_vu, 140);
  sh.setColumnWidth(C_.luong_tt, 130);
}

/* ======== HELPERS ======== */

function setFormulaCol_(sh, startRow, numRows, col, formulaFn) {
  var formulas = [];
  for (var i = 0; i < numRows; i++) {
    formulas.push([formulaFn(startRow + i)]);
  }
  sh.getRange(startRow, col, numRows, 1).setFormulas(formulas);
}

function arr_(len, fill) {
  var a = [];
  for (var i = 0; i < len; i++) a.push(fill);
  return a;
}

/* ======== BigQuery ======== */

function queryBQ_thue_() {
  var req = { query: SQL_THUE, useLegacySql: false };
  var job = BigQuery.Jobs.query(req, THUE_CFG.bqProject);
  var jobId = job.jobReference.jobId;
  while (!job.jobComplete) {
    Utilities.sleep(1000);
    job = BigQuery.Jobs.getQueryResults(THUE_CFG.bqProject, jobId);
  }
  var fields = job.schema.fields.map(function(f) { return f.name; });
  var numericKeys = ['luong_co_dinh','ngay_cong','income_col_u_val','an_ca','xang_xe','dien_thoai','may_tinh_val','luong_dong_bh','so_npt'];
  var out = [];
  (job.rows || []).forEach(function(row) {
    var o = {};
    row.f.forEach(function(cell, i) { o[fields[i]] = cell.v; });
    numericKeys.forEach(function(k) {
      if (o[k] !== null && o[k] !== undefined && o[k] !== '') o[k] = Number(o[k]);
    });
    out.push(o);
  });
  return out;
}

/* ======== Sheet utils ======== */

function ensureSheet_t_(ss, name, hide) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    if (hide) sh.hideSheet();
  }
  return sh;
}

function writeRaw_t_(sh, rows) {
  sh.clearContents();
  if (!rows.length) return;
  var keys = Object.keys(rows[0]);
  var vals = [keys];
  rows.forEach(function(r) {
    vals.push(keys.map(function(k) { return r[k]; }));
  });
  sh.getRange(1, 1, vals.length, keys.length).setValues(vals);
}
