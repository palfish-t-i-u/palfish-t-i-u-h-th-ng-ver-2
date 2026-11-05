// ═══════════════════════════════════════════════════════════════
// SALARY & BONUS ANALYSIS REPORT — Auto-update Script
// Reads "Bảng lương" → calculates → writes VN + EN report tabs
// ═══════════════════════════════════════════════════════════════

// ───── CONFIG ─────
const CFG = {
  PAYROLL: 'Bảng lương',
  VN_TAB:  'Báo cáo lương thưởng (mẫu)',
  EN_TAB:  'Salary Report (sample)',
  ARCHIVE: '_Archive',

  // "Bảng lương" columns (0-based offset from col B, data starts row 2)
  C: { CODE:0, TEAM:1, NAME:2, TITLE:3, TYPE:4, DEPT:5, NET:6, SAL:7, BASIC:8, DAYS:9, LCB:10, COM:11 },

  TEAMS: ['Inhouse 1','Inhouse 2','CSKH','MKT','Back office','Offline','Head quarter'],

  EN_TEAM: { 'CSKH':'CS' },

  CTV_MAP: { 'CSKH':'CTV team CS', 'Offline':'CTV team Offline', 'Back office':'CTV team Back office', 'MKT':'CTV team Marketing' },
  CTV_ORDER: ['CTV team CS','CTV team Offline','CTV team Back office','CTV team Marketing'],

  KEY_CODES: ['HN0001','HN0038','HN0002','HN0147','HN0213','HN0057'],
  KEY_INFO: {
    HN0001: { vn:'Sale Manager',            en:'Sale Manager',            team:'Inhouse 1' },
    HN0038: { vn:'Offline Manager',          en:'Offline Manager',          team:'Offline'   },
    HN0002: { vn:'Marketing Manager',        en:'Marketing Manager',        team:'MKT'       },
    HN0147: { vn:'Sales Operation Leader',   en:'Sales Operation Leader',   team:'Inhouse 2' },
    HN0213: { vn:'CS Leader (thử việc)',     en:'CS Leader (probation)',    team:'CSKH'      },
    HN0057: { vn:'HR Leader',               en:'HR Leader',               team:'Back office'},
  },
};

const VN_M = {1:'Tháng 1',2:'Tháng 2',3:'Tháng 3',4:'Tháng 4',5:'Tháng 5',6:'Tháng 6',
              7:'Tháng 7',8:'Tháng 8',9:'Tháng 9',10:'Tháng 10',11:'Tháng 11',12:'Tháng 12'};
const EN_M = {1:'January',2:'February',3:'March',4:'April',5:'May',6:'June',
              7:'July',8:'August',9:'September',10:'October',11:'November',12:'December'};
const SHORT_M = {1:'Jan',2:'Feb',3:'Mar',4:'Apr',5:'May',6:'Jun',
                 7:'Jul',8:'Aug',9:'Sep',10:'Oct',11:'Nov',12:'Dec'};

// ───── MENU ─────
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📊 Báo cáo')
    .addItem('Cập nhật báo cáo lương thưởng', 'updateSalaryReport')
    .addToUi();
}

// ───── MAIN ─────
function updateSalaryReport() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const payroll = ss.getSheetByName(CFG.PAYROLL);
  if (!payroll) { ui.alert('Lỗi','Không tìm thấy tab "' + CFG.PAYROLL + '"', ui.ButtonSet.OK); return; }

  const curEmps = readPayroll_(payroll);
  if (!curEmps.length) { ui.alert('Lỗi','Không có dữ liệu nhân viên.', ui.ButtonSet.OK); return; }

  const r = ui.prompt('Tháng hiện tại',
    'Nhập số tháng của dữ liệu "Bảng lương" (VD: 10 = Tháng 10):', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const curM = parseInt(r.getResponseText());
  if (isNaN(curM) || curM < 1 || curM > 12) { ui.alert('Lỗi','Tháng không hợp lệ.', ui.ButtonSet.OK); return; }
  const prevM = curM === 1 ? 12 : curM - 1;

  const arc = ss.getSheetByName(CFG.ARCHIVE);
  const prevEmps = arc ? readArchive_(arc) : [];

  const curAgg  = aggregate_(curEmps);
  const prevAgg = prevEmps.length ? aggregate_(prevEmps) : null;
  const hc      = headcount_(prevEmps, curEmps, prevM, curM);
  const kp      = keyPersonnel_(prevEmps, curEmps);

  writeVN_(ss, prevM, curM, prevAgg, curAgg, hc, kp);
  writeEN_(ss, prevM, curM, prevAgg, curAgg, hc, kp);
  archive_(ss, curEmps);

  SpreadsheetApp.flush();
  ui.alert('✅ Hoàn tất','Đã cập nhật báo cáo ' + VN_M[prevM] + ' vs ' + VN_M[curM], ui.ButtonSet.OK);
}

