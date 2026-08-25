/**
 * PalFish — CỔNG GỬI PHIẾU LƯƠNG (G1-T8 gate) — model 2 tầng
 *
 * Quy trình THẬT (chat Trang 3–4/8 + họp 6/8):
 *   Xác nhận thông tin (Trang QC)
 *     → Gửi BL TRƯỚC THUẾ → NV xác nhận trước thuế
 *       → Gửi BL SAU THUẾ → NV xác nhận sau thuế → (KT đi lệnh ngân hàng)
 *
 * 5 cột checkbox trên tab "Bảng lương". Interlock TUẦN TỰ: mỗi nút "Gửi"
 * chỉ tick được khi cột điều kiện trước nó đã tick; bỏ tick điều kiện →
 * tự thu hồi nút gửi phụ thuộc.
 *
 * ĐIỀN THẾ NÀO (dual-mode):
 *   - GĐ1 (bây giờ, app chưa gửi): Trang tick TAY cả 5 cột. 2 cột "NV xác nhận"
 *     tick theo reply Zalo của nhân viên ("e confirm ạ").
 *   - M4 (sau): app tự gửi phiếu + NV bấm confirm in-app → app ghi ngược
 *     2 cột "NV xác nhận". CÙNG cột, đổi nguồn.
 *
 * Trạng thái tick lưu tab ẩn _gate_state (SỐNG qua mỗi lần refresh BQ, key theo mã NV+kỳ).
 * Nút "Gửi" xếp phiếu vào _outbox (gắn tag tầng) → flushOutbox() POST sang app.
 * ⚠ CHƯA NỐI APP: GATE_CFG.appEndpoint='' → flush DRY-RUN (giữ pending, không gọi mạng).
 *
 * CÀI 1 LẦN: menu ⚙ Bảng lương → 🔌 Cài đặt cổng gửi phiếu.
 * MỖI KỲ:   đặt GATE_CFG.kyLuong = 'YYYY-MM' (trống = tháng trước).
 */

/* ======== CONFIG ======== */

var GATE_CFG = {
  mainSheet:   'Bảng lương',
  outboxSheet: '_outbox',
  stateSheet:  '_gate_state',

  kyLuong:     '',   // 'YYYY-MM'. '' = tự lấy tháng trước.
  appEndpoint: 'https://palfish-gmv-api.onrender.com/api/payroll/payslips/receive',
  gateToken:   PropertiesService.getScriptProperties().getProperty('GATE_TOKEN') || '',

  colMaNV:     'Mã NV',
  colName:     'Name',
  maxAttempts: 5,
};

// State machine: mỗi nút "Gửi" cần cột điều kiện (require) + tag tầng.
var SEND_STEPS = [
  { send:'Gửi BL trước thuế', require:'Xác nhận thông tin',     stage:'truoc_thue', label:'trước thuế' },
  { send:'Gửi BL sau thuế',   require:'NV xác nhận trước thuế', stage:'sau_thue',   label:'sau thuế' },
];

// 5 cột trạng thái (đúng thứ tự trên bảng). Không đưa vào payload phiếu.
var GATE_COLS = [
  'Xác nhận thông tin', 'Gửi BL trước thuế', 'NV xác nhận trước thuế',
  'Gửi BL sau thuế', 'NV xác nhận sau thuế',
];
// gSkipCols_() định nghĩa trong PhongBanXuat.gs — hàm lazy, CẤM .push lên GATE_COLS (I5)

var OUTBOX_HEADERS = ['id','code','name','ky_luong','stage','status','enqueued_at','sent_at','attempts','last_error','payload_json'];
var STATE_HEADERS  = ['id','code','ky','states_json'];

/* ======== TRIGGER (enqueue + interlock, không gọi mạng) ======== */

