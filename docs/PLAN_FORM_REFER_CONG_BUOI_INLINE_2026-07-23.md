# Form báo đơn — Cộng buổi giới thiệu (REFER) inline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Ngày:** 2026-07-23
**Nguồn:** Task list 23/7 — "Cải tiến UX form báo đơn: nhập cộng buổi giới thiệu (REFER) inline"

**Goal:** Cho sale nhập UID người giới thiệu + số buổi cộng (cho bé & cho người giới thiệu) **ngay trong form "Báo đơn & Kích hoạt"** khi gói là REFER / nguồn = Giới thiệu — bỏ bước "thoát ra bấm Sửa ở thẻ kích hoạt" — và bảo đảm dữ liệu referral **không rớt** ở 2 mắt xích BE: (1) tạo AR, (2) tin DingTalk báo đơn.

**Architecture:** Referral đã có sẵn 3 field trên course (`referrer_uid`, `bonus_sessions_referee`, `bonus_sessions_referrer`) sống trong `active_requests.uids_data` (JSONB) — **KHÔNG migration**. Hiện chúng chỉ đi qua đường PATCH (Sửa sau khi tạo). Plan này mở đường **CREATE**: thêm 3 field vào `ArDraftRow` + payload create, render 3 ô inline trong modal báo đơn, và bỏ 2 chỗ BE đang whitelist-drop referral (hàm chuẩn hoá course lúc tạo + builder tin DingTalk). Việc **cộng buổi thật** (checkbox credit) vẫn giữ nguyên: gated sau kích hoạt (`order_id`) + RBAC `can_credit_referral`. Đây chỉ là **thu thập sớm** thông tin referral, không phải thực thi credit.

**Tech Stack:** React 19 + TypeScript + Vite; Vitest + RTL (FE). FastAPI + Pydantic; pytest (BE). Build kiểm bằng `tsc -b`.

**Spec nền:** [docs/superpowers/specs/2026-06-16-cong-buoi-referral-design.md](superpowers/specs/2026-06-16-cong-buoi-referral-design.md) (quy tắc validate mục §4).

---

## Bối cảnh kỹ thuật (đã verify tại code — không đoán)

### Luồng hiện tại (thừa 1 bước)
- Form tạo AR = modal **"Báo đơn & Kích hoạt khoá học"** trong [PaymentRequestDetailDrawer.tsx:2655](../frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx) (body 2666–2913). Mỗi dòng là 1 `ArDraftRow` (bé + gói + tiền + nguồn). **Không có ô referral.**
- Khi gói là REFER, form chỉ hiện tooltip [:2778–2782](../frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx) — "sau khi tạo, bấm Sửa ở thẻ kích hoạt để điền UID người giới thiệu & số buổi cộng".
- Sale phải tạo AR xong → mở thẻ kích hoạt (`ActiveRequestMiniCardV2`) → bấm Sửa → block referral [:1324–1414](../frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx) → nhập → lưu qua PATCH.

### 2 mắt xích BE đang rớt dữ liệu
1. **Tạo AR (kích hoạt):**
   - FE `buildCreateActiveRequestPayload` [paymentRequestUtils.ts:394–406](../frontend/src/components/payment-request/paymentRequestUtils.ts) chỉ set `name`/`amount`/`lead_source`/`lead_channel` — **không** serialize referral.
   - BE `_assign_course_codes` [activation_routes.py:284–297](../backend/activation_routes.py) build `norm_course` chỉ giữ `code`/`name`/`amount`/`order_id`/`invoiced`/`lead_*` — **whitelist bỏ referral**. Kể cả FE có gửi, BE vẫn drop.
   - Model `CreateActiveRequestCoursePayload` [paymentRequest.ts:255–261](../frontend/src/types/paymentRequest.ts) không có field referral.
2. **Tin DingTalk báo đơn:**
   - Builder chung `build_activation_request_created_message` [zalo_message_builder.py:438–445](../backend/utils/zalo_message_builder.py) chỉ đọc `course.get("name")` cho `course_lines` — **bỏ qua referral**.
   - Builder này dùng chung cho cả Zalo (`_enqueue_activation_request_created_zalo` [:985](../backend/activation_routes.py)) lẫn DingTalk (`_enqueue_activation_request_created_dingtalk` [:1102](../backend/activation_routes.py)) → **sửa 1 builder là đủ cả 2 kênh**.
   - Tin bắn lúc **tạo AR**. Sau khi mắt xích #1 xong, AR sinh ra đã có referral → builder chỉ cần **đọc** (không cần enqueue lần 2 ở PATCH).

