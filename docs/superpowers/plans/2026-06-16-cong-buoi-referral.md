# Cộng buổi Referral — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phép sale ghi nhận số buổi thưởng cho người giới thiệu và người được giới thiệu ngay tại bước kích hoạt gói học khi nguồn khoá = Giới thiệu (FE mock).

**Architecture:** Thêm 3 field optional vào `ActiveCourse`, mirror round-trip mapping snake_case ↔ camelCase (giống `lead_source`). UI nhập nằm trong `ActiveRequestMiniCardV2` (PR detail drawer), validation chặn lưu ở banner cấp-card. Read-only summary hiện ở cả PR drawer và tab Kích hoạt khoá học (B3).

**Tech Stack:** React 19 + TypeScript + Vite; Vitest + RTL cho unit test; build kiểm bằng `tsc -b`.

**Spec:** [docs/superpowers/specs/2026-06-16-cong-buoi-referral-design.md](../specs/2026-06-16-cong-buoi-referral-design.md)

**Branch:** `sandbox` (đã ở đúng branch). File chạm không trùng WIP sepay/mpos của session song song.

---

## File Structure

| File | Trách nhiệm | Loại |
|---|---|---|
| `frontend/src/types/paymentRequest.ts` | Định nghĩa 3 field mới trên `ActiveCourse` + 2 type payload | Modify |
| `frontend/src/components/payment-request/paymentRequestUtils.ts` | Round-trip mapping + helper `validateReferralBonus` | Modify |
| `frontend/src/components/payment-request/paymentRequestUtils.test.ts` | Test mapping + validation | Modify |
| `frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx` | UI nhập (editing) + read-only summary + chặn lưu | Modify |
| `frontend/src/components/ActivationTab.tsx` | Read-only summary trong B3 | Modify |
| `frontend/src/components/payment-request/mockActiveRequests.ts` | Mock demo data | Modify |

**Tên field (FE camelCase / API snake_case):**
- `referrerUid` / `referrer_uid` — UID người giới thiệu (sale gõ)
- `bonusSessionsReferee` / `bonus_sessions_referee` — buổi cho người được giới thiệu (chủ AR)
- `bonusSessionsReferrer` / `bonus_sessions_referrer` — buổi cho người giới thiệu

---

## Task 1: Thêm field vào types

**Files:**
- Modify: `frontend/src/types/paymentRequest.ts:109-135` (`ActiveCourse`)
- Modify: `frontend/src/types/paymentRequest.ts:218-234` (`ActiveRequestApiRow` courses)
- Modify: `frontend/src/types/paymentRequest.ts:245-258` (`ActiveRequestPatchUidPayload` courses)

- [ ] **Step 1: Thêm 3 field vào `ActiveCourse`**

Trong `interface ActiveCourse`, chèn 3 dòng MỚI ngay sau dòng `leadChannel?: string;` (dòng 134), TRƯỚC dấu `}` đóng interface (dòng 135). Chỉ thêm các dòng này, không sửa `leadSource`/`leadChannel` đã có:

```typescript
  /** UID người giới thiệu (referral) — sale nhập khi nguồn = gioi_thieu */
  referrerUid?: string;
  /** Số buổi thưởng cho người được giới thiệu (chủ AR) */
  bonusSessionsReferee?: number;
  /** Số buổi thưởng cho người giới thiệu */
  bonusSessionsReferrer?: number;
```

- [ ] **Step 2: Thêm field snake_case vào `ActiveRequestApiRow` courses**

Trong `ActiveRequestApiRow` → `uids_data[].courses[]`, chèn 3 dòng MỚI ngay sau dòng `leadChannel?: string;` (dòng 233), TRƯỚC dấu `}>` đóng mảng courses (dòng 234):

```typescript
      referrer_uid?: string;
      bonus_sessions_referee?: number;
      bonus_sessions_referrer?: number;
```

- [ ] **Step 3: Thêm field snake_case vào `ActiveRequestPatchUidPayload` courses**

Trong `ActiveRequestPatchUidPayload` → `courses[]`, chèn 3 dòng MỚI ngay sau dòng `lead_channel?: string;` (dòng 257), TRƯỚC dấu `}>` đóng mảng (dòng 258):

```typescript
    referrer_uid?: string;
    bonus_sessions_referee?: number;
    bonus_sessions_referrer?: number;
```

- [ ] **Step 4: Verify type build**

