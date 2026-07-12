# PLAN — Bỏ multi-child ở PR + Thêm "Tên bé" ở kích hoạt + Smart-split tên con

> **Người thực thi**: Sonnet 4.6 (medium). Làm **đúng theo thứ tự**, tôn trọng **GUARDRAILS** (mục 1).
> **Scope: 100% FRONTEND.** KHÔNG sửa backend, KHÔNG migration, KHÔNG drop cột DB.
> Ngày lập: 2026-07-12. Nền: điều tra 6 agent (create modal, edit drawer, types+BE, activation modal, activation BE, message builder).

---

## 0. Bối cảnh & quyết định đã chốt

Chủ dự án quyết định:
1. **Bỏ hoàn toàn** feature "Thêm con (PH có nhiều bé học)" (multi-child) ở **tạo PR** và **sửa PR**. Giữ nguyên trường `childName` đơn (nó là nguồn nội dung chuyển khoản — riêng biệt).
2. **Thêm 1 ô "Tên bé"** ở modal **"Chọn gói học để kích hoạt"** (bước tạo Yêu cầu kích hoạt) → tên bé chảy vào tin "YÊU CẦU KÍCH HOẠT KHOÁ HỌC — AR-xxxx".
3. **Smart-split**: tách chuỗi tên con free-text (vd `"Lê Bảo Châu - Lê Bảo Khánh"`) thành các tên riêng, đưa vào (a) dropdown "TÊN TRÊN NỘI DUNG CK" khi tạo lần TT, (b) gợi ý ô "Tên bé" khi kích hoạt.

Quyết định về chi tiết (đã chốt với chủ dự án — **không tự đổi**):
| # | Quyết định |
|---|---|
| Delimiter | Tách trên: `-` `–` `—` (**phải có space 2 bên**, chống "Anne-Marie"); `/` `&` `+` `,` (cắt **cả khi dính** — DB prod 0 case slash trong tên nên an toàn); ` và ` ` and ` (có space). Kiểm DB 2026-07-12 mục 0.1. |
| Layout tin | **Giữ dạng prefix** `"<Tên bé>, <Gói học>"` → **KHÔNG sửa message builder** (0 dòng backend) |
| Modal đích | **Chỉ** modal `"Chọn gói học để kích hoạt"` trong `PaymentRequestDetailDrawer.tsx` (KHÔNG động `ActivationTab` ARCreateModal) |
| Ô Tên bé | `<input list=datalist>` (pick gợi ý **hoặc** gõ tay); **tuỳ chọn**, không chặn submit |
| Delivery | **Ngoài scope.** Không bật lại Zalo, không thêm DingTalk producer |

**4 tiêu chí** (mọi thay đổi phải pass): triệt để · không lỗi con · không tăng gánh nặng hạ tầng · tối ưu token.

### 0.1. Kiểm chứng DB production (2026-07-12) — nền cho luật split
Query `payment_requests` (project_palfish, 202 PR / 197 có `child_name`):
- `child_name` chứa `/`: **0** (không có mã lớp/ngày trong tên con → tách slash cả khi dính là an toàn).
- Chỉ **~6 PR đa-tên** (trên 197), dùng đúng: ` - ` (1), `&` (1), `,` (2), ` và ` (3). Không có `+`, ` and `, dash dính.
- `extra_children` (feature "Thêm con" cấu trúc): **0 PR** → chưa ai dùng → xóa multi-child = **0 mất data**, split free-text phủ 100% ca thật.
- 6 chuỗi thật được đưa thẳng vào test (mục 6.1) làm golden case.

---

## 1. GUARDRAILS — bất biến, vi phạm là hỏng

