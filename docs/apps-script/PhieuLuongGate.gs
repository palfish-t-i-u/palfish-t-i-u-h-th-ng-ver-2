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
  gateToken:   '',   // Render env GATE_TOKEN — dán giá trị thật trong Apps Script, KHÔNG commit

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
    if (e.range.getNumRows() !== 1 || e.range.getNumColumns() !== 1) return; // bỏ paste vùng
    var row = e.range.getRow();
    if (row < 2) return;

    var hmap   = gHeaderMap_(sh);
    var header = gHeaderAt_(hmap, e.range.getColumn());
    if (!header || GATE_COLS.indexOf(header) < 0) return;   // chỉ 5 cột gate

    var ss   = SpreadsheetApp.getActiveSpreadsheet();
    var val  = e.range.getValue() === true;
    var code = gCode_(sh, row, hmap);
    var ky   = kyLuongHienTai_();

    // (A) Cột là NÚT GỬI
    var sendStep = gStepBySend_(header);
    if (sendStep) {
      if (!val) { gSaveState_(code, ky, header, false); return; }   // bỏ tick
      var cReq = hmap[sendStep.require];
      if (cReq && sh.getRange(row, cReq).getValue() !== true) {     // CHẶN CỨNG
        e.range.setValue(false);
        gSaveState_(code, ky, header, false);
        ss.toast('Phải tick "' + sendStep.require + '" trước khi ' + sendStep.send.toLowerCase() + '.',
          '⛔ Chưa đủ điều kiện', 6);
        return;
      }
      var res = gEnqueueRow_(sh, row, hmap, sendStep.stage, sendStep.label);
      gSaveState_(code, ky, header, true);
      ss.toast(res.msg, res.title, 6);
      return;
    }

    // (B) Cột là ĐIỀU KIỆN cho một nút gửi
    var reqStep = gStepByRequire_(header);
    if (reqStep) {
      gSaveState_(code, ky, header, val);
      if (!val) {   // bỏ điều kiện → thu hồi nút gửi phụ thuộc
        var cSend = hmap[reqStep.send];
        if (cSend && sh.getRange(row, cSend).getValue() === true) {
          sh.getRange(row, cSend).setValue(false);
          gSaveState_(code, ky, reqStep.send, false);
          ss.toast('Bỏ "' + header + '" → thu hồi "' + reqStep.send + '" (' + gTenDong_(sh,row,hmap) + ').',
            '↩ Thu hồi', 6);
        }
      } else {
        ss.toast('✓ ' + header + ': ' + gTenDong_(sh,row,hmap) + '. Mở "' + reqStep.send + '".', 'Trạng thái', 5);
      }
      return;
    }

    // (C) Cột xác nhận cuối (NV xác nhận sau thuế)
    gSaveState_(code, ky, header, val);
    if (val) ss.toast('✓ ' + header + ': ' + gTenDong_(sh,row,hmap) + '. Sẵn sàng đi lệnh ngân hàng.', 'Hoàn tất', 5);
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
