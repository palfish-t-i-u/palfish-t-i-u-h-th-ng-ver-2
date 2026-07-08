# DingTalk Group Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tự động đẩy thông báo (payment paid, course activated, activation urgent reminder) lên nhóm DingTalk theo team, song song kênh Zalo hiện tại.

**Architecture:** Mirror toàn bộ pipeline Zalo nhưng đơn giản hơn — DingTalk không cần OAuth refresh token; mỗi nhóm có 1 robot riêng với webhook URL + secret. BE: bảng `dingtalk_team_groups` + `dingtalk_outbox` + triggers PG enqueue song song với Zalo. Worker poll outbox, sign HmacSHA256, POST tới `oapi.dingtalk.com/robot/send`. FE: 3 admin tab mirror Zalo (Cấu hình, Nhóm, Outbox).

**Tech Stack:** Python 3 / FastAPI / httpx / Supabase Postgres triggers / React 19 / TypeScript / Pytest.

---

## Decision Record — 7/7/2026 (hands-on testing lần 1)

### Webhook Robot → KHÔNG khả thi

Custom Robot (webhook) đã bị DingTalk **deprecated 10/2023** — không tạo mới được. Plan ban đầu (webhook approach) cần rewrite.

### Enterprise Robot API — hướng đúng, nhưng group bị chặn

Đã tạo Enterprise Internal App "GMV_Notifier" trong org "PalFish GMV Test":
- **1:1 messages**: HOẠT ĐỘNG — `POST api.dingtalk.com/v1.0/robot/oToMessages/batchSend`
- **Group messages**: BỊ CHẶN — robot không hiện trong Group Robot Management

**Root cause**: Org "PalFish GMV Test" = **Standard (free) + Uncertified**. DingTalk yêu cầu org đã **xác thực doanh nghiệp** (certified) để Enterprise Robot hiện trong group.

### Credentials (test org + VN org)

- **Test org** (PalFish GMV Test): Client ID `dingjfbmnl6zrujipa4k`
- **VN org** (Palfish Vietnam): Client ID `dinguif7zs8jf7pxykez`
- User IDs: Minh `235717171365-1572920914`, 秋贤 `235719672202-176110588`
- Access token endpoint: `POST api.dingtalk.com/v1.0/oauth2/accessToken` (expires 2h)

---

## Decision Record — 8/7/2026 (nghiên cứu chuyên sâu + quyết định anh Hiếu)

### Xác nhận cả 2 org đều bị chặn

Đã test trên cả 2 org:
- **PalFish GMV Test** (test org) → Uncertified → robot KHÔNG hiện trong Group Robot Management
- **Palfish Vietnam** (VN org) → Uncertified → CÙNG hiện tượng

Cả 2 org đều là **Standard (free) + Uncertified (未认证)**. Group type đúng (Enterprise Group / Internal Group), app đã publish thành công.

### Phương án bị loại bỏ

| Phương án | Lý do loại |
|-----------|-----------|
| **Dùng org PalFish TQ (北京读我科技有限公司)** | Robot chỉ hoạt động trong group của CÙNG org. Các nhóm thông báo (báo kích hoạt khóa học, v.v.) thuộc org **Palfish Vietnam**, không phải org TQ → không dùng được |
| **1:1 messages thay group** | Vô dụng — không đáp ứng yêu cầu gửi tin nhắn vào **nhóm** DingTalk. Mỗi user phải nhắn robot trước, và tin nhắn riêng lẻ không ai đọc |
| **RPA (VPS + DingTalk desktop)** | Không đáp ứng request dồn dập (burst notifications). Phải tải ảnh bill từ GMV/database để đính kèm. DingTalk không có bản web (chỉ desktop/mobile). Chi phí VPS rẻ (~pikamc.vn) nhưng giải pháp quá mong manh cho production |

### Phương án còn lại: Xác thực doanh nghiệp (Enterprise Certification)

**Chi phí**: 299 CNY/năm (~1 triệu VNĐ)
**Thời gian duyệt**: 1-3 ngày làm việc
**Yêu cầu**: Giấy phép kinh doanh + CMND/CCCD người đại diện pháp luật

**Hỗ trợ doanh nghiệp nước ngoài**: DingTalk chấp nhận giấy phép kinh doanh Việt Nam cho xác thực 中级认证 (trung cấp). Palfish Vietnam dùng giấy phép KD VN.

**Lưu ý**: Nếu org PalFish TQ đã dùng giấy phép KD TQ, chi nhánh VN phải dùng giấy phép KD VN riêng (1 giấy phép/org).

### ⚠️ CẢNH BÁO: Không chắc chắn 100% certification sẽ fix

Bằng chứng xác thực sẽ mở robot cho group đến từ:
- **Community Q&A** trên DingTalk developer forums — nhiều người báo cùng triệu chứng, và nói certification fix
- **Loại suy** — trang xác thực liệt kê nhiều tính năng nâng cao cho org certified

Tuy nhiên:
- **Bảng quyền lợi xác thực chính thức** (official certification benefits) KHÔNG liệt kê "robot" hay "group robot" trong danh sách quyền lợi
- **Tài liệu tiếng Anh chính thức** (help.dingtalk.io) KHÔNG đề cập certification là điều kiện tiên quyết để thêm bot vào group. Chỉ yêu cầu: configure bot + publish app + Internal Group
- Chưa có nguồn **chính thức (official)** xác nhận rõ ràng

→ **Đã liên hệ DingTalk support** để xác nhận trước khi chi tiền (xem mục Liên hệ bên dưới).

### Quyết định anh Hiếu (8/7/2026)

> "Thì xác thực doanh nghiệp thôi, 1tr rẻ mà"

**→ APPROVED**: Tiến hành xác thực doanh nghiệp cho org Palfish Vietnam. Chờ DingTalk support xác nhận rồi nhờ chị Trang (admin org) submit.

### Pricing tiers (DingTalk for Business)

| Tier | Giá/năm | API calls/tháng | Robot in group? |
|------|---------|-----------------|----------------|
| Standard (free) | 0 | 10,000 | CÓ nếu org **certified** (5,000 Webhook/Stream calls) |
| Professional | ¥9,800 | 500,000 | Có |
| Exclusive | custom | custom | Có |

**Kết luận quan trọng**: Standard edition CÓ hỗ trợ robot (5,000 calls/tháng miễn phí). Vấn đề KHÔNG phải tier trả phí — mà là **certification**.

### Liên hệ DingTalk support

- **Email chính thức**: `questions@service.dingtalk.com` (từ footer dingtalk.io)
- **Form liên hệ**: Đã submit form trên `dingtalk-global.com/contact` (site hợp lệ của Alibaba Group) — 8/7/2026
- **Nội dung hỏi**: Xác nhận certification có mở tính năng Enterprise Robot trong group không

### Hướng dẫn chị Trang submit xác thực

1. Đăng nhập DingTalk Admin Console → Tổ chức → Xác minh doanh nghiệp
2. Quét QR bằng DingTalk mobile (admin account)
3. Chọn **中级认证** (trung cấp) — phù hợp doanh nghiệp nước ngoài
4. Upload: Giấy phép kinh doanh VN + CMND/CCCD người đại diện
5. Thanh toán 299 CNY (~1 triệu VNĐ)
6. Chờ 1-3 ngày làm việc → DingTalk duyệt

### Rate limits

- Robot: max **20 messages/phút** — vượt quá bị throttle 10 phút
- Standard tier: **5,000 calls/tháng** (~165 msg/ngày) — đủ cho traffic hiện tại PalFish
- Không có tài liệu chính thức nào của DingTalk đề cập spam detection cho việc gõ tin nhắn thủ công/RPA

### Tài liệu tham khảo

- Biểu phí + yêu cầu xác minh: tài liệu AliDocs (user đã xem trực tiếp trên mobile DingTalk)
- DingTalk Developer Console: `https://open-dev.dingtalk.com`
- DingTalk English docs: `https://help.dingtalk.io/open/dingstart/basic-concepts-beta`
- DingTalk contact (Alibaba): `https://dingtalk-global.com/contact`
- DingTalk support email: `questions@service.dingtalk.com`

### Next steps

1. **Chờ DingTalk support trả lời** xác nhận certification fix robot-in-group
2. Nếu xác nhận → nhờ chị Trang submit xác thực org Palfish Vietnam
3. Sau khi org certified → test thêm robot vào group → lấy `openConversationId`
4. Code BE pipeline (Task 1-6 trong plan này)
5. Code FE admin tabs (Task 7-11)

---

## Pre-flight Requirements (do trước khi code)

Bước này KHÔNG phải task code — chỉ list để engineer biết.

