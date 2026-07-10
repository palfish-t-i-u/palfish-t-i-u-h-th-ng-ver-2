# Zalo: Tin ảnh bill riêng + chuyển thông báo kích hoạt sang DingTalk — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **QUOTA RULE (tiêu chí 4 của Minh):** Thực hiện INLINE trong 1 session, KHÔNG fan-out subagent. Nếu cần subagent thì tối đa 1, scope rõ. Không dùng ultracode/workflow.

**Goal:** Trên nhóm Zalo sale chỉ còn 2 loại tin: (1) báo tiền về `payment_paid` (giữ nguyên), (2) tin MỚI bắn ảnh bill riêng sau khi sale up bill. Thông báo "kích hoạt thành công" (`course_activated`) tắt trên Zalo, giữ nguyên trên DingTalk + web GMV.

**Architecture:** Tái dùng 100% hạ tầng outbox hiện có (bảng `zalo_outbox` + worker 30s + cột `image_urls`). Tin bill mới = 1 SQL function `enqueue_bill_uploaded_zalo(line_id)` duy nhất, được gọi từ 2 chỗ: (a) trigger `fn_payment_paid_zalo_notify` khi line chuyển paid mà đã có bill sẵn, (b) RPC từ endpoint upload bill khi line đã paid. Một implementation duy nhất trong SQL → không có rủi ro lệch format Python/SQL. Tắt `course_activated` Zalo = DROP trigger (migration riêng, deploy theo gate quyết định). Worker không cần sửa logic gửi — chỉ thêm sort phụ theo `id` để đảm bảo tin tiền luôn đi trước tin bill.

**Tech Stack:** Postgres (Supabase) trigger/function, FastAPI (supabase-py RPC), React (1 dòng label), pytest.

**Nguồn yêu cầu (10/7, chat chị Vân + chị Hiền):**
- Sale chốt: "tách riêng gửi báo tiền trước, khi nào có ảnh bill thì bắn ảnh về sau".
- Chị Vân: thông báo kích hoạt thành công "đẩy về ding với trên web GMV", "k cần tin nhắn kia nữa" (trên Zalo).
- Nhóm Zalo chỉ để báo tiền (+ ảnh bill — gửi ảnh vào nhóm là yêu cầu của chị Nina).

---

## Bối cảnh hiện trạng (verified 10/7 — KHÔNG đoán lại, đã grep schema thật)

| Sự kiện | Đường enqueue hiện tại | Ghi chú |
|---|---|---|
| `payment_paid` | DB trigger `trg_payment_paid_zalo` trên `payment_lines` (status→'paid'), fn tại `backend/migrations/2026-06-23-zalo-oa-tables.sql:137` | GIỮ NGUYÊN format |
| `course_activated` | DB trigger `trg_course_activated_zalo` trên `active_requests`, fn bản mới nhất ở `backend/migrations/2026-07-08-zalo-outbox-image-urls.sql` — **ảnh bill hiện đang đính vào tin này** | Tắt ở Phase 2 |
| `activation_request_created`, `activation_urgent_reminder` | Python (`activation_routes.py`), đã chặn bằng `ZALO_ENABLED_EVENTS` (cắt 9/7) | Không đụng |
| DingTalk `course_activated` | Trigger `trg_course_activated_dingtalk` đã tồn tại (`2026-06-26-dingtalk-tables.sql:141`) | Worker đang TẮT (`DINGTALK_WORKER_ENABLED` != true, chờ certification) |

Facts đã verify:
- `zalo_outbox.source_id` là UUID; `payment_lines.id` là UUID → dùng trực tiếp làm source_id, UNIQUE `(source_table, source_id, event_type)` tự chống trùng.
- Worker (`backend/zalo_outbox_worker.py`) đã gửi text rồi gửi `image_urls` (batch 1 tin ảnh) — KHÔNG cần sửa logic gửi.
- Upload bill: `POST /payment-lines/{line_id}/bill` tại `backend/payment_request_routes.py:2303`, persist qua RPC `append_payment_line_bill`, sau đó re-read line vào biến `line` (dòng ~2363-2369).
- Cancel outbox = `retries=99, next_retry_at=NULL` (FE hiển thị "Đã huỷ" khi `retries >= 99` — `ZaloOutboxTab.tsx:20`).
- `ZALO_ENABLED_EVENTS` (`backend/utils/zalo_message_builder.py:31`) chỉ gate đường Python — trigger DB KHÔNG bị nó chặn. Muốn tắt `course_activated` thật sự phải DROP trigger.
- SQL builder mẫu để copy style: `build_payment_paid_message` trong `2026-07-04-zalo-payment-paid-format-v2.sql` (join `payment_requests pr` lấy `pr.name`, `pr.child_name`; join `nhan_su_sale ns ON ns.email ILIKE pr.sale_email` lấy `ns.team`, `COALESCE(ns.display_name, ns.crm_name)`).
- DingTalk worker `poll_and_send` (dòng 47-55) THIẾU guard `retries.lt.MAX_RETRIES` → dead row retry vô hạn (bug ghi trong skill dingtalk-notifications).
- `public.build_course_activated_message` là function DÙNG CHUNG với DingTalk trigger — TUYỆT ĐỐI không drop.
- **[Cập nhật sau pull 10/7 chiều]** Team merge "báo tiền net" (`b037732`): `build_payment_paid_message` SQL replace bởi `2026-07-10-zalo-payment-paid-net-amount.sql` — thẻ/trả góp ưu tiên `payment_lines.verified_received` (thực nhận sau phí), label "Thực nhận". `fn_payment_paid_zalo_notify` KHÔNG đổi → bản copy trong Task 1 vẫn đúng base. Tin bill PHẢI đồng bộ logic số tiền này (đã sửa trong Task 1).
- **[WIP chưa commit trong working tree]** Có sẵn thay đổi dở 10/7 KHÔNG được revert: audit log up/xoá bill trong `payment_request_routes.py` (ngay vùng call site Task 2), filter "Chưa ghép thẻ/TG" + bỏ bắt buộc 4 số cuối thẻ ở FE. Code mới phải chèn CHUNG SỐNG với các dòng này.

