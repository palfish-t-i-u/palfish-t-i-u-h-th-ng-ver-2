/**
 * PalFish — XEM TRƯỚC PHIẾU LƯƠNG (G3-T8 preview server)
 *
 * Quy tắc an toàn:
 *   - KHÔNG ghi gì vào sheet.
 *   - KHÔNG trả Date object qua google.script.run — mọi return qua plSerialize_().
 *   - KHÔNG truyền row index qua ranh giới client/server — chỉ dùng code (Mã NV).
 *   - pvBanDaGui chỉ gọi lười (khi bấm nút "Bản đã gửi").
 *
 * Phụ thuộc (cùng Apps Script project):
 *   BangLuong.gs      — COLS, plAssertHeadersUnique_
 *   PhieuLuongGate.gs — GATE_COLS, GATE_CFG, kyLuongHienTai_, gOutboxIndex_
 *   PhongBanXuat.gs   — plSerialize_, gSkipCols_
 */

/* ======== CONFIG ======== */

var PV_DOC_ID = '1Jd0TvdJvh7EwsqvPXKyEoLdCDQHXXC_hjmS0TzIN3hs'; // Doc mẫu phiếu lương
// Điền từ G3-S4 sau khi đọc tag Doc thật
var PV_TAG_ALIAS = {
  'Họ tên': 'Name',
  'Bảo hiểm + note': 'Bảo hiểm',
  'Tổng lương + thưởng': 'Tổng lương + thưởng (Net)',
  'Khấu trừ thuế tháng 05': 'Khấu trừ thuế',
  'Khấu trừ thuế tháng 07': 'Khấu trừ thuế',
};

// Keys to keep decimal (sync with formatValue in PayslipDetail.tsx)
var PV_KEEP_DECIMAL_ = { 'Công': true, 'Tỉ lệ đạt KPI': true, '% Com ≥100%': true };

// Sentinel: caller must filter out rows where pvFmt_ returns this value
var PV_BO_DONG_ = '__BO_DONG__';

/* ======== FORMAT ======== */

/**
 * Format a single cell value for display — sync with formatValue in PayslipDetail.tsx.
 * Returns PV_BO_DONG_ when value is empty/null — caller must skip the row.
 */
