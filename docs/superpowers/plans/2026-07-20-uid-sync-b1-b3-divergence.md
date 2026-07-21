# UID lệch giữa Thông tin khách (B1) và Kích hoạt khóa học (B3) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) hoặc superpowers:executing-plans để implement task-by-task. Steps dùng checkbox (`- [ ]`).

**Goal:** Khi UID trong bản kích hoạt (`active_requests.uids_data[].uid`) lệch với UID thông tin khách (`payment_requests.uid`) — dấu hiệu sale sửa UID ở B1 SAU khi AR đã tạo — kế toán/sale PHẢI nhìn thấy rõ (cảnh báo nổi bật, không mờ) + đồng bộ 1 chạm cho case 1-UID. KHÔNG bao giờ tự ghi đè âm thầm.

**Non-goal:** KHÔNG unify về single-source-of-truth (bỏ `uids_data.uid` đọc live từ PR) — refactor lớn, rủi ro cao, `uids_data` là per-học-viên + drive order_id/course code. KHÔNG BE auto-sync khi patch PR uid (rủi ro clobber UID học viên cố tình khác). Xem "Phương án đã cân nhắc".

**Architecture:** 1 pure fn `getUidSyncState` (thuần, testable — ground truth như `getInvoiceBlockers`) quyết định match / none / diverged; cắm vào đúng chỗ đang tính `isUidFromPr` (`ActivationTab.tsx:1187`) — nhánh dương (badge xanh "UID từ PR") giữ nguyên, THÊM nhánh âm (cảnh báo lệch + nút "Đồng bộ từ PR"). FE-only, không BE, không migration, không endpoint mới.

**Tech Stack:** React 19 + TS (Vitest). Không đụng backend.

**Commit policy:** User preference (feedback_squash_commits): 1 commit duy nhất ở Task 4 sau khi mọi gate pass.

---

## Bối cảnh (điều tra 20/7, line numbers tại commit 8e0b902)

**Sự cố gốc:** PR-2026-0391 — sale sửa UID khách ở B1 lúc 18/07 17:34 (VN) → `payment_requests.uid = 3314485764`. Nhưng AR-2026-0100 tạo trước đó 15:27, `uids_data[0].uid = 3314813941`, KHÔNG tự đổi → kế toán vào Kích hoạt vẫn thấy UID cũ. **Đã fix thủ công case này** (UPDATE prod 20/7, revertible). Quét toàn prod: **0/104 AR 1-UID còn lệch, 0/5 AR đa-UID lệch** — chỉ 1 case, nhưng bug hệ thống sẽ tái diễn.

| Sự thật | Vị trí | Ghi chú |
|---|---|---|
| 2 kho UID độc lập, KHÔNG auto-sync | `payment_requests.uid` vs `active_requests.uids_data[].uid` | Edit B1 không propagate sang AR đã tạo |
| AR tạo chụp snapshot uid từ modal, KHÔNG đọc `pr.uid` | `backend/activation_routes.py:1315` `_assign_course_codes(uids_in,…)` | uid đến từ user gõ ở modal tạo AR |
| Writeback chỉ 1 chiều AR→PR khi PR.uid rỗng | `activation_routes.py:1360` `_writeback_pr_uid_from_ar` | Không có chiều PR→AR |
| Patch PR uid KHÔNG đụng `active_requests` | `payment_request_routes.py:1785` `patch_payment_request` | 0 dòng ghi uids_data |
| **Đã có** so uid khối vs `pr.uid` → badge "✓ UID từ PR" | `ActivationTab.tsx:1187-1188` (`isUidFromPr`) + render `1260-1264` | Nhánh khớp có badge xanh; **nhánh lệch hiện KHÔNG hiện gì** ← lỗ hổng |
| Effect auto-fill CHỈ điền phone/country khi thiếu, KHÔNG đụng uid | `ActivationTab.tsx:588-615` (comment `603`: "never overwrite manual values") | Triết lý nhà: không tự ghi đè uid → phương án này bám đúng |
| Handler lưu uid khối | `ActivationTab.tsx:703` `saveUidHeader` → `onPersist` (full-payload uids_data) | Tái dùng làm mẫu cho nút đồng bộ |
| FE đã có sẵn `pr` (linked PR) + `prByUid` map trong drawer | `ActivationTab.tsx:178,595,1188` | Dependency đủ — KHÔNG cần BE trả thêm field |

