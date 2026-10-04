# PLAN: Cổng gửi phiếu lương — chống mất tick khi gửi (P1) + khóa ô đã gửi (P2) — 2026-10-04

> **TRẠNG THÁI 2026-10-04 (cập nhật sau khi dựng lại trên nền live):**
> P1+P2 ĐÃ CODE XONG (branch `fix/payslip-gate-tick`, nền mới `61ff6ac`). T0–T4 done, syntax pass (`node --check`), guardrail G1–G8 pass. **CÒN LẠI: T5 deploy (dán `.gs` vào Apps Script Editor + push) + T6 test matrix.**
> ⚠ Nền live đã đổi từ lúc viết plan: thêm `gApplyTruocThue_` (việc 2/10 của anh). Số dòng mục 4/5 bên dưới là nền CŨ (patch) — nền mới xem map:
> - `guiPhieuOnEdit` 61–270 (LockService 82–89 + 264–266); `reTickTrue`/`relocked` 128–129; 2a 145–156; 2b 186–199; batch reTick 236–239; toast relocked 246, 260.
> - `reconcileOutbox` 335–420 (**thêm so patch:** dòng 384 `gApplyTruocThue_` cho tầng truoc_thue — khớp `guiPhieuOnEdit`/`gEnqueueRow_`; patch cũ thiếu vì viết trước việc 2/10).
> - `restoreGateTicks_` 472–516 (gọi `_forceSentTicks_(main)` dòng 510); `_forceSentTicks_` 518–568; `healSentTicks` 570–582.
> - BangLuong menu: 2 item mới sau dòng 144.

> **ĐỌC TRƯỚC KHI LÀM** (dành cho agent thực thi, kể cả sau compaction / agent mới):
> - Mở lại & VERIFY khớp mục 4 trước khi sửa:
>   - `docs/apps-script/PhieuLuongGate.gs` — `guiPhieuOnEdit` (dòng 61–244), `reconcileOutbox` (302–364), `restoreGateTicks_` (429–468), `gSaveState_` (504–521), `SEND_STEPS` (44–47), `GATE_COLS` (50–53).
>   - `docs/apps-script/BangLuong.gs` — menu `⚙ Bảng lương` (111–131), `capNhatTuBigQuery` gọi `restoreGateTicks_(main)` (dòng 362).
> - Invariant top KHÔNG được phá:
>   1. **Mọi ghi cell đi QUA Apps Script** (single-writer). BE cấm ghi cell thẳng. (learning `gate-writeback-via-appsscript-not-be-direct.md`)
>   2. **Ghi `_gate_state` TRƯỚC, tick cell SAU** — `_gate_state` là nguồn chân lý sống qua refresh BQ.
>   3. **`setValue` KHÔNG kích `guiPhieuOnEdit`** (installable onEdit) → tick-lại/heal không enqueue lại. Giữ nguyên tính chất này.
>   4. **`GATE_COLS.length === 5`** — guard dòng 63 ném lỗi nếu lệch. Không `.push` lên GATE_COLS.
> - ⚠ File `.gs` trong repo là **BẢN SAO**. Sửa xong PHẢI dán vào Apps Script Editor của sheet "Bảng lương" mới có hiệu lực. Xem T5.
> - Gặp STOP condition (mục cuối) → DỪNG, hỏi user, KHÔNG tự quyết.

---

## 1. Vấn đề & bằng chứng

Hai bug độc lập trên cổng gửi phiếu lương (Apps Script gắn sheet "Bảng lương", kỳ 2026-09).

### P1 — Tick "Gửi" xong phiếu không vào hàng đợi (Chung báo)
- **Triệu chứng:** HR tick ô "Gửi BL …" nhưng phiếu không xuất hiện trong `_outbox` → không gửi được sang app.
- **Root cause (xác minh bằng đọc code):**
  - `guiPhieuOnEdit` append vào `_outbox` bằng `ob.getRange(ob.getLastRow()+1, …).setValues(obAppends)` (PhieuLuongGate.gs:193–195). Trigger `onEdit` là **installable** (BangLuong tạo tại `installGateTriggers`, PhieuLuongGate.gs:478). Hai lần tick sát nhau = 2 execution chạy chồng → cùng đọc `getLastRow()` → ghi đè nhau → **mất dòng**. Không có khóa ở bản LIVE.
  - Phụ: tick "Gửi" khi cột điều kiện chưa tick → bị chặn & tự bỏ tick (PhieuLuongGate.gs:145–150). Đúng thiết kế tuần tự nhưng gây hiểu nhầm "tick không ăn".
