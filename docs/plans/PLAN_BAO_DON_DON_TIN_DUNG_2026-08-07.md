# PLAN — Đơn tín dụng báo đơn được lúc quẹt ("Đủ tạm" pre-mPOS)

- **Ngày**: 2026-08-07 · **Branch gốc**: main · **Trạng thái**: 🟡 CHỜ DUYỆT — chưa code
- **Chủ task**: anh Minh (dev) · **Nguồn**: sự cố PR-2026-0945 (7/8) + chat với Thu Hiền/Anh Minh nhóm "GMV Palfish App tối ưu"
- **Một câu**: Cho đơn quẹt thẻ/trả góp bấm **"Báo đơn & Tạo gói học" ngay khi sale tạo PR + up bill**, KHÔNG chờ kế toán ghép mPOS — bằng một khái niệm thu-tạm `activatableReceived` chỉ nới **cổng kích hoạt**, TUYỆT ĐỐI không set line sang `paid` (tránh trigger Zalo bắn "ĐÃ VÀO TK" giả).
- **Memory liên quan**: `[[project_credit-order-bao-don-gap]]`, `[[project_net-thua-thieu-task]]`, `[[project_notification-routing]]`, `[[project_bc02-card-date-mismatch]]`, `[[feedback-3-criteria-for-solutions]]`.

---

## 1. Bối cảnh (đọc mục này là hiểu cả task)

**Vấn đề gốc.** Với đơn tín dụng, khách quẹt thẻ xong sale up bill, nhưng **tiền chỉ thật sự về sau khi kế toán (chị Vân) ghép mPOS** — có thể vài ngày sau. Luật nghiệp vụ đã chốt trong chat 7/8: đơn tín dụng thì sale **tạo PR → up bill → báo đơn được ngay** (báo đơn bắn "Bàn giao" lên DingTalk lúc quẹt), tiền vào xác nhận sau. Nhưng hệ thống hiện **khoá cứng nút báo đơn theo điều kiện "thu đủ 100%"**, mà lần quẹt thẻ chỉ chuyển `status='paid'` **sau khi** kế toán ghép mPOS → sale không bao giờ bấm được lúc quẹt. Đây là deadlock.

**Tại sao khoá.** `received`/`state` của PR chỉ cộng các lần thanh toán `status='paid'` (net sau phí). Lần thẻ nằm `pending` → không được tính → PR ở `short` → cả cổng FE lẫn BE đều chặn.

**"Đủ tạm" KHÔNG phải khái niệm mới.** Plan `docs/plans/PLAN_NET_THUA_THIEU_2026-07-12.md` (DONE 12/7) **đã định nghĩa** trạng thái "Đủ tạm" (dòng 40: "Chờ kế toán ghép · ước tính ≥ dự kiến → mở kích hoạt trước, kế toán chốt sau") và đã ship cờ FE `hasUnverifiedFeeLine`. **NHƯNG** cờ đó chỉ phủ line **đã `paid`** đang chờ `verified_received` (giai đoạn SAU mPOS). Case của task này là line **`pending` TRƯỚC mPOS** — mảnh còn thiếu chưa được nối vào cổng kích hoạt. Vì vậy task này **hoàn thiện đúng thiết kế cũ**, không đẻ khái niệm mới → đây là điểm "triệt để".

**Sự cố đã xảy ra (bài học xương máu 7/8).** Khi xử lý tạm PR-2026-0945, việc `UPDATE payment_lines SET status='paid'` bằng SQL đã **kích hoạt DB trigger `trg_payment_paid_zalo`** → bắn tin "💰 ĐÃ VÀO TK 17.820.000" **giả** vào nhóm sale, sale phát hiện ngay. Đã revert + xoá outbox. ⇒ Ràng buộc **cứng nhất** của task: **không được set line sang `paid`** để mở cổng.

---

## 2. Quy tắc LÕI (single source of truth — dùng chung BE + FE)