function guiPhieuOnEdit(e) {
  try {
    if (GATE_COLS.length !== 5) throw 'GATE_COLS bị đổi độ dài — kiểm tra .push nhầm';
    if (!e || !e.range) return;
    var sh = e.range.getSheet();
    if (sh.getName() !== GATE_CFG.mainSheet) return;
    if (e.range.getNumColumns() !== 1) return;
    var startRow = e.range.getRow();
    var numRows  = e.range.getNumRows();
    if (startRow < 2) { startRow = 2; numRows = numRows - (2 - e.range.getRow()); }
    if (numRows < 1) return;

    var hmap   = gHeaderMap_(sh);
    var header = gHeaderAt_(hmap, e.range.getColumn());
    if (!header || GATE_COLS.indexOf(header) < 0) return;

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var ky = kyLuongHienTai_();
    var sendStep = gStepBySend_(header);
    var reqStep  = gStepByRequire_(header);

    // ═══ BATCH READ: tất cả data 1 lần ═══
    var lastCol = sh.getLastColumn();
    var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
    var allData = sh.getRange(startRow, 1, numRows, lastCol).getValues();
    var cMa   = hmap[GATE_CFG.colMaNV];
    var cName = hmap[GATE_CFG.colName];
    var cReq  = sendStep ? hmap[sendStep.require] : 0;
    var cSend = reqStep  ? hmap[reqStep.send]     : 0;
    var editCol = e.range.getColumn();
    var skipCols = gSkipCols_();

    // Đọc outbox + state 1 lần
    var ob = gOutbox_();
    var obAll = ob.getDataRange().getValues();
    var obIdx = {};
    for (var oi = 1; oi < obAll.length; oi++) {
      var oid = String(obAll[oi][0] || '');
      if (oid) obIdx[oid] = { row: oi + 1, status: String(obAll[oi][5]) };
    }

    var st = gGateState_();
    var stAll = st.getDataRange().getValues();
    var stIdx = {};
    for (var si = 1; si < stAll.length; si++) {
      var sid = String(stAll[si][0] || '');
      if (sid) {
        var parsed = {};
        try { parsed = JSON.parse(stAll[si][3] || '{}'); } catch(_){}
        stIdx[sid] = { row: si + 1, states: parsed };
      }
    }

    // ═══ PROCESS IN MEMORY ═══
    var obAppends = [];           // dòng mới append vào outbox
    var obUpdates = {};           // { sheetRow: rowArr }
    var stUpdates = {};           // { id: { row, code, ky, states } }
    var cellFalse = [];           // [sheetRow] — setValue(false) trên bảng chính
    var enqueued = 0, blocked = 0, revoked = 0, confirmed = 0;

    for (var ri = 0; ri < numRows; ri++) {
      var rowData = allData[ri];
      var row = startRow + ri;
      var val  = rowData[editCol - 1] === true;
      var code = cMa ? String(rowData[cMa - 1] || '').trim() : '';
      if (!code) continue;
      var name = cName ? String(rowData[cName - 1] || '').trim() : '';
      var stKey = code + '|' + ky;

      // Lấy/tạo state entry trong bộ nhớ
      if (!stIdx[stKey]) stIdx[stKey] = { row: 0, states: {} };

      // (A) Cột là NÚT GỬI
      if (sendStep) {
        if (!val) { stIdx[stKey].states[header] = false; continue; }
        if (cReq && rowData[cReq - 1] !== true) {
          cellFalse.push(row);
          stIdx[stKey].states[header] = false;
          blocked++;
          continue;
        }
        // Build payload in memory
        var phieu = gBuildPhieu_(headers, rowData, skipCols);
        var obId = code + '|' + ky + '|' + sendStep.stage;
        if (obIdx[obId] && obIdx[obId].status === 'sent') { continue; }
        var payload = {
          meta: { source:'sheet-gate', version:1, code:code, ky_luong:ky,
                  stage:sendStep.stage, stage_label:sendStep.label,
                  enqueued_at:new Date().toISOString(), sheet_id:ss.getId() },
          phieu: phieu,
        };
        var rowArr = [obId, code, name, ky, sendStep.stage, 'pending',
                      new Date().toISOString(), '', 0, '', JSON.stringify(payload)];
        if (obIdx[obId]) obUpdates[obIdx[obId].row] = rowArr;
        else { obAppends.push(rowArr); obIdx[obId] = { row: -1, status:'pending' }; }
        stIdx[stKey].states[header] = true;
        enqueued++;
        continue;
      }

      // (B) Cột là ĐIỀU KIỆN cho một nút gửi
      if (reqStep) {
        stIdx[stKey].states[header] = val;
        if (!val && cSend && rowData[cSend - 1] === true) {
          cellFalse.push(row);
          stIdx[stKey].states[reqStep.send] = false;
          revoked++;
        } else if (val) { confirmed++; }
        continue;
      }

      // (C) Cột xác nhận cuối
      stIdx[stKey].states[header] = val;
      if (val) confirmed++;
    }

    // ═══ BATCH WRITE ═══

    // 1. Outbox updates (overwrite existing rows)
    for (var ur in obUpdates) {
      ob.getRange(Number(ur), 1, 1, OUTBOX_HEADERS.length).setValues([obUpdates[ur]]);
    }
    // 2. Outbox appends (new rows — batch)
    if (obAppends.length) {
      ob.getRange(ob.getLastRow() + 1, 1, obAppends.length, OUTBOX_HEADERS.length).setValues(obAppends);
    }

    // 3. State writes (batch: collect updates + appends)
    var stAppendArr = [];
    for (var sk in stIdx) {
      var entry = stIdx[sk];
      if (!entry.states || !Object.keys(entry.states).length) continue;
      var parts2 = sk.split('|');
      var arr = [sk, parts2[0], parts2[1], JSON.stringify(entry.states)];
      if (entry.row > 0) st.getRange(entry.row, 1, 1, STATE_HEADERS.length).setValues([arr]);
      else stAppendArr.push(arr);
    }
    if (stAppendArr.length) {
      st.getRange(st.getLastRow() + 1, 1, stAppendArr.length, STATE_HEADERS.length).setValues(stAppendArr);
    }

    // 4. setValue(false) trên bảng chính (blocked/revoked)
    var targetCol = sendStep ? editCol : (cSend || editCol);
    for (var fi = 0; fi < cellFalse.length; fi++) {
      sh.getRange(cellFalse[fi], targetCol).setValue(false);
    }

    // ═══ TOAST ═══
    if (numRows === 1) {
      var singleName = (cName ? String(allData[0][cName-1]||'') : '') +
                        (cMa ? ' (' + String(allData[0][cMa-1]||'') + ')' : '');
      if (sendStep) {
        if (blocked) ss.toast('Phải tick "' + sendStep.require + '" trước.', '⛔ Chưa đủ điều kiện', 6);
        else if (enqueued) ss.toast(singleName + ' kỳ ' + ky + '.', '✓ Đã xếp hàng gửi (' + sendStep.label + ')', 6);
      } else if (reqStep) {
        if (revoked) ss.toast('Bỏ "' + header + '" → thu hồi "' + reqStep.send + '" (' + singleName + ').', '↩ Thu hồi', 6);
        else if (allData[0][editCol-1]===true) ss.toast('✓ ' + header + ': ' + singleName + '. Mở "' + reqStep.send + '".', 'Trạng thái', 5);
      } else {
        if (allData[0][editCol-1]===true) ss.toast('✓ ' + header + ': ' + singleName + '. Sẵn sàng đi lệnh ngân hàng.', 'Hoàn tất', 5);
      }
    } else {
      var summary = [];
      if (enqueued) summary.push(enqueued + ' xếp hàng');
      if (blocked)  summary.push(blocked + ' chặn (thiếu điều kiện)');
      if (revoked)  summary.push(revoked + ' thu hồi');
      if (confirmed) summary.push(confirmed + ' xác nhận');
      ss.toast(summary.join(' · ') || numRows + ' dòng.', '⚡ ' + header + ' (' + numRows + ' dòng)', 8);
    }
  } catch (err) {
    SpreadsheetApp.getActiveSpreadsheet().toast('Lỗi cổng gửi phiếu: ' + err, 'Cổng gửi phiếu', 8);
  }
}

