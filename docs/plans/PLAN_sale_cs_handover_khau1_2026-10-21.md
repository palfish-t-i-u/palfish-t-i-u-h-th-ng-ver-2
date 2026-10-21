# PLAN — Sale→CS handover KHÂU 1 (app GMV) · 2026-10-21

> Người soạn: Claude (phiên GMV) · Nguồn yêu cầu: `palfish-cs-ops/docs/14` mục D + meeting note Lark 16/10 + xác nhận anh Minh 21/10.
> Trạng thái: **✅ ĐÃ CODE (B+ per-bé) — render thật đã xác nhận, chưa commit.** Chi tiết §9.

## 9. CHỐT CUỐI — B+ (bàn giao per-bé) · 21/10
"Báo đơn" = nút **"Báo đơn & Tạo gói học"** (B3, modal `arPackageModal` trong `PaymentRequestDetailDrawer.tsx`). Mỗi bé/đơn cùng phụ huynh có thể khác Contact ID + Note (ảnh sheet IH1: Uy Kha 84-937865100 vs Mai Kha 84-949501528) → **3 trường per-dòng-gói**, KHÔNG dùng chung.
- **UI**: khung "Bàn giao cho CS — bé này" trong MỖI dòng gói (`arDraftRows.map`); gate `arRowsValid` += `isHandoverComplete(r.careChannel, r.careContactId, r.handoverNote)` (chặn cứng mỗi dòng, cả create + append); nút "Thêm gói" **prefill Kênh + Contact ID từ dòng trước** (Note để trống).
- **Lưu**: per-course trong AR `uids_data[].courses[]` (JSONB → KHÔNG migration): builder `buildCreateActiveRequestPayload` (`paymentRequestUtils.ts`) map `care_channel/care_contact_id/handover_note`; BE `_normalize_uids_data` (`activation_routes.py`) lưu; `ActiveRequestPatchCoursePayload` += 3; serializer `_serialize_ar` `dict(course)` giữ nguyên (round-trip OK); mapper from-API + `ActiveCourse`/`ArDraftRow`/`CreateActiveRequestCoursePayload` += 3 (optional).
- **ĐÃ GỠ hoàn toàn** phần lưu-trên-PR (migration + payment_request_routes model/insert/serializer/patch + CreatePaymentRequestModal + PaymentRequestsTab + drawer customer-edit). Giữ `constants/careChannel.ts` + `isHandoverComplete`.
- **Verify**: `tsc -b` ✅ · `py_compile` ✅ · vitest payload+handover **13/13** ✅ (payment-request 389/390, 1 flaky-timeout `PaymentRequestTable` pagination, chạy riêng 7/7) · **render thật** qua harness tạm (đã xoá): khung per-bé + prefill Kênh/Contact dòng 2 = Zalo/84-937865100 từ dòng 1, Note trống.
- Diff cuối: sửa `activation_routes.py` + `PaymentRequestDetailDrawer.tsx` + `paymentRequestUtils.ts` + `types/paymentRequest.ts` + `paymentRequestUtils.payload.test.ts`; mới `constants/careChannel.ts` + `paymentRequestUtils.handover.test.ts`. Chưa commit. ⏳ G3 (ghi sheet) chờ xác nhận cột với Chung.

## 0c. ĐÍNH CHÍNH 21/10 — "báo đơn" = nút "Báo đơn & Tạo gói học" (B3), KHÔNG phải Tạo PR (B1)
Anh Minh chỉ rõ: "báo đơn" = bấm **"Báo đơn & Tạo gói học"** (B3) ở cuối phiếu → mở modal `arPackageModal` trong `PaymentRequestDetailDrawer.tsx:3052+`. 3 trường (Note + Kênh chăm sóc + Contact ID) nằm TRONG modal này (section "1 lần cho cả báo đơn"), CHỈ khi báo đơn lần đầu (không hiện ở "Báo đơn bổ sung"/append). → Đã GỠ khỏi CreatePaymentRequestModal (B1). Gate chặn cứng = `isHandoverComplete()` cộng vào `arValid`. Lưu vẫn trên `payment_requests` (PR↔AR 1:1) qua `onUpdatePr` ngay trước khi tạo AR.

