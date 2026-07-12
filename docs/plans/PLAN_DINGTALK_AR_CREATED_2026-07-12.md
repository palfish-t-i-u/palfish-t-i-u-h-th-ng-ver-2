# PLAN — Định tuyến lại thông báo: AR-created sang DingTalk, tắt payment_paid trên DingTalk

> ✅ **DONE** — merged main 12/7 (efc2da1, 2c00be7). Giao Sonnet 4.6 medium. Điều tra nền: `docs/plans/DIEU_TRA_AR_CREATED_DELIVERY_2026-07-12.md`.
> Lập 2026-07-12 sau khi chốt yêu cầu với chủ dự án (anh Jacob).

## 0. Bối cảnh 1 dòng
Chủ dự án chốt định tuyến thông báo cuối cùng:
- **Zalo**: `payment_paid` (tiền về) + `bill_uploaded` (ảnh bill). — **giữ nguyên, KHÔNG đụng.**
- **DingTalk**: `activation_request_created` (yêu cầu kích hoạt) + `activation_urgent_reminder` (yêu cầu gấp) + `course_activated` (kích hoạt thành công).

Điều tra cho thấy **urgent + course_activated đã bắn DingTalk sẵn** (không đụng). Chỉ còn **2 lệch** cần sửa:
1. `payment_paid` đang bắn **cả DingTalk** (trigger `trg_payment_paid_dingtalk` active + worker đã bật) → **phải TẮT trên DingTalk**.
2. `activation_request_created` đang **tắt cả 2 kênh** → **phải BẬT trên DingTalk**.

## 1. Ràng buộc BẮT BUỘC (đọc kỹ, đây là nơi dễ sai)

1. **Team convention của DingTalk = RAW team** (giá trị `nhan_su_sale.team` nguyên bản), **KHÔNG** dùng `get_canonical_team`. Bằng chứng: trigger `fn_payment_paid_dingtalk_notify` / `fn_course_activated_dingtalk_notify` tra `dingtalk_team_groups.team_code = ns.team` (raw); và bảng config `dingtalk_team_groups` đang lưu key **`HN Offline Store`** (raw) — trong khi `get_canonical_team("HN Offline Store")` trả `"Offline"` (KHÔNG có group). Dùng canonical là **sai**, mất tin của team Offline.
2. **KHÔNG có OPS fallback cho AR-created.** Chủ dự án chỉ muốn **3 team HN** nhận tin: `Inhouse 1`, `Inhouse 2`, `HN Offline Store`. Team khác (HCM, Khác…) → **skip, không bắn**. (Khác với `activation_urgent_reminder` — cái đó cố tình fallback về `OPS_GROUP_TEAM_CODE="Inhouse 2"`; **đừng** copy fallback đó vào AR-created.)
3. **Producer phải best-effort, KHÔNG raise.** Lỗi enqueue DingTalk tuyệt đối không được làm hỏng việc tạo Active Request. Bọc `try/except` toàn hàm, `print` + return.
4. **DingTalk outbox không có cột ảnh** → AR-created trên DingTalk là **text-only**, KHÔNG kèm `image_url` (khác producer Zalo).
5. **KHÔNG đụng**: producer Zalo `_enqueue_activation_request_created_zalo` (giữ nguyên, nó vẫn early-return vì gate `ZALO_ENABLED_EVENTS`), `activation_urgent_reminder`, `course_activated`, trigger `trg_payment_paid_zalo`, và `ZALO_ENABLED_EVENTS`.

## 2. Thay đổi #1 — Migration (tạo file mới)

Tạo `backend/migrations/2026-07-12-dingtalk-ar-created-and-drop-payment-paid.sql`:

```sql
-- backend/migrations/2026-07-12-dingtalk-ar-created-and-drop-payment-paid.sql
-- Định tuyến lại thông báo (chốt 2026-07-12):
--   (1) Cho phép event activation_request_created vào dingtalk_outbox
--   (2) Ngừng bắn payment_paid sang DingTalk (giữ nguyên Zalo)
-- Target: PRODUCTION (jozcvbbypwvzaefteoxn) + sandbox (pxgybyfiwywksesyogti)
-- Note: Apply sandbox trước, smoke-test, rồi prod.

-- (1) Mở CHECK constraint — thêm activation_request_created, GIỮ payment_paid (còn dùng cho row cũ + có thể bật lại)
ALTER TABLE public.dingtalk_outbox DROP CONSTRAINT IF EXISTS dingtalk_outbox_event_type_check;
ALTER TABLE public.dingtalk_outbox ADD CONSTRAINT dingtalk_outbox_event_type_check
  CHECK (event_type = ANY (ARRAY[
    'payment_paid'::text,
    'course_activated'::text,
    'activation_urgent_reminder'::text,
    'activation_request_created'::text]));

-- (2) Tắt payment_paid trên DingTalk — chỉ DROP TRIGGER, GIỮ function (dễ bật lại).
--     Trigger Zalo trg_payment_paid_zalo KHÔNG đụng.
DROP TRIGGER IF EXISTS trg_payment_paid_dingtalk ON public.payment_lines;
```