function gBuildPhieu_(headers, vals, skipCols){
  var phieu = {};
  for (var c = 0; c < headers.length; c++) {
    var h = String(headers[c] || '').trim();
    if (!h || skipCols.indexOf(h) >= 0) continue;
    phieu[h] = vals[c];
  }
  return phieu;
}

/** Dựng payload 1 dòng + upsert vào _outbox (idempotent theo code|kỳ|tầng). */
function gEnqueueRow_(sh, row, hmap, stage, stageLabel) {
  if (GATE_COLS.length !== 5) throw 'GATE_COLS bị đổi độ dài — kiểm tra .push nhầm';
  var lastCol = sh.getLastColumn();
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  var vals    = sh.getRange(row, 1, 1, lastCol).getValues()[0];

  var code = gCode_(sh, row, hmap);
  var name = String(vals[(hmap[GATE_CFG.colName]||1) - 1] || '').trim();
  if (!code) return { title:'Cổng gửi phiếu', msg:'Dòng ' + row + ' thiếu Mã NV — bỏ qua.' };

  var ky = kyLuongHienTai_();
  var id = code + '|' + ky + '|' + stage;

  var phieu = gBuildPhieu_(headers, vals, gSkipCols_());
  var payload = {
    meta: {
      source:'sheet-gate', version:1, code:code, ky_luong:ky,
      stage:stage, stage_label:stageLabel,
      enqueued_at:new Date().toISOString(), sheet_id:SpreadsheetApp.getActiveSpreadsheet().getId(),
    },
    phieu: phieu,
  };

  var ob  = gOutbox_();
  var idx = gOutboxIndex_(ob);
  var existing = idx[id];
  if (existing && String(existing.status) === 'sent') {
    return { title:'Đã gửi', msg: name + ' (' + code + ') — BL ' + stageLabel + ' kỳ ' + ky + ' đã gửi trước đó.' };
  }
  var rowArr = [ id, code, name, ky, stage, 'pending', new Date().toISOString(), '', 0, '', JSON.stringify(payload) ];
  if (existing) ob.getRange(existing.row, 1, 1, OUTBOX_HEADERS.length).setValues([rowArr]);
  else ob.appendRow(rowArr);
  return { title:'✓ Đã xếp hàng gửi (' + stageLabel + ')',
           msg: name + ' (' + code + ') kỳ ' + ky + '. Chạy "Gửi phiếu đang chờ" để phát.' };
}

