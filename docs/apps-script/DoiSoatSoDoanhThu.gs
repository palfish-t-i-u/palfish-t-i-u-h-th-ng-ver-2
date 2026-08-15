/**
 * ĐỐI SOÁT SỔ DOANH THU ↔ ALL FILE THU HIỀN
 *
 * 3 hàm chạy riêng (mỗi cái 6 phút timeout riêng):
 *   B1a  keoAllFile()     — Kéo All File Thu Hiền → tab "_AllFile"
 *   B1b  keoSoDT()        — Kéo Sổ doanh thu (Supabase) → tab "_SoDT"
 *   B2   doiSoatSoDT()    — So khớp 2 tab → xuất tab "Đối soát DT"
 *
 * Menu: ⚙ Đối soát DT → 3 mục tương ứng
 *
 * Setup:
 *   1. Script Properties → SUPABASE_URL, SUPABASE_SERVICE_KEY
 *   2. (Optional) ALLFILE_SHEET_ID — default dùng ID cứng bên dưới
 */

// =====================================================================
// CONFIG
// =====================================================================

var DSDT = {
  allFileSheetId: '1sEthbH-zcMavoQ1qi9J_CNnHAJoyt0gfsE-xsMW0LCc',
  allFileTabs:    ['SM Hanoi', 'HCM REV'],
  smHanoiTeamCol: 33,   // col AH
  tabAllFile:     '_AllFile',
  tabSoDT:        '_SoDT',
  tabOut:         'Đối soát DT',
  fetchPageSize:  1000,
};

var DEFAULT_TEAM_BY_TAB = {
  'SM Hanoi': 'Inhouse 1',
  'HCM REV':  'HCM (Online)',
};

// Cột All File — layout KHÁC NHAU giữa SM Hanoi và HCM REV
// SM Hanoi: A(0)=ngày, B(1)=bank_time, C(2)=gateway, D(3)=ten_khach, E(4)=sdt,
//   F(5)=uid, G(6)=goi_hoc, H(7)=fixed, I(8)=pay_time, K(10)=so_tien_vnd,
//   L(11)=gmv_rmb, N(13)=phuong_thuc, O(14)=loai, V(21)=sale, AH(33)=team
// HCM REV: A(0)=ngày, D(3)=ten_khach, E(4)=sdt, F(5)=uid, G(6)=goi_hoc,
//   I(8)=pay_time, J(9)=so_tien_vnd, K(10)=gmv_rmb, L(11)=phuong_thuc,
//   M(12)=loai, N(13)=sale
var AF_COL_SM = {
  ngay: 0, ten_khach: 3, sdt: 4, uid: 5, goi_hoc: 6,
  pay_time: 8, so_tien_vnd: 10, gmv_rmb: 11, phuong_thuc: 13, loai: 14, sale: 21
};
var AF_COL_HCM = {
  ngay: 0, ten_khach: 3, sdt: 4, uid: 5, goi_hoc: 6,
  pay_time: 8, so_tien_vnd: 9, gmv_rmb: 10, phuong_thuc: 11, loai: 12, sale: 13
};

// =====================================================================
// MENU
// =====================================================================

function onOpen() {
  SpreadsheetApp.getUi().createMenu('⚙ Đối soát DT')
    .addItem('📥 B1a — Kéo All File Thu Hiền', 'keoAllFile')
    .addItem('📥 B1b — Kéo Sổ doanh thu (App)', 'keoSoDT')
    .addSeparator()
    .addItem('📊 B2 — So khớp Sổ ↔ All File', 'doiSoatSoDT')
    .addToUi();
}

// =====================================================================
// B1a — KÉO ALL FILE THU HIỀN
// =====================================================================