### Đường PATCH (giữ nguyên, đối chiếu)
- `toActiveRequestPatchUidsData` [paymentRequestUtils.ts:584–586](../frontend/src/components/payment-request/paymentRequestUtils.ts) đã map referral.
- PATCH endpoint `patch_active_request` [activation_routes.py:1842](../backend/activation_routes.py); `model_dump()` passthrough [:1882](../backend/activation_routes.py). Không đụng.
- Validate rule đã có: `validateReferralBonus(ar)` [paymentRequestUtils.ts:530–547](../frontend/src/components/payment-request/paymentRequestUtils.ts) — plan này viết bản song song cho `ArDraftRow[]`.

### Cộng buổi thật (ngoài phạm vi — giữ nguyên)
- Checkbox credit trong `ActivationTab.tsx`; endpoint `PATCH .../credit-referral` [activation_routes.py:2006](../backend/activation_routes.py), chặn khi chưa có `order_id` [:2046](../backend/activation_routes.py), RBAC `can_credit_referral` [rbac.py:62](../backend/rbac.py). Plan này **không** đụng.

---

## File Structure

| File | Trách nhiệm | Loại |
|---|---|---|
| `frontend/src/types/paymentRequest.ts` | +3 field referral vào `ArDraftRow` + `CreateActiveRequestCoursePayload` | Modify |
| `frontend/src/components/payment-request/paymentRequestUtils.ts` | Serialize referral trong `buildCreateActiveRequestPayload` + helper `validateReferralBonusDraft` | Modify |
| `frontend/src/components/payment-request/paymentRequestUtils.payload.test.ts` | Test payload create có referral | Modify |
| `frontend/src/components/payment-request/paymentRequestUtils.referral.test.ts` | Test `validateReferralBonusDraft` | Modify |
| `frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx` | 3 ô referral inline trong modal + wire `arValid` + bỏ tooltip "bấm Sửa" | Modify |
| `backend/activation_routes.py` | `_assign_course_codes` giữ referral khi tạo AR | Modify |
| `backend/utils/zalo_message_builder.py` | Builder thêm dòng referral vào tin báo đơn | Modify |
| `backend/tests/test_referral_bonus.py` | Test create giữ referral + builder in referral | Modify |

---

## Task 1: FE — thêm 3 field referral vào types

**Files:**
- Modify: `frontend/src/types/paymentRequest.ts:255-261` (`CreateActiveRequestCoursePayload`)
- Modify: `frontend/src/types/paymentRequest.ts:273-282` (`ArDraftRow`)

- [ ] **Step 1: Thêm 3 field snake_case vào `CreateActiveRequestCoursePayload`**

Thay block [:255-261]:

```typescript
export type CreateActiveRequestCoursePayload = {
  name?: string;
  package_name?: string;
  amount: number;
  lead_source?: string;
  lead_channel?: string;
  /** Cộng buổi referral (nguồn = gioi_thieu) — nhập inline khi báo đơn */
  referrer_uid?: string;
  bonus_sessions_referee?: number;
  bonus_sessions_referrer?: number;
};
```

- [ ] **Step 2: Thêm 3 field camelCase vào `ArDraftRow`**

Thay block [:273-282]:

```typescript
/** 1 dòng trong modal "Kích hoạt khoá học" mở rộng: 1 gói gán cho 1 bé */
export type ArDraftRow = {
  childName: string;   // "" khi PR không có tên con (fallback bé 1)
  uid: string;         // "" = bé chưa có UID CRM (Ops điền ở B3 → write-back)
  phone: string;       // đuôi số local (digits) — CRM mỗi bé 1 SĐT riêng (18/7)
  phoneCountry: string; // country code cho đầu số, VD "VN"
  packageName: string;
  amount: number;      // VND
  leadSource: string;
  leadChannel: string;
  /** Referral (nguồn gioi_thieu) — nhập inline ngay trong form báo đơn */
  referrerUid?: string;
  bonusSessionsReferee?: number;
  bonusSessionsReferrer?: number;
};
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc -b`
Expected: PASS (chỉ thêm field optional — không phá call site cũ).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/paymentRequest.ts
git commit -m "feat(referral): add referral fields to ArDraftRow + create course payload"
```

---

## Task 2: FE — serialize referral trong payload create

**Files:**
- Modify: `frontend/src/components/payment-request/paymentRequestUtils.ts:394-406`
- Test: `frontend/src/components/payment-request/paymentRequestUtils.payload.test.ts`

- [ ] **Step 1: Viết test fail trước**

Thêm vào `paymentRequestUtils.payload.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { buildCreateActiveRequestPayload } from "./paymentRequestUtils";
import type { PaymentRequest, ArDraftRow } from "../../types/paymentRequest";