> **`activatableReceived(pr)`** = **received THẬT** (Σ net của line `status='paid'`, đúng như hiện tại) **＋** Σ **GROSS** (`amount`) của các line **`method ∈ {card, installment}`** đang **`status='pending'`** và **CÓ bill**.
>
> - **Cổng "được báo đơn"** (`ready` FE + `assert_pr_paid` BE + trần phân bổ `_validate_course_amounts` BE) đổi từ so `received` sang so **`activatableReceived`**.
> - **`received` / `state` / SỔ DOANH THU / mọi chỗ hiển thị tiền GIỮ NGUYÊN** — chỉ cộng line `paid` net. `activatableReceived` là **helper cộng thêm, tách bạch**, KHÔNG viết đè `_sum_paid_amount`/`normalizeRequest`/`displayReceived`.
> - **Line giữ `pending`** trong suốt lúc báo đơn → trigger `trg_payment_paid_zalo` (chỉ fire khi `status` chuyển sang `paid`) **không bao giờ chạy** → không có tin Zalo giả.

**Điều kiện "CÓ bill"** (dùng CHÍNH XÁC predicate hiện có, không tự chế):
- FE: khớp `billGuardUtils.ts:12-14` → `(p.billImage ?? '').trim().length > 0 || (Array.isArray(p.billImages) && p.billImages.length > 0)`. **Không** dùng biến dẫn xuất `bill`.
- BE: khớp `pr_guards.py:110-114` → `bool((line.get('bill_image') or '').strip())` HOẶC `bill_images` là list không rỗng.

**Không có line-level "cancelled".** `LINE_STATUSES = {'pending','paid','rejected'}` (`payment_request_routes.py:39`). Lọc `status='pending'` đã tự loại `paid` + `rejected`; huỷ line = `rejected`. Nên **không cần** thêm điều kiện cancel/reject riêng.

**Parity BE ↔ FE (G-PARITY).** Công thức Python `activatable_received` và JS `activatableReceived` phải **khớp từng nhánh**: phần `paid` = đúng net hiện tại; phần `pending` = GROSS của card/installment có bill. Lệch một ly → FE mở nút mà BE `assert_pr_paid` chặn (hoặc ngược lại). Ghi comment trỏ chéo 2 file.

---

## 3. Hiện trạng code (đã có sẵn gì / chưa có)

**Đã có, tái dùng:**
- FE: `FEE_METHODS` (`paymentRequestUtils.ts:247`), `lineNet` (`:253`), `activeRequestAllocation` (`:443`), `reportButtonState` (`:463` — **không cần đổi**, chỉ đổi giá trị `ready` truyền vào), predicate bill (`billGuardUtils.ts:12`).
- BE: `_pr_amounts` + `_pr_payment_state` + `assert_pr_paid` + `assert_all_paid_lines_have_bill` (đều trong `pr_guards.py`, module lá — an toàn đặt helper mới ở đây), `_line_net`/`_sum_paid_amount` (`payment_request_routes.py:269/277`), `_validate_course_amounts` (`activation_routes.py:637`).
- Trigger/notify: `trg_payment_paid_zalo` chỉ fire trên `pending→paid`; DingTalk `activation_request_created` bắn ở tầng app khi tạo AR (`activation_routes.py:1391/1392`, append `:2226`) — **đây chính là tin "Bàn giao" mong muốn**, không đụng `payment_lines`.

**Chưa có (đúng phần task này):**
- Helper `activatableReceived` (FE) / `activatable_received` (BE) — grep = 0, phải thêm mới.
- Cổng `ready` (FE) + `assert_pr_paid` + `_validate_course_amounts` (BE) vẫn so `received` (paid-only) → deadlock.
- Trần phân bổ ở modal báo đơn (`arReceived`) + `activeRequestAllocation` vẫn dựa `received` paid-only.

---

## 4. Thay đổi cần làm

### 4A. Backend