## 0b. CHỐT 21/10 (anh Minh trả lời 6 quyết định)
1. **Contact ID** → thêm **cột mới** vào mỗi tab đích (Kênh chăm sóc map vào cột `Kênh liên hệ` sẵn có).
2. **Routing = 4 team**: Offline, Inhouse 2, Inhouse 1, HCM. "Team 2" trong sheet chung = **Inhouse 2** (viết tắt của họ).
3. **Cơ chế ghi = SA-direct** (R1 chốt): build client write scope, SA đã/đang được chia Editor 3 sheet.
4. **Validation = chặn cứng NGAY LÚC BÁO ĐƠN** (option 1). Lý do anh nêu: sau khi Sales Admin điền order_id ở B3 thì PR bị khoá, sale không sửa/bổ sung được nữa, lại hay quên → nên bắt điền đủ 3 trường ngay khi báo đơn (đơn giản + chắc).
5. **Note** = field MỚI `handover_note`, tách khỏi `payment_requests.note`, chỉ dùng cho bàn giao.
6. **KH mới vs Gia hạn** = theo Nguồn: `lead_source == "gia_han"` → Gia hạn; còn lại → KH mới. (Phân biệt bán mới vs upsell KHÔNG cần — sheet chỉ cần nhị phân này.)

## 0. Ranh giới (chốt với anh Minh 21/10)
- **App GMV (repo này) = KHÂU 1**: lúc sale báo đơn, thu **Note + Kênh chăm sóc + Contact ID**; **ghi vào Google Sheet bàn giao CHỈ KHI đơn đã có Order ID**.
- **App CS (`47.84.41.240`, repo `palfish-management-dashboard`) = KHÂU 2**: đọc sheet → sinh ticket CS leader phân bổ → đóng ticket → **tự đổ ngược sheet** (CS nào nhận) → CS note → đẩy ngược. **KHÔNG thuộc repo này.** GMV **không** đọc ngược — sale xem CS nào nhận ngay trên Google Sheet (do app CS ghi).
- Sheet bàn giao là nguồn SOP1 "Tiếp nhận" của app CS (qua BQ `v_sop1_sop2_intake_greeting` + `ban_giao_kh_moi_*`, `cs-ops/docs/17:23`).

## 1. Dữ liệu nguồn đã điều tra (path:line)
- Báo đơn FE: `frontend/src/components/payment-request/CreatePaymentRequestModal.tsx:146` (handleSubmit) — form đã có `note`, `lead_source`, `lead_channel`, `phone`, `uid`, `email`.
- Báo đơn BE: `POST /payment-requests` `backend/payment_request_routes.py:2844`; body model `PaymentRequestCreate` `:120-153`; insert row `_payment_request_insert_row` `:1140-1203` → bảng `payment_requests`.
- ⚠️ `lead_channel`/`lead_source` = **nguồn lead** (FB/TikTok), KHÁC "Kênh chăm sóc" (zalo/viber/whatsapp/kakao). → Kênh chăm sóc + Contact ID là **trường MỚI**.
- **Order ID** = `active_requests.uids_data[].courses[].order_id` (JSONB), KHÔNG nằm trên `payment_requests`. Set tại:
  - `PATCH /api/v1/active-requests/{ar_id}/courses/{course_code}` `backend/activation_routes.py:3206` (RPC `patch_active_request_course_order` `:3234`, sau đó `sync_ledger_from_ar_course` `:3249`).
  - `PATCH /api/v1/active-requests/{ar_id}` `:2774` (`_stamp_order_id_changes` `:2501`).
  - append: `POST /active-requests/{ar_id}/append` `:3116`.
  - Nối PR: `active_requests.pr_id`. Status suy ra: `_derive_status` (`all_have_order → activated`).
- Google Sheet trong repo: **READ-ONLY** (`GSHEET_SCOPES=spreadsheets.readonly` `backend/gsheet_ledger_import.py:31`), auth service account file `GOOGLE_SERVICE_ACCOUNT_JSON` (`:478`), lib `google-api-python-client` + `google-auth` (requirements `:28-29`), KHÔNG có gspread. **0 chỗ ghi sheet** trong backend. Mẫu ghi sheet đang dùng: backend POST → Apps Script web app (cổng phiếu lương `backend/payroll_routes.py:70` → `PhieuLuongGate.gs`).
- Learnings liên quan: `docs/learnings/bao-don-completion-signal-order-id.md` ("báo đơn hoàn thành = order_id, KHÔNG phải UID/SĐT") — khớp điều kiện "vào sheet chỉ cần Order ID".