---

## Phase 0 — Decision gates (KHÔNG code, chặn deploy prod)

- [ ] **Gate A — anh Hiếu duyệt tắt `course_activated` trên Zalo.** Tin này là 1 trong 2 mẫu anh Hiếu yêu cầu GIỮ hôm 9/7. Chị Vân (sale) đã chốt bỏ, Minh đã hứa "bàn thêm với a Hiếu" (chat 9:36 10/7). Chưa có OK của anh Hiếu → chỉ deploy Phase 1, KHÔNG deploy Phase 2.
- [ ] **Gate B — thời điểm tắt Zalo `course_activated`.** DingTalk hiện CHƯA live (robot bị chặn chờ certification, worker tắt bằng env flag). Nếu tắt Zalo trước khi DingTalk chạy → khoảng trống: sale chỉ còn xem trạng thái trên web. Chị Vân có vẻ nghĩ ding đã chạy ("đẩy về ding... rồi ạ") — nói rõ lại với chị. Khuyến nghị: **Phase 1 deploy ngay; Phase 2 chờ DingTalk live** (certification xong + `DINGTALK_WORKER_ENABLED=true` + `dingtalk_team_groups` đủ các team), trừ khi anh Hiếu chấp nhận interim web-only.
- [ ] **Gate C — format tin bill.** Format đề xuất ở Task 1 (🧾 BILL + Sale/Team + số tiền lần TT). Gửi mẫu cho chị Hiền/Vân xem, chỉnh chữ được sau (chỉ sửa 1 SQL function, không ảnh hưởng kiến trúc).

---

## Phase 1 — Tin ảnh bill riêng trên Zalo (deploy được độc lập)

### Task 1: Migration A — event `bill_uploaded` + SQL enqueue function

**Files:**
- Create: `backend/migrations/2026-07-10-zalo-bill-uploaded-event.sql`

- [ ] **Step 1: Viết migration** — full nội dung:

```sql
-- Migration: tin Zalo riêng bắn ảnh bill sau khi sale upload (tách khỏi course_activated)
-- Yêu cầu sale 10/7: "tách riêng gửi báo tiền trước, khi nào có ảnh bill thì bắn ảnh về sau"
-- 1 implementation duy nhất (SQL), gọi từ 2 đường: trigger payment_paid + RPC từ endpoint upload bill.
-- Idempotent: CREATE OR REPLACE + ON CONFLICT. Date: 2026-07-10

-- 1. Event type mới: bill_uploaded (GIỮ nguyên các giá trị cũ — CHECK mới re-validate toàn bộ rows cũ)
ALTER TABLE public.zalo_outbox DROP CONSTRAINT IF EXISTS zalo_outbox_event_type_check;
ALTER TABLE public.zalo_outbox ADD CONSTRAINT zalo_outbox_event_type_check
  CHECK (event_type = ANY (ARRAY[
    'payment_paid'::text, 'course_activated'::text,
    'activation_urgent_reminder'::text, 'activation_request_created'::text,
    'bill_uploaded'::text]));

-- 2. Enqueue function — nguồn sự thật DUY NHẤT cho tin bill
--    Trả về true nếu có row được insert/update, false nếu skip (chưa paid / chưa có bill / thiếu group).
CREATE OR REPLACE FUNCTION public.enqueue_bill_uploaded_zalo(p_line_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_line       public.payment_lines%ROWTYPE;
  v_customer   TEXT;
  v_child      TEXT;
  v_sale_email TEXT;
  v_sale_team  TEXT;
  v_sale_name  TEXT;
  v_group_id   TEXT;
  v_message    TEXT;
  v_image_urls JSONB;
BEGIN
  SELECT * INTO v_line FROM public.payment_lines WHERE id = p_line_id;
  IF NOT FOUND OR v_line.status IS DISTINCT FROM 'paid' THEN
    RETURN false;
  END IF;

  -- Gom ảnh bill của CHÍNH line này (bill_images JSONB + legacy bill_image), dedup
  SELECT jsonb_agg(DISTINCT u)
    INTO v_image_urls
    FROM (
      SELECT jsonb_array_elements_text(v_line.bill_images) AS u
       WHERE v_line.bill_images IS NOT NULL
         AND jsonb_typeof(v_line.bill_images) = 'array'
         AND jsonb_array_length(v_line.bill_images) > 0
      UNION
      SELECT v_line.bill_image AS u
       WHERE v_line.bill_image IS NOT NULL AND v_line.bill_image != ''
    ) sub(u)
   WHERE u IS NOT NULL AND u != '';

  IF v_image_urls IS NULL THEN
    RETURN false;  -- chưa có bill nào → không có gì để bắn
  END IF;

  SELECT pr.name, pr.child_name, pr.sale_email, ns.team,
         COALESCE(ns.display_name, ns.crm_name)
    INTO v_customer, v_child, v_sale_email, v_sale_team, v_sale_name
    FROM public.payment_requests pr
    LEFT JOIN public.nhan_su_sale ns ON ns.email ILIKE pr.sale_email
    WHERE pr.id = v_line.payment_request_id
    LIMIT 1;

  SELECT group_id INTO v_group_id
    FROM public.zalo_team_groups
    WHERE team_code = v_sale_team AND is_active = true
    LIMIT 1;

  IF v_group_id IS NULL THEN
    RAISE WARNING 'No active Zalo group mapping found for team: %', v_sale_team;
    RETURN false;
  END IF;

  -- Format: 🧾 BILL - KH {name}[ - Bé {child}] / 🔸 Sale · Team / 🔸 Lần TT: {amount} VND
  v_message := format(E'\U0001F9FE BILL - KH %s',
                      COALESCE(NULLIF(TRIM(v_customer), ''), '?'));
  IF v_child IS NOT NULL AND TRIM(v_child) <> '' THEN
    v_message := v_message || format(' - Bé %s', TRIM(v_child));
  END IF;
  v_message := v_message || E'\n' ||
    format(E'\U0001F538 Sale %s · Team %s',
           COALESCE(NULLIF(TRIM(v_sale_name), ''), NULLIF(TRIM(v_sale_email), ''), '?'),
           COALESCE(NULLIF(TRIM(v_sale_team), ''), '?'));

  -- Số tiền: ĐỒNG BỘ với tin báo tiền sau merge net-amount 10/7
  -- (2026-07-10-zalo-payment-paid-net-amount.sql) — thẻ/trả góp ưu tiên thực nhận sau phí,
  -- tránh 2 tin trong cùng nhóm hiển thị 2 số khác nhau cho cùng 1 lần TT.
  IF LOWER(COALESCE(v_line.method, '')) IN ('card', 'installment')
     AND v_line.verified_received IS NOT NULL THEN
    v_message := v_message || E'\n' ||
      format(E'\U0001F538 Lần TT (thực nhận): %s VND',
             to_char(v_line.verified_received, 'FM999,999,999,999'));
  ELSE
    v_message := v_message || E'\n' ||
      format(E'\U0001F538 Lần TT: %s VND', to_char(v_line.amount, 'FM999,999,999,999'));
  END IF;

  -- Upsert: up thêm ảnh trong lúc CHƯA gửi → merge vào 1 tin. Đã gửi rồi → không gửi lại (chống spam).
  INSERT INTO public.zalo_outbox (event_type, source_table, source_id, group_id, message, image_urls)
  VALUES ('bill_uploaded', 'payment_lines', v_line.id, v_group_id, v_message, v_image_urls)
  ON CONFLICT (source_table, source_id, event_type) DO UPDATE
    SET image_urls = EXCLUDED.image_urls,
        message    = EXCLUDED.message
    WHERE zalo_outbox.sent_at IS NULL;
  RETURN true;
END;
$function$;

-- 3. Security: theo pattern 2026-07-06-security-revoke-rpc — chỉ backend (service_role) được gọi qua PostgREST
REVOKE EXECUTE ON FUNCTION public.enqueue_bill_uploaded_zalo(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.enqueue_bill_uploaded_zalo(uuid) TO service_role;

-- 4. Trigger payment_paid: sau khi báo tiền, nếu line ĐÃ có bill sẵn (up trước khi xác nhận)
--    thì bắn luôn tin bill theo sau. Body copy từ 2026-06-23-zalo-oa-tables.sql:137 + 1 dòng PERFORM.
CREATE OR REPLACE FUNCTION public.fn_payment_paid_zalo_notify()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_sale_email TEXT;
  v_sale_team TEXT;
  v_group_id TEXT;
  v_message TEXT;
BEGIN
  IF NEW.status = 'paid' AND (OLD.status IS NULL OR OLD.status != 'paid') THEN
    SELECT pr.sale_email, ns.team
      INTO v_sale_email, v_sale_team
      FROM public.payment_requests pr
      LEFT JOIN public.nhan_su_sale ns ON ns.email ILIKE pr.sale_email
      WHERE pr.id = NEW.payment_request_id
      LIMIT 1;

    SELECT group_id INTO v_group_id
      FROM public.zalo_team_groups
      WHERE team_code = v_sale_team AND is_active = true
      LIMIT 1;

    IF v_group_id IS NULL THEN
      RAISE WARNING 'No active Zalo group mapping found for team: %', v_sale_team;
      RETURN NEW;
    END IF;

    v_message := public.build_payment_paid_message(NEW);

    INSERT INTO public.zalo_outbox (event_type, source_table, source_id, group_id, message)
    VALUES ('payment_paid', 'payment_lines', NEW.id, v_group_id, v_message)
    ON CONFLICT (source_table, source_id, event_type) DO NOTHING;

    -- Bill đã up từ trước → bắn tin bill NGAY SAU tin tiền (id outbox lớn hơn → worker gửi sau)
    PERFORM public.enqueue_bill_uploaded_zalo(NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;
```

