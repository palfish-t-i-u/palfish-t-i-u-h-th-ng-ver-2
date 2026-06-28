# HANDOFF — TOP 2.2: Tin nhắn Zalo báo thanh toán thêm tên Sale + tên team

**Origin:** Feedback họp 25/06/2026. Anh Hiếu: "Format tin nhắn báo về zalo: thêm tên Sale + tên team."

**Estimated effort:** ~1h **BE-only** (chủ yếu 1 Postgres function + 1 migration). KHÔNG đụng FE.

---

## Bối cảnh QUAN TRỌNG (đã verify) — đường đi THẬT của tin nhắn

Tin "💰 Đã vào..." **KHÔNG** build bằng Python. Đường đi production:
1. `payment_lines.status` đổi sang `'paid'` → trigger `fn_payment_paid_zalo_notify()` chạy.
2. Trigger gọi **Postgres function** `public.build_payment_paid_message(NEW)` để dựng chuỗi.
3. Chèn vào `zalo_outbox` → worker (`zalo_outbox_worker.py`) gửi qua `send_text_to_group`.

⇒ **Phải sửa Postgres function `build_payment_paid_message`** (nguồn sự thật). Hàm Python `backend/utils/zalo_message_builder.py:build_payment_paid_message` là bản song song **không được gọi lúc runtime** (chỉ test tham chiếu) — cập nhật để khỏi lệch + giữ test xanh, nhưng KHÔNG phải đường đi thật.

Function hiện tại (định nghĩa gốc ở `backend/migrations/2026-06-23-zalo-oa-tables.sql` dòng 52-86):
```sql
CREATE OR REPLACE FUNCTION public.build_payment_paid_message(line_row payment_lines)
...
  SELECT pr.sale_email, pr.name, ns.team, ns.display_name
    INTO v_sale_email, v_customer, v_sale_team, v_sale_name
    FROM public.payment_requests pr
    LEFT JOIN public.nhan_su_sale ns ON ns.email ILIKE pr.sale_email
    WHERE pr.id = line_row.payment_request_id LIMIT 1;
  ...
  RETURN format(
    '💰 Đã vào - KH %s của %s thanh toán %sđ vào lúc %s',
    COALESCE(v_customer, '?'),
    COALESCE(v_sale_name, v_sale_email, '?'),
    v_amount_fmt,
    COALESCE(v_time_fmt, '?')
  );
```
> `v_sale_name` (tên sale) ĐÃ có trong tin. `v_sale_team` (tên team) ĐÃ được SELECT nhưng **chưa in ra**. ⇒ Việc chính chỉ là thêm team vào chuỗi.

---

## Scope

### IN scope
1. Migration mới: `CREATE OR REPLACE FUNCTION public.build_payment_paid_message` — thêm **tên team** vào chuỗi (tên sale đã có). Trigger giữ nguyên.
2. (Đồng bộ) thêm team vào `public.build_course_activated_message` — đã SELECT `v_sale_team`, chưa in.
3. Áp migration: **sandbox trước → prod sau**.
4. Cập nhật hàm Python `build_payment_paid_message` (+ test) cho khớp format, để không lệch.

### OUT of scope
- KHÔNG đổi trigger `fn_payment_paid_zalo_notify` / `fn_course_activated_zalo_notify`.
- KHÔNG đổi cơ chế routing nhóm (`zalo_team_groups` / `team_code`).
- KHÔNG đổi worker, KHÔNG đổi FE.
- KHÔNG đổi tin "⚡ Cần kích hoạt GẤP" (reminder) trừ khi anh Hiếu yêu cầu.

---

## Files cần tạo / sửa

### 1. MỚI: `backend/migrations/2026-06-26-zalo-msg-add-sale-team.sql`