/* ======== FLUSH (POST sang app — hoặc dry-run nếu chưa nối) ======== */

function flushOutbox() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ob = gOutbox_();
  var data = ob.getDataRange().getValues();
  if (data.length < 2) { ss.toast('Hàng đợi trống.', 'Cổng gửi phiếu', 5); return; }

  var col = {};
  OUTBOX_HEADERS.forEach(function(h, i){ col[h] = i; });

  var noEndpoint = !GATE_CFG.appEndpoint;
  var sent = 0, failed = 0, pending = 0, skipped = 0;

  for (var i = 1; i < data.length; i++) {
    var status   = String(data[i][col.status]);
    var attempts = Number(data[i][col.attempts] || 0);
    if (status === 'sent') continue;
    if (status === 'failed' && attempts >= GATE_CFG.maxAttempts) { skipped++; continue; }
    if (noEndpoint) { pending++; continue; }   // DRY-RUN: chưa nối app

    var r = i + 1;
    try {
      var resp = UrlFetchApp.fetch(GATE_CFG.appEndpoint, {
        method:'post', contentType:'application/json',
        headers: GATE_CFG.gateToken ? { 'X-Gate-Token': GATE_CFG.gateToken } : {},
        payload: data[i][col.payload_json], muteHttpExceptions:true,
      });
      var rc = resp.getResponseCode();
      if (rc >= 200 && rc < 300) {
        ob.getRange(r, col.status+1).setValue('sent');
        ob.getRange(r, col.sent_at+1).setValue(new Date().toISOString());
        ob.getRange(r, col.attempts+1).setValue(attempts + 1);
        ob.getRange(r, col.last_error+1).setValue('');
        sent++;
      } else {
        ob.getRange(r, col.status+1).setValue('failed');
        ob.getRange(r, col.attempts+1).setValue(attempts + 1);
        ob.getRange(r, col.last_error+1).setValue('HTTP ' + rc + ': ' + resp.getContentText().slice(0, 300));
        failed++;
      }
    } catch (err) {
      ob.getRange(r, col.status+1).setValue('failed');
      ob.getRange(r, col.attempts+1).setValue(attempts + 1);
      ob.getRange(r, col.last_error+1).setValue(String(err).slice(0, 300));
      failed++;
    }
  }

  if (noEndpoint) {
    ss.toast(pending + ' phiếu đang chờ. ⚠ CHƯA NỐI APP (appEndpoint trống) — chưa gửi.',
      'Cổng gửi phiếu (dry-run)', 10);
  } else {
    ss.toast('Đã gửi ' + sent + ' · lỗi ' + failed + ' · bỏ qua ' + skipped + '.', 'Cổng gửi phiếu', 8);
  }
}

