# Design — 1 PR nhiều con (multi-child) — 2026-07-07

> **Trạng thái: DRAFT — chờ anh Minh duyệt.**
> Nối tiếp audit của Đạt (`docs/AUDIT_PR_MULTI_CON_2026-07-07.md`, commit `b3c2f19` sandbox).

## 1. Bối cảnh & dữ liệu thực tế

Audit của Đạt kết luận: giới hạn "1 PR chỉ điền được 1 tên con" là **known gap defer từ Sprint 1 (18/06)**, không phải thiết kế chủ đích. Phần luồng tiền + gói học (nhiều lần TT, nhiều UID, nhiều course) đã hỗ trợ nhiều con; chỉ phần **tên con** chưa theo kịp.

Dữ liệu prod (07/07):

| Chỉ số | Giá trị |
|---|---|
| Tổng AR | 27 |
| AR có ≥2 UID (2 con) | 2 (~7%) — `PR-2026-0034`, `PR-2026-0132` |
| AR có ≥3 UID | 0 |

**Phát hiện quan trọng:** sales đã tự workaround — gõ cả 2 tên vào 1 ô `child_name`:
- `PR-2026-0034`: "Đỗ Vũ Cát Tường & Đỗ Gia Huy" (2 lần TT, 2 amount khác nhau)
- `PR-2026-0132`: "Nguyễn Bảo Nhi và Nguyễn Bảo Nguyên" (1 lần TT)

→ Kế toán chưa ghép nhầm là nhờ **may** (2 amount khác nhau), không phải nhờ thiết kế. Và sales **biết đủ tên các con ngay lúc tạo PR** (B1).

## 2. Hai phát hiện kỹ thuật làm đổi hướng so với đề xuất MC-02 của Đạt

1. **`payment_lines` không có cột UID.** Lần thanh toán chỉ biết nó thuộc PR nào, không biết của con nào. MC-02 ("map tên theo UID của line") như audit viết **chưa chạy được** — không có gì để map.
2. **Thứ tự nghiệp vụ: AR sinh ra SAU khi PR thanh toán đủ** (`require_paid_pr=True`). Lúc sale tạo lần TT thì `uids_data` chưa tồn tại → không thể lấy danh sách con từ AR. **Danh tính các con phải nằm ở tầng PR (B1) ngay từ đầu.**

## 3. Thiết kế

Nguyên tắc: danh sách con là **nguồn gốc ở PR (B1)**; lần thanh toán và UID chỉ **trỏ vào** danh sách đó.

### 3.0 Đối chiếu spec gốc & mô hình CRM (thêm 07/07 sau review anh Minh)

- **Spec gốc KHÔNG giới hạn 1 PR = 1 bé.** `PROTOTYPE_PAYMENT_FLOW.md` B3: "UID (UID1 khớp B1, UID khác nhập tay)" — PR là **trạm thu tổng của 1 người trả tiền (phụ huynh)**, chứa được nhiều học viên qua nhiều UID. Handoff 27/05 nói thẳng: "Cho Sales thêm UID mới nếu 1 PR mua gói cho nhiều học viên". UID ở B1 chỉ là UID của bé **đầu tiên** (mỏ neo), không phải "bé duy nhất".
- **Mô hình CRM: mỗi bé = 1 UID riêng.** `uids_data` mỗi phần tử = 1 UID = 1 bé, mỗi course thuộc 1 UID → 1 Order ID trên CRM. Phần kích hoạt đã khớp chuẩn CRM sẵn.
- **Hệ quả cho design:** con trong PR nên được định danh bằng cặp **tên + UID CRM** (uid optional lúc B1 — spec gốc cho phép "UID khác nhập tay" ở B3, tức lúc tạo PR có thể chưa có UID bé 2). Khi B3 thêm UID cho bé nào thì điền ngược UID vào đúng entry của bé đó — 1 nguồn sự thật.

### 3.1 Dữ liệu (1 migration nhẹ)

| Thay đổi | Chi tiết |
|---|---|
| `payment_requests.extra_children` (JSONB, **mới**) | Mảng `{name, uid?}` cho **bé thứ 2 trở đi**. Bé 1 vẫn nằm nguyên ở `child_name` + `uid` như hiện tại → không có 2 nguồn sự thật cho bé 1, sửa tên bé 1 đi đúng flow cũ, **không đụng 60 chỗ code đang dùng `child_name`**. API trả về `children` = danh sách đầy đủ ghép từ (`child_name`+`uid`) + `extra_children`. Bé 2+: `uid` optional, điền sau ở B3 nếu chưa có. |
| `payment_lines.student_name` (text, **mới**, nullable) | Lần TT này của con nào. NULL = con chính → mọi dòng cũ giữ nguyên nghĩa, không cần backfill hàng loạt. |
| `active_requests.uids_data[].name` (field JSONB, **mới**) | Ở B3 thêm UID thì chọn bé từ `children` của PR — xác định UID nào của bé nào. Nếu bé chưa có `uid` trong `children` → UID nhập ở dialog được ghi ngược vào entry của bé đó. Không cần migration (JSONB). |

Line gắn bé bằng **tên** (không phải id phụ) — 2-3 con cùng 1 phụ huynh không trùng tên, YAGNI, tránh đẻ thêm bảng; còn định danh CRM của bé đã có `uid` trong `children`.

### 3.2 Nhập liệu

