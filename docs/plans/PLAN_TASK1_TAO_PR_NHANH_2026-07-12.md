# PLAN Task 1 — Tạo PR cực nhanh: UID optional lúc tạo, SĐT lên đầu, UID bắt buộc lúc kích hoạt

> Ngày: 2026-07-12 · Trạng thái: **chờ duyệt** · Effort: ~395 phút (~6.5h làm thật)
> Nguồn: workflow 12 agents (6 khảo sát đọc code thật → 3 phương án → judge → adversarial critic).
> Plan này ĐÃ tích hợp 12 gap critic tìm ra (1 blocker + 4 major + 7 minor).

## Yêu cầu (chốt cứng từ anh Hiếu 11/7)

- Tạo PR cực nhanh trên **cả PC lẫn mobile** — giảm trường bắt buộc.
- Bắt buộc chỉ còn: **SĐT + Tên KH + Số tiền + Nguồn**. SĐT đẩy lên đầu form thế chỗ UID.
- Các trường còn lại = "bổ sung sau". **UID vẫn cần để kích hoạt khoá học.**
- Tiên quyết: không ảnh hưởng vận hành web hiện tại. PR cũ (có uid) hoạt động y nguyên.

## Nguyên lý thiết kế

Dời điểm enforce UID từ B1 (tạo PR) xuống B3 (kích hoạt) — đúng thời điểm nghiệp vụ cần.

- **Sentinel `uid=""`** thỏa `uid text NOT NULL` (schema_prod.sql:3478) → **0 migration DB**, rollback = revert code.
- **Gate BE `MISSING_UID`** tại `_save_active_request` (activation_routes.py:1234-1294) — choke point duy nhất của cả 2 endpoint tạo AR → không bypass được qua API.
- **Writeback fill-if-empty**: UID nhập lúc kích hoạt tự chảy về `payment_requests.uid`.
- Đã verify: uid KHÔNG tham gia QR / mã CK (`_transfer_code_hint` từ PR id) / nội dung CK (`_build_payos_transfer_description` = phone+name+code) / đối soát SePay (match transfer_code) → bỏ uid không vỡ dòng tiền.
- Gate B3 tự triệt tiêu 2 lỗi con: ledger mất dedup (revenue_routes.py:985 skip CRM lookup khi uid rỗng) và tin AR-created in "UID: ?" (zalo_message_builder.py:442).

## Các bước (test-first, deploy BE→FE)

### 1. B0 — Pin hành vi hiện tại bằng pytest (viết TRƯỚC, phải xanh trên main) — 25'
`backend/tests/test_pr_uid_optional.py` (MỚI). Pattern: direct-call helper (`_payment_request_insert_row`/`_payment_request_patch_row`) như test_pr_multi_child.py + fake-supabase TestClient + monkeypatch `_sb_or_503`/`resolve_actor` như test_pr_list_load_all.py.
Pin invariant: create đủ uid+name+phone+target → row đúng; thiếu name/phone/target≤0 → 400 "Thieu du lieu bat buoc" (hiện zero coverage); PATCH PR-có-uid sửa target/note OK; alias legacy `uid_khach_hang`/`ten_khach`/`sdt` map đúng.

### 2. Kiểm kê data + chốt baseline E2E — 20'
- Query Supabase sandbox+prod: đếm `active_requests` có uids_data chứa block uid rỗng. Data này **đã kẹt PATCH 422 từ trước** (min_length=1, activation_routes.py:92-93). Nếu >0 → fix tay SQL hoặc ghi nhận — KHÔNG để gate mới bị đổ oan.
- Chạy tay `npx playwright test --project=journeys`: đã verify code — payment-lifecycle.spec.ts B1 **không chọn Nguồn** trong khi canSubmit đòi leadSource → khả năng cao đỏ sẵn (journeys không chạy CI). Chốt baseline phân biệt lỗi cũ/mới.