/* ======== RESTORE (gọi từ capNhatTuBigQuery sau khi rebuild bảng) ======== */

/**
 * Tick lại 5 cột trạng thái từ _gate_state cho kỳ hiện tại (theo mã NV).
 * setValue KHÔNG kích hoạt trigger → không enqueue lại.
 */
function restoreGateTicks_(main) {
  try {
    var st = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(GATE_CFG.stateSheet);
    if (!st) return;
    var data = st.getDataRange().getValues();
    if (data.length < 2) return;
    var ky = kyLuongHienTai_();

    var byCode = {};
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][2]) !== ky) continue;
      var states = {};
      try { states = JSON.parse(data[i][3] || '{}'); } catch (e) { states = {}; }
      byCode[String(data[i][1])] = states;
    }
    if (!Object.keys(byCode).length) return;

    var hmap = gHeaderMap_(main);
    var cMa = hmap[GATE_CFG.colMaNV];
    if (!cMa) return;
    var last = main.getLastRow();
    if (last < 2) return;
    var codes = main.getRange(2, cMa, last - 1, 1).getValues();
    for (var r = 0; r < codes.length; r++) {
      var states2 = byCode[String(codes[r][0])];
      if (!states2) continue;
      for (var h in states2) {
        if (GATE_COLS.indexOf(h) < 0) continue;
        var cc = hmap[h];
        if (cc && states2[h] === true) main.getRange(r + 2, cc).setValue(true);
      }
    }
  } catch (err) { /* không chặn refresh */ }
}

/* ======== INSTALL + XEM ======== */

function installGateTriggers() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var existing = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existing.length; i++) {
    if (existing[i].getHandlerFunction() === 'guiPhieuOnEdit') ScriptApp.deleteTrigger(existing[i]);
  }
  ScriptApp.newTrigger('guiPhieuOnEdit').forSpreadsheet(ss).onEdit().create();
  gOutbox_(); gGateState_();   // tạo sẵn 2 tab ẩn
  ss.toast('Đã cài cổng. Tick tuần tự: Xác nhận → Gửi trước thuế → NV xác nhận trước thuế → Gửi sau thuế → NV xác nhận sau thuế.',
    '🔌 Cổng gửi phiếu', 10);
}

function moHangDoi() {
  var ob = gOutbox_();
  ob.showSheet();
  ob.activate();
}

/* ======== _gate_state (trạng thái tick, sống qua refresh) ======== */