**T-BE1 — Thêm helper dùng chung trong `backend/pr_guards.py`** (sau thân `assert_all_paid_lines_have_bill`, kết ở dòng 124; cạnh `ALLOWED_PR_STATES` dòng 7).
1. Thêm hằng cục bộ (KHÔNG import từ `payment_request_routes` — tránh vòng import): `_PROVISIONAL_METHODS = frozenset({"card", "installment"})`.
2. Tách predicate bill sẵn có (dòng 110-114) thành `def _line_has_bill(line) -> bool` rồi dùng lại trong `assert_all_paid_lines_have_bill`.
3. Thêm helper (GROSS = `amount`, **không** dùng `verified_received`, vì line pending chưa có net; fail-closed = query lỗi thì trả `received` gốc → chặn, không mở nhầm):
```python
def activatable_received(sb, pr: dict[str, Any]) -> int:
    """received THẬT (net paid) + GROSS của line card/installment status=pending CÓ bill.
    Line giữ pending → không set paid → KHÔNG kích hoạt trg_payment_paid_zalo.
    qr/cash pending, hoặc card/installment thiếu bill → KHÔNG cộng (vẫn chặn)."""
    _, received = _pr_amounts(pr)
    pr_id = str(pr.get("id") or "")
    if not pr_id:
        return received
    try:
        res = (sb.table("payment_lines")
               .select("amount, method, status, bill_image, bill_images")
               .eq("payment_request_id", pr_id).eq("status", "pending").execute())
    except Exception:
        return received  # fail-closed
    provisional = 0
    for line in (res.data or []):
        if (line.get("method") or "").lower() in _PROVISIONAL_METHODS and _line_has_bill(line):
            try:
                provisional += int(line.get("amount") or 0)
            except (TypeError, ValueError):
                pass
    return received + provisional
```

**T-BE2 — `assert_pr_paid` nhận thêm `sb` + so `activatable`** (`pr_guards.py:82-93`).
- Đổi chữ ký: `def assert_pr_paid(sb, pr: dict[str, Any]) -> None:`.
- Tính `activatable = activatable_received(sb, pr)`; đặt `paid_by_amount = target > 0 and activatable >= target`. Giữ nhánh `paid_by_state` (done/over) như cũ.
- Sửa thông báo lỗi `HTTPException(400)` (dòng 91-92) hiển thị `da_thu={activatable}/{target}` (số cổng thực đánh giá).
- **Cập nhật 3 nơi gọi** (nếu sót 1 nơi → TypeError tại cổng): `activation_routes.py:1337` (`assert_pr_paid(sb, pr)`), `activation_routes.py:2196` (`assert_pr_paid(sb, pr)`), `payment_request_routes.py:2205` (`assert_pr_paid(sb, pr_row)`).

**T-BE3 — Trần phân bổ `_validate_course_amounts` dùng `activatable`** (`activation_routes.py:653-654`).
- `budget = max(target, activatable_received(sb, pr))` (biến `sb` đã là tham số hàm). Phần còn lại (tổng course các AR, lỗi 422) giữ nguyên.
- Thêm `activatable_received` vào khối `from pr_guards import (...)` (`activation_routes.py:42-48`).

**T-BE4 — Vá caveat sổ doanh thu (ngày/kiểu thanh toán)** — xem G-LEDGERDATE mục 5. `_resolve_payment_time_from_pr`/`_resolve_payment_date_from_pr`/`_resolve_payment_method_from_pr` (`revenue_routes.py:1000-1059`) đang lọc `status='paid'`; kích hoạt card trước khi ghép → không có line paid → `ngay_tien_ve = hôm nay`, `payment_method = ''`, và sổ **insert-once** nên **không tự sửa lại** khi mPOS về. **Cần chốt hướng** (mục 8, Q4) trước khi code phần này.

**KHÔNG đụng:** `recompute_payment_request_totals` (`payment_request_routes.py:1401`), `_sum_paid_amount`/`_line_net` (`:269/:277`). Đổi những chỗ này sẽ làm `received`/`state`/sổ đổi theo và có nguy cơ fire trigger Zalo.

### 4B. Frontend — helper lõi `paymentRequestUtils.ts`