Run: `cd frontend && npx tsc -b`
Expected: PASS, không lỗi.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types/paymentRequest.ts
git commit -m "feat(referral): thêm field cộng buổi vào ActiveCourse + payload types"
```

---

## Task 2: Round-trip mapping (TDD)

**Files:**
- Test: `frontend/src/components/payment-request/paymentRequestUtils.test.ts`
- Modify: `frontend/src/components/payment-request/paymentRequestUtils.ts:211-224` (`fromApiActiveRequest`)
- Modify: `frontend/src/components/payment-request/paymentRequestUtils.ts:288-301` (`toActiveRequestPatchUidsData`)

- [ ] **Step 1: Viết test thất bại**

Trong `paymentRequestUtils.test.ts`:

1. Thêm `fromApiActiveRequest` vào danh sách import từ `"./paymentRequestUtils"` (dòng 3-13).
2. Thêm `ActiveRequestApiRow` vào import type sẵn có ở dòng 2: `import type { ActiveRequest, ActiveRequestApiRow, PaymentRequest } from "../../types/paymentRequest";`.
3. Chèn 2 `it(...)` dưới đây vào **cuối describe `"active request course package updates"`**, ngay TRƯỚC dấu `});` đóng describe (dòng 157), để tái dùng biến `ar` đã khai báo trong scope đó. KHÔNG tạo describe riêng.

```typescript
  it("đọc field referral snake_case từ API về camelCase", () => {
    const raw: ActiveRequestApiRow = {
      id: "AR-2026-0099",
      pr_id: "PR-2026-0099",
      customer_name: "Khách B",
      uids_data: [
        {
          uid: "BUYER_B",
          phone: "0900000000",
          country: "VN",
          courses: [
            {
              code: "CC-0099-001",
              name: "Gói X",
              amount: 5000000,
              lead_source: "gioi_thieu",
              referrer_uid: "REFERRER_A",
              bonus_sessions_referee: 2,
              bonus_sessions_referrer: 3,
            },
          ],
        },
      ],
    };

    const course = fromApiActiveRequest(raw).uids[0].courses[0];
    expect(course.leadSource).toBe("gioi_thieu");
    expect(course.referrerUid).toBe("REFERRER_A");
    expect(course.bonusSessionsReferee).toBe(2);
    expect(course.bonusSessionsReferrer).toBe(3);
  });

  it("ghi field referral camelCase ra payload snake_case", () => {
    const arWithReferral: ActiveRequest = {
      ...ar,
      uids: [
        {
          ...ar.uids[0],
          uid: "BUYER_B",
          courses: [
            {
              ...ar.uids[0].courses[0],
              leadSource: "gioi_thieu",
              referrerUid: "REFERRER_A",
              bonusSessionsReferee: 2,
              bonusSessionsReferrer: 3,
            },
          ],
        },
      ],
    };

    expect(toActiveRequestPatchUidsData(arWithReferral)[0].courses[0]).toMatchObject({
      lead_source: "gioi_thieu",
      referrer_uid: "REFERRER_A",
      bonus_sessions_referee: 2,
      bonus_sessions_referrer: 3,
    });
  });
```

- [ ] **Step 2: Chạy test — xác nhận FAIL**

Run: `cd frontend && npx vitest run src/components/payment-request/paymentRequestUtils.test.ts`
Expected: FAIL — `course.referrerUid` là `undefined`, `payload...referrer_uid` không tồn tại.

- [ ] **Step 3: Cập nhật `fromApiActiveRequest`**

Trong `paymentRequestUtils.ts`, trong `.map((c) => ({ ... }))` của courses, chèn 3 dòng MỚI ngay sau dòng `leadChannel: c.lead_channel ?? c.leadChannel ?? undefined,` (dòng 223), TRƯỚC `})),` đóng map (dòng 224). Không sửa dòng `leadSource`/`leadChannel` đã có:

```typescript
        referrerUid: c.referrer_uid ?? undefined,
        bonusSessionsReferee: c.bonus_sessions_referee ?? undefined,
        bonusSessionsReferrer: c.bonus_sessions_referrer ?? undefined,
```

- [ ] **Step 4: Cập nhật `toActiveRequestPatchUidsData`**

Trong `.map((c) => ({ ... }))` của courses, chèn 3 dòng MỚI ngay sau dòng `lead_channel: c.leadChannel,` (dòng 300), TRƯỚC `})),` đóng map (dòng 301). Không sửa dòng `lead_source`/`lead_channel` đã có:

```typescript
      referrer_uid: c.referrerUid,
      bonus_sessions_referee: c.bonusSessionsReferee,
      bonus_sessions_referrer: c.bonusSessionsReferrer,