> **Áp dụng migration KHÔNG thuộc phạm vi Sonnet.** Sonnet chỉ tạo file. Việc apply vào DB (sandbox → prod) do người phụ trách chạy qua Supabase (MCP `apply_migration` hoặc SQL editor). Ghi rõ điều này trong PR/summary.

## 3. Thay đổi #2 — Producer DingTalk cho AR-created

File `backend/activation_routes.py`. **Imports đã đủ** (`hashlib`, `uuid`, `build_activation_request_created_message`) — không thêm import.

### 3a. Thêm hàm mới ngay SAU `_enqueue_activation_request_created_zalo` (sau dòng ~1088)

```python
def _enqueue_activation_request_created_dingtalk(
    sb, saved_ar: dict[str, Any], pr: dict[str, Any] | None
) -> None:
    """Enqueue DingTalk 'activation_request_created' (best-effort, NEVER raises).

    Routing = RAW sale team (khớp trigger + bảng dingtalk_team_groups), KHÔNG
    canonical hoá, KHÔNG OPS fallback — chỉ 3 team HN có group mới nhận tin;
    team khác thì skip. DingTalk outbox không có cột ảnh → text-only.
    """
    try:
        if pr is None:
            return
        if pr.get("is_test") or saved_ar.get("is_test"):
            return

        sale_email = str(pr.get("sale_email") or "").strip().lower()
        if not sale_email:
            return

        staff_res = (
            sb.table("nhan_su_sale")
            .select("email, display_name, crm_name, team")
            .ilike("email", sale_email)
            .limit(1)
            .execute()
        )
        staff = staff_res.data[0] if staff_res.data else None
        team = (staff or {}).get("team") or ""
        if not team:
            print(f"[dingtalk] activation_request_created skip: sale {sale_email} has no team")
            return

        # RAW team — KHÔNG get_canonical_team. Skip nếu team không có group (KHÔNG fallback).
        g = (
            sb.table("dingtalk_team_groups")
            .select("team_code, is_active")
            .eq("team_code", team)
            .limit(1)
            .execute()
        )
        if not g.data or not g.data[0].get("is_active"):
            print(f"[dingtalk] activation_request_created skip: no active group for team {team!r}")
            return
        team_code = g.data[0]["team_code"]

        pr_target, _ = _pr_amounts(pr)
        result = build_activation_request_created_message(
            {
                "id": saved_ar.get("id"),
                "customer_name": saved_ar.get("customer_name"),
                "uids_data": saved_ar.get("uids_data"),
            },
            {
                "id": pr.get("id"),
                "name": pr.get("name"),
                "child_name": pr.get("child_name"),
                "phone": pr.get("phone"),
                "country": pr.get("country") or "VN",
                "lead_source": pr.get("lead_source"),
                "lead_channel": pr.get("lead_channel"),
                "target": pr_target,
            },
            {
                "display_name": (staff or {}).get("display_name"),
                "crm_name": (staff or {}).get("crm_name"),
                "team": team,
            },
        )

        ar_id = str(saved_ar.get("id") or "")
        source_uuid = str(uuid.UUID(hashlib.md5(ar_id.encode()).hexdigest()))
        try:
            sb.table("dingtalk_outbox").insert(
                {
                    "event_type": "activation_request_created",
                    "source_table": "active_requests",
                    "source_id": source_uuid,
                    "team_code": team_code,
                    "message": result["message"],
                }
            ).execute()
        except Exception as exc:
            msg = str(exc).lower()
            if "duplicate" in msg or "unique" in msg:
                pass  # idempotent — UNIQUE(source_table, source_id, event_type)
            else:
                raise
    except Exception as exc:
        print(f"[dingtalk] activation_request_created enqueue failed (non-fatal): {exc}")
```

