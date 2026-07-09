# Fix: AR-created Zalo notification — số điện thoại thiếu đầu số quốc gia (84-)

**Ngày**: 2026-07-06
**Loại**: Bug fix — backend, Python-only (KHÔNG migration, KHÔNG frontend)
**Người báo**: anh Minh (feedback từ nhóm Zalo "IH2 & OFF - Báo tiền")

---

## 1. Vấn đề (ngôn ngữ nghiệp vụ)

Tin nhắn Zalo tự động **"🆕 YÊU CẦU KÍCH HOẠT KHOÁ HỌC — AR-xxxx"** đang hiển thị số điện thoại
khách hàng **thiếu đầu số quốc gia**, chỉ có đuôi số:

```
SĐT: 933903310          ← SAI
```

Kế toán/sale copy số này sang CRM tìm khách thì không ra (CRM lưu dạng `84-933903310`).
Số đúng phải là:

```
SĐT: 84-933903310       ← ĐÚNG
```

Tin **"💰 ĐÃ VÀO"** (payment_paid) đã hiển thị đúng `84-xxx` từ 4/7 — nhưng tin
**AR-created** thì chưa, vì builder của nó bỏ sót bước định dạng số.

## 2. Nguyên nhân gốc (đã xác minh)

`build_activation_request_created_message()` trong
[`backend/utils/zalo_message_builder.py`](../../backend/utils/zalo_message_builder.py) **không gọi**
`format_phone_intl()` — nó in thẳng số thô lấy từ `uid_block["phone"]` / `pr["phone"]`.

