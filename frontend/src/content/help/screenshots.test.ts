import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { listHelpModules } from "./index";

// Bắt buộc mỗi bài HDSD có ít nhất 1 ảnh minh họa (yêu cầu anh Minh 2026-07-27).
// Quy ước: file lưu ở frontend/public/docs-images/<moduleSlug>/<topicSlug>-N.png,
// nhúng trong .md bằng `![alt](/docs-images/<module>/<topic>-1.png)`.
//
// EXCLUSION LIST — chỉ liệt kê bài THẬT SỰ chưa có ảnh. Bài mới viết KHÔNG
// được thêm vào đây — phải có ảnh ngay khi viết. Xoá đúng dòng khỏi danh sách
// này khi đã bổ sung ảnh thật cho bài đó (đừng xoá "khống" — test sẽ đỏ ngay
// nếu ảnh chưa thực sự tồn tại trên đĩa).
const NO_SCREENSHOT_YET = new Set([
  "module3/bao-don-bo-sung",
  "module3/bao-don-kich-hoat",
  "module3/cong-buoi-gioi-thieu",
  "module3/nhac-kich-hoat-gap",
  "module3/order-id-va-hold",
  "module3/tao-active-request",
  "module3/them-uid-them-goi",
  "module3/tong-quan",
  "module4/nhac-xuat-hoa-don",
  "module4/tong-quan",
  "module4/xuat-hoa-don-theo-course-code",
  "paymentRequests/chuyen-giao-pr",
  "paymentRequests/huy-pr",
  "paymentRequests/pr-du-tien",
  "paymentRequests/tao-lan-tt-chuan",
  "paymentRequests/thieu-anh-bill",
  "paymentRequests/tong-quan",
  "paymentRequests/xem-lich-su-pr",
  "paymentRequests/xem-qr-thanh-toan",
  "reconCard/ghep-giao-dich-the",
  "reconciliation/ghep-ck-ngoai",
  "reconciliation/ghep-giao-dich",
  "reconciliation/so-tien-khong-khop",
  "reconciliation/tong-quan",
  "revenueLedger/quy-doi-ty-gia",
  "revenueLedger/tao-sua-dong-so",
  "revenueLedger/tong-quan",
]);

const IMAGE_RE = /!\[[^\]]*\]\(([^)\s]+)\)/g;
// frontend/src/content/help/screenshots.test.ts → frontend/public
const PUBLIC_DIR = resolve(__dirname, "../../../public");

describe("content/help — ảnh minh họa bắt buộc", () => {
  const modules = listHelpModules();
  const allTopics = modules.flatMap((mod) => mod.topics.map((t) => ({ ...t, key: `${mod.slug}/${t.topicSlug}` })));

  it.each(allTopics)("$key có ít nhất 1 ảnh minh họa, hoặc nằm trong exclusion list", (topic) => {
    const images = [...topic.body.matchAll(IMAGE_RE)].map((m) => m[1]);

    if (NO_SCREENSHOT_YET.has(topic.key)) {
      // Bài cũ chưa có ảnh — chấp nhận tạm, nhưng nếu đã lỡ có ảnh rồi thì
      // nhắc xoá khỏi exclusion list (tự dọn danh sách theo tiến độ viết).
      expect(
        images.length,
        `${topic.key} đã có ảnh — xoá khỏi NO_SCREENSHOT_YET trong screenshots.test.ts`
      ).toBe(0);
      return;
    }

    expect(images.length, `${topic.key} chưa có ảnh minh họa nào trong nội dung`).toBeGreaterThan(0);
    for (const src of images) {
      const filePath = resolve(PUBLIC_DIR, `.${src}`);
      expect(existsSync(filePath), `${topic.key} tham chiếu ảnh không tồn tại: ${src}`).toBe(true);
    }
  });
});