function keoAllFile() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();

  var sheetId = PropertiesService.getScriptProperties().getProperty('ALLFILE_SHEET_ID')
                || DSDT.allFileSheetId;
  var src;
  try {
    src = SpreadsheetApp.openById(sheetId);
  } catch (e) {
    ui.alert('Không mở được All File.\nID: ' + sheetId + '\nLỗi: ' + e.message);
    return;
  }

  var out = ensureTab_(ss, DSDT.tabAllFile);
  var headers = ['nguon_tab', 'ngay_tien_ve', 'ten_khach', 'sdt', 'uid', 'goi_hoc',
                 'so_tien_vnd', 'gmv_rmb', 'phuong_thuc', 'sale_crm_name', 'team'];
  out.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  // Force date column as plain text to prevent Sheets auto-converting to Date objects
  out.getRange(1, 2, out.getMaxRows(), 1).setNumberFormat('@');

  var totalRows = 0;
  var writeRow = 2;

  for (var t = 0; t < DSDT.allFileTabs.length; t++) {
    var tabName = DSDT.allFileTabs[t];
    var tab = src.getSheetByName(tabName);
    if (!tab) {
      ss.toast('Tab "' + tabName + '" không tồn tại trong All File — bỏ qua.');
      continue;
    }

    var data = tab.getDataRange().getValues();
    var defaultTeam = DEFAULT_TEAM_BY_TAB[tabName] || '';
    var col = (tabName === 'SM Hanoi') ? AF_COL_SM : AF_COL_HCM;
    var batch = [];

    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var ngay = parseDate_(row[col.ngay]);
      var vnd  = toNum_(row[col.so_tien_vnd]);
      if (!ngay || vnd === 0) continue;

      var team = defaultTeam;
      if (tabName === 'SM Hanoi' && row.length > DSDT.smHanoiTeamCol) {
        var t2 = String(row[DSDT.smHanoiTeamCol] || '').trim();
        if (t2) team = t2;
      }

      var uid = row[col.uid];
      if (typeof uid === 'number') uid = String(Math.round(uid));
      else uid = clean_(uid);

      batch.push([
        tabName,
        ngay,
        clean_(row[col.ten_khach]),
        cleanPhone_(row[col.sdt]),
        uid,
        clean_(row[col.goi_hoc]),
        vnd,
        toNum_(row[col.gmv_rmb]),
        clean_(row[col.phuong_thuc]),
        clean_(row[col.sale]),
        team,
      ]);
    }

    if (batch.length > 0) {
      out.getRange(writeRow, 1, batch.length, headers.length).setValues(batch);
      writeRow += batch.length;
      totalRows += batch.length;
    }
  }

  ss.toast('Đã kéo ' + totalRows + ' dòng All File → tab "' + DSDT.tabAllFile + '".', 'B1a xong', 10);
}

// =====================================================================
// B1b — KÉO SỔ DOANH THU TỪ SUPABASE
// =====================================================================

function keoSoDT() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();

  var props = PropertiesService.getScriptProperties();
  var sbUrl = props.getProperty('SUPABASE_URL');
  var exportSecret = props.getProperty('EXPORT_SECRET');
  if (!sbUrl || !exportSecret) {
    ui.alert('Thiếu Script Properties:\n  SUPABASE_URL\n  EXPORT_SECRET\n\nVào File → Project settings → Script Properties để thêm.');
    return;
  }

  ss.toast('Đang gọi Edge Function...', 'B1b', 5);

  var url = sbUrl + '/functions/v1/sheet-read-ledger';
  var resp = UrlFetchApp.fetch(url, {
    headers: {
      'x-export-secret': exportSecret,
    },
    muteHttpExceptions: true,
  });

  if (resp.getResponseCode() !== 200) {
    ui.alert('Edge Function lỗi ' + resp.getResponseCode() + ':\n' + resp.getContentText().substring(0, 500));
    return;
  }

  var allRows = JSON.parse(resp.getContentText());

  var headers = ['id', 'uid', 'ngay_tien_ve', 'pay_time', 'so_tien_vnd', 'gmv_rmb',
                 'ten_khach', 'sdt', 'sale_crm_name', 'team', 'loai_nhap', 'created_by_email'];
  var out = ensureTab_(ss, DSDT.tabSoDT);
  out.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  // Force date columns (C=ngay_tien_ve, D=pay_time) as plain text
  out.getRange(1, 3, out.getMaxRows(), 2).setNumberFormat('@');

  if (allRows.length > 0) {
    var vals = allRows.map(function(r) {
      return headers.map(function(h) { return r[h] !== null && r[h] !== undefined ? r[h] : ''; });
    });
    // Ghi theo batch 5000 dòng (tránh quá tải)
    for (var i = 0; i < vals.length; i += 5000) {
      var batch = vals.slice(i, i + 5000);
      out.getRange(i + 2, 1, batch.length, headers.length).setValues(batch);
    }
  }

  ss.toast('Đã kéo ' + allRows.length + ' dòng Sổ doanh thu → tab "' + DSDT.tabSoDT + '".', 'B1b xong', 10);
}

