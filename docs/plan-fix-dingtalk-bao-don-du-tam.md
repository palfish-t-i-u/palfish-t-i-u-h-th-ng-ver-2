# Plan: Fix tin DingTalk báo đơn cho đơn "đủ tạm" (thẻ/trả góp)

**Ngày:** 2026-08-12 · **Trạng thái: ✅ HOÀN THÀNH** (commit 58be260, deploy Render ~14h VN)

## Bối cảnh (1 root cause)
Tính năng "đủ tạm" (ship 7/8 — kích hoạt sớm khi line thẻ/trả góp có bill nhưng vẫn `status='pending'`)
KHÔNG đồng bộ với code dựng tin DingTalk `activation_request_created`. Tin dựng theo giả định
line đã `paid` → đơn báo sớm bị rơi **cả "Tổng" lẫn ảnh bill**.

Ca thực tế: `PR-2026-1018` / `AR-2026-0328` (sale Trịnh Thị Hoa, KH Thu Hương, bé Đàm Uyên Nhi).
1 line `installment` mPOS, `amount=10.080.000`, `status='pending'`, đã up bill.
`target=9.434.880` (thực nhận sau phí, tạm tính) · `received=0` → tin hiện "Tổng: 0 VND", không bill.

**Chị Hiền (kế toán) chốt:** ghi nhận doanh thu theo **số sau khi trừ phí** = `target` = 9.434.880.
→ "Tổng" phải hiện `target`, KHÔNG phải số biên lai 10.080.000.

**Ngoài scope:** việc "sale nhập giá gói hay thực nhận vào ô tiền" — chờ anh Hiếu chốt phí thẻ, KHÔNG đụng ở đây.

---

## Milestone G1 — Fix code (giao Sonnet)

### G1-T1 — "Tổng" fallback `target` khi `received` = 0
**File:** `backend/utils/zalo_message_builder.py:520-524`

Hiện tại `pr_received not in (None, "")` → `0` (int) lọt qua → `total_val = 0`.
Sửa thành ép float rồi so `> 0`:
```python
def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0
recv_f = _num(pr_received)
target_f = _num(pr_target)
total_val = recv_f if recv_f > 0 else target_f   # received>0 → đã thu; else → giá trị đơn (target)
```
- **Cạm bẫy:** `received` có thể là `0` / `0.0` / `"0"` / `None` / `""`. ĐỪNG dùng `if pr_received:` (str `"0"` truthy). Phải ép float + so `> 0`.
- Builder này CHỈ dùng cho event `activation_request_created` (2 caller: activation_routes.py:1127, :1248 + tests). Không ảnh hưởng event khác.
- **BE-only** — FE không dựng tin DingTalk, KHÔNG sửa gì bên frontend.

### G1-T2 — `bill_urls` gom thêm line thẻ/trả góp pending có bill
**File:** `backend/activation_routes.py:1227-1245`

Query hiện: `.select("bill_image, bill_images").eq("status","paid").order("paid_at")` → line pending bị bỏ.

Sửa:
1. Query: **bỏ `.eq("status","paid")`**, select thêm `method, status`:
   `.select("bill_image, bill_images, method, status").eq("payment_request_id", pr_id_val).order("paid_at", desc=False)`
2. Trong vòng lặp gom bill, chỉ nhận line thoả:
   `status == "paid"` **HOẶC** (`(method or "").lower() in _PROVISIONAL_METHODS` **và** `status == "pending"` **và** `_line_has_bill(line)`)
3. Import thêm ở đầu file (đã import `activatable_received` từ pr_guards tại dòng ~44-49):
   `from pr_guards import _PROVISIONAL_METHODS, _line_has_bill`

- **Cạm bẫy 1 (làm vỡ test):** ĐỪNG dùng `.in_("status", [...])`. Mock `_mock_chain_table`
  (`test_dingtalk_ar_created.py:32`) không mock `in_` → test AttributeError. Giữ query không filter status, lọc trong Python.
- **Cạm bẫy 2 (lỗi con):** dùng ĐÚNG `_PROVISIONAL_METHODS` + `_line_has_bill` từ pr_guards — KHÔNG tự viết lại predicate. Phải khớp byte-for-byte với `activatable_received` (cùng định nghĩa "đủ tạm").
- Line `rejected`, hoặc `qr`/`cash` pending → KHÔNG lấy bill (predicate đã loại).
- `bill_url = bill_urls[0]` giữ nguyên (dòng 1245).

### G1-T3 — Tests
**File:** `backend/tests/test_dingtalk_ar_created.py` (hạ tầng `_build_dt_sb(line_rows=...)` có sẵn)

Thêm:
1. **Bill từ line pending:** `line_rows=[{"method":"installment","status":"pending","bill_image":"https://x/b.jpg","bill_images":None}]`
   → assert `calls[0]["image_urls"] == ["https://x/b.jpg"]` (đơn đủ tạm vẫn có bill).
2. **Không lấy bill line loại trừ:** thêm case line `qr`/`pending` có bill → assert KHÔNG vào image_urls.
3. **Giữ** `test_no_bill_sends_null_image` xanh.

**File:** `backend/tests/test_zalo_builder.py`
4. **Tổng fallback:** `pr` với `received=0`/`target=9_434_880`, `ar` có courses → assert `"Tổng: 9.434.880 VND" in message`.

Chạy: `cd backend && python -m pytest tests/test_dingtalk_ar_created.py tests/test_zalo_builder.py -q`
- **Cạm bẫy:** mock line_rows trả nguyên dict (`.select` không lọc cột trong mock) → thêm key `method`/`status` vào dict mock là đủ.

### G1-T4 — Deploy
`cd backend && python -m pytest -q` (toàn bộ xanh) → commit → push `main` → Render tự deploy BE.
Không build FE (BE-only).

---

## Milestone G2 — Bàn giao lại AR bị ảnh hưởng ✅ DONE (12/8)

### Kết quả — 3 AR đã bắn lại thủ công (source_suffix `:resend-fix`)

| AR | Sale/KH | outbox id | Tổng | Ghi chú |
|----|---------|-----------|------|---------|
| AR-2026-0328 | Trịnh Thị Hoa / Đàm Uyên Nhi | 533 | 9.434.880 | outbox sent ✓ |
| AR-2026-0339 | Nguyễn Ngọc Phương / Phương Thúy | 543 | (theo tin đúng) | outbox sent ✓ |
| AR-2026-0342 | Bui Thi Thai Duong / Bé Phương + Bé Linh | 552 | 18.960.000 | 2 courses + refer ✓ |

AR-2026-0342: sale sửa AR thêm bé thứ 2 (Bé Linh, gói REFER 9.380.000) lúc 17:48 sau khi tin đầu đã gửi lúc 16:57 → UNIQUE block → phải bắn lại thủ công với nội dung đã merge 2 bé.

---

## Self-check 5 tiêu chí
- **Triệt để:** sửa 1 root cause → mọi đơn "đủ tạm" tương lai đúng cả Tổng + bill; không vá lẻ từng đơn.
- **Không lỗi con:** đơn CK/partial giữ nguyên (received>0); predicate tái dùng `activatable_received`;
  tránh bẫy mock `.in_`; không đụng course amount / logic ghi nhận doanh thu.
- **Không tăng hạ tầng:** 0 bảng/cron/service mới; tái dùng `image_urls` + worker + `source_suffix` sẵn có.
- **Tối ưu token:** BE-only, không build/chạy FE.
- **Bền qua compact:** anchor path:line chính xác, cạm bẫy ghi rõ, task self-contained cho Sonnet.
