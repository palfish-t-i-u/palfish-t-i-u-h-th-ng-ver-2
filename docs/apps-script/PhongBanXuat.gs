/**
 * PalFish — XUẤT EXCEL THEO TEAM (G3-T5 + G3-T10)
 *
 * File mới, rollback = xoá file này.
 * Không openById nào ngoài SS hiện tại (trừ export tạo SS tạm).
 */

/* ======== CONFIG ======== */

var PB_CFG = {
  khac:      'Khác',
  tmpPrefix: '__PL_TMP_',
  propKey:   'PL_TMP_IDS',
  docId:     '1Jd0TvdJvh7EwsqvPXKyEoLdCDQHXXC_hjmS0TzIN3hs',
};

// 9 giá trị chuẩn của CASE ... AS team (BangLuong.gs:19-28)
var TEAM_KNOWN_ = [
  'bod','inhouse 1','inhouse 2','offline','cskh','back office','mkt','head quarter','wfh','khac'
];

/* --- HAI hàm lọc cột RIÊNG BIỆT — cấm dùng chung (Q4f / I23) --- */

// Payload phiếu NV: 5 gate + Phòng ban (HRIS) = 6 (hoặc 5 nếu không thêm PB)
function gSkipCols_(){ return GATE_COLS.concat(['Phòng ban (HRIS)']); }

// File Excel: chỉ bỏ 5 cột gate — file GIỮ team, Phòng ban (HRIS), Mã NV
function xlBoCotXuat_(){ return GATE_COLS.slice(); }

/* ======== CHUẨN HOÁ ======== */

function pbNorm_(s){
  return String(s==null?'':s).replace(/ /g,' ').trim().replace(/\s+/g,' ');
}

function pbCanon_(s){
  return pbNorm_(s)
    .replace(/[-_\/]+/g,' ').replace(/\s+/g,' ')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g,'')
    .replace(/đ/g,'d');
}

/* ======== SERIALIZE (chặn Date/undefined/NaN qua google.script.run) ======== */

function plSerialize_(o){
  if(o===undefined || o===null) return null;
  if(typeof o==='number') return isNaN(o) ? null : o;
  if(o instanceof Date) return Utilities.formatDate(o,'Asia/Ho_Chi_Minh','dd/MM/yyyy');
  if(Array.isArray(o)) return o.map(plSerialize_);
  if(typeof o==='object'){
    var out={};
    for(var k in o){ if(o.hasOwnProperty(k)) out[k]=plSerialize_(o[k]); }
    return out;
  }
  return o;
}

/* ======== ĐỌC BẢNG LƯƠNG — bỏ cột gate, guard #REF! ======== */

function xlDocBang_(){
  var ss   = SpreadsheetApp.getActiveSpreadsheet();
  var main = ss.getSheetByName(CFG.mainSheet);
  if(!main) throw 'Không tìm thấy tab "'+CFG.mainSheet+'".';
  var lastRow = main.getLastRow();
  if(lastRow < 2) throw 'Bảng lương rỗng — chưa có dữ liệu.';
  var allVals = main.getRange(1, 1, lastRow, main.getLastColumn()).getValues();
  var rawHdr  = allVals[0].map(function(x){ return String(x||'').trim(); });

  var skip = xlBoCotXuat_();
  var keepIdx = [];
  for(var i=0; i<rawHdr.length; i++){
    if(skip.indexOf(rawHdr[i]) < 0) keepIdx.push(i);
  }
  var headers = keepIdx.map(function(i){ return rawHdr[i]; });

  var codeIdx = headers.indexOf('Mã NV');
  var rows = [];
  for(var r=1; r<allVals.length; r++){
    var mapped = keepIdx.map(function(i){ return allVals[r][i]; });
    if(codeIdx >= 0 && !String(mapped[codeIdx]||'').trim()) continue;

    for(var m=0; m<mapped.length; m++){
      if(typeof mapped[m]==='string' && mapped[m].charAt(0)==='#'){
        throw 'Ô "'+headers[m]+'" dòng '+(r+1)+' = "'+mapped[m]+
              '" — Công thức chưa tính xong, chờ vài giây rồi bấm lại.';
      }
    }
    rows.push(mapped);
  }
  return { headers:headers, rows:rows, mauSo:rows.length };
}