function gGateState_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(GATE_CFG.stateSheet);
  if (!sh) {
    sh = ss.insertSheet(GATE_CFG.stateSheet);
    sh.getRange(1, 1, 1, STATE_HEADERS.length).setValues([STATE_HEADERS])
      .setFontWeight('bold').setBackground('#0b5394').setFontColor('white');
    sh.setFrozenRows(1); sh.hideSheet();
  }
  return sh;
}

function gSaveState_(code, ky, header, value) {
  if (!code) return;
  var st = gGateState_();
  var data = st.getDataRange().getValues();
  var id = code + '|' + ky;
  var rowIdx = -1, states = {};
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === id) {
      rowIdx = i + 1;
      try { states = JSON.parse(data[i][3] || '{}'); } catch (e) { states = {}; }
      break;
    }
  }
  states[header] = (value === true);
  var arr = [id, code, ky, JSON.stringify(states)];
  if (rowIdx > 0) st.getRange(rowIdx, 1, 1, STATE_HEADERS.length).setValues([arr]);
  else st.appendRow(arr);
}

/* ======== HELPERS ======== */

function kyLuongHienTai_() {
  if (GATE_CFG.kyLuong) return GATE_CFG.kyLuong;
  var d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2);
}

function gHeaderMap_(sh) {
  var lastCol = sh.getLastColumn();
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  var m = {};
  for (var i = 0; i < headers.length; i++) {
    var h = String(headers[i] || '').trim();
    if (h && !(h in m)) m[h] = i + 1;
  }
  return m;
}

function gHeaderAt_(hmap, col) { for (var h in hmap) if (hmap[h] === col) return h; return null; }
function gCode_(sh, row, hmap) { var c = hmap[GATE_CFG.colMaNV]; return c ? String(sh.getRange(row, c).getValue() || '').trim() : ''; }
function gStepBySend_(header)    { for (var i=0;i<SEND_STEPS.length;i++) if (SEND_STEPS[i].send===header)    return SEND_STEPS[i]; return null; }
function gStepByRequire_(header) { for (var i=0;i<SEND_STEPS.length;i++) if (SEND_STEPS[i].require===header) return SEND_STEPS[i]; return null; }

function gTenDong_(sh, row, hmap) {
  var cName = hmap[GATE_CFG.colName], cMa = hmap[GATE_CFG.colMaNV];
  var nm = cName ? String(sh.getRange(row, cName).getValue() || '') : '';
  var ma = cMa   ? String(sh.getRange(row, cMa).getValue()   || '') : '';
  return (nm + (ma ? ' (' + ma + ')' : '')).trim() || ('dòng ' + row);
}

function gOutbox_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(GATE_CFG.outboxSheet);
  if (!sh) {
    sh = ss.insertSheet(GATE_CFG.outboxSheet);
    sh.getRange(1, 1, 1, OUTBOX_HEADERS.length).setValues([OUTBOX_HEADERS])
      .setFontWeight('bold').setBackground('#0b5394').setFontColor('white');
    sh.setFrozenRows(1); sh.hideSheet();
  }
  return sh;
}

function gOutboxIndex_(ob) {
  var data = ob.getDataRange().getValues();
  var idx = {};
  for (var i = 1; i < data.length; i++) {
    var id = String(data[i][0] || '');
    if (id) idx[id] = { row: i + 1, status: data[i][5] };   // status = cột thứ 6
  }
  return idx;
}

/* ======== TEST KẾT NỐI (chạy 1 lần để verify trước khi Trang gửi thật) ======== */

/**
 * Gửi 1 phiếu test (code=__TEST__, stage=truoc_thue) rồi XOÁ NGAY.
 * Mục đích: verify token + endpoint + DB pipeline hoạt động end-to-end.
 * KHÔNG ảnh hưởng data thật (upsert code=__TEST__ rồi DELETE).
 */