## 3 tiêu chí (feedback_3_criteria_for_solutions)

1. **Triệt để:** mọi lần lệch trong tương lai HIỆN NGAY tại nơi kế toán làm việc (drawer kích hoạt) — diệt gốc vấn-đề-người-dùng (stale UID vô hình). Không còn "sale bảo sửa rồi mà vẫn cũ".
2. **Không lỗi con:** KHÔNG tự ghi đè. 1-chạm chỉ cho AR 1-UID (không map nhầm khi đa-UID/đa-con). UID khối thuộc PR khác (`prByUid` hit) = hợp lệ, không cảnh báo nhầm. Chỉ đổi đúng chuỗi uid, giữ nguyên phone/country/course/order_id.
3. **Không tăng gánh hạ tầng/giảm hiệu năng:** FE-only, 0 endpoint, 0 migration, so sánh chuỗi trong vòng map render sẵn có — 0 chi phí thêm.

## Guardrails (bắt buộc giữ)

1. **G-UID1 — 1-chạm chỉ cho AR 1-UID** (`ar.uids.length === 1`). AR đa-UID lệch → chỉ cảnh báo, KHÔNG nút auto (sale sửa tay qua ô + Lưu sẵn có). Khớp phạm vi scan DB.
2. **G-UID2 — không ghi đè âm thầm:** cảnh báo + click tường minh; đồng nhất triết lý effect `ActivationTab.tsx:603`.
3. **G-UID3 — sync chỉ đổi chuỗi `uid`:** phone/country/courses/order_id/course code/name giữ nguyên. Tái dùng đường `onPersist` full-payload, swap đúng 1 field.
4. **G-UID4 — so `String(...).trim()` cả 2 phía;** `pr.uid` rỗng HOẶC uid khối rỗng → KHÔNG cảnh báo (không có nguồn chuẩn để đối chiếu).
5. **G-UID5 — `prByUid` hit = khớp hợp lệ:** uid khối thuộc 1 PR nào đó (đa-con) không phải lệch. Giữ nguyên logic `isUidFromPr` cũ, chỉ thêm nhánh âm cho phần CÒN LẠI.
6. **G-UID6 — tôn trọng `locked`/`readOnly`:** khóa → ẨN nút đồng bộ, VẪN hiện cảnh báo (read-only thấy để báo sale). Khớp các control edit khác.
7. **G-UID7 — 1 chiều PR→AR khi click.** KHÔNG viết ngược `pr.uid` từ control này (giữ AR edit độc lập).
8. **G-UID8 — FE-only:** không sửa `backend/`, không migration, không đổi payload API.
9. **`tsc -b`** (không `--noEmit`) trước push.

---

### Task 1: Pure helper `getUidSyncState` + tests (TDD)

**Files:**
- Create: `frontend/src/components/ActivationTab.uidSync.ts`
- Create: `frontend/src/components/ActivationTab.uidSync.test.ts`

- [ ] **Step 1: Viết test FAIL trước**

