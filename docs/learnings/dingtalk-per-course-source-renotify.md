# Đổi nguồn cấp gói không kích hoạt tin DingTalk cập nhật

**Related files:** `backend/activation_routes.py` (`_ar_dingtalk_content_key`), `backend/utils/zalo_message_builder.py` (`build_activation_request_created_message`), `backend/utils/lead_source_map.py`

**Problem:** Sale đổi nguồn của một GÓI (course-level `lead_source`) từ Kho Chung → Gia hạn trên AR đã báo (PR-level `lead_source` giữ nguyên), nhưng DingTalk không bắn tin "cập nhật"; và kể cả khi ép bắn, tin vẫn hiện nguồn cũ.

**Trap:** Tưởng đây là 1 lỗi 1 chỗ (chỉ cần content-key gồm nguồn gói là xong). Thực ra có **2 tầng độc lập** phải sửa cùng lúc, thiếu 1 là "bắn nhưng sai":
1. `_ar_dingtalk_content_key` dựng `entry = [name, amount]` cho mỗi gói — KHÔNG gồm `lead_source`/`lead_channel` cấp gói. Đổi nguồn gói → key trước == key sau → `_maybe_enqueue_ar_edit_dingtalk` return sớm → không bắn.
2. `build_activation_request_created_message` chỉ in "Nguồn" per-gói khi có **≥2 nguồn khác nhau** giữa các gói (`per_course_source = len(distinct) >= 2`). Đơn 1 gói lệch nguồn → điều kiện False → footer lấy nguồn **cấp PR** (`resolve_lead_label(pr.lead_source, ...)`) = nguồn cũ. Nên dù re-notify có chạy, tin vẫn hiện "Kho Chung".

**Insight:** Nguồn tồn tại ở **2 cấp** (PR-level trên `payment_requests`, và course-level trong `active_requests.uids_data[].courses[].lead_source`), và chúng được phép lệch nhau (feature có chủ đích — ca chị Kim Chi 17/8: đơn nhiều con khác nguồn). Cả *cơ chế phát hiện thay đổi* (content-key) lẫn *cơ chế hiển thị* (footer vs per-gói) đều phải tôn trọng nguồn cấp-gói, không chỉ cấp-PR. Điều kiện hiển thị đúng phải là "tập nhãn nguồn của các gói KHÁC nhãn footer PR" (`distinct != {lead}`), không phải "có ≥2 nguồn".

**Rule:** Khi một trường hiển thị trong tin DingTalk tồn tại ở cả cấp PR lẫn cấp gói, kiểm CẢ HAI đường: (a) trường đó có nằm trong `_ar_dingtalk_content_key` không (nếu không → re-notify không kích hoạt); (b) builder có render đúng giá trị cấp-gói khi nó lệch cấp-PR không (đừng chỉ test đơn nhiều gói — test cả đơn **1 gói lệch nguồn**). Edit-resend là DingTalk-only (Zalo chỉ bắn `payment_paid`), nên `_ar_dingtalk_content_key` là điểm gác duy nhất.

**Verify:** `& "$env:LOCALAPPDATA\Programs\Python\Python310\python.exe" -m pytest backend/tests/test_zalo_builder.py -q` (đơn 1 gói lệch nguồn: `test_single_course_source_differs_from_pr_prints_per_course`). Content-key: `test_course_lead_source_change_alters_key` trong `backend/tests/test_dingtalk_edit_resend.py` (cần env FastAPI đủ mới — miniconda/CI, không chạy trên Python310 fallback).