```

- [ ] **Step 5: Chạy test — xác nhận PASS**

Run: `cd frontend && npx vitest run src/components/payment-request/paymentRequestUtils.test.ts`
Expected: PASS toàn bộ (kể cả test `keeps snake_case course data` cũ — `toEqual` bỏ qua key có giá trị `undefined`).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/payment-request/paymentRequestUtils.ts frontend/src/components/payment-request/paymentRequestUtils.test.ts
git commit -m "feat(referral): map field cộng buổi round-trip snake_case ↔ camelCase"
```

---

## Task 3: Helper `validateReferralBonus` (TDD)

**Files:**
- Test: `frontend/src/components/payment-request/paymentRequestUtils.test.ts`
- Modify: `frontend/src/components/payment-request/paymentRequestUtils.ts` (thêm export mới sau `activeRequestAllocation`, dòng ~265)

- [ ] **Step 1: Viết test thất bại**

Thêm `validateReferralBonus` vào import của test file. Thêm describe mới ở cuối `paymentRequestUtils.test.ts`:

```typescript
describe("validateReferralBonus", () => {
  const base: ActiveRequest = {
    id: "AR-1", prId: "PR-1", customerName: "B", createdAt: "", createdBy: "",
    uids: [{ uid: "BUYER_B", phone: "", country: "VN", courses: [
      { courseCode: "CC-1", packageName: "", amount: 1000, orderId: "", invoiced: false, leadSource: "gioi_thieu" },
    ] }],
  };

  it("không lỗi khi không cộng buổi cho người giới thiệu", () => {
    expect(validateReferralBonus(base)).toBe("");
  });

  it("không lỗi khi chỉ cộng buổi cho người được giới thiệu", () => {
    const ar = { ...base, uids: [{ ...base.uids[0], courses: [
      { ...base.uids[0].courses[0], bonusSessionsReferee: 2 },
    ] }] };
    expect(validateReferralBonus(ar)).toBe("");
  });

  it("báo lỗi khi cộng buổi người giới thiệu nhưng thiếu UID", () => {
    const ar = { ...base, uids: [{ ...base.uids[0], courses: [
      { ...base.uids[0].courses[0], bonusSessionsReferrer: 3 },
    ] }] };
    expect(validateReferralBonus(ar)).toContain("chưa nhập UID người giới thiệu");
  });

  it("báo lỗi khi UID người giới thiệu trùng UID người được giới thiệu", () => {
    const ar = { ...base, uids: [{ ...base.uids[0], courses: [
      { ...base.uids[0].courses[0], bonusSessionsReferrer: 3, referrerUid: "BUYER_B" },
    ] }] };
    expect(validateReferralBonus(ar)).toContain("phải khác");
  });

  it("hợp lệ khi đủ UID người giới thiệu khác người được giới thiệu", () => {
    const ar = { ...base, uids: [{ ...base.uids[0], courses: [
      { ...base.uids[0].courses[0], bonusSessionsReferrer: 3, referrerUid: "REFERRER_A" },
    ] }] };
    expect(validateReferralBonus(ar)).toBe("");
  });

  it("bỏ qua course không phải nguồn Giới thiệu", () => {
    const ar = { ...base, uids: [{ ...base.uids[0], courses: [
      { ...base.uids[0].courses[0], leadSource: "quang_cao", bonusSessionsReferrer: 3 },
    ] }] };
    expect(validateReferralBonus(ar)).toBe("");
  });
});
```

- [ ] **Step 2: Chạy test — xác nhận FAIL**

Run: `cd frontend && npx vitest run src/components/payment-request/paymentRequestUtils.test.ts`
Expected: FAIL — `validateReferralBonus is not exported` / not a function.

- [ ] **Step 3: Viết helper**

Trong `paymentRequestUtils.ts`, ngay sau hàm `activeRequestAllocation` (kết thúc dòng ~265), thêm:

```typescript
/**
 * Kiểm tra dữ liệu cộng buổi referral trên toàn bộ AR.
 * Trả về chuỗi lỗi đầu tiên, hoặc "" nếu hợp lệ.
 * Quy tắc: nếu một course nguồn "gioi_thieu" cộng buổi cho người giới thiệu
 * (bonusSessionsReferrer > 0) thì bắt buộc có referrerUid, và referrerUid
 * phải khác UID người được giới thiệu (uid của nhóm).
 */
export function validateReferralBonus(ar: ActiveRequest): string {
  for (const u of ar.uids) {
    const refereeUid = (u.uid ?? "").trim();
    for (const c of u.courses) {
      if (c.leadSource !== "gioi_thieu") continue;
      if ((c.bonusSessionsReferrer ?? 0) > 0) {
        const refUid = (c.referrerUid ?? "").trim();
        if (!refUid) {
          return `Khoá ${c.courseCode}: đã cộng buổi cho người giới thiệu nhưng chưa nhập UID người giới thiệu.`;
        }
        if (refUid === refereeUid) {
          return `Khoá ${c.courseCode}: UID người giới thiệu phải khác UID người được giới thiệu (${refereeUid}).`;
        }
      }
    }
  }
  return "";
}
```

- [ ] **Step 4: Chạy test — xác nhận PASS**

Run: `cd frontend && npx vitest run src/components/payment-request/paymentRequestUtils.test.ts`
Expected: PASS toàn bộ.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/payment-request/paymentRequestUtils.ts frontend/src/components/payment-request/paymentRequestUtils.test.ts
git commit -m "feat(referral): helper validateReferralBonus chặn lưu khi thiếu/sai UID"
```

---

## Task 4: UI nhập + read-only + chặn lưu trong PR detail drawer

**Files:**
- Modify: `frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx`
  - Import (dòng 20-29)
  - `save()` (dòng 657-671)
  - read-only summary (sau dòng 1158)
  - input sub-block (sau dòng 1218)

- [ ] **Step 1: Thêm import helper**

Trong block `import { ... } from "./paymentRequestUtils";` (dòng 20-29), thêm `validateReferralBonus,` vào danh sách import.

- [ ] **Step 2: Chặn lưu trong `save()`**

Trong hàm `save` (dòng 657), sau khối `if (hasUnfilledCourse) {...}` (dòng 662-665), trước `setSaving(true);`, thêm:

```typescript
    const referralError = validateReferralBonus(ar);
    if (referralError) {
      setAllocationError(referralError);
      return;
    }
```

- [ ] **Step 3: Thêm read-only summary**

Trong course map, tìm block read-only Nguồn (dòng 1149-1158, bắt đầu `{!editing && (c.leadSource || c.leadChannel) && (`). Ngay SAU block đó (sau `)}` dòng 1158), thêm:

```tsx
                    {!editing && c.leadSource === "gioi_thieu" &&
                      ((c.bonusSessionsReferee ?? 0) > 0 || (c.bonusSessionsReferrer ?? 0) > 0) && (
                      <div style={{ gridColumn: "1 / -1", fontSize: 11, color: "var(--text-3)", display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 600 }}>Thưởng giới thiệu:</span>
                        {(c.bonusSessionsReferee ?? 0) > 0 && (
                          <span>+{c.bonusSessionsReferee} buổi · người được giới thiệu ({u.uid || "—"})</span>
                        )}
                        {(c.bonusSessionsReferrer ?? 0) > 0 && (
                          <span>+{c.bonusSessionsReferrer} buổi · người giới thiệu ({c.referrerUid || "—"})</span>
                        )}
                      </div>
                    )}
