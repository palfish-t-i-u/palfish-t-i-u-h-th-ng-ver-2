# KẾ HOẠCH — Đạt · Xử lý dứt điểm 3 phản hồi chất lượng HDSD (27/07/2026)

> Bám theo [`HDSD_CHECKLIST_CON_LAI_2026-07-27.md`](HDSD_CHECKLIST_CON_LAI_2026-07-27.md) (phạm vi) và [`HDSD_HUONG_DAN_VIET_BAI.md`](../HDSD_HUONG_DAN_VIET_BAI.md) (quy ước hiện hành).
> Kiến trúc nền: [`HANDOFF_HDSD_DOCS_ROUTE_PIVOT_2026-07-27.md`](HANDOFF_HDSD_DOCS_ROUTE_PIVOT_2026-07-27.md) — route `/docs/*`, HDSD mở tab mới.

## 1. Phản hồi nhận được & chẩn đoán

| # | Phản hồi | Chẩn đoán sau khi điều tra | Sửa ở đâu |
|---|---|---|---|
| 1 | Bài viết **thiếu ảnh** | Đúng — 21/30 bài nằm trong `NO_SCREENSHOT_YET`. 3 module của Đạt chưa có bài nào | Nội dung + hạ tầng chụp |
| 2 | Viết **thiếu chi tiết** | Đúng một phần — khung bài hiện tại thiếu hẳn các mục có giá trị cao: điều kiện tiên quyết, ý nghĩa từng chỉ số, lỗi thường gặp | Chuẩn viết bài |
| 3 | **Format xấu, không chuyên nghiệp** | **Phần lớn KHÔNG phải lỗi người viết — là lỗi CSS thiếu** (đo được, xem dưới) | Code `HelpArticle.tsx` |

### 1.1. Bằng chứng cứng cho phản hồi #3 (đo trực tiếp trên sandbox)

`HelpArticle.tsx` khai báo style cho `h2/h3/ul/ol/blockquote/a/code` nhưng **không có dòng nào cho `img`, `table`, `hr`**. Hệ quả đo được trên `/docs`:

**Ảnh minh họa** (`/docs/bc01/tong-quan`):
```
border:       0px      → không viền, ảnh dính liền nền trang
borderRadius: 0px      → góc vuông sắc, trông thô
boxShadow:    none     → phẳng lì, không tách khỏi nền
```

**Bảng** (`/docs/paymentRequests/tong-quan` — đang dùng bảng markdown thật):
```
th/td padding: 1px          → chữ dồn dính nhau, gần như không đọc được
th/td border:  0px          → không có đường kẻ phân tách dòng/cột
th background: transparent  → hàng tiêu đề không phân biệt được với thân bảng
```

`remark-gfm` đã bật nên bảng **parse đúng** nhưng **render như text dính** — 2 bài đang mắc lỗi này (`paymentRequests/tong-quan`, `reconciliation/tong-quan`).

> **Kết luận quan trọng:** dù Đạt viết nội dung hay đến đâu, chừng nào CSS chưa sửa thì bài vẫn "trông xấu". Đây là việc **phải làm trước**, và sửa 1 lần thì **cả 30 bài hiện có + 16 bài Đức sắp viết đều đẹp lên** — đòn bẩy cao nhất trong toàn bộ kế hoạch.

## 2. Phạm vi chính xác của Đạt

Đã đối chiếu code thật (`grep -rn "<HdsdLink" frontend/src` → 36 điểm chèn hiện có):

**Thuộc Đạt — chưa ai đụng:**

| Module | Bài cần viết | Điểm chèn `HdsdLink` |
|---|---|---|
| `dashboard` | 1 | Header tự động (`AppShell.tsx:311` truyền `helpModuleSlug={activeView}`) — **không cần chèn tay** |
| `module5` | 2 | 2 điểm chèn tay |
| `module6` | 1 | 1 điểm chèn tay |

**KHÔNG còn thuộc Đạt** (handoff pivot mục "Chia việc" có giao, nhưng Đức đã làm xong ở commit `49591c8` — đã verify): `PaymentRequestsTab.tsx` (3 điểm), `SoDoanhThuTab.tsx` (2 điểm), `LedgerFormModal.tsx` (1 điểm). **Không đụng lại.**

## 3. Giai đoạn 0 — Sửa nền tảng hiển thị (làm TRƯỚC, ~30 phút)

Mục tiêu: `/docs` trông như tài liệu sản phẩm, không phải markdown thô.

