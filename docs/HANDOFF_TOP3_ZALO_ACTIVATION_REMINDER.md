# HANDOFF — TOP 3: Nhắc kích hoạt khóa học gấp qua Zalo

**Origin:** Feedback họp Onboard Offline 23/06/2026. Sales cần nút nhắc admin/ops (Thu Hiền) xử lý kích hoạt gấp khi KH cần học sớm.

**Estimated effort:** ~3-4 giờ FE + BE. Tận dụng hạ tầng Zalo outbox Giang đã build (G1-G7).

---

## Chiến lược thông báo: Zalo + Banner FE (chốt 23/6)

| Approach | Pros | Cons |
|---|---|---|
| Banner FE + polling | Đã có pattern | Admin không mở app = không biết. Polling tăng RAM prod Starter |
| Zalo OA push tới group ops | Ting ting kể cả offline. Tận dụng outbox. | Tin trôi đi sau nhiều tin mới |
| **Zalo + banner ActivationTab (load 1 lần)** ✅ chọn | Đủ cả 2 tầng. Không polling. Note + ai nhắc lưu vĩnh viễn đến khi resolve | Code FE thêm ~30 dòng |

→ **Chốt Zalo + Banner.** Banner chỉ GET reminders unresolved khi mở tab Kích hoạt (NO polling).

---

## Scope

### IN scope

**BE:**
1. Builder function `build_activation_urgent_reminder_message(...)` trong `backend/utils/zalo_message_builder.py`
2. Endpoint `POST /api/v1/payment-requests/{pr_id}/activation-urgent-remind` — enqueue Zalo + persist reminder row
3. Endpoint `GET /api/v1/payment-requests/{pr_id}/activation-urgent-remind/status` — trả `{can_remind, last_reminder}`
4. Endpoint `GET /api/v1/activation-urgent-reminders` — list reminders unresolved (cho banner ActivationTab; RBAC: admin/manager/leader+)
5. Migration tạo bảng `activation_reminders`
6. Trigger SQL auto-resolve: khi `active_requests.status = 'activated'` → set `resolved_at` cho reminders cùng pr_id

**FE — Drawer PR (sales bấm):**
7. Hook `useActivationRemind(prId)` trong `PaymentRequestDetailDrawer.tsx` (clone shape từ `useInvoiceRemind` line 1391-1429)
8. Nút "🔔 Nhắc kích hoạt gấp" trong drawer footer, cạnh nút "Nhắc xuất HĐ"
9. Modal nhập note tùy chọn (pattern Modal đã có)
10. Endpoint mapping ở `frontend/src/lib/api.ts`
11. Disable nút khi `can_remind=false`, tooltip "Đã nhắc lúc HH:mm bởi <X>"

**FE — Banner ActivationTab (admin xem):**
12. State `reminders` + `loadReminders` ở `ActivationTab.tsx` — load 1 lần khi mount, KHÔNG polling
13. Banner cam ở đầu tab: "Sales đang nhắc kích hoạt gấp (N)" + list từng reminder (KH name, ai nhắc, lúc nào, note) — clone style từ `InvoiceRequestTab.tsx:361-393`
14. Tooltip trên row tương ứng trong bảng PR/AR list (hover thấy "Sales nhắc lúc HH:mm — bởi X · note") — clone pattern `InvoiceRequestTab.tsx:679`
15. Hết banner tự động khi admin xử lý activate xong (trigger auto-resolve → reload sau action)

### Group Zalo nhận tin

**Hiện tại (chưa nâng gói Zalo OA):** Reuse group `IH2 — GMV Notify` đã có sẵn trong `zalo_team_groups` (team_code='Inhouse 2', group_id='df7d5a31765c9f02c64d', is_active=true).

**Lookup pattern BE:**
```python
g = sb.table("zalo_team_groups") \
    .select("group_id, is_active") \
    .eq("team_code", "Inhouse 2") \
    .limit(1).execute()
```

