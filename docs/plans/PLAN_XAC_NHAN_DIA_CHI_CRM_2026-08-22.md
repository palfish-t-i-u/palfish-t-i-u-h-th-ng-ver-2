# PLAN — Xác nhận "đã điền địa chỉ trên CRM" khi báo đơn (số VN)

**Ngày:** 2026-08-22
**Người viết:** Minh (anhminhcv0512@gmail.com)
**Trạng thái:** 📋 CHỜ CODE (block-removal đã DONE + prod `cb416fb`)

---

## 0. Bối cảnh (đọc trước khi code)

Trước 22/8, nút **"Báo đơn & Tạo gói học"** chặn sale khi thiếu Tỉnh/TP + Phường/Xã của khách (số VN). Lý do lịch sử: Thu Hiền (kế toán) cần địa chỉ để tạo gói học trên CRM.

**Sự thật xác minh 22/8** (sale Phương Thúy + kế toán Sương Mai xác nhận trong group):
- Địa chỉ nhập ở **GMV KHÔNG được dùng để tạo gói trên CRM**.
- Sale phải **tự điền địa chỉ trực tiếp trên CRM** (CRM bắt buộc địa chỉ cho số đầu 84).
- ⇒ Ô địa chỉ ở GMV = **nhập trùng vô nghĩa** (double entry).

**Đã làm (DONE + prod `cb416fb`):** gỡ chặn địa chỉ khi báo đơn — nút không còn đòi Tỉnh/Phường; popup "Chưa thể báo đơn" chỉ còn liệt kê "Thiếu ảnh bill". Xem [[invoice-address-required-rule]] mục "Kích hoạt gói học".

**Feature này (kế hoạch):** thay ô nhập địa chỉ bằng **1 ô tích tự xác nhận** — sale phải tick "Tôi đã điền địa chỉ trên CRM" mới báo đơn được. Đây là **forcing function** (nhắc sale đừng quên điền CRM), rẻ hơn nhập 3 ô, không double entry.

**Quyết định sản phẩm (user chốt qua AskUserQuestion 22/8):**
- Cơ chế = **ô tích (checkbox)**, KHÔNG upload ảnh.
- Cổng = **bắt buộc mới báo đơn được** — không tick thì nút submit disabled.

**Phạm vi:** chỉ khách **số VN**. Khách nước ngoài (OV) → CRM không bắt địa chỉ VN → **không hiện checkbox**, không chặn.

---

## 1. Goal

Sale báo đơn khách VN **phải chủ động xác nhận đã điền địa chỉ trên CRM** (1 click) trước khi tạo gói học. Bản ghi lưu lại trên AR để kế toán (Thu Hiền) yên tâm tạo gói. Không tái lập double-entry địa chỉ.

**Định nghĩa xong việc:**
1. Modal báo đơn (khách VN) hiện checkbox "Tôi đã điền địa chỉ trên CRM"; nút submit disabled tới khi tick.
2. Khách OV: không có checkbox, báo đơn như hiện tại.
3. Cờ `crm_address_confirmed` lưu trên `active_requests`, trả về ở list/serialize.
4. Kế toán mở drawer kích hoạt thấy trạng thái xác nhận (positive/warning).
5. `tsc -b` pass, unit test BE pass, không lỗi con ở luồng OV/append/kế toán tạo tay.

**3 tiêu chí (xem [[feedback_3_criteria_for_solutions]]):**
- **Triệt để:** gate ở FE + lưu bản ghi + hiện cho Ops; không chỉ "nhắc suông".
- **Không lỗi con:** OV không bị chặn; append không đòi lại; kế toán tạo AR tay không vướng; deploy-order an toàn (BE không hard-reject).
- **Không tăng gánh nặng hạ tầng:** 1 cột boolean, mirror y hệt `hold_activation` đang có; 0 bảng mới, 0 query nặng.

---

## 2. Kiến trúc & nguyên tắc

**Mirror `hold_activation` end-to-end.** Cột `hold_activation`/`hold_note` trên `active_requests` đã có sẵn đường đi FE→BE→DB→serialize→Ops badge. Feature này đi **đúng cùng đường**, thêm 1 boolean `crm_address_confirmed`. Bám pattern có sẵn = ít bug, dễ review.

**FE là cổng cứng, BE là bản ghi (không hard-reject).**
- FE disable nút submit tới khi tick → thỏa "bắt buộc mới báo đơn được".
- BE **chỉ lưu** cờ, **KHÔNG** trả 400 khi thiếu. Lý do: FE (Vercel) và BE (Render) deploy tách rời; nếu BE hard-reject deploy trước FE gửi cờ → **mọi báo đơn VN gãy** = incident. Đây là app nội bộ, sale chỉ thao tác qua FE, nên cổng FE là đủ; BE hard-reject không thêm giá trị mà thêm rủi ro. (Nếu sau này muốn siết BE: thêm 1 dòng validate ở 2 endpoint sale, đã note ở Task 8.)