// =====================================================================
// B2 — SO KHỚP SỔ ↔ ALL FILE
// =====================================================================

function doiSoatSoDT() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();

  var afSheet = ss.getSheetByName(DSDT.tabAllFile);
  var sdSheet = ss.getSheetByName(DSDT.tabSoDT);
  if (!afSheet) { ui.alert('Chưa có tab "' + DSDT.tabAllFile + '". Chạy B1a trước.'); return; }
  if (!sdSheet) { ui.alert('Chưa có tab "' + DSDT.tabSoDT + '". Chạy B1b trước.'); return; }

  showDatePicker_();
}

// =====================================================================
// RECONCILE — 5 tầng giống ledger_recon.py
// =====================================================================

function doReconcile_(sheetRows, dbRows) {
  // Pool: index DB rows chưa tiêu thụ
  var consumed = [];
  for (var i = 0; i < dbRows.length; i++) consumed.push(false);

  // Build index maps
  var maps = {
    exact:     buildMap_(dbRows, kExact_),
    loose:     buildMap_(dbRows, kLoose_),
    blank_db:  buildMapFiltered_(dbRows, kLooseBlank_, function(r) { return !clean_(r.uid); }),
    blank_all: buildMap_(dbRows, kLooseBlank_),
    day_vnd:   buildMap_(dbRows, kDayVnd_),
    uid_day:   buildMap_(dbRows, kUidDay_),
  };

  // exact_keys_db (cho dup_suspect)
  var exactKeysDb = {};
  for (var i = 0; i < dbRows.length; i++) {
    var k = kExact_(dbRows[i]);
    if (k) exactKeysDb[k] = true;
  }

  var matched = [];
  for (var i = 0; i < sheetRows.length; i++) matched.push(null);

  function take(mapName, key, si, guard) {
    if (!key) return -1;
    var lst = maps[mapName][key];
    if (!lst) return -1;
    for (var j = 0; j < lst.length; j++) {
      var idx = lst[j];
      if (consumed[idx]) continue;
      if (guard && !guard(sheetRows[si], dbRows[idx])) continue;
      consumed[idx] = true;
      lst.splice(j, 1);
      return idx;
    }
    return -1;
  }

  function pass(tier, keyFn, mapName, guard, onlyBlankSheet) {
    for (var si = 0; si < sheetRows.length; si++) {
      if (matched[si] !== null) continue;
      if (onlyBlankSheet && clean_(sheetRows[si].uid)) continue;
      var idx = take(mapName || tier, keyFn(sheetRows[si]), si, guard);
      if (idx >= 0) matched[si] = { tier: tier, dbIdx: idx };
    }
  }

  // 5 tầng
  pass('exact',      kExact_,     'exact');
  pass('loose',      kLoose_,     'loose');
  pass('loose_blank',kLooseBlank_,'blank_db',  samePerson_);
  pass('loose_blank',kLooseBlank_,'blank_all', samePerson_, true);
  pass('day_vnd',    kDayVnd_,    'day_vnd');
  pass('uid_day',    kUidDay_,    'uid_day');

  // Phân loại
  var matches = { exact: [], loose: [], loose_blank: [], day_vnd: [], uid_day: [] };
  var dup_suspect = [];
  var sheet_only = [];

  for (var si = 0; si < sheetRows.length; si++) {
    var m = matched[si];
    if (m !== null) {
      matches[m.tier].push({ sheet: sheetRows[si], db: dbRows[m.dbIdx] });
    } else {
      var k = kExact_(sheetRows[si]);
      if (k && exactKeysDb[k]) {
        dup_suspect.push(sheetRows[si]);
      } else {
        sheet_only.push(sheetRows[si]);
      }
    }
  }

  var db_only = [];
  for (var i = 0; i < dbRows.length; i++) {
    if (!consumed[i]) db_only.push(dbRows[i]);
  }

  return { matches: matches, dup_suspect: dup_suspect, sheet_only: sheet_only, db_only: db_only };
}

