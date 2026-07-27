# Hướng dẫn viết 1 bài HDSD hoàn chỉnh

> Dùng khi viết bài mới cho `frontend/src/content/help/`. Đọc kèm `docs/plans/HDSD_CHECKLIST_CON_LAI_2026-07-27.md` để biết bài nào cần viết, ai phụ trách.

## 1. File nằm ở đâu, tên gì

`frontend/src/content/help/<moduleSlug>/<topicSlug>.md`

- `moduleSlug` = đúng `ViewId` trong `frontend/src/pages/MainPage.tsx` (vd `gatewaySync`, `zaloConfig`, `module5`...) — **không tự đặt tên khác**, sai slug thì bài không hiện ra ở đâu cả.
- `topicSlug` = kebab-case tiếng Việt không dấu, ngắn gọn, mô tả đúng thao tác (vd `tao-tai-khoan`, `kiem-tra-ket-noi`). Slug `tong-quan` dành riêng cho bài tổng quan của module đó (order: 0).

## 2. Khung 1 bài — chọn đúng loại trước khi viết

Có 2 loại bài rõ rệt trong hệ thống này. Chọn sai loại là nguyên nhân phổ biến nhất khiến bài "thiếu chi tiết" dù đã đủ 3 phần cũ.

### Loại A — Module thao tác (người dùng cần LÀM gì đó)

Ví dụ: tạo PR, đồng bộ CRM, ghép giao dịch. Copy khung này rồi sửa:

```markdown
---
title: "Tên bài hiển thị trên sidebar/breadcrumb"
order: 1
audience: ["sale"]
---

Áp dụng khi: 1 câu mô tả đúng lúc nào người dùng cần đọc bài này.

![Alt text mô tả ảnh — nói rõ đây là màn hình/popup gì](/docs-images/<moduleSlug>/<topicSlug>-1.png)

## Trước khi bắt đầu (bỏ mục này nếu không có điều kiện tiên quyết nào)

- Quyền cần có, dữ liệu cần chuẩn bị trước, hoặc trạng thái hệ thống cần đạt được trước khi thao tác được.

## Các bước

1. Bước 1 — **tên nút/field** in đậm đúng như trên UI thật.
2. Bước 2 — ...
3. Bước 3 — ...

## Kết quả mong đợi (bỏ mục này nếu hiển nhiên)

- Thao tác thành công thì trông như thế nào — badge đổi màu, toast báo, số liệu cập nhật ở đâu.

## Lỗi thường gặp (bỏ mục này nếu chưa gặp lỗi thật nào)

| Triệu chứng | Nguyên nhân | Xử lý |
|---|---|---|
| ... | ... | ... |

> ⚠️ Lưu ý: 1 cảnh báo/ràng buộc thật quan trọng — điều kiện chặn, giới hạn quyền. Không thêm câu này nếu không có gì đáng cảnh báo.
```

### Loại B — Module đọc số (người dùng cần HIỂU con số)

Ví dụ: Bảng thông tin, Dashboard Sale, các báo cáo BC01-03. Đặc điểm: nhiều chỉ số/thẻ KPI, mỗi cái lấy từ nguồn khác nhau — người đọc không tự suy ra được, phải nói thẳng.

```markdown
---
title: "Tên bài hiển thị trên sidebar/breadcrumb"
order: 0
audience: ["sale", "leader"]
---

Áp dụng khi: 1 câu mô tả đúng lúc nào người dùng cần đọc bài này.

![Ảnh toàn màn hình](/docs-images/<moduleSlug>/tong-quan-1.png)

## Các khu vực trên màn hình

- Liệt kê từng vùng theo đúng thứ tự xuất hiện trên UI, 1 câu/vùng.

## Ý nghĩa các chỉ số (mục quan trọng nhất của loại bài này — đừng bỏ qua)

| Chỉ số | Ý nghĩa | Nguồn dữ liệu |
|---|---|---|
| ... | ... | ... |

## Bộ lọc & cách dùng (bỏ nếu không có bộ lọc)

- ...

> ⚠️ Lưu ý: bẫy hiểu nhầm số liệu thật — 2 chỉ số trông giống nhau nhưng khác nguồn/khác thời điểm tính, dễ tưởng là lỗi.
```

**Vì sao tách 2 loại:** khung "Các bước" 3-phần cũ đúng cho thao tác nhưng vô nghĩa cho 1 màn hình toàn số liệu — ép bài đọc-số vào khung thao tác là lý do chính khiến bài "thiếu chi tiết" trong khi vẫn đủ 3 mục. Ưu tiên viết đủ bảng "Ý nghĩa các chỉ số"/"Lỗi thường gặp" hơn là thêm câu chữ mô tả chung chung — **chi tiết nghĩa là nhiều THÔNG TIN THẬT hơn, không phải nhiều CHỮ hơn** (xem mục 3, độ dài vẫn phải ngắn).

**Frontmatter — chỉ 3 field, đừng thêm field khác (loader không đọc):**
- `title` — hiện ở sidebar + breadcrumb, ngắn gọn, không lặp lại tên module nếu đã rõ ràng từ context.
- `order` — số nguyên, quyết định thứ tự trong sidebar. Bài tổng quan (`tong-quan.md`) luôn `order: 0`. Các bài khác đánh số tăng dần theo luồng thao tác tự nhiên (không cần liên tục, để hở số để chèn sau).
- `audience` — mảng vai trò liên quan (`"sale"`, `"ke-toan"`, `"admin"`, `"hr"`...). Hiện KHÔNG dùng để gate quyền — chỉ mang tính tham khảo, ghi đúng để sau này dùng được.