```sql
-- TOP2.2: Thêm tên Sale + tên team vào tin Zalo báo thanh toán / kích hoạt.
-- Tên sale (v_sale_name) đã có sẵn; bổ sung team (v_sale_team, ns.team).
-- Trigger KHÔNG đổi — chỉ CREATE OR REPLACE 2 function build_*.

CREATE OR REPLACE FUNCTION public.build_payment_paid_message(line_row payment_lines)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_sale_email TEXT;
  v_customer   TEXT;
  v_sale_team  TEXT;
  v_sale_name  TEXT;
  v_amount_fmt TEXT;
  v_time_fmt   TEXT;
BEGIN
  SELECT pr.sale_email, pr.name, ns.team, ns.display_name
    INTO v_sale_email, v_customer, v_sale_team, v_sale_name
    FROM public.payment_requests pr
    LEFT JOIN public.nhan_su_sale ns ON ns.email ILIKE pr.sale_email
    WHERE pr.id = line_row.payment_request_id
    LIMIT 1;

  v_amount_fmt := to_char(line_row.amount, 'FM999,999,999,999');
  v_time_fmt := to_char(
    COALESCE(line_row.paid_at, line_row.confirmed_at, line_row.created_at) AT TIME ZONE 'Asia/Ho_Chi_Minh',
    'HH24:MI DD/MM/YYYY'
  );

  RETURN format(
    '💰 Đã vào - KH %s | Sale %s · Team %s | %sđ | %s',
    COALESCE(v_customer, '?'),
    COALESCE(v_sale_name, v_sale_email, '?'),
    COALESCE(NULLIF(v_sale_team, ''), '?'),
    v_amount_fmt,
    COALESCE(v_time_fmt, '?')
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.build_course_activated_message(ar_row active_requests)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_uid_block JSONB;
  v_course JSONB;
  v_courses_list TEXT := '';
  v_sale_email TEXT;
  v_customer_from_pr TEXT;
  v_sale_team TEXT;
  v_sale_name TEXT;
BEGIN
  IF ar_row.uids_data IS NOT NULL AND jsonb_typeof(ar_row.uids_data) = 'array' THEN
    FOR v_uid_block IN SELECT * FROM jsonb_array_elements(ar_row.uids_data)
    LOOP
      IF jsonb_typeof(v_uid_block->'courses') = 'array' THEN
        FOR v_course IN SELECT * FROM jsonb_array_elements(v_uid_block->'courses')
        LOOP
          IF v_courses_list != '' THEN v_courses_list := v_courses_list || ', '; END IF;
          v_courses_list := v_courses_list || COALESCE(v_course->>'name', '?');
        END LOOP;
      END IF;
    END LOOP;
  END IF;

  SELECT pr.sale_email, pr.name, ns.team, ns.display_name
    INTO v_sale_email, v_customer_from_pr, v_sale_team, v_sale_name
    FROM public.payment_requests pr
    LEFT JOIN public.nhan_su_sale ns ON ns.email ILIKE pr.sale_email
    WHERE pr.id = ar_row.pr_id
    LIMIT 1;

  RETURN format(
    '✅ ĐÃ KÍCH HOẠT THÀNH CÔNG GÓI HỌC — KH %s | Sale %s · Team %s | gói %s',
    COALESCE(ar_row.customer_name, v_customer_from_pr, '?'),
    COALESCE(v_sale_name, v_sale_email, '?'),
    COALESCE(NULLIF(v_sale_team, ''), '?'),
    CASE WHEN v_courses_list = '' THEN '?' ELSE v_courses_list END
  );
END;
$function$;
```
> Chuỗi format trên là ĐỀ XUẤT. Nếu anh Hiếu có format thống nhất khác → chỉ đổi phần literal trong `format(...)`, giữ thứ tự tham số.

### 2. Áp migration (sandbox → prod)

Dùng Supabase MCP `apply_migration` hoặc SQL Editor. Thứ tự BẮT BUỘC:
1. **Sandbox** project `palfish-gmv-sandbox` (ref `pxgybyfiwywksesyogti`) — chạy file SQL trên.
2. Test trên sandbox (xem Test plan).
3. **Prod** project `project_palfish` (ref `jozcvbbypwvzaefteoxn`) — chạy y hệt.

> `CREATE OR REPLACE FUNCTION` là idempotent, không ảnh hưởng trigger/outbox đang chạy. Tin cũ trong outbox không đổi; tin MỚI (sau khi áp) sẽ có team.