### 3b. Gọi hàm trong `_save_active_request` (dòng ~1180)

Tìm:
```python
    _enqueue_activation_request_created_zalo(sb, saved, pr)
    return saved, pr
```
Sửa thành:
```python
    _enqueue_activation_request_created_zalo(sb, saved, pr)
    _enqueue_activation_request_created_dingtalk(sb, saved, pr)
    return saved, pr
```

## 4. Thay đổi #3 — Test (tạo file mới)

Tạo `backend/tests/test_dingtalk_ar_created.py` (mirror `TestEnqueueActivationRequestCreatedZalo` trong `test_zalo_integration.py` nhưng cho kênh DingTalk):

```python
"""DingTalk activation_request_created producer — unit tests.

Mirror TestEnqueueActivationRequestCreatedZalo nhưng cho DingTalk:
RAW team routing (không canonical), KHÔNG OPS fallback, text-only, best-effort.
"""
import hashlib
import uuid
from unittest.mock import MagicMock

import activation_routes


def _mock_chain_table(data):
    t = MagicMock()
    for m in ("select", "eq", "ilike", "order", "limit"):
        getattr(t, m).return_value = t
    t.execute.return_value = MagicMock(data=data)
    return t


def _build_dt_sb(*, staff_rows=None, group_rows=None, insert_side_effect=None):
    outbox_calls = []

    def _outbox_insert(payload):
        if insert_side_effect is not None:
            raise insert_side_effect
        outbox_calls.append(payload)
        m = MagicMock()
        m.execute.return_value = MagicMock(data=[payload])
        return m

    outbox_table = MagicMock()
    outbox_table.insert = _outbox_insert

    tables = {
        "nhan_su_sale": _mock_chain_table(staff_rows or []),
        "dingtalk_team_groups": _mock_chain_table(group_rows or []),
        "dingtalk_outbox": outbox_table,
    }
    sb = MagicMock()
    sb.table.side_effect = lambda name: tables.get(name, MagicMock())
    return sb, outbox_calls


def _sample_saved_ar(**overrides):
    base = {
        "id": "AR-2026-9001",
        "is_test": False,
        "customer_name": None,
        "uids_data": [
            {"uid": "123", "phone": "84-900000000",
             "courses": [{"name": "Gói A", "amount": 5_000_000}]}
        ],
    }
    base.update(overrides)
    return base


def _sample_pr(**overrides):
    base = {
        "id": "PR-2026-9001",
        "is_test": False,
        "sale_email": "sale@test.com",
        "name": None,
        "child_name": "Bé An",
        "phone": None,
        "lead_source": None,
        "lead_channel": "Facebook",
        "tong_tien_phai_thu": 5_000_000,
    }
    base.update(overrides)
    return base


class TestEnqueueActivationRequestCreatedDingtalk:
    def test_happy_path_raw_team_text_only(self):
        # Team "HN Offline Store": canonical là "Offline" (KHÔNG có group) →
        # test này chứng minh producer dùng RAW team, không canonical.
        sb, calls = _build_dt_sb(
            staff_rows=[{"email": "sale@test.com", "display_name": "Sale A",
                         "crm_name": "Sale A CRM", "team": "HN Offline Store"}],
            group_rows=[{"team_code": "HN Offline Store", "is_active": True}],
        )
        activation_routes._enqueue_activation_request_created_dingtalk(
            sb, _sample_saved_ar(), _sample_pr())
        assert len(calls) == 1
        p = calls[0]
        assert p["event_type"] == "activation_request_created"
        assert p["source_table"] == "active_requests"
        assert p["team_code"] == "HN Offline Store"          # RAW, không phải "Offline"
        assert "image_url" not in p                            # text-only
        assert p["source_id"] == str(uuid.UUID(hashlib.md5(b"AR-2026-9001").hexdigest()))
        assert "🆕 YÊU CẦU KÍCH HOẠT KHOÁ HỌC — AR-2026-9001" in p["message"]
        assert "Bé An, Gói A" in p["message"]

    def test_skip_when_team_has_no_group_no_ops_fallback(self):
        sb, calls = _build_dt_sb(
            staff_rows=[{"email": "sale@test.com", "team": "HCM (Online)"}],
            group_rows=[],  # không group → skip (KHÔNG fallback về Inhouse 2)
        )
        activation_routes._enqueue_activation_request_created_dingtalk(
            sb, _sample_saved_ar(), _sample_pr())
        assert calls == []

    def test_skip_when_group_inactive(self):
        sb, calls = _build_dt_sb(
            staff_rows=[{"email": "sale@test.com", "team": "Inhouse 1"}],
            group_rows=[{"team_code": "Inhouse 1", "is_active": False}],
        )
        activation_routes._enqueue_activation_request_created_dingtalk(
            sb, _sample_saved_ar(), _sample_pr())
        assert calls == []

    def test_skip_when_pr_is_test(self):
        sb, calls = _build_dt_sb(
            staff_rows=[{"email": "sale@test.com", "team": "Inhouse 1"}],
            group_rows=[{"team_code": "Inhouse 1", "is_active": True}],
        )
        activation_routes._enqueue_activation_request_created_dingtalk(
            sb, _sample_saved_ar(), _sample_pr(is_test=True))
        assert calls == []

    def test_skip_when_saved_ar_is_test(self):
        sb, calls = _build_dt_sb(
            staff_rows=[{"email": "sale@test.com", "team": "Inhouse 1"}],
            group_rows=[{"team_code": "Inhouse 1", "is_active": True}],
        )
        activation_routes._enqueue_activation_request_created_dingtalk(
            sb, _sample_saved_ar(is_test=True), _sample_pr())
        assert calls == []

    def test_skip_when_pr_is_none(self):
        sb, calls = _build_dt_sb()
        activation_routes._enqueue_activation_request_created_dingtalk(
            sb, _sample_saved_ar(), None)
        assert calls == []

    def test_skip_when_sale_has_no_team(self):
        sb, calls = _build_dt_sb(staff_rows=[{"email": "sale@test.com", "team": None}])
        activation_routes._enqueue_activation_request_created_dingtalk(
            sb, _sample_saved_ar(), _sample_pr())
        assert calls == []

    def test_insert_error_is_non_fatal(self):
        sb, calls = _build_dt_sb(
            staff_rows=[{"email": "sale@test.com", "team": "Inhouse 1"}],
            group_rows=[{"team_code": "Inhouse 1", "is_active": True}],
            insert_side_effect=Exception("boom"),
        )
        activation_routes._enqueue_activation_request_created_dingtalk(
            sb, _sample_saved_ar(), _sample_pr())  # KHÔNG được raise
        assert calls == []
```