**T-FE1 — Thêm `activatableReceived`** (chèn sau `lineNet`, kết ở dòng 258; dùng `FEE_METHODS`/`lineNet` cùng file):
```ts
export function activatableReceived(pr: PaymentRequest): number {
  return pr.payments.reduce((sum, p) => {
    if (p.cancelled) return sum;
    if (p.status === "paid") return sum + lineNet(p);
    if (
      p.status === "pending" &&
      FEE_METHODS.has(p.method) &&
      ((p.billImage ?? "").trim().length > 0 || (Array.isArray(p.billImages) && p.billImages.length > 0))
    ) {
      return sum + p.amount; // GROSS — khớp BE
    }
    return sum;
  }, 0);
}
```
Nhánh `paid` phải khớp **hệt** `normalizeRequest.received` (dòng 263). Ghi comment: "phải khớp byte-for-byte BE `pr_guards.activatable_received`".

**T-FE2 — `activeRequestAllocation` đổi base sang activatable** (`paymentRequestUtils.ts:448`): `const received = pr ? Math.max(0, activatableReceived(pr)) : 0;`. Không đổi → view Sửa-AR báo nhầm "Tổng gói học vượt tiền đã nhận" cho AR thẻ pending, và "Báo đơn bổ sung" tính thiếu phần còn lại. ⚠️ Làm vỡ unit test `paymentRequestUtils.test.ts:224-230` (fixture `received:2000, payments:[]`) → phải sửa fixture (thêm line paid amount 2000) hoặc sửa kỳ vọng.

**KHÔNG đụng** `normalizeRequest` `received`/`state` (`:263`, `:267-273`), `displayReceived` (`:876`), `hasUnverifiedFeeLine` (`:884`).

### 4C. Frontend — nối dây `PaymentRequestDetailDrawer.tsx`

**T-FE3 — import** `activatableReceived` (khối import `paymentRequestUtils`, dòng 21-45; thêm cạnh `activationSummary` dòng 22).

**T-FE4 — cổng nút báo đơn** (`:1767`): đổi
`const ready = request.state === "done" || request.state === "over";`
→ `const activatable = activatableReceived(request);`
   `const ready = activatable > 0 && activatable >= request.target;`
(giữ đúng ngữ nghĩa `done||over` cũ = `received>0 && received>=target`, chỉ thay bằng activatable). Chảy tự nhiên vào `reportBtn` (`:1773`).

**T-FE5 — trần phân bổ modal** (`:2722`): `const arReceived = Math.max(0, activatableReceived(request));` (đang là `request.received`) — feeds `arRemaining` (`:2726`) + `arValid` (`:2731`).

**T-FE6 — số điền sẵn dòng AR đầu** (`:2698`, nhánh non-append): `amount: Math.max(0, activatableReceived(request))` (đang `request.received`). Nhánh append (`:2697`) dùng `arUnallocated` → tự đúng nhờ T-FE2.

**KHÔNG đụng** `isPrFull` (`:1707`) và mọi hiển thị tiền (`:407` mặc định thêm-lần-TT, `:1765` còn thiếu, `:2546`/`:3271` "Đã nhận", `progressPercent`) — giữ theo `received`/`state` thật.

---

## 5. Guardrails (bắt buộc — tiêu chí "không lỗi con")