## 3. Giọng văn — bám sát bài đã có, đừng bịa phong cách mới

- Câu đầu tiên **luôn** bắt đầu bằng "Áp dụng khi:" — 1 câu, không xuống dòng.
- "Các bước" đánh số, **in đậm đúng tên nút/field/label thật trên UI** — không diễn giải qua loa ("bấm nút xác nhận" ❌ → "bấm **Xác nhận báo đơn bổ sung**" ✅). Tên nút phải copy chính xác từ code (grep trong file component), không đoán.
- **Ngắn KHÔNG có nghĩa là thiếu.** Câu văn phải ngắn gọn, không lan man/"Giới thiệu chung" — nhưng các mục có thông tin thật (bảng lỗi thường gặp, bảng ý nghĩa chỉ số) thì viết đủ, không cắt bớt để "cho ngắn". Một bài đủ mục (xem khung ở mục 2) dài hơn 30 dòng vẫn đúng chuẩn nếu mỗi dòng đều có thông tin — khác với 1 bài 30 dòng nhưng thiếu hẳn mục "Ý nghĩa chỉ số"/"Lỗi thường gặp".
- Bảng markdown giờ render có viền/nền tiêu đề (đã sửa CSS `HelpArticle.tsx` 27/07) — **dùng bảng thoải mái** cho mọi dữ liệu dạng Chỉ số/Nguyên nhân/Xử lý, đừng viết thành đoạn văn dài dòng thay cho bảng.
- Cảnh báo `> ⚠️` chỉ dùng khi có ràng buộc/rủi ro THẬT (giới hạn quyền, điều kiện chặn, lỗi hay gặp, hoặc bẫy hiểu nhầm số liệu) — không phải mục bắt buộc, bỏ hẳn nếu không có gì đáng nói.
- Không copy-paste mô tả tính năng từ `docs/`/`MODULES.md`/CLAUDE.md nội bộ — bài HDSD viết cho người DÙNG cuối, không phải cho dev.

## 4. Ảnh minh họa — bắt buộc, đây là bước hay bị quên nhất

1. Đăng nhập app thật (sandbox hoặc dev), thao tác tới đúng màn hình/popup bài đang viết.
2. Chụp ảnh (Cmd/Win+Shift+S, hoặc DevTools screenshot) — chụp vùng liên quan, không cần full trang nếu popup nhỏ.
3. Lưu vào `frontend/public/docs-images/<moduleSlug>/<topicSlug>-1.png` (đánh số `-1`, `-2`... nếu có nhiều ảnh).
4. Nhúng ngay sau đoạn "Áp dụng khi:" bằng `![alt mô tả](/docs-images/<moduleSlug>/<topicSlug>-1.png)`.
5. **Xoá đúng dòng `"<moduleSlug>/<topicSlug>"` khỏi mảng `NO_SCREENSHOT_YET`** trong `frontend/src/content/help/screenshots.test.ts` — quên bước này thì bài KHÔNG được tính là "đã có ảnh" dù đã nhúng đúng, và ngược lại xoá khỏi list mà chưa có ảnh thật thì test đỏ ngay lập tức (cố ý, để không lừa dối).

Nếu bài mới hoàn toàn (module trước đây chưa có bài nào) — **thêm luôn** slug đó vào `NO_SCREENSHOT_YET` tạm thời khi mới tạo file `.md` (chưa có ảnh), rồi xoá ngay khi có ảnh thật trong cùng buổi làm việc — không được để bài mới nằm ngoài cả nội dung lẫn danh sách loại trừ (test sẽ báo đỏ).

## 5. Gắn `HdsdLink` vào đúng điểm chèn trên UI

Sau khi bài viết xong, quay lại đúng component đã chụp ảnh, thêm:

```tsx
import { HdsdLink } from "../help/HdsdLink"; // sửa path tương đối cho đúng
// ...
<HdsdLink moduleSlug="gatewaySync" topicSlug="cai-tien-ich" />
```

- Không có `topicSlug` → mở mục lục của cả module (dùng cho header module lớn, hiếm khi cần thêm thủ công vì `AppShell.tsx` đã tự làm việc này).
- Có `topicSlug` → nhảy thẳng đúng bài — dùng cho HẦU HẾT các điểm chèn thủ công trong popup/modal/panel.
- Đặt cạnh tiêu đề panel/modal (`<h2>`/`<h3>`/`panel-head`), hoặc dùng prop `headerExtra` nếu component dùng chung `components/ui/Modal.tsx`.
- Class gợi ý: `className="shrink-0"` nếu nằm trong flex row cạnh text dài (tránh bị bóp).

## 6. Trước khi coi 1 bài là xong

```bash
cd frontend
npx tsc -b                                          # sạch
npx vitest run src/content/help/screenshots.test.ts # bài mới phải pass (có ảnh thật)
npm run test -- --run                               # toàn bộ vẫn xanh
```

Rồi mở app thật, bấm đúng nút HDSD vừa gắn → xác nhận: mở tab mới, đúng URL `/docs/<moduleSlug>/<topicSlug>`, nội dung + ảnh hiện đúng, không vỡ layout ở điểm chèn gốc.

## 7. Ví dụ bài thật đã viết (tham khảo giọng văn)

Xem `frontend/src/content/help/paymentRequests/huy-pr.md` — bài ngắn, đủ 3 phần (Các bước / Sau khi / Lưu ý), đúng tinh thần cần nhân rộng.