```ts
// frontend/src/components/ActivationTab.uidSync.test.ts
import { describe, it, expect } from "vitest";
import { getUidSyncState } from "./ActivationTab.uidSync";

describe("getUidSyncState", () => {
  it("uid khối === pr.uid → match (badge 'UID từ PR' giữ nguyên)", () => {
    expect(getUidSyncState("3314485764", "3314485764", { matchedOtherPr: false, singleUid: true }))
      .toEqual({ kind: "match" });
  });
  it("uid khối rỗng → none (không cảnh báo)", () => {
    expect(getUidSyncState("", "3314485764", { matchedOtherPr: false, singleUid: true }))
      .toEqual({ kind: "none" });
    expect(getUidSyncState(null, "3314485764", { matchedOtherPr: false, singleUid: true }))
      .toEqual({ kind: "none" });
  });
  it("pr.uid rỗng → none (không có nguồn chuẩn để đối chiếu)", () => {
    expect(getUidSyncState("3314813941", "", { matchedOtherPr: false, singleUid: true }))
      .toEqual({ kind: "none" });
    expect(getUidSyncState("3314813941", null, { matchedOtherPr: false, singleUid: true }))
      .toEqual({ kind: "none" });
  });
  it("lệch + AR 1-UID + không khớp PR khác → diverged, cho 1-chạm", () => {
    expect(getUidSyncState("3314813941", "3314485764", { matchedOtherPr: false, singleUid: true }))
      .toEqual({ kind: "diverged", prUid: "3314485764", canOneClick: true });
  });
  it("lệch + AR đa-UID → diverged nhưng KHÔNG 1-chạm (G-UID1)", () => {
    expect(getUidSyncState("3314813941", "3314485764", { matchedOtherPr: false, singleUid: false }))
      .toEqual({ kind: "diverged", prUid: "3314485764", canOneClick: false });
  });
  it("uid khối thuộc PR khác (prByUid hit) → match hợp lệ, không cảnh báo (G-UID5)", () => {
    expect(getUidSyncState("9999999999", "3314485764", { matchedOtherPr: true, singleUid: false }))
      .toEqual({ kind: "match" });
  });
  it("chênh chỉ do whitespace → match (G-UID4 trim 2 phía)", () => {
    expect(getUidSyncState(" 3314485764 ", "3314485764", { matchedOtherPr: false, singleUid: true }))
      .toEqual({ kind: "match" });
  });
});
```

- [ ] **Step 2: Chạy — phải FAIL** — `cd frontend && npm run test -- src/components/ActivationTab.uidSync.test.ts` → `Cannot find module './ActivationTab.uidSync'`

- [ ] **Step 3: Implement**

```ts
// frontend/src/components/ActivationTab.uidSync.ts
/**
 * Trạng thái đồng bộ UID giữa 1 khối uids_data của AR và UID thông tin khách (payment_requests.uid).
 * Bug gốc (20/7): sale sửa UID ở B1 SAU khi AR tạo → uids_data giữ UID cũ, không auto-sync.
 * Đây là GROUND TRUTH cho cảnh báo lệch + nút "Đồng bộ từ PR" ở ActivationTab.
 *
 * Nhánh "match" tái tạo đúng logic isUidFromPr cũ (ActivationTab.tsx:1187): khớp pr.uid HOẶC
 * thuộc 1 PR nào đó (prByUid hit, đa-con). Chỉ THÊM nhánh "diverged" cho phần còn lại.
 * Không ghi đè âm thầm — chỉ phân loại để render.
 */
export type UidSyncState =
  | { kind: "match" }
  | { kind: "none" }
  | { kind: "diverged"; prUid: string; canOneClick: boolean };

export function getUidSyncState(
  blockUid: string | null | undefined,
  prUid: string | null | undefined,
  opts: { matchedOtherPr: boolean; singleUid: boolean }
): UidSyncState {
  const b = String(blockUid || "").trim();
  const p = String(prUid || "").trim();
  if (!b) return { kind: "none" };
  if (p && b === p) return { kind: "match" };
  if (opts.matchedOtherPr) return { kind: "match" };
  if (!p) return { kind: "none" };
  return { kind: "diverged", prUid: p, canOneClick: opts.singleUid };
}
```

- [ ] **Step 4: Chạy lại — phải PASS** (7 cases)

---

### Task 2: Cắm cảnh báo lệch + nút "Đồng bộ từ PR" vào drawer (ActivationTab)

**Files:**
- Modify: `frontend/src/components/ActivationTab.tsx` (import; handler `syncUidFromPr`; render nhánh âm quanh dòng `1260-1264`)

- [ ] **Step 1: Import helper** (đầu file, cạnh import util khác)

```ts
import { getUidSyncState } from "./ActivationTab.uidSync";
```