- **G-ZALO (cao nhất)**: Fix **KHÔNG bao giờ** set line card/installment sang `status='paid'`. Line giữ `pending`. Nếu bất kỳ nhánh nào (SQL/RPC/recompute/mPOS matcher gọi nhầm) flip `paid` → bắn "ĐÃ VÀO TK" thật. Regression **phải** assert `zalo_outbox` 0 dòng `payment_paid` sau khi báo đơn (không nhìn mắt thường). Không dựa vào carve-out `pay_time<created_at` trong `fn_payment_paid_zalo_notify` — đó là chốt phụ mong manh.
- **G-BILL**: Bill của line pending card/installment **chỉ** được đảm bảo bên trong `activatableReceived` (vì `assert_all_paid_lines_have_bill` chỉ soi line `paid`). Thiếu bill → không cộng → cổng vẫn chặn. Không "tối ưu" bỏ điều kiện bill khỏi helper. TOP2.4 soft-lock (`docs/HANDOFF_TOP2-4_BILL_SOFTLOCK.md`) vẫn giữ nguyên cho bước kế toán confirm.
- **G-METHOD**: Chỉ `card`/`installment` pending mới đủ tạm. `qr`/`cash` pending **không bao giờ** (tiền CK/mặt phải về thật mới tính).
- **G-PARITY**: JS `activatableReceived` ≡ Python `activatable_received` từng nhánh. Có test 2 phía cho cùng ma trận case.
- **G-NODOUBLE**: Phân vùng theo `status` — `pending` cộng GROSS, `paid` cộng NET, hai tập rời nhau. Khi mPOS ghép, line chuyển `paid` → thôi cộng gross, bắt đầu cộng net → không đếm 2 lần. Có test consistency trước/sau ghép.
- **G-REALFIELDS**: `received`/`state`/`displayReceived`/sổ doanh thu/dòng "Lũy kế" Zalo **không đổi** giá trị. Chỉ cổng đọc activatable.
- **G-ALLOC**: `activeRequestAllocation` (FE) + `_validate_course_amounts` (BE) cùng đổi base sang activatable — nếu chỉ đổi cổng mà quên 2 chỗ này thì nhánh append/edit-AR mâu thuẫn cổng (course 422 nhầm, "Báo đơn bổ sung" sai).
- **G-FAILCLOSED**: Query `payment_lines` trong `activatable_received` lỗi → trả `received` gốc (chặn). Đọc line này phải nằm **trong** try/except fail-closed của `_validate_course_amounts` (`activation_routes.py:667-679`) để test `test_be_bug_hunt_1306.py::TestValidateCourseAmountsFailClosed` (dòng 349, kỳ vọng 500 "loi doc AR") vẫn xanh.
- **G-LEDGERDATE (caveat mới, phải xử)**: Kích hoạt card **trước** mPOS → sổ doanh thu lấy `ngay_tien_ve` = ngày kích hoạt, `payment_method=''` (resolver lọc `status='paid'`), và insert-once nên không tự sửa. Trùng vấn đề `[[project_bc02-card-date-mismatch]]`. **Xử theo Q4 mục 8.**
- **G1 kế thừa (net về không khoá lại kích hoạt)**: khi kế toán ghép, net thật < gross → `received` tụt về `short`, nhưng AR/kích hoạt đã cấp **không bị revoke** (đã đúng từ NET_THUA_THIEU). Xác nhận G1 phủ luôn case pre-mPOS này.

---

## 6. Tests (bắt buộc trước push)

**BE — `backend/tests/`, chạy `pytest`:**
- **File mới `test_provisional_activation_gate.py`** (đi qua endpoint `create_active_request` `activation_routes.py:2153` `require_paid_pr=True` + append `:2196`):
  (1) card `pending` + bill đủ tiền → AR tạo 200, **assert không có UPDATE nào set line `status='paid'`** (regression G-ZALO). (2) installment pending + bill → 200 (parity). (3) card pending **KHÔNG** bill → vẫn chặn 400. (4) qr pending → chặn. (5) cash pending → chặn. (6) card `rejected` + bill → loại → chặn. (7) hỗn hợp qr paid + card pending có bill → `activatable` = qr net + card gross. (8) trần: tổng course ≤ gross budget → OK, quá 1đ → 422.
