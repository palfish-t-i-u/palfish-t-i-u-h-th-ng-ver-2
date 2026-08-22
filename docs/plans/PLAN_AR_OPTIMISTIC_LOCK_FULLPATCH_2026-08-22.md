# PLAN: Khoá lạc quan (expected_updated_at) cho full-PATCH Active Request — 2026-08-22

> **ĐỌC TRƯỚC KHI LÀM** (cho agent thực thi, kể cả sau compaction / agent mới):
> - Mở lại & VERIFY khớp "Hiện trạng" (mục 4): `frontend/src/types/paymentRequest.ts:207,227,398,433` · `frontend/src/components/payment-request/paymentRequestUtils.ts:377` · `frontend/src/contexts/PaymentFlowContext.tsx:532,550,645` · `frontend/src/components/ActivationTab.tsx:2454` · `backend/activation_routes.py:557,2235,2269`.
> - Invariant top KHÔNG được phá: (a) endpoint per-course order_id (Phase 1) GIỮ NGUYÊN — không thêm expected_updated_at, nó đã atomic. (b) KHÔNG bao giờ ghi đè âm thầm (G-UID1). (c) BE contract KHÔNG đổi — plan này FE-only.
> - Gặp STOP condition (mục cuối) → DỪNG, hỏi user.
>
> **Bối cảnh**: Đây là **Phase 2** nối tiếp Phase 1 (đã xong: `saveOrderIdInline` + `patchCourseOrderId` fallback → endpoint per-course atomic; fix DingTalk 🔄). Phase 1 vá 1 đường (lưu Order ID). Phase 2 bịt **cả lớp** full-PATCH còn lại.

## 1. Vấn đề & bằng chứng

- **Triệu chứng**: 2 người sửa cùng 1 AR đồng thời → người lưu sau ghi đè âm thầm thay đổi của người trước (tên gói, số tiền, UID…) vì FE gửi **toàn bộ** `uids_data` dựng từ snapshot cũ trong bộ nhớ. Có thể kèm DingTalk 🔄 sai (như bug gốc chị Thu Hiền).
- **Root cause**: mọi full-PATCH (`endpoints.activeRequests.update(arId, {uids_data})`) gửi cả mảng `uids_data` reconstruct từ state client — không kiểm tra AR có bị đổi ở DB từ lúc load. BE khi KHÔNG có `expected_updated_at` rơi vào UPDATE thường, ghi đè không điều kiện (`activation_routes.py:2312`).
- **Bằng chứng (workflow recon 2026-08-22, 3 agent, journal wf_346bcdda-8c7)**:
  - 4 call site FE còn full-PATCH vulnerable (mục 4).
  - BE `_serialize_ar` **đã trả `updated_at`** (`activation_routes.py:557`) — client nhận được nhưng FE không map ⇒ đủ nguyên liệu làm optimistic lock, chỉ thiếu plumbing FE.
  - BE guard đã LIVE (`activation_routes.py:2235-2275`) + RPC trong `schema_prod.sql` + test `backend/tests/test_rpc_integration.py:242` (wrong_ts → conflict). ⇒ **không cần migration, không sửa BE**.

## 2. Approach chọn + 5-criteria

**Approach: FE gửi `expected_updated_at` cho MỌI full-PATCH; xử 409 bằng cách nạp lại AR tươi từ `detail.current` rồi báo user thao tác lại (KHÔNG auto-retry).**

```
TC1 Triệt để:      ✅ Đóng cả lớp full-PATCH (4 site) bằng 1 cơ chế; dùng đúng guard BE đã có.
TC2 Không lỗi con:  ✅ Không auto-retry (tránh re-clobber). Per-course order_id giữ nguyên. On 409 nạp bản mới → drawer đồng bộ, không mất data người khác.
TC3 Hạ tầng/perf:   ✅ FE-only, 0 migration, 0 endpoint mới. 409 hiếm; không thêm network call ở happy path (expected_updated_at đi kèm PATCH sẵn có).
TC4 Token economy:  ✅ Recon xong (3 agent). Thực thi inline + tối đa 1 subagent builder cho T3. Không fan-out.
TC5 Task-model:     ✅ T1/T4 cơ học→Sonnet/inline. T2 (helper dùng chung 2 file, giữ TC2)→ ⚠️ Opus. T3 wiring→Sonnet effort cao.
→ Recommend (5/5)
```

