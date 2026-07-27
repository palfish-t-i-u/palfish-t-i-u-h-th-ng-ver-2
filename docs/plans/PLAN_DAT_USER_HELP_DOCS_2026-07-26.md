# KẾ HOẠCH THỰC THI — Đạt · Hệ thống HDSD người dùng

> **SUPERSEDED 2026-07-27** — anh Minh đảo ngược quyết định "làm in-app", xem `HANDOFF_HDSD_DOCS_ROUTE_PIVOT_2026-07-27.md` cho kiến trúc mới (route `/docs/*`, HDSD mở tab mới, phạm vi mở rộng toàn app).

> Kế hoạch cá nhân của Đạt, bám theo [`HANDOFF_DAT_USER_HELP_DOCS_2026-07-26.md`](HANDOFF_DAT_USER_HELP_DOCS_2026-07-26.md) (đã được anh Minh duyệt).
> Phạm vi file này: **chỉ phần việc của Đạt**. Phần khung code là của Đức, không lặp lại ở đây.
> Trạng thái nền: `sandbox` = `39e789b`, chưa có dòng code HDSD nào (`frontend/src/content/`, `components/help/`, `HelpNavContext.tsx` đều **chưa tồn tại**; `react-markdown`/`remark-gfm` **chưa cài**). Tức là cả Đạt lẫn Đức đều đang ở vạch xuất phát.

## Vai trò của Đạt

| Task (theo handoff) | Nội dung | Ngày |
|---|---|---|
| **Task 2** | Viết nội dung pilot (Payment Requests + Sổ doanh thu) | Ngày 1 |
| **Task 4** | Hoàn thiện nội dung + viết bài Báo cáo + nghiệm thu 23/23 điểm chèn | Ngày 3 → deadline |

Đức làm Task 1 (khung) và Task 3 (gắn HdsdLink vào 23 điểm chèn).

---

## ⚠️ Điểm chặn mà handoff chưa xử lý — phải giải quyết TRƯỚC

Handoff giao Đức "Task 3 — gắn HdsdLink vào 13 file, ~23 điểm chèn". Mỗi điểm chèn cần một cặp `(moduleSlug, topicSlug)`:

```tsx
<HdsdLink mode="topic" moduleSlug="???" topicSlug="???" />
```

**Nhưng `topicSlug` đến từ tên file `.md` — mà file `.md` là do Đạt viết.** Nghĩa là:

> **Đức KHÔNG thể bắt đầu Task 3 cho tới khi Đạt chốt xong danh sách slug.**

Handoff mô tả Task 2 và Task 3 như hai việc song song độc lập, nhưng thực tế Task 3 phụ thuộc Task 2. Nếu Đạt cứ thong thả viết nội dung theo nhịp riêng, Đức sẽ kẹt ở Ngày 2 hoặc tự bịa slug → hai bên lệch nhau → 23 điểm chèn trỏ vào bài không tồn tại, phát hiện muộn lúc nghiệm thu.

**→ Việc số 1 của Đạt không phải viết nội dung, mà là chốt và bàn giao BẢN ĐỒ SLUG cho Đức ngay đầu Ngày 1.** Đây là deliverable quan trọng nhất về mặt tiến độ; nội dung thật viết sau cũng được.

Lưu ý thêm: 23 điểm chèn **không cần** 23 bài viết. Nhiều popup có thể trỏ chung 1 bài (vd. 3 popup nhắc việc trong `PaymentRequestDetailDrawer` cùng trỏ `pr-du-tien-va-nhac-viec`). Quan hệ là **nhiều-điểm-chèn → một-bài**, và chính Đạt là người quyết định gom thế nào.

---

## Giai đoạn 0 — Chốt contract với Đức (≤ 60 phút, làm đầu tiên)

Nhắn Đức chốt 4 thứ, viết lại vào group để có dấu vết:

1. **Đường dẫn & quy ước slug**
   - `frontend/src/content/help/<module-slug>/<topic-slug>.md`
   - slug: chữ thường, không dấu, phân tách bằng `-`. Tên file **chính là** `topicSlug`.