- **G1 — GIỮ `childName` đơn.** KHÔNG xóa `FormState.childName`, `child_name` payload, `PaymentRequest.childName`. Nó là nguồn `nameForTransfer = pr.childName || pr.name` (nội dung CK). Xóa = hỏng nội dung chuyển khoản mọi PR mới.
- **G2 — GIỮ type + parser phía response.** KHÔNG xóa `PaymentRequest.children` / `PrChild` (`types/paymentRequest.ts`) và `fromApiPaymentRequest` children parser (`paymentRequestUtils.ts`). BE vẫn trả `children[]`; xóa sẽ vỡ test `paymentRequestUtils.test.ts` (block "multi-con mappers") và không đọc được PR đa-con cũ.
- **G3 — KHÔNG đụng backend / DB / migration.** Cột `payment_requests.extra_children`, `payment_lines.student_name`, logic `_parse_children`, `_normalize_uid_block`… để **dormant**. FE ngừng gửi `children[]` là đủ; BE tự chạy đúng (children optional). Test `backend/tests/test_pr_multi_child.py` phải vẫn xanh (không sửa).
- **G4 — `nameForTransfer` phải còn chạy.** Sau khi bỏ multi-child, dropdown "TÊN TRÊN NỘI DUNG CK" (`PaymentRequestDetailDrawer.tsx` ~535-546) vẫn phải hoạt động: PR 1 tên → 1 option `Con:`, PR không tên con → input readOnly = `pr.name`.
- **G5 — `splitChildNames` fail-safe.** 1 tên (không delimiter) → `[tên]` (y hệt hôm nay); rỗng/null → `[]` (caller fallback tên KH); **KHÔNG** đoán ranh giới khi không có delimiter tường minh. Dropdown/ô Tên bé **không bao giờ được rỗng** một cách vô lý.
- **G6 — Ô Tên bé phải cho gõ tay.** `ui/Combobox` KHÔNG commit free-text → **dùng `<input list=datalist>`** (như `ActivationTab` cho gói học). Không dùng `<Combobox>` cho ô Tên bé.
- **G7 — Tên bé OPTIONAL.** Không đưa vào điều kiện chặn submit (`arValid`). Để trống vẫn tạo AR được (builder fallback về `pr.child_name`).
- **G8 — `tsc -b` phải pass.** Mọi biến/hàm bị xóa phải xóa hết chỗ tham chiếu trong cùng một lần (vd `childrenOk` ở `canSubmit`). Chạy `cd frontend && npx tsc -b` (KHÔNG dùng `--noEmit`).
- **G9 — KHÔNG sửa `buildCreateActiveRequestPayload`.** Nó đã map `row.childName → uid block.name` (`paymentRequestUtils.ts` ~296-316). Ô Tên bé chỉ cần ghi vào `row.childName`.
- **G10 — KHÔNG sửa message builder / delivery.** `build_activation_request_created_message` giữ nguyên (layout prefix). Tên bé hiện qua `uids_data[].name` sẵn có.

---

## 2. `splitChildNames()` — hàm mới (làm ĐẦU TIÊN)

**File**: `frontend/src/components/payment-request/paymentRequestUtils.ts` — thêm export mới (đặt gần đầu file, sau các import).

```ts
/**
 * Tách chuỗi tên con free-text thành danh sách tên riêng lẻ.
 * CHỈ tách theo dấu phân cách tường minh — KHÔNG đoán ranh giới khi không có dấu.
 *   "Lê Bảo Châu - Lê Bảo Khánh" | "A & B" | "A và B" | "A + B" | "A, B" | "A/B" | "A / B" → 2 tên
 *   "Anne-Marie" (gạch nối dính) → giữ nguyên (dash phải có space 2 bên; KH nước ngoài)
 *   "Kim Ji Yong" → ["Kim Ji Yong"] ;  "" / null / "   " → []
 * DB prod 2026-07-12: 197 PR có child_name, 0 chứa "/", ~6 PR đa-tên (dùng " - ","&",","," và ");
 * extra_children = 0 → split đủ phủ. Slash cắt cả khi dính (không có false-positive trong data).
 * Fail-safe (G5): dùng ở dropdown/ô gợi ý; rỗng → caller fallback tên KH.
 */
export function splitChildNames(raw?: string | null): string[] {
  if (!raw) return [];
  // dash (- – —): PHẢI có space 2 bên (chống cắt "Anne-Marie") | slash,&,+,phẩy: cắt cả khi dính | và/and: có space
  const SEP = /\s+[-–—]\s+|\s*[\/&+,]\s*|\s+và\s+|\s+and\s+/i;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(SEP)) {
    const name = part.replace(/\s+/g, " ").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue; // dedupe (case-insensitive)
    seen.add(key);
    out.push(name);
  }
  return out.slice(0, 6); // cap chống blow-up
}
```