- **Unit `activatable_received`** trực tiếp: các case (a)-(f) ma trận trên; pr `id` rỗng → trả received gốc không query.
- **`assert_pr_paid` chữ ký mới**: PR card-only deadlock (pending + bill, amount=target) → pass; cùng PR thiếu bill → 400 `da_thu=0/target`; PR `state='done'` vẫn pass qua `paid_by_state`.
- **Fail-closed**: line-read lỗi trong `activatable_received` → `HTTPException(500)` (mở rộng `test_be_bug_hunt_1306.py:349`).
- **Regression giữ xanh**: `test_completion_report.py::test_pr_not_fully_paid` (`:212`, PR qr short 500/1000 → vẫn 400 vì qr không đủ tạm) — **nhớ cập nhật FakeSB** để `payment_lines` trả line qr khi `assert_pr_paid` đổi chữ ký. `test_ar_uid_guard.py` (stub `_noop(*args)` chịu được chữ ký mới, nhưng nếu helper query bằng `.in_/.neq/.order` thì mở rộng `_fake_sb.lines_table`). `test_activation_append.py` `_fake_sb` tương tự.
- Nếu Q1 (mục 8) chốt report-complete **giữ 100%**: `assert_pr_paid` thêm cờ `allow_provisional` (default True) và `payment_request_routes.py:2205` truyền `allow_provisional=False`.

**FE — `frontend`, chạy `npm run test`:**
- **File mới `paymentRequestUtils.activatable.test.ts`**: paid-qr → == received; card pending+billImage → +gross; card pending không bill → loại; qr/cash pending → loại; installment pending + `billImages[]` → cộng; card paid có `verifiedReceived` → dùng net (không gross); cancelled/rejected → loại.
- **Sửa `paymentRequestUtils.test.ts:224-230`** (case over-allocated): thêm line paid amount 2000 vào fixture, hoặc chỉnh kỳ vọng received/remaining/overAmount/isOver theo `payments:[]`.
- **Giữ xanh** `paymentRequestUtils.reportButton.test.ts` (5 case, `ready` là boolean thuần — hợp đồng không đổi).
- **Derivation (khuyến nghị)**: render `PaymentRequestDetailDrawer` (theo mẫu `PaymentRequestDetailDrawer.billguard.test.tsx`) — PR 1 line card pending + bill → nút "Báo đơn & Tạo gói học" **bật**; bỏ bill → **khoá** kèm tooltip 100%.

**Cổng trước push**: `cd frontend && npx tsc -b && npm run test` · `cd backend && pytest`.

---

## 7. Ngoài phạm vi (KHÔNG làm — "không tăng gánh nặng hạ tầng")

- ❌ Migration DB / cột mới / trigger mới (dùng cột + trigger sẵn có).
- ❌ Viết đè `_sum_paid_amount`/`_line_net`/`normalizeRequest`/`displayReceived` (giữ received/state/sổ).
- ❌ Đổi luồng kế toán ghép mPOS (`gateway_routes.match_gateway_txn`) — nhánh `already_paid` đã đúng.
- ❌ Đổi routing/định danh thông báo (DingTalk raw team_code, is_test skip, source_suffix append) — chỉ để AR-created bắn **sớm hơn**.
- ❌ Đại tu resolver ngày sổ toàn cục — phần G-LEDGERDATE làm **tối thiểu, đúng scope** (Q4).

---

## 8. Cần chốt trước/khi code (câu hỏi mở)

- **Q1 — Report-complete có nới theo activatable không?** `payment_request_routes.py:2205` ("Báo đơn hoàn thành") cũng gọi `assert_pr_paid`; đổi chữ ký làm nó tự nới theo. Nếu muốn nút "hoàn thành" **vẫn đòi 100% tiền thật** thì thêm cờ `allow_provisional=False` cho riêng chỗ này. *(Khuyến nghị: cho nới luôn cho nhất quán, vì đơn tín dụng cả vòng đời đều pre-mPOS.)*
- **Q2 — Badge "Đủ tạm (chưa ghép mPOS)"?** Có hiện nhãn riêng cho case pre-mPOS (khác badge `hasUnverifiedFeeLine` post-mPOS) không, hay để state "Chờ thanh toán" cạnh nút đã bật? *(Khuyến nghị: thêm badge nhỏ để sale/kế toán không hiểu nhầm là đã có tiền.)*
- **Q3 — Đổi copy "tiền đã nhận"/"thực nhận"** ở modal (`Drawer:3009-3010`) và cảnh báo allocation khi số giờ gồm gross pending → đổi thành "tiền có thể kích hoạt" hay giữ nguyên?
- **Q4 — Caveat ngày/kiểu thanh toán sổ (G-LEDGERDATE):** vá trong plan này hay gộp `docs/plans/PLAN_XUATHD_BC02_BC03_2026-08-07.md` (cùng đụng resolver `revenue_routes.py:1000-1059` + cùng bài toán "ngày đơn thẻ")? *(Khuyến nghị: sửa resolver lấy ngày/kiểu từ chính line card/installment — `paid_at` nếu có, else `created_at` — bất kể status, và ĐIỀU PHỐI chung với BC02/BC03 để không làm 2 lần.)*

