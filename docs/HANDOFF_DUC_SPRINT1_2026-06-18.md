# HANDOFF Đức — Sprint 1 BE (Feedback họp 18/06/2026)

**Phạm vi:** Nhóm 2 (Ghép CK ngoài) + Nhóm 3 (mPOS) + 1 phần ghép lệch tiền
**Ước lượng:** ~1.5–2 ngày
**Dependencies:** Không block ai. FE chạy song song UI, chỉ join lúc integrate.

---

## Bối cảnh nghiệp vụ

Sau buổi họp 18/06, anh Hiếu phản hồi 2 vấn đề liên quan tới module Đối soát:

1. **Modal ghép CK ngoài** đang khó dùng: kế toán phải cuộn list rất dài để tìm lần TT phù hợp, và mỗi dòng chỉ hiện vài field (tên, UID, SĐT) → không đủ thông tin để quyết định ghép. Nguy hiểm hơn: nếu sales làm 2 PR khác nhau cùng số tiền cho 2 khách khác nhau, kế toán dễ ghép nhầm. Vì vậy cần lọc theo số tiền chính xác, hiện thêm thông tin (con của khách, sale tạo PR, team), và phải có cảnh báo khi ghép lệch tiền.

2. **Drawer ghép mPOS / Payoo** đang chỉ tìm theo amount-exact → rất nhiều trường hợp không match được, hiện "Không có lần thanh toán phù hợp" rồi kế toán bí. Cần fallback cho phép tìm thủ công theo PR-ID, tên KH, UID, SĐT (giống modal CK ngoài).

3. **Ghép lệch tiền (CK ngoài):** Trước đây cho phép ghép thoải mái, không log gì → khi BC kiểm tra phát hiện chênh tiền không biết của lần ghép nào. Lần này yêu cầu lưu `discrepancy_amount` cho mỗi record match nếu amount BE và amount line không khớp.

---

## Task list

### T2.2 — Match candidates CK ngoài: bổ sung thông tin per-line

**Endpoint:** `GET /api/v1/bank-transactions/{txn_id}/match-candidates`
**File:** `backend/sepay_routes.py:541` (function `bank_txn_match_candidates`)

Hiện trả về mỗi candidate: `payment_line_id`, `pr_id`, `pr_name`, `pr_uid`, `pr_phone`, `amount`, `created_at`, `method`, `status`, `transfer_code`.

**Bổ sung thêm 3 field:**
- `child_name` — tên con của khách. Lấy trực tiếp từ `payment_requests.child_name` (column, không nằm trong JSONB). Nếu null/rỗng → `""`.
- `sale_name` — tên sale tạo PR. Join: `payment_requests.sale_email` → `nhan_su_sale.email` → `display_name` (fallback `crm_name`, fallback `email`).
- `team_name` — team của sale. Lấy từ `nhan_su_sale.team` (column string trên cùng bảng, KHÔNG có bảng `teams` riêng).

**Schema lưu ý** (đã verify code):
- **KHÔNG có bảng `users` / `teams` riêng.** Project dùng 1 bảng combo `nhan_su_sale` chứa cả thông tin sale + cột `team`/`sub_team` (string).
- `nhan_su_sale` columns: `email, display_name, crm_name, team, sub_team, sdt`.
- `payment_requests` đã có column `sale_email` (lookup key) và `child_name` (đã có sẵn).
- Helper `_sale_name_map()` ở [payment_request_routes.py:710](backend/payment_request_routes.py:710) đã sẵn — return `dict[email_lower, display_name|crm_name|email]`. Em có thể reuse.

**Query optimization:** Lookup batch — đừng query từng row. Pattern:
```python
# Sau khi đã có pr_info (dòng 575-586):

# 1. Sale name — reuse helper sẵn có:
sale_name_map = _sale_name_map(sb)   # dict[email_lower, display_name|crm_name|email]

# 2. Team batch lookup — query trực tiếp nhan_su_sale với select team:
sale_emails = list({_clean_text(p.get("sale_email")).lower() for p in pr_info.values() if p.get("sale_email")})
team_by_email: dict[str, str] = {}
if sale_emails:
    try:
        ns_res = sb.table("nhan_su_sale").select("email, team").in_("email", sale_emails).execute()
        team_by_email = {
            str(r.get("email") or "").lower(): str(r.get("team") or "")
            for r in (ns_res.data or [])
        }
    except Exception as exc:
        print(f"[match-candidates] nhan_su_sale team lookup failed: {exc}")

# 3. child_name — đã có sẵn trong pr_info (column trên payment_requests), không cần lookup AR.
```
**Lưu ý:** KHÔNG cần scan `active_requests.uids_data` để lấy `child_name` (handoff cũ ghi sai). Column `payment_requests.child_name` đã có sẵn. Nếu có nhu cầu lấy thêm `student_name`/`uid_owner_name` per-UID trong uids_data (cho UI hiển thị multi-child) thì cân nhắc sau — Sprint 1 chỉ cần `payment_requests.child_name`.

