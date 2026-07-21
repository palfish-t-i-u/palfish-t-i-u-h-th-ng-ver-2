# Plan: "Yêu cầu kích hoạt: Kích hoạt ngay / Chưa kích hoạt" trên modal Báo đơn

**Ngày:** 21/07/2026
**Trạng thái:** CHỜ DUYỆT
**Nguồn yêu cầu:** Meeting notes 20/07 + chốt layout với Minh 21/07 (widget mockup)

---

## 1. Vấn đề

Sale cần báo cho kế toán biết đơn nào **kích hoạt ngay**, đơn nào **PH chưa muốn kích hoạt**. Hiện tại chị Hiền phải dặn tay qua chat "đừng duyệt nha" cho từng đơn — thủ công, dễ sót, không có dấu vết.

Sau khi sale báo đơn hoàn thành, kế toán mặc định kích hoạt trong 30ph–1h. Với đơn PH chưa sẵn sàng, không có tín hiệu nào trên app → kế toán vẫn duyệt → sai.

## 2. Quyết định đã chốt (layout + behavior)

Chốt qua widget mockup 21/07:

1. **1 dòng radio "Yêu cầu kích hoạt"** đặt ở **đầu form card**, ngay TRÊN field Tên bé / SĐT — 1 lần cho cả báo đơn (KHÔNG per-gói):
   - `( ) Kích hoạt ngay` (mặc định) · `( ) Chưa kích hoạt`
2. **Chọn "Chưa kích hoạt" → hiện ô "Ghi chú"** ngay dưới dòng radio (conditional):
   - Không bắt buộc, sale để trống được. Nhãn ghi rõ "— không bắt buộc".
   - Placeholder gợi ý cách ghi: `VD: PH muốn kích hoạt sau Tết / chờ bé nghỉ hè xong`
   - Đổi lại "Kích hoạt ngay" → ẩn ô + xoá nội dung đã gõ.
3. **Tab Chờ kích hoạt:** đơn "Chưa kích hoạt" hiện **băng/badge VÀNG** + hiển thị ghi chú → kế toán biết chưa duyệt.
   - Màu vàng để **phân biệt với viền CAM** của "Nhắc kích hoạt gấp" (`activation_reminders`, đã có sẵn).
4. **Khi PH sẵn sàng:** sale bấm nút **"Nhắc kích hoạt gấp"** (đã có sẵn, LIVE) → tín hiệu cam → kế toán kích hoạt.

> **Phát hiện khi điều tra (sửa giả định đề xuất gốc):** nút "Nhắc kích hoạt gấp" **KHÔNG hề bị tắt** — đang VISIBLE + LIVE trên DingTalk (`PaymentRequestDetailDrawer.tsx:2566`, BE `activation_routes.py:2559`). Nên **phần "bật lại nút nhắc gấp" = 0 việc.** Scope plan này chỉ còn: (A) 2 ô tick + ghi chú, (B) lưu cờ trên AR, (C) băng vàng ở tab.

## 3. Data model (1 migration nhẹ)

Bảng `active_requests` hiện có: `id, pr_id, uids_data(jsonb), status, customer_name, is_test, created_at, updated_at` (`docs/supabase_schema_patch_active_requests.sql`). **Chưa có cột nào** cho readiness.

Thêm **2 cột nullable** vào `active_requests`:

```sql
ALTER TABLE active_requests
  ADD COLUMN IF NOT EXISTS hold_activation boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hold_note text NULL;
NOTIFY pgrst, 'reload schema';
```

- `hold_activation = true` ⇔ "Chưa kích hoạt" (PH chưa muốn). `false` = "Kích hoạt ngay" (mặc định = hành vi cũ).
- `hold_note` = lý do (nullable, chỉ có nghĩa khi `hold_activation=true`).

**Vì sao boolean + text, KHÔNG thêm status value:** cột `status` là vòng đời order/invoice (`pending_order → activated → invoiced`). "Chưa kích hoạt" là tín hiệu **sale→kế toán**, trực giao với vòng đời order → boolean riêng đúng ngữ nghĩa, không phá CHECK status hiện có. 2 cột nullable, không bảng mới (tiêu chí 3).

## 4. Backend

### 4.1 Create AR — `create_standalone_active_request()` (`activation_routes.py:2070`)
- Nhận thêm body: `hold_activation: bool = False`, `hold_note: str | None = None`.
- Truyền xuống `_save_active_request()` (`:1329-1340`) → insert 2 cột mới.
- Guard: nếu `hold_activation=false` → **ép `hold_note=None`** (không lưu note mồ côi).
- `hold_note` strip + cắt max length (vd 500 ký tự) trước khi lưu.

### 4.2 Serialize AR — `_serialize_ar()` (dùng bởi `list_active_requests` `:1687`)
- Trả thêm 2 field: `hold_activation`, `hold_note` → FE tab đọc.