function pvFmt_(val, key) {
  if (val === '' || val === null || val === undefined) return PV_BO_DONG_;
  if (val instanceof Date) return Utilities.formatDate(val, 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy');
  if (typeof val === 'number') {
    if (PV_KEEP_DECIMAL_[key]) return val.toLocaleString('vi-VN');
    return val.toLocaleString('vi-VN', { maximumFractionDigits: 0 });
  }
  return String(val);
}

/* ======== DOC TAGS ======== */

/**
 * Scan the Doc template for <<tag>> placeholders in body, header, and footer.
 * Returns {tags: string[], ok: boolean, tagNguon: string}.
 * On error returns {tags: [], ok: false, tagNguon: error message}.
 */
function pvDocTags_() {
  try {
    var doc = DocumentApp.openById(PV_DOC_ID);
    var tags = [];
    var re = /<<([^>]+)>>/g;
    var m;

    // Scan body (mandatory — always present)
    var bodyText = doc.getBody().getText();
    while ((m = re.exec(bodyText)) !== null) tags.push(m[1].trim());

    // Scan header (may be null if Doc has no header)
    try {
      var hdr = doc.getHeader();
      if (hdr) {
        var ht = hdr.getText();
        re.lastIndex = 0;
        while ((m = re.exec(ht)) !== null) tags.push(m[1].trim());
      }
    } catch (e) { /* no header — ok */ }

    // Scan footer (may be null if Doc has no footer)
    try {
      var ftr = doc.getFooter();
      if (ftr) {
        var ft = ftr.getText();
        re.lastIndex = 0;
        while ((m = re.exec(ft)) !== null) tags.push(m[1].trim());
      }
    } catch (e) { /* no footer — ok */ }

    return { tags: tags, ok: true, tagNguon: 'ok' };
  } catch (e) {
    return { tags: [], ok: false, tagNguon: String(e) };
  }
}

/* ======== PURE BUILDER ======== */

/**
 * Pure function — no I/O.
 *
 * Maps Doc template tags to sheet columns and assembles display rows.
 *
 * @param {string[]}  tags    - Ordered tag list from pvDocTags_() (may be empty = fallback)
 * @param {Object}    alias   - PV_TAG_ALIAS: map tag → column header label
 * @param {string[]}  headers - Sheet row 1 values (trimmed)
 * @param {Array}     vals    - Sheet data row (same length as headers)
 * @returns {{dong, conLai, moCoi, boTrong, fallback}}
 *
 * Invariant: |dong| + |conLai| + |boTrong| + 5 === COLS.length
 *   (5 = number of gate cols; they never appear in any output bucket)
 */
function pvDungPhieu_(tags, alias, headers, vals) {
  // Build set of cols to skip entirely (gate cols — never rendered)
  var SKIP = {};
  GATE_COLS.forEach(function (h) { SKIP[h] = true; });

  // Build lookup: header label → 0-based index in headers/vals
  var hIdx = {};
  for (var i = 0; i < headers.length; i++) {
    if (headers[i]) hIdx[String(headers[i]).trim()] = i;
  }

  var dong = [], conLai = [], moCoi = [], boTrong = 0, usedCols = {};

  // --- FALLBACK MODE: tags empty (Doc unreadable or not yet configured) ---
  if (!tags || tags.length === 0) {
    for (var c = 0; c < COLS.length; c++) {
      var col = COLS[c];
      if (SKIP[col.h]) continue;
      var idx = hIdx[col.h];
      var v = (idx !== undefined) ? vals[idx] : undefined;
      if (v === '' || v === null || v === undefined) { boTrong++; continue; }
      dong.push({ key: col.key, label: col.h, val: v });
    }
    return { dong: dong, conLai: [], moCoi: [], boTrong: boTrong, fallback: true };
  }

  // --- NORMAL MODE: follow tag order from Doc ---
  for (var t = 0; t < tags.length; t++) {
    var tag = tags[t];
    var colLabel = (alias && alias[tag]) ? alias[tag] : tag;
    if (!(colLabel in hIdx)) { moCoi.push(tag); continue; }
    var colIdx = hIdx[colLabel];
    if (SKIP[colLabel]) continue; // gate col somehow tagged in Doc — skip silently
    // Find COLS entry for this header (for key lookup)
    var col2 = null;
    for (var ci = 0; ci < COLS.length; ci++) { if (COLS[ci].h === colLabel) { col2 = COLS[ci]; break; } }
    var v2 = vals[colIdx];
    if (v2 === '' || v2 === null || v2 === undefined) { boTrong++; usedCols[colLabel] = true; continue; }
    dong.push({ key: (col2 ? col2.key : colLabel), label: tag, val: v2 });
    usedCols[colLabel] = true;
  }

  // --- conLai: cols in COLS not covered by any tag ---
  for (var c2 = 0; c2 < COLS.length; c2++) {
    var col3 = COLS[c2];
    if (SKIP[col3.h]) continue;        // gate cols: skip entirely
    if (usedCols[col3.h]) continue;    // already in dong
    var idx3 = hIdx[col3.h];
    var v3 = (idx3 !== undefined) ? vals[idx3] : undefined;
    if (v3 === '' || v3 === null || v3 === undefined) { boTrong++; continue; }
    conLai.push({ key: col3.key, label: col3.h, val: v3 });
  }

  return { dong: dong, conLai: conLai, moCoi: moCoi, boTrong: boTrong, fallback: false };
}

/* ======== SERVER FUNCTIONS (called from client via google.script.run) ======== */

/**
 * Primary data load — called once when modal opens.
 * Reads the entire main sheet in ONE getValues() call.
 * Reads _outbox cols 1-6 only (NOT payload_json — lazy-loaded by pvBanDaGui).
 *
 * Returns serialized object (all values safe for google.script.run):
 *   {ky, tags, tagsOk, tagNguon, alias, danhSach, duLieu, daGuiIndex}
 */
function pvNapDuLieu() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var main = ss.getSheetByName(GATE_CFG.mainSheet);
  if (!main) throw 'Không tìm thấy tab "' + GATE_CFG.mainSheet + '".';

  var lastRow = main.getLastRow();
  var lastCol = main.getLastColumn();
  if (lastRow < 2) return plSerialize_({ ky: kyLuongHienTai_(), tags: [], tagsOk: false, tagNguon: 'Bảng rỗng', alias: PV_TAG_ALIAS, danhSach: [], duLieu: {}, daGuiIndex: {} });

  // ONE getValues() for the entire table
  var allVals = main.getRange(1, 1, lastRow, lastCol).getValues();
  var headers = allVals[0].map(function (h) { return String(h || '').trim(); });

  // Read Doc tags
  var tagResult = pvDocTags_();

  // Read _outbox cols 1-6 only (id, code, name, ky, stage, status) — NOT payload_json
  var daGuiIndex = {};
  var outboxSh = ss.getSheetByName('_outbox');
  if (outboxSh && outboxSh.getLastRow() > 1) {
    var outboxVals = outboxSh.getRange(2, 1, outboxSh.getLastRow() - 1, 6).getValues();
    outboxVals.forEach(function (row) {
      var id = String(row[0] || '').trim();
      var status = String(row[5] || '').trim();
      var stage = String(row[4] || '').trim();
      var sentAt = row[3] || '';
      if (id) daGuiIndex[id] = { status: status, stage: stage, sentAt: sentAt };
    });
  }

  // Pre-compute header → index map for name/code lookups
  var codeColIdx = headers.indexOf('Mã NV');
  var nameColIdx = headers.indexOf('Họ và tên') >= 0 ? headers.indexOf('Họ và tên') : headers.indexOf('Name');

  // Build danhSach and duLieu
  var danhSach = [];
  var duLieu = {};

  for (var r = 1; r < allVals.length; r++) {
    var rowVals = allVals[r];
    var code = codeColIdx >= 0 ? String(rowVals[codeColIdx] || '').trim() : '';
    if (!code) continue;
    var name = nameColIdx >= 0 ? String(rowVals[nameColIdx] || '').trim() : '';
    danhSach.push({ code: code, name: name });

    var phieu = pvDungPhieu_(tagResult.tags, PV_TAG_ALIAS, headers, rowVals);

    // Serialize each display row — filter out PV_BO_DONG_ sentinel
    phieu.dong = phieu.dong
      .map(function (d) { return { key: d.key, label: d.label, val: pvFmt_(d.val, d.key) }; })
      .filter(function (d) { return d.val !== PV_BO_DONG_; });

    phieu.conLai = phieu.conLai
      .map(function (d) { return { key: d.key, label: d.label, val: pvFmt_(d.val, d.key) }; })
      .filter(function (d) { return d.val !== PV_BO_DONG_; });

    duLieu[code] = phieu;
  }

  var ky = kyLuongHienTai_();
  return plSerialize_({
    ky: ky,
    tags: tagResult.tags,
    tagsOk: tagResult.ok,
    tagNguon: tagResult.tagNguon,
    alias: PV_TAG_ALIAS,
    danhSach: danhSach,
    duLieu: duLieu,
    daGuiIndex: daGuiIndex,
  });
}