**TODO khi nâng gói GMF:** Tạo group GMF ops riêng → insert row mới `team_code='OPS_ACTIVATION'` → đổi BE lookup sang team_code mới. KHÔNG hard-code group_id.

### OUT of scope (KHÔNG được làm)

- KHÔNG refactor `invoice_reminders` thành unified `pr_reminders`
- KHÔNG implement realtime/SSE — banner load 1 lần đủ
- KHÔNG polling banner — chỉ reload sau admin action activate (tin Zalo đảm bảo real-time tier)
- KHÔNG sửa lại `useInvoiceRemind` — chỉ clone
- KHÔNG đụng `zalo_notifier.py`, `zalo_outbox_worker.py`
- KHÔNG thêm route admin "đánh dấu resolved" thủ công — auto-resolve qua trigger
- KHÔNG đụng `ZaloConfigTab` (Giang đang làm)
- KHÔNG tạo group GMF mới (chưa nâng gói Zalo OA)

---

## Hạ tầng đã có sẵn (tận dụng, KHÔNG build lại)

| Thành phần | Path | Vai trò |
|---|---|---|
| Zalo group send API client | `backend/zalo_notifier.py:311` `send_text_to_group(group_id, message, *, sb=None)` | Gọi `https://openapi.zalo.me/v3.0/oa/group/message`, auto refresh token |
| Outbox queue worker | `backend/zalo_outbox_worker.py` | Đang chạy, đọc `zalo_outbox`, retry tự động |
| Builder pattern | `backend/utils/zalo_message_builder.py` | Có sẵn `build_payment_paid_message`, `build_course_activated_message` |
| Group mapping table | `zalo_team_groups` (Supabase — đúng tên là `zalo_team_groups`, KHÔNG phải `zalo_groups`) | `team_code → group_id`. Giang G3 đã có CRUD endpoints. Sandbox đã seed row team_code='Inhouse 2' = group IH2 - GMV Notify |
| FE handoff context | `memory/zalo-giang-fe-handoff.md` | Biết BE nào ready |

**Pattern enqueue (BE):** Insert row vào `zalo_outbox`:
```python
sb.table("zalo_outbox").insert({
    "event_type": "activation_urgent_reminder",
    "group_id": group_id,  # lookup từ zalo_team_groups WHERE team_code='OPS_ACTIVATION'
    "message": message,    # output của builder
    "created_at": now_iso(),
}).execute()
```
Worker tự pick lên gửi. KHÔNG gọi `send_text_to_group` trực tiếp ở route.

---

## BE chi tiết

### Migration `docs/migrations/2026-06-23-activation-reminders.sql`

```sql
-- Bảng nhắc kích hoạt gấp (clone schema invoice_reminders)
CREATE TABLE IF NOT EXISTS public.activation_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_request_id uuid NOT NULL REFERENCES public.payment_requests(id) ON DELETE CASCADE,
  requested_by uuid REFERENCES auth.users(id),
  requested_by_name text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  note text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activation_reminders_pr_unresolved
  ON public.activation_reminders (payment_request_id)
  WHERE resolved_at IS NULL;

-- Trigger auto-resolve khi active_request đã kích hoạt
CREATE OR REPLACE FUNCTION public.fn_auto_resolve_activation_reminders()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'activated' AND (OLD.status IS DISTINCT FROM 'activated') THEN
    UPDATE public.activation_reminders
       SET resolved_at = now()
     WHERE payment_request_id = NEW.payment_request_id
       AND resolved_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_resolve_activation_reminders ON public.active_requests;
CREATE TRIGGER trg_auto_resolve_activation_reminders
AFTER UPDATE OF status ON public.active_requests
FOR EACH ROW EXECUTE FUNCTION public.fn_auto_resolve_activation_reminders();

NOTIFY pgrst, 'reload schema';
```

**Apply order:** sandbox `pxgybyfiwywksesyogti` trước → soak 1 ngày → prod `jozcvbbypwvzaefteoxn`.

### Seed `zalo_team_groups` row

**SKIP seed — đã có sẵn ở sandbox:** `team_code='Inhouse 2'`, `group_id='df7d5a31765c9f02c64d'`, `group_name='IH2 — GMV Notify'`, `is_active=true`.

