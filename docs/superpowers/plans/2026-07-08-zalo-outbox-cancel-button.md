# Zalo Outbox — Nút Huỷ tin nhắn

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm nút "Huỷ" vào Zalo Outbox UI cho phép admin cancel tin nhắn chưa gửi, tránh gửi thông báo trùng/nhầm vào nhóm Zalo.

**Architecture:** Cancel = set `retries = 99` + `last_error = 'Cancelled by admin'` + `next_retry_at = null`. Worker query filter `retries.lt.4` tự động skip. Không cần thêm cột DB, không migration, không thay đổi worker logic.

**Tech Stack:** Python/FastAPI (BE), React/TypeScript (FE), Supabase Postgres

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `backend/admin_routes.py` | Modify (~line 1426) | Thêm endpoint `POST .../cancel` |
| `frontend/src/lib/api/zaloAdmin.ts` | Modify (line 107) | Thêm `cancelZaloOutbox()` |
| `frontend/src/components/admin/ZaloOutboxTab.tsx` | Modify | Nút Huỷ desktop + status "Đã huỷ" |
| `frontend/src/components/admin/ZaloOutboxCards.tsx` | Modify | Nút Huỷ mobile + status "Đã huỷ" |

---

### Task 1: BE — Cancel endpoint

**Files:**
- Modify: `backend/admin_routes.py:1426` (insert after retry endpoint, before line 1428)

- [ ] **Step 1: Add cancel endpoint**

Insert this block at `backend/admin_routes.py`, directly after the `retry_zalo_outbox` function (after line 1426, before the `# Zalo OA Configuration` comment block):

```python
    @app.post("/api/v1/admin/zalo-outbox/{msg_id}/cancel")
    def cancel_zalo_outbox(msg_id: int, authorization: str | None = Header(None)):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        require_module_write(sb, actor, "zalo")

        row = sb.table("zalo_outbox").select("sent_at").eq("id", msg_id).execute()
        if not row.data:
            raise HTTPException(404, f"Không tìm thấy tin nhắn Zalo Outbox với ID: {msg_id}")
        if row.data[0].get("sent_at"):
            raise HTTPException(400, "Tin nhắn đã gửi, không thể huỷ")

        sb.table("zalo_outbox").update({
            "retries": 99,
            "last_error": "Cancelled by admin",
            "next_retry_at": None,
        }).eq("id", msg_id).execute()

        return {"ok": True}
```

- [ ] **Step 2: Verify no syntax errors**

Run:
```bash
cd backend && python -c "import admin_routes; print('OK')"
```

If import fails, check indentation — this endpoint must be inside the same `register_admin_routes(app, get_supabase)` function body, at the same indent level as `retry_zalo_outbox`.

- [ ] **Step 3: Commit**

```bash
git add backend/admin_routes.py
git commit -m "feat(zalo-outbox): add cancel endpoint for pending messages"
```

---

### Task 2: FE API — cancelZaloOutbox

**Files:**
- Modify: `frontend/src/lib/api/zaloAdmin.ts:107` (append after `retryZaloOutbox`)

- [ ] **Step 1: Add cancel API function**

Append at the end of `frontend/src/lib/api/zaloAdmin.ts` (after line 107):

```typescript
export const cancelZaloOutbox = async (msgId: number): Promise<void> => {
  await api.post(`/api/v1/admin/zalo-outbox/${msgId}/cancel`);
};
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/lib/api/zaloAdmin.ts
git commit -m "feat(zalo-outbox): add cancelZaloOutbox API function"
```

---

### Task 3: FE Desktop — Nút Huỷ + trạng thái "Đã huỷ"

**Files:**
- Modify: `frontend/src/components/admin/ZaloOutboxTab.tsx`

- [ ] **Step 1: Add import**

Change the import at line 3 from:

```typescript
import {
  getZaloOutbox,
  retryZaloOutbox,
  type ZaloOutboxRow,
} from "../../lib/api/zaloAdmin";
```

to:

```typescript
import {
  getZaloOutbox,
  retryZaloOutbox,
  cancelZaloOutbox,
  type ZaloOutboxRow,
} from "../../lib/api/zaloAdmin";
```

- [ ] **Step 2: Update statusOf function**

Replace the `statusOf` function (lines 17-22) with:

```typescript
function statusOf(row: ZaloOutboxRow): { label: string; cls: string } {
  if (row.sent_at) return { label: "Đã gửi", cls: "bg-green-100 text-green-700" };
  if (row.retries >= 99) return { label: "Đã huỷ", cls: "bg-gray-100 text-gray-500" };
  if (row.retries >= 4) return { label: "Dead", cls: "bg-red-100 text-red-700" };
  if (row.retries > 0) return { label: `Retry ${row.retries}/4`, cls: "bg-yellow-100 text-yellow-700" };
  return { label: "Chờ gửi", cls: "bg-blue-100 text-blue-700" };
}
```

**Important:** The `retries >= 99` check MUST come before `retries >= 4`. Order matters.

- [ ] **Step 3: Add cancelling state and handleCancel**

After the existing `retrying` state (line 48), add:

```typescript
const [cancelling, setCancelling] = useState<number | null>(null);
```

After the `handleRetry` function (after line 84), add:

```typescript
  const handleCancel = async (id: number) => {
    setCancelling(id);
    setError(null);
    try {
      await cancelZaloOutbox(id);
      flash(`Đã huỷ tin #${id}`);
      await load();
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || "Lỗi huỷ tin");
    } finally {
      setCancelling(null);
    }
  };
```

- [ ] **Step 4: Pass onCancel + cancelling to mobile cards**

Update the `ZaloOutboxCards` usage (around line 116-121). Change from:

```typescript
        <ZaloOutboxCards
          rows={rows}
          loading={loading}
          retrying={retrying}
          onRetry={handleRetry}
          formatDate={formatDate}
        />
```

to:

```typescript
        <ZaloOutboxCards
          rows={rows}
          loading={loading}
          retrying={retrying}
          cancelling={cancelling}
          onRetry={handleRetry}
          onCancel={handleCancel}
          formatDate={formatDate}
        />
```

- [ ] **Step 5: Add Huỷ button in desktop table**

Find the desktop table action cell (lines 182-191). Replace:

```typescript
                  <td className="p-2 text-center">
                    {canRetry && (
                      <button
                        onClick={() => handleRetry(row.id)}
                        disabled={retrying === row.id}
                        className="px-2 py-0.5 text-xs rounded bg-yellow-50 text-yellow-700 hover:bg-yellow-100 disabled:opacity-50"
                      >
                        {retrying === row.id ? "..." : "Retry"}
                      </button>
                    )}
                  </td>
```

with:

```typescript
                  <td className="p-2 text-center space-x-1">
                    {canRetry && (
                      <>
                        <button
                          onClick={() => handleRetry(row.id)}
                          disabled={retrying === row.id}
                          className="px-2 py-0.5 text-xs rounded bg-yellow-50 text-yellow-700 hover:bg-yellow-100 disabled:opacity-50"
                        >
                          {retrying === row.id ? "..." : "Retry"}
                        </button>
                        {row.retries < 99 && (
                          <button
                            onClick={() => handleCancel(row.id)}
                            disabled={cancelling === row.id}
                            className="px-2 py-0.5 text-xs rounded bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50"
                          >
                            {cancelling === row.id ? "..." : "Huỷ"}
                          </button>
                        )}
                      </>
                    )}
                  </td>