---

## 9. Self-check 5 tiêu chí

1. **Triệt để** — sửa tại **đúng 3 cổng** (FE `ready` + BE `assert_pr_paid` + `_validate_course_amounts`) qua **1 quy tắc lõi `activatableReceived`**; hoàn thiện "Đủ tạm" mà NET_THUA_THIEU đã định nghĩa nhưng chưa nối. ✅
2. **Không lỗi con** — G-ZALO (không set paid, có regression outbox), G-BILL, G-METHOD, G-PARITY, G-NODOUBLE, G-FAILCLOSED, **G-LEDGERDATE** (bắt đúng fail-mode "kích hoạt trước ghép làm sai ngày sổ" — điểm workflow phát hiện thêm). ✅ *(với điều kiện Q4 được xử)*
3. **Không tăng hạ tầng** — 0 cột/0 trigger/0 migration/0 service; tái dùng helper, predicate bill, trigger, notifier sẵn có. ✅
4. **Tối ưu token/việc** — 3 file BE + 2 file FE, gom trong 1 helper mỗi phía; test chỉ cho logic mới + sửa đúng fixture vỡ; không refactor lan man. ✅
5. **Bền vững qua compact** — plan nhúng nguyên văn code helper + path:line từng thay đổi + tên test + expected → 1 agent Sonnet thực thi độc lập kể cả sau khi mất hội thoại. ✅

---

## 10. Resume note (đổi máy / hỏi lại thì đọc mục này)

- **Task**: cho đơn quẹt thẻ/trả góp báo đơn được ngay khi có bill, KHÔNG chờ mPOS, KHÔNG set line `paid` (tránh Zalo giả). Chi tiết mục 1.
- **Quy tắc lõi**: `activatableReceived` = net(paid) + gross(pending card/installment CÓ bill) — mục 2. FE ≡ BE.
- **File phải đụng**: BE `pr_guards.py` (helper mới + `assert_pr_paid` +sb), `activation_routes.py` (`_validate_course_amounts:653`, 2 call-site + import), `payment_request_routes.py:2205` (call-site), `revenue_routes.py:1000-1059` (Q4). FE `paymentRequestUtils.ts` (`activatableReceived` mới + `activeRequestAllocation:448`), `PaymentRequestDetailDrawer.tsx` (`:1767`, `:2722`, `:2698`, import). Test: mục 6.
- **Chốt kỹ thuật**: cổng đọc activatable; `received`/`state`/sổ tuyệt đối không đổi; line giữ `pending`; 3 call-site `assert_pr_paid` phải cùng đổi chữ ký (kèm test fake-sb).
- **Chờ chốt**: Q1-Q4 mục 8 (đặc biệt Q4 ngày sổ) trước khi làm T-BE4.
- **Chưa code.** Thứ tự đề xuất: T-BE1→T-BE2→T-BE3 + test BE → T-FE1→T-FE2→T-FE3-6 + test FE → tsc -b → (Q4) T-BE4.
- **Learning Law**: xong chạy skill `extract-approach` (chưa có learnings note cho "đủ tạm pre-mPOS"; gần nhất `docs/learnings/button-gate-existence-vs-resource.md` + `dual-channel-race-match-only-pending.md`).