### 3. Test ĐỎ cho hành vi mới (BE) — 40'
`test_pr_uid_optional.py` (thêm case) + `backend/tests/test_ar_uid_guard.py` (MỚI):
- create KHÔNG uid → 200, `row["uid"]==""`; create thiếu lead_source → 400; PATCH PR-uid-rỗng sửa target/name → 200 (pin guard 1025-1029); PATCH gửi `uid=""` explicit → 200 (mô phỏng chính xác payload handleUpdatePr — PaymentRequestsTab.tsx:253 luôn gửi `uid: next.uid.trim()`); PATCH uid mới → row cập nhật.
- **AR test viết ở mức ENDPOINT** (POST `/payment-requests/{pr_id}/active-requests` với fake supabase), KHÔNG chỉ unit hàm helper — test endpoint mới bắt được lỗi writeback-không-được-wire (blocker critic tìm ra): tạo AR block uid rỗng → 422 code MISSING_UID kèm tên bé; uid đủ → 200 **và** PR.uid rỗng được fill; PR.uid có sẵn → KHÔNG ghi đè; **AR block tên bé ≠ child_name → PR.uid KHÔNG được fill** (chống ghi uid bé 2 vào PR.uid).
- Notification degrade an toàn với data cũ: uids_data có block `uid=""` → builder trả message chứa "UID: ?" không crash (1 case vào test_ar_uid_guard.py hoặc test_zalo_builder.py).

### 4. Sửa BE payment_request_routes.py cho xanh — 20'
- `_payment_request_insert_row` (889-899): bỏ "uid" khỏi missing[], **THÊM "lead_source"** (Nguồn bắt buộc thật ở BE, khớp canSubmit FE); uid thiếu → `row["uid"] = ""` (sentinel, KHÔNG NULL, KHÔNG migration).
- `_payment_request_patch_row` (947-952): bỏ 400 "uid khong duoc de trong" — uid gửi lên (kể cả "") ghi thẳng patch.
- Guard invariant (1025-1029): bỏ next_uid, giữ name+phone → "name, phone la bat buoc".
- ⚠️ **3 điểm PATCH sửa cùng 1 commit** — sót 1 điểm là PR không-uid bị khóa cứng mọi edit (bẫy lớn nhất hồ sơ khảo sát).

### 5. Sửa BE activation_routes.py: gate MISSING_UID + writeback — 40'
- `_save_active_request` (1234-1294), sau `_normalize_uid_block`: BẤT KỲ block uid rỗng → HTTPException 422 `{code: "MISSING_UID", children: [tên bé thiếu]}` — mirror pattern MISSING_BILLS (:1227). Chặn mọi đường tạo AR (drawer B1, ActivationTab, API trực tiếp).
- **[Fix blocker]** `_writeback_child_uids_to_pr` hiện CHỈ được gọi ở PATCH handler (:1858, :1913) — đường TẠO AR không gọi → phải **gọi thêm trong `_save_active_request` SAU insert thành công** (sau :1289, best-effort try/except + log warning, không fail request).
- **[Fix major]** Điều kiện fill PR.uid (chống ghi sai uid bé 2): chỉ fill khi PR.uid đang rỗng **VÀ** (block.name rỗng, HOẶC block.name trùng `pr.child_name`/`splitChildNames(child_name)[0]`, HOẶC PR chỉ có 1 bé). Ngược lại skip. Không bao giờ ghi đè uid có sẵn.
- **GIỮ NGUYÊN** `ActiveRequestPatchUidPayload.min_length=1` — AR giờ không bao giờ sinh với uid rỗng → né hẳn bẫy "AR kẹt 422 mọi patch".
- Chạy full pytest: B0 + bước 3 đều xanh. (uid không nằm trong stale-content inputs — `_is_payment_line_content_stale` :1172-1232 — nên writeback không kích stale QR.)

