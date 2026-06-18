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
- `child_name` — tên con của UID, lấy từ `active_requests.uids_data[*].courses[*].uid_owner_name` (hoặc field tương đương trong AR). Logic: tìm AR có UID khớp `pr.uid` → lấy `uid_owner_name` từ course đầu tiên. Nếu không tìm thấy → trả `""`.
- `sale_name` — tên sale tạo PR. Join: `payment_requests.created_by_email` → `users.email` → `users.full_name` (hoặc `users.display_name`).
- `team_name` — team của sale. Join: `users.team_id` → `teams.name`.

**Query optimization:** Lookup batch — đừng query từng row. Pattern:
```python
# Sau khi đã có pr_info (dòng 575-586):
# 1. Batch lookup sales
sale_emails = list({p.get("created_by_email") for p in pr_info.values() if p.get("created_by_email")})
sale_info: dict[str, dict] = {}
if sale_emails:
    sale_res = sb.table("users").select("email, full_name, team_id").in_("email", sale_emails).execute()
    sale_info = {u["email"]: u for u in (sale_res.data or [])}

# 2. Batch lookup teams
team_ids = list({u.get("team_id") for u in sale_info.values() if u.get("team_id")})
team_info: dict[str, str] = {}
if team_ids:
    team_res = sb.table("teams").select("id, name").in_("id", team_ids).execute()
    team_info = {str(t["id"]): t["name"] for t in (team_res.data or [])}

# 3. Batch lookup uids → uid_owner_name (active_requests.uids_data JSONB)
uids = list({p.get("uid") for p in pr_info.values() if p.get("uid")})
child_name_by_uid: dict[str, str] = {}
if uids:
    # Có thể cần raw SQL với JSONB containment, hoặc fetch all AR có uids_data chứa uid → loop
    # Đề xuất: dùng RPC nếu có sẵn, hoặc query đơn giản sau:
    ar_res = sb.table("active_requests").select("uids_data").execute()
    for ar in (ar_res.data or []):
        for uid_obj in (ar.get("uids_data") or []):
            uid = uid_obj.get("uid")
            if uid in uids:
                courses = uid_obj.get("courses") or []
                if courses:
                    child_name_by_uid[uid] = courses[0].get("uid_owner_name", "")
```
**Lưu ý:** `active_requests` có thể rất nhiều rows → cần optimize bằng RPC hoặc filter `uids_data @> '...'`. Nếu Postgres function khả thi, ưu tiên RPC để không scan full table.

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

## Câu hỏi cần xác nhận trước khi code

1. **Tên bảng/column lưu `discrepancy_amount`:** confirm bảng nào (`bank_transactions` hay bảng riêng) → em đọc endpoint match hiện tại để biết.
2. **`active_requests.uids_data` JSONB:** có RPC sẵn để query theo UID chưa? Nếu chưa, em scan full table có chấp nhận được không (bảng đang có bao nhiêu rows)? Nếu nhiều > vài chục nghìn → cần làm RPC.
3. **Bảng `users` field tên:** xác nhận field tên đầy đủ là `full_name` hay `display_name` hay `name`.
4. **Bảng `teams`:** field tên là `name` hay khác.

Hỏi anh Minh / Giang trước khi bắt đầu nếu chưa rõ.
