# Blur-click stale closure: draft flush before save

**Related files:** `frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx`

**Problem:** Editing UID/phone in the AR mini-editor (PR drawer) and clicking "Lưu" sent OLD values to the server — the field change was lost silently.

**Trap:** Assuming that `onBlur` → `mutate(setState)` completes before the click handler reads the updated prop. In React 18 with automatic batching, blur and click in the same user interaction are batched into ONE render — the `save()` closure still reads the stale `ar` prop from before the blur commit.

**Insight:** Any component that uses (1) local drafts + blur-commit pattern AND (2) a save button that reads the parent prop has this race. The blur fires `setState` on the parent, but the save handler runs in the same batch and reads the OLD prop. The fix is to flush drafts inline inside `save()` — rebuild the object from drafts before sending to the server, instead of trusting the prop.

**Rule:** When a component has `onBlur → commit(setState)` + `onClick → save(prop)`, the save function MUST apply uncommitted drafts itself. Search pattern: `grep -n 'onBlur.*commit\|onBlur.*save' frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx` — every commit function referenced in onBlur must have its draft also flushed in the save function.

**Verify:** `grep -A5 'const flushed' frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx | head -10` — should show draft flush block with uidDrafts/phoneDrafts/amountDrafts.
