/**
 * PalFish — BIGQUERY QUA SERVICE ACCOUNT (dùng chung cho mọi file .gs trong project)
 *
 * VÌ SAO CÓ FILE NÀY:
 *   Advanced Service `BigQuery.Jobs.*` luôn chạy dưới danh tính NGƯỜI BẤM MENU.
 *   Chị Trang không có quyền BQ `pf-salary` → mọi thao tác đọc/ghi BQ bị chặn.
 *   File này thay bằng REST + Service Account: script tự xác thực BQ như 1 "robot",
 *   KHÔNG phụ thuộc quyền của người chạy. Ai bấm cũng chạy được.
 *
 * CÀI ĐẶT (làm 1 lần — xem cuối file để biết chi tiết roles):
 *   Apps Script → ⚙ Project Settings → Script Properties, thêm 2 property:
 *     SA_CLIENT_EMAIL = client_email trong file JSON key của service account
 *     SA_PRIVATE_KEY  = private_key   trong file JSON key (dán nguyên, gồm cả
 *                       -----BEGIN PRIVATE KEY----- ... -----END PRIVATE KEY-----)
 *   Không cần bật Advanced Service BigQuery nữa (dùng UrlFetchApp thuần).
 *
 * TEST: mở file này trong editor, chọn hàm `bqTestKetNoi` ở dropdown → Run.
 */

var BQ_API_ = 'https://bigquery.googleapis.com/bigquery/v2';
var BQ_SCOPE_ = 'https://www.googleapis.com/auth/bigquery';

/**
 * Lấy access token của Service Account (JWT RS256 → OAuth token).
 * Cache 55 phút để không phải ký lại mỗi lần gọi.
 */
function bqAccessToken_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('BQ_SA_TOKEN');
  if (cached) return cached;

  var props = PropertiesService.getScriptProperties();
  var email = props.getProperty('SA_CLIENT_EMAIL');
  var key = props.getProperty('SA_PRIVATE_KEY');
  if (!email || !key) {
    throw new Error('Thiếu SA_CLIENT_EMAIL / SA_PRIVATE_KEY trong Script Properties. ' +
      'Vào ⚙ Project Settings → Script Properties để thêm (xem hướng dẫn đầu file BqAuth.gs).');
  }
  // Nếu key được dán dưới dạng có \n escaped (thường gặp khi copy từ JSON), đổi về xuống dòng thật.
  if (key.indexOf('\\n') >= 0) key = key.replace(/\\n/g, '\n');

  var now = Math.floor(Date.now() / 1000);
  var b64u = function(s) {
    return Utilities.base64EncodeWebSafe(s).replace(/=+$/, '');
  };
  var header = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  var claim = b64u(JSON.stringify({
    iss: email,
    scope: BQ_SCOPE_,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  }));
  var unsigned = header + '.' + claim;
  var sigBytes = Utilities.computeRsaSha256Signature(unsigned, key);
  var jwt = unsigned + '.' + Utilities.base64EncodeWebSafe(sigBytes).replace(/=+$/, '');

  var resp = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    payload: {
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    },
    muteHttpExceptions: true
  });
  var body = JSON.parse(resp.getContentText());
  if (!body.access_token) {
    throw new Error('Lấy token Service Account thất bại: ' + resp.getContentText());
  }
  cache.put('BQ_SA_TOKEN', body.access_token, 3300); // 55 phút
  return body.access_token;
}

/**
 * Chạy 1 câu SELECT/DML, trả về { schema:{fields:[{name}]}, rows:[{f:[{v}]}] }
 * — ĐÚNG shape mà code cũ (BigQuery.Jobs.query) trả về, nên chỗ đọc kết quả không đổi.
 * Tự gộp mọi trang (pageToken) nên bền cả khi số dòng lớn hơn 1 trang.
 */
function bqQuery_(sql, projectId) {
  var token = bqAccessToken_();
  var resp = UrlFetchApp.fetch(BQ_API_ + '/projects/' + projectId + '/queries', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify({ query: sql, useLegacySql: false, timeoutMs: 60000, maxResults: 5000 }),
    muteHttpExceptions: true
  });
  var res = JSON.parse(resp.getContentText());
  if (res.error) throw new Error('BQ query lỗi: ' + (res.error.message || resp.getContentText()));

  var jobRef = res.jobReference || {};
  var loc = jobRef.location;

  // Đợi job xong (query nặng có thể chưa complete ngay).
  while (!res.jobComplete) {
    Utilities.sleep(1000);
    res = bqGetQueryResults_(token, projectId, jobRef.jobId, loc, null);
  }

  var schema = res.schema;
  var rows = res.rows || [];
  var pageToken = res.pageToken;
  while (pageToken) {
    var pg = bqGetQueryResults_(token, projectId, jobRef.jobId, loc, pageToken);
    if (pg.rows) rows = rows.concat(pg.rows);
    pageToken = pg.pageToken;
  }
  return { schema: schema, rows: rows };
}

