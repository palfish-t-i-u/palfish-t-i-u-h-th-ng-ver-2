# PLAN: Hủy lần thanh toán phải tự nhả giao dịch ngân hàng/gateway — 2026-09-28

> **ĐỌC TRƯỚC KHI LÀM** (agent thực thi, kể cả sau compaction / agent mới):
> - Mở lại: `backend/payment_request_routes.py:3468-3565` (`patch_transaction_status`), `backend/sepay_routes.py:1000-1079` (`manual_match_bank_transaction` — tham chiếu, KHÔNG sửa), `backend/gateway_routes.py:685-712` (`patch_gateway_status` — tham chiếu). VERIFY khớp "Hiện trạng" mục 4 trước khi sửa.
> - Invariant top KHÔNG được phá: (1) nhả txn KHÔNG đổi `received`/`state` của PR (recompute chỉ đọc `payment_lines`); (2) CHỈ nhả txn trỏ đúng line đang reject, không đụng txn của line/PR khác; (3) phải nhả CẢ `bank_transactions` (SePay/CK) LẪN `gateway_transactions` (thẻ/mPOS/Payoo).
> - Gặp STOP condition (mục cuối) → DỪNG, hỏi user.

## 1. Vấn đề & bằng chứng

- **Triệu chứng:** Kế toán ghép nhầm giao dịch SePay vào sai PR, bấm **hủy** (reject) lần thanh toán. PR về đúng "chưa nhận tiền", nhưng giao dịch ngân hàng vẫn treo `manual_matched` trỏ tới line vừa bị reject → giao dịch mồ côi, tab Đối soát tưởng đã ghép, "ghép lại" không ăn (`manual_match` chặn `if current_status in (auto_matched, manual_matched)`).
- **Root cause (đã xác minh):** `patch_transaction_status` nhánh `status=rejected` CHỈ update `payment_lines`, KHÔNG chạm `bank_transactions`/`gateway_transactions`. Không tồn tại endpoint đảo ghép cho `bank_transactions`. Bất đối xứng: ghép = "gắn txn + mark line paid" (2 nửa), hủy = "unmark line" (1 nửa).
- **Bằng chứng (sự cố PR-2026-1819 → PR-2026-2073, 28/09/2026):**
  - DB lúc phát hiện: `payment_lines` id `e9610204…` (PR-1819) `status=rejected` (14:05), NHƯNG `bank_transactions` txn `99200fc7…` amount 9.01tr vẫn `match_status='manual_matched'`, `payment_line_id='e9610204…'`, `matched_by='thuhien…'`. → mồ côi.
  - Đã gỡ tay bằng 2 UPDATE DB (nhả về pending, rồi gắn lại đúng line PR-2073). Chi tiết + query: `docs/learnings/reject-line-does-not-unlink-bank-txn.md`.
- **Code:** reject handler `backend/payment_request_routes.py:3534-3546` (nhánh `elif status == "rejected"`), chỉ có `patch` cho bảng `payment_lines`.

## 2. Approach chọn + 5-criteria

**Approach:** Thêm helper `_unlink_reconciliation_txns(sb, line_id, actor_email)` nhả mọi `bank_transactions` + `gateway_transactions` trỏ tới line, gọi trong nhánh `status=rejected` của `patch_transaction_status`, SAU khi update line thành công. (Option (a) tự-nhả — đã chốt với user, thay vì (b) chặn hủy bắt gỡ trước.)

```
TC1 Triệt để:      ✅ nhả cả 2 bảng txn, mọi ca reject line (SePay + thẻ/mPOS), hết mồ côi tận gốc
TC2 Không lỗi con:  ✅ chỉ nhả txn trỏ đúng line_id; recompute chỉ đọc payment_lines → received/state không đổi; ca không có txn = update 0 dòng vô hại
TC3 Hạ tầng/perf:   ✅ +2 UPDATE by-index (payment_line_id) mỗi lần reject (hiếm); không thêm dịch vụ
TC4 Token economy:  ✅ 1 file sửa + 1 file test; không fan-out subagent thừa
TC5 Task-model:     ✅ 1 handler đơn file + helper; test riêng — chia 2 task rõ
→ Recommend (5/5)
```
(Đã loại: **(b) chặn reject khi line có txn, bắt kế toán gỡ ghép trên tab thẻ trước** — thêm bước thủ công phản trực giác với kế toán tư duy "hủy lần thanh toán"; và bank_transactions còn CHƯA có UI gỡ ghép nên sẽ deadlock. Loại.)

