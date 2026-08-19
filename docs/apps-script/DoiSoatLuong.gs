/**
 * ĐỐI SOÁT LƯƠNG — So sánh "Bảng lương" (BQ) vs file chị Trang
 *
 * CÁCH DÙNG:
 * 1. Tạo tab "Đối chiếu Trang" trong spreadsheet
 * 2. Copy-paste dữ liệu tháng cần đối soát từ file xlsx chị Trang
 *    (giữ nguyên format: row 1 = header, cột A=STT, B=Code, C=Name, ...)
 * 3. Chạy: ⚙ Bảng lương → 📊 Đối soát với bảng Trang
 * 4. Xem kết quả ở tab "Đối soát"
 *
 * Cột xlsx chị Trang (0-indexed):
 *   A(0): STT/Group  B(1): Code  C(2): Name  D(3): Chức danh
 *   E(4): Tổng lương+thưởng  F(5): Tổng lương  G(6): LCB
 *   H(7): Công  I(8): LCB ngày công  J(9): COM  K(10): BH
 *   L(11): GMV  M(12): Ăn trưa  N(13): Máy tính  O(14): Xe+PC
 *   P(15): Khấu trừ thuế  Q(16): Bù tiền
 */

const DS_CFG = {
  trangTab:  'Đối chiếu Trang',
  bqTab:     'Bảng lương',
  outTab:    'Đối soát',
};

// Cột cần so sánh: key = tên hiển thị, bq = cột trên "Bảng lương", trang = cột trên xlsx (0-indexed)
const COMPARE_COLS = [
  { key: 'Lương cơ bản',     bqHeader: 'Lương cơ bản',                    trangCol: 6,  type: 'number', tol: 1 },
  { key: 'Công',              bqHeader: 'Công',                             trangCol: 7,  type: 'number', tol: 0.01 },
  { key: 'LCB ngày công',    bqHeader: 'LCB theo ngày công',               trangCol: 8,  type: 'number' },
  { key: 'Thưởng COM',       bqHeader: 'Thưởng COM',                       trangCol: 9,  type: 'number' },
  { key: 'Bảo hiểm',         bqHeader: 'Bảo hiểm',                         trangCol: 10, type: 'number', note: 'BQ giờ = mức đóng BH×10.5% (Chung fix — nên khớp Trang)' },
  { key: 'Ăn trưa',          bqHeader: 'Hỗ trợ ăn trưa',                   trangCol: 12, type: 'number' },
  { key: 'Máy tính',         bqHeader: 'Tiền hỗ trợ máy tính',             trangCol: 13, type: 'number' },
  { key: 'Xe + PC',           bqHeader: 'Hỗ trợ tiền xe + PC trách nhiệm',  trangCol: 14, type: 'number' },
  { key: 'Bù tiền',          bqHeader: 'Bù tiền',                           trangCol: 16, type: 'number', note: 'Input-only, BQ = 0 nếu chưa điền' },
  { key: 'Tổng lương',       bqHeader: 'Tổng lương',                       trangCol: 5,  type: 'number', note: 'Phụ thuộc thuế — lệch nếu thuế lệch' },
  { key: 'Khấu trừ thuế',    bqHeader: 'Khấu trừ thuế',                    trangCol: 15, type: 'number', note: 'BQ=lũy tiến (đúng luật), Trang=flat 10% → Chính thức sẽ lệch' },
  { key: 'Tổng lương+thưởng',bqHeader: 'Tổng lương + thưởng (Net)',        trangCol: 4,  type: 'number', note: 'Phụ thuộc thuế — lệch nếu thuế lệch' },
];

// Menu item đã thêm trong BangLuong.gs → onOpen() → '📊 Đối soát với bảng Trang'
// Hoặc chạy trực tiếp: chọn hàm doiSoatLuong() → Run

function doiSoatLuong() {
  const ss  = SpreadsheetApp.getActiveSpreadsheet();
  const ui  = SpreadsheetApp.getUi();

  // --- 1. Đọc tab "Đối chiếu Trang" ---
  const trangSheet = ss.getSheetByName(DS_CFG.trangTab);
  if (!trangSheet) {
    ui.alert('Thiếu tab "' + DS_CFG.trangTab + '".\n\nTạo tab mới, paste dữ liệu xlsx chị Trang vào rồi chạy lại.');
    return;
  }
  const trangData = trangSheet.getDataRange().getValues();
  const trangMap  = parseTrangData_(trangData);

  // --- 2. Đọc tab "Bảng lương" ---
  const bqSheet = ss.getSheetByName(DS_CFG.bqTab);
  if (!bqSheet) {
    ui.alert('Thiếu tab "' + DS_CFG.bqTab + '". Chạy BangLuong.gs trước.');
    return;
  }
  const bqData    = bqSheet.getDataRange().getValues();
  const bqHeaders = bqData[0];
  const bqMap     = parseBQData_(bqData, bqHeaders);

  // --- 3. So sánh ---
  const result = compare_(bqMap, trangMap, bqHeaders);

  // --- 4. Xuất báo cáo ---
  writeReport_(ss, result, trangMap, bqMap);

  ss.toast(
    'Khớp ' + result.matchPct + '% (' + result.matchCount + '/' + result.totalCells + ' ô).\n' +
    'Xem tab "' + DS_CFG.outTab + '".',
    'Đối soát xong', 10
  );
}