**Grandfather đơn cũ.** Migration set toàn bộ AR hiện có `crm_address_confirmed = true` (đơn cũ đã qua cổng địa chỉ cũ hoặc đã xử lý) → Ops không bị cảnh báo giả trên hàng trăm đơn cũ.

**VN-only.** Dùng `isForeignCustomer(country, province)` (paymentRequestUtils.ts:21) — foreign ⇒ bỏ qua checkbox và bỏ qua cảnh báo Ops. Khớp cách các cổng địa chỉ khác loại trừ OV.

**Append không đòi lại.** Địa chỉ CRM gắn theo khách/AR, không theo từng bé. Báo đơn bổ sung vào AR đã confirmed ⇒ không hiện checkbox nữa (`activeRequest.crmAddressConfirmed === true` ⇒ skip). Chỉ hiện nếu AR đó chưa confirmed (đơn cũ legacy được append).

---

## 3. File Structure (điểm chạm — path:line)

**Backend**
| File | Điểm | Việc |
|------|------|------|
| `backend/migrations/2026-08-22-ar-crm-address-confirmed.sql` | (mới) | ADD COLUMN + backfill grandfather |
| `backend/activation_routes.py` | `_save_active_request` sig ~L1613-1622, insert dict ~L1647-1662 (hold ở L1654) | thêm param + persist |
| `backend/activation_routes.py` | `_serialize_ar` def L521, output dict hold L562-563 | thêm key `crm_address_confirmed` |
| `backend/activation_routes.py` | create-via-PR ~L2432-2442, append ~L2524-2531 | đọc `crm_address_confirmed` từ payload |
| `backend/tests/test_*` | (mới hoặc mở rộng) | test serialize + persist |

**Frontend — types**
| File | Điểm | Việc |
|------|------|------|
| `frontend/src/types/paymentRequest.ts` | `ActiveRequest` L207-217 (sau `holdNote` L217) | thêm `crmAddressConfirmed?: boolean` |
| `frontend/src/types/paymentRequest.ts` | `CreateActiveRequestPayload` L352-356 | thêm `crm_address_confirmed?: boolean` |
| `frontend/src/types/paymentRequest.ts` | `ActiveRequestApiRow` ~L397-398 | thêm `crm_address_confirmed?: boolean` |

**Frontend — utils / context**
| File | Điểm | Việc |
|------|------|------|
| `frontend/src/components/payment-request/paymentRequestUtils.ts` | `fromApiActiveRequest` ~L370-416 (map `hold_activation`) | map `crm_address_confirmed → crmAddressConfirmed` (default `?? true`) |
| `frontend/src/components/payment-request/paymentRequestUtils.ts` | `buildCreateActiveRequestPayload` L429-474, opts branch L469-472 | thêm `opts.crmAddressConfirmed → payload.crm_address_confirmed` |
| `frontend/src/contexts/PaymentFlowContext.tsx` | `handleCreateActiveRequest` ~L419-441, `handleAppendActiveRequest` ~L443-465 | opts đã đi xuyên qua — thêm field vào type opts nếu cần |

**Frontend — modal báo đơn**
| File | Điểm | Việc |
|------|------|------|
| `frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx` | state L1686-1690 (`holdActivation`/`holdNote`) | thêm `crmAddressConfirmed` state |
| `.../PaymentRequestDetailDrawer.tsx` | reset khi mở modal ~L2757-2764 | reset `crmAddressConfirmed=false` |
| `.../PaymentRequestDetailDrawer.tsx` | vùng hold radio/textarea L2838-2858 (trong IIFE modal L2782-3131) | render checkbox (VN-only) sau vùng hold |
| `.../PaymentRequestDetailDrawer.tsx` | opts submit L3107 (`holdOpts`) | thêm `crmAddressConfirmed` vào opts |
| `.../PaymentRequestDetailDrawer.tsx` | nút submit ~L3103-3126 | `disabled` khi VN && !crmAddressConfirmed |
| `.../PaymentRequestDetailDrawer.tsx` | prop types `onCreateActiveRequest`/`onAppendActiveRequest` L1645-1647 | mở rộng type opts thêm `crmAddressConfirmed?` |

**Frontend — Ops view (kế toán)**
| File | Điểm | Việc |
|------|------|------|
| `frontend/src/components/activation/ActivationDetailDrawer.tsx` (hoặc panel hold trong `ActivationTab.tsx` L1148-1163) | panel hold hiện tại | thêm dòng trạng thái xác nhận địa chỉ CRM |

---