- **Trạng thái fix:** Bản vá đã nằm trong **working tree (CHƯA commit, CHƯA deploy)**:
  - `git diff --stat` = `PhieuLuongGate.gs +85`, `BangLuong.gs +1`.
  - `git show HEAD:…PhieuLuongGate.gs | grep -c "reconcileOutbox|LockService.getDocumentLock"` = **2** (chỉ doPost + pullConfirmsFromApp cũ).
  - Worktree grep = **5** → +3 = `LockService` trong `guiPhieuOnEdit` (dòng 84–89, 238–240) + `reconcileOutbox` (dòng 302–364, tự có LockService).
  - BangLuong.gs:126 đã thêm menu `🧹 Xếp lại hàng đợi (quét bù tick sót)` → `reconcileOutbox`.
  - ⇒ P1 **không cần viết code mới**; cần commit + deploy + verify.

### P2 — Ô "Gửi" đã gửi rồi vẫn bỏ tick được → sheet lệch app (11 người kỳ 2026-09)
- **Triệu chứng:** 11 người ĐÃ nhận phiếu (có trong app + `_outbox` status=`sent`) nhưng ô "Gửi BL sau thuế" trên sheet đã nhả về ✗. Sheet báo "chưa gửi" sai.
- **Root cause (xác minh code + data):**
  - `_outbox` kỳ 2026-09 = 52 dòng, tất cả `sent`; DB app = 44 sau_thue + 8 truoc_thue = 52 (khớp). Sheet tick "Gửi BL sau thuế" ✔ chỉ 33 → **lệch 11**.
  - `guiPhieuOnEdit` KHÔNG có chốt "đã gửi thì khóa": bỏ tick ô "Gửi" đi vào nhánh `if (!val) { states[header]=false; continue; }` (PhieuLuongGate.gs:144) — ghi state=false, không kiểm `_outbox` đã `sent` hay chưa.
  - Interlock (PhieuLuongGate.gs:171–179): bỏ tick ô điều kiện mà ô "Gửi" phụ thuộc đang ✔ → tự thu hồi ("Gửi" về false) kể cả khi đã `sent`.
  - **Bằng chứng người (không phải script tự nhảy):** `_gate_state` kỳ 2026-09 lưu `"Gửi BL sau thuế": false` cho HN0028/HN0147/HN0115; riêng HN0115 còn `"NV xác nhận sau thuế": true` (app ghi qua `doPost`) → không thể xác nhận phiếu chưa gửi ⇒ đã gửi rồi tick mới rụng. `_gate_state=false` (không phải trống) chỉ được ghi bởi 1 thao tác bỏ tick chạy qua `guiPhieuOnEdit`; refresh/dựng bảng bằng máy KHÔNG kích installable onEdit (PhieuLuongGate.gs:427 ghi rõ) → loại trừ "refresh gây false".
  - **P2 ≠ lỗi Chung báo.** Chung = chưa gửi được (P1). P2 = đã gửi rồi tick rụng (ngược chiều).
- **Vì sao tick tay không cứu được:** re-tick "Gửi" của dòng đã `sent` → chốt dòng 154 `continue` TRƯỚC khi set state=true → không resend (an toàn) nhưng cũng không cập nhật `_gate_state` → lần refresh BQ tới `restoreGateTicks_` chỉ tick lại TRUE-từ-state (dòng 464) → ô lại rụng. ⇒ phải sửa `_gate_state` + khóa, không tick tay.

---

## 2. Approach chọn + 5-criteria