Test đi kèm ở **mục 6.1** (viết luôn cùng lúc — đây là guardrail sống).

---

## 3. PART A — Bỏ multi-child ở `CreatePaymentRequestModal.tsx`

File: `frontend/src/components/payment-request/CreatePaymentRequestModal.tsx`. Anchor theo **code**, số dòng là gần đúng.

| Hành động | Anchor (code) | Chi tiết |
|---|---|---|
| REMOVE | `extraChildren: { name: string; uid: string }[];` + comment `/** Multi-con... */` (~34-35) | Xóa field khỏi `FormState`. Giữ `childName: string;` (~14). |
| REMOVE | `extraChildren: [],` (~58) | Xóa khỏi `INITIAL`. Giữ `childName: "",` (~41). |
| REMOVE | block `const extraNames = ...` → `const childrenOk = ...` (~98-105) + comment `// Multi-con:` | Xóa cả `extraNames`, `allChildNames`, `childrenOk`. |
| MODIFY | `emailValid && addressOk && childrenOk` (~110) | Đổi thành `emailValid && addressOk`. **Bắt buộc cùng lúc** với xóa `childrenOk` (G8, nếu không `tsc -b` fail). |
| REMOVE | property `children: form.extraChildren.length > 0 ? [...] : undefined,` + comment (~136-142) trong `onSubmit({...})` | Xóa. Giữ `child_name: form.childName.trim() || undefined,` (~121). Property trước đó (`wants_invoice`) đã có dấu phẩy → object vẫn hợp lệ. |
| REMOVE | `const setExtraChild = ...` và `const removeExtraChild = ...` (~146-152) | Helper chỉ dùng cho rows đã xóa. |
| MODIFY | `<label>Tên con (học viên){form.extraChildren.length > 0 && <span...>*</span>}</label>` (~185) | Đổi thành `<label>Tên con (học viên)</label>` (bỏ dấu bắt buộc động). |
| REMOVE | `{form.extraChildren.map(...)}` + `<button>...Thêm con (PH có nhiều bé học)</button>` + `{!childrenOk && (...)}` (~194-226) | Xóa 3 phần. **GIỮ** `<input value={form.childName}...>` (~186-190), hint "Nếu để trống, nội dung chuyển khoản..." (~191-193), và thẻ `<div className="field">`/`</div>` bao ngoài (~184/227). |

**GIỮ NGUYÊN** (đừng đụng): `childName` field, `INITIAL.childName`, `child_name` trong payload, ô input tên con + hint.
**Không có test file cho modal này** → không cần sửa test ở Part A.

---

## 4. PART B — `PaymentRequestDetailDrawer.tsx` (gộp 3 việc trong 1 file)

File: `frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx`. Làm cả 3 mục 4a/4b/4c trong file này để tránh xung đột.

### 4a. AddPaymentForm — bỏ multi-child + áp smart-split cho dropdown nội dung CK