2. **Bảng module slug** (Đức cần đúng bảng này cho `MODULE_HELP_SLUGS` trong `MainPage.tsx`)

   | `ViewId` | `moduleSlug` | Tên hiển thị trên sidebar |
   |---|---|---|
   | `paymentRequests` | `quan-ly-thanh-toan` | Quản lý thanh toán |
   | `reconciliation`, `reconCard` | `doi-soat-giao-dich` | Đối soát giao dịch |
   | `module3` | `kich-hoat-khoa-hoc` | Kích hoạt khóa học |
   | `module4` | `xuat-hoa-don` | Xuất hóa đơn |
   | `revenueLedger` | `so-doanh-thu` | Sổ doanh thu |
   | `bc01`, `bc02`, `bc03` | `bao-cao` | Báo cáo |

   ⚠️ `module4` mount component thật là `InvoiceRequestTab.tsx`, **không phải** `Module4Tab.tsx` (legacy đã orphan) — handoff đã cảnh báo, nhắc lại để Đức không gắn nhầm.

3. **Frontmatter — đúng 3 field, không thêm bớt** (parser tự viết của Đức chỉ đọc 3 field này):
   ```md
   ---
   title: "Tạo lần thanh toán (TT) chuẩn"
   order: 2
   audience: ["sale"]
   ---
   ```
   - `title`: string trong nháy kép — hiện ở sidebar + đầu bài.
   - `order`: số nguyên — thứ tự trong module. Đạt đánh số **cách 10** (10, 20, 30…) để chèn bài mới sau này không phải đánh số lại toàn bộ.
   - `audience`: chỉ dùng đúng 4 giá trị — `"sale"`, `"ke-toan"`, `"leader"`, `"admin"`. Chốt cứng để sau này lọc theo vai trò không phải dọn dữ liệu bẩn.

4. **Thứ tự module trên sidebar**: theo đúng thứ tự bảng ở mục 2 (trùng thứ tự nghiệp vụ B1→B4 → sổ → báo cáo). Nếu `content/help/index.ts` sort theo tên thư mục thì Đức cần một mảng thứ tự cứng — nói trước để Đức không sort alphabet (sẽ ra `bao-cao` đứng đầu, sai nghiệp vụ).

**Đầu ra Giai đoạn 0:** bảng slug ở Giai đoạn 1 dưới đây, gửi Đức. Đức unblock Task 3 ngay từ đây.

---

## Giai đoạn 1 — Bản đồ slug + 26 file placeholder (Ngày 1, buổi sáng)

Tạo **toàn bộ 26 file `.md`** với frontmatter đầy đủ + thân bài `> Nội dung đang cập nhật.` — chưa cần nội dung thật.

Lý do làm placeholder trước, đúng chỉ đạo trong handoff ("vẫn nối dây HDSD trước"):
- Đức có ngay cây thư mục thật để test loader + `HelpNavTree`, không phải dựng markdown giả rồi xoá.
- Mọi `topicSlug` Đức gắn ở Task 3 đều resolve được → nghiệm thu không dính lỗi "bài không tồn tại".
- Nếu deadline gấp, sản phẩm bàn giao vẫn **đầy đủ cấu trúc**, chỉ thiếu chữ — degrade an toàn.

### Bản đồ nội dung — 26 bài

#### `quan-ly-thanh-toan/` (9 bài)

| # | File | `title` | `order` | `audience` | Nguồn sự thật (đọc trước khi viết) |
|---|---|---|---|---|---|
| 1 | `tong-quan.md` | Tổng quan luồng thanh toán B1→B4 | 10 | sale, ke-toan | `docs/PROTOTYPE_PAYMENT_FLOW.md` |
| 2 | `tao-lan-thanh-toan.md` | Tạo lần thanh toán (TT) chuẩn | 20 | sale | `CreatePaymentRequestModal.tsx` |
| 3 | `xem-qr-thanh-toan.md` | Xem & gửi mã QR cho khách | 30 | sale | `QrViewModal.tsx` |
| 4 | `tai-anh-bill.md` | Tải ảnh bill & xử lý thiếu bill | 40 | sale | `BillUploadZone.tsx`, popup "Thiếu ảnh bill" |
| 5 | `bao-don-hoan-thanh.md` | Báo đơn hoàn thành & báo đơn bổ sung | 50 | sale | `PaymentRequestDetailDrawer.tsx` (popup báo đơn) |
| 6 | `huy-payment-request.md` | Huỷ Payment Request | 60 | sale | `CancelPrModal.tsx` |
| 7 | `chuyen-giao-pr.md` | Tạo hộ & chuyển giao PR cho sale khác | 70 | sale, leader | `TransferSaleModal.tsx`, `docs/PLAN_TAO_HO_CHUYEN_GIAO_PR_2026-07-23.md` |
| 8 | `lich-su-pr.md` | Xem lịch sử thay đổi của PR | 80 | sale, leader | `PrHistoryModal.tsx`, `OwnershipLogSection.tsx` |
| 9 | `pr-du-tien-va-nhac-viec.md` | PR đủ tiền & các popup nhắc việc | 90 | sale | `PaymentRequestDetailDrawer.tsx` (3 popup nhắc) |

