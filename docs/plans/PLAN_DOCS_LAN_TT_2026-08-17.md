# PLAN — Dọn & soạn lại docs "lần thanh toán"

**Dự án:** gmv
**Ngày:** 2026-08-17
**Mục tiêu (1 câu):** Xoá trang HDSD "Tạo lần TT chuẩn" (đang trùng nội dung tạo PR), gộp về 1 trang duy nhất **"Cách tạo và quản lý lần TT (mọi trường hợp)"** soạn đúng bản chất (đủ 4 phương thức, nêu rõ khác biệt chuyển khoản vs tín dụng), không để lại tham chiếu chết.

**Quyết định chốt (từ anh Minh):**
1. Xoá trang `tao-lan-tt-chuan` (cũ, nội dung là tạo PR — trùng bài "Tạo Payment Request").
2. Trang `quan-ly-lan-thanh-toan` → đổi tên thành **"Cách tạo và quản lý lần TT (mọi trường hợp)"** + soạn lại: hướng dẫn chi tiết tạo từng loại lần TT (chuyển khoản khác tín dụng về cách điền) + phần quản lý cũ.
3. Đấu nối lại nút HDSD từ trang cũ sang trang mới soạn đúng.

---

## Bối cảnh & 1 chỉnh scope quan trọng

Đã khảo sát codebase (3 subagent song song). Chốt sự thật:

- **Docs auto-discover** bằng `import.meta.glob("./**/*.md")` (`frontend/src/content/help/index.ts`). **Slug = tên file**, không phải frontmatter `title`. Không có registry/sidebar-config nào phải sửa tay.
- ⚠️ **KHÔNG có nút HDSD nào đang trỏ trang cũ `tao-lan-tt-chuan`.** Nút "Tạo PR" đã trỏ `tao-payment-request` từ trước (`PaymentRequestsTab.tsx:800`, `CreatePaymentRequestModal.tsx:173`). ⇒ Việc "đấu nối lại nút trỏ trang cũ" **thực tế không còn nút nào để sửa** — chỉ còn dọn **2 cross-ref dạng chữ** trong `.md` khác.
- Nút duy nhất liên quan **trang đích** là `PaymentRequestDetailDrawer.tsx:2442` → `topicSlug="quan-ly-lan-thanh-toan"`. **Vì ta GIỮ NGUYÊN tên file** (chỉ đổi `title`), slug không đổi ⇒ nút này **vẫn đúng, không cần sửa**.
- **Ràng buộc test ẩn:** `screenshots.test.ts` bắt **mỗi bài phải có ≥1 ảnh và ảnh phải tồn tại trên đĩa**. Ảnh `quan-ly-lan-thanh-toan-1.png` **đã có sẵn** ⇒ trang mới cứ dùng lại ảnh này, **không thêm file ảnh mới** (khỏi phải chạy E2E chụp ⇒ không tăng gánh nặng hạ tầng).

---

## HẰNG SỐ CHỐT (single source of truth — mọi task dùng đúng chuỗi này)

> Sonnet: khi context bị nén, **chỉ cần đọc lại khối này + Phụ lục** là đủ làm, không cần hội thoại gốc.

| Khoá | Giá trị (chép chính xác) |
|---|---|
| File **giữ lại** (rewrite) | `frontend/src/content/help/paymentRequests/quan-ly-lan-thanh-toan.md` |
| File **xoá** | `frontend/src/content/help/paymentRequests/tao-lan-tt-chuan.md` |
| Ảnh **xoá** | `frontend/public/docs-images/paymentRequests/tao-lan-tt-chuan-1.png` |
| Ảnh **giữ** (trang mới dùng lại) | `frontend/public/docs-images/paymentRequests/quan-ly-lan-thanh-toan-1.png` |
| slug trang mới (KHÔNG đổi) | `quan-ly-lan-thanh-toan` |
| `title` mới | `Cách tạo và quản lý lần TT (mọi trường hợp)` |
| `order` mới | `2`  (chiếm chỗ order 2 mà trang cũ để lại; nằm ngay sau "Tạo Payment Request") |
| `audience` | `["sale", "ke-toan"]` |
| Heading mốc trong body (test bám vào) | `## Tạo lần thanh toán mới` |
| Cụm chữ mốc trong intro (test bám vào) | `cần tạo một lần thanh toán` |

