# Handoff — Fix nhãn "Xác nhận tự động" cho lần thanh toán ghép tay (gateway mPOS/Payoo)

> **Target executor:** Sonnet 4.6 medium. Mọi đường dẫn, số dòng, code, và điều kiện đã chốt sẵn — **không cần đoán, không cần quét lại codebase/DB.**
> **Loại thay đổi:** FE-only, 1 hàm thuần + 1 khối test. Không đụng backend/DB/migration.

---

## 1. Triệu chứng (bug thật, đã điều tra)

PR-2026-0231 · lần thanh toán #1 (`transfer_code = FHRJX`, method `card`) hiển thị:

> "Xác nhận tự động lúc 13/07/2026 10:44"

Nhưng thực tế **không phải máy tự ghép**. Đây là thao tác **ghép tay** trên `CardReconciliationTab`: kế toán `van.nh96@gmail.com` ghép giao dịch mPOS (`txn_code 202607101817101298891`, "Quẹt thẻ", chủ thẻ `MINH/TRUONG THI H`, 18.320.000đ − phí 329.760 = net 17.990.240) vào lần thanh toán. DB có đủ dấu vết người + giờ:

- `payment_lines`: `confirmed_by = van.nh96@gmail.com`, `confirmed_source = gateway`, `confirmed_at = 2026-07-13 03:44:38Z` (10:44 VN)
- `gateway_transactions`: `matched_by = van.nh96@gmail.com`, `matched_at = 2026-07-13 03:44:38Z`

→ Đáng lẽ phải hiển thị **"Xác nhận lúc 13/07/2026 10:44 bởi <người>"**. Dữ liệu đúng; **lỗi nằm hoàn toàn ở hàm render nhãn.**

---

## 2. Nguyên nhân gốc

File: `frontend/src/components/payment-request/paymentRequestUtils.ts`
Hàm: `paymentConfirmationText` (hiện tại dòng **252–264**).

```ts
const isAuto =
  (source && source !== "manual" && source !== "outside") ||   // ← BUG
  (payment.confirmedBy ? payment.confirmedBy.startsWith("system:") : false);
if (isAuto) return date ? `Xác nhận tự động lúc ${date}` : "Xác nhận tự động";
```

Logic coi **mọi `confirmed_source` khác `"manual"`/`"outside"` là auto**. `gateway` rơi vào nhánh auto → in "tự động" và **nuốt luôn tên người ghép** (dù `confirmedBy`/`confirmedByName` có sẵn).

Sai lầm thiết kế: quyết định người-vs-máy dựa trên **enum `confirmed_source`** (danh sách này drift, không tin được — xem §3), thay vì dựa trên **`confirmed_by` (actor)**.

---

## 3. Bằng chứng DB — chốt điều kiện, không vỡ case khác

Query prod (`payment_lines`, chụp 2026-07-13) — phân bố `confirmed_source × loại actor`:

| `confirmed_source` | `confirmed_by` | rows | nhãn hiện tại | nhãn sau fix | thay đổi? |
|---|---|---:|---|---|---|
| **gateway** (mPOS/Payoo, ghép tay) | email người | **3** | ❌ "tự động lúc X" | ✅ "lúc X bởi <người>" | **FIX (đích)** |
| manual | email người | 26 | "lúc X bởi <người>" | "lúc X bởi <người>" | không đổi |
| sepay | `system:sepay` | 117 | "tự động lúc X" | "tự động lúc X" | không đổi |
| payos | `system:payos` | 1 | "tự động lúc X" | "tự động lúc X" | không đổi |
| `null` (legacy qr T6) | `null` | 93 | "Xác nhận lúc X" | "Xác nhận lúc X" | **không đổi** |
| manual_repair | `null` | 1 | "tự động lúc X" | "Xác nhận lúc X" | **có (1 dòng, cố ý)** |

**Kết luận điều kiện (đã verify với backend, không phải đoán):**

- `_mark_line_paid` (`backend/payment_request_routes.py:1304-1331`) **luôn** set `confirmed_by = actor_email`, `confirmed_source = source`.
- Auto path đặt actor = `system:*`:
  - sepay → `actor_email="system:sepay"` (`sepay_routes.py:377`)
  - payos → `actor_email="system:payos"` (`payment_request_routes.py:1424,1515`)
- Human path đặt actor = email thật:
  - gateway ghép tay → `_mark_line_paid(..., actor_email=actor.email, source="gateway")` (`gateway_routes.py:495`)
  - manual → `actor.email` (`payment_request_routes.py:2373`, `sepay_routes.py:612`)
- **`confirmed_source` không đáng tin làm khoá phân loại**: comment schema (`docs/migrations/2026-06-22-payment-lines-audit-cols.sql:9`) còn ghi `manual / payos / sepay / outside / card` — **thiếu** `gateway`, `manual_repair`; **thừa** `outside`, `card` (không tồn tại trong DB). Actor (`confirmed_by`) mới là tín hiệu ổn định.