## 4. Tasks (TDD — làm tuần tự, tick khi xong)

### Task 1 — BE: migration cột `crm_address_confirmed` ⬜
File mới `backend/migrations/2026-08-22-ar-crm-address-confirmed.sql`:
```sql
-- Cờ sale tự xác nhận đã điền địa chỉ khách trên CRM (số VN) khi báo đơn.
-- Mirror hold_activation: NOT NULL DEFAULT false. Đơn cũ grandfather = true.
ALTER TABLE active_requests
  ADD COLUMN IF NOT EXISTS crm_address_confirmed boolean NOT NULL DEFAULT false;

-- Grandfather: mọi AR đã tồn tại coi như đã ổn (đã qua cổng địa chỉ cũ / đã xử lý)
UPDATE active_requests SET crm_address_confirmed = true WHERE crm_address_confirmed = false;
```
- ⚠ Chạy trên **sandbox trước** (`pxgybyfiwywksesyogti`), verify, rồi prod (`jozcvbbypwvzaefteoxn`). Xem [[supabase-projects-key-rotation]].
- **Không** dùng migration tool tự động — chạy tay qua Supabase SQL (theo convention repo).

### Task 2 — BE: persist trong `_save_active_request` ⬜
- Thêm param `crm_address_confirmed: bool = False` vào signature (~L1613-1622), mirror cách nhận `hold_activation`.
- Thêm `"crm_address_confirmed": crm_address_confirmed` vào insert dict (~L1662, cạnh `hold_activation` L1654).
- Truyền giá trị từ create-via-PR (~L2432-2442) và append (~L2524-2531): đọc `body.get("crm_address_confirmed", False)` mirror y `hold_activation`.
  - Append: patch cờ **chỉ khi payload gửi lên** (mirror cách append patch hold L2524-2531) — tránh ghi đè `true` thành `false` khi append không kèm cờ.

### Task 3 — BE: serialize ra list ⬜
- `_serialize_ar` (def L521): thêm `"crm_address_confirmed": bool(row.get("crm_address_confirmed", True))` vào output dict cạnh `hold_activation`/`hold_note` (L562-563).
- Default `True` khi thiếu (an toàn: đơn không có cột = không cảnh báo giả).

### Task 4 — BE: test ⬜
- Mở rộng test serialize/persist (nếu có `backend/tests/test_activation_*`) hoặc thêm case: (a) persist cờ true/false; (b) serialize trả đúng; (c) append không cờ → không hạ true→false.
- `cd backend && python -m pytest tests/ -q` (hoặc theo convention repo) pass.

### Task 5 — FE: types + mapper + payload ⬜
- `paymentRequest.ts`: thêm `crmAddressConfirmed?: boolean` vào `ActiveRequest` (sau L217); `crm_address_confirmed?: boolean` vào `CreateActiveRequestPayload` (L356) và `ActiveRequestApiRow` (sau L398).
- `paymentRequestUtils.ts` `fromApiActiveRequest`: `crmAddressConfirmed: raw.crm_address_confirmed ?? true` (thiếu = true, không cảnh báo giả).
- `paymentRequestUtils.ts` `buildCreateActiveRequestPayload` (opts branch L469-472): nếu `opts?.crmAddressConfirmed` → set `payload.crm_address_confirmed = true`.
- Mở rộng type opts của `onCreateActiveRequest`/`onAppendActiveRequest` (PaymentRequestDetailDrawer L1645-1647) + `PaymentFlowContext` handlers (L419-465) thêm `crmAddressConfirmed?: boolean`.

### Task 6 — FE: checkbox trong modal báo đơn (cổng cứng) ⬜
Trong IIFE modal (PaymentRequestDetailDrawer L2782-3131):
- State: `const [crmAddressConfirmed, setCrmAddressConfirmed] = useState(false);` (cạnh L1689-1690).
- Reset `setCrmAddressConfirmed(false)` khi mở modal (~L2757-2764).
- Tính `const isVN = !isForeignCustomer(request.country, request.province);` (import `isForeignCustomer` nếu chưa có trong file).
- Với append: `const needConfirm = isVN && !(activeRequest?.crmAddressConfirmed === true);`
  - create (không phải append): `needConfirm = isVN`.
- Render (sau vùng hold ~L2858), **chỉ khi `needConfirm`**:
  ```tsx
  <label className="flex items-start gap-2 mt-3 text-sm">
    <input type="checkbox" checked={crmAddressConfirmed}
      onChange={(e) => setCrmAddressConfirmed(e.target.checked)} className="mt-0.5" />
    <span>Tôi đã điền địa chỉ khách (Tỉnh/TP · Phường/Xã · Số nhà) trên <b>CRM</b> để tạo gói học.
      <span className="block text-slate-500">CRM bắt buộc địa chỉ cho số Việt Nam. GMV không còn giữ ô này.</span>
    </span>
  </label>
  ```
