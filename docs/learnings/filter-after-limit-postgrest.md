# Filter sau limit = mất dữ liệu theo scope người dùng

**Related files:** `backend/main.py`

**Problem:** Thêm `.range()` (pagination) vào `_list_orders_supabase` trong khi filter phân quyền (`allowed_creators`) vẫn chạy bằng Python SAU khi query trả về — sale user có đơn cũ nằm ngoài N dòng mới nhất thấy danh sách rỗng.

**Trap:** Thêm `.limit()`/`.range()` vào một query đã có bước lọc hậu kỳ trong Python trông như thay đổi vô hại về hiệu năng — mọi test hiện có vẫn xanh vì bảng test nhỏ hơn limit. Bug chỉ lộ khi (số dòng toàn bảng > limit) VÀ (dòng của user không nằm trong trang đầu).

**Insight:** Thứ tự trong PostgREST/Supabase query builder là thứ tự SQL: mọi điều kiện scope/quyền PHẢI nằm trong query (`.eq`/`.in_`/`.or_`) trước `.range()`, để limit cắt trên tập ĐÃ lọc. Lọc hậu kỳ Python chỉ an toàn khi query không giới hạn số dòng — mà query không giới hạn lại chính là nguồn OOM. Hai yêu cầu này chỉ thoả đồng thời khi filter nằm trong SQL. Chú ý case: `.in_()` so sánh exact — normalize (strip+lower) giá trị lúc GHI để khớp.

**Rule:** Trước khi thêm limit/range vào bất kỳ list endpoint nào: grep hàm đó tìm vòng lặp lọc sau `.execute()`. Có lọc hậu kỳ theo user/role → chuyển vào query trước, limit sau. Test regression phải assert THỨ TỰ gọi (`names.index("or_") < names.index("range")`) chứ không chỉ kết quả.

**Verify:** `cd backend && python -m pytest tests/test_orders_scope.py -q` — expect 5 passed.