- [ ] **Step 2: Lint mắt thường** — check 3 điểm: CHECK constraint giữ đủ 4 giá trị cũ; `ON CONFLICT ... WHERE zalo_outbox.sent_at IS NULL`; KHÔNG có `DROP` nào trong file này.

- [ ] **Step 3: Commit**

```bash
git add backend/migrations/2026-07-10-zalo-bill-uploaded-event.sql
git commit -m "feat(zalo): migration bill_uploaded event + enqueue fn (single SQL impl)"
```

### Task 2: Python — hook upload endpoint + allowlist + worker ordering (TDD)

**Files:**
- Test (create): `backend/tests/test_bill_uploaded_enqueue.py`
- Modify: `backend/payment_request_routes.py` (helper gần `_persist_bill_image` ~dòng 558; call site trong `upload_payment_line_bill` — def ở dòng 2308 — sau block re-read `line`, ~dòng 2380. Vùng này có sẵn WIP audit log `payment_line.bill_uploaded` chưa commit — GIỮ nguyên, chèn thêm)
- Modify: `backend/utils/zalo_message_builder.py:29-31`
- Modify: `backend/zalo_outbox_worker.py:113`

- [ ] **Step 1: Viết failing test** — full nội dung file `backend/tests/test_bill_uploaded_enqueue.py`:

```python
"""Tests for bill_uploaded Zalo enqueue hook (best-effort, upload endpoint)."""
from payment_request_routes import _maybe_enqueue_bill_uploaded_zalo


class _FakeRpcResult:
    def execute(self):
        return None


class FakeSb:
    def __init__(self, fail: bool = False):
        self.calls = []
        self._fail = fail

    def rpc(self, name, params):
        self.calls.append((name, params))
        if self._fail:
            raise RuntimeError("boom")
        return _FakeRpcResult()


def test_paid_line_enqueues_rpc():
    sb = FakeSb()
    _maybe_enqueue_bill_uploaded_zalo(sb, {"id": "L1", "status": "paid"})
    assert sb.calls == [("enqueue_bill_uploaded_zalo", {"p_line_id": "L1"})]


def test_non_paid_line_skips_rpc():
    sb = FakeSb()
    _maybe_enqueue_bill_uploaded_zalo(sb, {"id": "L1", "status": "pending"})
    assert sb.calls == []


def test_rpc_error_never_breaks_upload():
    sb = FakeSb(fail=True)
    _maybe_enqueue_bill_uploaded_zalo(sb, {"id": "L1", "status": "paid"})  # must NOT raise
    assert sb.calls  # đã thử gọi


def test_allowlist_contains_bill_uploaded():
    from utils.zalo_message_builder import ZALO_ENABLED_EVENTS
    assert "bill_uploaded" in ZALO_ENABLED_EVENTS
    assert "payment_paid" in ZALO_ENABLED_EVENTS
```

- [ ] **Step 2: Chạy test, phải FAIL**

Run: `cd backend && python -m pytest tests/test_bill_uploaded_enqueue.py -v`
Expected: FAIL — `ImportError: cannot import name '_maybe_enqueue_bill_uploaded_zalo'`

- [ ] **Step 3: Implement helper** — thêm vào `backend/payment_request_routes.py`, đặt ngay TRÊN `def _persist_bill_image` (~dòng 556):

```python
def _maybe_enqueue_bill_uploaded_zalo(sb, line: dict) -> None:
    """Line đã paid + vừa có bill mới → enqueue tin ảnh bill Zalo (best-effort, không chặn upload).

    Logic thật nằm trong SQL fn enqueue_bill_uploaded_zalo (migration 2026-07-10):
    tự check status/bill/group và tự chống trùng — Python chỉ gọi RPC.
    """
    try:
        if (str(line.get("status") or "").strip().lower()) == "paid":
            sb.rpc("enqueue_bill_uploaded_zalo", {"p_line_id": line.get("id")}).execute()
    except Exception as exc:
        print(f"[zalo] enqueue bill_uploaded failed for line {line.get('id')}: {exc}")
```

- [ ] **Step 4: Gắn call site** — trong `upload_payment_line_bill`, NGAY SAU block re-read line (sau `except Exception: pass` ~dòng 2369, TRƯỚC `bill_assets = _fetch_bill_assets_fast(...)`):

```python
        _maybe_enqueue_bill_uploaded_zalo(sb, line)
```

(Lưu ý: `line` lúc này là bản mới nhất sau upload; nếu re-read fail thì là bản cũ — status không đổi bởi upload nên vẫn đúng.)

- [ ] **Step 5: Allowlist** — sửa `backend/utils/zalo_message_builder.py:29-31` thành:

```python
# Events currently active on Zalo — only these go to zalo_outbox (Python paths).
# NOTE: DB triggers KHÔNG bị gate bởi set này; course_activated tắt bằng migration Phase 2.
# activation_request_created + activation_urgent_reminder are paused (9/7).
ZALO_ENABLED_EVENTS: frozenset[str] = frozenset({"payment_paid", "course_activated", "bill_uploaded"})
```

