# Hướng dẫn sử dụng Menu Bảng lương

Mở sheet "PalFish - Bảng lương tự động" → thanh menu trên cùng → chọn **⚙ Bảng lương**.

Menu chia thành 4 nhóm, chạy theo thứ tự từ (1) đến (3) mỗi tháng. Nhóm (4) chỉ dùng một lần khi cài đặt ban đầu.

---

## Quy trình hàng tháng

### Bước 1 — Cập nhật dữ liệu

| Nút | Làm gì | Khi nào dùng |
|-----|--------|-------------|
| **(1) Cập nhật bảng lương** | Kéo toàn bộ dữ liệu lương tháng này từ kho dữ liệu xuống sheet. Bảng lương cũ sẽ được thay bằng số mới nhất. | Đầu kỳ lương, hoặc bất kỳ khi nào muốn lấy số mới nhất |
| **(1.1) Đối soát với bảng lương mẫu** | So sánh bảng lương trên sheet với file Excel bảng lương tổng. Hiện các ô lệch để kiểm tra. | Sau khi chạy (1), muốn kiểm chéo với bảng của mình |
| **(1.2) Cập nhật bảng tính thuế** | Kéo dữ liệu thuế TNCN xuống tab "Bảng tính thuế". | Sau khi chạy (1), để tab thuế cũng cập nhật theo |

**Lưu ý:** Sau khi chạy (1), các ô input (cột vàng nhạt: Thưởng COM nhập tay, Hỗ trợ tiền xe, Bù tiền, Note) giữ nguyên giá trị đã nhập, không bị ghi đè.

### Bước 2 — Gửi phiếu lương

| Nút | Làm gì | Khi nào dùng |
|-----|--------|-------------|
| **(2) Xem trước phiếu lương** | Xem trước phiếu lương dạng bảng ngay trên sheet, giống phiếu nhân viên sẽ nhận. | Trước khi gửi, kiểm tra lại nội dung phiếu |
| **(2.1) Gửi phiếu đang chờ** | Gửi tất cả phiếu đang chờ sang app cho nhân viên xem. | Khi đã kiểm tra xong và sẵn sàng gửi |
| **(2.2) Mở hàng đợi** | Xem danh sách phiếu đã gửi / đang chờ / lỗi. | Kiểm tra trạng thái gửi phiếu |

### Bước 3 — Lưu trữ cuối kỳ

| Nút | Làm gì | Khi nào dùng |
|-----|--------|-------------|
| **(3) Lưu dữ liệu lương tháng này** | Lưu bảng lương hiện tại vào kho dữ liệu để giữ lại cho tháng này. | Sau khi đã chốt lương, trước khi chạy (1) cho tháng mới |
| **(3.1) Lưu dữ liệu thuế tháng này** | Lưu bảng thuế hiện tại vào kho dữ liệu. | Cùng lúc với (3) |
| **(3.2) Xuất Excel + PDF lên Drive** | Tạo file Excel và PDF của bảng lương + bảng thuế, lưu vào thư mục Drive chung. | Khi cần lưu file cứng để gửi hoặc in |
| **(3.3) Tải Excel bảng lương + thuế** | Tải file Excel về máy ngay lập tức (không cần vào Drive). | Khi cần file nhanh trên máy mình |
| **(3.4) Xuất Excel theo Phòng ban** | Tạo file Excel riêng cho từng phòng ban (mỗi nhân viên một tab). | Khi cần gửi riêng cho từng trưởng phòng |

---

## Nhóm cài đặt (chỉ dùng một lần)

| Nút | Làm gì |
|-----|--------|
| **(4) Định dạng lại bảng lương** | Tô lại màu, căn cột, format số cho đúng mẫu. Dùng khi layout bị rối sau khi sửa tay. |
| **(4.1) Tạo tab Nhập tay** | Tạo tab chứa dữ liệu nhập tay (bảo hiểm, trợ cấp). Chỉ chạy một lần. |
| **(4.2) Tạo tab Chấm công** | Tạo tab chấm công. Chỉ chạy một lần. |
| **(4.3) Cài đặt cổng gửi phiếu** | Nối sheet với app để gửi phiếu lương. Chỉ chạy một lần. |
| **(4.4) Test kết nối Gate** | Kiểm tra cổng gửi phiếu có hoạt động không. |

---

## Xử lý lỗi uỷ quyền (lần đầu chạy)

Lần đầu tiên chạy bất kỳ nút nào, Google sẽ hỏi cho phép quyền truy cập:

1. Bấm nút trên menu → hiện hộp thoại "Cần uỷ quyền" → bấm **Tiếp tục**
2. Chọn tài khoản Google của mình
3. Nếu hiện cảnh báo "Ứng dụng chưa được xác minh" → bấm **Nâng cao** (góc dưới trái) → bấm **Đi tới PalFish - Bảng lương tự động (không an toàn)**
4. Bấm **Cho phép**
5. Quay lại sheet, bấm lại nút vừa bấm — lần này sẽ chạy bình thường

Chỉ cần làm bước này **một lần duy nhất**. Các lần sau bấm nút sẽ chạy luôn.