- [ ] **Step 2: Handler đồng bộ 1-chạm** — thêm cạnh `saveUidHeader` (sau dòng `703-…`). KHÔNG đọc uidDrafts (tránh race state); ghi thẳng `pr.uid`.

```ts
  const syncUidFromPr = async (uidIdx: number) => {
    const base = ar.uids[uidIdx];
    const target = String(pr?.uid || "").trim();
    if (!base || !target || String(base.uid || "").trim() === target) return;
    // G-UID3: chỉ đổi chuỗi uid, giữ nguyên phone/country/courses.
    await onPersist({
      ...ar,
      uids: ar.uids.map((u, i) => (i === uidIdx ? { ...u, uid: target } : u)),
    });
  };
```

- [ ] **Step 3: Tính state trong vòng map** — ngay sau `isUidFromPr` (dòng `1187-1189`), thêm:

```ts
              const uidSync = getUidSyncState(uidKey, pr?.uid, {
                matchedOtherPr: !!prByUid.get(uidKey),
                singleUid: ar.uids.length === 1,
              });
```

(Có thể thay `isUidFromPr` bằng `uidSync.kind === "match"` để 1 nguồn sự thật — tùy, giữ `isUidFromPr` cũng được vì logic khớp. Nếu thay, đổi điều kiện render badge xanh dòng `1260` thành `uidSync.kind === "match"`.)

- [ ] **Step 4: Render nhánh âm** — NGAY SAU block badge "UID từ PR" (`1260-1264`), thêm. Nổi bật, KHÔNG text-3 mờ (feedback_ui_visibility_principle):

```tsx
                {uidSync.kind === "diverged" && (
                  <span
                    className="badge"
                    title={`UID thông tin khách (B1) hiện là ${uidSync.prUid} — khác UID đang lưu ở bản kích hoạt. Có thể sale đã sửa UID sau khi tạo bản kích hoạt.`}
                    style={{
                      background: "var(--danger-50, #fef2f2)",
                      color: "var(--danger-700, #b91c1c)",
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                    }}
                  >
                    <Icons.AlertCircle size={11} strokeWidth={2.5} /> UID lệch với TT khách: {uidSync.prUid}
                  </span>
                )}
                {uidSync.kind === "diverged" && uidSync.canOneClick && !locked && (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => void syncUidFromPr(uidIdx)}
                    title={`Ghi ${uidSync.prUid} (UID thông tin khách) đè lên UID bản kích hoạt`}
                  >
                    <Icons.RefreshCw size={12} strokeWidth={2.5} /> Đồng bộ từ PR
                  </button>
                )}
```

(Nếu `Icons.RefreshCw`/`AlertCircle`/`danger-50` không tồn tại → dùng icon/biến sẵn có: kiểm `grep "AlertCircle\|RefreshCw" src/components/ActivationTab.tsx` và `grep "danger-50\|--danger" src/styles/`. Fallback: `Icons.AlertCircle` chắc chắn có, màu `var(--danger)`.)

- [ ] **Step 5: Gate** — `cd frontend && npx tsc -b 2>&1 | grep -E "error TS" || echo TS-OK` → `TS-OK`

---

### Task 3 (tùy chọn, follow-up): Cảnh báo tại điểm SỬA UID ở B1

**Mục tiêu:** đóng vòng ngay lúc sale sửa — nhưng PR drawer có thể chưa load AR liên kết → cần thêm dữ liệu. **Để riêng, ngoài scope chính** (tránh scope creep + có thể chạm BE). Chỉ làm nếu user yêu cầu.

- [ ] Khảo sát: `PaymentRequestDetailDrawer` có sẵn uid của AR liên kết không? Nếu không → cần thêm field (BE additive) hoặc fetch. Nếu có → hiện dòng nhắc "Bản kích hoạt AR-xxxx giữ UID cũ — sang tab Kích hoạt để đồng bộ" sau khi save uid.

---

### Task 4: Validation tổng + MODULES.md + commit (1 commit)

**Files:**
- Modify: `MODULES.md` (mục Kích hoạt/B3)

