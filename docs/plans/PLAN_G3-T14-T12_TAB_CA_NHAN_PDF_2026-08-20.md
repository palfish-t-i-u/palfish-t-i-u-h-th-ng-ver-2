# PLAN — G3-T14 Tab phiếu cá nhân Excel + G3-T12 PDF từng phiếu

*Ngày lập: 20/08/2026 · Người thực thi: Sonnet 4.6 (subagent) · Duyệt: Minh*

---

## 0. ĐỌC CÁI NÀY TRƯỚC

**Không có clasp, không có CI.** Giao hàng = copy-paste file `.gs`/`.html` vào Apps Script Editor.
**Repo chỉ là bản chép tay** tại `docs/apps-script/*.gs` + `*.html`.

**Hai task ĐỘC LẬP** — chạy song song được:
- G3-T14: sửa `PhongBanXuat.gs` (thêm tab phiếu cá nhân trong mỗi file Excel team)
- G3-T12: sửa `PhieuLuongXem.gs` + `PhieuLuongXem.html` (nút xuất PDF từng phiếu trong modal preview)

---

## 1. G3-T14 — Tab phiếu cá nhân trong file Excel team

### 1.1 Mục tiêu

Mỗi file Excel team (xuất từ `xlTaiZip` / `xlTaiMotFile`) hiện có **1 tab** (bảng tổng hợp cả team). Thêm **N tab phiếu cá nhân** — mỗi NV 1 tab, layout key-value dọc theo thứ tự Doc mẫu.

### 1.2 File sửa

**Chỉ sửa:** `docs/apps-script/PhongBanXuat.gs`

### 1.3 Dependencies — hàm đã có sẵn (KHÔNG sửa, chỉ gọi)

```
// PhieuLuongXem.gs — đã có trong cùng Apps Script project
pvDungPhieu_(tags, alias, headers, vals) → {dong, conLai, moCoi, boTrong, fallback}
  // tags = string[] từ pvDocTags_()
  // alias = PV_TAG_ALIAS object
  // headers = string[] (row 1 trimmed)
  // vals = any[] (row data, same length as headers)
  // dong = [{key, label, val}] — Part A theo thứ tự Doc
  // conLai = [{key, label, val}] — Part B cột còn lại
  // Cả dong và conLai đã BỎ dòng trống (val === ''|null|undefined → boTrong++)

pvDocTags_() → {tags: string[], ok: boolean, tagNguon: string}
  // Đọc Doc mẫu `1Jd0...`, trả về danh sách tag <<...>>

pvFmt_(val, key) → string | '__BO_DONG__'
  // Format 1 giá trị: Date→dd/MM/yyyy, number→vi-VN locale, empty→PV_BO_DONG_
  // PV_KEEP_DECIMAL_ = {'Công':true, 'Tỉ lệ đạt KPI':true, '% Com ≥100%':true}

PV_TAG_ALIAS = {'Họ tên':'Name', 'Bảo hiểm + note':'Bảo hiểm', 'Tổng lương + thưởng':'Tổng lương + thưởng (Net)'}

plSerialize_(o) → safe object  // PhongBanXuat.gs — đã có

// BangLuong.gs — global
COLS = [{key, h, role, src?}, ...] // 30 entries, h = header label
GATE_COLS = ['Đã gửi trước thuế', 'Đã gửi sau thuế', 'Đã xác nhận', 'Phản hồi lương', 'Ghi chú HR'] // 5 items
MONEY_KEYS = ['tong_lt','tong_luong','luong_cb','lcb_ngay_cong','thuong_com','bao_hiem',
              'gmv','gmv_ban_moi','gmv_gioi_thieu','gmv_tai_ky',
              'an_trua','may_tinh','xe_pc','khau_tru_thue','bu_tien'] // 15 items
colIndex(key) → 1-based column index
```

### 1.4 Hàm mới: `xlPhieuTab_`

**Thêm vào `PhongBanXuat.gs`**, đặt ngay trước `xlThongKe` (trước dòng `/* ======== THỐNG KÊ CHO DIALOG ======== */`, khoảng dòng 263).