---

## Milestones & Tasks

### M1 — Xoá trang cũ + dọn tham chiếu chết
- **M1-T1 — Xoá** file `tao-lan-tt-chuan.md` và ảnh `tao-lan-tt-chuan-1.png`.
- **M1-T2 — Sửa cross-ref** trong `quan-ly-lan-thanh-toan.md:13` (câu "Khác với bài **Tạo lần thanh toán (TT) chuẩn**…") → gộp vào bản rewrite ở M2 (câu này bị thay khi viết lại body, xem Phụ lục A).
- **M1-T3 — Sửa cross-ref** trong `tong-quan.md:20`: đổi "(xem bài **Tạo lần thanh toán chuẩn**, mục ghi nhiều tên con)" → "(xem bài **Tạo Payment Request — Hướng dẫn đầy đủ**, mục *PR cho nhiều con*)". Xem Phụ lục B-5.
- **M1-T4 — Dọn E2E** `docs-screenshots.spec.ts`: bỏ đoạn chụp modal Tạo PR ra `tao-lan-tt-chuan-1.png` (dòng ~262–268) + sửa tên test dòng 255. Xem Phụ lục B-4.

### M2 — Soạn lại trang mới (đúng bản chất lần TT)
- **M2-T1 — Ghi đè toàn bộ** `quan-ly-lan-thanh-toan.md` bằng nội dung ở **Phụ lục A** (đã có: frontmatter mới, đủ 4 phương thức, bảng so sánh chuyển khoản vs tín dụng, phần quản lý cũ, giữ ảnh cũ). Không thêm ảnh mới.

### M3 — Sửa test theo trang mới (chống đỏ build)
- **M3-T1 — `index.test.ts`** (dòng 12–20): chuyển "pilot" từ `tao-lan-tt-chuan` → `quan-ly-lan-thanh-toan`, cập nhật title/order/audience/heading theo HẰNG SỐ CHỐT. Phụ lục B-1.
- **M3-T2 — `HelpArticle.test.tsx`** (dòng 15–27): đổi topic pilot + heading + cụm chữ body + breadcrumb. Phụ lục B-2.
- **M3-T3 — `HelpModuleIndex.test.tsx`** (dòng 14, 23–26): đổi title + href sang slug/title mới. Phụ lục B-3.
- **M3-T4 — `HdsdLink.test.tsx`** (dòng 19–25, *không đỏ nhưng slug chết*): đổi ví dụ `tao-lan-tt-chuan` → `quan-ly-lan-thanh-toan`. Phụ lục B-6.

### M4 — Nghiệm thu
- **M4-T1 — Grep sạch:** không còn chuỗi `tao-lan-tt-chuan` hay `Tạo lần thanh toán (TT) chuẩn` / `Tạo lần thanh toán chuẩn` ở đâu ngoài `docs/plans/*` lịch sử. Lệnh ở Phụ lục C.
- **M4-T2 — Unit test:** `cd frontend && npx vitest run src/content/help src/components/help` → xanh.
- **M4-T3 — Typecheck:** `cd frontend && npx tsc -b` → xanh.
- **M4-T4 — Cập nhật `MODULES.md`** nếu có liệt kê danh sách bài HDSD của module paymentRequests (kiểm tra, sửa nếu có nhắc `tao-lan-tt-chuan`).

---

## Thứ tự & ước lượng

| Bước | Phụ thuộc | Ai làm | Ước lượng (Sonnet subagent) |
|---|---|---|---|
| M1 | — | 1 subagent (surgical) | ~5' |
| M2 | — (độc lập M1) | 1 subagent (chép Phụ lục A) | ~5' |
| M3 | Cần HẰNG SỐ CHỐT (đã pin sẵn) | 1 subagent | ~8' |
| M4 | Sau M1–M3 | 1 subagent chạy lệnh | ~5' + thời gian test |