describe("buildCreateActiveRequestPayload — referral", () => {
  const pr = { id: "PR-1", phone: "0900", country: "VN", received: 1_000_000 } as unknown as PaymentRequest;
  const baseRow: ArDraftRow = {
    childName: "Bé B", uid: "111", phone: "", phoneCountry: "VN",
    packageName: "2/W- Both AB REFER 24 PHI+2 HN", amount: 1_000_000,
    leadSource: "gioi_thieu", leadChannel: "",
  };

  it("serialize referrer_uid + bonus khi có", () => {
    const rows: ArDraftRow[] = [{ ...baseRow, referrerUid: "999", bonusSessionsReferee: 2, bonusSessionsReferrer: 3 }];
    const course = buildCreateActiveRequestPayload(pr, rows).uids[0].courses[0];
    expect(course.referrer_uid).toBe("999");
    expect(course.bonus_sessions_referee).toBe(2);
    expect(course.bonus_sessions_referrer).toBe(3);
  });

  it("bỏ qua field referral rỗng / 0", () => {
    const rows: ArDraftRow[] = [{ ...baseRow, referrerUid: "  ", bonusSessionsReferee: 0 }];
    const course = buildCreateActiveRequestPayload(pr, rows).uids[0].courses[0];
    expect(course.referrer_uid).toBeUndefined();
    expect(course.bonus_sessions_referee).toBeUndefined();
    expect(course.bonus_sessions_referrer).toBeUndefined();
  });
});
```

- [ ] **Step 2: Chạy test — xác nhận fail**

Run: `cd frontend && npx vitest run src/components/payment-request/paymentRequestUtils.payload.test.ts`
Expected: FAIL (`course.referrer_uid` là `undefined`).

- [ ] **Step 3: Serialize referral trong `buildCreateActiveRequestPayload`**

Trong [paymentRequestUtils.ts], NGAY SAU block `lead_channel` (dòng hiện tại 404-405, trước `block.courses.push(course);`), chèn:

```typescript
    const refUid = (row.referrerUid ?? "").trim();
    if (refUid) course.referrer_uid = refUid;
    if ((row.bonusSessionsReferee ?? 0) > 0) course.bonus_sessions_referee = row.bonusSessionsReferee;
    if ((row.bonusSessionsReferrer ?? 0) > 0) course.bonus_sessions_referrer = row.bonusSessionsReferrer;
```

- [ ] **Step 4: Chạy test — xác nhận pass**

Run: `cd frontend && npx vitest run src/components/payment-request/paymentRequestUtils.payload.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/payment-request/paymentRequestUtils.ts frontend/src/components/payment-request/paymentRequestUtils.payload.test.ts
git commit -m "feat(referral): serialize referral fields into create-AR payload"
```

---

## Task 3: FE — validate referral cho form nháp (`ArDraftRow[]`)

**Files:**
- Modify: `frontend/src/components/payment-request/paymentRequestUtils.ts` (thêm hàm cạnh `validateReferralBonus`, ~dòng 547)
- Test: `frontend/src/components/payment-request/paymentRequestUtils.referral.test.ts`

- [ ] **Step 1: Viết test fail trước**

Thêm vào `paymentRequestUtils.referral.test.ts`:

```typescript
import { validateReferralBonusDraft } from "./paymentRequestUtils";
import type { ArDraftRow } from "../../types/paymentRequest";

const row = (over: Partial<ArDraftRow>): ArDraftRow => ({
  childName: "B", uid: "111", phone: "", phoneCountry: "VN",
  packageName: "2/W- Both AB REFER 24 PHI+2 HN", amount: 1000, leadSource: "gioi_thieu", leadChannel: "",
  ...over,
});

describe("validateReferralBonusDraft", () => {
  it("ok khi không cộng cho người GT", () => {
    expect(validateReferralBonusDraft([row({ bonusSessionsReferee: 2 })])).toBe("");
  });
  it("chặn khi cộng cho người GT nhưng thiếu UID", () => {
    expect(validateReferralBonusDraft([row({ bonusSessionsReferrer: 3 })])).toMatch(/UID người giới thiệu/);
  });
  it("chặn khi UID người GT trùng UID bé", () => {
    expect(validateReferralBonusDraft([row({ bonusSessionsReferrer: 3, referrerUid: "111" })])).toMatch(/phải khác/);
  });
  it("ok khi đủ UID khác nhau", () => {
    expect(validateReferralBonusDraft([row({ bonusSessionsReferrer: 3, referrerUid: "999" })])).toBe("");
  });
  it("bỏ qua dòng không phải referral", () => {
    expect(validateReferralBonusDraft([row({ leadSource: "quang_cao", packageName: "Phil 48+5", bonusSessionsReferrer: 3 })])).toBe("");
  });
});
```

- [ ] **Step 2: Chạy test — xác nhận fail**

Run: `cd frontend && npx vitest run src/components/payment-request/paymentRequestUtils.referral.test.ts`
Expected: FAIL (`validateReferralBonusDraft is not a function`).

- [ ] **Step 3: Viết hàm** (chèn ngay sau `validateReferralBonus`, dòng ~547; `isReferralPackage` đã export cùng file dòng 7)

```typescript
/**
 * Bản song song của validateReferralBonus cho form nháp tạo AR (ArDraftRow[]).
 * Quy tắc giống spec §4: cộng buổi cho người giới thiệu (bonusSessionsReferrer > 0)
 * thì bắt buộc có referrerUid, và referrerUid phải khác UID bé (người được GT).
 * Chỉ áp cho dòng nguồn "gioi_thieu" hoặc gói REFER.
 */