| Hành động | Anchor | Chi tiết |
|---|---|---|
| REMOVE | `const children = pr.children ?? [];` `const multiChild = children.length >= 2;` `const [studentName, setStudentName] = useState("");` (~398-401) | 3 dòng chỉ phục vụ selector multi-child. |
| REPLACE | `const childNameOptions = multiChild ? ... : pr.childName ? [...] : [];` (~403-407) | Thay bằng block dùng `splitChildNames` (xem dưới). |
| KEEP | `const nameOptions = [{ value: pr.name, label: \`KH: ${pr.name}\` }, ...childNameOptions];` (~408-411) | Giữ nguyên. |
| REMOVE | dòng `student_name: studentName || undefined,` (~449) trong `onSubmit({...})` | Giữ `name_for_transfer: method === "qr" ? nameForTransfer : undefined,` (~448). |
| REMOVE | cả block `{multiChild && ( <div className="field"><label>Của con nào?</label><select>...</select></div> )}` (~492-510) | **KHÔNG** xóa `<div style={{display:"flex"...}}>` bao ngoài (~491) — nó còn bọc field số tiền/bank. |
| KEEP | `const [nameForTransfer, setNameForTransfer] = useState(pr.childName || pr.name);` (~396) | G4 — nguồn nội dung CK. |
| KEEP | block `<label>Tên trên nội dung CK</label>{nameOptions.length > 1 ? <select> : <input readOnly>}` (~535-546) | G4. |

**REPLACE cho `childNameOptions`** (~403-407):
```ts
// Smart-split: tách childName free-text ("A - B") thành các tên riêng cho dropdown nội dung CK
const splitNames = splitChildNames(pr.childName);
const childNameOptions = splitNames.map((n) => ({ value: n, label: `Con: ${n}` }));
// Giữ cả cụm gốc làm 1 lựa chọn khi tách ra >1 tên (an toàn nếu sales muốn cả cụm)
if (splitNames.length > 1 && pr.childName?.trim()) {
  childNameOptions.push({ value: pr.childName.trim(), label: `Con: ${pr.childName.trim()}` });
}
```
> Cần import `splitChildNames` từ `./paymentRequestUtils` (kiểm tra dòng import hiện có, thêm vào cùng nhóm import từ `paymentRequestUtils`).
> Kết quả: PR 1 tên → 1 option (y hệt cũ); PR `"A - B"` → `Con: A`, `Con: B`, `Con: A - B`; PR không tên → `[]` → chỉ `KH:` (input readOnly). Default `nameForTransfer` vẫn khớp một option → không lỗi.

### 4b. Bỏ multi-child ở phần Sửa thông tin KH (DraftPr)

| Hành động | Anchor | Chi tiết |
|---|---|---|
| REMOVE | trong interface `DraftPr`: `extraChildren: { name: string; uid: string }[];` + comment (~637-638) | Giữ `childName: string;` (~636). |
| REMOVE | dòng `extraChildren: (request.children ?? []).slice(1).map(...)` ở **CẢ HAI** seed draft (~1696 và ~1851) | Giữ `childName: request.childName || "",` phía trên mỗi seed. |
| REMOVE | `const wasMulti = ...` + `const nextChildren = ...` + block `if (nextChildren) {...dup-name alert...}` (~1901-1916) trong handler Lưu | Giữ. |
| REMOVE | spread `...(nextChildren ? { children: nextChildren } : {}),` (~1922) trong `onUpdatePr({...})` | Giữ `childName: draft.childName || undefined,` (~1921). |
| MODIFY | display read-only child (~1980-1991): block `{(request.childName || (request.children?.length ?? 0) >= 2) && (...)}` | Thu về 1 con: `{request.childName && (<div className="info-cell"><div className="info-label">Tên con (học viên)</div><div className="info-value">{request.childName}</div></div>)}` |
| MODIFY | label edit (~2114): `Tên con (học viên){draft.extraChildren.length > 0 ? " — bé 1" : ""}` | Đổi thành `Tên con (học viên)`. Giữ `<input value={draft.childName}...>` (~2115-2126). |
| REMOVE | `{draft.extraChildren.map(...)}` + `<button>...Thêm con</button>` (~2127-2172) | Giữ `</div>` đóng info-cell (~2173). |

### 4c. Modal "Chọn gói học để kích hoạt" — thêm ô "Tên bé" + bỏ selector multi-child

**State** (cấp component, gần `const [arDraftRows, setArDraftRows] = ...` ~1613-1614):
```ts
const [arChildName, setArChildName] = useState("");
```