- **B1 tạo PR**: ô "Tên con" thêm nút **"+ Thêm con"** (mỗi bé: tên bắt buộc, UID CRM optional — chưa có thì bổ sung ở B3). 93% case 1 con: form không khác gì hiện tại.
- **Sửa thông tin PR** (PaymentRequestDetailDrawer, form sửa hiện có): cùng editor "+ Thêm con" như B1 — **bổ sung bé sau khi PR đã tạo** (case thực tế phổ biến: khách ban đầu báo 1 con, sau muốn cho bé thứ 2 học cùng PR). Các lần TT đã có trước đó giữ nguyên nghĩa "con chính"; lần TT mới cho bé 2 chọn qua dropdown như bình thường. Sửa `children` đi qua PATCH PR sẵn có.
- **Tạo lần TT** (PaymentRequestDetailDrawer): PR có ≥2 con → hiện dropdown **"Của con nào?"** (mặc định con 1). PR 1 con → không hiện.
- **B3 dialog "Thêm UID mới"** (ActivationTab): thêm ô chọn bé (bắt buộc, từ danh sách `children` của PR; cho gõ tên mới nếu PR tạo trước feature — tên mới tự append vào `children`). UID nhập ở đây ghi ngược vào entry của bé trong `children` nếu còn trống.

### 3.3 Luồng ra — mọi nơi nói đúng tên đúng con

| Kênh | Thay đổi |
|---|---|
| Nội dung CK / QR | Dùng tên con của lần TT. Tận dụng cơ chế `name_for_transfer` per-line **đã có sẵn** — chỉ đổi nguồn tên. Giữ giới hạn 40 ký tự của img.vietqr.io. |
| Zalo "ĐÃ VÀO" | Tin báo theo lần TT → chèn tên đúng con của lần TT đó (fallback `child_name` nếu NULL). |
| Modal ghép CK ngoài (kế toán) | Mỗi lần TT hiện `student_name` của nó thay vì `child_name` chung → hết rủi ro ghép nhầm khi 2 lần TT cùng số tiền. |
| Stale content detection | Mở rộng danh sách "tên hợp lệ" thêm tên các con trong `children` (code đã có pattern build name variants). |

### 3.4 Backfill

Đúng 2 PR có tên ghép (`PR-2026-0034`, `PR-2026-0132`): tách tay tên vào `children`, giữ `child_name` = con 1. 5 phút, không cần script.

### 3.5 Edge cases (tập trung quanh SỬA thông tin)

- **Thêm bé sau khi PR đã có lần TT**: lần TT cũ (`student_name` NULL) vẫn hiểu là của con chính — không phải sửa lại gì. Chỉ lần TT mới cần chọn bé.
- **Sửa tên bé** trong PR → hệ thống tự cập nhật `student_name` của các lần TT đang trỏ tên cũ + `name` trong `uids_data` (đổi tên = đổi mọi nơi, không để lệch). Nội dung CK của QR đang pending sẽ bị stale detection bắt như cơ chế sửa tên hiện tại.
- **Xóa bé** khỏi PR: chặn nếu bé đang có lần TT hoặc UID gắn (báo rõ lý do); chỉ xóa được bé chưa dính dữ liệu.
- Thêm UID ở B3 mà bé chưa có trong danh sách → cho gõ tên mới, tự append vào `children` (đường lùi cho PR tạo trước feature này).
- `student_name` của line không khớp tên nào trong `children` (dữ liệu lệch do sửa ngoài luồng) → hiển thị nguyên văn, không chặn.
- PR cũ không có `children` → fallback `child_name` ở mọi nơi, hành vi hiện tại.

## 4. Chấm theo 3 tiêu chí

| Tiêu chí | Đánh giá |
|---|---|
| **Triệt để** | Đóng cả 3 tầng thiếu: tên chuẩn từng con (data) + từng lần TT gắn đúng con (attribution) + mọi kênh hiển thị đúng (QR/Zalo/ghép CK). |
| **Không lỗi con** | Mọi cột mới nullable/JSONB, thiếu → fallback `child_name` = hành vi hiện tại. PR 1 con không đổi 1 pixel. Không đụng 60 refs `child_name`. |
| **Không tăng gánh hạ tầng** | 1 migration 2 cột, không service mới, không query nặng thêm, không bảng mới. |

## 5. So với đề xuất MC-01/02/03 của Đạt

| Của Đạt | Design này |
|---|---|
| MC-01: thêm `name` vào `uids_data` (nhập ở B3) | Giữ, nhưng **chọn** từ `children` của PR thay vì gõ tự do |
| MC-02: map tên theo UID của line | **Thay** bằng `payment_lines.student_name` — vì line không có UID và AR chưa tồn tại lúc tạo line |
| MC-03: tooltip hướng dẫn | Không cần nữa — flow "+ Thêm con" ở B1 tự giải thích |

## 6. Ước lượng & phạm vi file

~2-3 ngày công BE+FE:

- **BE**: migration (`children`, `student_name`); `payment_request_routes.py` (create/patch PR, QR content); `activation_routes.py` (`ActiveRequestPatchUidPayload.name`); `sepay_routes.py` (match-candidates); `utils/zalo_message_builder.py`; stale content detection.
- **FE**: form tạo PR (B1 "+ Thêm con"); `PaymentRequestDetailDrawer.tsx` (dropdown chọn con khi tạo lần TT + hiển thị); `ActivationTab.tsx` (dialog Thêm UID); modal ghép CK kế toán.
- **Test**: unit BE (zalo builder, match candidates, stale detection), E2E happy path 2 con.

## 7. Câu hỏi mở (chốt khi duyệt)

1. **PIC**: Claude code toàn bộ, hay handoff BE cho Đức/Đạt?
2. Triển khai sandbox soak trước rồi merge main (như pattern hiện tại)?