```

- [ ] **Step 4: Thêm input sub-block (editing mode)**

Tìm cuối block editing leadSource (dòng 1159-1219, kết thúc bằng `</div>` rồi `)}` ở dòng 1219). Ngay SAU `)}` của block editing leadSource, thêm:

```tsx
                    {editing && c.leadSource === "gioi_thieu" && (
                      <div style={{ gridColumn: "1 / -1", display: "grid", gap: 8, padding: 10, border: "1px dashed var(--border)", borderRadius: 8, background: "var(--surface-2, #fafafa)" }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-2)" }}>
                          Thưởng giới thiệu — người được giới thiệu: <code>{u.uid || "(chưa có UID)"}</code>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", gap: 8 }}>
                          <input
                            value={c.referrerUid ?? ""}
                            disabled={courseLocked}
                            placeholder="UID người giới thiệu"
                            onChange={(e) => {
                              const val = e.target.value;
                              mutate((next) => ({
                                ...next,
                                uids: next.uids.map((uu, idx) =>
                                  idx === uIdx
                                    ? { ...uu, courses: uu.courses.map((course) =>
                                        course.courseCode === c.courseCode ? { ...course, referrerUid: val } : course) }
                                    : uu
                                ),
                              }));
                            }}
                            style={{ font: "inherit", fontSize: 12, fontFamily: "JetBrains Mono, monospace", borderRadius: 8, border: "1px solid var(--border)", padding: "5px 7px" }}
                          />
                          <input
                            value={c.bonusSessionsReferee ?? ""}
                            disabled={courseLocked}
                            inputMode="numeric"
                            pattern="[0-9]*"
                            placeholder="Buổi: được g.thiệu"
                            onChange={(e) => {
                              const raw = e.target.value.replace(/[^\d]/g, "");
                              const val = raw === "" ? undefined : Math.max(0, parseInt(raw, 10) || 0);
                              mutate((next) => ({
                                ...next,
                                uids: next.uids.map((uu, idx) =>
                                  idx === uIdx
                                    ? { ...uu, courses: uu.courses.map((course) =>
                                        course.courseCode === c.courseCode ? { ...course, bonusSessionsReferee: val } : course) }
                                    : uu
                                ),
                              }));
                            }}
                            style={{ font: "inherit", fontSize: 12, textAlign: "right", borderRadius: 8, border: "1px solid var(--border)", padding: "5px 7px" }}
                          />
                          <input
                            value={c.bonusSessionsReferrer ?? ""}
                            disabled={courseLocked}
                            inputMode="numeric"
                            pattern="[0-9]*"
                            placeholder="Buổi: g.thiệu"
                            onChange={(e) => {
                              const raw = e.target.value.replace(/[^\d]/g, "");
                              const val = raw === "" ? undefined : Math.max(0, parseInt(raw, 10) || 0);
                              mutate((next) => ({
                                ...next,
                                uids: next.uids.map((uu, idx) =>
                                  idx === uIdx
                                    ? { ...uu, courses: uu.courses.map((course) =>
                                        course.courseCode === c.courseCode ? { ...course, bonusSessionsReferrer: val } : course) }
                                    : uu
                                ),
                              }));
                            }}
                            style={{ font: "inherit", fontSize: 12, textAlign: "right", borderRadius: 8, border: "1px solid var(--border)", padding: "5px 7px" }}
                          />
                        </div>
                        <div style={{ fontSize: 10.5, color: "var(--text-3)" }}>
                          Tuỳ tình huống điền 1 trong 2 hoặc cả 2. Nếu cộng buổi cho người giới thiệu thì bắt buộc nhập UID người giới thiệu (khác UID người được giới thiệu).
                        </div>
                      </div>
                    )}
```

- [ ] **Step 5: Verify build**

Run: `cd frontend && npx tsc -b`
Expected: PASS.

- [ ] **Step 6: Verify trong trình duyệt**

Khởi động dev server (preview_start nếu chưa chạy), mở 1 PR có AR nguồn Giới thiệu (sau Task 6 sẽ có mock), bật chế độ sửa AR mini-card → xác nhận hiện 3 ô; nhập buổi cho người giới thiệu mà bỏ trống UID → bấm Lưu → xác nhận banner báo lỗi và không lưu. Chụp `preview_screenshot` làm bằng chứng.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx
git commit -m "feat(referral): UI nhập cộng buổi + read-only + chặn lưu trong AR mini-card"
```

---

## Task 5: Read-only summary trong tab Kích hoạt khoá học (B3)

**Files:**
- Modify: `frontend/src/components/ActivationTab.tsx`
  - Import react (dòng 1)
  - course map trong `ActivationDetailDrawer` (dòng 1128-1281)

- [ ] **Step 1: Thêm `Fragment` vào import react**

Dòng 1 đổi từ:

```typescript
import { useEffect, useMemo, useRef, useState } from "react";
```

thành:

```typescript
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
```

- [ ] **Step 2: Bọc course row bằng Fragment + thêm summary**

Trong `ActivationDetailDrawer`, course map bắt đầu `{uidObj.courses.map((course, courseIdx) => (` (dòng 1128) và mỗi item trả về `<div key={course.courseCode} className="course-row">...</div>` (kết thúc dòng 1280).

Đổi mở đầu item từ:

```tsx
              {uidObj.courses.map((course, courseIdx) => (
                <div key={course.courseCode} className="course-row">
```

thành (bỏ `key` khỏi div, đưa lên Fragment):

```tsx
              {uidObj.courses.map((course, courseIdx) => (
                <Fragment key={course.courseCode}>
                <div className="course-row">
```