**BE lookup pattern:** đặt constant ở top file `activation_routes.py`:
```python
OPS_GROUP_TEAM_CODE = "Inhouse 2"  # TODO: đổi sang 'OPS_ACTIVATION' khi nâng gói Zalo OA + tạo group GMF riêng
```

**Lưu ý prod:** prod (`jozcvbbypwvzaefteoxn`) chưa có bảng `zalo_team_groups` — Zalo BE chỉ deploy sandbox. Migration TOP 3 prod phải đợi sau khi Giang deploy Zalo BE migration lên prod, hoặc handoff hold ở sandbox-only.

### Builder `backend/utils/zalo_message_builder.py`

Thêm hàm mới (cùng style với 2 hàm hiện có):

```python
def build_activation_urgent_reminder_message(
    *,
    pr_code: str,
    customer_name: str,
    courses_total: int,
    courses_activated: int,
    sale_name: str,
    note: str | None = None,
) -> str:
    """Build Zalo message for urgent activation reminder."""
    lines = [
        "⚡ Cần kích hoạt khóa học GẤP",
        f"PR-{pr_code} · {customer_name}",
        f"Gói: {courses_activated}/{courses_total}",
        f"Sale nhắc: {sale_name}",
    ]
    if note and note.strip():
        lines.append(f"Note: {note.strip()}")
    return "\n".join(lines)
```

### Endpoints `backend/activation_routes.py`

Thêm constant ở top file:
```python
OPS_GROUP_TEAM_CODE = "Inhouse 2"  # TODO: đổi sang 'OPS_ACTIVATION' khi nâng gói Zalo OA + tạo group GMF riêng
```

Thêm 3 endpoint, dùng RBAC `require_sale_or_higher` (mọi role có thể nhắc PR của mình; admin có thể nhắc tất). Verify scope:

```python
@router.post("/payment-requests/{pr_id}/activation-urgent-remind")
def create_activation_urgent_reminder(
    pr_id: str,
    body: ActivationReminderBody,  # {note: str | None}
    user=Depends(require_sale_or_higher),
    sb=Depends(get_supabase),
):
    # 1. Load PR + check ownership / sub-team scope (dùng rbac helper hiện có)
    pr = _load_pr_with_scope(sb, pr_id, user)
    if not pr:
        raise HTTPException(404)

    # 2. Check PR đủ tiền
    if pr["received"] < pr["target"]:
        raise HTTPException(400, "PR chưa đủ tiền, không thể nhắc kích hoạt gấp")

    # 3. Check active_request chưa "activated"
    ar = _load_active_request_by_pr(sb, pr_id)
    if ar and ar.get("status") == "activated":
        raise HTTPException(400, "Khóa học đã được kích hoạt")

    # 4. Rate limit: 1 reminder active per PR
    existing = sb.table("activation_reminders") \
        .select("id, requested_at, requested_by_name") \
        .eq("payment_request_id", pr_id) \
        .is_("resolved_at", "null") \
        .limit(1).execute()
    if existing.data:
        raise HTTPException(429, "Đã có lượt nhắc đang chờ xử lý")

    # 5. Insert reminder row
    sale_name = user.get("display_name") or user.get("email") or "Sale"
    reminder = sb.table("activation_reminders").insert({
        "payment_request_id": pr_id,
        "requested_by": user["id"],
        "requested_by_name": sale_name,
        "note": (body.note or "").strip() or None,
    }).execute()

    # 6. Lookup group_id từ zalo_team_groups
    g = sb.table("zalo_team_groups") \
        .select("group_id, is_active") \
        .eq("team_code", OPS_GROUP_TEAM_CODE) \
        .limit(1).execute()
    if not g.data or not g.data[0]["is_active"]:
        # Reminder vẫn lưu (để banner FE hiện), nhưng không enqueue Zalo. Log warning.
        return {"ok": True, "zalo": "skipped_no_group", "reminder": reminder.data[0]}

    # 7. Build message + enqueue
    message = build_activation_urgent_reminder_message(
        pr_code=pr["code"],
        customer_name=pr["name"],
        courses_total=ar.get("courses_total", 0) if ar else 0,
        courses_activated=ar.get("courses_activated", 0) if ar else 0,
        sale_name=sale_name,
        note=body.note,
    )
    sb.table("zalo_outbox").insert({
        "event_type": "activation_urgent_reminder",
        "group_id": g.data[0]["group_id"],
        "message": message,
    }).execute()

    return {
        "ok": True,
        "reminder": reminder.data[0],
    }


@router.get("/payment-requests/{pr_id}/activation-urgent-remind/status")
def get_activation_urgent_reminder_status(
    pr_id: str,
    user=Depends(require_sale_or_higher),
    sb=Depends(get_supabase),
):
    pr = _load_pr_with_scope(sb, pr_id, user)
    if not pr:
        raise HTTPException(404)

    res = sb.table("activation_reminders") \
        .select("requested_at, requested_by_name") \
        .eq("payment_request_id", pr_id) \
        .is_("resolved_at", "null") \
        .order("requested_at", desc=True) \
        .limit(1).execute()

    return {
        "can_remind": len(res.data) == 0,
        "last_reminder": res.data[0] if res.data else None,
    }


@router.get("/activation-urgent-reminders")
def list_activation_urgent_reminders(
    user=Depends(require_min_role_leader),  # admin / manager / leader
    sb=Depends(get_supabase),
):
    """List reminders chưa resolved cho banner ActivationTab."""
    # JOIN với payment_requests để lấy pr_code, customer_name
    res = sb.table("activation_reminders") \
        .select("id, payment_request_id, requested_by_name, requested_at, note, payment_requests(code, name)") \
        .is_("resolved_at", "null") \
        .order("requested_at", desc=True) \
        .execute()

    reminders = [
        {
            "id": r["id"],
            "payment_request_id": r["payment_request_id"],
            "pr_code": (r.get("payment_requests") or {}).get("code", ""),
            "customer_name": (r.get("payment_requests") or {}).get("name", ""),
            "requested_by_name": r["requested_by_name"],
            "requested_at": r["requested_at"],
            "note": r.get("note"),
        }
        for r in (res.data or [])
    ]
    return {"reminders": reminders}
```

**Lưu ý:**
- `_load_pr_with_scope` + `_load_active_request_by_pr` đã có helper trong `activation_routes.py` hoặc `rbac.py` — REUSE, đừng viết lại
- `require_sale_or_higher` / `require_min_role_leader` — tên có thể khác, check `rbac.py` để dùng đúng decorator
- Endpoint list KHÔNG filter theo sub-team scope (banner cho ops/admin xem toàn bộ, không bị giới hạn team)

---

## FE chi tiết

### `frontend/src/lib/api.ts` — thêm endpoint

```ts
export const endpoints = {
  // ... existing
  activationUrgentRemind: {
    status: (prId: string) =>
      api.get<{ can_remind: boolean; last_reminder: { requested_at: string; requested_by_name: string } | null }>(
        `/payment-requests/${prId}/activation-urgent-remind/status`
      ),
    create: (prId: string, note?: string) =>
      api.post(`/payment-requests/${prId}/activation-urgent-remind`, { note }),
    list: () =>
      api.get<{
        reminders: Array<{
          id: string;
          payment_request_id: string;
          pr_code: string;
          customer_name: string;
          requested_by_name: string;
          requested_at: string;
          note: string | null;
        }>;
      }>(`/activation-urgent-reminders`),
  },
};
```

### Hook `useActivationRemind` — clone từ `useInvoiceRemind`

Thêm vào `PaymentRequestDetailDrawer.tsx` cạnh `useInvoiceRemind` (line 1391):