(`course_activated` chỉ bỏ ở Phase 2 sau Gate A/B.)

- [ ] **Step 6: Worker ordering** — `backend/zalo_outbox_worker.py`, trong `poll_and_send`, thêm sort phụ theo `id` để tin tiền (insert trước, id nhỏ hơn) luôn gửi trước tin bill khi `created_at` bằng nhau (cùng transaction):

```python
            .order("created_at", desc=False)
            .order("id", desc=False)
```

- [ ] **Step 7: Chạy toàn bộ test backend, phải PASS**

Run: `cd backend && python -m pytest tests/ -q`
Expected: PASS toàn bộ (test mới + regression cũ: `test_activation_bill_guard.py`, `test_zalo_worker_multi_image.py`, `test_zalo_builder.py`, `test_zalo_outbox_worker.py`).

- [ ] **Step 8: Commit**

```bash
git add backend/tests/test_bill_uploaded_enqueue.py backend/payment_request_routes.py backend/utils/zalo_message_builder.py backend/zalo_outbox_worker.py
git commit -m "feat(zalo): enqueue bill_uploaded on upload + deterministic outbox ordering"
```

### Task 3: UAT script — case E cho bill_uploaded

**Files:**
- Modify: `scripts/uat_staging_zalo.py` (CASES dict ~dòng 52-106; `insert_case` ~dòng 130)

- [ ] **Step 1: Thêm case E vào `CASES`** (sau case "D"):

```python
    "E": {
        "label": "bill_uploaded → text 🧾 + ảnh bill (multi qua image_urls)",
        "event_type": "bill_uploaded",
        "message": (
            "🧾 BILL - KH Nguyễn Văn UAT E\n"
            "🔸 Sale UAT · Team Inhouse 2\n"
            "🔸 Lần TT: 4,999,000 VND"
        ),
        "image_url": None,
        "image_urls": [VALID_BILL],
        "expect_image_sent": True,
        "expect_image_error": False,
    },
```

- [ ] **Step 2: `insert_case` hỗ trợ `image_urls`** — sau khi build `payload` (~dòng 140, trước `.insert(payload)`):

```python
    if c.get("image_urls"):
        payload["image_urls"] = c["image_urls"]
```

- [ ] **Step 3: Commit**

```bash
git add scripts/uat_staging_zalo.py
git commit -m "test(zalo): UAT case E bill_uploaded"
```

### Task 4: FE — label event mới

**Files:**
- Modify: `frontend/src/components/admin/ZaloOutboxTab.tsx:27-28` (map `eventLabel`)

- [ ] **Step 1: Thêm label** — map hiện có `payment_paid: "Báo tiền về"`, `course_activated: "Kích hoạt TP"`; thêm dòng:

```ts
  bill_uploaded: "Ảnh bill",
```

(GIỮ label `course_activated` — rows lịch sử vẫn cần hiển thị sau Phase 2.)

- [ ] **Step 2: Type check (bắt buộc `tsc -b`, không dùng `--noEmit`)**

Run: `cd frontend && npx tsc -b`
Expected: exit 0, không error.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/admin/ZaloOutboxTab.tsx
git commit -m "feat(zalo-outbox): label for bill_uploaded event"
```

---

## Phase 2 — Tắt `course_activated` trên Zalo (CHỈ sau Gate A + Gate B)

### Task 5: Migration B — drop trigger + huỷ tin chờ

**Files:**
- Create: `backend/migrations/2026-07-10-zalo-drop-course-activated.sql`

- [ ] **Step 1: Viết migration** — full nội dung:

```sql
-- Migration: tắt thông báo "kích hoạt thành công" trên Zalo — chuyển hẳn sang DingTalk + web GMV
-- Yêu cầu sale (chị Vân) 10/7, anh Hiếu duyệt (Gate A). Date: 2026-07-10
--
-- ⚠️ GIỮ NGUYÊN public.build_course_activated_message — fn_course_activated_dingtalk_notify vẫn dùng!
-- ⚠️ GIỮ 'course_activated' trong CHECK constraint zalo_outbox — rows lịch sử cần pass validate.

DROP TRIGGER IF EXISTS trg_course_activated_zalo ON public.active_requests;
DROP FUNCTION IF EXISTS public.fn_course_activated_zalo_notify();

-- Huỷ các tin course_activated còn chờ gửi (retries=99 = convention "Đã huỷ" của cancel endpoint + FE)
UPDATE public.zalo_outbox
   SET retries = 99,
       last_error = 'Cancelled 2026-07-10: activation notifications moved to DingTalk',
       next_retry_at = NULL
 WHERE event_type = 'course_activated'
   AND sent_at IS NULL;