1. Admin tổ chức DingTalk phải vào [DingTalk Developer Console](https://open-dev.dingtalk.com), tạo **Enterprise Internal Application**, bật capability **Robot & Message Push**.
2. Với mỗi team Sale có nhóm DingTalk riêng: vào Group Settings → Smart Group Assistant → Add Robot → chọn app vừa tạo → chọn security mode **Signing (加签)** → copy ra `Webhook URL` + `Secret` (chuỗi bắt đầu bằng `SEC...`).
3. Pre-flight chuẩn bị 1 team test (ví dụ `TEST_TEAM`) với webhook + secret sandbox để smoke-test.

---

## File Structure

**Backend (new):**
- `backend/dingtalk_notifier.py` — module gửi tin DingTalk (sign + POST). Tương tự `zalo_notifier.py` nhưng nhẹ hơn (không có refresh-token logic)
- `backend/dingtalk_outbox_worker.py` — async worker poll `dingtalk_outbox`, gọi notifier, update sent_at hoặc lên lịch retry
- `backend/migrations/2026-06-26-dingtalk-tables.sql` — DDL bảng + builder PG functions + triggers song song Zalo
- `backend/tests/test_dingtalk_notifier.py` — unit test notifier (sign, send, error mapping)
- `backend/tests/test_dingtalk_outbox_worker.py` — unit test worker (success/retry/dead-letter)

**Backend (modified):**
- `backend/admin_routes.py` — thêm pydantic payload + 6 endpoint mirror Zalo (`/api/v1/admin/dingtalk-*`) + thêm `"dingtalk"` vào `MODULE_LIST` + `DEFAULT_DEPT_PERMISSIONS`
- `backend/main.py` — startup hook khởi động `dingtalk_outbox_worker`
- `backend/activation_routes.py` — endpoint urgent reminder enqueue song song `dingtalk_outbox` cạnh `zalo_outbox`

**Frontend (new):**
- `frontend/src/lib/api/dingtalkAdmin.ts` — typed API client mirror `zaloAdmin.ts`
- `frontend/src/components/admin/DingTalkConfigTab.tsx` — chỉ phần test (no global token, vì DingTalk không có)
- `frontend/src/components/admin/DingTalkGroupsTab.tsx` — CRUD team_code → webhook_url + secret + group_name
- `frontend/src/components/admin/DingTalkOutboxTab.tsx` — list 50 row gần nhất + retry

**Frontend (modified):**
- `frontend/src/pages/MainPage.tsx` — lazy import 3 tab mới, thêm hub "DingTalk" cạnh "Zalo OA" trong nav
- `frontend/src/lib/permissions.ts` (hoặc nơi định nghĩa module keys) — thêm `dingtalkConfig`, `dingtalkGroups`, `dingtalkOutbox` mapping nếu cần

---

## Task 1: Backend notifier module (signing + send)

**Files:**
- Create: `backend/dingtalk_notifier.py`
- Create: `backend/tests/test_dingtalk_notifier.py`

- [ ] **Step 1: Write failing test for `compute_signature` helper**

```python
# backend/tests/test_dingtalk_notifier.py
import base64
import hashlib
import hmac
import urllib.parse
import pytest


def test_compute_signature_matches_dingtalk_spec():
    import dingtalk_notifier

    timestamp = "1700000000000"
    secret = "SECabc123"
    sign = dingtalk_notifier.compute_signature(timestamp, secret)

    string_to_sign = f"{timestamp}\n{secret}".encode("utf-8")
    expected_raw = hmac.new(secret.encode("utf-8"), string_to_sign, hashlib.sha256).digest()
    expected = urllib.parse.quote_plus(base64.b64encode(expected_raw))

    assert sign == expected
```

- [ ] **Step 2: Run test, expect ImportError / NotImplementedError**

Run: `cd backend && python -m pytest tests/test_dingtalk_notifier.py::test_compute_signature_matches_dingtalk_spec -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'dingtalk_notifier'`

- [ ] **Step 3: Implement minimal `dingtalk_notifier.py` with `compute_signature`**

```python
# backend/dingtalk_notifier.py
"""DingTalk group robot notification client.

Workers/routes call send_text_to_group() — they don't deal with signing.
Mirror the Zalo notifier surface so call sites stay symmetric.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import time
import urllib.parse
from typing import Any

import httpx

DINGTALK_ROBOT_URL = "https://oapi.dingtalk.com/robot/send"
HTTP_TIMEOUT = 15.0


class DingTalkAPIError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        dingtalk_errcode: Any = None,
        response_body: Any = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.dingtalk_errcode = dingtalk_errcode
        self.response_body = response_body


def compute_signature(timestamp: str, secret: str) -> str:
    string_to_sign = f"{timestamp}\n{secret}".encode("utf-8")
    raw = hmac.new(secret.encode("utf-8"), string_to_sign, hashlib.sha256).digest()
    return urllib.parse.quote_plus(base64.b64encode(raw))
```

- [ ] **Step 4: Re-run test, expect PASS**

Run: `cd backend && python -m pytest tests/test_dingtalk_notifier.py::test_compute_signature_matches_dingtalk_spec -v`
Expected: PASS.

- [ ] **Step 5: Write failing test for `send_text_to_group` success path**

Append to `backend/tests/test_dingtalk_notifier.py`:

```python
class _FakeResp:
    def __init__(self, status: int, body: dict):
        self.status_code = status
        self._body = body
        self.text = str(body)

    def json(self) -> dict:
        return self._body


class _FakeClient:
    def __init__(self, responses):
        self.calls = []
        self._responses = list(responses)

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def post(self, url, *, json=None, headers=None, **_):
        self.calls.append({"url": url, "json": json, "headers": headers})
        return self._responses.pop(0)


def test_send_text_to_group_success(monkeypatch):
    import dingtalk_notifier

    fake = _FakeClient([_FakeResp(200, {"errcode": 0, "errmsg": "ok"})])
    monkeypatch.setattr(dingtalk_notifier.httpx, "Client", lambda **_: fake)
    monkeypatch.setattr(dingtalk_notifier.time, "time", lambda: 1700000000.123)

    msg_id = dingtalk_notifier.send_text_to_group(
        webhook_url="https://oapi.dingtalk.com/robot/send?access_token=TKN",
        secret="SECxyz",
        message="hello",
    )

    assert msg_id  # non-empty surrogate id
    call = fake.calls[0]
    assert "timestamp=1700000000123" in call["url"]
    assert "sign=" in call["url"]
    assert call["json"] == {"msgtype": "text", "text": {"content": "hello"}}
    assert call["headers"]["Content-Type"] == "application/json"
```

- [ ] **Step 6: Run test, expect FAIL (function missing)**

Run: `cd backend && python -m pytest tests/test_dingtalk_notifier.py::test_send_text_to_group_success -v`
Expected: FAIL — `AttributeError: module 'dingtalk_notifier' has no attribute 'send_text_to_group'`

- [ ] **Step 7: Implement `send_text_to_group`**

Append to `backend/dingtalk_notifier.py`:

```python
def _clean(value: Any) -> str:
    return "" if value is None else str(value).strip()


def _json_or_text(resp: httpx.Response) -> Any:
    try:
        return resp.json()
    except ValueError:
        return resp.text


def _append_query(url: str, params: dict[str, str]) -> str:
    sep = "&" if "?" in url else "?"
    return url + sep + urllib.parse.urlencode(params)


def _build_signed_url(webhook_url: str, secret: str) -> tuple[str, str]:
    timestamp = str(int(time.time() * 1000))
    sign = compute_signature(timestamp, secret)
    return _append_query(webhook_url, {"timestamp": timestamp, "sign": sign}), timestamp


def send_text_to_group(
    *,
    webhook_url: str,
    secret: str,
    message: str,
) -> str:
    """Send a plain-text message to a DingTalk group robot.

    Returns a surrogate message id (DingTalk does not return one — we synthesize
    the timestamp used so worker rows have something traceable).
    """
    webhook_url = _clean(webhook_url)
    secret = _clean(secret)
    message = _clean(message)
    if not webhook_url:
        raise DingTalkAPIError("webhook_url khong duoc de trong")
    if not secret:
        raise DingTalkAPIError("secret khong duoc de trong")
    if not message:
        raise DingTalkAPIError("message khong duoc de trong")

    signed_url, timestamp = _build_signed_url(webhook_url, secret)
    payload = {"msgtype": "text", "text": {"content": message}}
    headers = {"Content-Type": "application/json"}

    with httpx.Client(timeout=HTTP_TIMEOUT) as client:
        resp = client.post(signed_url, json=payload, headers=headers)

    body = _json_or_text(resp)
    if resp.status_code >= 400:
        raise DingTalkAPIError(
            f"DingTalk HTTP {resp.status_code}",
            status_code=resp.status_code,
            response_body=body,
        )
    if not isinstance(body, dict):
        raise DingTalkAPIError("DingTalk response khong phai JSON object", response_body=body)
    errcode = body.get("errcode")
    if errcode not in (0, "0", None):
        raise DingTalkAPIError(
            f"DingTalk errcode={errcode}: {body.get('errmsg')}",
            status_code=resp.status_code,
            dingtalk_errcode=errcode,
            response_body=body,
        )
    return f"dt-{timestamp}"
```

- [ ] **Step 8: Run test, expect PASS**

Run: `cd backend && python -m pytest tests/test_dingtalk_notifier.py -v`
Expected: 2 PASS.

- [ ] **Step 9: Write failing test for errcode error mapping**

```python
def test_send_text_raises_on_errcode(monkeypatch):
    import dingtalk_notifier

    fake = _FakeClient([_FakeResp(200, {"errcode": 310000, "errmsg": "sign not match"})])
    monkeypatch.setattr(dingtalk_notifier.httpx, "Client", lambda **_: fake)

    with pytest.raises(dingtalk_notifier.DingTalkAPIError) as exc:
        dingtalk_notifier.send_text_to_group(
            webhook_url="https://oapi.dingtalk.com/robot/send?access_token=TKN",
            secret="SECxyz",
            message="hello",
        )
    assert exc.value.dingtalk_errcode == 310000


def test_send_text_raises_on_http_error(monkeypatch):
    import dingtalk_notifier

    fake = _FakeClient([_FakeResp(500, {"errmsg": "boom"})])
    monkeypatch.setattr(dingtalk_notifier.httpx, "Client", lambda **_: fake)

    with pytest.raises(dingtalk_notifier.DingTalkAPIError) as exc:
        dingtalk_notifier.send_text_to_group(
            webhook_url="https://oapi.dingtalk.com/robot/send?access_token=TKN",
            secret="SECxyz",
            message="hello",
        )
    assert exc.value.status_code == 500
```

- [ ] **Step 10: Run all tests in this file, expect 4 PASS**

Run: `cd backend && python -m pytest tests/test_dingtalk_notifier.py -v`
Expected: 4 PASS (signature + success + errcode + http_error).

- [ ] **Step 11: Commit**

```bash
git add backend/dingtalk_notifier.py backend/tests/test_dingtalk_notifier.py
git commit -m "feat(dingtalk): notifier module with HmacSHA256 signing + group send"
```

---

## Task 2: Database schema (tables + indexes)

**Files:**
- Create: `backend/migrations/2026-06-26-dingtalk-tables.sql`

- [ ] **Step 1: Write migration DDL — tables only (no triggers yet)**

```sql
-- backend/migrations/2026-06-26-dingtalk-tables.sql
-- Migration: DingTalk group robot notification tables + triggers + builders
-- Target: PRODUCTION (jozcvbbypwvzaefteoxn) + sandbox (pxgybyfiwywksesyogti)
-- Date: 2026-06-26
-- Prerequisite: payment_lines, active_requests, payment_requests, nhan_su_sale exist
-- Note: Apply on sandbox first, smoke-test, then prod.

-- =============================================
-- 1. Tables
-- =============================================

CREATE TABLE IF NOT EXISTS public.dingtalk_team_groups (
  team_code TEXT PRIMARY KEY,
  webhook_url TEXT NOT NULL,
  secret TEXT NOT NULL,
  group_name TEXT,
  is_active BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dingtalk_outbox (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  source_table TEXT NOT NULL,
  source_id UUID NOT NULL,
  team_code TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  sent_at TIMESTAMPTZ,
  retries INTEGER DEFAULT 0,
  last_error TEXT,
  next_retry_at TIMESTAMPTZ,
  dingtalk_message_id TEXT,
  UNIQUE(source_table, source_id, event_type),
  CONSTRAINT dingtalk_outbox_event_type_check CHECK (
    event_type = ANY (ARRAY[
      'payment_paid'::text,
      'course_activated'::text,
      'activation_urgent_reminder'::text
    ])
  )
);

CREATE INDEX IF NOT EXISTS idx_dingtalk_outbox_pending
  ON public.dingtalk_outbox (next_retry_at) WHERE sent_at IS NULL;
```

- [ ] **Step 2: Append trigger functions reusing existing Zalo PG builders**

The PG functions `build_payment_paid_message(payment_lines)` and `build_course_activated_message(active_requests)` already exist (from Zalo migration). Reuse the message strings as-is for DingTalk text. Append to the same SQL file:

```sql
-- =============================================
-- 2. Trigger functions (enqueue DingTalk in parallel with Zalo)
-- =============================================

CREATE OR REPLACE FUNCTION public.fn_payment_paid_dingtalk_notify()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_sale_email TEXT;
  v_sale_team TEXT;
  v_team_code TEXT;
  v_message TEXT;
BEGIN
  IF NEW.status = 'paid' AND (OLD.status IS NULL OR OLD.status != 'paid') THEN
    SELECT pr.sale_email, ns.team
      INTO v_sale_email, v_sale_team
      FROM public.payment_requests pr
      LEFT JOIN public.nhan_su_sale ns ON ns.email ILIKE pr.sale_email
      WHERE pr.id = NEW.payment_request_id
      LIMIT 1;

    SELECT team_code INTO v_team_code
      FROM public.dingtalk_team_groups
      WHERE team_code = v_sale_team AND is_active = true
      LIMIT 1;

    IF v_team_code IS NULL THEN
      RAISE WARNING 'No active DingTalk group mapping for team: %', v_sale_team;
      RETURN NEW;
    END IF;

    v_message := public.build_payment_paid_message(NEW);

    INSERT INTO public.dingtalk_outbox (event_type, source_table, source_id, team_code, message)
    VALUES ('payment_paid', 'payment_lines', NEW.id, v_team_code, v_message)
    ON CONFLICT (source_table, source_id, event_type) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_course_activated_dingtalk_notify()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_sale_email TEXT;
  v_sale_team TEXT;
  v_team_code TEXT;
  v_message TEXT;
BEGIN
  IF NEW.status = 'activated' AND (OLD.status IS NULL OR OLD.status != 'activated') THEN
    SELECT pr.sale_email, ns.team
      INTO v_sale_email, v_sale_team
      FROM public.payment_requests pr
      LEFT JOIN public.nhan_su_sale ns ON ns.email ILIKE pr.sale_email
      WHERE pr.id = NEW.pr_id
      LIMIT 1;

    SELECT team_code INTO v_team_code
      FROM public.dingtalk_team_groups
      WHERE team_code = v_sale_team AND is_active = true
      LIMIT 1;

    IF v_team_code IS NULL THEN
      RAISE WARNING 'No active DingTalk group mapping for team: %', v_sale_team;
      RETURN NEW;
    END IF;

    v_message := public.build_course_activated_message(NEW);

    INSERT INTO public.dingtalk_outbox (event_type, source_table, source_id, team_code, message)
    VALUES ('course_activated', 'active_requests', md5(NEW.id)::uuid, v_team_code, v_message)
    ON CONFLICT (source_table, source_id, event_type) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;

-- =============================================
-- 3. Triggers
-- =============================================

DROP TRIGGER IF EXISTS trg_payment_paid_dingtalk ON public.payment_lines;
CREATE TRIGGER trg_payment_paid_dingtalk
  AFTER UPDATE ON public.payment_lines
  FOR EACH ROW
  EXECUTE FUNCTION fn_payment_paid_dingtalk_notify();

DROP TRIGGER IF EXISTS trg_course_activated_dingtalk ON public.active_requests;
CREATE TRIGGER trg_course_activated_dingtalk
  AFTER UPDATE ON public.active_requests
  FOR EACH ROW
  EXECUTE FUNCTION fn_course_activated_dingtalk_notify();
```

- [ ] **Step 3: Apply on sandbox via Supabase MCP**

Open Supabase MCP, call `apply_migration` on project `pxgybyfiwywksesyogti` (palfish-gmv-sandbox) with the contents of `backend/migrations/2026-06-26-dingtalk-tables.sql`.

Expected: migration succeeds. Verify with `list_tables` → `dingtalk_team_groups` and `dingtalk_outbox` appear.

- [ ] **Step 4: Smoke-check trigger does not fire when no mapping exists**

Run via Supabase MCP `execute_sql` on sandbox:
```sql
-- Pick a recent payment_line and re-flip status to trigger the function
SELECT id, payment_request_id, status FROM public.payment_lines ORDER BY created_at DESC LIMIT 1;
```
Manually set status='paid' → 'pending' → 'paid' (via UI or SQL) and confirm RAISE WARNING appears in logs but no insert (because no mapping yet). Then check:
```sql
SELECT count(*) FROM public.dingtalk_outbox;
```
Expected: 0.

- [ ] **Step 5: Commit migration**

```bash
git add backend/migrations/2026-06-26-dingtalk-tables.sql
git commit -m "feat(dingtalk): schema + triggers for parallel notification pipeline"
```

---

## Task 3: Outbox worker (poll + retry + dead-letter)

**Files:**
- Create: `backend/dingtalk_outbox_worker.py`
- Create: `backend/tests/test_dingtalk_outbox_worker.py`

- [ ] **Step 1: Write failing test — success path marks sent_at and stores message_id**

```python
# backend/tests/test_dingtalk_outbox_worker.py
import asyncio
import pytest
from unittest.mock import patch


class _Updater:
    def __init__(self):
        self.calls = []

    def update(self, payload):
        self.last_payload = payload
        return self

    def eq(self, col, val):
        self.calls.append({"col": col, "val": val, "payload": self.last_payload})

        class _Exec:
            def execute(self_inner):
                return None
        return _Exec()


class _Table:
    def __init__(self, rows):
        self.rows = rows
        self.updater = _Updater()

    def select(self, *_args, **_kwargs):
        return self

    def is_(self, *_args, **_kwargs):
        return self

    def or_(self, *_args, **_kwargs):
        return self

    def order(self, *_args, **_kwargs):
        return self

    def limit(self, *_args, **_kwargs):
        return self

    def execute(self):
        class _Res:
            pass
        res = _Res()
        res.data = self.rows
        return res

    def update(self, payload):
        return self.updater.update(payload)


class _SB:
    def __init__(self, rows):
        self._table = _Table(rows)

    def table(self, name):
        assert name == "dingtalk_outbox"
        return self._table


@pytest.mark.asyncio
async def test_poll_marks_sent_on_success():
    from dingtalk_outbox_worker import poll_and_send

    rows = [{
        "id": 1,
        "team_code": "TEAM_A",
        "message": "hi",
        "retries": 0,
    }]
    sb = _SB(rows)

    with patch("dingtalk_outbox_worker._load_team_credentials",
               return_value=("https://oapi.dingtalk.com/robot/send?access_token=T", "SEC")):
        with patch("dingtalk_outbox_worker.send_text_to_group", return_value="dt-1700"):
            await poll_and_send(lambda: sb)

    sent_call = next(c for c in sb._table.updater.calls if c["payload"].get("sent_at"))
    assert sent_call["payload"]["dingtalk_message_id"] == "dt-1700"
    assert sent_call["payload"]["last_error"] is None
```

- [ ] **Step 2: Run test, expect FAIL (module missing)**

Run: `cd backend && python -m pytest tests/test_dingtalk_outbox_worker.py::test_poll_marks_sent_on_success -v`
Expected: FAIL — `ModuleNotFoundError`.

- [ ] **Step 3: Implement worker module**

```python
# backend/dingtalk_outbox_worker.py
"""Background worker that drains dingtalk_outbox.

Mirrors zalo_outbox_worker but resolves per-team webhook/secret from
dingtalk_team_groups instead of a global token.
"""

import asyncio
import datetime
import traceback
from typing import Any, Callable

from dingtalk_notifier import DingTalkAPIError, send_text_to_group

RETRY_DELAYS = [30, 120, 300, 900]  # seconds
MAX_RETRIES = 4
POLL_INTERVAL = 30
BATCH_SIZE = 20


def _load_team_credentials(sb, team_code: str) -> tuple[str, str]:
    res = (
        sb.table("dingtalk_team_groups")
        .select("webhook_url, secret, is_active")
        .eq("team_code", team_code)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    if not rows:
        raise DingTalkAPIError(f"team_code {team_code} khong co trong dingtalk_team_groups")
    row = rows[0]
    if not row.get("is_active"):
        raise DingTalkAPIError(f"team_code {team_code} bi disable")
    return row["webhook_url"], row["secret"]


async def poll_and_send(sb_factory: Callable[[], Any]) -> None:
    sb = sb_factory()
    if not sb:
        print("[dingtalk_worker] supabase client missing")
        return

    now = datetime.datetime.now(datetime.timezone.utc)
    now_iso = now.isoformat()

    try:
        res = (
            sb.table("dingtalk_outbox")
            .select("*")
            .is_("sent_at", "null")
            .or_(f"next_retry_at.is.null,next_retry_at.lte.{now_iso}")
            .order("created_at", desc=False)
            .limit(BATCH_SIZE)
            .execute()
        )
        rows = res.data or []
    except Exception as exc:
        print(f"[dingtalk_worker] fetch failed: {exc}")
        return

    for row in rows:
        row_id = row["id"]
        team_code = row["team_code"]
        message = row["message"]
        retries = row["retries"] or 0

        try:
            webhook_url, secret = _load_team_credentials(sb, team_code)
            msg_id = await asyncio.to_thread(
                send_text_to_group,
                webhook_url=webhook_url,
                secret=secret,
                message=message,
            )
            sb.table("dingtalk_outbox").update({
                "sent_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "dingtalk_message_id": msg_id,
                "last_error": None,
            }).eq("id", row_id).execute()
            print(f"[dingtalk_worker] sent {row_id} -> {msg_id}")
        except Exception as exc:
            err_msg = str(exc)
            new_retries = retries + 1
            update_payload: dict[str, Any] = {
                "retries": new_retries,
                "last_error": err_msg,
            }
            if new_retries >= MAX_RETRIES:
                update_payload["next_retry_at"] = None
                print(f"[dingtalk_worker] {row_id} dead after {new_retries}: {err_msg}")
            else:
                delay = RETRY_DELAYS[min(new_retries - 1, len(RETRY_DELAYS) - 1)]
                next_retry = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(seconds=delay)
                update_payload["next_retry_at"] = next_retry.isoformat()
                print(f"[dingtalk_worker] {row_id} retry in {delay}s: {err_msg}")
            try:
                sb.table("dingtalk_outbox").update(update_payload).eq("id", row_id).execute()
            except Exception as upd_exc:
                print(f"[dingtalk_worker] update {row_id} failed: {upd_exc}")


async def start_outbox_worker(sb_factory: Callable[[], Any], poll_interval: int = POLL_INTERVAL) -> None:
    print("[dingtalk_worker] starting...")
    while True:
        try:
            await poll_and_send(sb_factory)
        except Exception as exc:
            print(f"[dingtalk_worker] loop error: {exc}")
            traceback.print_exc()
        await asyncio.sleep(poll_interval)
```

- [ ] **Step 4: Install pytest-asyncio if missing**

Check: `cd backend && pip show pytest-asyncio || pip install pytest-asyncio`
Add `asyncio_mode = "auto"` to `backend/pytest.ini` under `[pytest]` if not already there. (Check first — Zalo worker tests already use asyncio so it's probably configured.)

- [ ] **Step 5: Re-run success test, expect PASS**

Run: `cd backend && python -m pytest tests/test_dingtalk_outbox_worker.py::test_poll_marks_sent_on_success -v`
Expected: PASS.

- [ ] **Step 6: Write failing test for retry scheduling on transient failure**

```python
@pytest.mark.asyncio
async def test_poll_schedules_retry_on_failure():
    from dingtalk_outbox_worker import poll_and_send, RETRY_DELAYS

    rows = [{
        "id": 5,
        "team_code": "TEAM_A",
        "message": "hi",
        "retries": 0,
    }]
    sb = _SB(rows)

    with patch("dingtalk_outbox_worker._load_team_credentials",
               return_value=("https://oapi.dingtalk.com/robot/send?access_token=T", "SEC")):
        with patch("dingtalk_outbox_worker.send_text_to_group",
                   side_effect=RuntimeError("network")):
            await poll_and_send(lambda: sb)

    retry_call = sb._table.updater.calls[-1]
    assert retry_call["payload"]["retries"] == 1
    assert retry_call["payload"]["last_error"] == "network"
    assert retry_call["payload"]["next_retry_at"] is not None
```

- [ ] **Step 7: Run, expect PASS (logic already covers retry)**

Run: `cd backend && python -m pytest tests/test_dingtalk_outbox_worker.py -v`
Expected: 2 PASS.

- [ ] **Step 8: Write failing test for dead-letter after MAX_RETRIES**

```python
@pytest.mark.asyncio
async def test_poll_dead_letters_after_max_retries():
    from dingtalk_outbox_worker import poll_and_send, MAX_RETRIES

    rows = [{
        "id": 9,
        "team_code": "TEAM_A",
        "message": "hi",
        "retries": MAX_RETRIES - 1,
    }]
    sb = _SB(rows)

    with patch("dingtalk_outbox_worker._load_team_credentials",
               return_value=("https://oapi.dingtalk.com/robot/send?access_token=T", "SEC")):
        with patch("dingtalk_outbox_worker.send_text_to_group",
                   side_effect=RuntimeError("still broken")):
            await poll_and_send(lambda: sb)

    last = sb._table.updater.calls[-1]
    assert last["payload"]["retries"] == MAX_RETRIES
    assert last["payload"]["next_retry_at"] is None
```

- [ ] **Step 9: Run all 3 worker tests, expect PASS**

Run: `cd backend && python -m pytest tests/test_dingtalk_outbox_worker.py -v`
Expected: 3 PASS.

- [ ] **Step 10: Commit**

```bash
git add backend/dingtalk_outbox_worker.py backend/tests/test_dingtalk_outbox_worker.py
git commit -m "feat(dingtalk): outbox worker with retry/backoff/dead-letter"
```

---

## Task 4: Wire worker into FastAPI startup

**Files:**
- Modify: `backend/main.py:1372-1380`

- [ ] **Step 1: Read current startup hook for Zalo worker**

Open `backend/main.py` around line 1372 — confirm `_start_zalo_worker()` shape:

```python
@app.on_event("startup")
async def _start_zalo_worker() -> None:
    import asyncio
    from zalo_outbox_worker import start_outbox_worker
    from zalo_notifier import start_zalo_token_refresh_task

    print("[zalo] starting background tasks...")
    asyncio.create_task(start_outbox_worker(_supabase))
    start_zalo_token_refresh_task(_supabase)
```

- [ ] **Step 2: Add DingTalk worker startup hook right after Zalo's**

Add after the `_start_zalo_worker` function (around line 1381):

```python
@app.on_event("startup")
async def _start_dingtalk_worker() -> None:
    import asyncio
    from dingtalk_outbox_worker import start_outbox_worker as start_dingtalk_outbox

    print("[dingtalk] starting outbox worker...")
    asyncio.create_task(start_dingtalk_outbox(_supabase))
```

- [ ] **Step 3: Verify import resolves and startup compiles**

Run: `cd backend && python -c "import main; print('ok')"`
Expected: prints `ok`. No ImportError.

- [ ] **Step 4: Commit**

```bash
git add backend/main.py
git commit -m "feat(dingtalk): start outbox worker on app startup"
```

---

## Task 5: Backend admin endpoints + permission module

**Files:**
- Modify: `backend/admin_routes.py:97-119` (add payloads), `backend/admin_routes.py:122-179` (add module key)
- Modify: `backend/admin_routes.py:~1480` (append new endpoint block)

- [ ] **Step 1: Add pydantic payloads near existing Zalo payloads (around line 119)**

After `ZaloTestMessagePayload`, append:

```python
class DingTalkGroupCreatePayload(BaseModel):
    team_code: str
    webhook_url: str
    secret: str
    group_name: str
    is_active: bool


class DingTalkGroupPatchPayload(BaseModel):
    webhook_url: str | None = None
    secret: str | None = None
    group_name: str | None = None
    is_active: bool | None = None


class DingTalkTestPayload(BaseModel):
    team_code: str
    message: str
```

- [ ] **Step 2: Add `"dingtalk"` to MODULE_LIST and DEFAULT_DEPT_PERMISSIONS**

In `MODULE_LIST` (line 122) right after `"zalo",` add:

```python
    "dingtalk",       # <-- DingTalk group robot notifications
```

In `DEFAULT_DEPT_PERMISSIONS` (lines 146-179), for each department dict add `"dingtalk": "<level>"`:
- `sale`: `"dingtalk": "none"`
- `hr`: `"dingtalk": "full"`
- `marketing`: `"dingtalk": "none"`
- `cs`: `"dingtalk": "none"`

- [ ] **Step 3: Append CRUD + test endpoints after Zalo endpoints (around line 1480, inside the same `register_admin_routes` function)**

```python
    # ------------------------------------------------------------------
    # DingTalk Team Groups Management
    # ------------------------------------------------------------------
    @app.get("/api/v1/admin/dingtalk-groups")
    def get_dingtalk_groups(authorization: str | None = Header(None)):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        require_module_access(sb, actor, "dingtalk")

        res = (
            sb.table("dingtalk_team_groups")
            .select("team_code, webhook_url, group_name, is_active, updated_at")
            .order("updated_at", desc=True)
            .execute()
        )
        # Never return secret to FE
        return {"data": res.data or []}

    @app.post("/api/v1/admin/dingtalk-groups")
    def create_dingtalk_group(payload: DingTalkGroupCreatePayload, authorization: str | None = Header(None)):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        require_module_write(sb, actor, "dingtalk")

        data = {
            "team_code": payload.team_code.strip(),
            "webhook_url": payload.webhook_url.strip(),
            "secret": payload.secret.strip(),
            "group_name": payload.group_name.strip(),
            "is_active": payload.is_active,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        try:
            res = sb.table("dingtalk_team_groups").insert(data).execute()
            if not res.data:
                raise HTTPException(400, "Không thể thêm DingTalk group (team_code có thể đã tồn tại)")
            row = dict(res.data[0])
            row.pop("secret", None)
            return {"data": row}
        except Exception as e:
            raise HTTPException(400, f"Lỗi CSDL: {str(e)}")

    @app.patch("/api/v1/admin/dingtalk-groups/{team_code}")
    def update_dingtalk_group(team_code: str, payload: DingTalkGroupPatchPayload, authorization: str | None = Header(None)):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        require_module_write(sb, actor, "dingtalk")

        patch_data: dict[str, Any] = {}
        if payload.webhook_url is not None:
            patch_data["webhook_url"] = payload.webhook_url.strip()
        if payload.secret is not None:
            patch_data["secret"] = payload.secret.strip()
        if payload.group_name is not None:
            patch_data["group_name"] = payload.group_name.strip()
        if payload.is_active is not None:
            patch_data["is_active"] = payload.is_active

        if not patch_data:
            raise HTTPException(400, "Không có dữ liệu cập nhật")

        patch_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        res = sb.table("dingtalk_team_groups").update(patch_data).eq("team_code", team_code).execute()
        if not res.data:
            raise HTTPException(404, f"Không tìm thấy DingTalk Group: {team_code}")
        row = dict(res.data[0])
        row.pop("secret", None)
        return {"data": row}

    @app.delete("/api/v1/admin/dingtalk-groups/{team_code}")
    def delete_dingtalk_group(team_code: str, authorization: str | None = Header(None)):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        require_module_write(sb, actor, "dingtalk")

        res = sb.table("dingtalk_team_groups").delete().eq("team_code", team_code).execute()
        if not res.data:
            raise HTTPException(404, f"Không tìm thấy DingTalk Group: {team_code}")
        return {"success": True, "deleted_team_code": team_code}

    # ------------------------------------------------------------------
    # DingTalk Outbox
    # ------------------------------------------------------------------
    @app.get("/api/v1/admin/dingtalk-outbox")
    def get_dingtalk_outbox(authorization: str | None = Header(None)):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        require_module_access(sb, actor, "dingtalk")

        res = (
            sb.table("dingtalk_outbox")
            .select("*")
            .order("created_at", desc=True)
            .limit(50)
            .execute()
        )
        return {"data": res.data or []}

    @app.post("/api/v1/admin/dingtalk-outbox/{msg_id}/retry")
    def retry_dingtalk_outbox(msg_id: int, authorization: str | None = Header(None)):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        require_module_write(sb, actor, "dingtalk")

        patch_data = {
            "retries": 0,
            "last_error": None,
            "next_retry_at": datetime.now(timezone.utc).isoformat(),
            "sent_at": None,
        }
        res = sb.table("dingtalk_outbox").update(patch_data).eq("id", msg_id).execute()
        if not res.data:
            raise HTTPException(404, f"Không tìm thấy DingTalk Outbox: {msg_id}")
        return {"ok": True}

    # ------------------------------------------------------------------
    # DingTalk test send
    # ------------------------------------------------------------------
    @app.post("/api/v1/admin/dingtalk-test")
    def test_dingtalk_message(payload: DingTalkTestPayload, authorization: str | None = Header(None)):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        require_module_write(sb, actor, "dingtalk")

        from dingtalk_notifier import send_text_to_group

        creds = (
            sb.table("dingtalk_team_groups")
            .select("webhook_url, secret, is_active")
            .eq("team_code", payload.team_code)
            .limit(1)
            .execute()
        )
        if not creds.data:
            return {"ok": False, "error": f"team_code {payload.team_code} không tồn tại"}
        row = creds.data[0]
        if not row.get("is_active"):
            return {"ok": False, "error": "Group đang disable"}

        try:
            msg_id = send_text_to_group(
                webhook_url=row["webhook_url"],
                secret=row["secret"],
                message=payload.message,
            )
            return {"ok": True, "message_id": msg_id}
        except Exception as e:
            return {"ok": False, "error": str(e)}
```

- [ ] **Step 4: Smoke-check imports + route registration**

Run: `cd backend && python -c "from admin_routes import register_admin_routes; print('ok')"`
Expected: prints `ok`.

- [ ] **Step 5: Manual integration test against sandbox**

Start backend: `cd backend && powershell ./run.ps1` (or rely on Render sandbox after push).
With a logged-in admin token, hit:
```bash
curl -X POST http://localhost:8000/api/v1/admin/dingtalk-groups \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"team_code":"TEST_TEAM","webhook_url":"https://oapi.dingtalk.com/robot/send?access_token=...","secret":"SEC...","group_name":"Test Sandbox","is_active":true}'
```
Expected: 200 OK with row (no `secret` field).

Then:
```bash
curl -X POST http://localhost:8000/api/v1/admin/dingtalk-test \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"team_code":"TEST_TEAM","message":"Sandbox DingTalk test"}'
```
Expected: `{"ok": true, "message_id": "dt-..."}`. Tin nhắn xuất hiện trong nhóm DingTalk test.

- [ ] **Step 6: Commit**

```bash
git add backend/admin_routes.py
git commit -m "feat(dingtalk): admin CRUD + outbox + test endpoints + permissions"
```

---

## Task 6: Activation urgent reminder — enqueue DingTalk in parallel

**Files:**
- Modify: `backend/activation_routes.py:1911-1939`

- [ ] **Step 1: Read existing urgent-reminder enqueue block**

The current logic resolves `OPS_GROUP_TEAM_CODE` → `zalo_team_groups` → builds message → inserts into `zalo_outbox`. Need to add a parallel insert into `dingtalk_outbox` using the same team_code (assumes ops uses both channels).

- [ ] **Step 2: Add parallel DingTalk lookup + insert immediately after the Zalo insert**

After the existing `sb.table("zalo_outbox").insert(...)` block (line 1939), append:

```python
        # Parallel DingTalk notification (best-effort, do not fail PR if missing)
        dt_group = (
            sb.table("dingtalk_team_groups")
            .select("team_code, is_active")
            .eq("team_code", OPS_GROUP_TEAM_CODE)
            .limit(1)
            .execute()
        )
        if dt_group.data and dt_group.data[0].get("is_active"):
            sb.table("dingtalk_outbox").insert({
                "event_type": "activation_urgent_reminder",
                "source_table": "activation_reminders",
                "source_id": reminder.data[0]["id"] if reminder.data else "00000000-0000-0000-0000-000000000000",
                "team_code": OPS_GROUP_TEAM_CODE,
                "message": result["message"],
            }).execute()
```

- [ ] **Step 3: Verify imports compile**

Run: `cd backend && python -c "import activation_routes; print('ok')"`
Expected: prints `ok`.

- [ ] **Step 4: Commit**

```bash
git add backend/activation_routes.py
git commit -m "feat(dingtalk): enqueue urgent reminder to DingTalk in parallel with Zalo"
```

---

## Task 7: Frontend API client

**Files:**
- Create: `frontend/src/lib/api/dingtalkAdmin.ts`

- [ ] **Step 1: Create typed API client**

```typescript
// frontend/src/lib/api/dingtalkAdmin.ts
import { api } from '../api';

export interface DingTalkGroup {
  team_code: string;
  webhook_url: string;
  group_name: string;
  is_active: boolean;
  updated_at: string;
}

export interface DingTalkGroupCreate {
  team_code: string;
  webhook_url: string;
  secret: string;
  group_name: string;
  is_active: boolean;
}

export interface DingTalkGroupPatch {
  webhook_url?: string;
  secret?: string;
  group_name?: string;
  is_active?: boolean;
}

export interface DingTalkOutboxRow {
  id: number;
  source_table: string;
  source_id: string;
  event_type: string;
  team_code: string;
  message: string;
  created_at: string;
  sent_at: string | null;
  retries: number;
  last_error: string | null;
  next_retry_at: string | null;
  dingtalk_message_id: string | null;
}

export interface DingTalkTestPayload {
  team_code: string;
  message: string;
}

export const getDingTalkGroups = async (): Promise<DingTalkGroup[]> => {
  const response = await api.get('/api/v1/admin/dingtalk-groups');
  return response.data.data;
};

export const createDingTalkGroup = async (payload: DingTalkGroupCreate): Promise<DingTalkGroup> => {
  const response = await api.post('/api/v1/admin/dingtalk-groups', payload);
  return response.data.data;
};

export const updateDingTalkGroup = async (
  teamCode: string,
  payload: DingTalkGroupPatch,
): Promise<DingTalkGroup> => {
  const response = await api.patch(`/api/v1/admin/dingtalk-groups/${teamCode}`, payload);
  return response.data.data;
};

export const deleteDingTalkGroup = async (teamCode: string): Promise<void> => {
  await api.delete(`/api/v1/admin/dingtalk-groups/${teamCode}`);
};

export const getDingTalkOutbox = async (): Promise<DingTalkOutboxRow[]> => {
  const response = await api.get('/api/v1/admin/dingtalk-outbox');
  return response.data.data;
};

export const retryDingTalkOutbox = async (msgId: number): Promise<void> => {
  await api.post(`/api/v1/admin/dingtalk-outbox/${msgId}/retry`);
};

export const testDingTalkMessage = async (
  payload: DingTalkTestPayload,
): Promise<{ ok: boolean; message_id?: string; error?: string }> => {
  const response = await api.post('/api/v1/admin/dingtalk-test', payload);
  return response.data;
};
```

- [ ] **Step 2: Verify TypeScript build**

Run: `cd frontend && npx tsc -b`
Expected: success (no errors).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/api/dingtalkAdmin.ts
git commit -m "feat(dingtalk-fe): typed admin API client"
```

---

## Task 8: Frontend Groups tab (CRUD + test)

**Files:**
- Create: `frontend/src/components/admin/DingTalkGroupsTab.tsx`

- [ ] **Step 1: Create CRUD tab**

```tsx
// frontend/src/components/admin/DingTalkGroupsTab.tsx
import React, { useEffect, useState } from 'react';
import {
  createDingTalkGroup,
  deleteDingTalkGroup,
  getDingTalkGroups,
  updateDingTalkGroup,
  type DingTalkGroup,
  type DingTalkGroupCreate,
} from '../../lib/api/dingtalkAdmin';

const EMPTY_FORM: DingTalkGroupCreate = {
  team_code: '',
  webhook_url: '',
  secret: '',
  group_name: '',
  is_active: true,
};

export const DingTalkGroupsTab: React.FC = () => {
  const [groups, setGroups] = useState<DingTalkGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<DingTalkGroupCreate>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const fetchGroups = async () => {
    try {
      setLoading(true);
      const data = await getDingTalkGroups();
      setGroups(data ?? []);
    } catch (err: any) {
      setAlert({ type: 'error', message: err.response?.data?.detail || err.message || 'Lỗi tải danh sách' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchGroups(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.team_code.trim() || !form.webhook_url.trim() || !form.secret.trim() || !form.group_name.trim()) {
      setAlert({ type: 'error', message: 'Điền đủ team_code, webhook_url, secret, group_name' });
      return;
    }
    try {
      setSubmitting(true);
      setAlert(null);
      await createDingTalkGroup(form);
      setAlert({ type: 'success', message: 'Thêm nhóm thành công' });
      setForm(EMPTY_FORM);
      await fetchGroups();
    } catch (err: any) {
      setAlert({ type: 'error', message: err.response?.data?.detail || err.message || 'Lỗi thêm nhóm' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (g: DingTalkGroup) => {
    try {
      await updateDingTalkGroup(g.team_code, { is_active: !g.is_active });
      await fetchGroups();
    } catch (err: any) {
      setAlert({ type: 'error', message: err.response?.data?.detail || err.message || 'Lỗi cập nhật' });
    }
  };

  const handleDelete = async (teamCode: string) => {
    if (!window.confirm(`Xóa DingTalk group cho team ${teamCode}?`)) return;
    try {
      await deleteDingTalkGroup(teamCode);
      await fetchGroups();
    } catch (err: any) {
      setAlert({ type: 'error', message: err.response?.data?.detail || err.message || 'Lỗi xóa' });
    }
  };

  const handleRotateSecret = async (teamCode: string) => {
    const newSecret = window.prompt('Nhập Secret mới (SEC...):');
    if (!newSecret) return;
    try {
      await updateDingTalkGroup(teamCode, { secret: newSecret.trim() });
      setAlert({ type: 'success', message: 'Cập nhật secret thành công' });
      setEditing(null);
    } catch (err: any) {
      setAlert({ type: 'error', message: err.response?.data?.detail || err.message || 'Lỗi cập nhật' });
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6">
      <h2 className="text-2xl font-bold text-gray-800">DingTalk — Nhóm thông báo</h2>
      {alert && (
        <div className={`p-3 rounded-md border ${alert.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
          {alert.message}
        </div>
      )}

      <form onSubmit={handleCreate} className="bg-white p-6 rounded-lg border border-gray-200 space-y-3">
        <h3 className="font-semibold text-gray-800">Thêm nhóm mới</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input className="px-3 py-2 border rounded-md" placeholder="team_code (vd: SALE_HCM)" value={form.team_code} onChange={(e) => setForm({ ...form, team_code: e.target.value })} />
          <input className="px-3 py-2 border rounded-md" placeholder="Group name (mô tả)" value={form.group_name} onChange={(e) => setForm({ ...form, group_name: e.target.value })} />
          <input className="px-3 py-2 border rounded-md md:col-span-2 font-mono text-sm" placeholder="Webhook URL (https://oapi.dingtalk.com/robot/send?access_token=...)" value={form.webhook_url} onChange={(e) => setForm({ ...form, webhook_url: e.target.value })} />
          <input className="px-3 py-2 border rounded-md md:col-span-2 font-mono text-sm" type="password" placeholder="Secret (SEC...)" value={form.secret} onChange={(e) => setForm({ ...form, secret: e.target.value })} />
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
            Bật ngay
          </label>
        </div>
        <button type="submit" disabled={submitting} className={`px-4 py-2 rounded text-white ${submitting ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-700'}`}>
          {submitting ? 'Đang lưu...' : 'Thêm nhóm'}
        </button>
      </form>

      <div className="bg-white p-4 rounded-lg border border-gray-200">
        <h3 className="font-semibold text-gray-800 mb-3">Danh sách nhóm</h3>
        {loading ? (
          <div className="text-gray-500">Đang tải...</div>
        ) : groups.length === 0 ? (
          <div className="text-gray-500">Chưa có nhóm nào.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 py-2 text-left">team_code</th>
                <th className="px-2 py-2 text-left">group_name</th>
                <th className="px-2 py-2 text-left">webhook (mask)</th>
                <th className="px-2 py-2">active</th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.team_code} className="border-t">
                  <td className="px-2 py-2 font-mono">{g.team_code}</td>
                  <td className="px-2 py-2">{g.group_name}</td>
                  <td className="px-2 py-2 font-mono text-xs">{g.webhook_url.slice(0, 60)}…</td>
                  <td className="px-2 py-2 text-center">
                    <button onClick={() => handleToggleActive(g)} className={`px-2 py-1 rounded text-xs ${g.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                      {g.is_active ? 'On' : 'Off'}
                    </button>
                  </td>
                  <td className="px-2 py-2 text-right space-x-2">
                    <button onClick={() => handleRotateSecret(g.team_code)} className="text-blue-600 text-xs hover:underline">Rotate secret</button>
                    <button onClick={() => handleDelete(g.team_code)} className="text-red-600 text-xs hover:underline">Xóa</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default DingTalkGroupsTab;
```

- [ ] **Step 2: Verify TypeScript build**

Run: `cd frontend && npx tsc -b`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/admin/DingTalkGroupsTab.tsx
git commit -m "feat(dingtalk-fe): admin tab to CRUD groups + rotate secret"
```

---

## Task 9: Frontend Config tab (test send)

**Files:**
- Create: `frontend/src/components/admin/DingTalkConfigTab.tsx`

- [ ] **Step 1: Build config/test tab**

```tsx
// frontend/src/components/admin/DingTalkConfigTab.tsx
import React, { useEffect, useState } from 'react';
import {
  getDingTalkGroups,
  testDingTalkMessage,
  type DingTalkGroup,
  type DingTalkTestPayload,
} from '../../lib/api/dingtalkAdmin';

export const DingTalkConfigTab: React.FC = () => {
  const [groups, setGroups] = useState<DingTalkGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [testForm, setTestForm] = useState<DingTalkTestPayload>({
    team_code: '',
    message: 'Test từ PalFish GMV Admin',
  });
  const [testing, setTesting] = useState(false);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const data = await getDingTalkGroups();
        setGroups((data ?? []).filter((g) => g.is_active));
      } catch {
        setGroups([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleTest = async () => {
    if (!testForm.team_code) {
      setAlert({ type: 'error', message: 'Chọn team_code để test' });
      return;
    }
    try {
      setTesting(true);
      setAlert(null);
      const result = await testDingTalkMessage(testForm);
      if (result.ok) {
        setAlert({ type: 'success', message: `Gửi thành công! ${result.message_id}` });
      } else {
        setAlert({ type: 'error', message: `Thất bại: ${result.error}` });
      }
    } catch (err: any) {
      setAlert({ type: 'error', message: err.response?.data?.detail || err.message || 'Lỗi gửi test' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <h2 className="text-2xl font-bold text-gray-800">DingTalk — Cấu hình</h2>

      <div className="bg-blue-50 border border-blue-200 rounded-md p-4 text-sm text-blue-900 space-y-2">
        <p><strong>DingTalk khác Zalo:</strong> không có "OA token" toàn cục. Mỗi nhóm DingTalk có 1 robot riêng với webhook URL + secret.</p>
        <p>Cấu hình URL/secret tại tab <strong>Nhóm thông báo</strong>. Tab này chỉ dùng để test gửi sau khi đã thêm nhóm.</p>
      </div>

      {alert && (
        <div className={`p-3 rounded-md border ${alert.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
          {alert.message}
        </div>
      )}

      <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
        <h3 className="text-lg font-semibold mb-2 text-gray-800">Kiểm tra kết nối</h3>
        <div className="flex flex-col sm:flex-row gap-3 mb-3">
          {loading ? (
            <div className="flex-1 px-3 py-2 border rounded-md text-sm text-gray-400 bg-gray-50">Đang tải nhóm...</div>
          ) : groups.length === 0 ? (
            <div className="flex-1 px-3 py-2 border rounded-md text-sm text-gray-500 bg-gray-50">
              Chưa có nhóm. Vào tab <strong>Nhóm thông báo</strong> để thêm.
            </div>
          ) : (
            <select
              value={testForm.team_code}
              onChange={(e) => setTestForm({ ...testForm, team_code: e.target.value })}
              className="flex-1 px-3 py-2 border rounded-md text-sm"
            >
              <option value="">— Chọn nhóm —</option>
              {groups.map((g) => (
                <option key={g.team_code} value={g.team_code}>{g.group_name} ({g.team_code})</option>
              ))}
            </select>
          )}
          <input
            type="text"
            value={testForm.message}
            onChange={(e) => setTestForm({ ...testForm, message: e.target.value })}
            className="flex-1 px-3 py-2 border rounded-md text-sm"
            placeholder="Nội dung tin test"
          />
        </div>
        <button
          onClick={handleTest}
          disabled={testing || !testForm.team_code}
          className={`px-4 py-2 rounded text-white ${testing || !testForm.team_code ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700'}`}
        >
          {testing ? 'Đang gửi...' : 'Test Gửi DingTalk'}
        </button>
      </div>
    </div>
  );
};

export default DingTalkConfigTab;
```

- [ ] **Step 2: Verify TypeScript build**

Run: `cd frontend && npx tsc -b`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/admin/DingTalkConfigTab.tsx
git commit -m "feat(dingtalk-fe): admin tab for test send"
```

---

## Task 10: Frontend Outbox tab

**Files:**
- Create: `frontend/src/components/admin/DingTalkOutboxTab.tsx`

- [ ] **Step 1: Build outbox list + retry tab**

```tsx
// frontend/src/components/admin/DingTalkOutboxTab.tsx
import React, { useEffect, useState } from 'react';
import {
  getDingTalkOutbox,
  retryDingTalkOutbox,
  type DingTalkOutboxRow,
} from '../../lib/api/dingtalkAdmin';

export const DingTalkOutboxTab: React.FC = () => {
  const [rows, setRows] = useState<DingTalkOutboxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchRows = async () => {
    try {
      setLoading(true);
      const data = await getDingTalkOutbox();
      setRows(data ?? []);
    } catch (err: any) {
      setAlert({ type: 'error', message: err.response?.data?.detail || err.message || 'Lỗi tải outbox' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRows(); }, []);

  const handleRetry = async (id: number) => {
    try {
      await retryDingTalkOutbox(id);
      setAlert({ type: 'success', message: `Đã đặt lại retry cho msg ${id}` });
      await fetchRows();
    } catch (err: any) {
      setAlert({ type: 'error', message: err.response?.data?.detail || err.message || 'Lỗi retry' });
    }
  };

  const statusBadge = (row: DingTalkOutboxRow) => {
    if (row.sent_at) return <span className="text-green-700 bg-green-100 px-2 py-0.5 rounded text-xs">sent</span>;
    if (row.retries >= 4) return <span className="text-red-700 bg-red-100 px-2 py-0.5 rounded text-xs">dead</span>;
    if (row.retries > 0) return <span className="text-yellow-700 bg-yellow-100 px-2 py-0.5 rounded text-xs">retry {row.retries}</span>;
    return <span className="text-gray-700 bg-gray-100 px-2 py-0.5 rounded text-xs">pending</span>;
  };

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">DingTalk — Outbox (50 gần nhất)</h2>
        <button onClick={fetchRows} className="px-3 py-1 text-sm border rounded hover:bg-gray-50">Refresh</button>
      </div>

      {alert && (
        <div className={`p-3 rounded-md border ${alert.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
          {alert.message}
        </div>
      )}

      {loading ? (
        <div className="text-gray-500">Đang tải...</div>
      ) : rows.length === 0 ? (
        <div className="text-gray-500">Chưa có tin nhắn nào.</div>
      ) : (
        <div className="overflow-x-auto bg-white border rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 py-2 text-left">ID</th>
                <th className="px-2 py-2 text-left">created_at</th>
                <th className="px-2 py-2 text-left">event_type</th>
                <th className="px-2 py-2 text-left">team_code</th>
                <th className="px-2 py-2 text-left">message</th>
                <th className="px-2 py-2 text-left">status</th>
                <th className="px-2 py-2 text-left">last_error</th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t align-top">
                  <td className="px-2 py-2 font-mono">{r.id}</td>
                  <td className="px-2 py-2 whitespace-nowrap text-xs">{new Date(r.created_at).toLocaleString('vi-VN')}</td>
                  <td className="px-2 py-2 text-xs">{r.event_type}</td>
                  <td className="px-2 py-2 text-xs font-mono">{r.team_code}</td>
                  <td className="px-2 py-2 text-xs max-w-md truncate">{r.message}</td>
                  <td className="px-2 py-2">{statusBadge(r)}</td>
                  <td className="px-2 py-2 text-xs text-red-700 max-w-xs truncate">{r.last_error || ''}</td>
                  <td className="px-2 py-2">
                    {!r.sent_at && (
                      <button onClick={() => handleRetry(r.id)} className="text-blue-600 text-xs hover:underline">Retry</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default DingTalkOutboxTab;
```

- [ ] **Step 2: Verify TypeScript build**

Run: `cd frontend && npx tsc -b`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/admin/DingTalkOutboxTab.tsx
git commit -m "feat(dingtalk-fe): outbox tab with status badges + retry button"
```

---

## Task 11: Wire tabs into navigation

**Files:**
- Modify: `frontend/src/pages/MainPage.tsx:37-42` (lazy imports), `:206-218` (PAGE_META), `:315-324` (nav items), `:376-381` (switch)

- [ ] **Step 1: Add lazy imports near existing Zalo imports (around line 41)**

Append after `ZaloOutboxTab` line:

```typescript
const DingTalkConfigTab = lazyRetry(() => import("../components/admin/DingTalkConfigTab"));
const DingTalkGroupsTab = lazyRetry(() => import("../components/admin/DingTalkGroupsTab"));
const DingTalkOutboxTab = lazyRetry(() => import("../components/admin/DingTalkOutboxTab"));
```

- [ ] **Step 2: Add PAGE_META entries near Zalo entries (around line 218)**

Append after `zaloOutbox` entry:

```typescript
  dingtalkConfig: {
    title: "DingTalk — Cấu hình",
    subtitle: "Test gửi tin tới nhóm DingTalk đã cấu hình",
  },
  dingtalkGroups: {
    title: "DingTalk — Nhóm thông báo",
    subtitle: "Mapping team → DingTalk webhook + secret",
  },
  dingtalkOutbox: {
    title: "DingTalk — Outbox",
    subtitle: "50 tin nhắn gần nhất — theo dõi trạng thái gửi & retry",
  },
```

- [ ] **Step 3: Add nav hub right after the Zalo hub (around line 324)**

```typescript
    // ── DingTalk ──
    const dingtalkChildren: NavChildItem[] = [];
    if (can("dingtalkConfig"))
      dingtalkChildren.push({ id: "dingtalkConfig", label: "Cấu hình", subtitle: "Test gửi tin" });
    if (can("dingtalkGroups"))
      dingtalkChildren.push({ id: "dingtalkGroups", label: "Nhóm thông báo", subtitle: "Mapping team → DingTalk group" });
    if (can("dingtalkOutbox"))
      dingtalkChildren.push({ id: "dingtalkOutbox", label: "Outbox", subtitle: "Trạng thái gửi tin" });
    if (dingtalkChildren.length > 0)
      list.push({ id: "dingtalkHub", label: "DingTalk", icon: I.team, section: "Quản trị", children: dingtalkChildren });
```

- [ ] **Step 4: Add cases in the render switch (around line 381)**

```typescript
      case "dingtalkConfig": return <DingTalkConfigTab />;
      case "dingtalkGroups": return <DingTalkGroupsTab />;
      case "dingtalkOutbox": return <DingTalkOutboxTab />;
```

- [ ] **Step 5: Add `dingtalkConfig`/`dingtalkGroups`/`dingtalkOutbox` to FE permission map**

Find the FE permission map (search `can("zaloConfig")` to locate). For each `zalo*` permission key add the corresponding `dingtalk*` key that maps to the BE `dingtalk` module. Example pattern (adapt to actual file):

```typescript
// in lib/permissions or wherever permission keys are defined
dingtalkConfig: { module: "dingtalk", access: "read" },
dingtalkGroups: { module: "dingtalk", access: "write" },
dingtalkOutbox: { module: "dingtalk", access: "read" },
```

If FE simply mirrors BE's `MODULE_LIST` automatically, this step may be unnecessary — verify by grep:

Run: `grep -rn "zaloConfig" frontend/src/lib`
Inspect the file that defines the mapping, replicate the same pattern for `dingtalk*` keys.

- [ ] **Step 6: Verify build**

Run: `cd frontend && npx tsc -b && cd frontend && npm run build`
Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/MainPage.tsx frontend/src/lib
git commit -m "feat(dingtalk-fe): wire 3 admin tabs into navigation"
```

---

## Task 12: E2E smoke test — sandbox end-to-end

**Files:**
- Modify: sandbox Supabase DB (no source file)

- [ ] **Step 1: Add a TEST_TEAM mapping on sandbox**

Through the new FE Groups tab on https://palfish-gmv-manager-sandbox.vercel.app (login test.admin@dev):
- team_code: `TEST_TEAM`
- webhook_url: from the pre-flight DingTalk test robot
- secret: corresponding SEC...
- group_name: "Sandbox Test"
- is_active: ON

- [ ] **Step 2: Test send from Config tab**

Click "Test Gửi DingTalk" → verify message appears in the DingTalk test group.
Expected: `{ ok: true, message_id: "dt-..." }`. Tin nhắn `Test từ PalFish GMV Admin` xuất hiện trong nhóm DingTalk.

- [ ] **Step 3: Smoke trigger end-to-end**

Pick a sandbox payment_request whose `sale_email`'s team matches `TEST_TEAM` (temporarily reassign one via SQL if needed). Flip a payment_line to `paid`:

```sql
UPDATE public.payment_lines
SET status = 'paid', paid_at = now()
WHERE id = '<sandbox-line-id>';
```

Within ~30 seconds, check the DingTalk group: payment-paid message should appear.

Also verify outbox row:
```sql
SELECT id, sent_at, retries, last_error
FROM public.dingtalk_outbox
WHERE source_id = '<sandbox-line-id>';
```
Expected: `sent_at` not null, `last_error` null.

- [ ] **Step 4: Verify FE Outbox tab shows the row**

Open DingTalk Outbox tab → row appears with `sent` badge.

- [ ] **Step 5: Negative test — bad secret**

In Groups tab, rotate secret to `SECwrong`. Trigger another payment_paid. Within ~30s, check Outbox tab — row should show `retry 1` with `last_error` containing `errcode` or `sign not match`. Restore correct secret, click `Retry` → row turns `sent`.

- [ ] **Step 6: No commit needed; document any deltas**

If anything diverged from this plan, note it in the PR description.

---

## Task 13: Production rollout

**Files:**
- Production Supabase (no source file)
- `docs/PROJECT.md` (update notes)

- [ ] **Step 1: Apply migration on prod**

Via Supabase MCP `apply_migration` on project `jozcvbbypwvzaefteoxn` (project_palfish) with the same SQL.
Verify: `list_tables` shows `dingtalk_team_groups` + `dingtalk_outbox`.

- [ ] **Step 2: Configure prod team groups via FE**

In production admin UI (after deploy of FE/BE), add one DingTalk group per real Sale team (team_code, webhook_url, secret, group_name).

- [ ] **Step 3: Smoke-test 1 real payment-paid**

Coordinate with one Sale team to confirm they receive the DingTalk notification on the next payment.

- [ ] **Step 4: Update PROJECT.md notes**

Append a short section "DingTalk notifications" to `docs/PROJECT.md` summarizing tables + worker + admin tabs. Keep under 10 lines.

- [ ] **Step 5: Commit docs**

```bash
git add docs/PROJECT.md
git commit -m "docs: DingTalk notification pipeline overview"
```

---

## Notes

- **Markdown messages future work:** current plan uses `msgtype=text` to reuse the PG `build_*_message` functions verbatim. If we later want bold/headings, build a new PG function returning markdown body and switch `dingtalk_notifier.send_text_to_group` to accept `msgtype="markdown"`. Out of scope here.
- **Rate limit:** DingTalk robot caps at 20 msg/min/robot. Worker BATCH_SIZE=20 with 30s poll = max 40 msg/min per robot in worst case — close to limit. If app traffic spikes, lower BATCH_SIZE to 10 or extend poll interval.
- **Free-tier quota:** 5,000 msg/month/enterprise on free plan. ~165 msg/day. Estimate current PalFish traffic before going live; upgrade if needed.
- **Idempotency:** the `UNIQUE(source_table, source_id, event_type)` constraint prevents duplicate enqueues if a trigger fires twice. Same pattern as Zalo.
- **Security:** secret is stored in DB and never returned to FE in list endpoints. Rotation goes through PATCH endpoint which accepts a new secret. Webhook URL is considered low-sensitivity (still scoped to one robot, so leak = throwaway robot, not OA compromise).
