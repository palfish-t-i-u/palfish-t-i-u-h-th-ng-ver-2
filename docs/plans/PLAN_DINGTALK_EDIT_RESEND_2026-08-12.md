# PLAN — DingTalk tự gửi tin "CẬP NHẬT" khi sale sửa Active Request (2026-08-12)

**Dự án:** gmv · **Scope:** BE-only · **Migration:** không · **FE:** không đổi
**Trạng thái:** PLAN (chờ chốt lịch — feature, không GẤP theo process feedback tuần)

> Đọc TRƯỚC khi code: `docs/learnings/outbox-unique-source-id-second-business-event.md` — bẫy source_id đã ghi sẵn.

---

## 1. Vấn đề (nghiệp vụ)

Sale báo đơn → DingTalk gửi tin "🆕 YÊU CẦU KÍCH HOẠT" cho nhóm Ops. Sau đó sale **sửa đơn** (thêm bé, thêm gói, đổi số tiền/UID) bằng nút **"Sửa"**. Ops **không nhận được tin nào** về thay đổi → xử lý theo thông tin cũ, hoặc phải hỏi tay.

Chị Thu Hiền (12/8) xác nhận: khi sale sửa đơn đã báo, hệ thống **phải tự gửi tin mới** kèm nhãn "cập nhật" để Ops biết đơn đổi.

Ca thực tế 12/8 (phải bắn tay):
- **AR-2026-0342** — sale thêm bé thứ 2 lúc 17:48 sau khi tin đầu gửi 16:57.
- **AR-2026-0328** — sale sửa lại thông tin.

---

## 2. Root cause (đã trace)

3 đường ghi Active Request, chỉ 2 đường bắn DingTalk:

| Flow | Endpoint | Enqueue DingTalk? | source_suffix |
|------|----------|-------------------|---------------|
| Tạo đơn | `POST /api/v1/active-requests` | ✅ (dòng ~1466) | `""` → `source_id=md5(ar_id)` |
| Báo đơn bổ sung | `POST /api/v1/active-requests/{ar_id}/append` | ✅ (dòng ~2317) | `:append:{first_new_code}` |
| **Sửa đơn** | `PATCH /api/v1/active-requests/{ar_id}` | ❌ **KHÔNG gọi enqueue** | — |

`patch_active_request()` (`backend/activation_routes.py:1948`) cập nhật `uids_data`/`customer_name`/`info_confirmed` nhưng **không có** call `_enqueue_activation_request_created_dingtalk`. Đó là lý do tin không ra.

> Note nội bộ ghi "UNIQUE block" là hơi lệch chẩn đoán — thực tế edit không enqueue *gì cả*. NHƯNG cảnh báo đúng hướng: nếu thêm enqueue với `suffix=""` thì `source_id` = md5(ar_id) trùng tin tạo → `UNIQUE(source_table, source_id, event_type)` nuốt im. Vì vậy fix **bắt buộc** dùng source_suffix riêng cho mỗi lần sửa.

FE: nút "Sửa" gọi `api.patch(/api/v1/active-requests/${arId})` (`frontend/src/lib/api.ts:213`) — tách biệt hẳn `/append` (dòng 236). Fix nằm hoàn toàn ở BE, FE không cần đổi.

---

## 3. Thiết kế

### 3.1 Nguyên tắc
- **Chỉ gửi khi nội dung tin thay đổi** — so nội dung uids_data *chiếu lên field mà tin DingTalk hiển thị* (bé/UID/phone/gói/tiền). Sửa `info_confirmed` hay lưu-không-đổi → **không** gửi (chống spam).
- **source_suffix xác định theo nội dung mới**: `:edit:{md5(content_key)[:12]}`. Deterministic → retry cùng nội dung idempotent; nội dung khác = source_id khác = tin lọt. Khác hẳn `""` (tin tạo) và `:append:*`.
- **Nhãn "cập nhật"** prepend lên đầu tin để Ops phân biệt với đơn mới (theo tiền lệ marker `hold_activation` dòng 1294–1298 — post-process message, KHÔNG đụng builder chung với Zalo).
- **Tái dùng toàn bộ** `_enqueue_activation_request_created_dingtalk`: gate is_test / DINGTALK_DISABLED_EVENTS / team-có-group / gom bill — không viết lại.
- **Không query DB mới** ở tầng detect (thuần Python) → tránh vỡ mock test (bài học du-tam: mock không support `.in_()`).