```

- [ ] **Step 2: Allowlist + test cập nhật.**

`backend/utils/zalo_message_builder.py:31`:

```python
# Events currently active on Zalo — only these go to zalo_outbox (Python paths).
# NOTE: DB triggers KHÔNG bị gate bởi set này. course_activated đã DROP trigger (10/7, sang DingTalk).
# activation_request_created + activation_urgent_reminder are paused (9/7).
ZALO_ENABLED_EVENTS: frozenset[str] = frozenset({"payment_paid", "bill_uploaded"})
```

`backend/tests/test_activation_bill_guard.py:6-12` — sửa function đầu thành:

```python
def test_allowlist_skips_zalo_enqueue():
    """Only payment_paid + bill_uploaded remain on Zalo; activation events moved off."""
    from utils.zalo_message_builder import ZALO_ENABLED_EVENTS
    assert "activation_request_created" not in ZALO_ENABLED_EVENTS
    assert "activation_urgent_reminder" not in ZALO_ENABLED_EVENTS
    assert "course_activated" not in ZALO_ENABLED_EVENTS
    assert "payment_paid" in ZALO_ENABLED_EVENTS
    assert "bill_uploaded" in ZALO_ENABLED_EVENTS
```

- [ ] **Step 3: Chạy test**

Run: `cd backend && python -m pytest tests/ -q`
Expected: PASS. Nếu `test_zalo_outbox_worker.py` hoặc `test_zalo_builder.py` fail vì còn reference `course_activated`: các test đó test worker/builder generic — builder Python `build_course_activated_message` GIỮ NGUYÊN (không xoá code), chỉ event không còn được enqueue. Không xoá test builder.

- [ ] **Step 4: Commit**

```bash
git add backend/migrations/2026-07-10-zalo-drop-course-activated.sql backend/utils/zalo_message_builder.py backend/tests/test_activation_bill_guard.py
git commit -m "feat(zalo): drop course_activated trigger — activation notifs move to DingTalk"
```

---

## Phase 3 — Guardrail DingTalk (kênh thay thế phải đáng tin trước khi gánh vai chính)

### Task 6: Fix dead-row infinite retry trong DingTalk worker

**Files:**
- Modify: `backend/dingtalk_outbox_worker.py:48-55` (query trong `poll_and_send`; dòng `.order("created_at", ...)` hiện ở 52)

- [ ] **Step 1: Thêm guard** — bug đã ghi trong skill dingtalk-notifications (4/7): row chết (`retries >= 4`) bị chọn lại mỗi 30s vĩnh viễn. Zalo worker có guard, DingTalk quên copy. Sửa query thành:

```python
        res = (
            sb.table("dingtalk_outbox")
            .select("*")
            .is_("sent_at", "null")
            .or_(f"next_retry_at.is.null,next_retry_at.lte.{now_iso}")
            .or_(f"retries.is.null,retries.lt.{MAX_RETRIES}")
            .order("created_at", desc=False)
            .limit(BATCH_SIZE)
            .execute()
        )
```

(`MAX_RETRIES` đã có sẵn trong module này. Đây là lý do vì sao khi DingTalk thành kênh chính cho activation, bug này phải fix TRƯỚC khi bật worker.)

- [ ] **Step 2: Verify bằng grep (tier-1 gate của skill)**

Run: `grep -n "retries.is.null" backend/dingtalk_outbox_worker.py backend/zalo_outbox_worker.py`
Expected: cả 2 file đều có 1 match.

- [ ] **Step 3: Commit**

```bash
git add backend/dingtalk_outbox_worker.py
git commit -m "fix(dingtalk): exclude dead rows from worker poll (copy zalo guard)"
```

- [ ] **Step 4: Ghi checklist "bật DingTalk" vào cuối file plan này (phần Notes) — KHÔNG thực hiện bây giờ:**
  1. Certification DingTalk xác nhận xong (đang chờ support, đã trả 299 CNY 8/7).
  2. `dingtalk_team_groups` có đủ team + `is_active=true` (verify: `SELECT team_code, is_active FROM dingtalk_team_groups;`).
  3. **Dọn tin tồn** trước khi bật flag — tin course_activated dồn từ nhiều tuần sẽ flood group: `UPDATE dingtalk_outbox SET retries = 99, next_retry_at = NULL, last_error = 'Skipped: queued while worker disabled' WHERE sent_at IS NULL AND created_at < now() - interval '1 day';`
  4. Set `DINGTALK_WORKER_ENABLED=true` trên Render → deploy → test send tới account NGƯỜI YÊU CẦU trước (rule 9/7: không gửi đồng nghiệp khi chưa hỏi).

---

## Phase 4 — Sandbox validation (trước merge main)

### Task 7: Apply migration + test SQL trên sandbox

**Môi trường:** Supabase sandbox `pxgybyfiwywksesyogti` (KHÔNG phải prod `jozcvbbypwvzaefteoxn`). Dùng Supabase MCP `apply_migration`/`execute_sql` hoặc SQL Editor.

- [ ] **Step 1: Apply Migration A** (`2026-07-10-zalo-bill-uploaded-event.sql`) lên sandbox.

- [ ] **Step 2: Test function trong transaction ROLLBACK** — không để lại row nào cho worker sandbox nhặt:

```sql
BEGIN;

-- Chọn 1 line thật đã paid + có bill (sandbox seed data)
-- (chạy SELECT này trước, thay <LINE_ID> bên dưới)
SELECT id, status, bill_images, bill_image FROM payment_lines
 WHERE status = 'paid'
   AND (jsonb_array_length(COALESCE(bill_images, '[]'::jsonb)) > 0 OR COALESCE(bill_image, '') != '')
 LIMIT 1;