// ───── READ PAYROLL ─────
function readPayroll_(sheet) {
  const last = sheet.getLastRow();
  if (last < 2) return [];
  const vals = sheet.getRange('B2:M' + last).getDisplayValues();
  const emps = [];
  for (const row of vals) {
    const code = (row[CFG.C.CODE] || '').trim();
    if (!code || !code.startsWith('HN')) continue;
    emps.push({
      code:  code,
      team:  (row[CFG.C.TEAM]  || '').trim(),
      name:  (row[CFG.C.NAME]  || '').trim(),
      title: (row[CFG.C.TITLE] || '').trim(),
      type:  (row[CFG.C.TYPE]  || '').trim(),
      dept:  (row[CFG.C.DEPT]  || '').trim(),
      net:   parseNum_(row[CFG.C.NET]),
      sal:   parseNum_(row[CFG.C.SAL]),
      com:   parseNum_(row[CFG.C.COM]),
    });
  }
  return emps;
}

// ───── ARCHIVE R/W ─────
function readArchive_(sheet) {
  const last = sheet.getLastRow();
  if (last < 2) return [];
  const vals = sheet.getRange('A2:I' + last).getDisplayValues();
  const emps = [];
  for (const r of vals) {
    if (!r[0]) continue;
    emps.push({ code:r[0], team:r[1], name:r[2], title:r[3], type:r[4], dept:r[5],
                net:parseNum_(r[6]), sal:parseNum_(r[7]), com:parseNum_(r[8]) });
  }
  return emps;
}

function archive_(ss, emps) {
  let sheet = ss.getSheetByName(CFG.ARCHIVE);
  if (!sheet) {
    sheet = ss.insertSheet(CFG.ARCHIVE);
    sheet.hideSheet();
  }
  sheet.clearContents();
  const hdr = [['code','team','name','title','type','dept','net','sal','com']];
  const data = emps.map(function(e) { return [e.code, e.team, e.name, e.title, e.type, e.dept, e.net, e.sal, e.com]; });
  sheet.getRange(1, 1, 1, 9).setValues(hdr);
  if (data.length) sheet.getRange(2, 1, data.length, 9).setValues(data);
}

// ───── AGGREGATE ─────
function aggregate_(emps) {
  var byTeam = {};
  CFG.TEAMS.forEach(function(t) { byTeam[t] = { net:0, sal:0, com:0, count:0 }; });

  var ctvByGroup = {};
  CFG.CTV_ORDER.forEach(function(g) { ctvByGroup[g] = { cost:0, count:0 }; });

  for (var i = 0; i < emps.length; i++) {
    var e = emps[i];
    var t = e.team;
    if (byTeam[t]) {
      byTeam[t].net += e.net;
      byTeam[t].sal += e.sal;
      byTeam[t].com += e.com;
      byTeam[t].count++;
    }
    if (/cộng tác viên/i.test(normalize_(e.type))) {
      var grp = CFG.CTV_MAP[t];
      if (grp && ctvByGroup[grp]) {
        ctvByGroup[grp].cost += e.net;
        ctvByGroup[grp].count++;
      }
    }
  }

  var total = { net:0, sal:0, com:0, count:0 };
  CFG.TEAMS.forEach(function(t) {
    total.net += byTeam[t].net; total.sal += byTeam[t].sal;
    total.com += byTeam[t].com; total.count += byTeam[t].count;
  });

  var ctvTotal = { cost:0, count:0 };
  CFG.CTV_ORDER.forEach(function(g) {
    ctvTotal.cost += ctvByGroup[g].cost; ctvTotal.count += ctvByGroup[g].count;
  });

  return { byTeam: byTeam, total: total, ctvByGroup: ctvByGroup, ctvTotal: ctvTotal, empCount: emps.length };
}