function bqGetQueryResults_(token, projectId, jobId, location, pageToken) {
  var url = BQ_API_ + '/projects/' + projectId + '/queries/' + jobId + '?maxResults=5000';
  if (location) url += '&location=' + encodeURIComponent(location);
  if (pageToken) url += '&pageToken=' + encodeURIComponent(pageToken);
  var r = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true
  });
  var body = JSON.parse(r.getContentText());
  if (body.error) throw new Error('BQ getQueryResults lỗi: ' + (body.error.message || r.getContentText()));
  return body;
}

/**
 * Nạp NDJSON vào 1 bảng BQ bằng load job (multipart upload) rồi đợi xong.
 * `jobResource` = { configuration:{ load:{ destinationTable, sourceFormat, ... , schema } } }
 * `ndjson`      = chuỗi nhiều dòng JSON (mỗi dòng 1 bản ghi).
 * Giữ nguyên semantics của load job cũ (WRITE_APPEND / CREATE_IF_NEEDED).
 */
function bqLoadJson_(jobResource, ndjson, projectId) {
  var token = bqAccessToken_();
  var boundary = 'bqb' + Utilities.getUuid().replace(/-/g, '');
  var body = '--' + boundary + '\r\n' +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(jobResource) + '\r\n' +
    '--' + boundary + '\r\n' +
    'Content-Type: application/octet-stream\r\n\r\n' +
    ndjson + '\r\n' +
    '--' + boundary + '--';

  var up = UrlFetchApp.fetch(
    'https://bigquery.googleapis.com/upload/bigquery/v2/projects/' + projectId + '/jobs?uploadType=multipart',
    {
      method: 'post',
      contentType: 'multipart/related; boundary=' + boundary,
      payload: body,
      headers: { Authorization: 'Bearer ' + token },
      muteHttpExceptions: true
    });
  var res = JSON.parse(up.getContentText());
  if (res.error) throw new Error('BQ load job lỗi: ' + (res.error.message || up.getContentText()));

  var jobId = res.jobReference.jobId;
  var loc = res.jobReference.location;
  var status = bqJobGet_(token, projectId, jobId, loc);
  while (status.status.state !== 'DONE') {
    Utilities.sleep(1500);
    status = bqJobGet_(token, projectId, jobId, loc);
  }
  if (status.status.errorResult) {
    throw new Error(status.status.errorResult.message);
  }
  return status;
}

function bqJobGet_(token, projectId, jobId, location) {
  var url = BQ_API_ + '/projects/' + projectId + '/jobs/' + jobId;
  if (location) url += '?location=' + encodeURIComponent(location);
  var r = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true
  });
  var body = JSON.parse(r.getContentText());
  if (body.error) throw new Error('BQ jobs.get lỗi: ' + (body.error.message || r.getContentText()));
  return body;
}

/**
 * TEST kết nối: chọn hàm này ở dropdown editor → Run.
 * Xanh = SA cấu hình đúng, đọc được BQ. Đỏ = xem message để biết thiếu gì.
 */
function bqTestKetNoi() {
  var proj = (typeof CFG !== 'undefined' && CFG.bqProject) ? CFG.bqProject : 'pf-salary';
  var res = bqQuery_('SELECT 1 AS ok', proj);
  var ok = res.rows && res.rows[0] && res.rows[0].f[0].v;
  var msg = 'Kết nối BigQuery qua Service Account OK. SELECT 1 = ' + ok +
    '\nProject: ' + proj;
  Logger.log(msg);
  try { SpreadsheetApp.getActiveSpreadsheet().toast(msg, '✓ BQ SA', 8); } catch (e) {}
  return msg;
}

/* ============================================================================
 * HƯỚNG DẪN TẠO SERVICE ACCOUNT (làm 1 lần, phía GCP — anh Minh)
 *
 * 1. GCP Console → project `pf-salary` → IAM & Admin → Service Accounts → Create.
 *    Tên gợi ý: sheet-payroll-reader.
 * 2. Cấp role (Grant access, cùng project pf-salary):
 *      - BigQuery Job User        (roles/bigquery.jobUser)   → tạo job query/load
 *      - BigQuery Data Editor     (roles/bigquery.dataEditor) trên dataset `payroll`
 *        (đọc view C_view_*, ghi bảng M_*_archive). Nếu muốn chặt hơn: cấp
 *        Data Viewer cho các view đọc + Data Editor chỉ cho 2 bảng M_*_archive.
 * 3. Vào service account vừa tạo → Keys → Add key → Create new key → JSON → tải về.
 * 4. Mở file JSON, copy `client_email` và `private_key` vào Script Properties
 *    (SA_CLIENT_EMAIL / SA_PRIVATE_KEY). KHÔNG commit file JSON vào repo.
 * 5. Chạy `bqTestKetNoi` để xác nhận. Xong → chị Trang bấm menu chạy được.
 *
 * BẢO MẬT: key chỉ nằm trong Script Properties của project này. Xoay key khi cần
 * (tạo key mới, cập nhật property, xoá key cũ). SA chỉ có quyền dataset payroll,
 * KHÔNG cấp quyền BQ cho tài khoản người dùng nào.
 * ==========================================================================*/