### 3.1. Bổ sung style vào `HelpArticle.tsx`

Thêm vào mảng className của khối `<div>` bọc `<ReactMarkdown>`:

```
// Ảnh minh họa — viền + bo góc + đổ bóng nhẹ để tách khỏi nền trang
"[&_img]:rounded-gmv-md [&_img]:border [&_img]:border-gmv-border [&_img]:shadow-gmv-1",
"[&_img]:my-3 [&_img]:w-full",

// Bảng — GFM đã parse đúng, chỉ thiếu style
"[&_table]:w-full [&_table]:border-collapse [&_table]:text-sm [&_table]:my-3",
"[&_thead]:bg-gmv-bg",
"[&_th]:border [&_th]:border-gmv-border [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold",
"[&_td]:border [&_td]:border-gmv-border [&_td]:px-3 [&_td]:py-2 [&_td]:align-top",

// Đường phân cách + đoạn văn
"[&_hr]:my-5 [&_hr]:border-gmv-border",
"[&_p]:leading-relaxed",
```

**Ràng buộc:** chỉ dùng design token có sẵn (`gmv-border`, `gmv-bg`, `rounded-gmv-md`, `shadow-gmv-1`) — không hard-code màu, để đồng bộ với app chính (xem `docs/DESIGN.md`).

### 3.2. Nghiệm thu giai đoạn 0

Sau khi sửa, đo lại đúng 2 trang đã đo ở mục 1.1, phải thấy:
- `/docs/bc01/tong-quan`: ảnh có `border-width ≠ 0`, `border-radius ≠ 0`
- `/docs/paymentRequests/tong-quan`: `th/td padding ≥ 8px`, `border ≠ 0`, `thead` có nền

Kèm 1 ảnh chụp trước/sau để đưa anh Minh — chứng minh phản hồi #3 đã được xử lý tận gốc chứ không phải "viết lại cho đẹp hơn".

> ⚠️ Rủi ro phối hợp: `HelpArticle.tsx` là file dùng chung. Đức đang viết `.md` + chèn `HdsdLink` vào component của 9 module khác — **không đụng file này**, nên rủi ro conflict thấp. Vẫn nên nhắn Đức 1 câu trước khi push để anh ấy biết mà pull.

## 4. Giai đoạn 1 — Nâng chuẩn viết bài (~20 phút)

### 4.1. Mâu thuẫn cần giải quyết trước

`HDSD_HUONG_DAN_VIET_BAI.md` mục 3 đang ghi: *"Ngắn — hầu hết bài hiện có 15-30 dòng... Không viết dài dòng"*. Nhưng phản hồi là **thiếu chi tiết**. Hai điều này mâu thuẫn nếu hiểu "chi tiết = viết dài".

**Cách giải quyết:** giữ nguyên nguyên tắc "không văn vẻ lan man", nhưng **bổ sung các mục có thông tin thật** mà khung hiện tại đang thiếu. Chi tiết ở đây nghĩa là *nhiều thông tin hữu ích hơn*, không phải *nhiều chữ hơn*.

### 4.2. Khung bài mới — phân biệt 2 loại module

Khung hiện tại áp 1 kiểu cho mọi bài. Nhưng 3 module của Đạt cho thấy rõ có **2 loại bài khác hẳn nhau**:

**Loại A — Module thao tác** (`module5`): người dùng cần *làm* gì đó.

```markdown
Áp dụng khi: ...

![Ảnh toàn màn hình](...)

## Trước khi bắt đầu        ← MỚI: điều kiện tiên quyết, quyền cần có
## Các bước                  ← có ảnh xen ở bước quan trọng
## Kết quả mong đợi          ← MỚI: thành công trông như thế nào
## Lỗi thường gặp            ← MỚI: bảng Triệu chứng → Nguyên nhân → Xử lý
> ⚠️ Lưu ý
```

**Loại B — Module đọc số** (`dashboard`, `module6`): người dùng cần *hiểu* con số.

```markdown
Áp dụng khi: ...

![Ảnh toàn màn hình](...)

## Các khu vực trên màn hình   ← MỚI: giải thích từng vùng
## Ý nghĩa các chỉ số          ← MỚI: bảng Chỉ số | Ý nghĩa | Nguồn dữ liệu
## Bộ lọc & cách dùng
> ⚠️ Lưu ý: bẫy hiểu nhầm số liệu
```