**Response mỗi candidate:**
```json
{
  "payment_line_id": "...",
  "pr_id": "...",
  "pr_name": "Nguyễn Văn A",
  "pr_uid": "12345",
  "pr_phone": "0987...",
  "child_name": "Bé Bin",
  "sale_name": "Trần Thị B",
  "team_name": "Team Hà Nội 1",
  "amount": 5000000,
  "created_at": "2026-06-18T10:00:00",
  "method": "transfer",
  "status": "pending",
  "transfer_code": "PR12345"
}
```

---

### T2.4-BE — Param `?amount_exact=X` cho match-candidates CK ngoài

**Cùng endpoint trên.** Thêm query param:
```python
async def bank_txn_match_candidates(
    txn_id: str,
    amount_exact: int | None = None,   # Mới
    authorization: str | None = Header(None),
):
```

Logic:
- Nếu `amount_exact` không None → filter `payment_lines.amount = amount_exact` (chứ không fetch 500 dòng rồi sort).
- Nếu `amount_exact` là None → giữ logic cũ (fetch 500, sort theo `abs(amount - txn_amount)`).

FE sẽ gọi với `?amount_exact={txn.amount}` cho chip "Cùng số tiền" (mặc định bật). Chip "Tất cả" sẽ không truyền param.

---

### T2.5-BE — Match candidates mPOS: param `?search=` fallback rộng

**Endpoint:** `GET /gateway-txns/{txn_id}/match-candidates`
**File:** `backend/gateway_routes.py:333` (function `gateway_match_candidates`)

Hiện chỉ filter `payment_lines.amount = amount` của giao dịch gateway.

**Thêm query param:**
```python
def gateway_match_candidates(
    txn_id: str,
    search: str | None = None,   # Mới
    authorization: str | None = Header(None),
):
```

**Logic:**
- Nếu `search` rỗng/None → giữ nguyên (filter theo amount).
- Nếu `search` có giá trị → bỏ filter amount, search rộng theo PR-ID hoặc tên KH hoặc UID hoặc SĐT (OR):
  ```python
  q = sb.table("payment_lines").select("*")
  # Join PR để search được name, uid, phone
  # Đề xuất: query payment_lines theo payment_request_id, sau khi đã filter PR theo search.
  pr_q = sb.table("payment_requests").select("id")
  s = search.strip()
  # PR-ID match exact hoặc prefix
  pr_filter = pr_q.or_(f"id.ilike.%{s}%,name.ilike.%{s}%,uid.ilike.%{s}%,phone.ilike.%{s}%")
  pr_ids = [r["id"] for r in (pr_filter.execute().data or [])]
  if not pr_ids:
      return []
  lines = sb.table("payment_lines").select("*").in_("payment_request_id", pr_ids).limit(50).execute().data or []
  ```
- Vẫn loại trừ `used_line_ids` (lần TT đã ghép với gateway txn khác).
- Vẫn limit 50.
- Vẫn include same fields như trước (pr_name, uid, has_bill...).

**Lưu ý FE:** FE sẽ hiện input search ngay trong drawer khi response candidates rỗng (hoặc luôn hiện). Endpoint không cần phân biệt "rỗng vì không có" vs "rỗng vì query sai".

---

### T3.2 — Lưu `discrepancy_amount` khi ghép lệch tiền (CK ngoài)

**Bảng cần migrate:** Bảng record match của bank transactions. Cần confirm tên bảng:
- Nếu match được lưu trực tiếp trên `bank_transactions` (column `payment_line_id`, `matched_at`...): thêm column `discrepancy_amount` vào `bank_transactions`.
- Nếu có bảng riêng `bank_transaction_matches`: thêm column vào bảng đó.

Em kiểm tra trong `sepay_routes.py` xem endpoint match nào (có thể là `PATCH /api/v1/bank-transactions/{txn_id}/match`) đang update field gì để xác định bảng.

**Migration SQL (giả định bảng `bank_transactions`):**
```sql
ALTER TABLE bank_transactions
  ADD COLUMN discrepancy_amount NUMERIC DEFAULT 0;
COMMENT ON COLUMN bank_transactions.discrepancy_amount IS
  'Chênh lệch giữa số tiền giao dịch ngân hàng và số tiền của lần thanh toán được ghép. Dương = thừa, âm = thiếu, 0 = khớp.';
```