// --- Key functions ---

function kExact_(r) {
  var uid = clean_(r.uid), day = primaryDay_(r);
  if (!uid || !day) return null;
  return uid + '|' + day + '|' + vnd_(r);
}

function kLoose_(r) {
  var uid = clean_(r.uid);
  var pay = String(r.pay_time || r.ngay_tien_ve || '').substring(0, 7);
  var sale = clean_(r.sale_crm_name).toLowerCase();
  return uid + '|' + sale + '|' + pay + '|' + vnd_(r);
}

function kLooseBlank_(r) {
  var pay = String(r.pay_time || r.ngay_tien_ve || '').substring(0, 7);
  var sale = clean_(r.sale_crm_name).toLowerCase();
  return '|' + sale + '|' + pay + '|' + vnd_(r);
}

function kDayVnd_(r) {
  var day = primaryDay_(r);
  return day ? (day + '|' + vnd_(r)) : null;
}

function kUidDay_(r) {
  var uid = clean_(r.uid), day = primaryDay_(r);
  return (uid && day) ? (uid + '|' + day) : null;
}

function samePerson_(a, b) {
  var pa = clean_(a.sdt), pb = clean_(b.sdt);
  if (pa && pb) return pa === pb;
  var na = clean_(a.ten_khach).toLowerCase(), nb = clean_(b.ten_khach).toLowerCase();
  if (na && nb) return na === nb;
  return false;
}

// --- Index builder ---

function buildMap_(rows, keyFn) {
  var map = {};
  for (var i = 0; i < rows.length; i++) {
    var k = keyFn(rows[i]);
    if (!k) continue;
    if (!map[k]) map[k] = [];
    map[k].push(i);
  }
  return map;
}

function buildMapFiltered_(rows, keyFn, filterFn) {
  var map = {};
  for (var i = 0; i < rows.length; i++) {
    if (!filterFn(rows[i])) continue;
    var k = keyFn(rows[i]);
    if (!k) continue;
    if (!map[k]) map[k] = [];
    map[k].push(i);
  }
  return map;
}

// =====================================================================
// REPORT — BÁO CÁO ĐỐI SOÁT
// =====================================================================

