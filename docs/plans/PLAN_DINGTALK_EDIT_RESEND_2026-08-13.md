# PLAN — DingTalk edit-resend (sale sửa AR → tự gửi tin "cập nhật")

**Ngày:** 2026-08-13 · **Loại:** BE-only feature · **Migration:** 0 · **FE:** 0
**Nguồn chốt nghiệp vụ:** chị Hiền 12/8 — sale sửa đơn đã báo thì hệ thống phải tự bắn tin mới kèm nhãn "cập nhật".
**Trạng thái:** CHỜ DUYỆT — defer thứ 5 (14/8) gom báo cáo feedback tuần cho anh Hiếu chốt trước khi code.

---

## 1. Vấn đề & scope

**Vấn đề:** `PATCH /api/v1/active-requests/{ar_id}` (`activation_routes.py:1948`) chỉ update DB, **không** gọi `_enqueue_activation_request_created_dingtalk`. Sale sửa AR (tên bé/UID/SĐT/gói/tiền) → group team vẫn thấy tin cũ sai. (Nút "báo đơn bổ sung" `:2317` thì CÓ enqueue → không phải vấn đề này.)

**Trong scope:** sửa AR đã báo → gửi 1 tin DingTalk mới, prefix "🔄 SALE VỪA CẬP NHẬT ĐƠN ĐÃ BÁO", **chỉ khi nội dung hiển thị thật sự đổi**.

**NGOÀI scope:** FE, migration, hành vi create/append (giữ nguyên), policy "Tiền vs Tổng"/phí thẻ (chờ Hiếu, việc khác).

---

## 2. Quyết định thiết kế (đã chốt qua điều tra code)

- **T-chống-spam:** so **content-key** của AR *trước* (`current`) vs *sau* (`merged`) — chỉ enqueue khi khác. Lưu-không-đổi → không bắn.
- **T-projection:** content-key = ĐÚNG các trường message DingTalk hiển thị, không hơn không kém. **Gồm:** per-block `[child_label(resolved), phone, country, uid, courses[(name, amount, +refer fields nếu REFER)]]` + footer `lead_source, lead_channel, total(=received>0?received:target), hold_activation, hold_note`. **LOẠI TRỪ** (không hiển thị → không được làm bắn tin): `order_id`, `status`, timestamps, `info_confirmed`, `budget`, `course_count`, và **dòng Sale/Team** (đổi tên NV trong `nhan_su_sale` không được kích hoạt resend). Dùng `child_label` **đã resolve** (`block.name ?? pr.child_name ?? pr.name ?? customer_name`) — KHÔNG dùng `customer_name` thô (chỉ là fallback cuối; sửa customer_name khi block đã có tên → không đổi hiển thị → không bắn).
- **T-suffix:** `source_suffix = ":edit:" + md5(content_key_after)[:12]`. Deterministic → idempotent, né outbox `UNIQUE(source_table, source_id, event_type)` với `source_id = md5(ar_id + suffix)` (`:1292`). KHÔNG đụng suffix create (`""`) / append (`":append:"`).
- **T-nhãn:** prepend chỉ khi `source_suffix.startswith(":edit:")` — KHÔNG dán nhầm lên tin create/append.
- **T-best-effort:** toàn bộ khối resend bọc try/except, **không bao giờ** làm hỏng PATCH (thông báo lỗi thì bỏ qua, giống enqueue gốc).
- **T-gate tái dùng:** resend đi qua nguyên `_enqueue_...` → thừa hưởng gate `is_test / team / active group / event_enabled`. Không mở bề mặt rò tin mới.

---

## 3. Bản đồ code (self-contained — không cần điều tra lại)

| Điểm | Vị trí | Ghi chú |
|---|---|---|
| PATCH endpoint | `backend/activation_routes.py:1948-2110` | Handler lồng trong `@app.patch` (không import trực tiếp được) |
| AR trước sửa | biến `current` `:1974` | Cả 2 nhánh |
| AR sau sửa (nhánh RPC guarded) | biến `merged`, return `:2084` | `pr_map` đã fetch sẵn `:2083` |
| AR sau sửa (nhánh direct) | biến `merged`, return `:2110` | `pr_map` đã fetch sẵn `:2109` |
| Enqueue fn | `_enqueue_activation_request_created_dingtalk` `:1180` | Đã có param `source_suffix=""`; best-effort |
| Điểm build message | gọi builder `:1265`; đọc `result["message"]` `:1293`; hold-block append `:1294-1298` | Prepend nhãn chèn ngay sau `:1293` |
| suffix→source_id | `:1292` `md5(f"{ar_id}{source_suffix}")` | |
| Builder (nguồn sự thật hiển thị) | `backend/utils/zalo_message_builder.py:404` (`build_activation_request_created_message`), body `:452-537` | Projection phải soi theo đây |
| Template mẫu (append) | `:2313-2322` `source_suffix=f":append:{first_new_code}"` | Nhân bản cho `:edit:` |
| Import | `hashlib` `:8`, `uuid` `:13` có sẵn — **`json` CHƯA** → thêm `import json` | |

---

## 4. To-do (nhóm Milestone)