// ───── HEADCOUNT ─────
function headcount_(prev, cur, prevM, curM) {
  var prevSet = {};
  prev.forEach(function(e) { prevSet[e.code] = true; });
  var curSet = {};
  cur.forEach(function(e) { curSet[e.code] = true; });
  var prevMap = {};
  prev.forEach(function(e) { prevMap[e.code] = e; });

  var joined = cur.filter(function(e) { return !prevSet[e.code]; });
  var left   = prev.filter(function(e) { return !curSet[e.code]; });

  var converted = [];
  for (var i = 0; i < cur.length; i++) {
    var c = cur[i];
    var p = prevMap[c.code];
    if (!p) continue;
    var wasProb = /thử việc|thực tập/i.test(normalize_(p.type));
    var nowFull = /chính thức/i.test(normalize_(c.type));
    if (wasProb && nowFull) converted.push(c.code);
  }

  var joinedCost = 0;
  joined.forEach(function(e) { joinedCost += e.net; });
  var leftCost = 0;
  left.forEach(function(e) { leftCost += e.net; });

  return {
    startCount: prev.length || cur.length,
    endCount:   cur.length,
    joined: joined, left: left, converted: converted,
    joinedCost: joinedCost, leftCost: leftCost,
    prevM: prevM, curM: curM,
  };
}

// ───── KEY PERSONNEL ─────
function keyPersonnel_(prev, cur) {
  var pMap = {};
  prev.forEach(function(e) { pMap[e.code] = e; });
  var cMap = {};
  cur.forEach(function(e) { cMap[e.code] = e; });
  return CFG.KEY_CODES.map(function(code) {
    return { code: code, prev: pMap[code] || null, cur: cMap[code] || null };
  });
}

// ═══════════════════════════════════════════════════════════════
// WRITE VN TAB
// ═══════════════════════════════════════════════════════════════
function writeVN_(ss, prevM, curM, prevAgg, curAgg, hc, kp) {
  var sh = ss.getSheetByName(CFG.VN_TAB);
  if (!sh) return;
  var f = fmtVN_;
  var pm = VN_M[prevM], cm = VN_M[curM];

  // Row 1: main title
  sh.getRange('A1').setValue('BÁO CÁO LƯƠNG THƯỞNG (' + pm + ' – ' + cm + ')');

  // Table 1 — rows 4-14 (title + 2 headers + total + 7 teams)
  sh.getRange('A4').setValue('1 · TỔNG CHI LƯƠNG THƯỞNG TOÀN CÔNG TY (' + pm + ' vs ' + cm + ')');
  sh.getRange('A5:F14').setValues(tbl123_(
    'Team', pm, cm, 'Tổng chi (VND)', 'TỔNG CHI LƯƠNG THƯỞNG', prevAgg, curAgg, 'net', f, false));

  // Table 2 — rows 16-26
  sh.getRange('A16').setValue('2 · TỔNG LƯƠNG & PHỤ CẤP (' + pm + ' vs ' + cm + ')');
  sh.getRange('A17:F26').setValues(tbl123_(
    'Team', pm, cm, 'Quỹ (VND)', 'TỔNG LƯƠNG & PHỤ CẤP', prevAgg, curAgg, 'sal', f, false));

  // Table 3 — rows 28-38
  sh.getRange('A28').setValue('3 · TỔNG THƯỞNG COM (' + pm + ' vs ' + cm + ')');
  sh.getRange('A29:F38').setValues(tbl123_(
    'Team', pm, cm, 'Thưởng (VND)', 'TỔNG THƯỞNG COM', prevAgg, curAgg, 'com', f, false));

  // Table 4 — rows 40-47
  sh.getRange('A40').setValue('4 · CHI PHÍ CỘNG TÁC VIÊN (' + pm + ' vs ' + cm + ')');
  sh.getRange('A41:F47').setValues(tbl4_(
    'Nhóm', pm, cm, 'Chi (VND)', 'Số nhân sự', 'Δ Chi (VND)', 'TỔNG', prevAgg, curAgg, f));

  // Table 5 — rows 49-57
  sh.getRange('A49:C57').setValues(tbl5VN_(hc, f));

  // Table 6 — rows 59-66
  sh.getRange('A59:I66').setValues(tbl6VN_(kp, prevM, curM, f));
}