**Đã loại**:
- *Per-course endpoint cho từng field* (như Phase 1 làm cho order_id): loại — cần N endpoint cho N field (gói/tiền/uid/phone/invoice_requested_at) + không làm được cho thao tác thêm/xoá course/UID. Tăng BE surface, phá TC1/TC3.
- *Auto-merge + retry trên 409*: loại — merge sai âm thầm = phá TC2. Nạp bản mới + để user quyết an toàn hơn.

## 3. GUARDRAILS — invariant PHẢI GIỮ

| # | Quy tắc không được phá | Nguồn | Cách kiểm |
|---|------------------------|-------|-----------|
| G1 | Endpoint per-course order_id (`patchCourseOrderId`) KHÔNG thêm `expected_updated_at`, giữ atomic | Phase 1 + `beGuard.perCourseEndpointNeedsGuard=false` | grep `patchCourseOrderId` không đụng; test order-id path còn xanh |
| G2 | Không ghi đè âm thầm — on 409 phải nạp bản mới, KHÔNG lặng lẽ bỏ qua | `activation/CLAUDE.md` G-UID1 | test 409 → state cập nhật từ `detail.current` + apiNote hiện |
| G3 | FE-only — 0 sửa BE, 0 migration | mục 1 bằng chứng | `git diff` chỉ chạm frontend/ |
| G4 | `expected_updated_at` = `updatedAt` TƯƠI NHẤT client giữ (từ `fromApiActiveRequest` lần cuối), không phải giá trị cứng | `fePlumb.freshestSourceForPatch` | đọc: mỗi PATCH lấy `currentAr.updatedAt` từ state, không cache rời |
| G5 | Match conflict qua `err.response.data.detail.detail === "Active Request da duoc cap nhat boi nguoi khac"` (NESTED, khác pattern order_id "ton tai") | `activation_routes.py:2269-2275` | test parse đúng shape lồng |
| G6 | Không auto-retry sau 409 | TC2 | test: chỉ 1 lần gọi `.update`, không gọi lần 2 |

## 4. Hiện trạng (ground truth snapshot)

**BE (chỉ đọc, không sửa) — `backend/activation_routes.py`:**
```py
# 557  _serialize_ar out: đã có
        "updated_at": row.get("updated_at"),
# 2235 guard path
            if body.expected_updated_at:
                ... rpc replace_active_request_uids_data_guarded ...
# 2261-2275 conflict
                if rpc_out.get("conflict"):
                    ... current_ar = _serialize_ar_with_hold(...)
                    raise HTTPException(409, detail={
                        "detail": "Active Request da duoc cap nhat boi nguoi khac",
                        "current": current_ar })
# 2312 (khi KHÔNG có expected_updated_at) → UPDATE thường, KHÔNG guard  ← đường vulnerable
```

**FE types — `frontend/src/types/paymentRequest.ts`:**
```ts
// 207 export interface ActiveRequest { ... 226 isCreditOrder?: boolean; 227 }   ← THIẾU updatedAt
// 2   export type ActiveRequestApiRow = { ... 398 created_at?: string; ... 407 };  ← THIẾU updated_at
// 433 export type PatchActiveRequestPayload = {
//       customer_name?; info_confirmed?; uids_data?;
//     };  ← THIẾU expected_updated_at
```

**FE parser — `frontend/src/components/payment-request/paymentRequestUtils.ts`:**
```ts
// 370 export function fromApiActiveRequest(raw): ActiveRequest {
// 377   createdAt: raw.created_at ?? "",      ← thêm updatedAt ngay dưới
```