```tsx
function useActivationRemind(prId: string | null) {
  const [canRemind, setCanRemind] = useState(true);
  const [lastReminder, setLastReminder] = useState<{ requested_at: string; requested_by_name: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!prId) return;
    try {
      const res = await endpoints.activationUrgentRemind.status(prId);
      setCanRemind(res.data.can_remind);
      setLastReminder(res.data.last_reminder);
    } catch { /* ignore */ }
  }, [prId]);

  useEffect(() => { load(); }, [load]);

  const remind = useCallback(async (note?: string) => {
    if (!prId || sending) return;
    setSending(true);
    try {
      await endpoints.activationUrgentRemind.create(prId, note);
      setCanRemind(false);
      setLastReminder({ requested_at: new Date().toISOString(), requested_by_name: "Bạn" });
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setErrorMessage(
        typeof detail === "string" && detail
          ? detail
          : "Không gửi được nhắc kích hoạt gấp. Vui lòng thử lại."
      );
    } finally {
      setSending(false);
    }
  }, [prId, sending]);

  const dismissError = useCallback(() => setErrorMessage(null), []);
  return { canRemind, lastReminder, sending, remind, errorMessage, dismissError };
}
```

### Nút trong drawer

Trong cùng cụm footer với "Nhắc xuất HĐ" (line ~2267), thêm nút song song:

```tsx
<button
  className="btn btn-outline btn-sm"
  disabled={!canRemindActivation || activationRemindSending}
  onClick={() => setActivationRemindModalOpen(true)}
  title={
    !canRemindActivation && lastActivationReminder
      ? `Đã nhắc lúc ${formatPaymentDateFull(lastActivationReminder.requested_at)} bởi ${lastActivationReminder.requested_by_name}`
      : "Nhắc Ops/Thu Hiền kích hoạt khóa học gấp"
  }
>
  <Icons.Bell size={13} /> {activationRemindSending ? "Đang gửi…" : !canRemindActivation ? "Đã nhắc kích hoạt" : "Nhắc kích hoạt gấp"}
</button>
```

Modal nhập note dùng pattern `Modal` đã có. Khi confirm → gọi `remindActivation(note)`.

### Điều kiện hiển thị nút

Chỉ show nút khi:
- PR đã đủ tiền (`pr.received >= pr.target`)
- Active request đã được tạo nhưng chưa kích hoạt xong (`activeRequest && activeRequest.status !== 'activated'`)

Nếu chưa đủ điều kiện → ẨN nút (không show disabled — để UI gọn).

### Banner ở ActivationTab (admin xem)

Thêm vào `frontend/src/components/ActivationTab.tsx` đầu mỗi tab, copy pattern từ `InvoiceRequestTab.tsx:222-393`:

```tsx
// State + load
type ActivationReminder = {
  id: string;
  payment_request_id: string;
  pr_code: string;
  customer_name: string;
  requested_by_name: string;
  requested_at: string;
  note: string | null;
};
const [reminders, setReminders] = useState<ActivationReminder[]>([]);
const loadReminders = useCallback(async () => {
  try {
    const res = await endpoints.activationUrgentRemind.list();
    setReminders(res.data.reminders);
  } catch { /* ignore */ }
}, []);
useEffect(() => { loadReminders(); }, [loadReminders]);
// Map cho tooltip trên row
const reminderByPrId = useMemo(() => {
  const m = new Map<string, ActivationReminder>();
  for (const r of reminders) m.set(r.payment_request_id, r);
  return m;
}, [reminders]);

// Banner JSX — copy style InvoiceRequestTab.tsx:361-393
{reminders.length > 0 && (
  <div style={{
    padding: "10px 14px", borderRadius: 10,
    border: "1px solid #ffcc80", background: "#fff3e0",
    fontSize: 12.5, marginBottom: 8,
    display: "flex", alignItems: "flex-start", gap: 8,
  }}>
    <Icons.Bell size={15} style={{ color: "#e65100", flexShrink: 0, marginTop: 1 }} />
    <div>
      <strong style={{ color: "#e65100" }}>Sales đang nhắc kích hoạt gấp ({reminders.length})</strong>
      <div style={{ marginTop: 4, lineHeight: 1.6 }}>
        {reminders.map((rem) => {
          const dt = new Date(rem.requested_at);
          return (
            <div key={rem.id} style={{ color: "var(--text-2)" }}>
              <strong>{rem.customer_name || rem.pr_code}</strong>
              {" — nhắc bởi "}{rem.requested_by_name}
              {" lúc "}{dt.toLocaleDateString("vi-VN")}{" "}
              {dt.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
              {rem.note && <span style={{ color: "var(--text-3)" }}> · &ldquo;{rem.note}&rdquo;</span>}
            </div>
          );
        })}
      </div>
    </div>
  </div>
)}
```