### 3.2 Phạm vi trigger (v1)
- ✅ Trigger khi `body.uids_data` được gửi VÀ content_key mới ≠ cũ.
- ⛔ KHÔNG trigger khi chỉ sửa `customer_name` hoặc `info_confirmed` (uids_data = None).
  - *Open question cho Thu Hiền:* có cần gửi khi đổi customer_name không? v1 tạm bỏ (ít material, tên bé trong tin lấy từ PR/uids). Ghi backlog.
- Referral thay đổi (order_id/số buổi): v1 chỉ bắt nếu nó làm đổi (code, name, amount) của course. Referral-only-change = edge, ghi backlog.

---

## 4. Thay đổi code (chính xác)

### 4.1 `backend/activation_routes.py` — helper content-key (mới)

Thêm gần các helper `_derive_status` / `_diff_referral_courses` (đầu file, cùng cụm helper AR). Projection **mirror đúng** field builder render (`build_activation_request_created_message`: `course.get("name")` dòng 474, `course.get("amount")` dòng 477; block `uid`/`name`/`phone`/`country`):

```python
def _ar_notify_content_key(uids_data: list[Any] | None) -> str:
    """Chiếu uids_data lên các field mà tin DingTalk activation_request_created
    HIỂN THỊ (bé/UID/phone/gói/tiền). Dùng cho: (1) phát hiện đổi nội dung,
    (2) source_suffix idempotent. KHÔNG gồm order_id/stamp nội bộ để tránh
    báo động giả khi lưu lại mà nội dung tin không đổi."""
    norm: list[Any] = []
    for b in (uids_data or []):
        if not isinstance(b, dict):
            continue
        courses = []
        for c in (b.get("courses") or []):
            if not isinstance(c, dict):
                continue
            amt = c.get("amount")
            try:
                amt = round(float(amt), 2) if amt not in (None, "") else None
            except (TypeError, ValueError):
                amt = None
            courses.append([c.get("code"), c.get("name"), amt])
        courses.sort(key=lambda x: json.dumps(x, ensure_ascii=False, sort_keys=True))
        norm.append([
            (b.get("uid") or "").strip() if isinstance(b.get("uid"), str) else b.get("uid"),
            b.get("name"), b.get("phone"), b.get("country"), courses,
        ])
    norm.sort(key=lambda x: json.dumps(x, ensure_ascii=False, sort_keys=True))
    return json.dumps(norm, ensure_ascii=False, sort_keys=True)
```

Kiểm import: `json`, `hashlib`, `Any` đã có ở đầu file (grep xác nhận trước khi thêm).

### 4.2 `_enqueue_activation_request_created_dingtalk` — thêm param `edit_update`

Signature (dòng ~1180):
```python
def _enqueue_activation_request_created_dingtalk(
    sb, saved_ar: dict[str, Any], pr: dict[str, Any] | None, source_suffix: str = "",
    hold_activation: bool = False, hold_note: str | None = None,
    edit_update: bool = False,   # NEW
) -> None:
```

Post-process message (chỗ dựng `outbox_message`, dòng ~1293, TRƯỚC block `hold_activation`):
```python
outbox_message = result["message"]
if edit_update:
    outbox_message = (
        "🔄 SALE VỪA CẬP NHẬT ĐƠN ĐÃ BÁO — XEM LẠI\n"
        "(nội dung đơn thay đổi so với lần báo trước)\n\n"
        + outbox_message
    )
if hold_activation:
    ...
```

### 4.3 `patch_active_request` — enqueue ở CẢ 2 return path

Trong block `if body.uids_data is not None:` (dòng ~1985), ngay sau `uids_data = [uid.model_dump() ...]` (dòng 1988), tính flag 1 lần:
```python
_edit_old_key = _ar_notify_content_key(current.get("uids_data"))
_edit_new_key = _ar_notify_content_key(uids_data)
_edit_should_notify = _edit_new_key != _edit_old_key
_edit_notify_suffix = ":edit:" + hashlib.md5(_edit_new_key.encode("utf-8")).hexdigest()[:12]
```
Khởi tạo `_edit_should_notify = False`, `_edit_notify_suffix = ""` ở đầu hàm (trước mọi return) để 2 path an toàn.