function writeDoiSoatReport_(ss, result, sheetRows, dbRows, startDate, endDate) {
  var sh = ensureTab_(ss, DSDT.tabOut);

  var GREEN  = '#C6EFCE';
  var RED    = '#FFC7CE';
  var YELLOW = '#FFEB9C';
  var BLUE   = '#D6E4F0';
  var HEADER = '#1a3c5e';

  var m = result.matches;
  var nExact      = m.exact.length;
  var nLoose      = m.loose.length;
  var nLooseBlank = m.loose_blank.length;
  var nDayVnd     = m.day_vnd.length;
  var nUidDay     = m.uid_day.length;
  var nStrong     = nExact + nLoose + nLooseBlank;
  var nWeak       = nDayVnd;
  var totalMatched = nStrong + nWeak;
  var nSheet = sheetRows.length;
  var nDb    = dbRows.length;

  var vndSheet = sumVnd_(sheetRows);
  var vndDb    = sumVnd_(dbRows);
  var vndStrong = sumVndPairs_(m.exact) + sumVndPairs_(m.loose) + sumVndPairs_(m.loose_blank);
  var vndWeak   = sumVndPairs_(m.day_vnd);

  var pctRows = nSheet > 0 ? Math.round(totalMatched / nSheet * 100) : 0;
  var pctVnd  = vndSheet > 0 ? Math.round((vndStrong + vndWeak) / vndSheet * 10000) / 100 : 0;

  var r = 1;

  // --- HEADER ---
  sh.getRange(r, 1).setValue('ĐỐI SOÁT SỔ DOANH THU ↔ ALL FILE')
    .setFontWeight('bold').setFontSize(14).setFontColor('white');
  sh.getRange(r, 1, 1, 6).setBackground(HEADER);
  r++;

  sh.getRange(r, 1).setValue('Ngày chạy:');
  sh.getRange(r, 2).setValue(new Date()).setNumberFormat('dd/MM/yyyy HH:mm');
  r++;
  if (startDate || endDate) {
    sh.getRange(r, 1).setValue('Kỳ:');
    sh.getRange(r, 2).setValue((startDate || '...') + ' → ' + (endDate || '...'));
    r++;
  }

  // --- BẢNG 1: TỔNG QUAN ---
  r++;
  sh.getRange(r, 1).setValue('TỔNG QUAN').setFontWeight('bold').setFontSize(11);
  r++;

  var summary = [
    ['Chỉ số',                                    'Giá trị'],
    ['Dòng All File (trong kỳ)',                   nSheet + ' dòng / ' + fmtVnd_(vndSheet) + ' ₫'],
    ['Dòng Sổ doanh thu (trong kỳ)',               nDb + ' dòng / ' + fmtVnd_(vndDb) + ' ₫'],
    ['Khớp chắc (uid+ngày+tiền)',                   nExact + ' dòng (exact)'],
    ['Khớp vừa (uid+sale+tháng+tiền)',              nLoose + ' dòng (loose)'],
    ['Khớp UID-blank (sale+tháng+tiền+tên/SĐT)',   nLooseBlank + ' dòng'],
    ['Khớp yếu (ngày+tiền — cần spot-check)',       nWeak + ' dòng'],
    ['Tỷ lệ khớp theo dòng',                        pctRows + '%'],
    ['Tỷ lệ khớp theo số tiền',                     pctVnd + '%'],
    ['Lệch tiền (cùng khách, cùng ngày)',            nUidDay + ' dòng'],
    ['Nghi trùng trên sheet (dup_suspect)',           result.dup_suspect.length + ' dòng'],
    ['File có, App THIẾU (sheet_only)',              result.sheet_only.length + ' dòng / ' + fmtVnd_(sumVnd_(result.sheet_only)) + ' ₫'],
    ['App có, File KHÔNG có (db_only)',              result.db_only.length + ' dòng / ' + fmtVnd_(sumVnd_(result.db_only)) + ' ₫'],
  ];
  sh.getRange(r, 1, summary.length, 2).setValues(summary);
  sh.getRange(r, 1, 1, 2).setFontWeight('bold').setBackground(BLUE);
  // Color tỷ lệ
  sh.getRange(r + 8, 2).setFontWeight('bold').setFontSize(12)
    .setFontColor(pctVnd >= 99.5 ? '#16A34A' : pctVnd >= 90 ? '#D97706' : '#DC2626');
  r += summary.length + 1;

  // --- BẢNG 2: FILE CÓ, APP THIẾU (sheet_only) ---
  r = writeListSection_(sh, r, 'FILE CÓ — APP THIẾU (cần import/kiểm tra)',
    result.sheet_only, ['ngay_tien_ve', 'uid', 'ten_khach', 'sdt', 'sale_crm_name', 'so_tien_vnd', 'nguon_tab'], RED);

  // --- BẢNG 3: APP CÓ, FILE KHÔNG CÓ (db_only) ---
  r = writeListSection_(sh, r, 'APP CÓ — FILE KHÔNG CÓ',
    result.db_only, ['ngay_tien_ve', 'uid', 'ten_khach', 'sdt', 'sale_crm_name', 'so_tien_vnd', 'loai_nhap'], YELLOW);

  // --- BẢNG 4: LỆCH TIỀN (uid_day) ---
  r++;
  sh.getRange(r, 1).setValue('LỆCH TIỀN (cùng UID + ngày, khác số tiền)').setFontWeight('bold').setFontSize(11);
  r++;
  var amHeaders = ['UID', 'Ngày', 'Tên', 'Sale', 'VND (File)', 'VND (App)', 'Chênh lệch', 'Kết luận'];
  sh.getRange(r, 1, 1, amHeaders.length).setValues([amHeaders]).setFontWeight('bold').setBackground(BLUE);
  sh.getRange(r, 8).setBackground('#FFF9C4');
  r++;
  for (var i = 0; i < m.uid_day.length; i++) {
    var pair = m.uid_day[i];
    var vFile = vnd_(pair.sheet);
    var vApp  = vnd_(pair.db);
    sh.getRange(r, 1, 1, 7).setValues([[
      clean_(pair.sheet.uid), primaryDay_(pair.sheet), clean_(pair.sheet.ten_khach),
      clean_(pair.sheet.sale_crm_name), vFile, vApp, vFile - vApp
    ]]);
    sh.getRange(r, 5, 1, 3).setNumberFormat('#,##0');
    if (Math.abs(vFile - vApp) > 100000) sh.getRange(r, 7).setBackground(RED);
    sh.getRange(r, 8).setValue('').setBackground('#FFF9C4');
    r++;
  }
  if (m.uid_day.length === 0) {
    sh.getRange(r, 1).setValue('Không có lệch tiền').setFontColor('#16A34A');
    r++;
  }

  // --- BẢNG 5: NGHI TRÙNG (dup_suspect) ---
  r = writeListSection_(sh, r + 1, 'NGHI TRÙNG TRÊN SHEET (chờ người quyết)',
    result.dup_suspect, ['ngay_tien_ve', 'uid', 'ten_khach', 'sale_crm_name', 'so_tien_vnd', 'nguon_tab'], YELLOW);

  // Format
  sh.autoResizeColumns(1, 8);
}