**Reload banner khi nào:**
- Khi mount tab (đã có ở useEffect trên)
- Sau khi admin save activate xong (trong handler save → gọi `loadReminders()` để banner cập nhật ngay, không chờ user F5)

**KHÔNG polling.** KHÔNG dùng setInterval.

**Tooltip trên row trong bảng PR/AR list** (clone pattern InvoiceRequestTab.tsx:679):
```tsx
const rem = reminderByPrId.get(row.payment_request_id);
const tip = rem
  ? `Sales nhắc kích hoạt lúc ${new Date(rem.requested_at).toLocaleDateString("vi-VN")} ${new Date(rem.requested_at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })} — bởi ${rem.requested_by_name}${rem.note ? ` · "${rem.note}"` : ""}`
  : undefined;
// gắn vào <tr title={tip}> hoặc icon nhỏ
```

---

## Acceptance criteria

### BE
1. POST endpoint trả 200 khi PR đủ tiền + AR chưa activated
2. POST endpoint trả 400 khi PR chưa đủ tiền
3. POST endpoint trả 400 khi AR đã activated
4. POST endpoint trả 429 khi đã có reminder unresolved
5. POST endpoint chèn row vào `zalo_outbox` với `event_type='activation_urgent_reminder'` và đúng `group_id` của row `team_code='Inhouse 2'`
6. GET status trả `can_remind=false` sau khi tạo reminder
7. Khi `active_requests.status` UPDATE thành `activated` → trigger set `resolved_at` cho mọi reminder cùng pr_id → GET status trả `can_remind=true`
8. Row `team_code='Inhouse 2'` không tồn tại/`is_active=false` → endpoint vẫn 200, return `{zalo: "skipped_no_group", reminder: {...}}`, vẫn lưu reminder (banner FE vẫn hoạt động)
9. GET `/activation-urgent-reminders` trả list reminders unresolved, kèm pr_code + customer_name (join từ payment_requests)
10. Endpoint list yêu cầu role >= leader (sale thường không thấy được)

### FE — Drawer PR (sales)
11. Nút "Nhắc kích hoạt gấp" chỉ hiện khi PR đủ tiền + AR chưa activated
12. Bấm nút → modal mở → nhập note → confirm → toast/banner ghi "Đã nhắc lúc HH:mm"
13. Nút disabled + tooltip "Đã nhắc lúc HH:mm bởi <X>" khi đã có reminder unresolved
14. Sau khi admin kích hoạt khóa học xong → reload drawer → nút trở về enabled
15. Tất cả flow chạy qua `endpoints.activationUrgentRemind.*`, KHÔNG URL hard-code

### FE — Banner ActivationTab (admin)
16. Khi có reminders unresolved → banner cam "Sales đang nhắc kích hoạt gấp (N)" hiện đầu tab
17. Banner liệt kê từng reminder: KH name, ai nhắc, lúc nào, note (nếu có)
18. Row trong bảng PR/AR có tooltip "Sales nhắc kích hoạt lúc HH:mm — bởi X · note"
19. Sau khi admin save activate khóa học → banner reload tự động (call `loadReminders()` trong handler save)
20. Banner KHÔNG polling — load 1 lần khi mount + reload sau action

### End-to-end
21. Group Zalo IH2 — GMV Notify nhận tin nhắn với đúng format:
```
⚡ Cần kích hoạt khóa học GẤP
PR-2026-9128 · Lâm Thị Mến
Gói: 0/2
Sale nhắc: Test Sales Rep
Note: KH cần học T2
```