### G1 — Core resend (BE)
- **G1-T1 · `import json`** — thêm dòng import ở đầu `activation_routes.py`.
- **G1-T2 · Helper projection** — thêm module-level `_ar_dingtalk_content_key(ar, pr) -> str` (pure, JSON `sort_keys`) đúng tập trường mục 2, soi theo builder `zalo_message_builder.py:452-537`. Total dùng `received>0?received:target` (parse float, tránh bẫy `"0"` truthy).
- **G1-T3 · Helper quyết định** — thêm module-level `_maybe_enqueue_ar_edit_dingtalk(sb, current, merged, pr_map)`: lấy `pr = pr_map.get(merged.pr_id)`; nếu key(current)≠key(merged) → `sfx=":edit:"+md5(key_after)[:12]` → gọi `_enqueue_...(sb, merged, pr, source_suffix=sfx)`; **bọc try/except**.
- **G1-T4 · Nối 2 exit path** — gọi `_maybe_enqueue_ar_edit_dingtalk(sb, current, merged, pr_map)` ngay **trước return** ở `:2084` (guarded) và `:2110` (direct). KHÔNG gọi ở nhánh conflict 409 (`:2043`).
- **G1-T5 · Prepend nhãn** — trong `_enqueue_...` sau `:1293`: `if source_suffix.startswith(":edit:"): outbox_message = "🔄 SALE VỪA CẬP NHẬT ĐƠN ĐÃ BÁO\n" + outbox_message`.

### G2 — Tests (`backend/tests/test_dingtalk_edit_resend.py` mới)
- **G2-T1 · Unit projection** — `_ar_dingtalk_content_key` pure, KHÔNG `sb`: đổi tên gói/amount/phone/uid/refer → key ĐỔI; đổi `order_id`/`info_confirmed`/`status`/timestamp → key GIỮ NGUYÊN; đổi `customer_name` khi block đã có `name` → key GIỮ NGUYÊN.
- **G2-T2 · Wiring có bắn** — PATCH đổi nội dung → `mock_dt.assert_called_once()` + `call_args.kwargs["source_suffix"].startswith(":edit:")`.
- **G2-T3 · Wiring không bắn** — PATCH lưu nội dung y hệt → `mock_dt.assert_not_called()`.
- **G2-T4 · info_confirmed** — toggle `info_confirmed` đơn thuần → `mock_dt.assert_not_called()`.
- **G2-T5 · Nhãn** — gọi thẳng `_enqueue_...(source_suffix=":edit:xxx")` (patch `dingtalk_event_enabled=True`) → message bắt đầu bằng "🔄 SALE VỪA CẬP NHẬT".

### G3 — Verify & rollout
- **G3-T1 · pytest** — `cd backend && python -m pytest tests/test_dingtalk_edit_resend.py tests/test_dingtalk_ar_created.py tests/test_activation_hold.py -q` (không regression).
- **G3-T2 · Deploy** — push → Render auto-deploy BE.
- **G3-T3 · Smoke prod** — 1 AR team HN có group: sửa tên bé → nhận đúng 1 tin "🔄 cập nhật"; mở sửa lưu lại y nguyên → KHÔNG tin thừa.

---

## 5. Bẫy test (từ learnings + điều tra)

- **KHÔNG dùng `_mock_chain_table`** (`test_dingtalk_ar_created.py:30`) cho PATCH — thiếu `.update()`/`.in_()`. Dùng per-table `table_side` kiểu `test_activation_hold.py:88-105`.
- **Stub né `.in_()`:** `patch("activation_routes._fetch_prs_by_ids")` (né `:652`), `patch("activation_routes._tien_ve_bounds")` (né `:416`).
- **Stub side-effect uids path:** `_sync_ledger_courses_from_uids`, `_writeback_child_uids_to_pr`; nếu body có `uids_data`: thêm `_validate_course_amounts`, `_assert_uids_data_order_ids_unique`, `_derive_status`, `_diff_referral_courses`(→`[]`), `_stamp_order_id_changes`(→`[]`), `_fetch_payment_request`.
- **Stub producer:** `patch("activation_routes._enqueue_activation_request_created_dingtalk") as mock_dt`.
- **Fixtures tái dùng:** `_make_ar_row` (`test_activation_hold.py:12`, base tốt cho `current`), `_sample_pr` (`test_dingtalk_ar_created.py:77`).
- **`source_suffix` là kwarg** (mẫu append `:2321`) → assert trên `call_args.kwargs`.

---

## 6. Rủi ro / edge case (đã cân nhắc — chấp nhận)

| Edge | Hành vi | Đánh giá |
|---|---|---|
| Sale sửa A→B→A→B (revert về nội dung đã báo qua edit) | Lần B thứ 2: `md5` trùng → UNIQUE nuốt → KHÔNG bắn lại | Chấp nhận (nội dung B đã báo 1 lần) |
| Builder đổi format qua deploy | Lần sửa kế tiếp mỗi AR bắn 1 tin dư | 1 lần, hiếm, chấp nhận |
| Handler chạy 2 lần cùng 1 PATCH | `updated_at`/content y hệt → idempotent | An toàn |
| Team không có group / is_test | `_enqueue_...` tự skip (gate gốc) | Không rò tin |

---

## 7. Acceptance
1. Sửa AR đã báo, nội dung hiển thị đổi → group nhận đúng **1** tin, prefix "🔄 SALE VỪA CẬP NHẬT ĐƠN ĐÃ BÁO".
2. Lưu không đổi / chỉ toggle info_confirmed / chỉ đổi order_id → **KHÔNG** tin.
3. create & append **không đổi** hành vi/nhãn.
4. PATCH không bao giờ fail vì lỗi notification.

---

## 8. Deadline

| Mốc | Ai | Khi |
|---|---|---|
| Duyệt scope (feedback tuần) | anh Hiếu | thứ 5 (14/8) |
| Code G1+G2 | dev (Sonnet/Đức/Đạt) | ~0.5 ngày sau duyệt |
| Verify + deploy G3 | dev | cùng ngày |

**Ước lượng:** BE-only, 2 helper + 2 điểm nối + 1 prepend + 5 test ≈ nửa ngày. Không migration, không FE, không downtime.