// ═══════════════════════════════════════════════════════════════
// WRITE EN TAB
// ═══════════════════════════════════════════════════════════════
function writeEN_(ss, prevM, curM, prevAgg, curAgg, hc, kp) {
  var sh = ss.getSheetByName(CFG.EN_TAB);
  if (!sh) return;
  var f = fmtEN_;
  var pm = EN_M[prevM], cm = EN_M[curM];

  // Row 1: main title
  sh.getRange('A1').setValue('SALARY & BONUS REPORT (' + pm + ' – ' + cm + ')');

  // Table 1
  sh.getRange('A4').setValue('1 · TOTAL COMPENSATION (' + pm + ' vs ' + cm + ')');
  sh.getRange('A5:F14').setValues(tbl123_(
    'Team', pm, cm, 'Total (VND)', 'TOTAL COMPENSATION', prevAgg, curAgg, 'net', f, true));

  // Table 2
  sh.getRange('A16').setValue('2 · TOTAL SALARY & ALLOWANCES (' + pm + ' vs ' + cm + ')');
  sh.getRange('A17:F26').setValues(tbl123_(
    'Team', pm, cm, 'Fund (VND)', 'TOTAL SALARY & ALLOWANCES', prevAgg, curAgg, 'sal', f, true));

  // Table 3
  sh.getRange('A28').setValue('3 · TOTAL COMMISSION BONUS (' + pm + ' vs ' + cm + ')');
  sh.getRange('A29:F38').setValues(tbl123_(
    'Team', pm, cm, 'Bonus (VND)', 'TOTAL COMMISSION BONUS', prevAgg, curAgg, 'com', f, true));

  // Table 4
  sh.getRange('A40').setValue('4 · CONTRACTOR COSTS (' + pm + ' vs ' + cm + ')');
  sh.getRange('A41:F47').setValues(tbl4_(
    'Group', pm, cm, 'Cost (VND)', 'Count', 'Δ Cost', 'TOTAL CONTRACTORS', prevAgg, curAgg, f));

  // Table 5
  sh.getRange('A49:C57').setValues(tbl5EN_(hc, f));

  // Table 6
  sh.getRange('A59:I66').setValues(tbl6EN_(kp, prevM, curM, f));
}

// ───── TABLE 1/2/3 builder (10 rows: 2 headers + total + 7 teams) ─────
function tbl123_(teamLabel, pm, cm, valLabel, totalLabel, prev, cur, field, fmt, isEN) {
  var rows = [];
  rows.push([teamLabel, pm, '', cm, '', '']);
  rows.push(['', valLabel, '%', valLabel, '%', 'Δ']);

  var pTotal = prev ? prev.total[field] : 0;
  var cTotal = cur.total[field];
  rows.push([totalLabel, fmt(pTotal), '100%', fmt(cTotal), '100%', delta_(pTotal, cTotal, fmt)]);

  for (var i = 0; i < CFG.TEAMS.length; i++) {
    var t = CFG.TEAMS[i];
    var tName = isEN ? (CFG.EN_TEAM[t] || t) : t;
    var pv = prev ? prev.byTeam[t][field] : 0;
    var cv = cur.byTeam[t][field];
    var pPct = pTotal ? pct_(pv, pTotal, fmt) : '0%';
    var cPct = cTotal ? pct_(cv, cTotal, fmt) : '0%';
    rows.push([tName, fmt(pv), pPct, fmt(cv), cPct, delta_(pv, cv, fmt)]);
  }
  return rows;
}

// ───── TABLE 4 builder (7 rows: 2 headers + total + 4 CTV groups) ─────
function tbl4_(groupLabel, pm, cm, costLabel, countLabel, deltaLabel, totalLabel, prev, cur, fmt) {
  var rows = [];
  rows.push([groupLabel, pm, '', cm, '', '']);
  rows.push(['', costLabel, countLabel, costLabel, countLabel, deltaLabel]);

  var pCtvT = prev ? prev.ctvTotal : { cost:0, count:0 };
  var cCtvT = cur.ctvTotal;
  rows.push([totalLabel, fmt(pCtvT.cost), String(pCtvT.count), fmt(cCtvT.cost), String(cCtvT.count), delta_(pCtvT.cost, cCtvT.cost, fmt)]);

  for (var i = 0; i < CFG.CTV_ORDER.length; i++) {
    var g = CFG.CTV_ORDER[i];
    var pv = prev ? prev.ctvByGroup[g] : { cost:0, count:0 };
    var cv = cur.ctvByGroup[g];
    rows.push([g, fmt(pv.cost), String(pv.count), fmt(cv.cost), String(cv.count), delta_(pv.cost, cv.cost, fmt)]);
  }
  return rows;
}

