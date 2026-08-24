# PLAN: Xác nhận "đã điền địa chỉ trên CRM" khi báo đơn (số VN) — 2026-08-22

> **ĐỌC TRƯỚC KHI LÀM** (cho agent thực thi, kể cả sau compaction / agent mới):
> - Mở lại + VERIFY khớp mục §4 trước khi sửa:
>   - `frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx` — `isForeign` L666, state modal L1686-1690, IIFE modal L2782-3131, nút submit modal (trong IIFE, sau L3072), opts submit L3107-3112.
>   - `backend/activation_routes.py` — `_serialize_ar` def L521, `_serialize_ar_with_hold` def L589 (**14 call site**), `_save_active_request` L1613-1662, create-via-PR ~L2432-2442, append ~L2524-2531.
>   - `frontend/src/components/payment-request/paymentRequestUtils.ts` — `isForeignCustomer` L21, `fromApiActiveRequest` ~L370-416, `buildCreateActiveRequestPayload` L429-474.
> - **Invariant top (không được phá):**
>   1. Phân biệt OV/VN CHỈ qua `isForeignCustomer(country, province)` — reuse `isForeign` sẵn có L666, CẤM viết lại `country !== "VN"` (G1).
>   2. Cờ AR mới PHẢI có ở **mọi** serialize đơn-AR (14 site qua `_serialize_ar_with_hold`), nếu không mutation response đè state FE (G2).
>   3. Nút báo đơn là RESUMABLE — checkbox chỉ THÊM điều kiện, KHÔNG thay `reportBtn.enabled` (G3).
> - Gặp STOP condition (mục cuối) → DỪNG, hỏi user, KHÔNG tự quyết.

---

## 1. Vấn đề & bằng chứng

- **Triệu chứng:** Ô địa chỉ (Tỉnh/TP + Phường/Xã) bắt buộc khi **báo đơn** số VN → sale kêu thừa.
- **Root cause (đã xác minh 22/8, sale Phương Thúy + kế toán Sương Mai trong group):** Địa chỉ nhập ở GMV **KHÔNG** được đẩy sang CRM để tạo gói học. Sale phải **tự điền địa chỉ trực tiếp trên CRM** (CRM bắt buộc địa chỉ cho số đầu 84). ⇒ Ô địa chỉ GMV lúc báo đơn = **double-entry vô nghĩa**.
- **Bằng chứng chặn cũ là FE-only:** BE `_save_active_request` (activation_routes.py) chưa bao giờ chặn tạo AR theo địa chỉ; địa chỉ chỉ enforce ở **Xuất HĐ B4** (`getInvoiceBlockers` FE + `_invoice_address_complete` BE). Gỡ FE là đủ + an toàn.
- **Đã làm (DONE + prod `cb416fb`):** gỡ box đỏ + guard `activationAddrMissing` khỏi nút báo đơn; popup "Chưa thể báo đơn" giờ chỉ còn "Thiếu ảnh bill". `activationAddressComplete()` còn ở `paymentRequestUtils.ts:541` nhưng không còn caller ở drawer.
- **Feature này:** thay ô nhập bằng **1 ô tích tự xác nhận** — forcing function nhắc sale điền CRM, rẻ hơn nhập 3 ô, 0 double-entry, để Thu Hiền yên tâm tạo gói.

---

## 2. Approach chọn + 5-criteria

**Approach: Mirror `hold_activation` end-to-end + thêm cột `crm_address_confirmed` (boolean) trên `active_requests`. FE là cổng cứng (nút submit disabled tới khi tick), BE chỉ LƯU cờ (không hard-reject). Chỉ khách VN; OV bỏ qua.**

```
TC1 Triệt để:      ✅ Gate ở FE + lưu bản ghi + hiện cho Ops; không chỉ "nhắc suông". Không tái lập double-entry.
TC2 Không lỗi con:  ✅ OV loại trừ (G1); serialize 14-site (G2); gate additive (G3); append không hạ true→false (G4); B4 nguyên (G5). BE không hard-reject → deploy FE/BE độc lập không gãy.
TC3 Hạ tầng/perf:   ✅ 1 cột boolean, 0 bảng mới, 0 query nặng, 0 network call thêm. Mirror cột đã có.
TC4 Token economy:  ✅ Đa số task cơ học → Sonnet/inline; chỉ T3 (14-site serialize) cân nhắc Opus. Dùng cavecrew-builder cho task path rõ. Không fan-out.
TC5 Task-model:     ✅ Gán model mỗi task ở §5.
→ Recommend (5/5)
```