- Hàm định dạng đã tồn tại: `format_phone_intl(phone, country)` — [zalo_message_builder.py:82](../../backend/utils/zalo_message_builder.py#L82).
- `build_payment_paid_message` đã dùng nó đúng ([:157](../../backend/utils/zalo_message_builder.py#L157)); AR builder thì quên.
- Chỗ sai cụ thể: dòng ~412 (gán `phone`), ~441 (in `SĐT:`), ~454 (block fallback).

## 3. Phạm vi

**TRONG phạm vi** (chỉ 3 file, thuần Python):
- `backend/utils/zalo_message_builder.py` — builder
- `backend/activation_routes.py` — truyền `country` vào builder
- `backend/tests/test_zalo_builder.py` — test

**NGOÀI phạm vi (KHÔNG đụng):**
- `build_course_activated_message` — **cũng dính lỗi tương tự** nhưng live-path là **SQL trigger**
  (`fn_course_activated_zalo_notify` → migration `2026-07-02-zalo-course-activated-enrich.sql`).
  Sửa nó cần **migration mới + deploy prod** → tách task riêng (xem §7).
- `build_payment_paid_message` — đã đúng, không đụng.
- Frontend — không liên quan (đây chỉ là text tin Zalo).
- SQL / DB trigger / migration — AR-created là **Python-only**, không có bản SQL song song.

## 4. Contract (định dạng đầu ra chính xác — dùng chung cho mọi subagent)

Mọi agent code theo ĐÚNG spec này. Không cần chờ nhau — implement và test cùng bám 1 contract.

### 4.1 Hành vi `format_phone_intl` (đã hand-trace, đừng sửa hàm này)

| Input | country | Output |
|---|---|---|
| `933903310` | VN/None | `84-933903310` |
| `0933903310` | VN/None | `84-933903310` |
| `84933903310` | VN/None | `84-933903310` |
| `84-772333555` | VN/None | `84-772333555` (idempotent) |
| `+84 933 903 310` | VN/None | `84-933903310` |
| `""` / `"  "` / None | any | `None` → hiển thị `?` |
| `?` | any | `?` (giữ nguyên) |
| `0812345678` | TH | `66-812345678` |
| `13800138000` | CN | `86-13800138000` |

### 4.2 Ký tự chống dính dòng (ZWSP U+200B)

Sau MỖI số điện thoại trên dòng `SĐT:` phải chèn `​` (giống payment_paid, [:210](../../backend/utils/zalo_message_builder.py#L210)).
**Lý do**: sau khi fix, số thành dạng `84-xxx` — đúng dạng đã gây lỗi dính dòng ở payment_paid
(Zalo Web auto-link nuốt `\n`). Screenshot hiện tại render đúng nhưng đó là số dạng thô `909692610`
(chưa fix) → không phải bằng chứng cho trạng thái sau fix. Chèn ZWSP là biện pháp phòng thủ, chi phí = 0.

### 4.3 Ví dụ tin sau khi fix (AR-2026-0017 thực tế)

```
🆕 YÊU CẦU KÍCH HOẠT KHOÁ HỌC — AR-2026-0017
SĐT: 84-933903310⁠<ZWSP>
UID: 3313199152
Võ Trâm Anh, (chưa có tên gói)
Nguồn: Quảng cáo · Tiktokshop
Tổng: 8.850.000 VNĐ
Sale: Nguyen Thi Trang · Team Inhouse 2
```

## 5. Thay đổi cụ thể (edit targets)

### Track A — `backend/utils/zalo_message_builder.py` (builder)

**A1.** Trong vòng lặp `for uid_block in uid_blocks:` (~dòng 409-412), thay:
```python
        phone = _first_nonempty(uid_block.get("phone"), pr_phone, default="?")
```
bằng:
```python
        phone_country = _first_nonempty(uid_block.get("country"), pr_data.get("country"))
        phone_fmt = format_phone_intl(
            _first_nonempty(uid_block.get("phone"), pr_phone), phone_country or None
        )
        phone = phone_fmt if phone_fmt else "?"
```
> Ưu tiên `country` cấp uid_block (mỗi UID có thể khác nước) rồi mới tới PR; None → hàm tự default VN.

**A2.** Dòng `SĐT` trong block (~441), thêm ZWSP:
```python
                    f"SĐT: {phone}​",
```

**A3.** Block fallback (không có uid, ~454), thay:
```python
                    f"SĐT: {pr_phone or '?'}",
```
bằng:
```python
                    f"SĐT: {format_phone_intl(pr_phone, pr_data.get('country')) or '?'}​",
```

> `format_phone_intl` đã import cùng module — không cần import thêm.

### Track B — `backend/activation_routes.py` (truyền country)

Trong `_enqueue_activation_request_created_zalo`, dict `pr_data` truyền vào builder (~dòng 1022-1030),
thêm 1 key:
```python
                "country": pr.get("country"),
```
> `pr` lấy từ `_fetch_payment_request` (`select('*')`) nên `pr["country"]` luôn có (mặc định `'VN'`).
> Đây là file độc lập với Track A → chạy song song, không đụng nhau.

### Track C — `backend/tests/test_zalo_builder.py` (test)

**C1.** SỬA test `test_full_data_matches_handoff_sample_format` (dòng 69-78): thêm `​` sau số trong `expected`:
```python
            "SĐT: 84-772333555​\n"
```
(các dòng khác giữ nguyên)

**C2.** THÊM các test mới trong class `TestBuildActivationRequestCreatedMessage` (dùng substring `in` cho SĐT để miễn nhiễm ZWSP, TRỪ khi cần khẳng định exact):
```python
    def test_phone_local_with_leading_zero_normalized_to_intl(self):
        ar = {"id": "AR-T1", "uids_data": [{"uid": "1", "phone": "0933903310",
              "courses": [{"name": "G", "amount": 1_000_000}]}]}
        r = build_activation_request_created_message(ar, {}, {"team": "Inhouse 2"})
        assert "SĐT: 84-933903310" in r["message"]

    def test_phone_local_without_leading_zero_normalized_to_intl(self):
        ar = {"id": "AR-T2", "uids_data": [{"uid": "1", "phone": "933903310",
              "courses": [{"name": "G", "amount": 1_000_000}]}]}
        r = build_activation_request_created_message(ar, {}, {"team": "Inhouse 2"})
        assert "SĐT: 84-933903310" in r["message"]

    def test_phone_already_intl_is_idempotent(self):
        ar = {"id": "AR-T3", "uids_data": [{"uid": "1", "phone": "84-772333555",
              "courses": [{"name": "G", "amount": 1_000_000}]}]}
        r = build_activation_request_created_message(ar, {}, {"team": "Inhouse 2"})
        assert "SĐT: 84-772333555" in r["message"]

    def test_phone_empty_or_none_becomes_question_mark(self):
        ar = {"id": "AR-T4", "uids_data": [{"uid": "1", "phone": "",
              "courses": [{"name": "G", "amount": 1_000_000}]}]}
        r = build_activation_request_created_message(ar, {"phone": None}, {"team": "Inhouse 2"})
        assert "SĐT: ?" in r["message"]

    def test_multi_uid_each_phone_normalized_independently(self):
        ar = {"id": "AR-T5", "uids_data": [
            {"uid": "111", "phone": "0933903310", "courses": [{"name": "A", "amount": 1}]},
            {"uid": "222", "phone": "84-900000002", "courses": [{"name": "B", "amount": 2}]},
        ]}
        r = build_activation_request_created_message(ar, {}, {"team": "Offline"})
        assert "SĐT: 84-933903310" in r["message"]
        assert "SĐT: 84-900000002" in r["message"]

    def test_pr_country_threaded_for_overseas_customer(self):
        ar = {"id": "AR-T6", "uids_data": [{"uid": "1", "phone": "0812345678",
              "courses": [{"name": "G", "amount": 1}]}]}
        pr = {"country": "TH"}
        r = build_activation_request_created_message(ar, pr, {"team": "Offline"})
        assert "SĐT: 66-812345678" in r["message"]

    def test_uid_block_country_overrides_pr_country(self):
        ar = {"id": "AR-T7", "uids_data": [{"uid": "1", "phone": "13800138000",
              "country": "CN", "courses": [{"name": "G", "amount": 1}]}]}
        pr = {"country": "VN"}
        r = build_activation_request_created_message(ar, pr, {"team": "Offline"})
        assert "SĐT: 86-13800138000" in r["message"]
```

## 6. Guardrails (bắt buộc)

1. **KHÔNG mint token Zalo, KHÔNG chạy UAT gửi thật.** Prod + sandbox chung 1 OA → mint = prod chết ~15 phút.
   Verify chỉ bằng `pytest`. (skill `zalo-oa-notifications`)
2. **KHÔNG migration, KHÔNG SQL, KHÔNG frontend.** Nếu agent định đụng → sai phạm vi, dừng.
3. **KHÔNG viết lại `format_phone_intl`** — chỉ gọi nó. Nó là nguồn chân lý duy nhất, mirror với SQL.
4. **KHÔNG đụng** `build_payment_paid_message`, `build_course_activated_message`.
5. Builder **không được raise** (contract §"NEVER raise" đầu file) — `format_phone_intl` an toàn (trả None/raw), OK.
6. `?` / rỗng phải ra `?`, **không** ra `84-?`. (đã trace: input không có chữ số → trả raw)
7. Test chỉ **THÊM** case mới + sửa đúng 1 chuỗi ZWSP; **không** viết lại test cũ.
8. 3 file 3 track độc lập → không tranh chấp file; không cần worktree.

## 7. Follow-up (task riêng, KHÔNG làm trong task này)

`build_course_activated_message` (tin "✅ ĐÃ KÍCH HOẠT THÀNH CÔNG") cũng thiếu `format_phone_intl`,
cả bản Python lẫn bản SQL live. Sửa cần **migration mới** `CREATE OR REPLACE` hàm SQL
`public.build_course_activated_message` + cập nhật bản Python mirror + deploy sandbox→prod.
Blast radius lớn hơn → tách riêng.

## 8. Kế hoạch chạy subagent song song (cho lần chạy Sonnet 4.6)

Spec-first → fan-out 3 track cùng lúc (3 file khác nhau, 0 conflict) → verify gate.

```
Wave 1 (song song, 3 agent):
  Agent A: sửa zalo_message_builder.py theo §5 Track A (A1,A2,A3)
  Agent B: sửa activation_routes.py theo §5 Track B
  Agent C: sửa test_zalo_builder.py theo §5 Track C (C1 + C2)

Wave 2 (verify gate, 1 agent — sau khi A,B,C xong):
  cd backend && python -m pytest tests/test_zalo_builder.py tests/test_lead_source_map.py \
      tests/test_zalo_integration.py -q
  # + grep xác nhận không còn 'SĐT:' nào in số thô trong AR builder
  # Đỏ → fix-forward bám contract §4; KHÔNG sửa contract.
```

Gợi ý Workflow (Sonnet 4.6):
```js
phase('Implement')
await parallel([
  () => agent('Track A: edit zalo_message_builder.py per spec §5 Track A ...', {label:'builder'}),
  () => agent('Track B: edit activation_routes.py per spec §5 Track B ...', {label:'route'}),
  () => agent('Track C: edit test_zalo_builder.py per spec §5 Track C ...', {label:'tests'}),
])
phase('Verify')
await agent('cd backend && python -m pytest tests/test_zalo_builder.py tests/test_lead_source_map.py tests/test_zalo_integration.py -q ; report pass/fail verbatim')
```

## 9. Definition of done

- [ ] `pytest` 3 file trên: PASS toàn bộ (case cũ + 7 case mới).
- [ ] Tin AR-created hiển thị `SĐT: 84-<đuôi số>` cho khách VN; đúng dial code cho khách OV.
- [ ] `?` khi thiếu số; idempotent với số đã `84-`.
- [ ] Không đụng SQL/FE/migration; `format_phone_intl` không bị sửa.
- [ ] Commit gộp 1 (theo feedback squash), message tiếng Việt mô tả nghiệp vụ.