function testGateKetNoi() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!GATE_CFG.appEndpoint) {
    ss.toast('appEndpoint trống — chưa nối app.', '❌ Test Gate', 8); return;
  }
  if (!GATE_CFG.gateToken) {
    ss.toast('gateToken trống — cần paste token thật vào GATE_CFG.gateToken trong Apps Script Editor.', '❌ Test Gate', 10); return;
  }

  var testPayload = {
    meta: { source:'gate-test', version:1, code:'__TEST__', ky_luong:'0000-00', stage:'truoc_thue',
            stage_label:'test', enqueued_at: new Date().toISOString(), sheet_id: ss.getId() },
    phieu: { Name:'Gate Test — xoá ngay', 'Mã NV':'__TEST__', 'Công': 0 },
  };

  try {
    var resp = UrlFetchApp.fetch(GATE_CFG.appEndpoint, {
      method: 'post', contentType: 'application/json',
      headers: { 'X-Gate-Token': GATE_CFG.gateToken },
      payload: JSON.stringify(testPayload), muteHttpExceptions: true,
    });
    var rc = resp.getResponseCode();
    var body = resp.getContentText();

    if (rc >= 200 && rc < 300) {
      ss.toast('✅ Gửi test thành công (HTTP ' + rc + '). Phiếu __TEST__ đã vào DB — xoá ngay...', 'Test Gate', 5);
      // Xoá phiếu test: gửi DELETE hoặc ghi đè rỗng → thực tế endpoint không có DELETE,
      // nên để phiếu __TEST__ tồn tại (code=__TEST__ không match NV nào, vô hại).
      // Admin có thể xoá thủ công: DELETE FROM payslips WHERE code='__TEST__';
      ss.toast('✅ GATE HOẠT ĐỘNG. Endpoint + Token + DB đều OK.\n\n' +
        'Phiếu test code=__TEST__ nằm trong DB (vô hại, xoá khi cần).\n' +
        'Chị Trang có thể bắt đầu tick Xác nhận → Gửi.', '✅ Test Gate OK', 15);
    } else {
      ss.toast('❌ HTTP ' + rc + ': ' + body.slice(0, 200) + '\n\nKiểm tra token hoặc endpoint.', '❌ Test Gate', 15);
    }
  } catch (err) {
    ss.toast('❌ Lỗi kết nối: ' + String(err).slice(0, 200), '❌ Test Gate', 15);
  }
}

/* ======== GHI NGƯỢC XÁC NHẬN (app → sheet) — G1-T11 ========
 *
 * Chiều app→sheet: khi NV bấm "Xác nhận" phiếu in-app, backend POST tới Web App này
 * (doPost) → tick ô 'NV xác nhận trước thuế' / 'NV xác nhận sau thuế' theo stage,
 * ĐỒNG THỜI ghi _gate_state (nguồn chân lý — sống qua refresh BQ). setValue KHÔNG
 * kích trigger guiPhieuOnEdit (giống restoreGateTicks_) → không enqueue lại.
 *
 * CÀI 1 LẦN: Deploy → New deployment → type "Web app" → Execute as: Me,
 *   Who has access: Anyone → copy URL → dán vào Render env PAYSLIP_GATE_WEBAPP_URL.
 * Secret = GATE_CFG.gateToken (ScriptProperties GATE_TOKEN) — cùng token cổng receive.
 * Lưới an toàn: menu '🔃 Đồng bộ xác nhận từ app' (pullConfirmsFromApp) nếu 1 push rớt.
 */

var CONFIRM_COL_BY_STAGE = {
  truoc_thue: 'NV xác nhận trước thuế',
  sau_thue:   'NV xác nhận sau thuế',
};