**Đã loại:**
- *Upload ảnh chứng minh đã điền CRM* — nặng hạ tầng (storage) + thao tác sale chậm hơn; user chọn checkbox. (fail TC3)
- *Chỉ nhắc text không chặn* — không triệt để, sale vẫn quên. (fail TC1)
- *BE hard-reject VN thiếu cờ* — rủi ro incident deploy-order Vercel/Render (BE reject trước khi FE gửi cờ → mọi báo đơn VN gãy). Để dành Task 8 (tùy chọn, sau). (fail TC2 nếu làm ngay)

---

## 3. GUARDRAILS — invariant PHẢI GIỮ

| # | Quy tắc không được phá | Nguồn | Cách kiểm |
|---|------------------------|-------|-----------|
| G1 | OV/VN CHỈ qua `isForeignCustomer(country, province)`. Reuse `isForeign` L666, CẤM inline `country !== "VN"`. Số Việt ≠ khách ở VN. | `docs/learnings/foreign-customer-detected-by-dial-not-province.md` | `grep -n 'country.*!==.*"VN"' PaymentRequestDetailDrawer.tsx` không có dòng MỚI; checkbox dùng `!isForeign` |
| G2 | Cờ `crm_address_confirmed` PHẢI có ở **mọi** serialize đơn-AR (14 site qua `_serialize_ar_with_hold`), nếu không mutation response đè state FE về default. | `docs/learnings/visibility-gate-mutation-endpoints-unset-flag.md` | `grep -c "_serialize_ar_with_hold(" activation_routes.py` == 14; field xuất hiện trong `_serialize_ar` base; FE `fromApiActiveRequest` default `?? true` (backstop nếu response cũ thiếu field) |
| G3 | Nút báo đơn RESUMABLE (`reportButtonState` theo tiền dư). Checkbox chỉ THÊM điều kiện disable, KHÔNG thay/ghi đè `reportBtn.enabled`. | `docs/learnings/button-gate-existence-vs-resource.md` | Nút modal `disabled = <đk cũ> || (needConfirm && !crmAddressConfirmed)`; `reportButtonState` không đổi signature |
| G4 | Append KHÔNG hạ `true → false`. Append chỉ patch cờ khi payload có gửi. | idempotency + `payment-request/CLAUDE.md` (append flow) | pytest: append không cờ → giữ nguyên `true` |
| G5 | KHÔNG đụng cổng **Xuất HĐ B4** (`getInvoiceBlockers`, `_invoice_address_complete`, `_build_invoice_course_patch`). | memory `invoice-address-required-rule`; `docs/learnings/invoice-export-course-field-naming-trap.md` | 3 hàm đó không xuất hiện trong diff |
| G6 | Không ghi đè âm thầm dữ liệu khách. Cờ chỉ set bởi hành động sale rõ ràng (tick), không auto. | `payment-request/CLAUDE.md` (G-UID1 never-overwrite spirit) | đọc diff: không auto-set true ngoài payload sale |
| G7 | Không đụng `sync_ledger_from_ar_course` (insert-once, không sửa hồi tố). | `payment-request/CLAUDE.md` | hàm không trong diff |

---

## 4. Hiện trạng (ground truth snapshot — VERIFY trước khi sửa)

```
# PaymentRequestDetailDrawer.tsx:666 — helper OV/VN đã có sẵn, REUSE:
const isForeign = isForeignCustomer(request.country, request.province);

# PaymentRequestDetailDrawer.tsx:1689-1690 — state hold (thêm crmAddressConfirmed cạnh đây):
const [holdActivation, setHoldActivation] = useState(false);
const [holdNote, setHoldNote] = useState("");

# PaymentRequestDetailDrawer.tsx:1645-1647 — type opts prop:
onCreateActiveRequest: (rows: ArDraftRow[], opts?: { holdActivation?: boolean; holdNote?: string }) => void;
onAppendActiveRequest: (rows: ArDraftRow[], opts?: { holdActivation?: boolean; holdNote?: string }) => Promise<void>;

# PaymentRequestDetailDrawer.tsx:3107-3112 — build opts + gọi handler:
const holdOpts = { holdActivation, holdNote: holdNote.trim() || undefined };
...
if (reportBtn.isAppend) { await onAppendActiveRequest(rows, holdOpts); }
else { await onCreateActiveRequest(rows, holdOpts); }

# paymentRequest.ts:216-217 (ActiveRequest) / :352-356 (CreateActiveRequestPayload) / :397-398 (ApiRow):
holdActivation?: boolean; holdNote?: string | null;
hold_activation?: boolean; hold_note?: string | null;

# activation_routes.py:521 def _serialize_ar(...) → output có hold_activation/hold_note (L562-563)
# activation_routes.py:589 def _serialize_ar_with_hold(...) — 14 call site (grep -c == 14)
# activation_routes.py:1654 insert dict có "hold_activation": ... (thêm crm_address_confirmed cạnh đây)
```