**Logic endpoint match:**
Khi ghép một bank_transaction với payment_line:
```python
line = sb.table("payment_lines").select("amount").eq("id", line_id).limit(1).execute().data[0]
txn = sb.table("bank_transactions").select("amount").eq("txn_id", txn_id).limit(1).execute().data[0]
discrepancy = _parse_amount(txn["amount"]) - _parse_amount(line["amount"])

sb.table("bank_transactions").update({
    "payment_line_id": line_id,
    "matched_at": now,
    "matched_by": actor.email,
    "discrepancy_amount": discrepancy,
    # ... các field khác
}).eq("txn_id", txn_id).execute()
```

**Response:** Trả thêm `discrepancy_amount` trong response object để FE biết hiển thị badge cảnh báo.

**Không bắt buộc validate:** Cho phép discrepancy != 0, chỉ log. FE sẽ bắt confirm "Tôi xác nhận ghép lệch" trước khi gọi endpoint này (logic UI).

---

## Test plan

### Unit/integration
1. T2.2: gọi endpoint với 1 txn → assert response có đủ `child_name`, `sale_name`, `team_name`. Test trường hợp UID không có trong AR → field trả `""` không lỗi.
2. T2.4-BE: gọi với `?amount_exact=5000000` → chỉ trả lines có amount=5000000. Không truyền → trả 500 lines sort by `abs(diff)`.
3. T2.5-BE: gọi với `?search=PR12345` → trả lines của PR đó. Gọi với `?search=` rỗng → fallback amount-match cũ.
4. T3.2: ghép 1 txn 5,000,500 với line 5,000,000 → `discrepancy_amount = 500`. Ghép đúng → `discrepancy_amount = 0`.

### Smoke
- Deploy sandbox: `bash scripts/deploy.sh sandbox`
- Test qua FE sandbox sau khi anh Minh integrate UI.

---

## Lưu ý chung

- **RBAC:** giữ nguyên permission check (`require_module_write(sb, actor, "reconciliation")`).
- **Performance:** batch lookup users/teams/active_requests (đừng query từng row).
- **Backward compat:** thêm field/param mới, đừng break field cũ. FE cũ chưa truyền `amount_exact` thì vẫn chạy như cũ.
- **Migration prod:** chạy migration `discrepancy_amount` trên cả 2 project Supabase (`jozcvbbypwvzaefteoxn` prod + `pxgybyfiwywksesyogti` sandbox).

---

## Files cần đụng

| File | Lý do |
|---|---|
| `backend/sepay_routes.py` | T2.2, T2.4-BE, T3.2 (endpoint match-candidates CK ngoài + endpoint match có thể nằm gần đó) |
| `backend/gateway_routes.py` | T2.5-BE (endpoint match-candidates mPOS) |
| Migration SQL | T3.2 — chạy trực tiếp trên Supabase prod + sandbox |

---

## Câu hỏi đã xác nhận (UPDATED 18/6)

| Câu hỏi gốc | Trả lời sau khi grep code |
|---|---|
| Bảng `users` / `teams`? | KHÔNG có. Dùng `nhan_su_sale` (1 bảng combo) — columns: `email, display_name, crm_name, team, sub_team, sdt` |
| Tên sale priority? | `display_name` → `crm_name` → `email`. Helper `_sale_name_map()` đã có ở [payment_request_routes.py:710](backend/payment_request_routes.py:710) |
| `child_name` ở đâu? | Column trực tiếp `payment_requests.child_name`. KHÔNG nằm trong `uids_data` |
| Bảng record match (T3.2 discrepancy)? | Cần em xác nhận khi đọc endpoint match hiện tại — nếu match lưu trực tiếp trên `bank_transactions` thì ALTER bảng đó; nếu có bảng riêng thì add column vào đó |
| Lookup `uids_data` theo UID có RPC? | Chưa có RPC. Sprint 1 KHÔNG cần (child_name đã ở column riêng). Sau này nếu cần per-UID data → làm RPC hoặc batch fetch AR |

## Câu hỏi còn lại (chưa rõ, cần em check khi code)

1. **Tên bảng/column lưu `discrepancy_amount`** (T3.2): confirm bảng nào (`bank_transactions` hay bảng riêng) → em đọc endpoint match hiện tại trong `sepay_routes.py` để biết.

Hỏi anh Minh nếu chưa rõ.