export function validateReferralBonusDraft(rows: ArDraftRow[]): string {
  for (const r of rows) {
    const isReferral = r.leadSource === "gioi_thieu" || isReferralPackage(r.packageName);
    if (!isReferral) continue;
    if ((r.bonusSessionsReferrer ?? 0) > 0) {
      const refUid = (r.referrerUid ?? "").trim();
      const label = r.packageName?.trim() || "(chưa chọn gói)";
      if (!refUid) {
        return `Gói "${label}": đã cộng buổi cho người giới thiệu nhưng chưa nhập UID người giới thiệu.`;
      }
      if (refUid === (r.uid ?? "").trim()) {
        return `Gói "${label}": UID người giới thiệu phải khác UID người được giới thiệu.`;
      }
    }
  }
  return "";
}
```

- [ ] **Step 4: Chạy test — xác nhận pass**

Run: `cd frontend && npx vitest run src/components/payment-request/paymentRequestUtils.referral.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/payment-request/paymentRequestUtils.ts frontend/src/components/payment-request/paymentRequestUtils.referral.test.ts
git commit -m "feat(referral): add validateReferralBonusDraft for report form rows"
```

---

## Task 4: FE — 3 ô referral inline trong modal báo đơn + wire validate

**Files:**
- Modify: `frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx`
  - Bỏ tooltip "bấm Sửa" [:2778-2782]
  - Thêm block referral inline sau Row 4 (Nguồn/Kênh) [sau :2836, trước :2837]
  - `arValid` [:2636] fold thêm `!referralDraftError`
  - Thêm memo `referralDraftError` + render lỗi cạnh nút submit

> `setArRow(i, patch)` đã có [:2644]. `isReferralPackage` đã import [:31]. `validateReferralBonusDraft` import từ Task 3.

- [ ] **Step 1: Thêm import `validateReferralBonusDraft`**

Tại block import từ `./paymentRequestUtils` (nơi đang import `isReferralPackage`, `getReferralStatus`…), thêm `validateReferralBonusDraft`.

- [ ] **Step 2: Đổi tooltip [:2778-2782] → hint trỏ xuống dưới**

Thay:

```tsx
                      {isReferralPackage(row.packageName) && (
                        <div style={{ marginTop: 4, fontSize: 12, color: "var(--warning-text, #92400e)", lineHeight: 1.3 }}>
                          * Gói giới thiệu — sau khi tạo, bấm Sửa ở thẻ kích hoạt để điền UID người giới thiệu &amp; số buổi cộng.
                        </div>
                      )}
```

bằng:

```tsx
                      {isReferralPackage(row.packageName) && (
                        <div style={{ marginTop: 4, fontSize: 12, color: "var(--warning-text, #92400e)", lineHeight: 1.3 }}>
                          * Gói giới thiệu — điền UID người giới thiệu &amp; số buổi cộng ngay bên dưới.
                        </div>
                      )}
```

- [ ] **Step 3: Chèn block referral inline** — ngay SAU khối `{/* Row 4: Nguồn + Kênh */}` đóng (dòng `</div>` tại :2836), TRƯỚC `</div>` đóng card dòng (:2837):

```tsx
                  {/* Row 5: Cộng buổi giới thiệu (inline) — hiện khi gói REFER hoặc nguồn Giới thiệu */}
                  {(isReferralPackage(row.packageName) || row.leadSource === "gioi_thieu") && (
                    <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 8, background: "var(--warning-50, #fffbeb)", border: "1px solid var(--warning-200, #fde68a)", display: "grid", gap: 8 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--warning-text, #92400e)" }}>Thưởng giới thiệu</div>
                      <div className="field" style={{ marginBottom: 0 }}>
                        <label>UID người giới thiệu</label>
                        <input
                          placeholder="UID khách đã giới thiệu khách này"
                          value={row.referrerUid ?? ""}
                          onChange={(e) => setArRow(i, { referrerUid: e.target.value })}
                          style={{ fontFamily: "JetBrains Mono, monospace" }}
                        />
                        <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 3 }}>
                          UID phải khác UID người được giới thiệu (bé đang báo: {row.uid || "—"}).
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                          <label>Buổi cộng cho bé (người được GT)</label>
                          <input
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={row.bonusSessionsReferee ?? ""}
                            onChange={(e) => {
                              const raw = e.target.value.replace(/[^\d]/g, "");
                              setArRow(i, { bonusSessionsReferee: raw === "" ? undefined : Math.max(0, parseInt(raw, 10) || 0) });
                            }}
                          />
                        </div>
                        <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                          <label>Buổi cộng cho người giới thiệu</label>
                          <input
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={row.bonusSessionsReferrer ?? ""}
                            onChange={(e) => {
                              const raw = e.target.value.replace(/[^\d]/g, "");
                              setArRow(i, { bonusSessionsReferrer: raw === "" ? undefined : Math.max(0, parseInt(raw, 10) || 0) });
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  )}
```

- [ ] **Step 4: Thêm memo `referralDraftError` + fold vào `arValid`**

Ngay TRƯỚC dòng `const arValid = arRowsValid && arRemaining >= 0;` [:2636], thêm:

```tsx
  const referralDraftError = useMemo(() => validateReferralBonusDraft(arDraftRows), [arDraftRows]);
