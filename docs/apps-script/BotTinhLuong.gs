/**
 * Bot tính lương — gọi Cloud Run Job tính lại lương, poll kết quả, tự cập nhật Sheet.
 * Chung viết phần Cloud Run + trigger. Minh thêm modal dialog thay toast.
 */

var CLOUD_RUN_CFG = {
  project: 'pf-salary',
  region: 'asia-southeast1',
  jobName: 'luong-payroll-job',
};

function chayTinhLuong() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();
  var props = PropertiesService.getScriptProperties();

  if (props.getProperty('TINH_LUONG_DANG_CHAY') === '1') {
    ui.alert('Đang có 1 lượt tính lương chạy rồi, đợi xong đã (thử lại sau vài phút).');
    return;
  }

  var xacNhan = ui.alert('Tính lương?',
    'Việc này sẽ TÍNH LẠI toàn bộ lương tháng và GHI ĐÈ số liệu trong BigQuery, ' +
    'sau đó Sheet sẽ TỰ ĐỘNG cập nhật lại. Mất khoảng 5-8 phút. Tiếp tục?',
    ui.ButtonSet.YES_NO);
  if (xacNhan !== ui.Button.YES) return;

  try {
    var token = runAccessToken_();
    var url = 'https://run.googleapis.com/v2/projects/' + CLOUD_RUN_CFG.project +
      '/locations/' + CLOUD_RUN_CFG.region + '/jobs/' + CLOUD_RUN_CFG.jobName + ':run';
    var resp = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token },
      payload: '{}',
      muteHttpExceptions: true
    });
    var body = JSON.parse(resp.getContentText());
    if (resp.getResponseCode() >= 300 || body.error) {
      throw new Error(body.error ? body.error.message : resp.getContentText());
    }

    xoaTriggerTinhLuong_();
    props.setProperty('TINH_LUONG_DANG_CHAY', '1');
    props.setProperty('TINH_LUONG_BAT_DAU', String(Date.now()));

    ScriptApp.newTrigger('kiemTraTinhLuongXongChua_').timeBased().everyMinutes(1).create();

    var html = HtmlService.createHtmlOutputFromFile('Dialog tính lương')
        .setWidth(380).setHeight(220);
    ui.showModalDialog(html, 'Cập nhật bảng lương');
  } catch (e) {
    ui.alert('Không gọi được Cloud Run: ' + e.message);
  }
}

function kiemTraTinhLuongXongChua_() {
  var props = PropertiesService.getScriptProperties();
  var batDau = Number(props.getProperty('TINH_LUONG_BAT_DAU') || 0);

  if (batDau && (Date.now() - batDau) > 20 * 60 * 1000) {
    props.deleteProperty('TINH_LUONG_DANG_CHAY');
    props.deleteProperty('TINH_LUONG_BAT_DAU');
    xoaTriggerTinhLuong_();
    SpreadsheetApp.getActiveSpreadsheet().toast('Tính lương quá 20 phút chưa xong — kiểm tra lại trên Cloud Run Console.', 'Lỗi', 15);
    return;
  }

  var token = runAccessToken_();
  var url = 'https://run.googleapis.com/v2/projects/' + CLOUD_RUN_CFG.project +
    '/locations/' + CLOUD_RUN_CFG.region + '/jobs/' + CLOUD_RUN_CFG.jobName;
  var resp = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true });
  var body = JSON.parse(resp.getContentText());
  if (body.error) return;

  var exec = body.latestCreatedExecution;
  if (!exec || !exec.completionTime) return;

  props.deleteProperty('TINH_LUONG_DANG_CHAY');
  props.deleteProperty('TINH_LUONG_BAT_DAU');
  xoaTriggerTinhLuong_();

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (exec.completionStatus === 'EXECUTION_SUCCEEDED') {
    capNhatTuBigQuery();
    ss.toast('Tính lương xong, đã tự cập nhật bảng lương.', '✓', 8);
  } else {
    ss.toast('Tính lương BỊ LỖI (' + exec.completionStatus + ') — xem Cloud Run Console. KHÔNG cập nhật bảng lương.', 'Lỗi', 15);
  }
}

function xoaTriggerTinhLuong_() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'kiemTraTinhLuongXongChua_') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
}

function dangTinhLuong() {
  return PropertiesService.getScriptProperties()
      .getProperty('TINH_LUONG_DANG_CHAY') === '1';
}

function xoaCoTinhLuongBiKet() {
  PropertiesService.getScriptProperties().deleteProperty('TINH_LUONG_DANG_CHAY');
  PropertiesService.getScriptProperties().deleteProperty('TINH_LUONG_BAT_DAU');
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'kiemTraTinhLuongXongChua_') ScriptApp.deleteTrigger(triggers[i]);
  }
  Logger.log('Đã xoá cờ + trigger bị kẹt.');
}