> Có thể chạy **M1 và M2 song song** (khác file). M3 phụ thuộc *chuỗi* của M2 nhưng chuỗi đã pin trong HẰNG SỐ CHỐT ⇒ M3 chạy được ngay từ plan, không cần đợi M2 xong.

---

## Phụ lục A — Nội dung đầy đủ file `quan-ly-lan-thanh-toan.md` (ghi đè nguyên văn)

```markdown
---
title: "Cách tạo và quản lý lần TT (mọi trường hợp)"
order: 2
audience: ["sale", "ke-toan"]
---

Áp dụng khi: cần tạo một lần thanh toán (thu tiền) cho PR, hoặc thao tác trên một lần TT đã có (huỷ, đánh dấu đã TT, sửa số tiền, làm mới nội dung CK).

![Panel "Các lần thanh toán" trong chi tiết PR — danh sách lần TT, nút Tạo lần thanh toán](/docs-images/paymentRequests/quan-ly-lan-thanh-toan-1.png)

> "Lần thanh toán" (lần TT) là **một lần thu tiền bên trong 1 PR**. Một PR có thể có nhiều lần TT — khách chuyển làm nhiều đợt, mỗi đợt có thể một hình thức khác nhau. Muốn tạo **PR mới**, xem bài **Tạo Payment Request — Hướng dẫn đầy đủ**.

## Tạo lần thanh toán mới

1. Mở **chi tiết PR** (bấm vào dòng PR ở Quản lý thanh toán).
2. Ở panel **Các lần thanh toán**, bấm **Tạo lần thanh toán**. Nếu PR chưa có lần nào, nút ghi **Tạo lần thanh toán đầu tiên**.
3. Chọn **Phương thức thanh toán** — 4 lựa chọn: **Chuyển khoản / Tiền mặt / Quẹt thẻ / Trả góp**. Mỗi phương thức điền khác nhau (xem bên dưới).
4. Điền số tiền và các trường theo phương thức.
5. Bấm nút xác nhận — nhãn nút **đổi theo phương thức**:
   - Chuyển khoản → **Tạo QR & mã CK**
   - Tiền mặt / Quẹt thẻ / Trả góp → **Ghi nhận lần thanh toán**

> ⚠️ Nếu PR **đã nhận đủ tiền**, các nút Tạo lần thanh toán sẽ **không mở form** mà hiện thông báo "PR đã nhận đủ tiền". Muốn thu thêm, phải **tăng Tổng tiền dự kiến** của PR trước (bấm "Sửa thông tin PR ngay").

## Chuyển khoản (QR) — mặc định

Dùng khi: khách chuyển khoản ngân hàng. Hệ thống tự sinh **mã QR VietQR** + **nội dung chuyển khoản**; tiền về được đối soát **tự động** — không cần tải bill để khớp.

| Trường | Bắt buộc | Ghi chú |
|---|---|---|
| **Số tiền lần này** | ✅ | Mặc định điền sẵn = số còn thiếu của PR. |
| **Ngân hàng nhận** | — | Mặc định là ngân hàng đầu của đội. Chỉ hình thức Chuyển khoản mới có ô này. |
| **Tên trên nội dung CK** | — | Chọn tên nhúng vào nội dung CK để phân biệt **ai trả**: `KH: <tên PH>` hoặc `Con: <tên bé>`. Nếu PR chỉ có 1 tên thì ô này cố định theo tên khách. |

- Nút xác nhận: **Tạo QR & mã CK**.
- Sau khi tạo: gửi mã QR cho khách (xem bài **Xem & gửi mã QR cho khách**). Không cần tải bill để đối soát.

## Tiền mặt

Dùng khi: thu tiền mặt trực tiếp.

| Trường | Bắt buộc | Ghi chú |
|---|---|---|
| **Số tiền lần này** | ✅ | Mặc định = số còn thiếu. |
| **Người thu** | ✅ | Mặc định là tên bạn (người đang đăng nhập). Không được để trống. |

- Nút xác nhận: **Ghi nhận lần thanh toán**.
- Ô **Mã đối soát** ghi "Tự động tạo bởi hệ thống" — không cần nhập.

## Quẹt thẻ

Dùng khi: khách quẹt thẻ qua máy POS. Thẻ **có phí** nên số thực nhận (NET) **nhỏ hơn** số quẹt (GROSS); kế toán ghép mPOS/Payoo xác nhận sau.

| Trường | Bắt buộc | Ghi chú |
|---|---|---|
| **Số tiền lần này** | ✅ | Là số **GROSS** khách quẹt. Mặc định = số còn thiếu. |
| **4 số cuối thẻ** | — | Không bắt buộc. Nếu điền thì **phải đủ đúng 4 chữ số**, nếu không hệ thống báo lỗi. |

- Nút xác nhận: **Ghi nhận lần thanh toán**.
- Sau khi tạo: dòng lần TT nhắc **"Cần ảnh bill để kế toán xác nhận"** → tải bill lên (nút Up bill trên dòng đó). Khi kế toán xác nhận, dòng hiện công thức **GROSS − phí = NET**.

## Trả góp (tín dụng)

Dùng khi: khách trả góp qua app **Payoo/Mpos**. Đây là "lần TT tín dụng".

**Khác các phương thức trên: KHÔNG có ô "Số tiền lần này".** Thay vào đó:

| Trường | Bắt buộc | Ghi chú |
|---|---|---|
| **Tổng tiền trả góp** | ✅ | Số tiền khách chuyển qua app. **Đây mới là số tiền của lần TT** (không phải ô "Số tiền lần này" như các phương thức khác). |
| **Nền tảng trả góp** | ✅ | Bắt buộc chọn **Payoo** hoặc **Mpos**. |

- Nút xác nhận: **Ghi nhận lần thanh toán**.
- Có phí như quẹt thẻ → **cần tải bill** để kế toán xác nhận NET.

## Chuyển khoản vs Trả góp — khác nhau chỗ nào

Hai hình thức hay nhầm nhất khi điền:

| | Chuyển khoản (QR) | Trả góp (tín dụng) |
|---|---|---|
| Ô nhập số tiền | **Số tiền lần này** | **Tổng tiền trả góp** (không có ô "Số tiền lần này") |
| Trường riêng | Ngân hàng nhận + Tên trên nội dung CK | Nền tảng trả góp (Payoo/Mpos) — bắt buộc |
| Mã QR | Có, tự sinh | Không |
| Nút xác nhận | **Tạo QR & mã CK** | **Ghi nhận lần thanh toán** |
| Tải bill | Không cần (đối soát tự động) | Cần (có phí, kế toán xác nhận NET) |

## Thêm lần TT cho PR đã có nhiều đợt

Áp dụng khi: PR đã có ít nhất 1 lần TT, khách chuyển tiếp đợt sau. Thao tác **giống hệt** phần *Tạo lần thanh toán mới* ở trên — mở lại chi tiết PR, bấm **Tạo lần thanh toán** và chọn phương thức cho đợt này (có thể khác đợt trước).

## Thao tác trên 1 lần TT đã có

Mỗi dòng trong danh sách có các nút thao tác riêng:

- **Huỷ lần TT** — khi ghi nhầm hoặc khách đổi ý trước khi tiền thực sự về.
- **Đánh dấu đã thanh toán** — cho lần TT tiền mặt/chuyển khoản đã xác nhận thủ công ngoài hệ thống.
- **Sửa số tiền** — chỉnh lại số tiền của 1 lần TT nếu ghi sai lúc tạo.
- **Làm mới nội dung CK** — khi nội dung chuyển khoản bị đánh dấu "cũ" (PR đổi tên khách sau khi đã tạo mã QR) — bấm để sinh lại nội dung CK khớp với tên hiện tại.

> ⚠️ Lưu ý: các thao tác này ảnh hưởng trực tiếp đến số đã nhận của PR — chỉ dùng khi chắc chắn đúng lần TT cần sửa, tránh làm lệch số đối soát với kế toán.
```