## 5. Chạy test (bắt buộc pass trước khi báo xong)

```bash
cd backend && python -m pytest tests/test_dingtalk_ar_created.py -q
cd backend && python -m pytest tests/test_zalo_integration.py tests/test_zalo_builder.py tests/test_dingtalk_outbox_worker.py -q
```
Tất cả phải xanh. (Không cần `tsc` — thay đổi thuần backend Python.)

## 6. Cập nhật index
- `MODULES.md`: mục thông báo Zalo/DingTalk — thêm 2 file mới (`backend/migrations/2026-07-12-dingtalk-ar-created-and-drop-payment-paid.sql`, `backend/tests/test_dingtalk_ar_created.py`).

## 7. Định nghĩa "XONG" (acceptance)
- [ ] Migration file tạo đúng nội dung mục 2.
- [ ] Hàm `_enqueue_activation_request_created_dingtalk` thêm đúng mục 3a, dùng **RAW team**, **không** OPS fallback, **không** `image_url`, best-effort không raise.
- [ ] Call site dòng ~1180 gọi thêm hàm mới (mục 3b).
- [ ] File test mới pass; test regression Zalo/worker vẫn pass (mục 5).
- [ ] `MODULES.md` cập nhật.
- [ ] KHÔNG chạm: `_enqueue_activation_request_created_zalo`, `ZALO_ENABLED_EVENTS`, urgent reminder, course_activated, trigger Zalo.
- [ ] Summary/PR ghi rõ: **migration cần được apply thủ công (sandbox→prod)** và sau apply thì (a) payment_paid ngừng vào DingTalk, (b) AR-created bắt đầu vào DingTalk cho 3 team HN.

## 8. Ngoài phạm vi (KHÔNG làm trong task này)
- Không apply migration lên DB (người phụ trách làm).
- Không sửa routing `activation_urgent_reminder` (đang chạy đúng nhờ OPS fallback = Inhouse 2 → group VN-HN IH2+Offline).
- Không đổi payment_paid / bill_uploaded trên Zalo.
- Không thêm feature flag mới, không thêm worker/bảng/cron.