---

## 5. Tasks (nguyên tử, checklist tiến độ)

- [ ] **T1 — Migration cột `crm_address_confirmed`**
  - File (mới): `backend/migrations/2026-08-22-ar-crm-address-confirmed.sql`
  - Nội dung:
    ```sql
    ALTER TABLE active_requests
      ADD COLUMN IF NOT EXISTS crm_address_confirmed boolean NOT NULL DEFAULT false;
    -- Grandfather đơn cũ (đã qua cổng địa chỉ cũ / đã xử lý) → Ops không cảnh báo giả
    UPDATE active_requests SET crm_address_confirmed = true WHERE crm_address_confirmed = false;
    ```
  - Vì sao: mirror `hold_activation` (NOT NULL DEFAULT false); grandfather tránh noise (G2).
  - Guardrail: G2.
  - Verify: chạy **sandbox** `pxgybyfiwywksesyogti` trước → `select count(*) from active_requests where crm_address_confirmed` = tổng số dòng → rồi prod `jozcvbbypwvzaefteoxn`.
  - Ai làm: **inline** (Minh chạy tay qua Supabase SQL, theo convention repo — KHÔNG dùng migration tool tự động).

- [ ] **T2 — BE persist trong `_save_active_request` + create/append đọc payload**
  - File: `backend/activation_routes.py` (`_save_active_request` L1613-1662; create-via-PR ~L2432-2442; append ~L2524-2531)
  - Đổi chính xác: thêm param `crm_address_confirmed: bool = False` vào signature; thêm `"crm_address_confirmed": crm_address_confirmed` vào insert dict cạnh `hold_activation` L1654. Create/append: đọc `body.get("crm_address_confirmed", False)` truyền vào. **Append: chỉ patch cờ khi `"crm_address_confirmed" in body`** (G4).
  - Vì sao: lưu bản ghi self-attestation; append không hạ true→false.
  - Guardrail: G4, G6.
  - Verify: `cd backend && python -m pytest tests/ -q` (sau T4).
  - Ai làm: **cavecrew-builder** · model **Sonnet** (single-file, path rõ, mirror hold_activation).

- [ ] **T3 — BE serialize cờ ở MỌI call site (14) ⚠️ ESCALATE OPUS**
  - File: `backend/activation_routes.py` (`_serialize_ar` base L521; wrapper `_serialize_ar_with_hold` L589)
  - Đổi chính xác: thêm `"crm_address_confirmed": bool(row.get("crm_address_confirmed", True))` vào output dict của `_serialize_ar` (base, cạnh hold L562-563). Vì wrapper gọi base → mọi site có field. Kiểm create/append (T2) serialize từ dict CÓ field (không default False rơi ra ngoài).
  - Vì sao: **trap 14-callsite** — nếu chỉ list có cờ, mọi mutation endpoint trả AR default → `PaymentFlowContext` merge đè state → cờ FE sai (append-skip + Ops badge hỏng). Default `True` khi thiếu = an toàn.
  - Guardrail: **G2** (cốt lõi).
  - Verify: `grep -c "_serialize_ar_with_hold(" backend/activation_routes.py` == 14; đọc từng call site create/append đảm bảo row-dict có field.
  - Ai làm: **Opus** (cross-cutting, đúng trap đã có learning; reasoning "call site nào build dict tay vs re-SELECT").

- [ ] **T4 — BE unit test**
  - File: mở rộng/ thêm `backend/tests/test_activation_*.py`
  - Case: (a) persist true & false; (b) serialize (qua wrapper) trả đúng field; (c) **regression G4**: append KHÔNG cờ → AR giữ `crm_address_confirmed=true`; (d) serialize AR không có cột (row cũ) → default `True`.
  - Guardrail: G2, G4.
  - Verify: `python -m pytest tests/ -q` xanh.
  - Ai làm: **cavecrew-builder** · model **Sonnet**.