## 3. GUARDRAILS — invariant PHẢI GIỮ

| # | Quy tắc không được phá | Nguồn | Cách kiểm |
|---|------------------------|-------|-----------|
| G1 | Nhả txn KHÔNG đổi `received`/`state` của PR | `recompute_payment_request_totals` chỉ đọc `payment_lines` (payment_request_routes.py:1523-1530) | Test: assert `received` PR bằng trước/sau (đã do line reject quyết, không do txn) |
| G2 | CHỈ nhả txn có `payment_line_id == line đang reject` | learning `reject-line-does-not-unlink-bank-txn` | Test: txn của line KHÁC còn nguyên `manual_matched` sau khi reject line này |
| G3 | Nhả CẢ `bank_transactions` LẪN `gateway_transactions` | link 2 bảng: sepay_routes.py:1044, gateway_routes.py:565 | Test: cả 2 bảng đều về `pending`, `payment_line_id=NULL` |
| G4 | Ca line KHÔNG có txn nào (đa số reject: sale-cancel/từ-chối-bill line confirm tay) vẫn chạy trơn, không lỗi | reject hiện tại chạy được cho ca này | Test: reject line không txn → 200, không throw |
| G5 | Không mark-paid / không đụng `payment_lines.status` trong helper (helper chỉ nhả txn) | tách trách nhiệm; line status do nhánh reject lo | Đọc diff: helper chỉ update 2 bảng txn |
| G6 | Ghi audit khi nhả (truy vết) | mirror `recon.bank_txn_matched` (sepay_routes.py:1066) | Đọc diff: có `log_audit(... "recon.txn_unlinked_on_reject" ...)` |

## 4. Hiện trạng (ground truth snapshot)

`backend/payment_request_routes.py:3526-3559` (nhánh reject + update line):
```python
        old_status = _clean_text(line.get("status"))
        now_iso = _iso_now()
        patch: dict[str, Any] = {"status": status}
        if status == "paid":
            ...
        elif status == "rejected":
            patch["paid_at"] = None
            patch["reject_reason"] = (
                "Sales huỷ lần thanh toán" if is_sale_cancel
                else (_clean_text(body.reject_reason) or "Ke toan tu choi")
            )
            patch["confirmed_by"] = actor.email
            patch["confirmed_at"] = now_iso
            patch["confirmed_source"] = "manual"
        else:
            patch["paid_at"] = None
            patch["reject_reason"] = None
        ...
        try:
            updated_res = sb.table("payment_lines").update(patch).eq("id", transaction_id).execute()
            totals = recompute_payment_request_totals(sb, payment_request_id)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(500, f"Khong cap nhat transaction: {exc}") from exc
        log_audit(sb, actor.email, "recon.line_status_changed", ...)
```
- `bank_transactions` cột nhả: `match_status`→`'pending'`, `payment_line_id`→`NULL`, `matched_payment_id`→`NULL`, `matched_by`→`NULL`, `updated_at`. (schema xác nhận từ DB sự cố.)
- `gateway_transactions` cột nhả: `match_status`→`'pending'`, `payment_line_id`→`NULL`, `matched_by`→`NULL`, `matched_at`→`NULL` (mirror `patch_gateway_status` gateway_routes.py:700-705).
- Test harness mock: `backend/tests/test_sepay_match_candidates.py:13-105` — `FakeSB` table-based, `.eq().update()` áp patch cho rows khớp.

## 5. Tasks (nguyên tử, có checklist tiến độ)