- Submit opts (L3107): `const holdOpts = { holdActivation, holdNote: holdNote.trim() || undefined, crmAddressConfirmed: needConfirm ? crmAddressConfirmed : true };`
  - OV/append-đã-confirmed: gửi `true` (không chặn, giữ trạng thái).
- Nút submit (~L3103-3126): thêm `disabled={arSubmitting || (needConfirm && !crmAddressConfirmed)}` (giữ nguyên các điều kiện disable hiện có).

### Task 7 — FE: hiển thị cho Ops (kế toán) ⬜
- Trong drawer kích hoạt (`ActivationDetailDrawer.tsx`, cạnh panel hold L1148-1163):
  - Nếu `ar.crmAddressConfirmed === true`: dòng nhẹ `<span class="text-emerald-600">✓ Sale đã xác nhận điền địa chỉ trên CRM</span>`.
  - Nếu VN && `!crmAddressConfirmed`: `<span class="badge badge-warning">⚠ Sale chưa xác nhận địa chỉ CRM</span>` (hiếm — chỉ đơn legacy append hoặc tạo tay).
- **YAGNI:** KHÔNG thêm badge ở row list / mobile card (gate cứng ⇒ đơn mới luôn confirmed ⇒ badge = noise). Chỉ drawer — nơi kế toán thực sự tạo gói.

### Task 8 — (TÙY CHỌN, để sau) BE hard-gate ⬜
- Nếu muốn siết server-side: ở create-via-PR + append, khi PR là VN (`not _is_foreign(...)`) và `crm_address_confirmed != True` → `HTTPException(400, "Cần xác nhận đã điền địa chỉ trên CRM trước khi báo đơn (số VN).")`.
- **CHỈ deploy sau khi FE đã lên prod** (tránh incident deploy-order). Mặc định KHÔNG làm — FE gate là đủ.

### Task 9 — Verify + docs ⬜
- `cd frontend && npx tsc -b` pass (xem [[feedback_tsc_build_mode]]).
- `cd frontend && npm run test` pass.
- Smoke tay: (1) PR VN → modal có checkbox, nút disabled tới khi tick; (2) PR OV → không checkbox, báo đơn thẳng; (3) append vào AR đã confirmed → không hỏi lại; (4) kế toán mở drawer thấy ✓.
- Cập nhật [[invoice-address-required-rule]] mục "Kích hoạt gói học": đổi TODO → DONE, mô tả cơ chế checkbox.
- Chạy skill `extract-approach` nếu gặp trap đáng ghi (Learning Law trong CLAUDE.md).

---

## 5. Self-Review checklist (trước khi commit)

- [ ] OV (khách nước ngoài) KHÔNG thấy checkbox, báo đơn không bị chặn.
- [ ] Append vào AR đã `crmAddressConfirmed=true` → không đòi tick lại.
- [ ] Append không kèm cờ KHÔNG hạ `true → false` ở BE.
- [ ] `fromApiActiveRequest` default `?? true` — response cũ/thiếu cột không cảnh báo giả.
- [ ] BE **không** trả 400 (Task 8 để sau) — deploy FE↔BE độc lập không gãy.
- [ ] Migration grandfather đơn cũ → Ops không ngập cảnh báo.
- [ ] Kế toán tạo AR tay (không qua modal sale) không bị vướng.
- [ ] `tsc -b` + unit test pass.

---

## 6. Deploy order (quan trọng — tránh incident)

1. **Migration** sandbox → verify → prod (Task 1).
2. **BE** (persist + serialize, KHÔNG hard-reject) → Render. An toàn vì chỉ thêm cột optional.
3. **FE** (checkbox + gate) → Vercel main auto-deploy.
- Thứ tự BE-trước-FE an toàn vì BE chỉ lưu, không bắt buộc. FE-trước-BE cũng an toàn (BE bỏ qua cờ lạ). ⇒ không bị kẹt thứ tự.
- Chỉ Task 8 (hard-gate) mới nhạy cảm thứ tự → để sau, FE prod xong mới bật.

---

## 7. Không làm (out of scope)

- KHÔNG khôi phục ô nhập địa chỉ ở báo đơn (đã cố ý gỡ 22/8).
- KHÔNG đụng cổng địa chỉ **Xuất hóa đơn (B4)** — vẫn enforce đủ Tỉnh+Phường+Số nhà (FE `getInvoiceBlockers` + BE `_invoice_address_complete`), KHÔNG thay đổi.
- KHÔNG upload ảnh chứng minh (user chọn checkbox).
- KHÔNG badge ở row/mobile (chỉ drawer).