/**
 * Lazy load — called only when user clicks "Bản đã gửi".
 * Reads exactly 1 cell (payload_json) from _outbox for the given id.
 *
 * @param {string} id - Format: "code|ky|stage" (e.g. "HN0001|2026-07|truoc_thue")
 * @returns serialized {phieu, status, sentAt} or null if not found.
 */
function pvBanDaGui(id) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var outboxSh = ss.getSheetByName('_outbox');
  if (!outboxSh) return null;

  // Use gOutboxIndex_ from PhieuLuongGate.gs (Gate:367)
  var idx = gOutboxIndex_(outboxSh);
  var entry = idx[String(id || '')];
  if (!entry) return null;
  var rowNum = entry.row;

  // Find payload_json column position
  var hdrs = outboxSh.getRange(1, 1, 1, outboxSh.getLastColumn()).getValues()[0];
  var pjCol = -1, statusCol = -1, sentAtCol = -1;
  for (var i = 0; i < hdrs.length; i++) {
    var h = String(hdrs[i] || '').trim();
    if (h === 'payload_json') pjCol = i + 1;
    if (h === 'status')       statusCol = i + 1;
    if (h === 'sent_at')      sentAtCol = i + 1;
  }
  if (pjCol < 1) return null;

  var payloadStr = outboxSh.getRange(rowNum, pjCol).getValue();
  var status = statusCol > 0 ? String(outboxSh.getRange(rowNum, statusCol).getValue() || '') : '';
  var sentAt = sentAtCol > 0 ? outboxSh.getRange(rowNum, sentAtCol).getValue() : '';

  try {
    var parsed = JSON.parse(payloadStr || '{}');
    var phieu = parsed.phieu || {};
    return plSerialize_({ phieu: phieu, status: status, sentAt: sentAt });
  } catch (e) {
    return plSerialize_({ phieu: {}, status: 'error', sentAt: '' });
  }
}

/**
 * Xuất PDF 1 phiếu lương. Gọi từ client qua google.script.run.
 *
 * Luồng: copy Doc mẫu → replaceText tất cả tag → export PDF → trả data URI.
 * File tạm bị trash trong finally.
 *
 * @param {string} code - Mã NV (vd "HN0001")
 * @returns {Object} plSerialize_({filename, dataUri}) hoặc {error}
 */