---

## Phụ lục B — Sửa test/E2E (before → after, chép chính xác)

### B-1 · `frontend/src/content/help/index.test.ts` (dòng 12–20)
**Before:**
```ts
  it("parses frontmatter title/order/audience correctly", () => {
    const topic = getHelpTopic("paymentRequests", "tao-lan-tt-chuan");
    expect(topic).toBeDefined();
    expect(topic?.title).toBe("Tạo lần thanh toán (TT) chuẩn");
    expect(topic?.order).toBe(2);
    expect(topic?.audience).toEqual(["sale"]);
    expect(topic?.body).toContain("## Các bước");
    expect(topic?.body).not.toContain("---");
  });
```
**After:**
```ts
  it("parses frontmatter title/order/audience correctly", () => {
    const topic = getHelpTopic("paymentRequests", "quan-ly-lan-thanh-toan");
    expect(topic).toBeDefined();
    expect(topic?.title).toBe("Cách tạo và quản lý lần TT (mọi trường hợp)");
    expect(topic?.order).toBe(2);
    expect(topic?.audience).toEqual(["sale", "ke-toan"]);
    expect(topic?.body).toContain("## Tạo lần thanh toán mới");
    // KHÔNG dùng toContain("---"): trang mới có bảng markdown (|---|) cũng chứa "---".
    // Chỉ kiểm dòng frontmatter fence "---" đứng riêng đã bị strip khỏi body.
    expect(topic?.body).not.toMatch(/^---$/m);
  });
```
> ⚠️ Sửa so với bản đầu: assertion cũ `not.toContain("---")` xung đột với cú pháp bảng markdown trong Phụ lục A → đổi sang `not.toMatch(/^---$/m)` (chỉ bắt dòng `---` frontmatter thuần).