**Approach:** Giữ toàn bộ sửa chữa TRONG Apps Script (single-writer).
- **P1:** commit + deploy bản vá working-tree (LockService + reconcileOutbox + menu). Không viết mới.
- **P2:** thêm "khóa sau khi gửi" — `_outbox` status=`sent` ⇒ ô "Gửi BL <tầng>" là bất biến: (2a) chặn bỏ tick trực tiếp, (2b) interlock không thu hồi ô đã gửi, (2c) `restoreGateTicks_` tự-lành mỗi refresh (ép tick + state TRUE cho dòng `sent`), (2d) 1 nút menu chạy ngay phần (2c) để sửa 11 ca hiện tại không cần refresh full.

```
TC1 Triệt để:      ✅ khóa 2 chiều (chặn untick tức thì + tự-lành mỗi refresh) → sheet vĩnh viễn khớp app; sửa cả 11 ca cũ
TC2 Không lỗi con: ✅ chỉ khóa ô "Gửi" khi _outbox=sent; không đụng cột xác nhận/điều kiện; setValue không enqueue lại; re-tick sent không resend (chốt dòng 154 vẫn chạy)
TC3 Hạ tầng/perf:  ✅ FE-sheet-only, không BE/DB/migration; restoreGateTicks_ đọc thêm _outbox 1 lần/refresh (rẻ); không thêm dịch vụ
TC4 Token economy: ✅ 1 session, 0 subagent fan-out (code tập trung 1 file .gs); P1 chỉ deploy
TC5 Task-model:    ✅ P2 đụng guiPhieuOnEdit (nhiều invariant) → Opus; P1 cơ học → inline
→ Recommend (5/5)
```
(Đã loại: **BE ghi cell thẳng để sync** — vi phạm invariant single-writer + phải re-implement `_gate_state` bằng Python + coupling layout sheet; learning `gate-writeback-via-appsscript-not-be-direct.md` cấm. Đã loại: **chỉ tick tay 11 ca** — không bền, rụng lại sau refresh như mục 1 đã chứng minh.)

---

## 3. GUARDRAILS — invariant PHẢI GIỮ

| # | Quy tắc không được phá | Nguồn | Cách kiểm |
|---|------------------------|-------|-----------|
| G1 | Mọi ghi cell qua Apps Script; BE không ghi thẳng | learning `gate-writeback-via-appsscript-not-be-direct.md` | review: sửa chỉ trong `*.gs`, không đụng `backend/payroll_routes.py` |
| G2 | Ghi `_gate_state` TRƯỚC khi tick/ghi cell | cùng learning (dòng 11) | đọc code (2a)/(2c): `gSaveState_`/set state rồi mới `setValue` |
| G3 | `setValue` không được kích `guiPhieuOnEdit` → không enqueue/flush lại | PhieuLuongGate.gs:427,630 | (2c)/(2d) chỉ dùng `setValue`; verify re-tick sent KHÔNG tạo dòng `_outbox` mới |
| G4 | `GATE_COLS.length === 5`, không `.push` | PhieuLuongGate.gs:54,63 | grep `GATE_COLS`; chạy thử onEdit không ném lỗi length |
| G5 | Re-tick/heal ô đã `sent` KHÔNG gửi trùng | PhieuLuongGate.gs:154,283,383 | test: heal 1 dòng sent → `_outbox` không thêm dòng, flush bỏ qua (status vẫn sent) |
| G6 | Chốt tuần tự cũ còn nguyên cho ô CHƯA gửi (chưa `sent` vẫn chặn/thu hồi như cũ) | PhieuLuongGate.gs:145–150,171–179 | test: ô pending/ chưa gửi vẫn untick được bình thường |
| G7 | Match `_outbox` theo cột `id` (A, chuỗi `code\|ky\|stage`), KHÔNG theo cột `ky` (D, bị Sheets ép thành Date) | learning `sheets-auto-parses-yyyy-mm-to-date.md`; PhieuLuongGate.gs:441–444 | review (2c): parse `id` split `\|`, không đọc col ky |
| G8 | Date-parse kỳ trong `restoreGateTicks_` giữ nguyên (dòng 441–444) | PhieuLuongGate.gs:439–445 | diff không đụng block đó |

---

## 4. Hiện trạng (ground truth snapshot)