### 6. FE: types + form tạo PR + mobile scoped CSS — 55'
Files: `types/paymentRequest.ts`, `CreatePaymentRequestModal.tsx`, `contexts/PaymentFlowContext.tsx`, `styles/prototype-payments.css`.
- types:217 `CreatePaymentRequestPayload.uid` → `uid?: string`. **GIỮ** `PaymentRequest.uid: string` (:100) — mapper `raw.uid ?? ""` là lưới an toàn; đổi nullable sẽ crash ActivationTab:64, PaymentRequestsTab:168, drawer:702, Recon:573.
- JSX: **SĐT lên đầu** (autoFocus, type=tel, inputMode=tel, autoComplete=tel) → Tên KH → Tổng tiền (inputMode=numeric) → Nguồn + Kênh; ô UID chuyển xuống nhóm dưới, hint "Bổ sung sau — cần trước khi kích hoạt". canSubmit (95-99) bỏ `form.uid`.
- Fix fire-and-forget: prop `onSubmit` → `Promise<void>`, handleSubmit await + try/catch → lỗi inline trong modal-foot + submitting disable nút. Bắt buộc — nếu không, 400 lead_source mới của BE sẽ chết im lặng. (handleCreate PaymentRequestsTab:310-316 đã async sẵn.)
- CSS: class modifier `create-pr-modal` lên div .modal (:129) + block `@media (max-width:767px)` **append CUỐI file**: `.field-row/.addr-row → 1 cột`, bottom-sheet (scrim align-items:end + padding 0, radius-top-only, max-height 92vh), input/button min-height 44px. **TUYỆT ĐỐI không sửa rule chung** `.gmv-prototype-modal-scrim/.modal/.field-row` (15 modal / 7 file ăn chung). Tránh vùng comment CSS hỏng ~dòng 2055.

### 7. FE drawer: ô UID tại modal kích hoạt + luồng bổ sung + polish — 55'
Files: `PaymentRequestDetailDrawer.tsx`, `PrRowCards.tsx`, `contexts/PaymentFlowContext.tsx`.
- Modal AR (2531-2660 — vùng nóng commit 2917826: đọc code hiện tại trước, diff tối thiểu):
  - **[Chốt OQ3 theo critic]** PR **1 bé** (`splitChildNames(request.childName).length ≤ 1`): 1 ô "UID học viên *" chung, state `arUid` prefill `request.uid ?? ""`, `arValid` += `arUid.trim()`. PR **nhiều bé**: mỗi dòng gói có **ô UID riêng theo bé** (`ArDraftRow` đã có field uid per-row — types:253-259) — chống kích hoạt nhầm tài khoản CRM bé 2 với uid bé 1.
- Sau tạo AR thành công + request.uid trước đó rỗng → optimistic update pr.uid local state (đồng bộ writeback BE, tránh row stale tới lần fetch sau).
- **[Fix major]** Error surfacing 422: handleCreateActiveRequest (PaymentFlowContext.tsx:395-398) đang `String(detail)` → "[object Object]" với detail dạng object. Thêm nhánh parse `typeof detail === 'object' && detail.code === 'MISSING_UID'` → message tiếng Việt kèm tên bé; **tiện tay cover luôn MISSING_BILLS** (đang dính cùng bug, grep FE = 0 mapping).
- **[Fix minor]** handleCreateActiveRequestFromForm (:405-456) đang nuốt MỌI lỗi rồi fallback tạo AR local giả trên UI → với 4xx (đặc biệt 422) KHÔNG fallback local — setApiNote + throw.
- **[Fix minor]** Mini-card AR (drawer commitUid :746-754): disable nút Lưu khi có block uid rỗng (:935-941 thêm điều kiện) — chống UI hiển thị "đã xóa uid" trong khi server giữ giá trị cũ.
- Info-grid read-only (1930-1933): uid rỗng → "—" + nút nhỏ "Bổ sung" mở edit + scroll/focus ô UID (clone pattern handleOpenEditForTarget 1666-1704). PrRowCards.tsx:79: fallback "—".
- Sau khi đụng drawer: `grep 'Lần #{i' frontend/src/components/payment-request/` = 0 (learning filtered-list-index).