### 3. Đồng bộ hàm Python (parity + test) — `backend/utils/zalo_message_builder.py`

`build_payment_paid_message` (dòng 115-118) hiện:
```python
message = (
    f"💰 PAID — KH {customer} | {amount} "
    f"| sale {sale_name} | {method} | {time_str}"
)
```
Thêm team (đã có `canonical_team`; ưu tiên team thô để khớp SQL):
```python
team_display = _clean(sale_info.get("team")) or canonical_team or "?"
message = (
    f"💰 PAID — KH {customer} | {amount} "
    f"| sale {sale_name} · team {team_display} | {method} | {time_str}"
)
```
Làm tương tự `build_course_activated_message` (dòng 206-209) nếu muốn parity.

> ⚠️ Đây KHÔNG phải đường đi thật (không có caller runtime) — sửa chỉ để hàm Python không lệch ý nghĩa + giữ unit test xanh.

### 4. Cập nhật test Python

```
grep -rn "PAID\|Đã vào\|build_payment_paid_message" backend/tests
```
Sửa assert chuỗi trong `backend/tests/test_zalo_notifier.py` / `test_zalo_integration.py` cho khớp format mới (thêm `team ...`). Thêm 1 case: `sale_info` có `team` → message chứa tên team; thiếu team → chứa `?`/fallback.

---

## Acceptance criteria

1. Áp migration sandbox xong: tạo 1 giao dịch test cho PR có sale gắn team → confirm `paid` → bản ghi `zalo_outbox.message` mới có dạng `💰 Đã vào - KH ... | Sale <tên> · Team <team> | ...đ | ...`.
2. Tên team lấy đúng từ `nhan_su_sale.team` của sale phụ trách PR.
3. Sale không gắn team / team rỗng → hiện `Team ?` (không vỡ, không null).
4. Tin kích hoạt khoá học cũng có `Team <...>`.
5. Routing nhóm Zalo KHÔNG đổi (vẫn vào đúng nhóm theo `team_code`).
6. `cd backend && python -m pytest tests/test_zalo_notifier.py tests/test_zalo_integration.py -q` PASS.

---

## Test plan

**Sandbox SQL (nhanh, không cần gửi Zalo thật):**
```sql
-- Lấy 1 payment_line bất kỳ rồi gọi trực tiếp function:
SELECT public.build_payment_paid_message(pl.*)
FROM public.payment_lines pl
JOIN public.payment_requests pr ON pr.id = pl.payment_request_id
JOIN public.nhan_su_sale ns ON ns.email ILIKE pr.sale_email
LIMIT 1;
-- Kỳ vọng chuỗi có "Team <tên team>".
```
**End-to-end sandbox:** tạo PR (sale có team đã map nhóm Zalo) → tạo lần TT → confirm paid → kiểm `zalo_outbox` mới + (nếu nhóm test thật) tin về Zalo có team.

**Prod:** sau khi sandbox OK → áp migration prod → theo dõi 1 tin thật đầu tiên.

---

## Anti-patterns (đừng làm)
1. ĐỪNG chỉ sửa hàm Python rồi tưởng xong — đường đi thật là **Postgres function**.
2. ĐỪNG đổi trigger hay logic chèn `zalo_outbox`.
3. ĐỪNG áp thẳng prod khi chưa test sandbox.
4. ĐỪNG để `Team ` trống/null khi sale thiếu team — phải fallback `?` (đã có `NULLIF`+`COALESCE`).
5. ĐỪNG đổi `team_code` routing (đó là canonical để chọn nhóm, khác với team hiển thị).

## Ghi chú
- 2 Supabase project + quy ước key: xem memory `supabase-projects-key-rotation`. Deploy BE (nếu cần) theo `scripts/deploy.sh sandbox` (memory `render-deploy-hook`).
- Nếu anh Hiếu gửi "format thống nhất" cho tin nhắn → chỉ chỉnh literal trong `format(...)`, phần SELECT/biến giữ nguyên.