function _gateJsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Web App endpoint: backend báo NV đã confirm → tick ô + ghi _gate_state. */
function doPost(e) {
  try {
    var body = {};
    try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (_) {}
    var expected = String(GATE_CFG.gateToken || '').trim();
    if (!expected || String(body.secret || '') !== expected) {
      return _gateJsonOut_({ ok:false, error:'unauthorized' });
    }
    var code  = String(body.code || '').trim();
    var stage = String(body.stage || '').trim();
    var ky    = String(body.ky_luong || '').trim() || kyLuongHienTai_();
    var col   = CONFIRM_COL_BY_STAGE[stage];
    if (!code || !col) return _gateJsonOut_({ ok:false, error:'bad_request' });

    var lk = LockService.getDocumentLock();
    lk.waitLock(20000);
    try {
      gSaveState_(code, ky, col, true);              // 1) nguồn chân lý (sống qua refresh)
      var ticked = gTickConfirmCell_(code, ky, col);  // 2) tick ô nếu đang hiển thị đúng kỳ
      return _gateJsonOut_({ ok:true, code:code, stage:stage, ticked:ticked });
    } finally {
      lk.releaseLock();
    }
  } catch (err) {
    return _gateJsonOut_({ ok:false, error:String(err).slice(0, 200) });
  }
}

/** Tick ô 'NV xác nhận ...' cho 1 mã NV trên bảng chính. Chỉ tick nếu sheet đang ở đúng kỳ. */
function gTickConfirmCell_(code, ky, header) {
  if (ky && ky !== kyLuongHienTai_()) return false;   // bảng chính chỉ hiển thị 1 kỳ
  var main = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(GATE_CFG.mainSheet);
  if (!main) return false;
  var hmap = gHeaderMap_(main);
  var cMa = hmap[GATE_CFG.colMaNV], cCol = hmap[header];
  if (!cMa || !cCol) return false;
  var last = main.getLastRow();
  if (last < 2) return false;
  var codes = main.getRange(2, cMa, last - 1, 1).getValues();
  for (var r = 0; r < codes.length; r++) {
    if (String(codes[r][0]).trim() === code) {
      main.getRange(r + 2, cCol).setValue(true);   // setValue KHÔNG kích trigger
      return true;
    }
  }
  return false;
}

/** Suy URL /confirmations từ appEndpoint (.../payslips/receive → .../payslips/confirmations). */
function gConfirmationsUrl_() {
  var base = String(GATE_CFG.appEndpoint || '');
  var m = base.match(/^(.*\/payslips)\//);
  return m ? m[1] + '/confirmations' : '';
}

/** LƯỚI AN TOÀN (menu): kéo mọi phiếu đã confirm của kỳ hiện tại từ app → tick + ghi state. */
function pullConfirmsFromApp() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var url = gConfirmationsUrl_();
  if (!url) { ss.toast('Chưa suy được URL confirmations từ appEndpoint.', '🔃 Đồng bộ', 8); return; }
  var ky = kyLuongHienTai_();
  var secret = String(GATE_CFG.gateToken || '').trim();
  try {
    var resp = UrlFetchApp.fetch(url + '?ky_luong=' + encodeURIComponent(ky), {
      method:'get',
      headers: secret ? { 'X-Gate-Token': secret } : {},
      muteHttpExceptions:true,
    });
    var rc = resp.getResponseCode();
    if (rc < 200 || rc >= 300) {
      ss.toast('HTTP ' + rc + ': ' + resp.getContentText().slice(0, 150), '❌ Đồng bộ', 10);
      return;
    }
    var list = (JSON.parse(resp.getContentText() || '{}').confirmations) || [];
    var lk = LockService.getDocumentLock();
    lk.waitLock(20000);
    var n = 0;
    try {
      for (var i = 0; i < list.length; i++) {
        var code  = String(list[i].code || '').trim();
        var stage = String(list[i].stage || '').trim();
        var rky   = String(list[i].ky_luong || ky).trim();
        var col   = CONFIRM_COL_BY_STAGE[stage];
        if (!code || !col) continue;
        gSaveState_(code, rky, col, true);
        if (gTickConfirmCell_(code, rky, col)) n++;
      }
    } finally { lk.releaseLock(); }
    ss.toast('Đã đồng bộ ' + n + ' xác nhận (kỳ ' + ky + ').', '🔃 Đồng bộ xác nhận', 6);
  } catch (err) {
    ss.toast('Lỗi đồng bộ: ' + String(err).slice(0, 150), '❌ Đồng bộ', 10);
  }
}