## 2. Google Sheet bàn giao — 3 file, schema KHÁC NHAU (đã đọc header 21/10)
Route theo team → đúng (sheetId, tab). Map app-field → **tên cột** (KHÔNG theo vị trí — thứ tự cột khác nhau giữa các sheet).

Team lấy từ `team_mapper.get_canonical_team(sale.team)` (`backend/utils/team_mapper.py:116`). KH mới/Gia hạn = `lead_source == "gia_han"`.

| Team canonical (GMV) | Sheet ID | Tab đích KH mới | Tab/tag Gia hạn | Kiểu schema |
|---|---|---|---|---|
| `Offline` | `1XhQDCQcnoi1iM7miHsikSMNN1SjRei0CZDWgm15AtD8` | `Bàn giao KH mới + gia hạn Offline team` | cùng tab, cột `KH mới/ gia hạn`="gia hạn" | "KH mới" (header **dòng 2**) |
| `Inhouse 2` | `1XhQDCQcnoi1iM7miHsikSMNN1SjRei0CZDWgm15AtD8` | `Bàn giao KH mới Team 2` | `Bàn giao KH gia hạn Team 2` | **Schema riêng** (TVTS/Loại cts/Note, header dòng 1) — xem ⚠️ residual |
| `HCM (Online)` | `13eRuNcvduS5UMzNhV2Gc1ROZcyR9WIqf6TDv4m8Qt-k` | `Bàn giao KH ` | cùng tab, tag `KH mới/ gia hạn`="gia hạn" (cột M) | "KH mới" (header dòng 2) |
| `Inhouse 1` | `1212UXIMAuCiVDif8Lw6PnfaN8pTu3RU6GSXUMzBl-1A` | `Bàn giao KH mới` | ` Bàn giao KH gia hạn` (tab riêng, có dấu cách đầu) | "KH mới" (header dòng 2), UID ở cột E |

**R4 chốt:** `Linh Dam (Store)` + `An Binh (Store)` = thuộc khối Offline → **route vào tab Offline** (cùng `Bàn giao KH mới + gia hạn Offline team`). Chỉ `Khác`/team không xác định → bỏ qua push + log warn.

**Cột các tab "KH mới" (Offline/HCM/IH1)** — tên cột gần giống, thứ tự khác: `STT, Ngày bàn giao, Sale, Tên KH, Tên học sinh, UID, SDT(KH), Trình độ, [Quốc Tịch — Offline/IH1], Kênh liên hệ, Gói học, Số tiền, Ghi chú, [KH mới/gia hạn — Offline/HCM]`. GVCN tự điền phần sau (Ngày tiếp nhận, GVCN, Tình trạng, Ghi chú) — **GMV không đụng**.

**Cột tab Team 2** (schema riêng): `STT, TVTS, Loại cts, Họ tên, SDT, UID, Ngày chuyển tiền, Số tiền, GV, Gói học, Trạng thái, Tháng, Tạo nhóm GV, Note, ...` — **không có "Kênh liên hệ"**, note = cột `Note`.

### Mapping app → cột (nháp — cần chốt)
| App field (GMV) | KH-mới tabs | Team 2 tab |
|---|---|---|
| Ngày bàn giao | `Ngày bàn giao` = ngày push | (không có cột ngày bàn giao rõ) |
| Sale | `Sale` ← ghi **full name** (GMV không có mã ngắn `PhatNM`; CS neo theo UID/order_id) | `TVTS` ← full name |
| Tên KH | `Tên KH` | `Họ tên` |
| Tên học sinh | `Tên học sinh` | (gộp trong `Họ tên`?) |
| UID | `UID` | `UID` |
| SĐT | `SDT`/`SDT KH` | `SDT` |
| Quốc tịch | `Quốc Tịch` (chỉ Offline/IH1) | — |
| Gói học | `Gói học` | `Gói học` |
| Số tiền | `Số tiền` | `Số tiền` |
| **Kênh chăm sóc** (MỚI, field app) | `Kênh liên hệ` (sẵn có) | ⚠️ Team 2 tab **không có** → cần THÊM cột |
| **Contact ID** (MỚI, field app) | THÊM cột mới `Contact ID` | THÊM cột mới `Contact ID` |
| **Note** = `handover_note` (MỚI) | `Ghi chú` | `Note` |
| KH mới/Gia hạn (`lead_source=="gia_han"`) | tag cột (Offline/HCM) / chọn tab (IH1) | `Loại cts` (Team 2) |