Và đổi phần đóng item (dòng 1280-1281) từ:

```tsx
                </div>
              ))}
```

thành:

```tsx
                </div>
                {course.leadSource === "gioi_thieu" &&
                  ((course.bonusSessionsReferee ?? 0) > 0 || (course.bonusSessionsReferrer ?? 0) > 0) && (
                  <div style={{ gridColumn: "1 / -1", fontSize: 11, color: "var(--text-3)", display: "flex", gap: 8, flexWrap: "wrap", padding: "2px 4px 8px" }}>
                    <span style={{ fontWeight: 600 }}>Thưởng giới thiệu:</span>
                    {(course.bonusSessionsReferee ?? 0) > 0 && (
                      <span>+{course.bonusSessionsReferee} buổi · người được giới thiệu ({uidObj.uid || "—"})</span>
                    )}
                    {(course.bonusSessionsReferrer ?? 0) > 0 && (
                      <span>+{course.bonusSessionsReferrer} buổi · người giới thiệu ({course.referrerUid || "—"})</span>
                    )}
                  </div>
                )}
                </Fragment>
              ))}
```

- [ ] **Step 3: Verify build**

Run: `cd frontend && npx tsc -b`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ActivationTab.tsx
git commit -m "feat(referral): hiện read-only cộng buổi trong tab Kích hoạt khoá học"
```

---

## Task 6: Mock demo data

**Files:**
- Modify: `frontend/src/components/payment-request/mockActiveRequests.ts`

- [ ] **Step 1: Mock course nhập (editable) — AR-2026-0002**

Course `CC-0002-001` (dòng 49-55) có `orderId: ""` (chưa khoá → editable). Thêm `leadSource: "gioi_thieu",` vào object course đó:

```typescript
          {
            courseCode: "CC-0002-001",
            packageName: "2/W- NEW 48 US-UK+2 HN",
            amount: 12_000_000,
            orderId: "",
            invoiced: false,
            leadSource: "gioi_thieu",
          },
```

- [ ] **Step 2: Mock course read-only (đã khoá + đã điền cộng buổi) — AR-2026-0003**

Course `CC-0003-001` (dòng 72-80, đã invoiced/khoá). Thêm các field referral:

```typescript
          {
            courseCode: "CC-0003-001",
            packageName: "2/W- UPSALE 96 PHI+10 HN",
            amount: 6_000_000,
            orderId: "ORD-2026-87600",
            invoiced: true,
            invoiceId: "INV-2026-1038",
            invoicedAt: "2026-05-22 15:20",
            leadSource: "gioi_thieu",
            referrerUid: "3213123123",
            bonusSessionsReferee: 2,
            bonusSessionsReferrer: 2,
          },
```

- [ ] **Step 3: Verify build**

Run: `cd frontend && npx tsc -b`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/payment-request/mockActiveRequests.ts
git commit -m "test(referral): mock data demo cộng buổi (1 editable + 1 read-only)"
```

---

## Task 7: Build + test toàn bộ

- [ ] **Step 1: Chạy unit test toàn bộ**

Run: `cd frontend && npm run test`
Expected: PASS toàn bộ (gồm các test referral mới).

- [ ] **Step 2: Build Vercel-identical**

Run: `cd frontend && npx tsc -b && npm run build`
Expected: build thành công, không lỗi type.

- [ ] **Step 3: Không commit gộp**

Build/test không sinh file cần commit. **KHÔNG dùng `git add -A`** (working tree có WIP sepay/mpos của session khác — tuyệt đối không quét vào commit). Nếu Step 1-2 phát sinh thay đổi ngoài dự kiến, dừng và báo controller. Bình thường task này chỉ verify, không commit.

---

## Notes cho người thực thi

- **Chỉ FE mock.** Không sửa backend. Field snake_case ở payload đã sẵn sàng cho BE nối sau (chờ spec anh Hiếu).
- Biến trong course map của `PaymentRequestDetailDrawer`: nhóm UID là `u`, index `uIdx`, course là `c`. Trong `ActivationTab` `ActivationDetailDrawer`: nhóm UID là `uidObj`, course là `course`, index `courseIdx`. Không nhầm lẫn.
- `courseLocked` đã định nghĩa trong scope course map của mini-card (dòng 1001) → dùng để disable input.
- Banner lỗi tái dùng state `allocationError` (render ở dòng 923) — không cần state mới.