→ **Khoá quyết định = `confirmed_by`**, không phải `confirmed_source`.

---

## 4. Fix (code hoàn chỉnh — thay nguyên hàm)

Thay hàm `paymentConfirmationText` (dòng 252–264) bằng bản 3-trạng-thái, actor-driven:

```ts
export function paymentConfirmationText(payment: PaymentAttempt): string {
  const date = payment.paidAt ? formatPaymentDateFull(payment.paidAt) : "";
  const actor = (payment.confirmedBy || "").trim();
  const source = (payment.confirmedSource || "").toLowerCase();

  // (1) Actor người thật = có email và KHÔNG bắt đầu "system:".
  // Ghép mPOS/Payoo (source=gateway) + xác nhận tay (source=manual) đều rơi vào đây.
  const hasHumanActor = actor.length > 0 && !actor.startsWith("system:");
  if (hasHumanActor) {
    const name = payment.confirmedByName || emailToName(actor);
    if (!date) return `Xác nhận bởi ${name}`;
    return `Xác nhận lúc ${date} bởi ${name}`;
  }

  // (2) Máy tự xác nhận: actor "system:*" (SePay webhook / PayOS), hoặc — phòng thủ —
  // source auto đã biết mà thiếu actor. KHÔNG gồm legacy null-source.
  const AUTO_SOURCES = new Set(["sepay", "payos"]);
  const isSystemActor = actor.startsWith("system:");
  const isAuto = isSystemActor || (actor.length === 0 && AUTO_SOURCES.has(source));
  if (isAuto) {
    return date ? `Xác nhận tự động lúc ${date}` : "Xác nhận tự động";
  }

  // (3) Không rõ actor (legacy null-source, manual_repair thiếu actor):
  // không quy kết người cũng không quy kết máy.
  return date ? `Xác nhận lúc ${date}` : "Xác nhận";
}
```

Không đổi gì khác trong file. `emailToName` và `formatPaymentDateFull` đã có sẵn trong cùng file.

---

## 5. Guardrail (chống drift khi implement)

- **G1 — Actor-driven, không source-driven.** Quyết định người/máy khoá vào `confirmed_by` (`system:*` = máy, email = người). **Không** thêm nhánh `if source === "gateway"` hay liệt kê từng source để phân loại người/máy. (Lý do: source list đã drift — §3.)
- **G2 — Không regression dòng legacy null-actor (93 dòng).** Line có `confirmed_by` rỗng **và** source ∉ {sepay, payos} **phải** giữ "Xác nhận lúc {date}" (hoặc "Xác nhận" nếu không có ngày). Tuyệt đối không đổi thành "tự động". Test khoá case này.
- **G3 — FE-only.** Không đụng backend, DB, `_mark_line_paid`, không backfill, không sửa `confirmed_source` trong DB. Dữ liệu đã đúng; chỉ hàm render sai.
- **G4 — Hàm thuần, chi phí O(1).** Không thêm API call, không query, không thêm việc render. Cùng 1 hàm, cùng độ phức tạp.
- **G5 — Output chỉ để hiển thị.** Đã verify consumer duy nhất `PaymentRequestDetailDrawer.tsx:315` dùng chuỗi trả về làm text; **không** có logic nào rẽ nhánh theo substring "tự động". Không tạo phụ thuộc mới vào chuỗi này ở nơi khác.
- **G6 — Không nới scope.** Hàm này là thay đổi DUY NHẤT (ngoài file test). Source auto mới trong tương lai sẽ tự set actor=`system:*` (theo lệ `_mark_line_paid`) → tự vào nhánh auto; chỉ thêm vào `AUTO_SOURCES` nếu có source ghi actor rỗng (không nên xảy ra).

---

## 6. Test (Vitest — thêm 1 describe block)

File: `frontend/src/components/payment-request/paymentRequestUtils.test.ts` (đã dùng `import { describe, expect, it } from "vitest"`).

**Nguyên tắc assert (tránh đoán):** không assert chuỗi ngày đã format (phụ thuộc `formatPaymentDateFull`/timezone). Chỉ assert **substring**: `toContain("bởi …")`, `toContain("tự động")`, và `not.toContain(...)`. Với case cần tên → set `confirmedByName` tường minh rồi assert `toContain("bởi <tên đó>")`. Case fallback `emailToName` chỉ assert `toContain("bởi")`.

Thêm import `paymentConfirmationText` vào dòng import từ `./paymentRequestUtils` nếu chưa có. Build object bằng cast `as PaymentAttempt` với các field tối thiểu: `paidAt, confirmedBy, confirmedByName, confirmedSource, status`.