- [ ] **T1 — Thêm helper `_unlink_reconciliation_txns` + gọi trong nhánh reject**
  - File: `backend/payment_request_routes.py` (helper đặt gần `recompute_payment_request_totals` ~:1490 hoặc trên `patch_transaction_status`; wire trong `patch_transaction_status` NGAY SAU `updated_res = ...update(patch)...` thành công, TRONG nhánh `status == "rejected"`).
  - Đổi chính xác:
    - Thêm helper:
      ```python
      def _unlink_reconciliation_txns(sb, line_id: str, actor_email: str) -> None:
          """Nhả mọi bank_transactions + gateway_transactions đang ghép tới line_id
          về 'pending' (khi line bị reject). Chống giao dịch mồ côi (learning
          reject-line-does-not-unlink-bank-txn). KHÔNG đụng payment_lines."""
          now_iso = _iso_now()
          from audit import log_audit
          for table, extra_clear in (
              ("bank_transactions", {"matched_payment_id": None}),
              ("gateway_transactions", {"matched_at": None}),
          ):
              try:
                  res = (sb.table(table)
                         .update({"match_status": "pending", "payment_line_id": None,
                                  "matched_by": None, "updated_at": now_iso, **extra_clear})
                         .eq("payment_line_id", line_id).execute())
                  freed = [str(r.get("txn_id") or r.get("id") or "") for r in (res.data or [])]
                  if freed:
                      log_audit(sb, actor_email, "recon.txn_unlinked_on_reject", table, line_id,
                                {"freed": freed})
              except Exception as exc:
                  print(f"[reject] unlink {table} for line {line_id} failed (non-fatal): {exc}")
      ```
      (Lưu ý: `gateway_transactions` khóa chính là `id` không phải `txn_id`; helper lấy cả 2 để log. `bank_transactions` không có cột `matched_at`; `gateway_transactions` không có `matched_payment_id` → dùng `extra_clear` để chỉ set cột đúng bảng, tránh PostgREST 42703 "column not exist" — xem learning `gateway-update-nonexistent-column`.)
    - Wire: trong nhánh reject, sau khi `updated_res`/`recompute` xong, trước/sau `log_audit(... line_status_changed ...)` thêm:
      ```python
      if status == "rejected":
          _unlink_reconciliation_txns(sb, transaction_id, actor.email)
      ```
  - Vì sao: đảo đủ 2 nửa của thao tác ghép; hết giao dịch mồ côi treo trên line rejected.
  - Guardrail liên quan: G1,G2,G3,G5,G6 (đặc biệt: `extra_clear` tránh set cột không tồn tại — G-schema).
  - Verify: `cd backend && python -m pytest tests/test_reject_line_unlinks_txn.py -q` (tạo ở T2) xanh; `grep -n "_unlink_reconciliation_txns" backend/payment_request_routes.py` thấy def + 1 call.
  - Ai làm: **inline (Opus, session này)** — đụng invariant state-consistency + schema-mismatch 2 bảng, cần reasoning; nhỏ (~25 dòng) nên không tách.

- [ ] **T2 — Test regression tái hiện sự cố PR-1819**
  - File: `backend/tests/test_reject_line_unlinks_txn.py` (mới, mượn `FakeSB` pattern từ `test_sepay_match_candidates.py:13-105`).
  - Đổi chính xác: dựng FakeSB với:
    - `payment_lines`: 1 line `L1` (PR-A, status `paid`), 1 line `L2` (PR-B, status `paid`).
    - `bank_transactions`: `T1` (manual_matched, payment_line_id `L1`), `T2` (manual_matched, payment_line_id `L2`).
    - `gateway_transactions`: `G1` (matched, payment_line_id `L1`).
    - `payment_requests`: PR-A, PR-B tối thiểu cho recompute.
    - PATCH `/transactions/L1/status` body `{"status":"rejected","reject_reason":"..."}` với actor có quyền confirm.
  - Assert (mỗi guardrail 1 case):
    - `T1.match_status=='pending'`, `payment_line_id is None` (G3 bank)
    - `G1.match_status=='pending'`, `payment_line_id is None` (G3 gateway)
    - `T2` KHÔNG đổi — vẫn `manual_matched`, `payment_line_id=='L2'` (G2)
    - PR-A `received` sau reject = 0 / không phụ thuộc việc nhả txn (G1)
    - Thêm 1 test: reject line KHÔNG có txn (L khác) → 200, không throw (G4)
  - Vì sao: không có test này = plan chưa xong (B4); canh đúng kịch bản đã gây sự cố.
  - Guardrail liên quan: G1,G2,G3,G4.
  - Verify: `cd backend && python -m pytest tests/test_reject_line_unlinks_txn.py -q` xanh.
  - Ai làm: subagent `cavecrew-builder` · model **Sonnet** (mock test, path + spec rõ) — HOẶC inline nếu FakeSB cần tuỳ biến `.execute().data` cho update.