**FE full-PATCH sites (vulnerable):**
```
PaymentFlowContext.tsx:532  updateActiveRequestCoursePackage  — DEAD (không consumer nào gọi), latent
PaymentFlowContext.tsx:550  saveActiveRequest                 — nút "Lưu" AR mini-card (PR drawer, B1)
PaymentFlowContext.tsx:645  requestInvoiceForCourse           — "Chuyển sang Xuất HĐ" (B3→B4)
ActivationTab.tsx:2454      persistActiveRequest              — 4 caller: saveUidHeader, syncUidFromPr,
                                                                persistStructure, saveCourseRow(gói/tiền/orderId)
```
> Ghi chú rò rỉ Phase-1-liền-kề: `saveCourseRow` vẫn gửi `order_id` trong full uids_data ⇒ 1 lần lưu stale có thể revert order_id đã set atomic. Guard Phase 2 cũng bịt luôn ca này (đổi order_id ⇒ bump `updated_at` ⇒ 409).

## 5. Tasks (nguyên tử, có checklist)

- [ ] **T1 — Plumbing `updated_at` xuyên FE (mở đường mang timestamp)**
  - File & đổi chính xác:
    - `types/paymentRequest.ts` (trong `ActiveRequestApiRow`, sau `created_at?`): thêm `updated_at?: string;`
    - `types/paymentRequest.ts` (trong `interface ActiveRequest`, trước `}` dòng 227): thêm `updatedAt?: string;`
    - `types/paymentRequest.ts` (trong `PatchActiveRequestPayload`): thêm `expected_updated_at?: string;`
    - `paymentRequestUtils.ts:377` (dưới `createdAt`): thêm `updatedAt: raw.updated_at ?? undefined,`
  - Vì sao: client phải giữ + gửi lại `updated_at` tươi. Guardrail: G4.
  - Verify: `npx tsc -b` xanh.
  - Ai làm: **inline / Sonnet** (cơ học).

- [ ] **T2 — Helper dùng chung: build payload guarded + parse 409 conflict**
  - File: `frontend/src/lib/arConcurrency.ts` (MỚI, pure fns, no React).
    - `withExpectedUpdatedAt<T>(body: T, currentAr: ActiveRequest): T & {expected_updated_at?: string}` — chèn `expected_updated_at: currentAr.updatedAt` nếu có.
    - `parseArConflict(err): { conflict: boolean; current?: ActiveRequestApiRow }` — đọc `err.response?.status===409 && err.response.data?.detail?.detail === "Active Request da duoc cap nhat boi nguoi khac"`; trả `current = err.response.data.detail.current`.
  - Vì sao: 2 file (Context + ActivationTab) dùng chung 1 logic, tránh lệch. Guardrail: G4, G5.
  - Verify: unit test T4 xanh.
  - Ai làm: **⚠️ ESCALATE OPUS** — logic dùng chung nhiều site, phải giữ TC2 + G5 (shape lồng dễ sai).

- [ ] **T3 — Wire 4 call site qua helper + xử 409**
  - Mẫu xử 409 (mọi site): gọi `parseArConflict(err)`; nếu conflict → `updateActiveRequest(arId, () => fromApiActiveRequest(current))` (nạp bản mới vào state) + `setApiNote("AR vừa được người khác cập nhật — đã tải lại bản mới, vui lòng kiểm tra và thao tác lại.")` + return `{ok:false, conflict:true}`. KHÔNG retry (G6).
  - Site 4 `ActivationTab.tsx:2454 persistActiveRequest`: dùng `withExpectedUpdatedAt(body, next)` trước `endpoints.activeRequests.update`; bọc catch bằng `parseArConflict`.
  - Site 2 `PaymentFlowContext.tsx:550 saveActiveRequest`: tương tự, `currentAr = next`.
  - Site 3 `PaymentFlowContext.tsx:645 requestInvoiceForCourse`: `currentAr = currentAr` (bản find từ state).
  - Site 1 `PaymentFlowContext.tsx:532 updateActiveRequestCoursePackage`: DEAD → **guard cho nhất quán** (rẻ) HOẶC xoá hẳn. Mặc định: guard. (Nếu chọn xoá → cập nhật `MODULES.md`, xác nhận không export ra ngoài.)
  - Vì sao: mỗi full-PATCH giờ fail-safe. Guardrail: G1 (không đụng per-course), G2, G6.
  - Verify: `tsc -b` + test T4.
  - Ai làm: **Sonnet effort cao** hoặc subagent `cavecrew-builder` (path chính xác ở trên). Opus review diff.