**P2-2a — nhánh bỏ tick ô "Gửi" (CHƯA có chốt sent):**
```js
// PhieuLuongGate.gs:143-150  (bên trong `if (sendStep) {`)
if (sendStep) {
  if (!val) { stIdx[stKey].states[header] = false; continue; }   // ← 144: bỏ tick = state false, không kiểm sent
  if (cReq && rowData[cReq - 1] !== true) {
    cellFalse.push(row);
    stIdx[stKey].states[header] = false;
    blocked++;
    continue;
  }
```

**P2-2b — interlock thu hồi (CHƯA kiểm sent):**
```js
// PhieuLuongGate.gs:170-179
// (B) Cột là ĐIỀU KIỆN cho một nút gửi
if (reqStep) {
  stIdx[stKey].states[header] = val;
  if (!val && cSend && rowData[cSend - 1] === true) {   // ← 173: thu hồi kể cả khi đã sent
    cellFalse.push(row);
    stIdx[stKey].states[reqStep.send] = false;
    revoked++;
  } else if (val) { confirmed++; }
  continue;
}
```

**P2-2c — restoreGateTicks_ (chỉ re-tick TRUE-từ-state, chưa heal theo _outbox sent):**
```js
// PhieuLuongGate.gs:458-466
for (var r = 0; r < codes.length; r++) {
  var states2 = byCode[String(codes[r][0])];
  if (!states2) continue;
  for (var h in states2) {
    if (GATE_COLS.indexOf(h) < 0) continue;
    var cc = hmap[h];
    if (cc && states2[h] === true) main.getRange(r + 2, cc).setValue(true);
  }
}
// ← SAU vòng này: chèn heal từ _outbox sent (T3)
```

**_outbox index helper (dùng lại cho heal):**
```js
// PhieuLuongGate.gs:568-576
function gOutboxIndex_(ob) { … idx[id] = { row: i+1, status: data[i][5] }; … }
// col 0 = id (code|ky|stage), col 5 = status
```

**Menu (thêm 1 item cho T4):**
```js
// BangLuong.gs:125-130
.addItem('🔌 Cài đặt cổng gửi phiếu', 'installGateTriggers')
.addItem('🧹 Xếp lại hàng đợi (quét bù tick sót)', 'reconcileOutbox')
.addItem('📤 Gửi phiếu đang chờ', 'flushOutbox')
.addItem('📋 Mở hàng đợi', 'moHangDoi')
.addItem('🔃 Đồng bộ xác nhận từ app', 'pullConfirmsFromApp')
```

**P1 (đã viết, verify-only):** `guiPhieuOnEdit` LockService 84–89 + 238–240; `reconcileOutbox` 302–364; menu BangLuong.gs:126. `appEndpoint` = Render URL (PhieuLuongGate.gs:35) → flush LIVE.

---

## 5. Tasks (nguyên tử, có checklist tiến độ)

- [x] **T0 — Verify ground truth khớp mục 4 (BẮT BUỘC trước khi sửa)** ✅ nền sync từ live (61ff6ac), diff repo↔live = 0 trước khi sửa.
  - Lệnh: `git diff --stat docs/apps-script/` → kỳ vọng `PhieuLuongGate.gs +85`, `BangLuong.gs +1`.
  - Mở PhieuLuongGate.gs đọc dòng 143–184, 458–466; khớp snippet mục 4. Lệch → **STOP**.
  - Ai làm: inline.

- [x] **T1 — (2a) Khóa bỏ tick ô "Gửi" đã `sent`** ✅ nền mới dòng 145–156 + reTickTrue batch 236–239 + toast 246/260.
  - File: `docs/apps-script/PhieuLuongGate.gs:144`
  - Đổi chính xác: nhánh `if (!val)` trong `if (sendStep)` — trước khi set state false, tính `var obId = code+'|'+ky+'|'+sendStep.stage;` và kiểm `obIdx[obId] && obIdx[obId].status === 'sent'`:
    - Nếu `sent`: **KHÔNG** cho bỏ — `cellFalse` KHÔNG push (ngược lại: ép tick lại true), đẩy `row` vào mảng mới `reTickTrue` (setValue(true) ở batch write), `stIdx[stKey].states[header] = true`, biến đếm `relocked++`; `continue`.
    - Nếu chưa sent: giữ nguyên cũ (`states[header]=false; continue;`).
  - Thêm khai báo `var reTickTrue = [];` cạnh `var cellFalse = [];` (dòng 127) và batch write `reTickTrue` sau block `cellFalse` (dòng 213–215): `sh.getRange(reTickTrue[i], editCol).setValue(true)`.
  - Toast (dòng 218–229): thêm nhánh `relocked` → `ss.toast('Phiếu đã gửi — ô khóa. Cần hủy/sửa: báo admin (app chưa có nút rút phiếu).', '🔒 Đã gửi, không bỏ được', 7)`.
  - Vì sao: ô "Gửi" = bằng chứng đã gửi; bỏ tick làm sheet lệch app.
  - Guardrail: G2 (state=true trước), G3 (setValue), G5 (không resend — chốt 154 vẫn nằm nhánh val=true, không chạy ở đây), G7 (obId dùng string).
  - Verify: xem T6 kịch bản K2.
  - Ai làm: inline · **⚠️ ESCALATE OPUS: đụng guiPhieuOnEdit, phải giữ 4 invariant cùng lúc.**

- [x] **T2 — (2b) Interlock không thu hồi ô "Gửi" đã `sent`** ✅ nền mới dòng 186–199.
  - File: `docs/apps-script/PhieuLuongGate.gs:173`
  - Đổi chính xác: trong nhánh `if (!val && cSend && rowData[cSend-1]===true)` — thêm điều kiện: tính `var obIdB = code+'|'+ky+'|'+reqStep.stage;` nếu `obIdx[obIdB] && obIdx[obIdB].status==='sent'` thì **KHÔNG** thu hồi (bỏ qua push cellFalse + không set `states[reqStep.send]=false`; vẫn ghi `states[header]=val` cho ô điều kiện như dòng 172). Cột điều kiện (ô người vừa bỏ) vẫn được bỏ như ý người dùng; chỉ ô "Gửi" đã gửi được bảo vệ.
  - Vì sao: tránh cascade gỡ ô "Gửi" đã gửi (ca HN0028: AF còn ✔ vẫn bị rụng AG là do untick trực tiếp — nhưng cascade là đường thứ 2 phải bịt).
  - Guardrail: G5, G6 (ô chưa sent vẫn thu hồi như cũ), G7.
  - Verify: T6 kịch bản K3.
  - Ai làm: inline · **⚠️ ESCALATE OPUS: cùng hàm guiPhieuOnEdit.**

- [x] **T3 — (2c) `restoreGateTicks_` tự-lành ô "Gửi" từ `_outbox` sent** ✅ tách helper `_forceSentTicks_` (518–568), `restoreGateTicks_` gọi dòng 510.
  - File: `docs/apps-script/PhieuLuongGate.gs:466` (ngay sau vòng for re-tick)
  - Đổi chính xác: thêm block đọc `_outbox` (qua `gOutbox_()` + `gOutboxIndex_`), lọc `status==='sent'`, parse `id.split('|')` → `[code, ky2, stage]`; nếu `ky2 === ky` và `stage` ∈ {truoc_thue, sau_thue} → map `stage→'Gửi BL <tầng>'` (dùng `SEND_STEPS` tìm `send` theo `stage`); với dòng sheet có mã NV khớp: `setValue(true)` ô "Gửi" đó **và** gọi `gSaveState_(code, ky, sendCol, true)` (ghi state=true để bền). Chỉ ghi khi hiện đang ✗ (tránh ghi thừa).
  - Vì sao: mỗi refresh BQ tự khớp sheet = app; đồng thời là đường sửa 11 ca cũ (state hiện=false → block này ép về true vĩnh viễn).
  - Guardrail: G2 (gSaveState_ trước/cùng lúc), G3 (setValue), G7 (parse id, không đọc col ky), G8 (không đụng block date-parse 441–444).
  - Verify: T6 kịch bản K4.
  - Ai làm: inline · **⚠️ ESCALATE OPUS: logic cross-bảng (_outbox↔main↔_gate_state).**

- [x] **T4 — (2d) Nút menu chạy ngay phần heal (sửa 11 ca không cần refresh full)** ✅ `healSentTicks` (570–582) + menu BangLuong 2 item sau dòng 144.
  - File: `docs/apps-script/PhieuLuongGate.gs` (hàm mới `healSentTicks()`) + `docs/apps-script/BangLuong.gs:126` (thêm menu item sau "Xếp lại hàng đợi").
  - Đổi chính xác:
    - Tách logic T3 thành helper `_forceSentTicks_(main)` (trả về số ô đã sửa); `restoreGateTicks_` gọi nó; hàm mới `healSentTicks()` lấy `main = getSheetByName(mainSheet)`, có `LockService.getDocumentLock().tryLock(20000)`, gọi `_forceSentTicks_(main)`, toast `'Đã khớp N ô "Gửi" với hàng đợi đã gửi (kỳ <ky>).'`.
    - BangLuong.gs: `.addItem('🩹 Khớp tick đã gửi (sửa ô rụng)', 'healSentTicks')` chèn ngay sau dòng 126.
  - Vì sao: fix 11 ca ngay, không phải chạy "Cập nhật bảng lương" (nặng, đụng BQ).
  - Guardrail: G1–G3, G7.
  - Verify: T6 kịch bản K4 (chạy nút → 11 ô về ✔; `_gate_state` 11 dòng "Gửi BL sau thuế"=true).
  - Ai làm: inline · model Sonnet (cơ học, dựa T3).

- [ ] **T5 — Commit + DEPLOY vào Apps Script Editor (THỦ CÔNG, user hoặc hướng dẫn)**
  - Thứ tự (quan trọng — phần này viết thường, không caveman):
    1. `git add docs/apps-script/PhieuLuongGate.gs docs/apps-script/BangLuong.gs` → commit 1 lần (squash P1+P2) message: `fix(payslip-gate): khóa đè _outbox (lock) + khóa ô Gửi sau khi gửi + nút khớp tick`.
    2. Mở sheet "Bảng lương" → Extensions → Apps Script → mở file `PhieuLuongGate.gs` và `BangLuong.gs` trong Editor → **dán toàn bộ** nội dung mới đè bản cũ → Save (Ctrl+S).
    3. Reload sheet → menu `⚙ Bảng lương` phải thấy `🧹 Xếp lại hàng đợi` + `🩹 Khớp tick đã gửi`.
  - ⚠ `.gs` repo là bản sao — không deploy = fix không có hiệu lực.
  - Ai làm: user (hoặc Claude hướng dẫn từng bước; Claude không tự truy cập Apps Script Editor).

- [ ] **T6 — Chạy test matrix (mục 6) trên BẢN COPY sheet**
  - Ai làm: user theo kịch bản K1–K5; báo kết quả.

---

## 6. Test plan

> Apps Script gate KHÔNG có unit test tự động trong repo (file là bản sao; harness Vitest/pytest không chạm .gs). Test = kịch bản thủ công tái hiện trên **1 bản copy** của sheet (File → Make a copy) để không đụng data thật, + đọc `_outbox`/`_gate_state` + Apps Script Executions log.

### Kịch bản (mỗi guardrail ≥1 case)
- [ ] **K1 (P1 regression — race):** Trên copy, tick nhanh liên tiếp ~10 ô "Gửi BL trước thuế" (đã đủ điều kiện). Trước fix: `_outbox` thiếu dòng. Sau fix (có LockService): đủ 10 dòng pending. Nếu nghi sót → bấm `🧹 Xếp lại hàng đợi` → phải bù đủ. [G-P1]
- [ ] **K2 (P2 regression — untick trực tiếp ô đã gửi):** Chọn 1 dòng có `_outbox` sent (vd giả lập: set 1 dòng outbox status=sent). Bỏ tick ô "Gửi BL …". Kỳ vọng: ô **tự tick lại ✔**, toast "🔒 Đã gửi…", `_gate_state` giữ `=true`, `_outbox` KHÔNG thêm dòng. [G2,G3,G5,T1]
- [ ] **K3 (P2 — interlock cascade ô đã gửi):** Dòng có "Gửi BL sau thuế" đã sent + "NV xác nhận trước thuế" ✔. Bỏ tick "NV xác nhận trước thuế". Kỳ vọng: ô điều kiện bỏ được (theo ý người), nhưng "Gửi BL sau thuế" **vẫn ✔** (không bị thu hồi). [G5,G6,T2]
- [ ] **K4 (sửa 11 ca cũ + self-heal):** Trên copy có `_gate_state` "Gửi BL sau thuế"=false nhưng `_outbox` sent. Bấm `🩹 Khớp tick đã gửi`. Kỳ vọng: ô về ✔; `_gate_state` dòng đó =true; chạy lại `Cập nhật bảng lương` (refresh) → ô vẫn ✔ (không rụng). Verify không resend: `_outbox` status vẫn sent, không có dòng mới, `Gửi phiếu đang chờ` báo 0 gửi. [G3,G5,T3,T4]
- [ ] **K5 (G6 — ô CHƯA gửi vẫn hành xử cũ):** Dòng KHÔNG có trong `_outbox` (chưa gửi). Bỏ tick "Gửi" → bỏ được bình thường (state=false). Tick "Gửi" khi thiếu điều kiện → vẫn bị chặn + tự bỏ tick như cũ. [G6]

### Build/verify (áp dụng được)
- [ ] `grep -c "GATE_COLS" docs/apps-script/PhieuLuongGate.gs` không giảm; không có `.push(` lên GATE_COLS. [G4]
- [ ] `grep -n "restoreGateTicks_" docs/apps-script/BangLuong.gs` vẫn = 1 call trong `capNhatTuBigQuery`. [learning verify]
- [ ] Apps Script Executions: sau K2/K3, không có execution `flushOutbox` tự chạy; `guiPhieuOnEdit` không ném lỗi.
- [ ] (Không có tsc/Vitest/pytest cho .gs — bỏ qua, ghi rõ lý do.)

---

## 7. Rollback
- Code: `git revert <commit>` (1 commit squash) + dán lại bản `.gs` cũ vào Apps Script Editor (giữ bản cũ trước khi dán — copy ra file tạm).
- Không có migration DB, không đụng BE → rollback sạch, không dữ liệu tồn.
- 11 ca đã heal: nếu rollback, ô có thể rụng lại sau refresh (quay về trạng thái bug cũ) — chấp nhận được, không mất data app.

## 8. Definition of Done
- [ ] G1–G8 còn giữ (đối chiếu mục 3).
- [ ] K1–K5 pass trên bản copy, đặc biệt K2/K4 (regression 2 bug gốc).
- [ ] Deploy xong: menu sheet thấy 2 item mới; tick nhanh không mất dòng; bỏ tick ô đã gửi → tự khóa.
- [ ] 11 ca kỳ 2026-09 về ✔ sau khi bấm `🩹 Khớp tick đã gửi`; refresh không rụng lại.
- [ ] Hành vi thật khớp kỳ vọng (không chỉ đọc code).

## STOP conditions (dừng & hỏi user)
- `git diff --stat` / snippet code lệch mục 4 (ai đó đã sửa tiếp) → DỪNG.
- Bản LIVE Apps Script đã có LockService/menu rồi (P1 đã deploy) → báo user, chỉ làm P2.
- Heal (T3/T4) phát hiện `_outbox` sent mà app KHÔNG có phiếu (hoặc ngược lại) → DỪNG, không ép tick mù.
- Cần đụng cột "NV xác nhận …" hoặc BE để làm xong → DỪNG (ngoài scope; invariant G1).

## Ngoài scope (follow-up, KHÔNG làm trong plan này)
- Bỏ tick ô "Gửi" đang **pending (chưa flush)** hiện KHÔNG gỡ dòng `_outbox` pending → vẫn flush ở lần gửi sau. Bug có sẵn, không do fix này. Ghi lại để xử riêng (TC2: 1 plan 1 vấn đề).
