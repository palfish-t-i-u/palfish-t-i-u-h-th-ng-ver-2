# Ghi ngược "NV xác nhận" về Google Sheet (tức thì) — G1-T11

> Ngày: 2026-08-25 · Trạng thái: CODE XONG (BE + Apps Script) · Chờ deploy Web App + set env

## Vấn đề
NV bấm "Xác nhận" phiếu lương in-app → chỉ ghi Supabase, **không** tick ngược ô "NV xác nhận trước/sau thuế" trên sheet Bảng lương. Contract đã thiết kế chiều này (`PHIEU_LUONG_CONTRACT.md`) nhưng **chưa build**.

## Hướng đã chọn: BE **push** → Apps Script **Web App** (tức thì ~1s)
Không tạo service account mới, không đổi scope, không share Editor. Mọi thao tác chạm sheet nằm trong Apps Script (single-writer), tick **sống qua refresh BQ** nhờ ghi `_gate_state`.

```
NV bấm Xác nhận → BE ghi Supabase (confirm_status=confirmed)
   ↓ BackgroundTasks (sau response, best-effort)
BE POST {secret, code, ky_luong, stage} → Apps Script Web App doPost
   ↓ (LockService)
   gSaveState_(code, ky, 'NV xác nhận <stage>', true)   ← nguồn chân lý
   gTickConfirmCell_(...)  → tick ô trên bảng chính      ← hiện ~1s
```

## Đã code (repo)

### Backend — `backend/payroll_routes.py`
- `_push_confirm_to_gate(code, ky_luong, stage)`: POST tới env `PAYSLIP_GATE_WEBAPP_URL`, secret = `GATE_TOKEN`, httpx timeout 8s, **best-effort** (nuốt mọi lỗi; env trống → no-op).
- `confirm_payslip` nhận `BackgroundTasks`, enqueue push sau khi update DB.
- `GET /payslips/confirmations?ky_luong=` (auth `X-Gate-Token`): trả `[{code,stage,ky_luong,confirmed_at}]` các phiếu đã confirm — **không** kèm tiền lương. Khai báo **trước** `/payslips/{payslip_id}` để không bị bắt nhầm làm id.
- Test: `backend/tests/test_payroll_view.py` — push fired đúng code/ky/stage; confirmations lọc confirmed + theo kỳ; sai token 401. **13/13 pass.**

### Apps Script — `docs/apps-script/PhieuLuongGate.gs`
- `doPost(e)`: verify `body.secret == GATE_CFG.gateToken` → map stage→cột → `gSaveState_` + `gTickConfirmCell_` (LockService 20s). `setValue` KHÔNG kích trigger (như `restoreGateTicks_`).
- `gTickConfirmCell_(code, ky, header)`: tick ô cho mã NV, chỉ khi sheet đang ở đúng kỳ.
- `pullConfirmsFromApp()` + menu `🔃 Đồng bộ xác nhận từ app`: lưới an toàn nếu 1 push rớt mạng.

### Apps Script — `docs/apps-script/BangLuong.gs`
- Nối `restoreGateTicks_(main)` vào cuối `capNhatTuBigQuery` → tick sống qua refresh (vá luôn dead-code: trước đây tick tay của Trang cũng mất khi refresh).

## Việc anh phải làm (deploy)

1. **Paste 2 file** `.gs` đã sửa vào Apps Script editor của Sheet "Bảng lương tự động":
   - `PhieuLuongGate.gs` (thêm `doPost`, `gTickConfirmCell_`, `pullConfirmsFromApp`, `CONFIRM_COL_BY_STAGE`, `_gateJsonOut_`, `gConfirmationsUrl_`)
   - `BangLuong.gs` (1 dòng `restoreGateTicks_` + 1 menu item)
2. **Deploy Web App**: Apps Script → **Deploy → New deployment** → chọn type **Web app** →
   - *Execute as*: **Me**
   - *Who has access*: **Anyone**
   - → **Deploy** → copy **Web app URL** (dạng `https://script.google.com/macros/s/XXXX/exec`).
3. **Set env Render** (backend prod): `PAYSLIP_GATE_WEBAPP_URL = <URL vừa copy>`. (Đảm bảo `GATE_TOKEN` đã set — cùng token cổng receive.)
4. **Kiểm tra**: mở phiếu 1 NV → bấm Xác nhận → trong ~1s ô "NV xác nhận trước thuế" tự tick trên sheet. Chạy menu `🔄 Cập nhật bảng lương` → tick **vẫn còn**.
5. Nếu 1 lần push rớt → menu `🔃 Đồng bộ xác nhận từ app` kéo lại.

⚠ **Deploy lại Web App**: mỗi lần sửa code Apps Script muốn URL cũ vẫn chạy code mới → **Deploy → Manage deployments → (edit) → Version: New version**. Nếu tạo deployment mới sẽ ra URL mới (phải cập nhật lại env).

## Guardrail đã giữ
- 0 service account mới, 0 secret mới (tái dùng `GATE_TOKEN`), 0 đổi scope.
- Push best-effort — không bao giờ làm hỏng thao tác confirm.
- `_gate_state` là nguồn chân lý; tick sống qua refresh.
- Endpoint confirmations không lộ payload lương.
- `doPost` + `capNhatTuBigQuery` cùng `LockService.getDocumentLock` → không đua ghi.

## Đánh giá 5 tiêu chí
1. **Triệt để** — ✅ Tức thì, đúng cột theo stage, sống qua refresh, có lưới an toàn.
2. **Không lỗi con** — ✅ Route order đúng; push không raise; single-writer; lock chống đua.
3. **Không tăng gánh nặng hạ tầng** — ✅ 0 SA/secret/scope; 1 Web App (free) + 1 env.
4. **Tối ưu token** — ✅ Tái dùng helper Apps Script + token sẵn có.
5. **Bền qua compact** — ✅ Doc này self-contained (code + bước deploy).