**Seed khi mở modal** — trong onClick nút "Kích hoạt khoá học" (~2615-2625), thay đoạn `const kids = ...; setArDraftRows(kids.map(...))` bằng:
```ts
// 1 con / 1 UID sau khi bỏ multi-child. Seed 1 dòng gói, tiền = toàn bộ đã thu.
setArChildName(splitChildNames(request.childName)[0] ?? "");
setArDraftRows([{ childName: "", uid: request.uid ?? "", packageName: "", amount: Math.max(0, request.received) }]);
setArPackageModalOpen(true);
```

**Trong IIFE modal** (~2633-2644):
- REMOVE `const arChildren = request.children ?? [];` và `const arMultiChild = arChildren.length >= 2;`
- MODIFY `arRowsValid`: bỏ điều kiện childName →
  ```ts
  const arRowsValid = arDraftRows.length > 0 && arDraftRows.every((r) => r.packageName.trim() && r.amount > 0);
  ```
- ADD nguồn gợi ý tên bé (dùng cho datalist):
  ```ts
  const arChildOptions = (() => {
    const names = splitChildNames(request.childName);
    for (const c of request.children ?? []) { // union tên bé PR đa-con cũ (nếu có)
      if (c.name && !names.some((n) => n.toLowerCase() === c.name.toLowerCase())) names.push(c.name);
    }
    return names;
  })();
  ```

**Header subtitle** (~2657): xóa đoạn `{arMultiChild && " PR này có nhiều bé — mỗi dòng là 1 gói cho 1 bé."}`.

**Modal body** — thêm ô "Tên bé" **ngay trước** `{arDraftRows.map(...)}` (~2665):
```tsx
<div className="field" style={{ marginBottom: 12 }}>
  <label>Tên bé <span style={{ color: "var(--text-3)", fontWeight: 400 }}>(hiển thị trong yêu cầu kích hoạt)</span></label>
  <input
    list="ar-child-names"
    value={arChildName}
    onChange={(e) => setArChildName(e.target.value)}
    placeholder="Chọn hoặc gõ tên bé..."
  />
  <datalist id="ar-child-names">
    {arChildOptions.map((n) => (<option key={n} value={n} />))}
  </datalist>
</div>
```

**Trong rows map**: REMOVE cả block `{arMultiChild && (<div className="field">...<label>Bé</label><select>...</select></div>)}` (~2667-2682). Giữ field Gói học + Số tiền.

**Nút "Thêm gói"** (~2716-2724): seed dòng mới không phụ thuộc arChildren, và bỏ hậu tố label:
```tsx
onClick={() => setArDraftRows((rows) => [...rows, { childName: "", uid: request.uid ?? "", packageName: "", amount: 0 }])}
// label: đổi `Thêm gói{arMultiChild ? " / bé" : ""}` → `Thêm gói`
```

**Submit** (~2749-2752) — bơm arChildName vào mọi row (một con → gom về 1 uid-block với `name`):
```tsx
onClick={() => {
  if (!arValid) return;
  setArPackageModalOpen(false);
  const name = arChildName.trim();
  onCreateActiveRequest(arDraftRows.map((r) => ({ ...r, childName: name })));
}}
```
> `buildCreateActiveRequestPayload` gom theo `childName|uid` → 1 block, `block.name = name` → lưu `uids_data[].name` → tin hiện `"<Tên bé>, <Gói học>"`. **Không sửa gì thêm** (G9).

---

## 5. PART C — `types/paymentRequest.ts`

File: `frontend/src/types/paymentRequest.ts`.

| Hành động | Anchor | Chi tiết |
|---|---|---|
| REMOVE | `children?: { name: string; uid?: string | null }[];` + comment (~234-235) trong `CreatePaymentRequestPayload` | Đây là **cần gạt duy nhất** khiến cả CREATE và EDIT (`PatchPaymentRequestPayload = Partial<Create>`) ngừng gửi `children[]`. Giữ `child_name?: string;` (~219). |
| KEEP | `PaymentRequest.children` / `PrChild` (~88-99) và `CreateActiveRequestUidPayload.name?` (~249) và `ArDraftRow` (~256-261) | G2. BE vẫn trả `children[]`; `name` là kênh chở Tên bé (đã có). |