// ───── TABLE 5 VN (9 rows: title + header + 7 data) ─────
function tbl5VN_(hc, fmt) {
  var pm = hc.prevM, cm = hc.curM;
  return [
    ['5 · BIẾN ĐỘNG NHÂN SỰ (' + VN_M[pm] + ' → ' + VN_M[cm] + ')', '', ''],
    ['Chỉ tiêu', 'Giá trị', 'Ghi chú'],
    ['NV đầu kỳ (T' + pm + ')', String(hc.startCount), ''],
    ['(+) NV tuyển mới', '▲ ' + hc.joined.length, joinedNames_(hc.joined)],
    ['(−) NV nghỉ việc', '▼ ' + hc.left.length, leftNames_(hc.left)],
    ['NV cuối kỳ (T' + cm + ')', String(hc.endCount), ''],
    ['↳ Tác động quỹ từ NV mới', '▲ ' + fmt(hc.joinedCost), 'Tổng lương T' + cm + ' của NV mới'],
    ['↳ Giảm quỹ do NV nghỉ', '▼ ' + fmt(hc.leftCost), 'Lương T' + pm + ' của NV đã nghỉ'],
    ['NV chuyển TV/TT → Chính thức', String(hc.converted.length),
     hc.converted.length ? hc.converted.join(', ') : 'Không phát sinh trong kỳ'],
  ];
}

// ───── TABLE 5 EN (9 rows) ─────
function tbl5EN_(hc, fmt) {
  var spm = SHORT_M[hc.prevM], scm = SHORT_M[hc.curM];
  return [
    ['5 · HEADCOUNT CHANGES (' + spm + ' → ' + scm + ')', '', ''],
    ['Metric', 'Value', 'Note'],
    ['Headcount start (' + spm + ')', String(hc.startCount), ''],
    ['(+) New hires', '▲ ' + hc.joined.length, joinedNames_(hc.joined)],
    ['(-) Departures', '▼ ' + hc.left.length, leftNames_(hc.left)],
    ['Headcount end (' + scm + ')', String(hc.endCount), ''],
    ['New hire payroll impact', '▲ ' + fmt(hc.joinedCost), 'T' + hc.curM + ' salary of new hires'],
    ['Departure payroll reduction', '▼ ' + fmt(hc.leftCost), 'T' + hc.prevM + ' salary of departed staff'],
    ['Probation/Intern → Full-time', String(hc.converted.length),
     hc.converted.length ? hc.converted.join(', ') : 'None this period'],
  ];
}

// ───── TABLE 6 VN (8 rows: title + header + 6 people) ─────
function tbl6VN_(kp, prevM, curM, fmt) {
  var rows = [];
  rows.push(['6 · NHÂN SỰ CHỦ CHỐT (T' + prevM + ' vs T' + curM + ')',
    '','','','','','','','']);
  rows.push(['Nhân sự','Chức danh','Team',
    'Thưởng COM T'+prevM+' (VND)','Thưởng COM T'+curM+' (VND)','Δ Thưởng COM',
    'Tổng TN T'+prevM+' (VND)','Tổng TN T'+curM+' (VND)','Δ Tổng TN']);

  for (var i = 0; i < kp.length; i++) {
    var p = kp[i];
    var info = CFG.KEY_INFO[p.code] || {};
    var name = p.cur ? p.cur.name : (p.prev ? p.prev.name : p.code);
    rows.push(personRow_(name, info.vn || '', info.team || '', p, fmt, 'vn'));
  }
  return rows;
}