### 4.3 Tin DingTalk báo đơn
- Khi `hold_activation=true`: chèn 1 dòng vào tin báo đơn: `⏸ PH CHƯA MUỐN KÍCH HOẠT` + (nếu có) `Ghi chú: <hold_note>`.
- **Line break dùng `<br>`** (KHÔNG trailing-space — xem `docs/learnings/dingtalk-markdown-line-break-br-tag.md`).
- Escape/normalize `hold_note` (free-text sale) trước khi nhúng markdown.
- → kế toán biết ngay từ tin, không phải mở tab.

### 4.4 Append (báo đơn bổ sung) — `append_active_request_children()` (`:2124`)
- Nhận optional `hold_activation` / `hold_note`; nếu gửi → update cờ trên AR. Không gửi → **giữ nguyên** cờ hiện tại (không reset ngầm).

### 4.5 Nhắc gấp tự gỡ hold ✅ CHỐT
- Khi sale bấm "Nhắc kích hoạt gấp" (`:2422`) cho AR đang `hold_activation=true` → set `hold_activation=false` (PH đã sẵn sàng). Tránh 2 tín hiệu mâu thuẫn (vàng "chưa" + cam "gấp") cùng lúc.

## 5. Frontend

### 5.1 Modal Báo đơn — `PaymentRequestDetailDrawer.tsx`
- **State AR-level** (KHÔNG trong `arDraftRows`): `const [holdActivation, setHoldActivation] = useState(false)` + `const [holdNote, setHoldNote] = useState("")`.
- **Chèn dòng radio** ở đầu form body — sau khi mở modal body (`:2662`), **TRƯỚC `arDraftRows.map`**. (⚠ KHÔNG chèn trong `.map` — đây là control 1-lần cho cả báo đơn, không per-gói.)
  - Radio group + ô Ghi chú conditional (hiện khi `holdActivation`), placeholder như mục 2.
  - `onChange` về "Kích hoạt ngay" → `setHoldNote("")`.
- **Submit** (`:2857`): truyền `{ holdActivation, holdNote }` vào `onCreateActiveRequest` / `onAppendActiveRequest`.
- **Chữ nút submit đổi động theo radio** (`:2876`):
  - "Kích hoạt ngay" → giữ `"Xác nhận báo đơn & kích hoạt"` (báo đơn bổ sung: `"Xác nhận báo đơn bổ sung"`).
  - "Chưa kích hoạt" → `"Xác nhận báo đơn (chưa kích hoạt)"`. Tránh sale hiểu nhầm bấm là kích hoạt luôn.
- Reset state khi mở/đóng modal (mặc định `now`, note rỗng).

### 5.2 Payload — `buildCreateActiveRequestPayload()` (`paymentRequestUtils.ts:371`) + `PaymentFlowContext.tsx:419/443`
- Thêm `hold_activation` + `hold_note` vào `CreateActiveRequestPayload` (type `types/paymentRequest.ts`).
- Handler `handleCreateActiveRequest` / `handleAppendActiveRequest` gửi kèm.

### 5.3 Tab Chờ kích hoạt — `ActivationTab.tsx` + `ActivationRowCards.tsx`
- Đọc `hold_activation` / `hold_note` từ AR (đã serialize).
- **Chỉ hiện khi** `hold_activation && status !== 'activated' && status !== 'invoiced'` (đơn đã kích hoạt/xuất HĐ thì cờ vô nghĩa → ẩn).
- **Desktop:** badge vàng "⏸ Chưa kích hoạt" cạnh cột AR-ID (không đè viền cam nhắc-gấp `:2258` — 2 tín hiệu độc lập). Tooltip/hàng phụ show `hold_note`.
- **Mobile:** thêm vào `badges` prop `ActivationRowCards.tsx:63-67`, style vàng (`amber`), khác `border-l-orange-600` của nhắc gấp.
- Màu: dùng token vàng/amber sẵn có (không hardcode hex mới).

## 6. Guardrails (tiêu chí 2 — không lỗi con)

- **Default an toàn:** thiếu field (client cũ, append không gửi) → BE default `hold_activation=false` = hành vi hiện tại y nguyên. Đơn cũ trong DB → `false` (DEFAULT), không đơn nào bỗng thành "chưa".
- **Note không mồ côi:** `hold_activation=false` ⇒ BE ép `hold_note=NULL`; FE clear khi đổi radio. Note không bao giờ gửi khi đang "Kích hoạt ngay".
- **Không chặn cứng:** badge vàng chỉ **cảnh báo hiển thị** — KHÔNG chặn kế toán kích hoạt (họ tự quyết). Không thêm guard chặn duyệt.
- **Không đụng guard cũ:** allocation (`sum(amount)==received`), bill-complete, seq/race của báo đơn giữ nguyên — plan này chỉ thêm 2 field độc lập.
- **DingTalk `<br>`:** dòng hold trong tin dùng `<br>`, note free-text được normalize (bẫy đã ghi learnings).
- **is_test:** đơn test không enqueue (đã có, không đổi).
- **Ẩn cờ khi đã kích hoạt:** badge tự ẩn khi `status` = activated/invoiced → không rác tab.