> Sau khi xóa field này, chạy `tsc -b` — nếu có component nào còn **ghi** `children:` vào payload create/patch, nó sẽ báo lỗi type ⇒ đó chính là chỗ Part A/B cần đã dọn. Nếu báo lỗi ở chỗ khác, dừng lại và rà (đừng ép kiểu).

---

## 6. TESTS (guardrail sống — làm cùng lúc với code)

### 6.1. MỚI — `frontend/src/components/payment-request/splitChildNames.test.ts`
```ts
import { describe, it, expect } from "vitest";
import { splitChildNames } from "./paymentRequestUtils";

describe("splitChildNames", () => {
  it("tách các delimiter thường gặp → 2 tên", () => {
    for (const raw of [
      "Lê Bảo Châu - Lê Bảo Khánh",
      "Lê Bảo Châu & Lê Bảo Khánh",
      "Lê Bảo Châu và Lê Bảo Khánh",
      "Lê Bảo Châu VÀ Lê Bảo Khánh",
      "Lê Bảo Châu + Lê Bảo Khánh",
      "Lê Bảo Châu, Lê Bảo Khánh",
      "Lê Bảo Châu / Lê Bảo Khánh",
      "Lê Bảo Châu and Lê Bảo Khánh",
    ]) {
      expect(splitChildNames(raw)).toEqual(["Lê Bảo Châu", "Lê Bảo Khánh"]);
    }
  });
  it("1 tên không delimiter → giữ nguyên", () => {
    expect(splitChildNames("Kim Ji Yong")).toEqual(["Kim Ji Yong"]);
  });
  it("KHÔNG tách gạch nối dính (tên nước ngoài)", () => {
    expect(splitChildNames("Anne-Marie")).toEqual(["Anne-Marie"]);
  });
  it("tách slash cả khi dính lẫn có space", () => {
    expect(splitChildNames("Lê Bảo Châu/Lê Bảo Khánh")).toEqual(["Lê Bảo Châu", "Lê Bảo Khánh"]);
    expect(splitChildNames("Lê Bảo Châu / Lê Bảo Khánh")).toEqual(["Lê Bảo Châu", "Lê Bảo Khánh"]);
  });
  it("golden — 6 case THẬT trong DB production (2026-07-12)", () => {
    expect(splitChildNames("Lê Bảo Châu - Lê Bảo Khánh")).toEqual(["Lê Bảo Châu", "Lê Bảo Khánh"]);
    expect(splitChildNames("Đỗ Vũ Cát Tường & Đỗ Gia Huy")).toEqual(["Đỗ Vũ Cát Tường", "Đỗ Gia Huy"]);
    expect(splitChildNames("Bảo, Bối")).toEqual(["Bảo", "Bối"]);
    expect(splitChildNames("Bé Phúc Khang và Khôi Nguyên")).toEqual(["Bé Phúc Khang", "Khôi Nguyên"]);
    expect(splitChildNames("Nguyễn Bảo Nhi và Nguyễn Bảo Nguyên")).toEqual(["Nguyễn Bảo Nhi", "Nguyễn Bảo Nguyên"]);
    expect(splitChildNames("Võ Văn Bách và Võ Xuân Châm,")).toEqual(["Võ Văn Bách", "Võ Xuân Châm"]); // trailing comma
  });
  it("rỗng / null / khoảng trắng → []", () => {
    expect(splitChildNames("")).toEqual([]);
    expect(splitChildNames(null)).toEqual([]);
    expect(splitChildNames("   ")).toEqual([]);
  });
  it("bỏ phần rỗng, gộp space thừa, dedupe", () => {
    expect(splitChildNames("Châu -  ")).toEqual(["Châu"]);
    expect(splitChildNames("Châu  Bảo  -  Khánh")).toEqual(["Châu Bảo", "Khánh"]);
    expect(splitChildNames("Châu & Châu")).toEqual(["Châu"]);
  });
  it("mix delimiter", () => {
    expect(splitChildNames("A - B & C, D")).toEqual(["A", "B", "C", "D"]);
  });
  it("cap 6 tên", () => {
    expect(splitChildNames("a - b - c - d - e - f - g - h")).toHaveLength(6);
  });
});
```