- [ ] **T5 — FE types + mapper + payload builder**
  - File: `frontend/src/types/paymentRequest.ts` + `paymentRequestUtils.ts`
  - Đổi chính xác:
    - `ActiveRequest` (sau L217): `crmAddressConfirmed?: boolean;`
    - `CreateActiveRequestPayload` (L356): `crm_address_confirmed?: boolean;`
    - `ActiveRequestApiRow` (sau L398): `crm_address_confirmed?: boolean;`
    - `fromApiActiveRequest` (~L382): `crmAddressConfirmed: raw.crm_address_confirmed ?? true,` (**backstop G2** — response cũ thiếu field = true, không cảnh báo giả)
    - `buildCreateActiveRequestPayload` (opts branch L469-472): `if (opts?.crmAddressConfirmed) payload.crm_address_confirmed = true;`
    - Mở rộng type opts `onCreateActiveRequest`/`onAppendActiveRequest` (L1645-1647) + `PaymentFlowContext` handlers (~L419-465): thêm `crmAddressConfirmed?: boolean` (chỉ đi xuyên qua).
  - Guardrail: G2.
  - Verify: `cd frontend && npx tsc -b` xanh.
  - Ai làm: **cavecrew-builder** · model **Sonnet** (cơ học, nhiều file nhưng thêm-field).

- [ ] **T6 — FE checkbox trong modal báo đơn (cổng cứng, VN-only)**
  - File: `frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx` (IIFE modal L2782-3131)
  - Đổi chính xác:
    - State cạnh L1690: `const [crmAddressConfirmed, setCrmAddressConfirmed] = useState(false);`
    - Reset khi mở modal (~L2757-2764, chỗ reset draft): `setCrmAddressConfirmed(false);`
    - **Reuse `isForeign` L666** (KHÔNG recompute — G1). Trong IIFE: `const needConfirm = !isForeign && !(reportBtn.isAppend && activeRequest?.crmAddressConfirmed === true);`
    - Render checkbox (sau vùng hold ~L2858), **chỉ khi `needConfirm`**:
      ```tsx
      <label className="flex items-start gap-2 mt-3 text-sm">
        <input type="checkbox" checked={crmAddressConfirmed}
          onChange={(e) => setCrmAddressConfirmed(e.target.checked)} className="mt-0.5" />
        <span>Tôi đã điền địa chỉ khách (Tỉnh/TP · Phường/Xã · Số nhà) trên <b>CRM</b> để tạo gói học.
          <span className="block text-slate-500">CRM bắt buộc địa chỉ cho số Việt Nam. GMV không còn giữ ô này.</span>
        </span>
      </label>
      ```
    - opts submit (L3107): `const holdOpts = { holdActivation, holdNote: holdNote.trim() || undefined, crmAddressConfirmed: needConfirm ? crmAddressConfirmed : true };` (OV / append-đã-confirmed gửi `true` — không đè false).
    - Nút submit modal (trong IIFE, gần L3123-3126): **thêm** `disabled={arSubmitting || (needConfirm && !crmAddressConfirmed)}` — GIỮ nguyên điều kiện disable cũ (G3).
  - Vì sao: gate cứng "bắt buộc mới báo đơn được"; OV & append-confirmed không vướng.
  - Guardrail: **G1, G3**, G6.
  - Verify: `tsc -b` xanh + smoke (§6).
  - Ai làm: **Opus** (đụng G1+G3 cùng lúc, logic needConfirm cho create vs append vs OV — nhiều nhánh; single-file nhưng subtle).

- [ ] **T7 — FE hiển thị cho Ops (kế toán) trong drawer kích hoạt**
  - File: `frontend/src/components/activation/ActivationDetailDrawer.tsx` (cạnh panel hold ~ActivationTab L1148-1163)
  - Đổi chính xác: nếu `ar.crmAddressConfirmed === true` → dòng nhẹ `<span className="text-emerald-600">✓ Sale đã xác nhận điền địa chỉ trên CRM</span>`. Nếu `!ar.crmAddressConfirmed` (VN, hiếm — legacy append/tạo tay) → `<span className="badge badge-warning">⚠ Sale chưa xác nhận địa chỉ CRM</span>`.
  - Vì sao: Thu Hiền có tín hiệu rõ khi tạo gói. **YAGNI: KHÔNG badge ở row list / mobile card** (gate cứng ⇒ đơn mới luôn confirmed ⇒ noise).
  - Guardrail: G2 (đọc `crmAddressConfirmed` từ AR đã serialize đúng).
  - Verify: mở drawer 1 AR mới → thấy ✓.
  - Ai làm: **cavecrew-builder** · model **Sonnet**.

- [ ] **T8 — (TÙY CHỌN, ĐỂ SAU) BE hard-gate**
  - Nếu muốn siết server-side: create-via-PR + append, khi PR VN (`not _is_foreign(...)`) và `crm_address_confirmed != True` → `HTTPException(400, "Cần xác nhận đã điền địa chỉ trên CRM trước khi báo đơn (số VN).")`.
  - ⚠️ **CHỈ deploy sau khi FE prod** (tránh incident deploy-order). Mặc định KHÔNG làm.
  - Ai làm: hoãn.