function writeListSection_(sh, r, title, rows, cols, bgColor) {
  r++;
  sh.getRange(r, 1).setValue(title + ' (' + rows.length + ' dòng)').setFontWeight('bold').setFontSize(11);
  r++;
  sh.getRange(r, 1, 1, cols.length).setValues([cols]).setFontWeight('bold').setBackground('#D6E4F0');
  r++;

  var maxShow = Math.min(rows.length, 500);
  for (var i = 0; i < maxShow; i++) {
    var vals = [];
    for (var c = 0; c < cols.length; c++) {
      var v = rows[i][cols[c]];
      vals.push(v !== undefined && v !== null ? v : '');
    }
    sh.getRange(r, 1, 1, cols.length).setValues([vals]);
    if (cols.indexOf('so_tien_vnd') >= 0) {
      sh.getRange(r, cols.indexOf('so_tien_vnd') + 1).setNumberFormat('#,##0');
    }
    // Dòng kết luận cạnh mỗi dòng data (cột cuối + 1)
    sh.getRange(r, cols.length + 1).setValue('').setBackground('#FFF9C4');
    r++;
  }
  if (rows.length > 500) {
    sh.getRange(r, 1).setValue('... và ' + (rows.length - 500) + ' dòng nữa').setFontStyle('italic');
    r++;
  }
  if (rows.length === 0) {
    sh.getRange(r, 1).setValue('Không có').setFontColor('#16A34A');
    r++;
  }

  // Header "Kết luận" trên cột ghi chú
  if (maxShow > 0) {
    var headerRow = r - maxShow - 1;
    sh.getRange(headerRow, cols.length + 1).setValue('Kết luận').setFontWeight('bold').setBackground('#FFF9C4');
  }

  return r;
}

