# Regex bỏ dấu: ký tự tổ hợp literal vô hình trong file

**Related files:** `frontend/src/components/help/HelpArticle.tsx`

**Problem:** Hàm `slugify` bỏ dấu tiếng Việt cần strip dải ký tự tổ hợp Unicode (U+0300..U+036F) sau khi `normalize("NFD")`. Khi viết/ghi file qua công cụ, dòng regex ra thành `.replace(/[̀-ͯ]/g, "")` — tức chèn **ký tự tổ hợp literal** (U+0300 và U+036F trực tiếp) thay vì escape `̀-ͯ`.

**Trap:** Gõ `̀-ͯ` trong nội dung file rồi tưởng file giữ nguyên chuỗi escape đó. Thực tế tầng text có thể emit ký tự tổ hợp **thật** vào file — chúng vô hình trên màn hình (không có glyph nền), `tsc` vẫn xanh, test vẫn qua vì về mặt runtime regex vẫn đúng dải. Nhưng chuỗi source giờ phụ thuộc normalization: một lần chỉnh/normalize NFC nữa là dải gãy, và diff/review không thấy gì bất thường. Đây là bẫy TÁI DIỄN (đã dính ≥2 lần ở repo này).

**Insight:** `̀-ͯ` là dải "combining diacritical marks" — chính các dấu mà NFD tách ra từ ký tự có dấu. Regex phải chứa dạng **escape** để source ổn định qua mọi lần normalize. Không sửa được bằng Edit (old_string chứa ký tự vô hình khó khớp) — dùng script Node đọc file, `replace(/\[[̀-ͯ][^\]]*\]/g, "[\\u0300-\\u036f]")`, ghi lại UTF-8, rồi verify `/[̀-ͯ]/.test(fileContent) === false`.

**Rule:** Sau khi viết/sửa bất kỳ regex bỏ dấu nào, xác nhận file KHÔNG chứa ký tự tổ hợp literal — chỉ được có chuỗi escape `̀-ͯ`. Slug do `slugify()` sinh phải khớp id mà renderer h2/h3 gán (cùng hàm) thì anchor mục lục mới cuộn đúng.

**Verify:** `node -e "const s=require('fs').readFileSync('frontend/src/components/help/HelpArticle.tsx','utf8'); if(/[̀-ͯ]/.test(s)) throw new Error('LITERAL combining char in source'); console.log('ok')"` — regex literal `[̀-ͯ]` do node tự dịch thành dải, so trực tiếp với byte file; pass = source chỉ có dạng escape. (Đừng thêm check `includes` chuỗi escape trong cùng one-liner: bash nuốt bớt backslash → false-negative.)