function pvTaiPDF(code) {
  if (!code) return plSerialize_({ error: 'Thiếu mã NV.' });

  var copyId = null;
  try {
    // 1. Đọc bảng lương — lấy row theo code
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var main = ss.getSheetByName(GATE_CFG.mainSheet);
    if (!main) throw 'Không tìm thấy tab "' + GATE_CFG.mainSheet + '".';
    var lastRow = main.getLastRow();
    if (lastRow < 2) throw 'Bảng lương rỗng.';
    var allVals = main.getRange(1, 1, lastRow, main.getLastColumn()).getValues();
    var headers = allVals[0].map(function(h) { return String(h || '').trim(); });

    var codeIdx = headers.indexOf('Mã NV');
    if (codeIdx < 0) throw 'Không tìm thấy cột "Mã NV".';

    var rowVals = null;
    for (var r = 1; r < allVals.length; r++) {
      if (String(allVals[r][codeIdx] || '').trim() === code) { rowVals = allVals[r]; break; }
    }
    if (!rowVals) return plSerialize_({ error: 'Không tìm thấy NV "' + code + '".' });

    // 2. Đọc tên NV
    var nameIdx = headers.indexOf('Họ và tên');
    if (nameIdx < 0) nameIdx = headers.indexOf('Name');
    var nvName = nameIdx >= 0 ? String(rowVals[nameIdx] || '').trim() : code;

    // 3. Build map: tag → formatted value
    // Đọc tag từ Doc, map qua alias, lấy giá trị từ rowVals
    var tagMap = {};  // tag string → formatted value string

    // Build header → index
    var hIdx = {};
    for (var i = 0; i < headers.length; i++) {
      if (headers[i]) hIdx[headers[i]] = i;
    }

    // Đọc Doc tags
    var tagResult = pvDocTags_();
    var tags = tagResult.tags || [];

    // Map mỗi tag → giá trị
    for (var t = 0; t < tags.length; t++) {
      var tag = tags[t];
      var colLabel = (PV_TAG_ALIAS[tag]) ? PV_TAG_ALIAS[tag] : tag;
      if (!(colLabel in hIdx)) {
        tagMap[tag] = '';  // tag mồ côi → xoá khỏi Doc
        continue;
      }
      var val = rowVals[hIdx[colLabel]];
      var fmt = pvFmt_(val, tag);
      tagMap[tag] = (fmt === '__BO_DONG__') ? '' : fmt;
    }

    // 4. Copy Doc mẫu → replaceText
    var origDoc = DriveApp.getFileById(PV_DOC_ID);
    var copy = origDoc.makeCopy('__PL_TMP_pdf_' + code);
    copyId = copy.getId();

    var doc = DocumentApp.openById(copyId);
    var body = doc.getBody();
    var header = null;
    var footer = null;
    try { header = doc.getHeader(); } catch(e) {}
    try { footer = doc.getFooter(); } catch(e) {}

    for (var tag2 in tagMap) {
      if (!tagMap.hasOwnProperty(tag2)) continue;
      // Java regex \Q...\E: mọi ký tự giữa \Q và \E đều là literal — an toàn với +, ?, *, v.v.
      var pattern = '<<\\Q' + tag2 + '\\E>>';
      var replacement = tagMap[tag2];
      body.replaceText(pattern, replacement);
      if (header) header.replaceText(pattern, replacement);
      if (footer) footer.replaceText(pattern, replacement);
    }

    doc.saveAndClose();

    // 5. Export PDF
    var pdfBlob = DriveApp.getFileById(copyId).getAs('application/pdf');
    var ky = typeof kyLuongHienTai_ === 'function' ? kyLuongHienTai_() : '';
    var filename = 'PhieuLuong_' + ky + '_' + code + '.pdf';
    pdfBlob.setName(filename);

    var b64 = Utilities.base64Encode(pdfBlob.getBytes());
    var dataUri = 'data:application/pdf;base64,' + b64;

    return plSerialize_({ filename: filename, dataUri: dataUri });

  } finally {
    // 6. Dọn file tạm
    if (copyId) {
      try { DriveApp.getFileById(copyId).setTrashed(true); } catch(e) {}
    }
  }
}

/* ======== MENU ENTRY POINT ======== */

/**
 * Menu: opens the preview modal. Validates headers first.
 * Passes the Mã NV of the currently selected row to the modal as initialCode.
 * Falls back gracefully (no alert) if the selected row has no Mã NV.
 */
function xemTruocPhieuLuong() {
  plAssertHeadersUnique_(COLS.map(function (c) { return c.h; }));

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var main = ss.getSheetByName(GATE_CFG.mainSheet);
  var code = '';

  try {
    var activeRange = ss.getActiveRange();
    if (activeRange) {
      var row = activeRange.getRow();
      if (row >= 2 && main) {
        var hdrs = main.getRange(1, 1, 1, main.getLastColumn()).getValues()[0];
        var codeCol = -1;
        for (var i = 0; i < hdrs.length; i++) { if (String(hdrs[i] || '').trim() === 'Mã NV') { codeCol = i + 1; break; } }
        if (codeCol > 0) code = String(main.getRange(row, codeCol).getValue() || '').trim();
      }
    }
  } catch (e) { /* no active range — ok, dialog defaults to first in list */ }

  var tpl = HtmlService.createTemplateFromFile('Xem trước phiếu lương');
  tpl.initialCode = code;
  var html = tpl.evaluate()
    .setWidth(900)
    .setHeight(640)
    .setTitle('Xem trước phiếu lương');
  ss.show(html);
}