function xlMauSo_(bang){
  return bang.rows.length;
}

/* ======== GOM NHÓM THEO team ======== */

function xlGomNhom_(bang){
  var teamIdx = bang.headers.indexOf('Team');
  if(teamIdx < 0) throw 'Không tìm thấy cột "Team" trên bảng lương.';

  var groups = [];     // [{ten, canon, rows, variants:{}}]
  var canonMap = {};    // canon → index in groups

  for(var r=0; r<bang.rows.length; r++){
    var raw   = bang.rows[r][teamIdx];
    var norm  = pbNorm_(raw);
    var label = norm || PB_CFG.khac;
    var canon = pbCanon_(label);

    if(canon in canonMap){
      var g = groups[canonMap[canon]];
      g.rows.push(bang.rows[r]);
      g.variants[label] = (g.variants[label]||0) + 1;
    } else {
      canonMap[canon] = groups.length;
      var variants = {};
      variants[label] = 1;
      groups.push({ ten:label, canon:canon, rows:[bang.rows[r]], variants:variants });
    }
  }

  // Nhãn hiển thị = biến thể xuất hiện nhiều nhất
  for(var i=0; i<groups.length; i++){
    var g = groups[i];
    var best = g.ten, bestN = 0;
    for(var v in g.variants){
      if(g.variants[v] > bestN){ bestN = g.variants[v]; best = v; }
    }
    g.ten = best;
  }

  // Ép rỗng về Khác, đẩy xuống cuối
  var khacIdx = -1;
  for(var i=0; i<groups.length; i++){
    if(groups[i].canon === pbCanon_(PB_CFG.khac)){ khacIdx = i; break; }
  }
  if(khacIdx > 0){
    var khac = groups.splice(khacIdx, 1)[0];
    groups.push(khac);
  }

  return groups;
}

/* ======== KIỂM TEAM LẠ ======== */

function xlKiemTeam_(bang){
  var teamIdx = bang.headers.indexOf('Team');
  if(teamIdx < 0) return [];
  var counts = {};
  for(var r=0; r<bang.rows.length; r++){
    var raw = pbNorm_(bang.rows[r][teamIdx]) || PB_CFG.khac;
    counts[raw] = (counts[raw]||0) + 1;
  }
  var result = [];
  for(var val in counts){
    var canon = pbCanon_(val);
    var known = false;
    for(var k=0; k<TEAM_KNOWN_.length; k++){
      if(TEAM_KNOWN_[k] === canon){ known = true; break; }
    }
    result.push({ giaTri:val, soNguoi:counts[val], known:known });
  }
  result.sort(function(a,b){ return b.soNguoi - a.soNguoi; });
  return result;
}

/* ======== TÊN TAB / TÊN FILE ======== */

// Tab Excel: GIỮ DẤU, cắt 31 ký tự, khử trùng ~2
function xlTenTab_(ten, daDung){
  var s = pbNorm_(ten)
    .replace(/[\[\]*?\/\\:]/g, '_')
    .replace(/^'+|'+$/g, '');
  if(!s || s === 'History') s = '_' + s;
  s = s.substring(0, 31);
  daDung = daDung || [];
  var base = s, n = 2;
  while(daDung.indexOf(s) >= 0){
    var suffix = '~' + n;
    s = base.substring(0, 31 - suffix.length) + suffix;
    n++;
  }
  return s;
}

