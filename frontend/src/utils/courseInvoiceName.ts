/**
 * Đổi mã gói học nội bộ -> tên sản phẩm dễ đọc để in trên hóa đơn (bản FE).
 *
 * ⚠️ NGUỒN CHUẨN DUY NHẤT = `backend/course_invoice_name.py` (cột "Số tháng đúng
 * (chị Thu Hiền xác nhận)", bản cuối chị SM sửa 2026-09-07). File này PHẢI khớp
 * byte-exact với bảng bên BE — sửa bảng ở một nơi thì sửa cả hai, nếu không file
 * thuế xuất từ FE (tải lại tab "Đã xuất" + fallback khi BE lỗi) sẽ lệch với BE.
 * Test đối chiếu: `backend/tests/test_course_invoice_name.py` <-> `courseInvoiceName.test.ts`.
 */

// key = "<họ gói>:<số buổi TRẢ PHÍ>" -> giá trị ghi trên hóa đơn ("NN tháng" | "N buổi").
const INVOICE_NAME_TABLE: Record<string, string> = {
  "2/W:24": "03 tháng", "2/W:32": "04 tháng", "2/W:48": "06 tháng",
  "2/W:72": "09 tháng", "2/W:96": "12 tháng", "2/W:144": "18 tháng",
  "2/W:192": "24 tháng",
  "3/W:24": "02 tháng", "3/W:48": "04 tháng", "3/W:96": "08 tháng",
  "3/W:120": "10 tháng",
  "12/M:30": "30 buổi", "12/M:60": "05 tháng", "12/M:90": "90 buổi",
  "12/M:120": "120 buổi", "12/M:150": "150 buổi",
  "8/M:30": "30 buổi", "8/M:60": "60 buổi", "8/M:120": "120 buổi",
};

const INVOICE_TEACHER_LABEL: Record<string, string> = {
  PHI: "Philippines",
  "US-UK": "Âu Mỹ",
};

/**
 * Mã gói nội bộ (vd "2/W- NEW 24 PHI+2 HN") -> "Khóa học tiếng Anh 03 tháng
 * giáo viên Philippines". Bỏ qua NEW/UPSALE/REFER/Both AB/Only A, +buổi tặng, HN/HCM.
 *
 * Trả "" nếu không tra được (gói ngoài bảng / free text) để caller fallback tên thô.
 */
export function courseInvoiceName(raw: string): string {
  const text = (raw || "").toUpperCase();
  const fam = /^\s*(\d+\/[WM])/.exec(text);
  const tea = /(\d+)\s*(PHI|US-UK)/.exec(text);
  if (!fam || !tea) return "";
  const value = INVOICE_NAME_TABLE[`${fam[1]}:${parseInt(tea[1], 10)}`];
  const teacher = INVOICE_TEACHER_LABEL[tea[2]];
  if (!value || !teacher) return "";
  return `Khóa học tiếng Anh ${value} giáo viên ${teacher}`;
}
