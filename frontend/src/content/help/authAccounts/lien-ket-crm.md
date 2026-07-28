---
title: "Liên kết CRM"
order: 3
audience: ["admin"]
---

Áp dụng khi: tài khoản Auth chưa liên kết với nhân sự CRM, hoặc cần đổi liên kết sang nhân sự khác.

![Modal Chọn Nhân sự Sale để liên kết — bảng CRM Name/Team/Sub-team/Trạng thái kết nối](/docs-images/authAccounts/lien-ket-crm-1.png)

## Các bước

1. Mở chi tiết 1 tài khoản (xem bài **Xem chi tiết tài khoản**) → chọn liên kết CRM.
2. Tìm nhân sự theo **Tìm tên CRM...**, có thể lọc thêm theo **team**/**sub-team**.
3. Nhân sự có badge **"Đã liên kết"** nghĩa là đã gắn với tài khoản khác — không chọn được.
4. Chọn 1 nhân sự đang **"Chưa liên kết"**.
5. Bấm **Xác nhận liên kết**.

## Lỗi thường gặp

| Triệu chứng | Nguyên nhân | Xử lý |
|---|---|---|
| Không tìm thấy nhân sự cần liên kết | Danh sách nhân sự CRM (Metabase) chưa đồng bộ mới nhất | Bấm **Sync Metabase now** rồi tìm lại |

> ⚠️ Lưu ý: mỗi nhân sự CRM chỉ liên kết được **một tài khoản duy nhất** — nhân sự đã "Đã liên kết" phải gỡ liên kết cũ trước mới gán được cho tài khoản khác.
