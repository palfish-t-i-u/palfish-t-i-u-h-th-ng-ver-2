# Audit — 1 PR có điền được tên nhiều con không? (2026-07-07)

## Kết luận

**Đây là thiếu sót đã biết (known gap), KHÔNG phải thiết kế cuối cùng/chủ đích.** Team đã chủ động defer từ Sprint 1 (18/06/2026) và chưa quay lại làm.

Chính xác hơn: phần **luồng tiền + gói học** (nhiều lần TT, nhiều UID, nhiều course riêng biệt cho từng con) **đã được thiết kế và code đúng** để hỗ trợ nhiều con trong 1 PR — nhưng phần **lưu tên con** thì chưa theo kịp, chỉ hỗ trợ đúng 1 tên.

## Chuỗi bằng chứng

### 1. Spec gốc B1 (tạo PR) — chỉ có 1 bộ định danh, đúng thiết kế

[`docs/PROTOTYPE_PAYMENT_FLOW.md:22`](PROTOTYPE_PAYMENT_FLOW.md) — B1 field: "UID CRM, Tên KH, Địa chỉ, SĐT, Tổng số tiền, Note". PR đóng vai trò **"trạm thu tổng"** (gom nhiều lần thanh toán cho 1 phụ huynh/khách), không phải đơn vị theo từng con — cái này đúng chuẩn, không phải bug.

### 2. Spec B3 (Active Request) — team ĐÃ chủ đích tính đến nhiều con từ 27/05

[`docs/HANDOFF_GIANG_DUC_2026-05-27.md:250-253`](HANDOFF_GIANG_DUC_2026-05-27.md):
> "3. Thêm flow nhiều UID / nhiều gói: ... **Cho Sales thêm UID mới nếu 1 PR mua gói cho nhiều học viên.**"

→ Spec rõ ràng: 1 PR được phép phục vụ nhiều học viên (nhiều con), thông qua nhiều UID + nhiều gói học riêng trong `active_requests.uids_data` (JSONB array) ở bước B3.

### 3. Code đã implement đúng phần multi-UID / multi-course

- Schema: `active_requests.uids_data jsonb` — mảng, mỗi phần tử `{uid, phone, country, courses: [...]}` ([schema_prod.sql:780-789](../schema_prod.sql)).
- BE: `ActiveRequestPatchUidPayload` cho phép list nhiều UID, mỗi UID nhiều `courses` riêng ([backend/activation_routes.py:91-101](../backend/activation_routes.py)).
- FE: `ActivationTab.tsx` có dialog **"Thêm UID mới"** hoạt động thật (`addUid`, `submitAddUid`, dòng 762-800), cho phép Sales gắn thêm 1 UID (con thứ 2) + gói học + số tiền riêng vào cùng 1 AR/PR.

→ Đây chính là phần anh Đạt quan sát: "vẫn có khả năng tạo các lần thanh toán khác nhau và tạo gói học riêng biệt cho từng con" — **đúng, phần này đã làm, không thiếu.**

### 4. Chỗ thiếu: KHÔNG có trường lưu TÊN cho con thứ 2 trở đi

- `payment_requests.child_name` — cột **text đơn** (1 giá trị), gắn ở B1, đại diện cho đúng 1 con ([`backend/payment_request_routes.py:115,141`](../backend/payment_request_routes.py)).
- Dialog "Thêm UID mới" ở B3 ([`frontend/src/components/ActivationTab.tsx:1580-1600`](../frontend/src/components/ActivationTab.tsx)) **chỉ có 1 field: UID** — không có field tên. `ActiveRequestPatchUidPayload` cũng chỉ có `uid, phone, country, courses` — không có `name`/`student_name`.
- Hệ quả: nếu PR có 2 con, hệ thống chỉ hiển thị/lưu được tên của **1 con** (`child_name`) ở mọi nơi dùng field này — con thứ 2 chỉ nhận diện được qua UID (số), không có tên:
  - Nội dung chuyển khoản / QR (`payment_request_routes.py:1122-1132`)
  - Tin nhắn Zalo báo tiền về (`utils/zalo_message_builder.py:156-207,395-460`) — chỉ chèn 1 `child_name`
  - Modal ghép CK ngoài cho kế toán đối soát (`sepay_routes.py:721,770`) — field `child_name` show ra chỉ 1 tên, kế toán không phân biệt được lần TT nào của con nào khi PR có 2 con