```

Sửa dòng `arValid`:

```tsx
  const arValid = arRowsValid && arRemaining >= 0 && !referralDraftError;
```

> `useMemo` đã dùng nhiều nơi trong file — không cần thêm import.

- [ ] **Step 5: Render lỗi referral** — trong `modal-foot`, ngay TRƯỚC nút "Huỷ" [:2879], thêm:

```tsx
              {referralDraftError && (
                <div style={{ flex: 1, color: "var(--danger)", fontSize: 12.5, alignSelf: "center" }}>
                  {referralDraftError}
                </div>
              )}
```

- [ ] **Step 6: Type-check + build**

Run: `cd frontend && npx tsc -b`
Expected: PASS.

- [ ] **Step 7: Verify tại preview** (form UX)

Mở modal "Báo đơn & Kích hoạt" cho 1 PR đã đủ tiền → chọn gói REFER → 3 ô referral hiện inline. Nhập buổi cho người GT mà bỏ trống UID → nút submit disable + hiện lỗi. Điền UID khác bé → submit sáng.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx
git commit -m "feat(referral): inline referral inputs in báo đơn form (bỏ bước Sửa)"
```

---

## Task 5: BE — `_assign_course_codes` giữ referral khi tạo AR

**Files:**
- Modify: `backend/activation_routes.py:284-297` (`_assign_course_codes` → `norm_course`)
- Test: `backend/tests/test_referral_bonus.py`

- [ ] **Step 1: Verify create route đi qua `_assign_course_codes`**

Run: `grep -n "_assign_course_codes" backend/activation_routes.py`
Expected: xuất hiện trong `_save_active_request` (đường create) và `_append_children_core` (đường append). Nếu create KHÔNG qua hàm này → dừng, báo lại (giả định plan là create dùng chung normalizer).

- [ ] **Step 2: Viết test fail trước**

Thêm vào `backend/tests/test_referral_bonus.py`:

```python
def test_assign_course_codes_keeps_referral():
    from activation_routes import _assign_course_codes
    uids_in = [{
        "uid": "111",
        "courses": [{
            "name": "2/W- Both AB REFER 24 PHI+2 HN",
            "amount": 1_000_000,
            "lead_source": "gioi_thieu",
            "referrer_uid": "999",
            "bonus_sessions_referee": 2,
            "bonus_sessions_referrer": 3,
        }],
    }]
    out = _assign_course_codes(uids_in, pr_id="PR-2026-0001")
    course = out[0]["courses"][0]
    assert course["referrer_uid"] == "999"
    assert course["bonus_sessions_referee"] == 2
    assert course["bonus_sessions_referrer"] == 3


def test_assign_course_codes_omits_empty_referral():
    from activation_routes import _assign_course_codes
    uids_in = [{"uid": "111", "courses": [{"name": "Phil 48+5", "amount": 1000}]}]
    course = _assign_course_codes(uids_in, pr_id="PR-2026-0001")[0]["courses"][0]
    assert "referrer_uid" not in course
    assert "bonus_sessions_referee" not in course
```

- [ ] **Step 3: Chạy test — xác nhận fail**

Run: `cd backend && python -m pytest tests/test_referral_bonus.py -k referral -q`
Expected: FAIL (`KeyError: 'referrer_uid'`).

- [ ] **Step 4: Giữ referral trong `norm_course`** — trong `_assign_course_codes`, NGAY SAU block `lead_channel` (dòng hiện tại 294-296), TRƯỚC `norm_courses.append(norm_course)`:

```python
            ref_uid = str(c.get("referrer_uid") or c.get("referrerUid") or "").strip()
            if ref_uid:
                norm_course["referrer_uid"] = ref_uid
            for snake, camel in (
                ("bonus_sessions_referee", "bonusSessionsReferee"),
                ("bonus_sessions_referrer", "bonusSessionsReferrer"),
            ):
                val = c.get(snake)
                if val is None:
                    val = c.get(camel)
                if val not in (None, ""):
                    try:
                        norm_course[snake] = max(0, int(val))
                    except (TypeError, ValueError):
                        pass
```