### 8. Unit test FE — 45'
- `CreatePaymentRequestModal.test.tsx` (MỚI — form hiện zero coverage; mock onSubmit qua props, MSW onUnhandledRequest:"error", stub matchMedia cho useIsMobile default-export): SĐT là input đầu + autofocus; nút Tạo ENABLED khi đủ SĐT+Tên+Tiền+Nguồn và UID trống; thiếu 1/4 → disabled; payload submit `uid===""`; onSubmit reject → hiện lỗi + modal không đóng + nút re-enable.
- `PaymentRequestDetailDrawer.arUidGate.test.tsx` (MỚI, pattern billguard.test.tsx): request.uid rỗng → có ô UID, nút tạo disabled tới khi điền; uid có sẵn → prefill tạo ngay; payload chứa uid nhập; **reject với detail object → message đúng, không "[object Object]"**; PR nhiều bé → ô UID per-row.

### 9. E2E: journey flow mới + api-client + mobile spec — 40'
- `e2e/journeys/payment-lifecycle.spec.ts`: B1 fill SĐT đầu, **KHÔNG điền UID lúc tạo**, THÊM bước chọn Nguồn (fix luôn baseline hỏng); bước mới: mở drawer → Kích hoạt → assert ô UID trống chặn submit → điền UID → AR OK → chain B2-B4 giữ nguyên. Canary end-to-end cho flow nghiệp vụ mới.
- **[Fix major]** `e2e/helpers/api-client.ts` createPR (89-105): uid optional + **lead_source làm DEFAULT MERGE bên trong client** (`lead_source: data.lead_source ?? "khac"`) thay vì chỉ đổi type — mọi caller hiện hữu (qr-capture.spec.ts:150,:162 gọi live không lead_source, payment-lifecycle) tự được vá, không phải sửa từng spec.
- `e2e/mobile-create-pr.spec.ts` (MỚI, tên mobile-* rơi vào project mobile Pixel 5 sẵn có; tái dùng helper openViaThem): mở modal tạo PR → bottom-sheet render, không tràn ngang (scrollWidth≤clientWidth), điền 4 trường bắt buộc → nút Tạo enabled → cancel (không tạo thật, khỏi cleanup).

### 10. Battery + smoke sandbox + rollout BE-trước-FE — 30'
- `cd backend && pytest` → `cd frontend && npx tsc -b && npm run build && npm run test && npm run e2e` (desktop pass NGUYÊN TRẠNG, **gồm qr-capture.spec.ts**) → `npx playwright test --project=mobile` → journeys chạy tay.
- Smoke sandbox điện thoại thật (palfish-gmv-manager-sandbox.vercel.app), 10 mục: [1] tạo PR chỉ SĐT+Tên+Tiền+Nguồn <30s PC+mobile; [2] PR mới hiện UID "—" ở bảng/card/drawer không crash; [3] sửa PR không-uid (đổi tiền) lưu được; [4] QR + nội dung CK không đổi so PR cũ; [5] Kích hoạt bị chặn → điền UID → AR OK; [6] verify DB payment_requests.uid đã writeback (qua đường TẠO AR, không chỉ PATCH); [7] tin DingTalk AR-created có UID thật (không "UID: ?"); [8] PR CŨ mở/sửa/kích hoạt y nguyên; [9] Sổ doanh thu 1 dòng duy nhất có uid; [10] grep 'Lần #{i' = 0.
- Deploy: **BE (Render) TRƯỚC** — FE cũ luôn gửi uid+leadSource non-empty nên BE mới không reject request nào của FE cũ; FE sau: branch → squash merge sandbox (Vercel auto) → duyệt → merge main. Commit: git add từng file (cấm -A). Cập nhật MODULES.md (file test mới).

## Guardrails