- [ ] **Step 1: MODULES.md** — mục B3 Kích hoạt, dòng "FE": thêm `ActivationTab.uidSync.ts` (getUidSyncState — cảnh báo UID lệch B1↔B3).

- [ ] **Step 2: Full gates**

```bash
cd frontend && npx tsc -b                                          # pass
cd frontend && npm run test -- src/components/ActivationTab 2>&1 | grep -E "Test Files|FAIL"   # không FAIL
cd frontend && npm run build 2>&1 | tail -3                        # Vercel-identical
```

Nếu 1 gate FAIL 2 lần liên tiếp → DỪNG, báo output verbatim (loop budget).

- [ ] **Step 3: Commit (squash)**

```bash
git add frontend/src/components/ActivationTab.uidSync.ts \
  frontend/src/components/ActivationTab.uidSync.test.ts \
  frontend/src/components/ActivationTab.tsx MODULES.md \
  docs/superpowers/plans/2026-07-20-uid-sync-b1-b3-divergence.md
git commit -m "feat(fe): cảnh báo UID lệch giữa thông tin khách (B1) và kích hoạt (B3) + đồng bộ 1 chạm

- getUidSyncState (pure, test) phân loại match/none/diverged
- drawer kích hoạt hiện badge đỏ 'UID lệch với TT khách' khi uids_data.uid != payment_requests.uid
- nút 'Đồng bộ từ PR' 1 chạm cho AR 1-UID; đa-UID chỉ cảnh báo (G-UID1)
- FE-only, không ghi đè âm thầm (giữ triết lý effect never-overwrite)"
```

- [ ] **Step 4: `extract-approach`** nếu lộ trap mới (Learning Law). Ứng viên: "2 kho UID độc lập không auto-sync — denormalization snapshot", "fix visibility thay vì auto-sync khi source-of-truth mơ hồ".

---

## Phương án đã cân nhắc (vì sao chọn C)

| # | Phương án | Vì sao bỏ / chọn |
|---|---|---|
| A | BE auto-sync `uids_data.uid` khi patch `payment_requests.uid` | **Bỏ.** AR đa-UID: `pr.uid` không map được sang nhiều khối; ghi đè âm thầm có thể phá UID học viên cố tình khác. Source-of-truth mơ hồ. Vi phạm tiêu chí 2. |
| B | Single source of truth — bỏ `uids_data.uid`, đọc live `pr.uid` | **Bỏ.** Refactor lớn: `uids_data` per-học-viên, drive order_id + course code. Rủi ro cao, lệch chi phí so với 1/104 ca. Vi phạm tiêu chí 2+3. |
| C | **Visibility + đồng bộ 1-chạm có guard** (plan này) | **Chọn.** Cân xứng, an toàn, FE-only. Diệt gốc vấn-đề-người-dùng (stale UID vô hình) mà không rủi ro clobber. |

## Deploy notes

- **FE-only** — Vercel auto theo branch. Không migration, không đổi API.
- **Fix thủ công đã áp** (AR-2026-0100, prod 20/7). Scan: 0 ca còn lệch → không cần backfill.
- Nếu phát sinh lệch trước khi deploy, SQL guard sửa 1 ca:
  ```sql
  UPDATE active_requests SET uids_data = jsonb_set(uids_data, '{0,uid}', '"<PR_UID>"'::jsonb), updated_at = now()
  WHERE id = '<AR_ID>' AND uids_data->0->>'uid' = '<OLD_UID>';
  ```

## Test coverage tổng

| Lớp | File | Cover |
|---|---|---|
| Pure logic (ground truth) | `ActivationTab.uidSync.test.ts` (mới) | 7 cases: match / none (uid rỗng, pr rỗng) / diverged 1-UID (1-chạm) / diverged đa-UID (no 1-chạm) / prByUid hit / whitespace trim |
| Wiring drawer | `ActivationTab.tsx` — badge + nút | qua `tsc -b` + full suite; hành vi onPersist tái dùng path `saveUidHeader` đã chạy prod |
| BE | — | Không đụng |