// =====================================================================
// PARSE
// =====================================================================

function parseTrangData_(data) {
  var map = {};
  for (var i = 0; i < data.length; i++) {
    var code = String(data[i][1] || '').trim();
    if (!code.match(/^HN\d+$/)) continue;
    map[code] = {
      row:   i,
      name:  String(data[i][2] || ''),
      chuc_danh: String(data[i][3] || ''),
      values: {},
    };
    for (var c = 0; c < COMPARE_COLS.length; c++) {
      var col = COMPARE_COLS[c];
      var val = data[i][col.trangCol];
      map[code].values[col.key] = toNum_(val);
    }
  }
  return map;
}

function parseBQData_(data, headers) {
  var codeIdx = -1;
  var nameIdx = -1;
  var colIdx  = {};

  for (var h = 0; h < headers.length; h++) {
    var hdr = String(headers[h]).trim();
    if (hdr === 'Mã NV')  codeIdx = h;
    if (hdr === 'Name')    nameIdx = h;
    for (var c = 0; c < COMPARE_COLS.length; c++) {
      if (hdr === COMPARE_COLS[c].bqHeader) {
        colIdx[COMPARE_COLS[c].key] = h;
      }
    }
  }

  if (codeIdx < 0) throw new Error('Không tìm thấy cột "Mã NV" trên tab ' + DS_CFG.bqTab);

  var map = {};
  for (var i = 1; i < data.length; i++) {
    var code = String(data[i][codeIdx] || '').trim();
    if (!code.match(/^HN\d+$/)) continue;
    if (map[code]) {
      map[code].duplicate = true;
      continue;
    }
    map[code] = {
      row:   i,
      name:  String(data[i][nameIdx] || ''),
      values: {},
      duplicate: false,
    };
    for (var key in colIdx) {
      map[code].values[key] = toNum_(data[i][colIdx[key]]);
    }
  }
  return map;
}

// =====================================================================
// COMPARE
// =====================================================================

function compare_(bqMap, trangMap, bqHeaders) {
  var allCodes = {};
  for (var c in bqMap)    allCodes[c] = true;
  for (var c in trangMap) allCodes[c] = true;
  var codes = Object.keys(allCodes).sort();

  var rows       = [];
  var matchCount = 0;
  var diffCount  = 0;
  var totalCells = 0;
  var colStats   = {};

  for (var ci = 0; ci < COMPARE_COLS.length; ci++) {
    colStats[COMPARE_COLS[ci].key] = { match: 0, diff: 0, total: 0, totalDiff: 0 };
  }

  for (var i = 0; i < codes.length; i++) {
    var code = codes[i];
    var bq   = bqMap[code];
    var tr   = trangMap[code];

    var row = {
      code:     code,
      bqName:   bq ? bq.name : '',
      trName:   tr ? tr.name : '',
      status:   '',
      cells:    [],
      duplicate: bq ? bq.duplicate : false,
    };

    if (!bq) {
      row.status = 'CHỈ CÓ TRONG XLSX TRANG';
      rows.push(row);
      continue;
    }
    if (!tr) {
      row.status = 'CHỈ CÓ TRONG BQ';
      rows.push(row);
      continue;
    }

    var rowMatch = 0;
    var rowTotal = 0;

    for (var ci = 0; ci < COMPARE_COLS.length; ci++) {
      var col   = COMPARE_COLS[ci];
      var bqVal = bq.values[col.key] || 0;
      var trVal = tr.values[col.key] || 0;

      // Trang ghi BH + Khấu trừ thuế là số âm (trừ vào lương)
      if (col.key === 'Bảo hiểm') trVal = Math.abs(trVal);
      if (col.key === 'Khấu trừ thuế') trVal = Math.abs(trVal);

      var tol     = col.tol || 1;
      // Cột tiền (tol >= 1): làm tròn cả 2 bên về đồng chẵn — khử nhiễu số lẻ (tntt×5%, LCB/ngày công).
      // Cột Công (tol 0.01) KHÔNG làm tròn vì có thể là nửa ngày (23.5).
      if (tol >= 1) { bqVal = Math.round(bqVal); trVal = Math.round(trVal); }
      var diff    = bqVal - trVal;
      var pctDiff = (trVal !== 0) ? Math.abs(diff / trVal * 100) : (bqVal !== 0 ? 100 : 0);
      var isMatch = Math.abs(diff) <= tol;

      row.cells.push({
        key:     col.key,
        bq:      bqVal,
        trang:   trVal,
        diff:    diff,
        pctDiff: pctDiff,
        match:   isMatch,
        note:    col.note || '',
      });

      totalCells++;
      rowTotal++;
      colStats[col.key].total++;
      if (isMatch) { matchCount++; rowMatch++; colStats[col.key].match++; }
      else { diffCount++; colStats[col.key].diff++; colStats[col.key].totalDiff += Math.abs(diff); }
    }

    row.status = (rowMatch === rowTotal) ? 'KHỚP 100%' : 'LỆCH ' + (rowTotal - rowMatch) + '/' + rowTotal + ' cột';
    rows.push(row);
  }

  return {
    rows:       rows,
    matchCount: matchCount,
    diffCount:  diffCount,
    totalCells: totalCells,
    matchPct:   totalCells > 0 ? Math.round(matchCount / totalCells * 100) : 0,
    colStats:   colStats,
    bqCount:    Object.keys(bqMap).length,
    trangCount: Object.keys(trangMap).length,
  };
}