1. **0 migration DB**: giữ `uid text NOT NULL`, sentinel `""` — rollback = revert commit; insert path duy nhất (:1986) qua `_payment_request_insert_row` nên không lọt None.
2. **PR cũ không đổi 1 hành vi nào**: create/PATCH chỉ NỚI; gate AR pass tự động vì prefill từ pr.uid non-empty. Pytest B0 pin — xanh trước VÀ sau.
3. **Type-safety net giữ nguyên**: `PaymentRequest.uid: string` + mapper `?? ""` → mọi call-site `.toLowerCase()/.trim()` không thể crash.
4. **Gate MISSING_UID ở BE** (choke point cả 2 endpoint tạo AR) — không bypass qua API; triệt tiêu 2 lỗi con (ledger dedup + "UID: ?"). GIỮ min_length=1 ở PATCH AR.
5. **Writeback**: gọi ở CẢ đường tạo (`_save_active_request`) lẫn PATCH; fill-if-empty + điều kiện khớp tên bé; best-effort không fail request; log warning.
6. **Blast radius CSS = 0**: rule mobile mới scoped `create-pr-modal` trong @media max-767px; không đụng rule chung (15 modal/7 file); QrViewModal.test.tsx:529 pass nguyên trạng; desktop ≥768px không đổi pixel.
7. **Deploy order cứng BE→FE**; kể cả sai thứ tự, error surfacing mới hiển thị 400 trong modal thay vì chết im lặng.
8. **3 điểm PATCH trong 1 commit BE** + test mô phỏng payload FE `uid=""`.
9. **Vùng nóng 2917826** (drawer 2521-2660): diff tối thiểu, không refactor logic Tên bé; splitChildNames.test.ts + billguard làm regression net.
10. Verify gate mỗi mốc: `npx tsc -b` (KHÔNG --noEmit) + vitest + pytest + E2E desktop nguyên trạng + project mobile; smoke điện thoại thật trước merge main.

## Tests (tổng hợp)

| File | Loại | Nội dung |
|---|---|---|
| `backend/tests/test_pr_uid_optional.py` | MỚI | B0 pin hành vi cũ + hành vi mới (uid optional, lead_source required, 3 case PATCH) |
| `backend/tests/test_ar_uid_guard.py` | MỚI | **Endpoint-level**: 422 MISSING_UID; writeback qua đường tạo; không ghi đè; tên bé ≠ child_name → skip; builder "UID: ?" không crash |
| `backend/tests/test_pr_multi_child.py` | SỬA | fixture `_body()` thêm lead_source |
| `CreatePaymentRequestModal.test.tsx` | MỚI | SĐT đầu+autofocus; required 4 trường; payload uid=""; reject → lỗi hiển thị |
| `PaymentRequestDetailDrawer.arUidGate.test.tsx` | MỚI | Gate UID modal AR; per-row UID nhiều bé; detail object → message đúng |
| `e2e/journeys/payment-lifecycle.spec.ts` | SỬA | Flow mới: tạo không UID + chọn Nguồn + bổ sung UID tại B3 |
| `e2e/helpers/api-client.ts` | SỬA | uid optional + lead_source default-merge (vá luôn qr-capture) |
| `e2e/mobile-create-pr.spec.ts` | MỚI | Bottom-sheet Pixel 5, không tràn ngang, 4 trường dùng được |

GIỮ XANH nguyên trạng: 12 unit test payment-request, tvtsFilter, QrViewModal (scrim :529), splitChildNames, test_pr_multi_child, test_pr_list_load_all, E2E desktop crm-sync / dashboard-sales / **qr-capture** / payment-tvts-filter.

## Risks + Mitigation