## 7. Tests

**BE (`backend/tests/`):**
- Create `hold_activation=true` + note → lưu đúng 2 cột; `_serialize_ar` trả về đủ.
- Create `hold_activation=false` + có note → note bị ép `NULL`.
- Create thiếu field → default `false`, không lỗi.
- Tin DingTalk khi hold → chứa dòng "⏸ ... CHƯA MUỐN KÍCH HOẠT" + note, line break `<br>`.
- Append không gửi cờ → giữ nguyên hold cũ; gửi cờ → update.
- Nhắc gấp cho AR hold → `hold_activation` về `false`.

**FE (Vitest):**
- Chọn "Chưa kích hoạt" → ô Ghi chú hiện; đổi về "Kích hoạt ngay" → ẩn + clear.
- Chữ nút submit đổi đúng theo radio (2 trường hợp) — kể cả chế độ báo đơn bổ sung.
- Submit gửi đúng `{ hold_activation, hold_note }` trong payload.
- Row tab có `hold_activation=true` + chưa activated → render badge vàng + note; `status=activated` → không render.

## 8. Đối chiếu 4 tiêu chí

1. **Triệt để:** thay dặn-tay-qua-chat bằng cờ có dấu vết (DB + tin DingTalk + badge tab); kế toán thấy tín hiệu ở đúng 2 nơi họ nhìn (DingTalk + tab). Tận dụng nút "Nhắc gấp" đã LIVE cho chiều ngược lại → vòng lặp khép kín, 0 việc thừa.
2. **Không lỗi con:** default `false` = hành vi cũ; note không mồ côi; không chặn cứng; giữ toàn bộ guard báo đơn; badge tự ẩn khi đã kích hoạt.
3. **Không tăng hạ tầng:** 2 cột nullable, 0 bảng mới, 0 endpoint mới (chỉ mở rộng payload create/list/append đã có), 0 query nặng thêm.
4. **Tiết kiệm token:** 3 investigator scope hẹp đã chạy xong (không lặp lại); implementation gói gọn ~2 subagent (BE 1 / FE 1), không fan-out.

## 9. Open questions — ✅ ĐÃ CHỐT (21/07)

1. **Nhắc gấp tự gỡ hold?** → **CÓ** (mục 4.5). Bấm "Nhắc kích hoạt gấp" cho AR đang hold → `hold_activation=false`.
2. **Tin DingTalk chèn dòng hold + note?** → **CÓ** (mục 4.3). Kế toán đọc DingTalk là chính.
3. **Chữ nút submit đổi theo lựa chọn?** → **CÓ, đổi động** (mục 5.1). "Chưa kích hoạt" → nút thành `"Xác nhận báo đơn (chưa kích hoạt)"`.
4. **Append cũng có 2 ô tick?** → **CÓ** (mục 4.4). Để trống = giữ nguyên cờ hiện tại.

→ Không còn câu hỏi mở. Plan sẵn sàng giao code sau khi Minh duyệt.

## 10. Rollout

- Code trên `sandbox` → migration sandbox (`ALTER TABLE ... ADD COLUMN`) → smoke: (a) kích hoạt ngay = luồng cũ; (b) chưa kích hoạt + note → tin DingTalk + badge vàng; (c) note trống; (d) nhắc gấp gỡ hold.
- Merge `main` → migration prod → verify tin thật bằng test account (không spam nhóm kế toán).
- Handoff: BE Đạt / FE Đức nếu chia việc (hỏi Minh MD hay HTML trước khi viết handoff).

## Phụ lục — code map (đã điều tra 21/07)

| Việc | File:line |
|---|---|
| Modal container / body / submit | `PaymentRequestDetailDrawer.tsx:2642 / 2662 / 2857` |
| Chèn dòng radio (trên `.map`) | `PaymentRequestDetailDrawer.tsx` sau `:2662`, trước `arDraftRows.map` |
| State `arDraftRows` | `PaymentRequestDetailDrawer.tsx:1622`; type `types/paymentRequest.ts:271` |
| Handler create / append | `PaymentFlowContext.tsx:419 / 443` |
| Payload builder | `paymentRequestUtils.ts:371` |
| BE create AR | `activation_routes.py:2070` → `_save_active_request` `:1329` |
| BE list / serialize | `activation_routes.py:1687` (`_serialize_ar`) |
| BE append | `activation_routes.py:2124` |
| BE nhắc gấp (LIVE) | `activation_routes.py:2422`; nút FE `PaymentRequestDetailDrawer.tsx:2566` |
| Tab: banner/viền cam nhắc gấp | `ActivationTab.tsx:2087, 2258`, `reminderByPrId :1963`; mobile `ActivationRowCards.tsx:58` |
| Schema AR | `docs/supabase_schema_patch_active_requests.sql` |