**Path guarded** (optimistic-lock, return sớm dòng ~2084) — chèn TRƯỚC `return _serialize_ar(merged, ...)`:
```python
if _edit_should_notify:
    _enqueue_activation_request_created_dingtalk(
        sb, merged, pr_map.get(str(merged.get("pr_id") or "")),
        source_suffix=_edit_notify_suffix, edit_update=True,
    )
return _serialize_ar(merged, pr_map.get(...), tien_ve=...)
```

**Path plain** (không optimistic-lock, return dòng ~2110) — chèn TRƯỚC `return`:
```python
if _edit_should_notify:
    _enqueue_activation_request_created_dingtalk(
        sb, merged, pr_map.get(str(merged.get("pr_id") or "")),
        source_suffix=_edit_notify_suffix, edit_update=True,
    )
return _serialize_ar(merged, pr_map.get(...), tien_ve=...)
```

`merged` = AR đầy đủ sau cập nhật (uids_data full) → tin hiển thị TOÀN đơn sau sửa (khác `/append` chỉ hiện bé mới). `pr_map` đã fetch sẵn ngay trên mỗi return → không query thêm. PR None (AR không gắn PR) → enqueue tự skip (đã có guard `if pr is None: return`).

---

## 5. Tests — `backend/tests/test_dingtalk_ar_edit_notify.py` (mới)

Mock kiểu `test_dingtalk_ar_created.py`. Case:
1. PATCH thêm 1 course → enqueue gọi 1 lần, `edit_update=True`, message chứa "🔄 SALE VỪA CẬP NHẬT", source_id = md5(ar_id+`:edit:`+hash).
2. PATCH uids_data content y hệt (chỉ khác order_id/stamp) → **không** enqueue.
3. PATCH chỉ `customer_name` / `info_confirmed` (uids_data None) → **không** enqueue.
4. 2 lần sửa nội dung khác nhau → 2 source_id khác nhau (không đụng UNIQUE).
5. Sửa về đúng nội dung tin tạo → source_id (`:edit:`) VẪN khác source_id tạo (`""`) → có gửi (tài liệu hóa phân biệt tạo≠sửa).
6. AR `is_test` → không enqueue (gate cũ).
7. `_ar_notify_content_key`: bỏ order_id/order_id_updated_at không đổi key; đổi amount/name/code/uid/thêm bé → đổi key.

Regression: `test_dingtalk_ar_created.py`, `test_zalo_builder.py` vẫn xanh (append/create không đổi hành vi — param mới default False).

---

## 6. Verify / Deploy / Rollback

**Verify local:**
```bash
cd backend && python -m pytest tests/test_dingtalk_ar_edit_notify.py tests/test_dingtalk_ar_created.py -q
grep -n "edit_update\|_ar_notify_content_key\|_edit_notify_suffix" backend/activation_routes.py
```

**Verify sandbox (sau deploy):** tạo AR test (email @dev) → sửa thêm gói qua PATCH → check `dingtalk_outbox` có row `activation_request_created` source_id mới, message có "🔄 CẬP NHẬT"; sửa lại y hệt → không thêm row.

**Deploy:** BE Render (`bash scripts/deploy.sh sandbox` → soak → prod). `event_type='activation_request_created'` đã nằm trong CHECK (flow tạo đã dùng live) → **không migration**.

**Rollback:** revert 1 commit. Không data/schema thay đổi → an toàn tuyệt đối. Tệ nhất quay lại hiện trạng (edit không bắn tin).

---

## 7. Đánh giá 5 tiêu chí
- **Triệt để:** bắt mọi sửa làm đổi nội dung tin (thêm bé/gói, đổi tiền/UID/tên gói) ở cả 2 path PATCH.
- **Không lỗi con:** source_suffix riêng → không đụng UNIQUE tin tạo/append; detect content → không spam lưu-không-đổi; PR None tự skip.
- **Không tăng hạ tầng:** 0 query mới, 0 migration, 0 FE, tái dùng worker+enqueue sẵn.
- **Token/context:** plan self-contained, code before/after nguyên văn, anchor bằng tên hàm.
- **Bền vững:** khớp learning note sẵn có; marker theo tiền lệ hold_activation.