#### `doi-soat-giao-dich/` (4 bài)

| # | File | `title` | `order` | `audience` | Nguồn sự thật |
|---|---|---|---|---|---|
| 10 | `tong-quan.md` | Tổng quan đối soát giao dịch | 10 | ke-toan | `ReconciliationTab.tsx` |
| 11 | `ghep-ck-ngoai.md` | Ghép chuyển khoản ngoài | 20 | ke-toan | `ReconciliationTab.tsx` (modal Ghép CK ngoài) |
| 12 | `so-tien-khong-khop.md` | Xử lý số tiền không khớp | 30 | ke-toan | `ReconciliationTab.tsx` (modal lệch tiền) |
| 13 | `doi-soat-quet-the.md` | Đối soát quẹt thẻ mPOS / Payoo | 40 | ke-toan | `CardReconciliationTab.tsx` |

#### `kich-hoat-khoa-hoc/` (4 bài)

| # | File | `title` | `order` | `audience` | Nguồn sự thật |
|---|---|---|---|---|---|
| 14 | `tong-quan.md` | Tổng quan kích hoạt khóa học (B3) | 10 | sale | `ActivationTab.tsx` |
| 15 | `tao-yeu-cau-kich-hoat.md` | Tạo yêu cầu kích hoạt | 20 | sale | `ActivationTab.tsx` (modal tạo AR) |
| 16 | `them-uid-them-goi.md` | Thêm UID / thêm gói cho bé khác | 30 | sale | `ActivationTab.tsx` (`addUid`, dialog "Thêm UID mới") |
| 17 | `order-id-va-hold.md` | Điền Order ID & tạm hoãn kích hoạt | 40 | sale, admin | `ActivationTab.tsx` (`hold_activation`) |

> Bài 16 chạm đúng gap đã nêu trong [`AUDIT_PR_MULTI_CON_2026-07-07.md`](../AUDIT_PR_MULTI_CON_2026-07-07.md): hiện chỉ nhập được UID, **không có ô tên bé**. Viết đúng hiện trạng, đừng mô tả tính năng chưa có. Nếu MC-01 được làm trước deadline thì cập nhật lại bài này.

#### `xuat-hoa-don/` (2 bài)

| # | File | `title` | `order` | `audience` | Nguồn sự thật |
|---|---|---|---|---|---|
| 18 | `tong-quan.md` | Tổng quan xuất hóa đơn (B4) | 10 | ke-toan | `InvoiceRequestTab.tsx` |
| 19 | `xuat-hoa-don-theo-course-code.md` | Xuất hóa đơn theo Course Code | 20 | ke-toan | `InvoiceRequestTab.tsx` (`InvoiceDetailDrawer`) |

#### `so-doanh-thu/` (3 bài)

| # | File | `title` | `order` | `audience` | Nguồn sự thật |
|---|---|---|---|---|---|
| 20 | `tong-quan.md` | Tổng quan sổ doanh thu | 10 | ke-toan, leader | `SoDoanhThuTab.tsx` |
| 21 | `tao-sua-dong-so.md` | Tạo & sửa dòng sổ doanh thu | 20 | ke-toan | `LedgerFormModal.tsx` |
| 22 | `quy-doi-ty-gia.md` | Quy đổi tỷ giá GMV RMB | 30 | ke-toan | `SoDoanhThuTab.tsx:633` (panel tỷ giá) |