### B-2 · `frontend/src/components/help/HelpArticle.test.tsx` (dòng 15–27)
**After** (thay 2 lần `renderArticle(...)` + heading + cụm chữ + breadcrumb):
```tsx
  it("renders the pilot topic's title and body content", () => {
    renderArticle("paymentRequests", "quan-ly-lan-thanh-toan");
    expect(screen.getByRole("heading", { name: "Cách tạo và quản lý lần TT (mọi trường hợp)" })).toBeInTheDocument();
    expect(screen.getByText(/cần tạo một lần thanh toán/)).toBeInTheDocument();
  });

  it("renders a breadcrumb with the module label and topic title", () => {
    renderArticle("paymentRequests", "quan-ly-lan-thanh-toan");
    const breadcrumb = screen.getByRole("navigation", { name: "breadcrumb" });
    expect(breadcrumb).toHaveTextContent("Hướng dẫn sử dụng");
    expect(breadcrumb).toHaveTextContent("Quản lý thanh toán");
    expect(breadcrumb).toHaveTextContent("Cách tạo và quản lý lần TT (mọi trường hợp)");
  });
```
> 2 test "friendly message" (unknown topic/module) **giữ nguyên**.

### B-3 · `frontend/src/components/help/HelpModuleIndex.test.tsx` (dòng 14, 23–26)
- Dòng 14: `getByText("Tạo lần thanh toán (TT) chuẩn")` → `getByText("Cách tạo và quản lý lần TT (mọi trường hợp)")`.
- Dòng 23–26:
```tsx
    expect(screen.getByText("Cách tạo và quản lý lần TT (mọi trường hợp)").closest("a")).toHaveAttribute(
      "href",
      "/docs/paymentRequests/quan-ly-lan-thanh-toan"
    );
```

