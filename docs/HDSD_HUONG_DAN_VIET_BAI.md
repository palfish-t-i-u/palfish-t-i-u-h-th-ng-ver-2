# Hướng dẫn viết 1 bài HDSD hoàn chỉnh

> Dùng khi viết bài mới cho `frontend/src/content/help/`. Đọc kèm `docs/plans/HDSD_CHECKLIST_CON_LAI_2026-07-27.md` để biết bài nào cần viết, ai phụ trách.

## 1. File nằm ở đâu, tên gì

`frontend/src/content/help/<moduleSlug>/<topicSlug>.md`

- `moduleSlug` = đúng `ViewId` trong `frontend/src/pages/MainPage.tsx` (vd `gatewaySync`, `zaloConfig`, `module5`...) — **không tự đặt tên khác**, sai slug thì bài không hiện ra ở đâu cả.
- `topicSlug` = kebab-case tiếng Việt không dấu, ngắn gọn, mô tả đúng thao tác (vd `tao-tai-khoan`, `kiem-tra-ket-noi`). Slug `tong-quan` dành riêng cho bài tổng quan của module đó (order: 0).

## 2. Khung 1 bài (copy nguyên khối này rồi sửa)

```markdown
---
title: "Tên bài hiển thị trên sidebar/breadcrumb"
order: 1
audience: ["sale"]
---

Áp dụng khi: 1 câu mô tả đúng lúc nào người dùng cần đọc bài này.

![Alt text mô tả ảnh — nói rõ đây là màn hình/popup gì](/docs-images/<moduleSlug>/<topicSlug>-1.png)

## Các bước

1. Bước 1 — **tên nút/field** in đậm đúng như trên UI thật.
2. Bước 2 — ...
3. Bước 3 — ...

## Sau khi xong (bỏ mục này nếu không có gì đặc biệt xảy ra sau thao tác)

- Điều gì xảy ra tiếp theo, cập nhật ở đâu.

> ⚠️ Lưu ý: 1 cảnh báo/ràng buộc thật quan trọng — điều kiện chặn, giới hạn quyền, hoặc lỗi thường gặp. Không thêm câu này nếu không có gì đáng cảnh báo.
```

**Frontmatter — chỉ 3 field, đừng thêm field khác (loader không đọc):**
- `title` — hiện ở sidebar + breadcrumb, ngắn gọn, không lặp lại tên module nếu đã rõ ràng từ context.
- `order` — số nguyên, quyết định thứ tự trong sidebar. Bài tổng quan (`tong-quan.md`) luôn `order: 0`. Các bài khác đánh số tăng dần theo luồng thao tác tự nhiên (không cần liên tục, để hở số để chèn sau).
- `audience` — mảng vai trò liên quan (`"sale"`, `"ke-toan"`, `"admin"`, `"hr"`...). Hiện KHÔNG dùng để gate quyền — chỉ mang tính tham khảo, ghi đúng để sau này dùng được.

## 3. Giọng văn — bám sát 30 bài đã có, đừng bịa phong cách mới

- Câu đầu tiên **luôn** bắt đầu bằng "Áp dụng khi:" — 1 câu, không xuống dòng.
- "Các bước" đánh số, **in đậm đúng tên nút/field/label thật trên UI** — không diễn giải qua loa ("bấm nút xác nhận" ❌ → "bấm **Xác nhận báo đơn bổ sung**" ✅). Tên nút phải copy chính xác từ code (grep trong file component), không đoán.
- Ngắn — hầu hết bài hiện có 15-30 dòng kể cả frontmatter. Không viết dài dòng, không thêm phần "Giới thiệu chung" lan man.
- Cảnh báo `> ⚠️` chỉ dùng khi có ràng buộc/rủi ro THẬT (giới hạn quyền, điều kiện chặn, lỗi hay gặp) — không phải mục bắt buộc, bỏ hẳn nếu không có gì đáng nói.
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