Loại B chính là chỗ khung cũ hụt nặng nhất: `module6` có **16 thẻ KPI**, mỗi thẻ ghi rõ nguồn (`Nguồn: CRM` / `Nguồn: Sổ doanh thu (ngay_tien_ve)`) — không giải thích thì người dùng không thể biết vì sao 2 con số "doanh thu" lại lệch nhau.

### 4.3. Cập nhật lại `HDSD_HUONG_DAN_VIET_BAI.md`

Vì Đức cũng dùng file này cho 16 bài của anh ấy, phải cập nhật để 2 người viết ra sản phẩm đồng nhất — nếu không, sửa mình Đạt thì docs vẫn không đều tay. Sửa mục 3 (giọng văn) + mục 2 (khung bài) theo 4.2.

## 5. Giai đoạn 2 — Hạ tầng chụp ảnh tái tạo được (~45 phút)

### 5.1. Vì sao không chụp tay

Chụp tay có 3 vấn đề cho sản phẩm production: (1) UI đổi là ảnh lỗi thời, không ai biết; (2) mỗi người chụp 1 kiểu — khác kích thước, khác vùng cắt; (3) không tái tạo được.

**Dự án đã có sẵn Playwright + `playwright.sandbox.config.ts` trỏ thẳng sandbox** (`baseURL: https://palfish-gmv-manager-sandbox.vercel.app`, không spawn dev server). Tận dụng để script hoá.

### 5.2. Việc cần làm

1. Tạo `frontend/.env.e2e` với `E2E_EMAIL=test.admin@dev` / `E2E_PASSWORD=123456`.
   **Đã verify: `frontend/.env.e2e` nằm trong `.gitignore` (dòng 32)** → không lộ credential vào git.
2. Viết `frontend/e2e/docs-screenshots.spec.ts` — không phải test, mà là **script sinh ảnh**:
   - Đăng nhập (tái dùng `auth.setup.ts`)
   - Với mỗi màn hình cần chụp: `page.goto()` → chờ data load xong → `locator.screenshot({ path: "public/docs-images/<module>/<topic>-N.png" })`
   - Chụp **theo `locator` của đúng khối UI**, không chụp full-page → ảnh gọn, không dính banner sandbox, không dính sidebar thừa
   - Viewport cố định `1280×800` cho mọi ảnh → bộ ảnh đồng nhất
3. Chạy lại script này bất cứ lúc nào UI đổi → ảnh tự cập nhật.

### 5.3. Vấn đề dữ liệu — phải xử lý trước khi chụp

Ảnh docs mà bảng trống thì vô giá trị. Kiểm tra trước từng màn hình:

| Màn hình | Rủi ro | Xử lý |
|---|---|---|
| `dashboard` | BXH có thể trống nếu chưa có doanh thu tháng | Sandbox hiện có 2 sale có số → chụp được |
| `module5` | Cần `hasToken = true` mới hiện khối "Phát hiện ngày thiếu" | Nếu token sandbox hết hạn → khối bị ẩn, không chụp được. **Kiểm tra đầu tiên** |
| `module6` | Cần có dữ liệu CRM daily trong kỳ | Chọn kỳ có data, hoặc chụp kèm trạng thái rỗng có giải thích |

Nếu `module5` không có token → không chụp được màn hình thật. Phương án dự phòng: chụp đúng trạng thái "Chưa có token CRM" và viết bài theo hướng xử lý tình huống đó (vẫn là nội dung thật, hữu ích), rồi bổ sung ảnh trạng thái đủ token sau.

## 6. Giai đoạn 3 — Viết 4 bài (~2.5 giờ)

Nội dung dưới đây rút từ **code thật đã đọc**, không phải suy đoán.

### 6.1. `module5/tong-quan.md` — Đồng bộ CRM (Loại A)

- **Áp dụng khi:** cần kéo dữ liệu CRM PalFish về hệ thống để dashboard/báo cáo có số.
- **Trước khi bắt đầu:** phải cài extension trình duyệt; phải mở trang CRM 1 lần để extension lấy token.
- **Các bước:** mở CRM → quay lại tab **Đồng bộ CRM** → kiểm tra khối **Trạng thái kết nối CRM** (badge xanh *"Token CRM đang hoạt động"* kèm giờ cập nhật cuối) → chọn **Ngày cần đồng bộ** (nút nhanh **Hôm qua** / **Hôm nay**) → bấm **LẤY DỮ LIỆU**.
- **Kết quả mong đợi:** thanh tiến trình "Đang cào dữ liệu từng ngày", xong thì có toast báo.
- **Lỗi thường gặp** (bảng):