### B-4 · `frontend/e2e/docs-screenshots.spec.ts`
- Dòng 255 (tên test): bỏ `+ tao-lan-tt-chuan` khỏi chuỗi tên → `test("paymentRequests — tong-quan + xem-lich-su-pr + xem-qr-thanh-toan + thieu-anh-bill", ...`.
- **Xoá** đoạn chụp modal Tạo PR (khối dòng ~262–268):
```ts
  // Tạo Payment Request — chỉ mở modal xem giao diện, KHÔNG bấm submit.
  await page.getByRole("button", { name: "Tạo Payment Request" }).click();
  await expect(page.getByText("Tổng tiền dự kiến").first()).toBeVisible();
  await page.waitForTimeout(300);
  await screenshotViewport(page, "public/docs-images/paymentRequests/tao-lan-tt-chuan-1.png");
  await page.getByRole("button", { name: "Huỷ" }).click();
  await page.waitForTimeout(300);
```
> Giữ nguyên phần chụp `tong-quan-1`, `xem-lich-su-pr-1`, `xem-qr-thanh-toan-1`, `thieu-anh-bill` phía sau.

### B-5 · `frontend/src/content/help/paymentRequests/tong-quan.md` (dòng 20)
`(xem bài **Tạo lần thanh toán chuẩn**, mục ghi nhiều tên con)` → `(xem bài **Tạo Payment Request — Hướng dẫn đầy đủ**, mục *PR cho nhiều con*)`.

### B-6 · `frontend/src/components/help/HdsdLink.test.tsx` (dòng 19–25, hygiene)
Đổi `topicSlug="tao-lan-tt-chuan"` → `topicSlug="quan-ly-lan-thanh-toan"` và href `/docs/paymentRequests/quan-ly-lan-thanh-toan`.

---

## Phụ lục C — Lệnh nghiệm thu

```bash
cd frontend && npx vitest run src/content/help src/components/help
```
```bash
cd frontend && npx tsc -b
```
Grep sạch (chạy ở root repo — chỉ được phép còn hit trong `docs/plans/*` lịch sử):
```bash
grep -rn "tao-lan-tt-chuan" frontend/ ; grep -rn "Tạo lần thanh toán (TT) chuẩn\|Tạo lần thanh toán chuẩn" frontend/
```

---

## Đối chiếu 5 tiêu chí

1. **Triệt để:** xoá file + ảnh mồ côi + 2 cross-ref chữ + 5 case test; trang mới bao trọn 4 phương thức + quản lý; không còn 2 bài "tạo PR" trùng.
2. **Không lỗi con:** giữ nguyên tên file ⇒ slug/route/nút `2442`/ảnh không đổi; giữ ảnh có sẵn ⇒ `screenshots.test.ts` xanh; order-2 không đụng ai (gap cũ vô hại); mọi assertion test đã map đúng chuỗi mới.
3. **Không tăng gánh nặng hạ tầng:** 0 file ảnh mới, 0 E2E chụp mới, 0 route/registry mới (auto-glob), thực ra **giảm** 1 bước E2E.
4. **Tối ưu token:** phạm vi gọn (1 rewrite + 1 xoá + 4 test + 1 e2e + 1 cross-ref); giao subagent theo Milestone, mỗi việc 1 lần chạm.
5. **Bền qua context compact:** plan **tự-chứa** — HẰNG SỐ CHỐT 1 nơi + Phụ lục A (nội dung nguyên văn) + Phụ lục B (diff chính xác). Sonnet chỉ cần file plan này, không cần hội thoại gốc.

## Giao subagent thế nào
- Mỗi Milestone = 1 prompt subagent Sonnet **tự-chứa**, mở đầu bằng: *"Đọc `docs/plans/PLAN_DOCS_LAN_TT_2026-08-17.md`, làm đúng Milestone Mx theo HẰNG SỐ CHỐT + Phụ lục, không suy diễn thêm."*
- Thứ tự an toàn: (M1 ∥ M2) → M3 → M4. Dùng agent `cavecrew-builder` cho M1/M3 (surgical), builder thường cho M2 (ghi đè 1 file theo Phụ lục A), agent chạy lệnh cho M4.