SELECT public.enqueue_bill_uploaded_zalo('<LINE_ID>');   -- expect: true
SELECT event_type, source_id, group_id, LEFT(message, 100) AS msg, image_urls
  FROM zalo_outbox WHERE event_type = 'bill_uploaded';   -- expect: 1 row, message bắt đầu "🧾 BILL - KH"

SELECT public.enqueue_bill_uploaded_zalo('<LINE_ID>');   -- gọi lại: vẫn true (upsert)
SELECT COUNT(*) FROM zalo_outbox
 WHERE event_type = 'bill_uploaded' AND source_id = '<LINE_ID>';  -- expect: 1 (không trùng)

-- Line CHƯA paid → false, không tạo row
SELECT public.enqueue_bill_uploaded_zalo(
  (SELECT id FROM payment_lines WHERE status != 'paid' LIMIT 1));  -- expect: false

ROLLBACK;  -- không để lại dấu vết
```

- [ ] **Step 3 (nếu Gate A+B đã OK): Apply Migration B** rồi verify:

```sql
SELECT tgname FROM pg_trigger
 WHERE tgname IN ('trg_course_activated_zalo', 'trg_course_activated_dingtalk', 'trg_payment_paid_zalo');
-- expect: KHÔNG có trg_course_activated_zalo; CÒN trg_course_activated_dingtalk + trg_payment_paid_zalo

SELECT proname FROM pg_proc WHERE proname = 'build_course_activated_message';
-- expect: 1 row (fn dùng chung với DingTalk còn nguyên)
```

- [ ] **Step 4: Deploy BE sandbox + E2E tay qua app**

Run: `bash scripts/deploy.sh sandbox` (deploy hook, auto-deploy OFF)

Trên https://palfish-gmv-manager-sandbox.vercel.app/ (login test.admin@dev):
1. Xác nhận 1 lần thanh toán → check `zalo_outbox` có row `payment_paid`.
2. Upload bill cho line vừa paid → check row `bill_uploaded` xuất hiện, `image_urls` chứa URL mới, `id` LỚN HƠN id row payment_paid.
3. Upload thêm 1 ảnh nữa TRƯỚC khi worker gửi → row `bill_uploaded` vẫn 1 row, `image_urls` có 2 ảnh.
4. (Nếu Migration B đã apply) Kích hoạt 1 AR → `zalo_outbox` KHÔNG có row mới; `dingtalk_outbox` CÓ row `course_activated`.
5. Tab Zalo Outbox trên FE hiển thị event "Ảnh bill".

⚠️ Nếu sandbox không có `zalo_oa_credentials` (đã xoá theo runbook UAT): worker sẽ báo lỗi gửi — chấp nhận, mục tiêu Phase 4 là verify ENQUEUE đúng, không phải verify gửi. **TUYỆT ĐỐI không mint token mới** (revoke token prod ngay lập tức — gotcha 24/6).

- [ ] **Step 5 (optional, chỉ khi sandbox ĐANG có token hợp lệ): UAT gửi thật**

Run: `python scripts/uat_staging_zalo.py --case E`
Expected: tin nhắn có prefix `🧪 [TEST UAT]` + ảnh bill lên nhóm; row có `image_sent_at`. (Script tự guard chặn prod URL.)

---

## Phase 5 — Prod rollout

### Task 8: Merge + deploy + apply migration prod

- [ ] **Step 1: Squash các commit thành 1** (rule của Minh: gom related commits):

```bash
git log --oneline main..HEAD   # đếm N commit của task này
git reset --soft $(git merge-base main HEAD) && git commit -m "feat(zalo): tin ảnh bill riêng sau upload; chuyển thông báo kích hoạt sang DingTalk

- SQL fn enqueue_bill_uploaded_zalo duy nhất, gọi từ trigger payment_paid + RPC upload endpoint
- Drop trg_course_activated_zalo (giữ DingTalk trigger + shared builder fn)
- Worker: sort phụ theo id (tiền trước, bill sau); DingTalk worker: guard dead rows
- UAT case E, FE label, tests"
```

(Nếu đang làm trực tiếp trên main thì bỏ qua — commit theo task như trên nhưng gom trước khi push.)

- [ ] **Step 2: Thứ tự deploy prod (an toàn cả 2 chiều, đã phân tích):**
  1. Apply Migration A lên prod (`jozcvbbypwvzaefteoxn`). (BE cũ + DB mới: trigger tự lo tin bill cho case "bill có trước, paid sau" — chạy được ngay. BE mới + DB cũ cũng an toàn vì RPC call là best-effort.)
  2. (Gate A+B OK) Apply Migration B lên prod.
  3. Push main → Vercel FE tự deploy; BE: `bash scripts/deploy.sh` theo hướng dẫn trong `docs/DEPLOY.md` (deploy hook prod, auto-deploy OFF).

- [ ] **Step 3: Verify prod sau deploy:**

```sql
-- Constraint có bill_uploaded:
SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'zalo_outbox_event_type_check';
-- Trigger đúng trạng thái (nếu đã chạy Migration B thì trg_course_activated_zalo phải biến mất):
SELECT tgname FROM pg_trigger WHERE tgname LIKE 'trg_%zalo%' OR tgname LIKE 'trg_%dingtalk%';
-- Không có row course_activated pending nào sót:
SELECT COUNT(*) FROM zalo_outbox WHERE event_type = 'course_activated' AND sent_at IS NULL AND retries < 99;
```

- [ ] **Step 4: Monitor 1 ngày đầu:** khi có ca thật (kế toán xác nhận + sale up bill), check nhóm Zalo nhận đúng 2 tin theo thứ tự tiền → bill; `SELECT event_type, sent_at, image_sent_at, last_error FROM zalo_outbox ORDER BY id DESC LIMIT 20;` không có `image_error` bất thường. Báo chị Vân/chị Hiền confirm format.

- [ ] **Step 5: Chạy skill `extract-approach`** (Learning Law) — ghi learnings: single-SQL-impl chống format drift; trigger DB không bị Python allowlist gate; thứ tự tin cùng transaction cần sort phụ theo id.

### Rollback (nếu prod có sự cố)

```sql
-- Khôi phục course_activated Zalo: chạy lại nguyên văn function + trigger trong
-- backend/migrations/2026-07-08-zalo-outbox-image-urls.sql (fn mới nhất có image_urls)
-- rồi:
DROP TRIGGER IF EXISTS trg_course_activated_zalo ON public.active_requests;
CREATE TRIGGER trg_course_activated_zalo
  AFTER UPDATE ON public.active_requests
  FOR EACH ROW EXECUTE FUNCTION fn_course_activated_zalo_notify();