- [ ] **Step 5: Chạy test — xác nhận pass**

Run: `cd backend && python -m pytest tests/test_referral_bonus.py -k referral -q`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/activation_routes.py backend/tests/test_referral_bonus.py
git commit -m "feat(referral): persist referral on AR create (_assign_course_codes)"
```

---

## Task 6: BE — builder tin báo đơn thêm dòng "Thưởng giới thiệu"

**Files:**
- Modify: `backend/utils/zalo_message_builder.py` (`build_activation_request_created_message`, vòng lặp course :438-445) + thêm helper `_referral_lines`
- Test: `backend/tests/test_referral_bonus.py`

### ⚠ 3 sự thật về đường gửi (verify tại code — plan cũ sai, đã sửa)

1. **Tin gửi dạng MARKDOWN, không phải text.** Worker set `title="Báo đơn"` ([dingtalk_outbox_worker.py:24](../backend/dingtalk_outbox_worker.py)) → `send_group_message` gửi `sampleMarkdown` ([dingtalk_notifier.py:153-156](../backend/dingtalk_notifier.py)).
2. **Notifier TỰ đổi `\n` → `<br>`** qua `_to_dingtalk_md` ([dingtalk_notifier.py:73](../backend/dingtalk_notifier.py)). ⇒ Builder **giữ `\n`** như các dòng khác — **KHÔNG hardcode `<br>`** (hardcode = ra `<br>` literal / double). Learning `dingtalk-markdown-line-break-br-tag` đã được xử lý ở tầng notifier, builder không cần biết.
3. **`title` KHÔNG hiện trong khung chat** (chỉ là push-preview) — tin bắt đầu thẳng bằng `Phone:`. Đừng thêm dòng tiêu đề vào message body.
4. **Markdown NUỐT khoảng trắng đầu dòng** ⇒ dòng referral phải **sát lề trái (flush-left)**, tuyệt đối không `  ↳` (2 space đầu như plan cũ = hỏng render).

### Quy tắc dựng dòng (anh Minh chốt 24/7)

Chỉ áp cho course REFER (`"REFER"` trong tên gói **hoặc** `lead_source == "gioi_thieu"`).

| Dữ liệu sale nhập | Tin hiện |
|---|---|
| Đủ UID + ≥1 buổi | `🎁 Thưởng giới thiệu:` + 2 vế |
| Chỉ 1 vế > 0 buổi | Ẩn vế = 0, hiện vế có |
| Có UID, buổi người GT = 0 | Vế người GT: `UID X: chưa ghi số buổi` |
| **Trống hết** (no UID, 0+0 buổi) | **`⚠ Gói giới thiệu — chưa nhập UID & số buổi cộng`** (lưới an toàn, không bịa số) |
| Không phải REFER | Không dòng nào |

Render mẫu (ca Phương, đủ):

```
Phone: 84-938572456
UID: 3315152683
Minh Phương, 2/W- Both AB REFER 24 PHI+2 HN
🎁 Thưởng giới thiệu:
• Bé được giới thiệu (Minh Phương): +2 buổi
• Người giới thiệu — UID 3312345678: +3 buổi
Nguồn: Quảng cáo · FB - VN
Tổng: 14.320.000 VND
Sale: Kieu Thi Thu Quynh · Team Inhouse 1
```

- [ ] **Step 1: Viết test fail trước** — thêm vào `backend/tests/test_referral_bonus.py`:

```python
def _ref_msg(course_over):
    from utils.zalo_message_builder import build_activation_request_created_message
    ar = {
        "id": "AR-1", "customer_name": "Minh Phương",
        "uids_data": [{
            "uid": "3315152683", "name": "Minh Phương",
            "courses": [{"name": "2/W- Both AB REFER 24 PHI+2 HN", **course_over}],
        }],
    }
    pr = {"phone": "84-938572456", "country": "VN", "lead_source": "quang_cao",
          "lead_channel": "fb", "received": 14_320_000}
    return build_activation_request_created_message(
        ar, pr, {"display_name": "Kieu Thi Thu Quynh", "team": "Inhouse 1"}
    )["message"]


def test_referral_line_full():
    m = _ref_msg({"referrer_uid": "3312345678", "bonus_sessions_referee": 2, "bonus_sessions_referrer": 3})
    assert "🎁 Thưởng giới thiệu:" in m
    assert "Bé được giới thiệu (Minh Phương): +2 buổi" in m
    assert "Người giới thiệu — UID 3312345678: +3 buổi" in m


def test_referral_line_referee_only():
    m = _ref_msg({"bonus_sessions_referee": 2})
    assert "Bé được giới thiệu (Minh Phương): +2 buổi" in m
    assert "Người giới thiệu" not in m  # vế người GT ẩn khi 0 buổi + không UID


def test_referral_line_uid_but_no_sessions():
    m = _ref_msg({"referrer_uid": "3312345678"})
    assert "Người giới thiệu — UID 3312345678: chưa ghi số buổi" in m