- [ ] **T9 — Verify tổng + docs**
  - `cd frontend && npx tsc -b` + `npm run test` xanh; `cd backend && pytest -q` xanh.
  - Cập nhật memory `invoice-address-required-rule` (TODO → DONE) + note internal `bao-don-xac-nhan-dia-chi-crm-2026-08-22.md`.
  - Nếu gặp trap đáng ghi → skill `extract-approach` (Learning Law).
  - Ai làm: **inline**.

---

## 6. Test plan

### Unit — FE (Vitest)
- [ ] `paymentRequestUtils.test.ts::buildCreateActiveRequestPayload sets crm_address_confirmed when opts.crmAddressConfirmed` — opts `{crmAddressConfirmed:true}` → payload có `crm_address_confirmed:true`; không opts → không field.
- [ ] `paymentRequestUtils.test.ts::fromApiActiveRequest defaults crmAddressConfirmed true when missing` — **regression G2** — raw thiếu field → `crmAddressConfirmed === true`; raw `false` → `false`.
- [ ] (regression G3) `reportButtonState` giữ nguyên hành vi remaining — không test mới, xác nhận signature không đổi.

### Unit — BE (pytest)
- [ ] persist true/false qua `_save_active_request`.
- [ ] serialize qua `_serialize_ar_with_hold` trả `crm_address_confirmed` đúng (regression G2).
- [ ] **regression G4**: append không cờ → AR giữ `true`.
- [ ] serialize row không có cột → default `True`.

### Manual/E2E (đụng UI)
- [ ] PR **VN** → mở modal báo đơn → có checkbox; nút submit **disabled** tới khi tick.
- [ ] PR **OV** (chọn quốc gia, province=tên nước) → **không** checkbox, báo đơn thẳng (regression G1).
- [ ] **Append** vào AR đã `crmAddressConfirmed=true` → **không** hỏi lại checkbox.
- [ ] Sau báo đơn → kế toán mở drawer kích hoạt → thấy `✓ Sale đã xác nhận…`.
- [ ] Sửa AR (patch/order-id) rồi refetch → cờ KHÔNG mất (regression G2 — mutation endpoint).

### Build/verify
- [ ] `cd frontend && npx tsc -b` xanh (xem memory `feedback_tsc_build_mode`).
- [ ] `cd frontend && npm run test` xanh; `cd backend && pytest -q` xanh.

---

## 7. Rollback

- **FE:** revert commit (feature FE-only ngoài migration) — nút trở lại không checkbox.
- **BE:** revert; cột thừa vô hại (default false, không ai đọc). Không cần drop.
- **Migration:** cột `crm_address_confirmed` để lại an toàn (nullable-safe NOT NULL DEFAULT false). Nếu bắt buộc gỡ: `ALTER TABLE active_requests DROP COLUMN crm_address_confirmed;` (chạy sandbox trước).
- **Sandbox:** dùng-xong-reset theo `feedback_git_sandbox_disposable_workflow`.

## 8. Definition of Done

- [ ] G1–G7 còn giữ (đối chiếu §3).
- [ ] Test §6 xanh, gồm regression G2 (14-site) + G4 (append) + G1 (OV).
- [ ] `grep -c "_serialize_ar_with_hold(" backend/activation_routes.py` == 14.
- [ ] `tsc -b` pass.
- [ ] Verify hành vi thật: VN có checkbox chặn, OV không, append confirmed không hỏi, Ops thấy ✓, sửa AR không mất cờ.
- [ ] Deploy đúng thứ tự §ĐỌC-TRƯỚC (migration → BE → FE); Task 8 hoãn.

## STOP conditions (dừng & hỏi user)

- Code thực tế lệch §4 (VD `_serialize_ar_with_hold` không còn 14 site, `isForeign` L666 đã đổi).
- `grep -c "_serialize_ar_with_hold("` ≠ 14 sau khi sửa → cờ có thể rò ở endpoint bị bỏ sót.
- Test đỏ không rõ nguyên nhân.
- Buộc phải đụng G5 (cổng Xuất HĐ B4) hoặc G7 (sync_ledger) để làm xong.
- Phát sinh yêu cầu BE hard-reject ngay (Task 8) trước khi FE lên prod.

---

## Không làm (out of scope)
- KHÔNG khôi phục ô nhập địa chỉ ở báo đơn (đã cố ý gỡ 22/8).
- KHÔNG đụng cổng Xuất HĐ B4 (G5).
- KHÔNG upload ảnh (user chọn checkbox).
- KHÔNG badge ở row/mobile (chỉ drawer — T7).