| Triệu chứng | Nguyên nhân | Xử lý |
|---|---|---|
| Badge đỏ *"Chưa có token CRM"* | Extension chưa cài, hoặc chưa mở trang CRM lần nào | Cài extension → mở CRM → bấm **Làm mới** |
| Nút **LẤY DỮ LIỆU** bị mờ | Chưa có token | Như trên |
| Vừa sync xong nhưng số chưa lên | Cần ~5 phút để dữ liệu vào DB | Đợi rồi bấm **Làm mới** |

- **Ảnh:** `module5/tong-quan-1.png` (toàn màn hình), `-2.png` (khối Trạng thái kết nối, cận cảnh).
- **Điểm chèn:** `Module5Tab.tsx` — cạnh khối "Trạng thái kết nối CRM" (~dòng 216).

### 6.2. `module5/phat-hien-ngay-thieu.md` — (Loại A)

- **Áp dụng khi:** nghi ngờ báo cáo thiếu số của vài ngày, muốn tìm và bù 1 lượt.
- **Cơ chế (giá trị cốt lõi của bài này):** hệ thống soi **60 ngày gần nhất** trong DB, chỉ sync **những ngày chưa có dữ liệu** — không sync lại ngày đã có, nên bấm nhiều lần không gây trùng.
- **Các bước:** bấm **Kiểm tra ngay** (hoặc **Làm mới**) → đọc kết quả → nếu thiếu, bấm **SYNC N NGÀY THIẾU**.
- **3 trạng thái kết quả** (bảng): *Đầy đủ data* (xanh) / *Thiếu N ngày* (vàng, kèm danh sách ngày cụ thể) / *Lỗi* (đỏ, có nút **Thử lại**).
- **Ảnh:** `-1.png` khối phát hiện, `-2.png` trạng thái thiếu ngày + danh sách chip ngày.
- **Điểm chèn:** `Module5Tab.tsx` — cạnh tiêu đề *"Phát hiện ngày thiếu — tự động sync 1 lúc"* (~dòng 233).

### 6.3. `module6/tong-quan.md` — Dashboard Sale (Loại B)

Đây là bài **nhiều giá trị nhất** và cũng là chỗ khung cũ hụt nặng nhất.

- **Các khu vực:** dải KPI (8 thẻ chính + 8 thẻ phụ) → biểu đồ GMV/thực thu theo ngày → tỷ lệ chuyển đổi → Top Sale → chi tiết theo Sale.
- **Bảng ý nghĩa chỉ số** — bắt buộc, vì mỗi thẻ có nguồn khác nhau:

| Chỉ số | Ý nghĩa | Nguồn |
|---|---|---|
| Tổng số L1 / L3 / L4 | Lead theo từng giai đoạn phễu | CRM |
| Tổng số L8 | Đơn đã thu tiền | Sổ doanh thu |
| GMV CRM | GMV ghi nhận trên CRM (RMB) | CRM |
| Doanh thu thực thu | Tiền thật đã về | Sổ doanh thu (`ngay_tien_ve`) |
| Doanh thu tạo mã QR | Giá trị QR đã tạo (chưa chắc thu được) | Quản lý thanh toán (`created_at`) |
| AOV | Giá trị trung bình / đơn | Sổ doanh thu |
| C1/C2/C4/C5 | Thời lượng gọi, số cuộc, tỷ lệ kết nối, gọi > 3 phút | CRM |
| L1.0/L1.1/L1.2 | Kho chung / Lead phân / Giới thiệu | CRM |

- **Bộ lọc:** tab nhanh **Hôm nay / Tuần này / Tháng này / Tháng trước / Tùy chọn** + lọc **Tất cả team** / **Tất cả sale**.
- **⚠️ Lưu ý (bẫy hiểu nhầm thật, lấy từ code):** *"Doanh thu tạo mã QR"* tính theo ngày **tạo QR**, còn *"Doanh thu thực thu"* tính theo ngày **tiền về** — 2 số này lệch nhau là bình thường, không phải lỗi. Kiến trúc Hybrid: KPI & Top Sale lấy **PalFish live**, biểu đồ lấy **DB daily** — nên nếu chưa sync đủ ngày, biểu đồ có thể trống trong khi KPI vẫn có số.
- **Ảnh:** `-1.png` toàn màn hình, `-2.png` cận cảnh dải KPI, `-3.png` khu biểu đồ.
- **Điểm chèn:** `Module6Tab.tsx` — cạnh `<h2>` *"Sale Leader / System"* (dòng 231) hoặc thanh filter (~dòng 229-274).