```js
/**
 * Tạo 1 tab phiếu cá nhân trong spreadsheet ss.
 * Layout: 2 cột (Nhãn | Giá trị), key-value dọc.
 *
 * @param {Spreadsheet} ss       - spreadsheet tạm đang mở
 * @param {string}      code     - Mã NV (vd "HN0001")
 * @param {string}      name     - Tên NV
 * @param {string}      ky       - Kỳ lương (vd "2026-07")
 * @param {string[]}    headers  - header row (trimmed)
 * @param {Array}       vals     - data row (cùng length với headers)
 * @param {string[]}    tags     - từ pvDocTags_()
 * @param {Object}      alias    - PV_TAG_ALIAS
 * @param {string[]}    daDungTab - tên tab đã dùng (để tránh trùng)
 */
function xlPhieuTab_(ss, code, name, ky, headers, vals, tags, alias, daDungTab) {
  var tabName = xlTenTab_(code, daDungTab);
  daDungTab.push(tabName);

  var sh = ss.insertSheet(tabName);

  // Row 1: tiêu đề
  // Row 2: trống (tách)
  // Row 3+: Label | Value

  var phieu = pvDungPhieu_(tags, alias, headers, vals);

  // Gộp dong + conLai, format giá trị, bỏ dòng trống
  var allRows = [];
  var dongFmt = phieu.dong.map(function(d) {
    return { label: d.label, val: pvFmt_(d.val, d.key), key: d.key };
  }).filter(function(d) { return d.val !== '__BO_DONG__'; });

  var conLaiFmt = phieu.conLai.map(function(d) {
    return { label: d.label, val: pvFmt_(d.val, d.key), key: d.key };
  }).filter(function(d) { return d.val !== '__BO_DONG__'; });

  // Part A header
  allRows.push(['--- Phiếu lương ---', '']);
  dongFmt.forEach(function(d) { allRows.push([d.label, d.val]); });

  // Part B header (nếu có)
  if (conLaiFmt.length > 0) {
    allRows.push(['', '']);  // dòng trống phân cách
    allRows.push(['--- Thông tin bổ sung ---', '']);
    conLaiFmt.forEach(function(d) { allRows.push([d.label, d.val]); });
  }

  // Ghi dữ liệu
  var data = [];
  data.push(['Phiếu lương — ' + name + ' (' + code + ')', '']);
  data.push(['Kỳ: ' + ky, '']);
  data.push(['', '']);  // dòng trống
  allRows.forEach(function(r) { data.push(r); });

  sh.getRange(1, 1, data.length, 2).setValues(data);

  // Format
  // Row 1: tiêu đề bold, font 14
  sh.getRange(1, 1).setFontWeight('bold').setFontSize(14);
  // Row 2: kỳ lương bold
  sh.getRange(2, 1).setFontWeight('bold');

  // Cột A (nhãn): bold cho separator rows, regular cho data
  // Cột B (giá trị): align right
  sh.getRange(1, 2, data.length, 1).setHorizontalAlignment('right');

  // Separator rows ("--- ... ---"): bold + background
  for (var i = 0; i < data.length; i++) {
    if (typeof data[i][0] === 'string' && data[i][0].indexOf('---') === 0) {
      sh.getRange(i + 1, 1, 1, 2)
        .setFontWeight('bold')
        .setBackground('#e8f0fe')
        .setFontColor('#1a73e8');
    }
  }

  // Column widths
  sh.setColumnWidth(1, 250);
  sh.setColumnWidth(2, 200);

  // Number format cho cột B: detect số trong val string (đã format bởi pvFmt_ nên là string)
  // pvFmt_ trả string locale vi-VN, KHÔNG cần format lại — để nguyên text
}
```

### 1.5 Sửa `xlTaiZip` — chèn sau vòng lặp ghi tab tổng hợp

**Vị trí:** trong `xlTaiZip`, sau block format header + format money (khoảng dòng 412), **TRƯỚC** `SpreadsheetApp.flush()` (dòng 414).

**Đọc Doc tags 1 lần TRƯỚC vòng lặp team** (đặt sau `xlDonRac_()`, trước `for(var g=0;...)`):

```js
// Đọc Doc tags 1 lần cho tất cả tab phiếu cá nhân
var tagResult = pvDocTags_();
```

**Trong vòng lặp team**, sau block format money, trước `SpreadsheetApp.flush()`:

```js
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
```

### 1.6 Sửa `xlTaiMotFile` — tương tự

Cùng pattern: đọc `pvDocTags_()` 1 lần trước vòng lặp, chèn loop `xlPhieuTab_` sau format money trong mỗi iteration.

### 1.7 Rename tab tổng hợp

Trong cả `xlTaiZip` và `xlTaiMotFile`, đổi `tabName` cho tab đầu tiên:

```js
// TRƯỚC:
var tabName = xlTenTab_(gr.ten, daDungTab);
// SAU:
var tabName = xlTenTab_('TH — ' + gr.ten, daDungTab);
```