```ts
describe("paymentConfirmationText — người ghép vs máy tự (fix nhãn gateway 13/7)", () => {
  const mk = (o: Partial<PaymentAttempt>) =>
    ({ status: "paid", paidAt: "2026-07-13T03:44:38Z", ...o } as PaymentAttempt);

  it("gateway + người ghép (có confirmedByName) → 'bởi <người>', KHÔNG 'tự động'", () => {
    const t = paymentConfirmationText(mk({
      confirmedSource: "gateway", confirmedBy: "van.nh96@gmail.com", confirmedByName: "Vân NH",
    }));
    expect(t).toContain("bởi Vân NH");
    expect(t).not.toContain("tự động");
  });

  it("gateway + người ghép (thiếu confirmedByName) → fallback tên, vẫn có 'bởi'", () => {
    const t = paymentConfirmationText(mk({
      confirmedSource: "gateway", confirmedBy: "van.nh96@gmail.com", confirmedByName: null,
    }));
    expect(t).toContain("bởi");
    expect(t).not.toContain("tự động");
  });

  it("manual + người → 'bởi <người>' (không đổi)", () => {
    const t = paymentConfirmationText(mk({
      confirmedSource: "manual", confirmedBy: "anhminhcv0512@gmail.com", confirmedByName: "Anh Minh",
    }));
    expect(t).toContain("bởi Anh Minh");
    expect(t).not.toContain("tự động");
  });

  it("sepay + system:sepay → 'tự động' (không đổi)", () => {
    const t = paymentConfirmationText(mk({ confirmedSource: "sepay", confirmedBy: "system:sepay" }));
    expect(t).toContain("tự động");
    expect(t).not.toContain("bởi");
  });

  it("payos + system:payos → 'tự động' (không đổi)", () => {
    const t = paymentConfirmationText(mk({ confirmedSource: "payos", confirmedBy: "system:payos" }));
    expect(t).toContain("tự động");
  });

  it("G2: legacy null-source + null actor → 'Xác nhận lúc …', KHÔNG 'tự động', KHÔNG 'bởi'", () => {
    const t = paymentConfirmationText(mk({ confirmedSource: null, confirmedBy: null }));
    expect(t).toContain("Xác nhận lúc");
    expect(t).not.toContain("tự động");
    expect(t).not.toContain("bởi");
  });

  it("manual_repair + null actor → 'Xác nhận lúc …', KHÔNG 'tự động' (đổi có chủ đích, 1 dòng)", () => {
    const t = paymentConfirmationText(mk({ confirmedSource: "manual_repair", confirmedBy: null }));
    expect(t).not.toContain("tự động");
  });

  it("người thật, không có paidAt → 'Xác nhận bởi <người>' (không có 'lúc')", () => {
    const t = paymentConfirmationText(mk({
      paidAt: null, confirmedSource: "gateway", confirmedBy: "van.nh96@gmail.com", confirmedByName: "Vân NH",
    }));
    expect(t).toBe("Xác nhận bởi Vân NH");
  });

  it("system actor, không có paidAt → 'Xác nhận tự động'", () => {
    const t = paymentConfirmationText(mk({ paidAt: null, confirmedSource: "sepay", confirmedBy: "system:sepay" }));
    expect(t).toBe("Xác nhận tự động");
  });

  it("phòng thủ: source auto biết trước nhưng thiếu actor → vẫn 'tự động'", () => {
    const t = paymentConfirmationText(mk({ confirmedSource: "sepay", confirmedBy: null }));
    expect(t).toContain("tự động");
  });
});
```

---

## 7. Validation loop (chạy rẻ trước, dừng ở lỗi đầu tiên)

```bash
cd frontend && npx tsc -b                              # Vercel parity (KHÔNG dùng --noEmit)
cd frontend && npm run test -- paymentRequestUtils     # phải xanh toàn bộ, gồm 10 case mới
```

Không cần chạy E2E cho thay đổi này (thuần render text, 1 hàm).

---

## 8. Đối chiếu 4 tiêu chí

1. **Triệt để:** sửa đúng gốc (hàm phân loại render) bằng luật actor-driven bao **toàn bộ** source qua evidence table §3 — không phải special-case riêng cho gateway.
2. **Không lỗi con:** 3-trạng-thái giữ nguyên hành vi manual/sepay/payos/legacy-null (bảng §3 cho thấy delta chỉ là 3 dòng gateway đích + 1 dòng manual_repair cố ý). 10 test khoá từng nhánh, gồm G2 regression lock.
3. **Không tăng hạ tầng / giảm hiệu năng:** hàm thuần, FE-only, không query/API mới, O(1).
4. **Tiết kiệm quota:** đổi 1 file + 1 khối test; không subagent, không fan-out. Executor chạy thẳng từ doc này, không cần dò lại DB/codebase (đã có sẵn path + số dòng + code + điều kiện).