1. Sót 1/3 guard PATCH → PR không-uid khóa cứng mọi edit → test ĐỎ trước mô phỏng payload handleUpdatePr; 3 điểm 1 commit.
2. AR tồn đọng uid rỗng trong DB (vốn đã kẹt PATCH 422 từ trước) → kiểm kê bước 2 TRƯỚC khi ship; >0 → fix tay SQL; gate mới không gây ra nhưng phải tránh bị đổ oan.
3. Gate chặn hành vi trước-đây-được-phép (tạo AR uid rỗng từ B1-drawer) → đúng yêu cầu nghiệp vụ; FE thêm ô UID ngay trong modal kích hoạt + message tiếng Việt; sale bổ sung tại chỗ.
4. Siết lead_source 400 với caller ngoài dự kiến → verified: endpoint create là đường insert duy nhất; caller = FE modal (enforce sẵn) + e2e api-client (default-merge cùng diff); journeys là canary.
5. Journeys baseline đỏ sẵn (spec thiếu Nguồn) → chốt baseline bước 2; fix spec cùng commit FE.
6. Conflict vùng drawer 2917826 → làm trên main mới nhất, đọc code thật trước khi viết (tiền lệ revert fac15e0); diff tối thiểu.
7. Sale xóa uid PR cũ qua PATCH nới lỏng → chấp nhận có chủ đích (gate B3 chặn hạ nguồn); chặt hơn = +3 dòng BE (open question 1).
8. Writeback fail lặng lẽ → log warning; optimistic update FE + đường edit drawer là backup; pytest pin điều kiện gọi.
9. CSS bottom-sheet lan sang modal khác / vỡ desktop → scoped class + E2E desktop + mobile + smoke thật; tránh vùng comment hỏng ~2055.
10. Đổi prop onSubmit → Promise lệch chỗ mount → handleCreate đã async; tsc -b bắt mismatch; unit test pin.

## Không làm (cố tình ngoài scope)

- KHÔNG migration `ALTER COLUMN uid DROP NOT NULL` — sentinel "" đủ, an toàn hơn prod.
- KHÔNG unique constraint / validate format uid — data cũ có trùng hợp lệ.
- KHÔNG đổi `PaymentRequest.uid` sang `string | null`.
- KHÔNG nới `ActiveRequestPatchUidPayload.min_length=1`.
- KHÔNG sửa rule CSS chung `.gmv-prototype-modal-scrim/.modal/.field-row` — bottom-sheet hóa 15 modal còn lại để Task 2.
- KHÔNG rework form thành section collapse "Bổ sung sau" — vượt yêu cầu, tăng diff + test surface; chỉ chuyển ô UID xuống + hint.
- KHÔNG đụng transfer_code/QR/nội dung CK, SePay matching, Zalo/DingTalk builders, stale-content detection, logic splitChildNames, PATCH PR cancelled.
- KHÔNG sửa ActivationTab standalone form — đã tự bắt buộc UID (canSubmit:181).
- **lead_channel conditional (nguồn cần kênh) cố tình chỉ enforce ở FE** — caller duy nhất là FE modal; API trực tiếp tạo PR nguồn-cần-kênh không kênh được chấp nhận (metadata, không chặn dòng tiền).

## Open questions (chốt trước bước 4)

1. **PATCH có cấm clear uid về rỗng khi PR đang có giá trị không?** Mặc định: cho phép (nhất quán uid-optional, gate B3 chặn hạ nguồn). Chặt hơn = +3 dòng BE.
2. **Kết quả kiểm kê AR uid-rỗng tồn đọng**: nếu >0, fix tay SQL hay để nguyên (chúng đã kẹt PATCH từ trước)?
3. ~~1 ô UID chung hay per-row?~~ **ĐÃ CHỐT theo critic: per-row khi PR nhiều bé** (ArDraftRow có sẵn field uid), 1 ô chung khi ≤1 bé.
4. **Badge "Thiếu UID" ở bảng/card B1** (~15'): PR tạo không uid, tiền vào đủ ở B2, sale quên kích hoạt → hiện không có nhắc nhở nào. B2/B4 vẫn đúng (match theo transfer_code) — lỗ duy nhất là REMINDER. Sale trên mobile dễ quên hơn desktop → khuyến nghị LÀM ngay đợt này.