```

**Note:** `canRetry` is `!row.sent_at` (line 148). Combined with `row.retries < 99`, Huỷ button only shows for pending/retrying messages, NOT for already-cancelled ones.

- [ ] **Step 6: Type check**

```bash
cd frontend && npx tsc -b
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/admin/ZaloOutboxTab.tsx
git commit -m "feat(zalo-outbox): add cancel button and cancelled status in desktop UI"
```

---

### Task 4: FE Mobile — Nút Huỷ trong cards

**Files:**
- Modify: `frontend/src/components/admin/ZaloOutboxCards.tsx`

- [ ] **Step 1: Update statusTone for cancelled**

Replace the `statusTone` function (lines 16-21) with:

```typescript
function statusTone(row: ZaloOutboxRow): { tone: "ok" | "danger" | "warn" | "primary" | "muted"; label: string } {
  if (row.sent_at) return { tone: "ok", label: "Đã gửi" };
  if (row.retries >= 99) return { tone: "muted", label: "Đã huỷ" };
  if (row.retries >= 4) return { tone: "danger", label: "Dead" };
  if (row.retries > 0) return { tone: "warn", label: `Retry ${row.retries}/4` };
  return { tone: "primary", label: "Chờ gửi" };
}
```

**Note:** Check if `Badge` component supports `tone="muted"`. If not, use `tone="primary"` and change label color manually — OR just keep `tone="danger"` with label "Đã huỷ". The safest option: check `frontend/src/components/ui/Badge.tsx` for supported tones. If "muted" is not there, use whichever neutral tone exists (likely there's no "muted" — in that case, keep the function as:

```typescript
function statusTone(row: ZaloOutboxRow): { tone: "ok" | "danger" | "warn" | "primary"; label: string } {
  if (row.sent_at) return { tone: "ok", label: "Đã gửi" };
  if (row.retries >= 99) return { tone: "warn", label: "Đã huỷ" };
  if (row.retries >= 4) return { tone: "danger", label: "Dead" };
  if (row.retries > 0) return { tone: "warn", label: `Retry ${row.retries}/4` };
  return { tone: "primary", label: "Chờ gửi" };
}
```

To decide: read `frontend/src/components/ui/Badge.tsx` and check what `tone` values are supported.

- [ ] **Step 2: Update Props interface**

Replace the `Props` interface (lines 23-29) with:

```typescript
interface Props {
  rows: ZaloOutboxRow[];
  loading: boolean;
  retrying: number | null;
  cancelling: number | null;
  onRetry: (id: number) => void;
  onCancel: (id: number) => void;
  formatDate: (iso?: string | null) => string;
}
```

- [ ] **Step 3: Update destructured props**

Replace the destructure (lines 31-37) with:

```typescript
export default function ZaloOutboxCards({
  rows,
  loading,
  retrying,
  cancelling,
  onRetry,
  onCancel,
  formatDate,
}: Props) {
```

- [ ] **Step 4: Add Huỷ button in card actions**

Replace the `actions` prop in the RowCard (lines 84-95) with:

```typescript
            actions={
              canRetry ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => onRetry(row.id)}
                    disabled={retrying === row.id}
                    className="min-h-[44px] px-2 text-xs rounded bg-yellow-50 text-yellow-700 hover:bg-yellow-100 disabled:opacity-50"
                  >
                    {retrying === row.id ? "..." : "Retry"}
                  </button>
                  {row.retries < 99 && (
                    <button
                      onClick={() => onCancel(row.id)}
                      disabled={cancelling === row.id}
                      className="min-h-[44px] px-2 text-xs rounded bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50"
                    >
                      {cancelling === row.id ? "..." : "Huỷ"}
                    </button>
                  )}
                </div>
              ) : undefined
            }
```

- [ ] **Step 5: Type check**

```bash
cd frontend && npx tsc -b
```

Expected: no errors. If Badge tone type error, apply fallback from Step 1 note.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/admin/ZaloOutboxCards.tsx
git commit -m "feat(zalo-outbox): add cancel button and cancelled status in mobile cards"
```

---

### Task 5: Visual verification

- [ ] **Step 1: Start dev server and verify**

```bash
cd frontend && npm run dev
```

Open Zalo Outbox tab. Verify:
1. Pending messages show both "Retry" and "Huỷ" buttons
2. Sent messages show no buttons
3. Click "Huỷ" → status changes to "Đã huỷ", buttons disappear
4. Cancelled messages show "Đã huỷ" badge, no Retry/Huỷ buttons

- [ ] **Step 2: Test Retry after Cancel still works**

Via Supabase SQL editor, manually reset a cancelled row to test:
```sql
UPDATE zalo_outbox SET retries = 0, last_error = null WHERE id = <test_id>;
```
Refresh outbox — row should show "Chờ gửi" with Retry + Huỷ buttons again.

- [ ] **Step 3: Check mobile layout**

Resize browser to mobile width. Verify cards show both buttons side by side.

---

## Safety analysis

| Criterion | Assessment |
|-----------|-----------|
| **Triệt để** | Cancel = retries 99 → worker filter `retries.lt.4` auto-skips. Guard chặn cancel tin đã gửi. Retry sau cancel vẫn work (reset retries=0). |
| **Không lỗi con** | `ON CONFLICT (source_table, source_id, event_type) DO NOTHING` — cancel không ảnh hưởng. statusOf check `>= 99` trước `>= 4` → không conflict Dead status. canRetry logic (`!sent_at`) giữ nguyên. |
| **Không tăng gánh nặng** | 0 migration, 0 cột mới, 0 thay đổi worker, 1 lightweight endpoint. |
| **Tiết kiệm quota** | 4 file, ~30 dòng thêm. Không cần subagent. |