#### `bao-cao/` (4 bài)

| # | File | `title` | `order` | `audience` | Nguồn sự thật |
|---|---|---|---|---|---|
| 23 | `tong-quan.md` | Tổng quan hệ báo cáo BC01–BC03 | 10 | leader, admin | `TITLES` trong `MainPage.tsx:200-202` |
| 24 | `bc01-sales-performance.md` | BC01 — Sales performance | 20 | leader | `reports/` |
| 25 | `bc02-key-data.md` | BC02 — Key Data | 30 | leader | `reports/` |
| 26 | `bc03-bao-cao-tong-bo.md` | BC03 — Báo cáo tổng bộ | 40 | leader, admin | `ReportBC03Tab.tsx` |

### Bảng ánh xạ 23 điểm chèn → bài viết (gửi kèm cho Đức)

Đây là thứ Đức copy thẳng vào code ở Task 3.

| File | Điểm chèn | `moduleSlug` | `topicSlug` |
|---|---|---|---|
| `CreatePaymentRequestModal.tsx:162` | Tạo PR | `quan-ly-thanh-toan` | `tao-lan-thanh-toan` |
| `QrViewModal.tsx:210` | Xem QR | `quan-ly-thanh-toan` | `xem-qr-thanh-toan` |
| `CancelPrModal.tsx:30` | Huỷ PR | `quan-ly-thanh-toan` | `huy-payment-request` |
| `TransferSaleModal.tsx:98` | Chuyển giao | `quan-ly-thanh-toan` | `chuyen-giao-pr` |
| `PrHistoryModal.tsx:23` | Lịch sử PR | `quan-ly-thanh-toan` | `lich-su-pr` |
| `PaymentRequestDetailDrawer.tsx:1816` | Drawer chính | `quan-ly-thanh-toan` | `tong-quan` |
| `…:2722` | Báo đơn / bổ sung | `quan-ly-thanh-toan` | `bao-don-hoan-thanh` |
| `…:3042` | Thiếu ảnh bill | `quan-ly-thanh-toan` | `tai-anh-bill` |
| `…:3085` | Invoice-remind fail | `quan-ly-thanh-toan` | `pr-du-tien-va-nhac-viec` |
| `…:3129` | Nhắc kích hoạt gấp | `quan-ly-thanh-toan` | `pr-du-tien-va-nhac-viec` |
| `…:3172` | Activation-remind fail | `quan-ly-thanh-toan` | `pr-du-tien-va-nhac-viec` |
| `…:3198` | PR đủ tiền | `quan-ly-thanh-toan` | `pr-du-tien-va-nhac-viec` |
| `ReconciliationTab.tsx` ×3 | Ghép CK ngoài / lệch tiền / bill viewer | `doi-soat-giao-dich` | `ghep-ck-ngoai` / `so-tien-khong-khop` / `ghep-ck-ngoai` |
| `CardReconciliationTab.tsx` ×2 | Modal ghép thẻ | `doi-soat-giao-dich` | `doi-soat-quet-the` |
| `ActivationTab.tsx` ×4–5 | Luồng xác nhận kích hoạt | `kich-hoat-khoa-hoc` | `tao-yeu-cau-kich-hoat` / `them-uid-them-goi` / `order-id-va-hold` |
| `InvoiceRequestTab.tsx:95` | `InvoiceDetailDrawer` | `xuat-hoa-don` | `xuat-hoa-don-theo-course-code` |
| `LedgerFormModal.tsx` | Form dòng sổ | `so-doanh-thu` | `tao-sua-dong-so` |
| `SoDoanhThuTab.tsx:633` | Panel tỷ giá | `so-doanh-thu` | `quy-doi-ty-gia` |

Số điểm chèn thực tế đã đếm lại bằng `grep -c 'modal-head\|drawer-head'`: drawer 7, recon 3, card 2, activation 5, invoice 1 — **tổng 18 + 5 modal rời = 23**, khớp con số trong handoff. Khi Đức gắn xong, cùng đối chiếu lại con số này.

---

## Giai đoạn 2 — Viết nội dung pilot (Ngày 1, buổi chiều — đây là Task 2 của handoff)