**Prerequisite thao tác sheet (anh/chủ sheet + báo Chung để BQ ingest nhận cột mới):**
- Thêm cột `Contact ID` vào cả 4 tab đích (+ 2 tab gia hạn IH1/Team 2).
- Thêm cột `Kênh liên hệ` vào tab `Bàn giao KH mới Team 2` + `Bàn giao KH gia hạn Team 2` (schema Team 2 chưa có).
- Backend map theo TÊN cột; nếu cột chưa tồn tại → fail-loud + log (không đoán vị trí).

## 3. Approach (Milestones) — CHỜ DUYỆT
### G1 · FE báo đơn: thêm 3 trường
- G1-T1: `CreatePaymentRequestModal.tsx` — thêm input `care_channel` (select: Zalo/Viber/WhatsApp/Kakao), `care_contact_id` (text), `handover_note` (textarea). State + `handleSubmit` payload (`:146-189`). **BẮT BUỘC: thêm vào `canSubmit` (`:139-144`) — chặn tạo PR nếu thiếu (chốt #4 chặn cứng lúc báo đơn).**
- G1-T2: types `frontend/src/types/paymentRequest.ts` — thêm 3 field vào `CreatePaymentRequestPayload` + model PR.
- G1-T3: hiển thị 3 trường ở `PaymentRequestDetailDrawer` (đọc + sửa KHI PR còn mở, trước khi order_id khoá PR).

### G2 · BE persist + validation
- G2-T1: migration `backend/migrations/2026-10-21-pr-cs-handover-fields.sql` — thêm cột `payment_requests.care_channel`, `care_contact_id`, `handover_note` (nullable).
- G2-T2: `PaymentRequestCreate` `:120-153` + `_payment_request_insert_row` `:1140-1203` + serializer (`:320-327`, xem learning `serializer-omits-lead-fields`) nhận/ghi/trả 3 cột.
- G2-T3: endpoint PATCH PR cho phép sửa 3 trường (bổ sung sau).
- G2-T4: Bắt buộc 3 trường đã chuyển về **lúc báo đơn** (G1-T1, chốt #4). Tại điểm set order_id (`activation_routes.py:3234`/`:2774`/append) chỉ là **lưới an toàn cho PR cũ (legacy)**: nếu thiếu → **KHÔNG chặn** việc gắn order_id, mà **bỏ qua push sheet + log warn** (để không chặn Sales Admin).

### G3 · Ghi Google Sheet (khi có Order ID)
- G3-T1: **CHỐT SA-direct (R1).** Client ghi sheet `backend/cs_handover_sheet.py`: build client thứ 2 scope `spreadsheets` (ghi), dùng lại key `GOOGLE_SERVICE_ACCOUNT_JSON` (client readonly import giữ nguyên), `values().append` theo TÊN cột (tìm header + dòng trống kế). ⚠️ SA phải được chia Editor 3 sheet — **anh Minh đã nhờ Chung add email editor** (R2). Cột ghi theo tên, fail-loud nếu thiếu header.
- G3-T2: config routing team→(sheetId, tab, kiểu schema) + bảng mapping cột theo tên (đọc header động để tìm cột + dòng trống kế tiếp; xử lý header ở dòng 1 vs 2).
- G3-T3: cột `Sale`/`TVTS` = **full name** sale (resolve từ `sale_email` → `nhan_su_sale`); team routing qua `get_canonical_team`.
- G3-T4: trigger: helper `maybe_push_cs_handover(ar, course)` gọi sau `sync_ledger_from_ar_course` tại cả 3 path set order_id; **dedup** bằng cột DB mới `cs_handover_pushed_at` (hoặc bảng `cs_handover_log` key=order_id) — ghi-một-lần.
- G3-T5: KH mới vs Gia hạn = `lead_source == "gia_han"` → chọn tab (IH1/Team 2) hoặc set tag (Offline/HCM) / `Loại cts` (Team 2).

### G4 · Backfill + vận hành (tùy chọn, sau khi G1-G3 chạy)
- G4-T1: script quét đơn đã có order_id + đủ 3 trường nhưng chưa push → đẩy 1 lần (dry-run mặc định).

### Tests
- Unit BE: validation thiếu field khi set order_id (reject); mapping field→cột theo tên cho 4 schema; dedup không ghi lại order_id đã push; resolver Sale-code.
- Unit FE: form submit kèm 3 trường; render/sửa ở Drawer.
- Integration (mock Sheets API): append đúng tab + đúng cột theo team; header dòng 1 vs 2; SA thiếu quyền → lỗi rõ ràng, không nuốt.
- E2E: tạo PR có 3 trường → set order_id → xác nhận gọi push (mock).

## 4. Guardrail
- KHÔNG phá luồng báo đơn hiện tại: 3 trường nullable; tạo PR thiếu vẫn được (chỉ chặn ở bước order_id).
- KHÔNG đổi scope readonly của import hiện có (`gsheet_ledger_import.py`) — client ghi là **instance riêng**.
- Ghi sheet **idempotent** theo order_id (dedup DB authoritative, không quét sheet).
- Ghi theo **tên cột**, không hardcode chỉ số cột (thứ tự cột khác nhau + có thể đổi).
- Lỗi ghi sheet KHÔNG được làm fail nghiệp vụ gắn order_id/ledger (ghi async/try-catch + hàng chờ retry, như outbox); nhưng phải log + quan sát được.
- KHÔNG commit secret; SA key giữ nguyên cơ chế env.
- Serializer phải kèm 3 trường mới (tránh lỗi "stale view" — learning `serializer-omits-lead-fields`).

## 5. Đánh giá 5 tiêu chí (sơ bộ — hoàn thiện sau khi chốt Quyết định)
1. **Triệt để** — ✅ G1/G2 (FE+DB+validation) khép kín; G3 (ghi sheet) khép kín sau khi chốt R1-R4.
2. **Không lỗi con** — ⚠️ rủi ro còn: header dòng 1/2, tab tên có dấu cách đầu (` Bàn giao KH gia hạn`), schema Team 2 khác, dedup order_id, legacy PR thiếu field.
3. **Không tăng hạ tầng** — ✅ dùng lại SA + pattern có sẵn; chỉ thêm cột DB + 1 module BE.
4. **Tối ưu token** — ✅ không workflow lớn; builder Sonnet cho từng milestone.
5. **Bền qua compact** — ✅ plan là file; path:line + mapping đầy đủ.

## 6. Quyết định — ĐÃ CHỐT HẾT (6 + R1-R4, 21/10)
ĐÃ CHỐT (§0b): #1 Contact ID cột mới · #2 routing 4 team · #4 chặn cứng lúc báo đơn · #5 `handover_note` · #6 `lead_source=="gia_han"` · Sale = full name.
- **R1** = SA-direct (§3 G3-T1).
- **R2** = ta tự thêm cột; anh Minh đã nhờ Chung add email editor 3 sheet. Thêm cột MỚI ở **CUỐI** tab, KHÔNG chèn giữa (VD Offline → cột V). ✅ Master session CS [576212] xác nhận (21/10): app CS **KHÔNG ghi/reserve cột nào** trên các sheet này (chỉ đọc bảng ĐÃ SYNC trong BQ theo TÊN cột) → thêm cột cuối an toàn tuyệt đối với app CS; app CS không cần đổi gì. **Mắt xích thật = sync GSheet→BQ của CHUNG**: (i) phải thêm `Contact ID`/`Kênh liên hệ` vào sync thì data mới vào BQ; (ii) cần hỏi Chung sync đọc cột theo TÊN hay VỊ TRÍ (nếu theo vị trí thì thêm cột cuối vẫn an toàn; nếu đổi vị trí thì mới lo). → **Hành động còn lại: anh Minh/ tôi xác nhận với Chung** (ngoài repo này + ngoài app CS, KHÔNG chặn code GMV ghi sheet).
- **R3** = `Bàn giao KH mới Team 2` ĐÚNG là tab IH2 bàn giao KH mới. Map: `TVTS`=Sale (tab này dùng short-code, ĐÃ có mapping — hỏi nguồn mapping khi code; tạm ghi full name nếu chưa có), `Loại cts`=nguồn+kênh dạng rút gọn (không quan trọng), `Trạng thái`=đơn đã tạo gói/kích hoạt CRM chưa (từ AR status), `Tháng`=suy từ Ngày chuyển tiền.
- **R4** = Linh Dam Store + An Binh Store = khối Offline → route vào tab Offline.

✅ Master session CS [576212] đã trả lời (R2 ở trên). Còn lại chỉ 1 phối hợp NGOÀI repo: xác nhận với Chung (sync GSheet→BQ) thêm 2 cột + đọc theo tên/vị trí — KHÔNG chặn code GMV (G1/G2/G3 đều viết được; chỉ "data chảy đủ sang app CS" mới cần Chung).

## 8. Tiến độ
- ✅ **G1 + G2 DONE (21/10, đã đính chính chỗ nhập — xem §0c)** — commit chưa tạo:
  - DB: `backend/migrations/2026-10-21-pr-cs-handover-fields.sql` (⚠️ CHƯA apply — chạy thủ công sandbox→prod trước deploy BE).
  - BE `payment_request_routes.py`: model Create+Patch, insert, serializer, patch — lưu/đọc 3 trường `payment_requests` (optional ở BE). KHÔNG đổi.
  - FE **ĐÚNG CHỖ** (§0c): 3 trường ở **modal "Báo đơn & Tạo gói học" (B3)** trong `PaymentRequestDetailDrawer.tsx` (state ho*, init prefill lúc mở, gate `isHandoverComplete` cộng vào `arValid`, submit `onUpdatePr` lưu PR rồi `onCreateActiveRequest`). Chỉ hiện khi báo đơn lần đầu (không append). `constants/careChannel.ts` + `paymentRequestUtils.isHandoverComplete` (mới) + mapper + types + drawer customer-edit (sửa sau) + `PaymentRequestsTab` PATCH payload. **ĐÃ GỠ** 3 trường khỏi CreatePaymentRequestModal (B1).
  - Verify: `tsc -b` ✅ · vitest payment-request **390/390** (gồm 6 case `isHandoverComplete`) ✅ · B1 gỡ sạch kiểm bằng mắt trên dev server ✅ · BE `py_compile` ✅. Lint repo lỗi pre-existing (ko phải thay đổi này), 0 `rules-of-hooks`. BE pytest hoãn (worktree thiếu deps). ✅ Modal B3 ĐÃ demo trực quan qua harness tạm (route `/harness/baodon` + `src/__harness/`, import `styles/prototype-payments.css`) — ảnh xác nhận 3 trường "Kênh chăm sóc / Contact ID / Note bàn giao" + nút "Xác nhận báo đơn" disabled khi trống; **harness đã xoá**, diff sạch (ko lẫn lockfile/B1).
- ⏳ **G3 (ghi sheet SA-direct)** — chờ: (a) anh Minh xác nhận với Chung thêm cột `Contact ID`/`Kênh liên hệ` vào sync GSheet→BQ; (b) đặt cột ở cuối tab (VD Offline cột V).
- ⏳ **Khâu 2 đổ-ngược** — master session CS báo CHƯA build + chưa chốt chủ thể ghi (app CS ghi thẳng vs job BQ→GSheet riêng) → cần Minh + Chung chốt (ngoài repo GMV).

## 7. Phân bổ thực thi (sau duyệt)
- Opus giữ context cho G3 (routing + mapping chéo 4 schema, logic tinh). G1/G2 có thể giao `cavecrew-builder` (Sonnet) theo task self-contained. Migration + validation review bằng `cavecrew-reviewer`.