// Tên file: BỎ DẤU, chỉ giữ A-Za-z0-9-, cắt 60, khử trùng ~2
function xlTenFile_(ten, daDung){
  var s = pbNorm_(ten)
    .normalize('NFD').replace(/[̀-ͯ]/g,'')
    .replace(/đ/g,'d').replace(/Đ/g,'D')
    .replace(/[^A-Za-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
  if(!s) s = 'nhom';
  s = s.substring(0, 60);
  daDung = daDung || [];
  var base = s, n = 2;
  while(daDung.indexOf(s) >= 0){
    var suffix = '~' + n;
    s = base.substring(0, 60 - suffix.length) + suffix;
    n++;
  }
  return s;
}

/* ======== KIỂM BLOB XLSX ======== */

function xlKiemBlob_(blob, tenNhom){
  var bytes = blob.getBytes();
  if(bytes.length < 4 || bytes[0]!==0x50 || bytes[1]!==0x4B || bytes[2]!==0x03 || bytes[3]!==0x04){
    throw 'File xuất KHÔNG phải xlsx hợp lệ (thiếu PK header) — kiểm tra scope Drive.';
  }
  // Utilities.unzip yêu cầu contentType = application/zip
  var zipBlob = Utilities.newBlob(bytes, 'application/zip', blob.getName());
  var entries = Utilities.unzip(zipBlob);
  var found = false;
  for(var i=0; i<entries.length; i++){
    if(entries[i].getName().indexOf('sharedStrings') >= 0){
      var xml = entries[i].getDataAsString();
      if(xml.indexOf(tenNhom) >= 0){ found = true; break; }
    }
  }
  if(!found){
    throw 'File xlsx không chứa nhãn nhóm "'+tenNhom+'" trong sharedStrings — có thể chứa dữ liệu nhóm khác.';
  }
}

/* ======== DỌN FILE TẠM DRIVE ======== */

function xlDonRac_(){
  var props = PropertiesService.getScriptProperties();
  var idsStr = props.getProperty(PB_CFG.propKey) || '';
  var ids = idsStr ? idsStr.split(',') : [];
  var cleaned = 0;

  // Dọn theo id đã lưu
  for(var i=0; i<ids.length; i++){
    try{ DriveApp.getFileById(ids[i]).setTrashed(true); cleaned++; }
    catch(e){ /* đã xoá hoặc không tồn tại */ }
  }
  props.deleteProperty(PB_CFG.propKey);

  // Quét prefix phòng trường hợp crash trước khi lưu id
  var files = DriveApp.searchFiles("title contains '"+PB_CFG.tmpPrefix+"'");
  while(files.hasNext()){
    try{ files.next().setTrashed(true); cleaned++; }
    catch(e){}
  }
  return cleaned;
}

function xlGhiTmpId_(id){
  var props = PropertiesService.getScriptProperties();
  var idsStr = props.getProperty(PB_CFG.propKey) || '';
  var ids = idsStr ? idsStr.split(',') : [];
  ids.push(id);
  props.setProperty(PB_CFG.propKey, ids.join(','));
}

/* ======== TAB PHIẾU CÁ NHÂN ======== */

/**
 * Tạo 1 tab phiếu cá nhân trong spreadsheet ss.
 * Layout giống mẫu Doc chị Trang: tiêu đề + lời chào + bảng viền + footer.
 *
 * @param {Spreadsheet} ss        - spreadsheet tạm đang mở
 * @param {string}      code      - Mã NV (vd "HN0001")
 * @param {string}      name      - Tên NV
 * @param {string}      ky        - Kỳ lương (vd "2026-07")
 * @param {string[]}    headers   - header row (trimmed)
 * @param {Array}       vals      - data row (cùng length với headers)
 * @param {string[]}    tags      - từ pvDocTags_()
 * @param {Object}      alias     - PV_TAG_ALIAS
 * @param {string[]}    daDungTab - tên tab đã dùng (để tránh trùng)
 */
function xlPhieuTab_(ss, code, name, ky, headers, vals, tags, alias, daDungTab) {
  var tabName = xlTenTab_(name || code, daDungTab);
  daDungTab.push(tabName);
  var sh = ss.insertSheet(tabName);

  // Tháng hiển thị: "2026-07" → "7"
  var thang = ky ? String(parseInt((ky.split('-')[1] || '0'), 10)) : '';

  // Build header index
  var hIdx = {};
  for (var i = 0; i < headers.length; i++) {
    if (headers[i]) hIdx[headers[i]] = i;
  }

  // Dòng bảng: dùng TÊN TAG làm nhãn (giống Doc template)
  // Hiển thị TẤT CẢ dòng (kể cả trống) — giống mẫu chị Trang
  var tableRows = [];
  for (var t = 0; t < tags.length; t++) {
    var tag = tags[t];
    var colLabel = alias[tag] ? alias[tag] : tag;
    var displayVal = '';
    if (colLabel in hIdx) {
      var raw = vals[hIdx[colLabel]];
      var fmt = pvFmt_(raw, tag);
      displayVal = (fmt === '__BO_DONG__') ? '' : fmt;
    }
    tableRows.push([tag, displayVal]);
  }

  // Build sheet data
  var data = [];
  data.push(['BẢNG LƯƠNG THÁNG ' + thang, '']);                           // 1
  data.push(['', '']);                                                       // 2
  data.push(['Kính gửi Anh/Chị ' + name + ',', '']);                       // 3
  data.push(['', '']);                                                       // 4
  data.push(['Phòng Nhân sự gửi Anh/Chị thông tin bảng lương trong kỳ đã bao gồm thuế như sau:', '']); // 5
  data.push(['', '']);                                                       // 6

  var tableStart = data.length + 1;  // 1-indexed
  tableRows.forEach(function(r) { data.push(r); });
  var tableEnd = data.length;

  data.push(['', '']);
  data.push(['', '']);
  data.push(['Nếu Anh/Chị có thắc mắc, vui lòng liên hệ Phòng Nhân sự (Ms. Thu Trang - 0988.934.163)', '']);
  data.push(['Email: palfishrecruitment@gmail.com để được hỗ trợ.', '']);
  data.push(['', '']);
  data.push(['Trân trọng,', '']);
  data.push(['Phòng Nhân sự', '']);

  sh.getRange(1, 1, data.length, 2).setValues(data);

  // Row 1: tiêu đề — merge, căn giữa, bold, font 16
  sh.getRange(1, 1, 1, 2).merge()
    .setHorizontalAlignment('center')
    .setFontWeight('bold')
    .setFontSize(16);

  // Row 3: "Kính gửi..." — bold
  sh.getRange(3, 1).setFontWeight('bold');

  // Bảng: viền tất cả ô
  sh.getRange(tableStart, 1, tableEnd - tableStart + 1, 2)
    .setBorder(true, true, true, true, true, true,
               '#000000', SpreadsheetApp.BorderStyle.SOLID);

  // Dòng cuối bảng (Tổng lương + thưởng): bold + nền vàng
  sh.getRange(tableEnd, 1, 1, 2)
    .setFontWeight('bold')
    .setBackground('#fff2cc')
    .setFontColor('#7f6000');

  // Cột giá trị trong bảng: căn phải
  sh.getRange(tableStart, 2, tableEnd - tableStart + 1, 1)
    .setHorizontalAlignment('right');

  sh.setColumnWidth(1, 280);
  sh.setColumnWidth(2, 180);
}

/* ======== THỐNG KÊ CHO DIALOG ======== */

function xlThongKe(){
  var bang = xlDocBang_();
  var nhom = xlGomNhom_(bang);
  var kiem = xlKiemTeam_(bang);
  var ky   = typeof kyLuongHienTai_ === 'function' ? kyLuongHienTai_() : '';
  var tong = xlMauSo_(bang);

  // Bảng chéo team × Phòng ban (HRIS)
  var pbIdx = bang.headers.indexOf('Phòng ban (HRIS)');
  var nhomOut = [];
  for(var g=0; g<nhom.length; g++){
    var gr = nhom[g];
    var cheo = {};
    if(pbIdx >= 0){
      for(var r=0; r<gr.rows.length; r++){
        var pb = pbNorm_(gr.rows[r][pbIdx]) || '(trống)';
        cheo[pb] = (cheo[pb]||0) + 1;
      }
    }
    var canhBaoGop = [];
    for(var v in gr.variants){
      if(v !== gr.ten) canhBaoGop.push("'" + v + "' (" + gr.variants[v] + ' người) đã gộp vào \'' + gr.ten + "'");
    }
    nhomOut.push({
      ten:     gr.ten,
      so:      gr.rows.length,
      cheo:    cheo,
      canhBao: canhBaoGop,
    });
  }

  // Cảnh báo team lạ
  var teamLa = [];
  for(var k=0; k<kiem.length; k++){
    if(!kiem[k].known) teamLa.push(kiem[k]);
  }

  return plSerialize_({
    ky:      ky,
    tong:    tong,
    soNhom:  nhom.length,
    nhom:    nhomOut,
    teamLa:  teamLa,
    canhBao: nhom.length <= 2 ? 'Chỉ có '+nhom.length+' nhóm — kiểm tra cột team.' :
             (nhomOut[0] && nhomOut[0].so/tong > 0.6) ? 'Nhóm "'+nhomOut[0].ten+'" chiếm '+(nhomOut[0].so/tong*100).toFixed(0)+'% dân số.' : '',
  });
}

/* ======== XUẤT ZIP / 1 FILE ======== */

function xlTaiZip(ky, danhSachTeam){
  var lk = LockService.getDocumentLock();
  if(!lk.tryLock(0)){
    return plSerialize_({ error:'Đang có thao tác khác chạy, chờ chút.' });
  }
  try {
    var bang = xlDocBang_();
    var nhom = xlGomNhom_(bang);
    var tong = xlMauSo_(bang);

    // Lọc theo team đã chọn (nếu có)
    if(danhSachTeam && danhSachTeam.length > 0){
      var chon = {};
      for(var i=0;i<danhSachTeam.length;i++) chon[danhSachTeam[i]] = true;
      nhom = nhom.filter(function(g){ return chon[g.ten]; });
      if(nhom.length === 0){
        return plSerialize_({ error:'Không có nhóm nào được chọn.' });
      }
    }

    var dangLoc = danhSachTeam && danhSachTeam.length > 0;

    // Guard: quá ít nhóm hoặc 1 nhóm chiếm >60% (chỉ khi KHÔNG lọc)
    if(!dangLoc){
      if(nhom.length <= 2){
        return plSerialize_({ error:'Chỉ có '+nhom.length+' nhóm team — có thể cột team bị lệch. Kiểm tra lại trước khi xuất.' });
      }
      var max = nhom[0].rows.length;
      if(max / tong > 0.6){
        return plSerialize_({ error:'Nhóm "'+nhom[0].ten+'" chiếm '+(max/tong*100).toFixed(0)+'% ('+max+'/'+tong+') — kiểm tra cột team trước khi xuất.' });
      }
    }

    // Assert bảo toàn dòng (I8) — chỉ khi xuất tất cả
    if(!dangLoc){
      var sumRows = 0;
      for(var g=0; g<nhom.length; g++) sumRows += nhom[g].rows.length;
      if(sumRows !== tong){
        throw 'Tổng dòng nhóm ('+sumRows+') ≠ tổng bảng ('+tong+') — dữ liệu bị trùng hoặc mất.';
      }
    }

    xlDonRac_();

    // Đọc Doc tags 1 lần cho tất cả tab phiếu cá nhân
    var tagResult = pvDocTags_();

    var tmpIds = [];
    var fileBlobs = [];
    var daDungTab = [];
    var daDungFile = [];

    for(var g=0; g<nhom.length; g++){
      var gr      = nhom[g];
      var tabName = xlTenTab_('TH — ' + gr.ten, daDungTab);
      daDungTab.push(tabName);

      // Tạo spreadsheet tạm
      var tmpSS = SpreadsheetApp.create(PB_CFG.tmpPrefix + tabName);
      var tmpId = tmpSS.getId();
      tmpIds.push(tmpId);
      xlGhiTmpId_(tmpId);

      var sh = tmpSS.getSheets()[0];
      sh.setName(tabName);

      // A1 = kỳ — tên nhóm
      var label = ky + ' — ' + gr.ten;

      // Build data: header + rows (VALUES, không formula)
      var data = [bang.headers];
      for(var r=0; r<gr.rows.length; r++){
        var row = gr.rows[r].slice();
        // STT đánh lại 1..n
        var sttIdx = bang.headers.indexOf('STT');
        if(sttIdx >= 0) row[sttIdx] = r + 1;
        // Coerce formula strings (role:'calc' values from getValues = numbers, OK)
        for(var c=0; c<row.length; c++){
          if(typeof row[c]==='string' && row[c].charAt(0)==='=') row[c] = '';
        }
        data.push(row);
      }

      // Ghi vào tab tạm
      sh.getRange(1, 1, 1, 1).setValue(label);
      sh.getRange(2, 1, data.length, data[0].length).setValues(data);

      // Format header (row 2 = header row in file)
      sh.getRange(2, 1, 1, data[0].length)
        .setFontWeight('bold').setBackground('#0b5394').setFontColor('white')
        .setWrap(true).setHorizontalAlignment('center');
      sh.setFrozenRows(2);

      // Format money columns: #,##0
      for(var m=0; m<MONEY_KEYS.length; m++){
        var mi = bang.headers.indexOf(COLS[colIndex(MONEY_KEYS[m])-1].h);
        if(mi >= 0 && gr.rows.length > 0){
          sh.getRange(3, mi+1, gr.rows.length, 1).setNumberFormat('#,##0');
        }
      }

      // Tab phiếu cá nhân cho từng NV
      var codeIdx2 = bang.headers.indexOf('Mã NV');
      var nameIdx2 = bang.headers.indexOf('Họ và tên');
      if (nameIdx2 < 0) nameIdx2 = bang.headers.indexOf('Name');
      for (var p = 0; p < gr.rows.length; p++) {
        var nvCode = codeIdx2 >= 0 ? String(gr.rows[p][codeIdx2] || '').trim() : '';
        var nvName = nameIdx2 >= 0 ? String(gr.rows[p][nameIdx2] || '').trim() : '';
        if (nvCode) {
          xlPhieuTab_(tmpSS, nvCode, nvName, ky, bang.headers, gr.rows[p],
                      tagResult.tags, PV_TAG_ALIAS, daDungTab);
        }
      }

      SpreadsheetApp.flush();
      Utilities.sleep(500);

      // Export xlsx
      var url = 'https://docs.google.com/spreadsheets/d/'+tmpId+'/export?format=xlsx';
      var token = ScriptApp.getOAuthToken();
      var resp = UrlFetchApp.fetch(url, {
        headers: { 'Authorization':'Bearer '+token },
        muteHttpExceptions: true,
      });
      if(resp.getResponseCode() !== 200){
        throw 'Export lỗi HTTP '+resp.getResponseCode()+' cho nhóm "'+gr.ten+'".';
      }
      var blob = resp.getBlob();

      // Tên file: BL_<ky>_<NN>_<slug>.xlsx
      var nn = String(g+1);
      while(nn.length < 2) nn = '0' + nn;
      var slug = xlTenFile_(gr.ten, daDungFile);
      daDungFile.push(slug);
      var fileName = 'BL_'+ky+'_'+nn+'_'+slug+'.xlsx';
      blob.setName(fileName);

      // Kiểm blob (I9 + I10)
      xlKiemBlob_(blob, label);

      // Assert không formula (I11)
      for(var r=0; r<gr.rows.length; r++){
        for(var c=0; c<gr.rows[r].length; c++){
          if(typeof gr.rows[r][c]==='string' && gr.rows[r][c].charAt(0)==='='){
            throw 'Ô trong file xuất là FORMULA — phải dùng getValues(), không getFormulas().';
          }
        }
      }

      fileBlobs.push(blob);
    }

    // ZIP
    var zipName = dangLoc
      ? 'BangLuong_'+ky+'_'+nhom.length+'nhom.zip'
      : 'BangLuong_'+ky+'.zip';
    var zipBlob = Utilities.zip(fileBlobs, zipName);

    // Encode base64 data URI
    var b64 = Utilities.base64Encode(zipBlob.getBytes());
    var dataUri = 'data:application/zip;base64,' + b64;

    // Dọn file tạm
    for(var i=0; i<tmpIds.length; i++){
      try{ DriveApp.getFileById(tmpIds[i]).setTrashed(true); }
      catch(e){}
    }
    PropertiesService.getScriptProperties().deleteProperty(PB_CFG.propKey);

    return plSerialize_({
      filename: zipName,
      dataUri:  dataUri,
      soNhom:   nhom.length,
      tongNV:   tong,
    });

  } finally {
    lk.releaseLock();
  }
}

function xlTaiMotFile(ky, danhSachTeam){
  var lk = LockService.getDocumentLock();
  if(!lk.tryLock(0)){
    return plSerialize_({ error:'Đang có thao tác khác chạy, chờ chút.' });
  }
  try {
    var bang = xlDocBang_();
    var nhom = xlGomNhom_(bang);
    var tong = xlMauSo_(bang);

    if(danhSachTeam && danhSachTeam.length > 0){
      var chon = {};
      for(var i=0;i<danhSachTeam.length;i++) chon[danhSachTeam[i]] = true;
      nhom = nhom.filter(function(g){ return chon[g.ten]; });
      if(nhom.length === 0){
        return plSerialize_({ error:'Không có nhóm nào được chọn.' });
      }
    }

    xlDonRac_();

    // Đọc Doc tags 1 lần cho tất cả tab phiếu cá nhân
    var tagResult = pvDocTags_();

    var tmpSS = SpreadsheetApp.create(PB_CFG.tmpPrefix + 'all');
    var tmpId = tmpSS.getId();
    xlGhiTmpId_(tmpId);

    var daDungTab = [];
    var isFirst = true;

    for(var g=0; g<nhom.length; g++){
      var gr      = nhom[g];
      var tabName = xlTenTab_('TH — ' + gr.ten, daDungTab);
      daDungTab.push(tabName);

      var sh;
      if(isFirst){
        sh = tmpSS.getSheets()[0];
        sh.setName(tabName);
        isFirst = false;
      } else {
        sh = tmpSS.insertSheet(tabName);
      }

      var label = ky + ' — ' + gr.ten;
      var data = [bang.headers];
      for(var r=0; r<gr.rows.length; r++){
        var row = gr.rows[r].slice();
        var sttIdx = bang.headers.indexOf('STT');
        if(sttIdx >= 0) row[sttIdx] = r + 1;
        for(var c=0; c<row.length; c++){
          if(typeof row[c]==='string' && row[c].charAt(0)==='=') row[c] = '';
        }
        data.push(row);
      }

      sh.getRange(1, 1, 1, 1).setValue(label);
      sh.getRange(2, 1, data.length, data[0].length).setValues(data);
      sh.getRange(2, 1, 1, data[0].length)
        .setFontWeight('bold').setBackground('#0b5394').setFontColor('white')
        .setWrap(true).setHorizontalAlignment('center');
      sh.setFrozenRows(2);

      for(var m=0; m<MONEY_KEYS.length; m++){
        var mi = bang.headers.indexOf(COLS[colIndex(MONEY_KEYS[m])-1].h);
        if(mi >= 0 && gr.rows.length > 0){
          sh.getRange(3, mi+1, gr.rows.length, 1).setNumberFormat('#,##0');
        }
      }

      // Tab phiếu cá nhân cho từng NV
      var codeIdx2 = bang.headers.indexOf('Mã NV');
      var nameIdx2 = bang.headers.indexOf('Họ và tên');
      if (nameIdx2 < 0) nameIdx2 = bang.headers.indexOf('Name');
      for (var p = 0; p < gr.rows.length; p++) {
        var nvCode = codeIdx2 >= 0 ? String(gr.rows[p][codeIdx2] || '').trim() : '';
        var nvName = nameIdx2 >= 0 ? String(gr.rows[p][nameIdx2] || '').trim() : '';
        if (nvCode) {
          xlPhieuTab_(tmpSS, nvCode, nvName, ky, bang.headers, gr.rows[p],
                      tagResult.tags, PV_TAG_ALIAS, daDungTab);
        }
      }
    }

    SpreadsheetApp.flush();
    Utilities.sleep(500);

    var url = 'https://docs.google.com/spreadsheets/d/'+tmpId+'/export?format=xlsx';
    var token = ScriptApp.getOAuthToken();
    var resp = UrlFetchApp.fetch(url, {
      headers: { 'Authorization':'Bearer '+token },
      muteHttpExceptions: true,
    });
    if(resp.getResponseCode() !== 200){
      throw 'Export lỗi HTTP '+resp.getResponseCode()+'.';
    }
    var blob = resp.getBlob();
    var fileName = 'BangLuong_'+ky+'_tat_ca.xlsx';
    blob.setName(fileName);

    var b64 = Utilities.base64Encode(blob.getBytes());
    var dataUri = 'data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,' + b64;

    try{ DriveApp.getFileById(tmpId).setTrashed(true); } catch(e){}
    PropertiesService.getScriptProperties().deleteProperty(PB_CFG.propKey);

    return plSerialize_({
      filename: fileName,
      dataUri:  dataUri,
      soNhom:   nhom.length,
      tongNV:   tong,
    });

  } finally {
    lk.releaseLock();
  }
}