---

## Test plan

### BE unit/integration
- Thêm test `backend/tests/test_activation_urgent_reminder.py` cover 8 acceptance BE
- Mock Supabase + zalo_outbox insert; assert payload + status codes

### FE
- TypeScript: `cd frontend && npx tsc -b` PASS
- E2E test mới `frontend/e2e/activation-urgent-remind.spec.ts`:
  - Login sale → mở PR đủ tiền chưa activated → bấm "Nhắc kích hoạt gấp" → confirm → assert nút disabled
  - Login admin → activate khóa học → reload → assert nút sale enable trở lại

### Manual sandbox
1. Apply migration `activation_reminders` trên sandbox `pxgybyfiwywksesyogti`
2. Verify row `team_code='Inhouse 2'` đã có trong `zalo_team_groups` (đã seed sẵn)
3. Deploy BE sandbox + FE sandbox
4. Login sale (test.user@dev) → mở PR demo đủ tiền chưa activated → bấm nút → check group IH2 nhận tin
5. Login admin (test.admin@dev) → mở tab Kích hoạt → confirm banner cam "Sales đang nhắc kích hoạt gấp (1)" hiện đầu tab + tooltip trên row tương ứng
6. Admin save activate khóa học → confirm banner biến mất ngay (nhờ loadReminders sau save)
7. Login sale lại → confirm nút "Nhắc kích hoạt gấp" enable lại (trigger auto-resolve hoạt động)

---

## Anti-patterns (đừng làm)

1. **ĐỪNG** gọi `send_text_to_group` trực tiếp ở route — phải qua `zalo_outbox` (retry + decouple)
2. **ĐỪNG** clone toàn bộ logic của `invoice_remind` route. Chỉ clone shape của hook FE
3. **ĐỪNG** hard-code group_id vào code BE — phải lookup từ `zalo_team_groups`
4. **ĐỪNG** spam: thiếu rate limit 1-reminder-active = sales bấm 10 lần → group ngập tin
5. **ĐỪNG** quên trigger auto-resolve. Không có nó → reminder vĩnh viễn pending → nút mãi disabled
6. **ĐỪNG** dùng `setInterval` polling status ở FE. Một lần `load()` khi drawer mở + một lần sau `remind()` là đủ
7. **ĐỪNG** apply migration prod trước khi sandbox soak 1 ngày
8. **ĐỪNG** quên RBAC scope: sale chỉ nhắc được PR của mình (sub-team scope) — dùng helper `_load_pr_with_scope` đã có
9. **ĐỪNG** lưu Zalo error vào reminder row — outbox worker đã có cột `last_error`, đó là nơi đúng

---

## Dependencies / Prerequisites

- ✅ Zalo OA token active (memory: `zalo-oa-setup-progress.md`)
- ✅ Outbox worker đang chạy (Giang G7)
- ✅ Bảng `zalo_team_groups` + `zalo_outbox` đã tồn tại trên sandbox
- ✅ Row `team_code='Inhouse 2'` đã seed sẵn ở sandbox (group IH2 — GMV Notify, group_id `df7d5a31765c9f02c64d`)
- ✅ Chốt scope 23/6: Zalo + Banner ActivationTab (anh Minh confirm)
- ⚠️ **Prod chưa có bảng Zalo** — handoff hold ở sandbox-only; deploy prod đợi Giang Zalo BE migration

---

## Rollback plan

Nếu Zalo OA token bị disable / group bị xóa:
1. SET `is_active=false` ở row `zalo_team_groups` `team_code='Inhouse 2'`
2. Endpoint vẫn hoạt động, chỉ skip enqueue (acceptance #8)
3. Reminder row vẫn lưu → banner FE vẫn hoạt động cho admin xem

Nếu trigger gây side-effect không mong muốn:
```sql
DROP TRIGGER IF EXISTS trg_auto_resolve_activation_reminders ON public.active_requests;
```
Reminder lúc đó cần resolve thủ công qua UPDATE.