// ───── TABLE 6 EN (8 rows: title + header + 6 people) ─────
function tbl6EN_(kp, prevM, curM, fmt) {
  var rows = [];
  rows.push(['6 · KEY PERSONNEL CHANGES (' + SHORT_M[prevM] + ' vs ' + SHORT_M[curM] + ')',
    '','','','','','','','']);
  rows.push(['Name','Title','Team',
    'COM Bonus ' + SHORT_M[prevM] + ' (VND)','COM Bonus ' + SHORT_M[curM] + ' (VND)','Δ COM',
    'Total Income ' + SHORT_M[prevM] + ' (VND)','Total Income ' + SHORT_M[curM] + ' (VND)','Δ Total Income']);

  for (var i = 0; i < kp.length; i++) {
    var p = kp[i];
    var info = CFG.KEY_INFO[p.code] || {};
    var name = p.cur ? p.cur.name : (p.prev ? p.prev.name : p.code);
    rows.push(personRow_(name, info.en || '', info.team || '', p, fmt, 'en'));
  }
  return rows;
}

function personRow_(name, title, team, p, fmt, lang) {
  var pCom = p.prev ? p.prev.com : null;
  var cCom = p.cur  ? p.cur.com  : null;
  var pNet = p.prev ? p.prev.net : null;
  var cNet = p.cur  ? p.cur.net  : null;

  var fPCom = pCom !== null ? fmt(pCom) : '—';
  var fCCom = cCom !== null ? fmt(cCom) : '—';
  var fPNet = pNet !== null ? fmt(pNet) : '—';
  var fCNet = cNet !== null ? fmt(cNet) : '—';

  var dCom = '—';
  if (pCom !== null && cCom !== null && pCom > 0) {
    dCom = delta_(pCom, cCom, fmt);
  } else if (pCom === 0 && cCom > 0) {
    dCom = lang === 'vn' ? '▲ mới' : '▲ new';
  } else if (pCom > 0 && (cCom === 0 || cCom === null)) {
    dCom = lang === 'vn' ? '▼ hết' : '▼ ended';
  }

  var dNet = '—';
  if (pNet !== null && cNet !== null && pNet > 0) {
    dNet = delta_(pNet, cNet, fmt);
  } else if (pNet === null && cNet !== null) {
    dNet = lang === 'vn' ? '▲ mới' : 'New';
  }

  return [name, title, team, fPCom, fCCom, dCom, fPNet, fCNet, dNet];
}

// ───── HELPER: employee name lists for Table 5 notes ─────
function joinedNames_(list) {
  if (!list.length) return '';
  var names = list.map(function(e) { return e.code; });
  return names.length <= 5 ? names.join(', ') : names.slice(0,5).join(', ') + '…';
}
function leftNames_(list) {
  if (!list.length) return '';
  var names = list.map(function(e) { return e.code; });
  return names.length <= 5 ? names.join(', ') : names.slice(0,5).join(', ') + '…';
}

// ═══════════════════════════════════════════════════════════════
// FORMAT HELPERS
// ═══════════════════════════════════════════════════════════════

function fmtVN_(n) {
  if (n === 0) return '0';
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function fmtEN_(n) {
  if (n === 0) return '0';
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function pct_(val, total, fmt) {
  if (!total) return '0%';
  var p = (val / total * 100);
  if (fmt === fmtVN_) return p.toFixed(1).replace('.', ',') + '%';
  return p.toFixed(1) + '%';
}

function delta_(prev, cur, fmt) {
  if (!prev && !cur) return '–';
  if (!prev && cur)  return fmt === fmtVN_ ? '▲ mới' : '▲ new';
  if (prev && !cur)  return fmt === fmtVN_ ? '▼ hết' : '▼ ended';
  var d = (cur - prev) / prev * 100;
  var arrow = d > 0.05 ? '▲' : d < -0.05 ? '▼' : '–';
  var abs = Math.abs(d);
  if (abs < 0.05) {
    return fmt === fmtVN_ ? '– 0,0%' : '– 0.0%';
  }
  var str = abs.toFixed(1);
  if (fmt === fmtVN_) return arrow + ' ' + str.replace('.', ',') + '%';
  return arrow + ' ' + str + '%';
}

function parseNum_(s) {
  if (!s) return 0;
  var cleaned = s.toString().replace(/[,.\s]/g, '');
  var n = Number(cleaned);
  return isNaN(n) ? 0 : n;
}

function normalize_(s) {
  if (!s) return '';
  return s.normalize('NFC');
}