### 6.2. PHẢI vẫn XANH (không sửa — nếu đỏ là làm sai)
- `frontend/src/components/payment-request/paymentRequestUtils.test.ts` — block "multi-con mappers" (G2: type + parser còn nguyên).
- `backend/tests/test_pr_multi_child.py` — (G3: BE dormant, không đụng).
- `backend/tests/test_zalo_builder.py`, `test_zalo_integration.py`, `test_activation_bill_guard.py` — (G10: builder + delivery không đổi).

### 6.3. (Tuỳ chọn, khuyến khích) render test nhẹ
Một test render `PaymentRequestDetailDrawer` khẳng định: nút "Thêm con" và select "Của con nào?" đã biến mất; ô "Tên con" đơn + dropdown "TÊN TRÊN NỘI DUNG CK" vẫn render. Không bắt buộc để suite xanh.

### 6.4. Lệnh chạy trước khi báo xong
```bash
cd frontend && npx tsc -b          # PHẢI pass (G8) — dùng -b, KHÔNG --noEmit
cd frontend && npm run test        # unit tests
cd frontend && npm run build       # build giống Vercel (tsc -b && vite build)
```

---

## 7. Verify thủ công (mô tả cho người kiểm)

1. **Tạo PR mới**: không còn nút "+ Thêm con (PH có nhiều bé học)"; ô "Tên con (học viên)" vẫn còn, không bắt buộc.
2. **Sửa PR**: mục sửa không còn "Thêm con"; hiển thị chỉ "Tên con (học viên)".
3. **Tạo lần thanh toán** (PR có `childName = "Lê Bảo Châu - Lê Bảo Khánh"`): dropdown "TÊN TRÊN NỘI DUNG CK" có `KH: ...`, `Con: Lê Bảo Châu`, `Con: Lê Bảo Khánh`, `Con: Lê Bảo Châu - Lê Bảo Khánh`.
4. **Kích hoạt khoá học** → modal "Chọn gói học để kích hoạt": có ô **Tên bé** với gợi ý tách sẵn; **chọn** hoặc **gõ tay** đều được; để trống vẫn "Tạo yêu cầu kích hoạt" được.
5. **Network** khi tạo AR: body `uids[0].name` = tên bé đã chọn (nếu có).

---

## 8. NGOÀI SCOPE — đừng làm

- Bật lại delivery Zalo (`ZALO_ENABLED_EVENTS`) hoặc thêm DingTalk producer cho `activation_request_created`.
- Sửa `build_activation_request_created_message` / thêm dòng "Tên bé:" (đã chốt giữ prefix).
- Drop cột `extra_children` / `student_name`, hay bất kỳ migration nào.
- Xóa type `PaymentRequest.children` / `PrChild` / parser.
- Thêm ô Tên bé vào `ActivationTab` ARCreateModal (Path A).

---

## 9. Bản đồ file (đổi trong task này)
| File | Việc |
|---|---|
| `frontend/src/components/payment-request/paymentRequestUtils.ts` | + `splitChildNames()` |
| `frontend/src/components/payment-request/splitChildNames.test.ts` | + test mới |
| `frontend/src/components/payment-request/CreatePaymentRequestModal.tsx` | Part A: bỏ multi-child |
| `frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx` | Part B: bỏ multi-child + split dropdown + ô Tên bé |
| `frontend/src/types/paymentRequest.ts` | Part C: bỏ `children?` khỏi `CreatePaymentRequestPayload` |

**Backend: 0 file.** **DB/migration: 0.**