- [ ] **T4 — Test**
  - File: `frontend/src/lib/arConcurrency.test.ts`
    - `parseArConflict`: (a) 409 shape lồng đúng → `{conflict:true, current}`; (b) 409 khác string → `{conflict:false}`; (c) lỗi order_id "ton tai" (per-course) → `{conflict:false}` (G1/G5 không nhầm lớp); (d) network err non-409 → `{conflict:false}`.
    - `withExpectedUpdatedAt`: có `updatedAt` → chèn; không có → không chèn field (không gửi `expected_updated_at: undefined` gây 400).
  - File: `frontend/src/contexts/PaymentFlowContext.orderid.test.ts` (mở rộng hoặc mới) — **regression bug gốc lớp full-PATCH**:
    - Mock `endpoints.activeRequests.update` trả 409 nested → assert: state AR cập nhật từ `detail.current`, apiNote set, `.update` gọi ĐÚNG 1 lần (G6), KHÔNG clobber.
  - Guard test: per-course `patchCourseOrderId` vẫn KHÔNG kèm `expected_updated_at` (G1).
  - Verify: `npm run test -- --run src/lib/arConcurrency.test.ts` xanh.
  - Ai làm: **Sonnet**.

## 6. Test plan (tổng hợp)

### Unit (mỗi guardrail 1 case)
- [ ] `arConcurrency.test.ts::parseArConflict` — G5 (shape lồng) + G1 (không nhầm order_id "ton tai")
- [ ] `arConcurrency.test.ts::withExpectedUpdatedAt` — G4 (không có updatedAt thì bỏ field)
- [ ] Regression full-PATCH: 409 → nạp `detail.current`, 1 lần gọi, không clobber (G2, G6)

### Manual (đụng UI concurrency)
- [ ] 2 tab: tab A đổi tên gói AR → lưu. Tab B (mở trước) đổi số tiền → lưu → kỳ vọng: báo "vừa được người khác cập nhật", nạp bản mới (thấy tên gói của A), KHÔNG mất đổi của A.
- [ ] Lưu bình thường (không ai sửa song song) → thành công như cũ (không regression happy path).
- [ ] Lưu Order ID (Phase 1) vẫn chạy, không 409 giả.

### Build/verify
- [ ] `cd frontend && npx tsc -b` xanh
- [ ] `cd frontend && npm run test` xanh (kèm test cũ ActivationTab.orderid)

## 7. Rollback
Revert commit Phase 2 (FE-only). Không migration, không cấu hình prod. BE guard vốn đã live — revert FE ⇒ full-PATCH quay lại không gửi `expected_updated_at` ⇒ BE tự rơi về UPDATE thường (hành vi cũ). An toàn tuyệt đối.

## 8. Definition of Done
- [ ] G1–G6 còn giữ (đối chiếu mục 3)
- [ ] Test mục 6 xanh, có regression lớp full-PATCH (409 không clobber)
- [ ] `tsc -b` pass
- [ ] Manual 2-tab: conflict được chặn, bản mới nạp, không mất data
- [ ] `git diff` chỉ chạm `frontend/` (G3)

## STOP conditions (dừng & hỏi user)
- Code thực tế lệch "Hiện trạng" mục 4 (đặc biệt số dòng FE type / conflict shape BE).
- BE trả conflict shape KHÁC `detail.detail` string ở mục 4 → helper G5 sai, dừng.
- 409 giả xuất hiện ở happy path (timestamptz precision lệch round-trip) → dừng, điều tra so khớp `updated_at` isoformat ↔ Postgres.
- Muốn xoá `updateActiveRequestCoursePackage` (site 1) thay vì guard → xác nhận user (đổi scope, đụng MODULES.md).
- Phát sinh phải sửa BE → dừng (phá G3, cần handoff).