Anh Minh đưa ví dụ cụ thể: *"Tạo lần TT chuẩn"* và *"Ghép giao dịch"*. Viết đúng 3 bài này trước để anh Minh review sớm định dạng:

1. `quan-ly-thanh-toan/tao-lan-thanh-toan.md`
2. `doi-soat-giao-dich/ghep-ck-ngoai.md`
3. `so-doanh-thu/tao-sua-dong-so.md`

**Gửi anh Minh duyệt 3 bài này TRƯỚC khi viết 23 bài còn lại.** Nếu anh Minh muốn đổi giọng văn / độ dài / cách đánh bước, sửa 3 bài rẻ hơn sửa 26 bài — cùng lý do plan gốc đã bị anh Minh bác một vòng.

### Quy tắc viết (tự áp, để 26 bài đồng nhất)

- **Bám UI thật, không bịa.** Trước mỗi bài, mở đúng file component ở cột "Nguồn sự thật" và chép **nguyên văn** nhãn nút/ô nhập. Sai một chữ trên nút là sale không tìm thấy. Đây là rủi ro lớn nhất của việc viết docs từ trí nhớ.
- **Người đọc là sale/kế toán, không phải dev.** Cấm mọi từ: endpoint, payload, JSONB, migration, state, component. Gọi đúng tên trên màn hình.
- **Mở đầu bằng "Áp dụng khi:"** — một câu, để người đọc biết ngay có đúng bài mình cần không.
- **Thân bài là danh sách bước đánh số**, mỗi bước một hành động. Không viết đoạn văn dài.
- **In đậm** mọi thứ người dùng phải bấm/nhập: `bấm **+ Tạo mới**`.
- **Kết bằng `> ⚠️ Lưu ý:`** cho cạm bẫy hay gặp (lấy từ chính các bug đã fix — xem `docs/learnings/`, mỏ vàng để biết người dùng hay sai chỗ nào).
- **Độ dài mục tiêu 15–40 dòng.** Dài hơn nghĩa là nên tách bài.
- Chỉ dùng markdown cơ bản: heading, list đánh số, **đậm**, `>` blockquote, bảng. `remark-gfm` có hỗ trợ bảng, nhưng **không nhúng ảnh** ở V1 (chưa chốt chỗ để file ảnh — hỏi Đức nếu cần).

### Template chuẩn

```md
---
title: "Tạo lần thanh toán (TT) chuẩn"
order: 20
audience: ["sale"]
---

Áp dụng khi: khách đã chốt gói học, cần tạo Payment Request mới để thu tiền.

## Các bước

1. Vào **Quản lý thanh toán** → bấm **+ Tạo mới**.
2. Điền **UID CRM**, **Tên KH**, **SĐT** đúng theo CRM.
3. Nhập **Tổng số tiền** cần thu — không để trống.
4. Bấm **Lưu** → hệ thống sinh mã QR chuyển khoản.

## Sau khi tạo

- Gửi mã QR cho khách (xem bài **Xem & gửi mã QR cho khách**).
- Khi khách chuyển xong, tải ảnh bill lên PR.

> ⚠️ Lưu ý: không sửa số tiền sau khi khách đã bắt đầu chuyển — tạo lần TT mới thay vì sửa.
```

---

## Giai đoạn 3 — Viết nốt nội dung (Ngày 2, song song Task 3 của Đức)

Sau khi anh Minh duyệt định dạng, lấp 23 bài còn lại. Thứ tự ưu tiên nếu không kịp hết:

1. **`quan-ly-thanh-toan/`** — module đông người dùng nhất, 9/23 điểm chèn.
2. **`doi-soat-giao-dich/`** — kế toán dùng hằng ngày, nghiệp vụ dễ sai nhất.
3. **`kich-hoat-khoa-hoc/`**
4. **`xuat-hoa-don/`** + **`so-doanh-thu/`**
5. **`bao-cao/`** — handoff xếp cuối, ít popup, đọc-hiểu là chính.

Bài nào chưa kịp thì **giữ nguyên placeholder** — không xoá file, vì Đức đã trỏ `topicSlug` vào đó.

---