`TH` = Tổng hợp. Giữ ngắn vì limit 31 ký tự.

### 1.8 Giảm sleep

`Utilities.sleep(1500)` (dòng ~414 trong xlTaiZip) → giảm thành `Utilities.sleep(500)`. Lý do: thêm N tab cá nhân tăng thời gian chạy; sleep 1.5s × 8 team = 12s lãng phí.

### 1.9 Edge cases

| Case | Xử lý |
|------|-------|
| NV trùng mã (Mã NV giống nhau) | `xlTenTab_` đã xử lý trùng tên tab (thêm `~2`, `~3`) |
| Team 1 người | 1 tab TH + 1 tab phiếu = 2 tabs. OK |
| Doc mẫu không đọc được (`tagsOk=false`) | `pvDungPhieu_` fallback mode: hiện toàn bộ COLS theo thứ tự. OK |
| Ô giá trị rỗng | `pvDungPhieu_` đã bỏ (đếm vào `boTrong`). `pvFmt_` trả `PV_BO_DONG_` → filter bỏ |
| Team >50 NV | Inhouse 1 = 44 NV = 45 tabs. Ước tính ~50s. Tổng 8 team ~3 phút < 6 phút |

### 1.10 Self-check sau khi code

1. Grep `xlPhieuTab_` → ≥3 call sites (hàm + xlTaiZip + xlTaiMotFile)
2. Grep `innerHTML` trong PhongBanXuat.gs → 0 kết quả
3. Grep `pvDungPhieu_` → có call từ xlPhieuTab_
4. Grep `pvDocTags_` → có call từ xlTaiZip VÀ xlTaiMotFile (1 lần/hàm, ngoài loop)
5. `daDungTab` phải được pass vào `xlPhieuTab_` VÀ push bên trong hàm (chống trùng)
6. Tab tổng hợp tên bắt đầu `TH —`

---

## 2. G3-T12 — PDF từng phiếu

### 2.1 Mục tiêu

Nút trong modal preview xuất 1 phiếu ra PDF theo đúng Doc mẫu `1Jd0TvdJvh7EwsqvPXKyEoLdCDQHXXC_hjmS0TzIN3hs`.

### 2.2 File sửa

- `docs/apps-script/PhieuLuongXem.gs` — thêm hàm `pvTaiPDF`
- `docs/apps-script/PhieuLuongXem.html` — thêm nút + handler

### 2.3 Dependencies — hàm đã có sẵn (KHÔNG sửa, chỉ gọi)

```
// PhieuLuongXem.gs — cùng file
PV_DOC_ID = '1Jd0TvdJvh7EwsqvPXKyEoLdCDQHXXC_hjmS0TzIN3hs'
PV_TAG_ALIAS = {'Họ tên':'Name', 'Bảo hiểm + note':'Bảo hiểm', 'Tổng lương + thưởng':'Tổng lương + thưởng (Net)'}
PV_KEEP_DECIMAL_ = {'Công':true, 'Tỉ lệ đạt KPI':true, '% Com ≥100%':true}
pvFmt_(val, key) → string | '__BO_DONG__'

// PhieuLuongGate.gs — cùng project
GATE_CFG.mainSheet = 'Bảng lương' (hoặc giá trị thật trong CFG)
kyLuongHienTai_() → string

// PhongBanXuat.gs — cùng project
plSerialize_(o) → safe object

// BangLuong.gs — cùng project
COLS, GATE_COLS, plAssertHeadersUnique_
```

### 2.4 Hàm mới: `pvTaiPDF`

**Thêm vào `PhieuLuongXem.gs`**, đặt ngay trước `/* ======== MENU ENTRY POINT ======== */` (trước dòng `function xemTruocPhieuLuong()`, khoảng dòng 295).

```js
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
      var pattern = '<<' + tag2 + '>>';
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
```

### 2.5 Sửa `PhieuLuongXem.html` — thêm nút PDF

**Vị trí CSS:** thêm vào cuối block CSS (trước `</style>`, khoảng dòng 273):

```css
/* ===== PDF BUTTON ===== */
#btnPDF {
  flex-shrink: 0;
  font-size: 12px;
  padding: 5px 10px;
  border: 1px solid #188038;
  border-radius: 4px;
  background: #fff;
  color: #188038;
  cursor: pointer;
  white-space: nowrap;
  font-weight: 600;
  transition: background 0.1s;
}
#btnPDF:hover:not(:disabled) { background: #e6f4ea; }
#btnPDF:disabled { opacity: 0.45; cursor: default; }
```