## 6. Test plan

### Unit (mỗi guardrail 1 case regression)
- [ ] `tests/test_reject_line_unlinks_txn.py::test_reject_unlinks_bank_and_gateway` — reject L1 → T1+G1 về pending/null (G3)
- [ ] `…::test_reject_does_not_touch_other_line_txn` — T2 (line khác) nguyên vẹn (G2)
- [ ] `…::test_reject_keeps_pr_received_semantics` — received PR-A không do txn nhả quyết (G1)
- [ ] `…::test_reject_line_without_txn_ok` — reject line không txn → 200 (G4)
- [ ] Regression bug gốc: chính `test_reject_unlinks_bank_and_gateway` tái hiện PR-1819 (line rejected mà bank txn còn dính → sau fix phải nhả).

### E2E/manual
- Không đụng UI (BE-only, endpoint sẵn có FE gọi). Bỏ E2E.

### Build/verify
- [ ] `cd backend && python -m pytest tests/test_reject_line_unlinks_txn.py tests/test_sepay_match_candidates.py -q` xanh (không hồi quy match cũ)
- [ ] `cd frontend && npx tsc -b` — không đổi FE nên chỉ chạy để chắc, kỳ vọng no-op xanh
- [ ] (BE không có tsc) — chạy full `python -m pytest -q` nếu nhanh, ít nhất các test payment/sepay/gateway

## 7. Rollback
- Nhánh sandbox dùng-xong-reset ([[feedback_git_sandbox_disposable_workflow]]); revert 1 commit (chỉ +1 helper + 1 call + 1 file test). Không migration DB (chỉ đổi runtime write). Không rollback dữ liệu — sự cố PR-1819 đã fix tay xong.

## 8. Definition of Done
- [ ] G1–G6 còn giữ (đối chiếu mục 3) — đặc biệt G-schema: không set cột thừa lên sai bảng (test chạy được = PostgREST fake không bắt, nên VERIFY tay trên sandbox 1 lần reject thật)
- [ ] 4 test mục 6 xanh, có regression bug gốc
- [ ] `tsc -b` pass (no-op)
- [ ] Verify hành vi thật trên **sandbox**: tạo PR test, ghép 1 bank txn, reject line → query `bank_transactions` thấy `pending`/`payment_line_id NULL`; `gateway_transactions` tương tự với 1 line thẻ
- [ ] Squash-merge main sau soak; KHÔNG migration prod

## STOP conditions (dừng & hỏi user)
- Code thực tế lệch "Hiện trạng" mục 4 (vd nhánh reject đã được sửa bởi ai khác).
- `gateway_transactions`/`bank_transactions` thực tế có thêm cột NOT NULL liên quan match → set NULL fail. Dừng, báo.
- Test đỏ do FakeSB không mô phỏng được update-by-payment_line_id → cân chỉnh harness, không bỏ assert.
- Phát sinh muốn "tiện tay" fix luôn cancel-PR-void-line (learning `cancel-pr-leaves-pending-qr-line-live`) → KHÔNG gộp; ghi follow-up riêng (giữ TC2).