## Giai đoạn 4 — Nghiệm thu 23/23 (Ngày 3 → deadline — Task 4)

Handoff nâng chuẩn nghiệm thu lên **đủ 23/23 điểm chèn, mỗi điểm 1 screenshot** (không phải vài popup tiêu biểu). Đây là phần việc chung nhưng nên do Đạt chủ trì, vì Đạt có bảng ánh xạ.

### Checklist mỗi điểm chèn

Với từng dòng trong bảng ánh xạ ở Giai đoạn 1:

- [ ] Mở đúng popup/modal/drawer đó trên UI
- [ ] Nút chữ **HDSD** hiện cạnh header, **không phải icon "?"** (anh Minh yêu cầu rõ)
- [ ] Layout không vỡ — đặc biệt không đè lên nút đóng (×)
- [ ] Bấm HDSD → nhảy đúng bài, không phải "không tìm thấy"
- [ ] Chụp 1 screenshot

**Rủi ro cao nhất: `PaymentRequestDetailDrawer.tsx` chiếm 6/23 điểm** — kiểm kỹ nhất file này.

### Kiểm 2 hành vi cốt lõi (dễ làm sai, anh Minh sẽ thử ngay)

- [ ] HDSD ở **header module lớn** → chỉ mở/expand cây sidebar, **KHÔNG đổi màn hình chính**, không mất thao tác dở dang.
- [ ] HDSD ở **submodule/popup** → đổi màn hình chính sang đúng bài.
- [ ] Sidebar: bấm "Hướng dẫn sử dụng" → hiện 6 module; bấm 1 module → expand ra topic; bấm topic → hiện bài.
- [ ] Kiểm cả **mobile** (`MobileNavSheet.tsx`) — dự án vừa qua 2 đợt mobile fix pass, anh Hiếu/anh Minh có thói quen kiểm mobile.

### Kiểm nội dung

- [ ] Mọi bài render đúng: heading, danh sách, bảng, blockquote
- [ ] `order` sắp đúng thứ tự trong sidebar
- [ ] `title` hiện đúng, không lòi dấu nháy `"` (bẫy parser frontmatter tự viết)
- [ ] Slug không tồn tại → thông báo rõ ràng, **không crash trắng trang**

### Cổng kỹ thuật (bắt buộc trước merge)

```bash
cd frontend && npx tsc -b        # KHÔNG dùng --noEmit — Vercel chạy tsc -b, chặt hơn
cd frontend && npm run test
```

> Môi trường: cần Node 20+ (`nvm use 22.15.1`). Node 14 sẽ lỗi `SyntaxError: Unexpected token '??='` khi chạy Vitest.

---

## Đề xuất bổ sung — test chống lệch slug

Handoff liệt kê unit test cho `HelpArticle` / `index.ts` / `HelpNavContext` (đều là phần Đức). Xin thêm **1 test của Đạt**, chống đúng rủi ro lớn nhất của task này:

> Test quét toàn bộ `HdsdLink` trong source, đối chiếu mọi cặp `(moduleSlug, topicSlug)` với danh sách file `.md` thật. Lệch một slug → test đỏ ngay, thay vì phát hiện lúc anh Minh bấm thử.

Rẻ (~30 dòng), và giữ giá trị lâu dài: sau này ai đổi tên file `.md` mà quên sửa điểm chèn sẽ bị chặn ngay ở CI.

---

## Quy trình Git

Đạt chỉ đụng `.md` dưới `frontend/src/content/help/`, Đức đụng `.tsx` — **gần như không thể conflict**. Nhưng vẫn giữ nếp:

```bash
git checkout sandbox && git pull origin sandbox
git checkout feature-dat && git merge sandbox     # đồng bộ trước khi làm
# ... viết nội dung ...
git add frontend/src/content/help/
git commit -m "docs(help): ..."                   # message tiếng Anh
git push origin feature-dat:sandbox
```

- `main` = production, **cấm đụng**.
- `docs/TODO.md` = workspace riêng của anh Minh, **không sửa**.
- Push sớm và nhỏ giọt — Đức cần file `.md` thật để test loader, đừng gom hết cuối ngày mới push.

---

## Việc cần hỏi lại trước khi bắt đầu