-- Tắt tin bill: khôi phục fn_payment_paid_zalo_notify từ 2026-06-23-zalo-oa-tables.sql:137-174
-- (bỏ dòng PERFORM). Function enqueue_bill_uploaded_zalo để nguyên (không ai gọi) hoặc DROP.
```

Code Python/FE: `git revert` commit squash. Không có data cần khôi phục (tin đã huỷ bằng retries=99 có thể Retry lại từng tin qua Outbox tab nếu cần).

---

## Guardrails tổng hợp (đã nhúng vào các task, liệt kê để executor tự check)

1. **Không mint token Zalo** trong bất kỳ bước nào (revoke chéo prod/sandbox).
2. **Tin test phải có prefix `🧪 [TEST]`** trước khi worker gửi (UAT script tự thêm; test tay phải tự thêm).
3. **KHÔNG drop `build_course_activated_message`** (SQL) — DingTalk trigger dùng chung.
4. **CHECK constraint giữ đủ giá trị cũ** — constraint mới re-validate toàn bộ rows lịch sử.
5. **Enqueue bill là best-effort** — không bao giờ được làm fail endpoint upload.
6. **ON CONFLICT ... WHERE sent_at IS NULL** — đã gửi rồi không gửi lại (chống spam khi up thêm ảnh muộn; limitation ghi nhận: ảnh up sau khi tin đã gửi sẽ không tự bắn, xử lý tay qua Retry nếu cần).
7. **Test SQL sandbox bọc BEGIN/ROLLBACK** — worker sandbox đang chạy 30s/lần, không để row test bị gửi thật.
8. **Phase 2 chặn bởi Gate A (anh Hiếu) + Gate B (DingTalk live)** — không tự ý deploy.
9. **Test DingTalk/Zalo chỉ gửi tới account người yêu cầu** (rule 9/7).
10. **`tsc -b`** cho FE, không dùng `--noEmit`.

## Đánh giá theo 4 tiêu chí của Minh

1. **Triệt để:** Tắt `course_activated` bằng DROP trigger tại nguồn (không phải filter che ở worker); tin bill cover CẢ 2 thứ tự nghiệp vụ (bill trước→paid sau qua trigger; paid trước→bill sau qua RPC upload); 1 implementation SQL duy nhất diệt hẳn class bug "Python/SQL format drift" đã từng phải maintain.
2. **Không lỗi con:** Huỷ tin pending khi drop trigger (không bắn tin lạc hậu sau deploy); sort phụ `id` chống đảo thứ tự tiền/bill; RPC revoke anon/authenticated theo pattern security 6/7; best-effort không phá upload; giữ CHECK values + shared fn cho DingTalk; fix bug dead-row DingTalk trước khi nó thành kênh chính; giữ label FE cho rows lịch sử.
3. **Không tăng gánh nặng hạ tầng/hiệu năng:** Zero service/cron/bảng mới — tái dùng outbox + worker + cột `image_urls` sẵn có; thêm đúng 1 SQL function; upload endpoint thêm 1 RPC call nhẹ (fire-and-forget); worker thêm 1 sort key (có index pending sẵn).
4. **Tiết kiệm quota:** Plan tự chứa 100% (code + SQL + expected output đầy đủ) → Sonnet 4.6 chạy inline 1 session, 0 subagent, không cần đọc lại spec/chat.

## Notes

- "Web GMV" cho kích hoạt = trạng thái duyệt xanh sẵn có trên app (chị Vân xác nhận đủ) — không cần code thêm.
- Python `build_course_activated_message` trong `zalo_message_builder.py` giữ nguyên (mirror docs, không phải live path); có thể dọn sau.
- Checklist "bật DingTalk worker" nằm ở Task 6 Step 4 — task riêng, không thuộc plan này.