// =====================================================================
// HELPERS
// =====================================================================

function showDatePicker_() {
  var now = new Date();
  var y = now.getFullYear();
  var m = now.getMonth(); // 0-indexed
  var firstDay = Utilities.formatDate(new Date(y, m, 1), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var lastDay  = Utilities.formatDate(new Date(y, m + 1, 0), Session.getScriptTimeZone(), 'yyyy-MM-dd');

  var html = HtmlService.createHtmlOutput(
    '<style>'
    + 'body{font-family:sans-serif;padding:16px}'
    + 'label{display:block;margin:8px 0 4px;font-weight:bold}'
    + 'input[type=date]{font-size:16px;padding:6px 10px;width:100%;box-sizing:border-box}'
    + '.btns{margin-top:16px;text-align:right}'
    + 'button{font-size:14px;padding:8px 20px;margin-left:8px;cursor:pointer;border:1px solid #ccc;border-radius:4px}'
    + '.primary{background:#1a73e8;color:#fff;border-color:#1a73e8}'
    + '.presets{margin-bottom:12px}'
    + '.presets button{font-size:12px;padding:4px 10px;margin:2px}'
    + '</style>'
    + '<div class="presets">'
    + '  <button onclick="setPreset(0)">Tháng này</button>'
    + '  <button onclick="setPreset(-1)">Tháng trước</button>'
    + '  <button onclick="setPreset(-2)">2 tháng trước</button>'
    + '  <button onclick="document.getElementById(\'s\').value=\'\';document.getElementById(\'e\').value=\'\'">Tất cả</button>'
    + '</div>'
    + '<label>Từ ngày</label>'
    + '<input type="date" id="s" value="' + firstDay + '">'
    + '<label>Đến ngày</label>'
    + '<input type="date" id="e" value="' + lastDay + '">'
    + '<div class="btns">'
    + '  <button onclick="google.script.host.close()">Huỷ</button>'
    + '  <button class="primary" onclick="submit()">Chạy đối soát</button>'
    + '</div>'
    + '<script>'
    + 'function setPreset(offset){'
    + '  var d=new Date();d.setMonth(d.getMonth()+offset);'
    + '  var y=d.getFullYear(),m=d.getMonth();'
    + '  var first=new Date(y,m,1),last=new Date(y,m+1,0);'
    + '  document.getElementById("s").value=fmt(first);'
    + '  document.getElementById("e").value=fmt(last);'
    + '}'
    + 'function fmt(d){return d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate())}'
    + 'function p(n){return n<10?"0"+n:n}'
    + 'function submit(){'
    + '  var btn=document.querySelector(".primary");'
    + '  if(btn.disabled)return;'
    + '  btn.disabled=true;btn.textContent="Đang chạy...";'
    + '  var s=document.getElementById("s").value,e=document.getElementById("e").value;'
    + '  google.script.run.withSuccessHandler(function(){google.script.host.close()})'
    + '    .withFailureHandler(function(err){btn.disabled=false;btn.textContent="Chạy đối soát";alert("Lỗi: "+err.message)})'
    + '    .runDoiSoatWithDates(s,e);'
    + '}'
    + '</script>'
  ).setWidth(320).setHeight(300);

  SpreadsheetApp.getUi().showModalDialog(html, '📊 Khoảng thời gian đối soát');
  return null; // Dialog is async — actual work done in runDoiSoatWithDates_
}

function runDoiSoatWithDates(startDate, endDate) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var afSheet = ss.getSheetByName(DSDT.tabAllFile);
  var sdSheet = ss.getSheetByName(DSDT.tabSoDT);
  if (!afSheet || !sdSheet) {
    ss.toast('Chưa có tab _AllFile hoặc _SoDT. Chạy B1a/B1b trước.', 'Lỗi', 5);
    return;
  }

  var afData = readTabAsObjects_(afSheet);
  var sheetRows = [];
  for (var i = 0; i < afData.length; i++) {
    var r = afData[i];
    var day = primaryDay_(r);
    if (!day) continue;
    if (startDate && day < startDate) continue;
    if (endDate && day > endDate) continue;
    sheetRows.push(r);
  }

  var sdData = readTabAsObjects_(sdSheet);
  var dbRows = [];
  for (var i = 0; i < sdData.length; i++) {
    var r = sdData[i];
    var day = primaryDay_(r);
    if (!day) continue;
    if (startDate && day < startDate) continue;
    if (endDate && day > endDate) continue;
    dbRows.push(r);
  }

  ss.toast('All File: ' + sheetRows.length + ' dòng, Sổ: ' + dbRows.length + ' dòng. Đang so khớp...', 'B2', 5);

  var result = doReconcile_(sheetRows, dbRows);
  writeDoiSoatReport_(ss, result, sheetRows, dbRows, startDate, endDate);

  var m = result.matches;
  var totalMatched = m.exact.length + m.loose.length + m.loose_blank.length + m.day_vnd.length;
  var pct = sheetRows.length > 0 ? Math.round(totalMatched / sheetRows.length * 100) : 0;
  ss.toast(
    'Khớp ' + pct + '% (' + totalMatched + '/' + sheetRows.length + ' dòng).\n' +
    'Lệch tiền: ' + m.uid_day.length + ' dòng.\n' +
    'Nghi trùng: ' + result.dup_suspect.length + ' dòng.\n' +
    'Xem tab "' + DSDT.tabOut + '".',
    'B2 xong', 15
  );
}