**Vị trí HTML:** thêm nút vào topbar, **sau** `</div><!-- /sourceBtns -->` (dòng ~286), **trước** `</div><!-- /topbar -->` (dòng ~287):

```html
  <button id="btnPDF" disabled>📄 Tải PDF</button>
```

**Vị trí JS:** thêm handler **sau** `$('btnToggleB').addEventListener(...)` (dòng ~383), **trước** comment `// Load data`:

```js
  $('btnPDF').addEventListener('click', taiPDF);
```

**Enable nút:** trong `onDataLoad`, sau `renderPhieu(startCode)`:

```js
  $('btnPDF').disabled = false;
```

**Hàm `taiPDF`** — thêm vào cuối `<script>`, trước `</script>`:

```js
/* ===== PDF DOWNLOAD ===== */
function taiPDF() {
  if (!gCurrentCode) return;
  var btn = $('btnPDF');
  var origText = btn.textContent;
  btn.textContent = 'Đang xuất…';
  btn.disabled = true;

  google.script.run
    .withSuccessHandler(function(res) {
      btn.textContent = origText;
      btn.disabled = false;

      if (!res || res.error) {
        showAlert('err', 'Lỗi xuất PDF: ' + (res ? res.error : 'không rõ'));
        return;
      }

      // Render download link
      var link = document.createElement('a');
      link.href = res.dataUri;
      link.setAttribute('download', res.filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    })
    .withFailureHandler(function(err) {
      btn.textContent = origText;
      btn.disabled = false;
      showAlert('err', 'Lỗi xuất PDF: ' + ((err && err.message) ? err.message : String(err)));
    })
    .pvTaiPDF(gCurrentCode);
}
```

### 2.6 Edge cases

| Case | Xử lý |
|------|-------|
| Tag trong Doc không khớp COLS | `tagMap[tag] = ''` → replaceText xoá tag thành rỗng |
| Giá trị ô trống/null | `pvFmt_` trả `PV_BO_DONG_` → replace bằng `''` |
| Doc không có header/footer | `try/catch` → skip |
| `replaceText` trên body không chạm header | Gọi riêng `header.replaceText` + `footer.replaceText` (bẫy đã biết) |
| File tạm crash giữa chừng | `finally` block trash copyId; `xlDonRac_` quét prefix `__PL_TMP_pdf_` (drive search) |
| Số `23.5` → hiện `23,5` | `pvFmt_` format vi-VN tự xử lý |
| `replaceText` regex special chars | Tag chỉ chứa text Việt + space — không có regex metachar |

### 2.7 Self-check sau khi code

1. Grep `pvTaiPDF` → ≥2 (hàm + call trong HTML handler)
2. Grep `innerHTML` trong PhieuLuongXem.gs → 0 kết quả
3. Grep `innerHTML` trong PhieuLuongXem.html → 0 kết quả
4. Grep `window.open` trong PhieuLuongXem.html → 0 kết quả
5. Grep `makeCopy` → đúng 1 chỗ trong `pvTaiPDF`
6. Grep `setTrashed` → có trong finally block
7. Grep `getHeader\|getFooter` → có trong pvTaiPDF (bẫy đã biết)
8. Nút `btnPDF` nằm trong `#topbar`
9. `showAlert` đã có sẵn trong HTML (dùng chung hàm hiện tại)

---

## 3. Thứ tự thực thi

| # | Task | File sửa | Ước tính | Song song? |
|---|------|----------|----------|------------|
| 1 | **G3-T14** tab cá nhân Excel | `PhongBanXuat.gs` | 30' | ✅ |
| 2 | **G3-T12** PDF từng phiếu | `PhieuLuongXem.gs` + `.html` | 30' | ✅ |

Hai task sửa file khác nhau → spawn 2 subagent Sonnet song song.

---

## 4. Kiểm tra manual sau khi code (chị Trang hoặc Minh)

### G3-T14
1. Menu → Xuất Excel theo Team → chọn 1 team → Tải ZIP
2. Mở file xlsx → tab đầu = `TH — {Team}` (bảng tổng hợp)
3. Các tab sau = `HN0001`, `HN0002`, ... (phiếu cá nhân key-value)
4. So tab phiếu với preview trên modal → cùng dòng, cùng thứ tự, cùng số

### G3-T12
1. Menu → Xem trước phiếu lương → chọn 1 NV
2. Bấm nút `📄 Tải PDF` → file PDF tải về
3. Mở PDF → không có `<<...>>` nào sót
4. So PDF ↔ preview → cùng dòng, cùng số
5. Drive → tìm `__PL_TMP_pdf_` → 0 kết quả