// =====================================================================
// REPORT
// =====================================================================

function writeReport_(ss, result, trangMap, bqMap) {
  var sh = ss.getSheetByName(DS_CFG.outTab);
  if (sh) sh.clear(); else sh = ss.insertSheet(DS_CFG.outTab);

  var GREEN  = '#C6EFCE';
  var RED    = '#FFC7CE';
  var YELLOW = '#FFEB9C';
  var BLUE   = '#D6E4F0';
  var WHITE  = '#FFFFFF';
  var HEADER = '#1a3c5e';

  var r = 1;

  // --- HEADER ---
  sh.getRange(r, 1).setValue('BÁO CÁO ĐỐI SOÁT LƯƠNG')
    .setFontWeight('bold').setFontSize(14).setFontColor('white');
  sh.getRange(r, 1, 1, 6).setBackground(HEADER);
  r++;

  sh.getRange(r, 1).setValue('Ngày chạy:');
  sh.getRange(r, 2).setValue(new Date()).setNumberFormat('dd/MM/yyyy HH:mm');
  r++;
  sh.getRange(r, 1).setValue('NV trong BQ:');
  sh.getRange(r, 2).setValue(result.bqCount);
  sh.getRange(r, 3).setValue('NV trong xlsx Trang:');
  sh.getRange(r, 4).setValue(result.trangCount);
  r++;
  sh.getRange(r, 1).setValue('TỶ LỆ KHỚP:');
  sh.getRange(r, 2).setValue(result.matchPct + '%')
    .setFontWeight('bold').setFontSize(13)
    .setFontColor(result.matchPct >= 90 ? '#16A34A' : result.matchPct >= 70 ? '#D97706' : '#DC2626');
  sh.getRange(r, 3).setValue('(' + result.matchCount + '/' + result.totalCells + ' ô)');
  r += 2;

  // --- BẢNG 1: THỐNG KÊ THEO CỘT ---
  sh.getRange(r, 1).setValue('THỐNG KÊ THEO CỘT').setFontWeight('bold').setFontSize(11);
  r++;
  var colHeaders = ['Cột', 'Khớp', 'Lệch', 'Tổng', '% Khớp', 'Tổng chênh lệch', 'Ghi chú'];
  sh.getRange(r, 1, 1, colHeaders.length).setValues([colHeaders])
    .setFontWeight('bold').setBackground(BLUE);
  r++;

  for (var ci = 0; ci < COMPARE_COLS.length; ci++) {
    var col  = COMPARE_COLS[ci];
    var stat = result.colStats[col.key];
    var pct  = stat.total > 0 ? Math.round(stat.match / stat.total * 100) : 0;
    var row  = [col.key, stat.match, stat.diff, stat.total, pct + '%', stat.totalDiff, col.note || ''];
    sh.getRange(r, 1, 1, row.length).setValues([row]);
    sh.getRange(r, 5).setBackground(pct === 100 ? GREEN : pct >= 80 ? YELLOW : RED);
    sh.getRange(r, 6).setNumberFormat('#,##0');
    r++;
  }
  r++;

  // --- BẢNG 2: CHI TIẾT TỪNG NV ---
  sh.getRange(r, 1).setValue('CHI TIẾT TỪNG NHÂN VIÊN').setFontWeight('bold').setFontSize(11);
  r++;

  // Sub-header
  var detailHeaders = ['Mã NV', 'Tên (BQ)', 'Tên (Trang)', 'Trạng thái'];
  for (var ci = 0; ci < COMPARE_COLS.length; ci++) {
    detailHeaders.push(COMPARE_COLS[ci].key + ' (BQ)');
    detailHeaders.push(COMPARE_COLS[ci].key + ' (Trang)');
    detailHeaders.push('Chênh lệch');
  }
  sh.getRange(r, 1, 1, detailHeaders.length).setValues([detailHeaders])
    .setFontWeight('bold').setBackground(BLUE).setFontSize(8);
  sh.setFrozenRows(r);
  r++;

  // Data rows
  for (var i = 0; i < result.rows.length; i++) {
    var row = result.rows[i];
    var vals = [row.code, row.bqName, row.trName, row.status];

    for (var ci = 0; ci < row.cells.length; ci++) {
      var cell = row.cells[ci];
      vals.push(cell.bq);
      vals.push(cell.trang);
      vals.push(cell.diff);
    }

    if (row.cells.length === 0) {
      for (var ci = 0; ci < COMPARE_COLS.length; ci++) {
        vals.push(''); vals.push(''); vals.push('');
      }
    }

    sh.getRange(r, 1, 1, vals.length).setValues([vals]);

    // Color status
    if (row.status === 'KHỚP 100%') {
      sh.getRange(r, 4).setBackground(GREEN);
    } else if (row.status.indexOf('CHỈ') >= 0) {
      sh.getRange(r, 4).setBackground(YELLOW);
    } else {
      sh.getRange(r, 4).setBackground(RED);
    }

    // Color diff cells
    for (var ci = 0; ci < row.cells.length; ci++) {
      var diffCol = 4 + ci * 3 + 3; // column of "Chênh lệch"
      var fmt = (row.cells[ci] && row.cells[ci].key === 'Công') ? '0.#' : '#,##0';
      if (row.cells[ci] && !row.cells[ci].match) {
        sh.getRange(r, diffCol).setBackground(RED).setNumberFormat(fmt);
        sh.getRange(r, diffCol - 2).setNumberFormat(fmt);
        sh.getRange(r, diffCol - 1).setNumberFormat(fmt);
      } else {
        sh.getRange(r, diffCol).setNumberFormat(fmt);
        sh.getRange(r, diffCol - 2).setNumberFormat(fmt);
        sh.getRange(r, diffCol - 1).setNumberFormat(fmt);
      }
    }

    if (row.duplicate) {
      sh.getRange(r, 1).setBackground(YELLOW).setNote('⚠ Mã NV trùng trong BQ');
    }

    r++;
  }

  // --- BẢNG 3: TÓM TẮT SAI LỆCH QUAN TRỌNG ---
  r++;
  sh.getRange(r, 1).setValue('SAI LỆCH QUAN TRỌNG (chênh > 100,000đ)').setFontWeight('bold').setFontSize(11);
  r++;
  var bigHeaders = ['Mã NV', 'Tên', 'Cột', 'BQ', 'Trang', 'Chênh lệch', '% Chênh', 'Ghi chú'];
  sh.getRange(r, 1, 1, bigHeaders.length).setValues([bigHeaders])
    .setFontWeight('bold').setBackground(BLUE);
  r++;

  var bigDiffs = [];
  for (var i = 0; i < result.rows.length; i++) {
    var row = result.rows[i];
    for (var ci = 0; ci < row.cells.length; ci++) {
      var cell = row.cells[ci];
      if (Math.abs(cell.diff) > 100000) {
        bigDiffs.push({
          code:    row.code,
          name:    row.bqName || row.trName,
          key:     cell.key,
          bq:      cell.bq,
          trang:   cell.trang,
          diff:    cell.diff,
          pctDiff: cell.pctDiff,
          note:    cell.note,
        });
      }
    }
  }

  bigDiffs.sort(function(a, b) { return Math.abs(b.diff) - Math.abs(a.diff); });

  for (var i = 0; i < bigDiffs.length; i++) {
    var d = bigDiffs[i];
    sh.getRange(r, 1, 1, 8).setValues([[
      d.code, d.name, d.key, d.bq, d.trang, d.diff,
      Math.round(d.pctDiff) + '%', d.note
    ]]);
    sh.getRange(r, 4, 1, 3).setNumberFormat('#,##0');
    sh.getRange(r, 6).setBackground(RED);
    r++;
  }

  if (bigDiffs.length === 0) {
    sh.getRange(r, 1).setValue('Không có sai lệch > 100,000đ 🎉').setFontColor('#16A34A');
    r++;
  }

  // --- Format ---
  sh.autoResizeColumns(1, Math.min(detailHeaders.length, 25));
  sh.setColumnWidth(1, 80);
}

// =====================================================================
// HELPERS
// =====================================================================

function toNum_(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v;
  var s = String(v).replace(/[,\s]/g, '').replace(/^-/, '');
  var n = parseFloat(s);
  if (isNaN(n)) return 0;
  return String(v).trim().charAt(0) === '-' ? -n : n;
}