function ensureTab_(ss, name) {
  var sh = ss.getSheetByName(name);
  if (sh) { sh.clear(); } else { sh = ss.insertSheet(name); }
  return sh;
}

function readTabAsObjects_(sh) {
  var data = sh.getDataRange().getValues();
  if (data.length < 2) return [];
  var headers = data[0].map(function(h) { return String(h).trim(); });
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      obj[headers[j]] = data[i][j];
    }
    rows.push(obj);
  }
  return rows;
}

function clean_(v) {
  if (v === null || v === undefined) return '';
  var s = String(v).trim();
  return s.toLowerCase() === 'nan' ? '' : s;
}

function cleanPhone_(v) {
  var s = clean_(v);
  return s.replace(/[^0-9+\-]/g, '');
}

function toNum_(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v;
  var s = String(v).replace(/[,\s]/g, '');
  var neg = s.charAt(0) === '-';
  s = s.replace(/^-/, '');
  var n = parseFloat(s);
  if (isNaN(n)) return 0;
  return neg ? -n : n;
}

function vnd_(r) {
  return toNum_(r.so_tien_vnd);
}

function primaryDay_(r) {
  var raw = r.ngay_tien_ve;
  if (raw instanceof Date) {
    return Utilities.formatDate(raw, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  var d = clean_(raw);
  if (d) {
    var m = d.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
    var m2 = d.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (m2) return m2[3] + '-' + pad2_(m2[2]) + '-' + pad2_(m2[1]);
    return '';
  }
  raw = r.pay_time;
  if (raw instanceof Date) {
    return Utilities.formatDate(raw, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  var p = clean_(raw);
  if (p) {
    var m3 = p.match(/^(\d{4}-\d{2}-\d{2})/);
    return m3 ? m3[1] : '';
  }
  return '';
}

function parseDate_(v) {
  if (!v) return '';
  if (v instanceof Date) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  var s = String(v).trim().substring(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // dd/MM/yyyy
  var m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return m[3] + '-' + pad2_(m[2]) + '-' + pad2_(m[1]);
  return '';
}

function pad2_(s) {
  s = String(s);
  return s.length < 2 ? '0' + s : s;
}

function fmtVnd_(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function sumVnd_(rows) {
  var total = 0;
  for (var i = 0; i < rows.length; i++) total += vnd_(rows[i]);
  return total;
}

function sumVndPairs_(pairs) {
  var total = 0;
  for (var i = 0; i < pairs.length; i++) total += vnd_(pairs[i].sheet);
  return total;
}