def test_referral_line_empty_shows_warning():
    m = _ref_msg({})  # gói REFER nhưng sale bỏ trống hết
    assert "⚠ Gói giới thiệu — chưa nhập UID & số buổi cộng" in m
    assert "🎁" not in m


def test_referral_line_absent_for_non_referral():
    from utils.zalo_message_builder import build_activation_request_created_message
    ar = {"id": "AR-1", "customer_name": "Bé C",
          "uids_data": [{"uid": "111", "name": "Bé C", "courses": [{"name": "Phil 48+5"}]}]}
    pr = {"phone": "0900", "country": "VN", "lead_source": "quang_cao", "received": 1000}
    m = build_activation_request_created_message(ar, pr, {"display_name": "S", "team": "Inhouse 1"})["message"]
    assert "🎁" not in m and "⚠ Gói giới thiệu" not in m
```

- [ ] **Step 2: Chạy test — xác nhận fail**

Run: `cd backend && python -m pytest tests/test_referral_bonus.py -k referral_line -q`
Expected: FAIL (chưa có dòng referral / helper chưa tồn tại).

- [ ] **Step 3: Thêm helper `_referral_lines`** — trong `backend/utils/zalo_message_builder.py`, đặt NGAY TRƯỚC `def build_activation_request_created_message`:

```python
def _referral_lines(course: dict[str, Any], child_label: str) -> list[str]:
    """Dòng 'Thưởng giới thiệu' cho 1 course REFER. [] nếu không phải REFER.

    Flush-left (markdown DingTalk nuốt space đầu dòng). Trống hết → dòng ⚠ nhắc,
    KHÔNG bịa số. Vế = 0 buổi thì ẩn (anh Minh chốt 24/7).
    """
    name = str(course.get("name") or "")
    lead = str(course.get("lead_source") or "")
    is_ref = "REFER" in name.upper() or lead == "gioi_thieu"
    if not is_ref:
        return []
    ref_uid = str(course.get("referrer_uid") or "").strip()
    try:
        ref_e = int(course.get("bonus_sessions_referee") or 0)
    except (TypeError, ValueError):
        ref_e = 0
    try:
        ref_r = int(course.get("bonus_sessions_referrer") or 0)
    except (TypeError, ValueError):
        ref_r = 0
    # Trống hết → 1 dòng nhắc (lưới an toàn).
    if not ref_uid and ref_e <= 0 and ref_r <= 0:
        return ["⚠ Gói giới thiệu — chưa nhập UID & số buổi cộng"]
    lines = ["🎁 Thưởng giới thiệu:"]
    if ref_e > 0:
        lines.append(f"• Bé được giới thiệu ({child_label}): +{ref_e} buổi")
    if ref_uid or ref_r > 0:
        uid_part = f"UID {ref_uid}" if ref_uid else "chưa rõ UID"
        buoi_part = f"+{ref_r} buổi" if ref_r > 0 else "chưa ghi số buổi"
        lines.append(f"• Người giới thiệu — {uid_part}: {buoi_part}")
    return lines
```

- [ ] **Step 4: Gọi helper trong vòng lặp course** — thay khối [:438-445]:

```python
        course_lines: list[str] = []
        for course in courses:
            if not isinstance(course, dict):
                continue
            course_name = _first_nonempty(course.get("name"), default="(chưa có tên gói)")
            course_lines.append(f"{block_child}, {course_name}")
            course_lines.extend(_referral_lines(course, block_child))
        if not course_lines:
            course_lines = [block_child]