### 5. Team đã tự nhận ra gap này và ghi chú rõ, nhưng defer

[`docs/HANDOFF_DUC_SPRINT1_2026-06-18.md:63`](HANDOFF_DUC_SPRINT1_2026-06-18.md):
> "Nếu có nhu cầu lấy thêm `student_name`/`uid_owner_name` per-UID trong `uids_data` (cho UI hiển thị multi-child) thì **cân nhắc sau** — Sprint 1 chỉ cần `payment_requests.child_name`."

→ Xác nhận: không phải bug ai đó vô tình bỏ sót không biết — mà là quyết định **hoãn có chủ đích** để ưu tiên xong Sprint 1, và đến giờ (07/07) vẫn chưa có ai quay lại làm phần `student_name` per-UID.

## Đánh giá mức độ ảnh hưởng

| Khu vực bị ảnh hưởng | Mức độ | Ghi chú |
|---|---|---|
| Đối soát CK ngoài (kế toán ghép lần TT) | 🟠 Quan trọng | Không phân biệt được lần TT của con nào khi PR có ≥2 con cùng amount — rủi ro ghép nhầm, tương tự bug 1C-02 đã từng gặp |
| Tin nhắn Zalo báo "ĐÃ VÀO" | 🟡 UX | Chỉ hiện 1 tên con dù có thể là tiền của con khác |
| Nội dung QR chuyển khoản | 🟡 UX | Sale phải tự biết dùng field nào, dễ nhầm khi tạo lần TT cho con thứ 2 |
| Hóa đơn / Course code (B3-B4) | 🟢 OK | Mỗi course có field `name` riêng (tên gói học) — nhưng đó là tên gói, không phải tên học viên; xuất HĐ vẫn theo `IssueCourseInvoiceBody.name` nhập tay lúc xuất, không bị chặn cứng |

## Đề xuất hướng fix (chưa code — chờ anh Minh/Đạt chốt ưu tiên)

| ID | Vấn đề cần giải quyết | Cách xử lý (kỹ thuật, đề xuất) | PIC gợi ý |
|----|------------------------|-------------------------------|-----------|
| **MC-01** | `uids_data` không có field tên con cho UID thứ 2 trở đi | BE: thêm `name: str \| None` vào `ActiveRequestPatchUidPayload` ([activation_routes.py:91](../backend/activation_routes.py)), persist trong JSONB. FE: thêm input "Tên con" vào dialog "Thêm UID mới" ([ActivationTab.tsx:1580](../frontend/src/components/ActivationTab.tsx)) | BE + FE |
| **MC-02** | Modal ghép CK ngoài / Zalo message chỉ hiện `child_name` đơn, không map đúng con theo UID của lần TT | BE: khi trả `match-candidates` / build Zalo message, nếu line có UID khớp với UID phụ (khác `payment_requests.uid` gốc) trong `uids_data` → ưu tiên lấy `name` từ đúng UID đó thay vì fallback `payment_requests.child_name` | BE (Đức/Kem) |
| **MC-03** | UX: Sale không biết PR hỗ trợ nhiều con qua "Thêm UID" ở B3 — dễ hiểu nhầm "1 PR = 1 con" như phản hồi của anh Đạt | Thêm ghi chú/tooltip ở form tạo PR (B1) hoặc PaymentRequestDetailDrawer: "Nếu mua gói cho nhiều con, tạo AR xong dùng nút 'Thêm UID mới' trong Kích hoạt khóa học" | FE |