### 6.4. `dashboard/tong-quan.md` — Bảng thông tin (Loại B)

- **Các khu vực:** *Vinh danh hôm nay* → *Bảng xếp hạng tháng* (Hạng/Nhân viên/Team/Subteam/Doanh thu/Đơn biến động) → thẻ *Vị trí của bạn* → *Bảng nhiệm vụ & thưởng tuần* → *Bảng sự kiện nội bộ*.
- **⚠️ Lưu ý:** đây là màn hình **chỉ đọc** — số liệu đến từ Sổ doanh thu, muốn sửa phải sửa ở nguồn.
- **Ảnh:** `-1.png` toàn màn hình, `-2.png` cận cảnh bảng xếp hạng.
- **Điểm chèn:** không cần — `AppShell.tsx:311` đã tự render HDSD ở header cho mọi `activeView`.

## 7. Giai đoạn 4 — Nghiệm thu (~30 phút)

```bash
cd frontend
npx tsc -b                                           # phải sạch
npx vitest run src/content/help/screenshots.test.ts  # 4 bài mới phải PASS (có ảnh thật)
npm run test                                         # toàn bộ vẫn xanh (hiện 635)
```

Checklist thủ công:
- [ ] Xoá đúng slug khỏi `NO_SCREENSHOT_YET` cho bài đã có ảnh — **tuyệt đối không xoá khống** (test sẽ đỏ, và đó là cố ý)
- [ ] Mở `/docs/module5/tong-quan`, `/docs/module5/phat-hien-ngay-thieu`, `/docs/module6/tong-quan`, `/docs/dashboard/tong-quan` — ảnh hiện, bảng có kẻ, không vỡ layout
- [ ] Bấm HDSD ở 3 điểm chèn mới → mở tab mới, đúng URL, tab gốc giữ nguyên
- [ ] Kiểm mobile (375px) — bảng không tràn ngang
- [ ] Cập nhật `MODULES.md` §12 số bài/module

## 8. Thứ tự thực thi & ước tính

| # | Việc | Thời gian | Chặn ai |
|---|---|---|---|
| 1 | **Giai đoạn 0** — sửa CSS `HelpArticle.tsx` | 30' | Chặn mọi việc còn lại (bài viết trông xấu nếu chưa sửa) |
| 2 | Giai đoạn 1 — cập nhật chuẩn viết bài | 20' | Chặn việc viết; ảnh hưởng cả Đức |
| 3 | Giai đoạn 2 — script chụp ảnh + kiểm tra data sandbox | 45' | Chặn việc chụp |
| 4 | Giai đoạn 3 — viết 4 bài + chụp ảnh + chèn 3 `HdsdLink` | 2.5h | — |
| 5 | Giai đoạn 4 — nghiệm thu | 30' | Chặn push |

**Tổng ~4.5 giờ.**

Nếu thiếu thời gian, cắt theo thứ tự ưu tiên ngược: giai đoạn 2 có thể hạ xuống chụp tay (mất tính tái tạo, nhưng vẫn có ảnh) — **không được cắt giai đoạn 0**, vì đó là gốc của phản hồi #3.

## 9. Rủi ro đã lường

| Rủi ro | Khả năng | Xử lý |
|---|---|---|
| Token CRM sandbox hết hạn → không chụp được `module5` đủ trạng thái | Trung bình | Chụp trạng thái "chưa có token" + viết phần xử lý; bổ sung ảnh sau |
| Conflict với Đức ở `HelpArticle.tsx` | Thấp (Đức không đụng file này) | Nhắn trước khi push, pull trước khi commit |
| Sửa CSS làm vỡ layout bài cũ | Thấp | Sau khi sửa, mở lại vài bài cũ có bảng/ảnh để đối chiếu |
| Bảng markdown tràn ngang trên mobile | Trung bình | Bọc `overflow-x-auto`, kiểm ở 375px |

## 10. Ngoài phạm vi (nêu để anh Minh biết, không tự làm)

- **21 bài cũ vẫn nằm trong `NO_SCREENSHOT_YET`** — sau giai đoạn 0, script chụp ở giai đoạn 2 tái dùng được để dọn dần. Phần lớn thuộc module Đức viết, nên cần thống nhất ai làm.
- 2 điểm còn treo từ trước (`module3/bao-don-kich-hoat`, `reconciliation/so-tien-khong-khop`) — cần dữ liệu nghiệp vụ đặc thù, không thuộc phần Đạt.