```

> Dòng referral nối bằng `\n` cùng `course_lines` (builder), notifier đổi `\n`→`<br>` khi gửi DingTalk; Zalo dùng `\n` thẳng. Cả 2 kênh đúng.

- [ ] **Step 5: Chạy test — xác nhận pass**

Run: `cd backend && python -m pytest tests/test_referral_bonus.py -q`
Expected: PASS (cả test cũ + 5 test mới).

- [ ] **Step 6: Verify render markdown thật** — kiểm `\n`→`<br>` không vỡ (dòng referral flush-left, `<br>` sạch):

Run: `cd backend && python -c "from dingtalk_notifier import _to_dingtalk_md; print(_to_dingtalk_md('a\n🎁 Thưởng giới thiệu:\n• Bé được giới thiệu (X): +2 buổi'))"`
Expected: `a<br>🎁 Thưởng giới thiệu:<br>• Bé được giới thiệu (X): +2 buổi` (không space đầu dòng nào).

- [ ] **Step 7: Commit**

```bash
git add backend/utils/zalo_message_builder.py backend/tests/test_referral_bonus.py
git commit -m "feat(referral): thêm dòng Thưởng giới thiệu vào tin báo đơn (đủ/1 vế/trống)"
```

---

## Task 7: Kiểm thử tích hợp + smoke + rollout

- [ ] **Step 1: Full unit suite**

Run: `cd frontend && npx vitest run` — PASS.
Run: `cd backend && python -m pytest -q` — PASS.

- [ ] **Step 2: Build FE**

Run: `cd frontend && npm run build` — PASS (`tsc -b && vite build`).

- [ ] **Step 3: Smoke thật trên sandbox** (tài khoản test, KHÔNG spam nhóm kế toán)

Login `test.user@dev` → PR đủ tiền → Báo đơn & Kích hoạt → gói REFER → nhập UID GT + 2 buổi bé + 3 buổi người GT → submit.
Kỳ vọng:
1. AR tạo ra: mở thẻ kích hoạt / GET AR → `uids_data[].courses[].referrer_uid` = UID vừa nhập (referral **không rớt** lúc tạo — mắt xích #1 OK).
2. Tin DingTalk/Zalo báo đơn (tài khoản test) có dòng `↳ Giới thiệu: +2 buổi cho bé · +3 buổi cho người GT (UID GT ...)` (mắt xích #2 OK).
3. Multi-con: 1 bé REFER + 1 bé thường → chỉ bé REFER hiện ô referral; tin đúng dòng theo từng bé.
4. Bỏ trống UID GT nhưng nhập buổi cho người GT → submit bị chặn + hiện lỗi.

- [ ] **Step 4: Regression đường Sửa (PATCH)**

Sau khi tạo, vẫn mở được thẻ kích hoạt → Sửa referral → lưu (PATCH) ghi đè đúng. (Không đổi hành vi cũ.)

- [ ] **Step 5: Merge + prod**

Merge `sandbox` → `main`. **Không migration** (referral sống trong `uids_data` JSONB sẵn có). Verify tin thật 1 lần bằng tài khoản test.

---

## Guardrails (đối chiếu 4 tiêu chí)

1. **Triệt để:** 1 điểm nhập duy nhất (form báo đơn) nuôi cả AR course + tin báo đơn; hết "thừa 1 bước". Sale không cần thoát ra bấm Sửa.
2. **Không lỗi con:**
   - Tái dùng đúng quy tắc validate spec §4 (`validateReferralBonusDraft` mirror `validateReferralBonus`).
   - Giữ nguyên allocation guard (`arRemaining >= 0`), bill-complete guard, seq/race, `_assert_course_names_present`.
   - **Cộng buổi thật vẫn gated**: checkbox credit chỉ mở sau `order_id`, RBAC `can_credit_referral` — plan này chỉ *thu thập* referrer_uid + số buổi dự kiến, không thực thi credit.
   - Đường PATCH (Sửa) giữ nguyên → sửa referral sau khi tạo vẫn chạy.
   - `is_test` PR không enqueue tin (đã có [:1000](../backend/activation_routes.py)).
   - Tin báo đơn gửi dạng **markdown** (title "Báo đơn"); notifier tự đổi `\n`→`<br>` → builder giữ `\n`, KHÔNG hardcode `<br>`, KHÔNG thụt lề đầu dòng (markdown nuốt space).
   - Gói REFER bỏ trống referral → tin hiện **⚠ nhắc**, không im lặng nuốt (lưới an toàn anh Minh chốt 24/7).
3. **Không tăng hạ tầng / giảm perf:** **0 migration** (JSONB sẵn có, verify `test_referral_bonus.py:3`); builder chỉ đọc thêm field đã nạp; không query mới; sửa 1 builder chung cho cả 2 kênh.
4. **Tiết kiệm quota:** plan dùng 1 investigator subagent scope rõ (đã chạy), phần còn lại đọc file trực tiếp; không fan-out.

## Open questions (chốt với anh Hiếu / anh Minh trước khi code)

1. **Capture-vs-execute:** sale nhập `referrer_uid` + số buổi ngay lúc báo đơn (không cần quyền `referral.credit`); còn *thực thi* cộng buổi (checkbox) vẫn gated sau kích hoạt + RBAC. OK với cách tách này chứ?
2. **Sửa sau không re-fire tin:** nếu sale sửa referral qua "Sửa" (PATCH) *sau khi* tạo, tin báo đơn (đã bắn lúc tạo) không gửi lại — giống mọi field khác. Chấp nhận?
3. **Format dòng referral trong tin:** đề xuất `↳ Giới thiệu: +X buổi cho bé · +Y buổi cho người GT (UID GT ...)`. Duyệt wording?

---

## Execution Handoff

Chọn cách chạy:
1. **Subagent-Driven (khuyến nghị)** — mỗi task 1 subagent mới, review giữa các task.
2. **Inline** — chạy tuần tự trong session này, checkpoint theo task.

FE (Task 1-4) và BE (Task 5-6) có thể tách handoff Đức (FE) / Đạt (BE) nếu chia việc — hỏi MD/HTML trước khi viết handoff.