1. **Deadline chính xác là ngày nào?** Handoff viết "trước thứ 3 tuần sau", viết ngày Chủ nhật 26/07. Hiểu theo nghĩa hẹp là **thứ 3, 28/07** — nhưng kế hoạch lại chia 3 ngày làm việc (Ngày 1/2/3), không vừa. Cần anh Minh hoặc Đức xác nhận là 28/07 hay 04/08. Chênh lệch này quyết định có cần cắt phạm vi hay không.
2. **Đức đã bắt đầu Task 1 chưa?** Trên `sandbox` hiện chưa có commit code nào cho HDSD (kể cả sau khi 26 bài nội dung đã push — kiểm tra lại lúc 26/07 vẫn chưa thấy `components/help/`, `HelpNavContext.tsx`, `react-markdown`). Nếu deadline là 28/07 thì phải báo anh Minh sớm.

### ✅ Đã chốt: bài viết CẦN screenshot (cập nhật từ Đức, 26/07)

Đảo ngược giả định V1 ("không cần ảnh"). Quy ước ảnh — Đức áp dụng khi dựng loader, Đạt áp dụng khi chèn ảnh vào bài:

- **Vị trí file**: `frontend/public/help/<module-slug>/<topic-slug>/01.png`, `02.png`, … (dùng `public/` có sẵn của Vite — không qua `import.meta.glob`, không cần build step riêng, serve thẳng ở root).
- **Cách nhúng trong markdown**: cú pháp ảnh chuẩn, path tuyệt đối từ root:
  ```md
  ![Bấm + Tạo Payment Request](/help/quan-ly-thanh-toan/tao-lan-thanh-toan/01.png)
  ```
  `react-markdown` render `<img>` mặc định, không cần plugin thêm — chỉ cần đảm bảo component `HelpArticle` không tắt phần tử `img` nếu Đức có cấu hình `allowedElements`/`disallowedElements`.
- **Đặt tên file**: đánh số theo đúng thứ tự bước trong bài (`01.png` = bước 1, `02.png` = bước 2…), không đặt tên theo nội dung (dễ trùng, khó rename khi chèn thêm bước).
- **Không đụng frontmatter/parser**: ảnh không phải field frontmatter, `parseFrontmatter()` của Đức giữ nguyên như bản duyệt, không cần sửa.
- **Việc còn thiếu để chụp ảnh thật**: repo hiện **chưa có `frontend/.env.local`** (biến `VITE_API_BASE_URL`) — không dựng được dev server để đăng nhập và chụp màn hình thật. Cần Đức/anh Minh cung cấp 1 trong 2:
  - Tài khoản test (`E2E_EMAIL`/`E2E_PASSWORD` kiểu file `.env.e2e.example`) + xác nhận trỏ vào backend nào (localhost hay Render sandbox), hoặc
  - Bộ ảnh chụp sẵn để Đạt chèn vào đúng vị trí trong 26 bài.
- Vì ảnh phụ thuộc `HelpArticle` (Task 1 của Đức) để nhìn thấy render đúng, **việc chèn ảnh dời sang sau khi Đức xong khung** — không chặn tiến độ viết chữ hiện tại.

---

## Tóm tắt thứ tự thực thi

| Thứ tự | Việc | Chặn ai |
|---|---|---|
| 1 | Chốt contract slug + gửi bảng ánh xạ cho Đức | **Chặn Task 3 của Đức** — làm ngay |
| 2 | Tạo 26 file placeholder, push sandbox | Chặn Đức test loader |
| 3 | Viết 3 bài pilot → anh Minh duyệt định dạng | Chặn 23 bài còn lại |
| 4 | Viết nốt nội dung theo thứ tự ưu tiên | — ✅ Xong 26/26 (26/07) |
| 5 | Chụp/nhận ảnh minh hoạ theo quy ước `public/help/<module>/<topic>/NN.png`, chèn vào từng bài | Cần dev env hoặc bộ ảnh có sẵn — xem mục "Đã chốt: bài viết CẦN screenshot" |
| 6 | Nghiệm thu 23/23 + screenshot | Chặn merge |
| 7 | `tsc -b` + `npm run test` + cập nhật `MODULES.md` | Chặn merge |
