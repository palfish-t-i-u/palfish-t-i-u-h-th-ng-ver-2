# Hướng dẫn: Leader báo đơn hộ sale

> Dành cho sale + sale leader. Khi sale bận việc cá nhân / cuối tuần không báo đơn kịp,
> leader có thể báo đơn thay mà **doanh thu vẫn ghi cho sale**.

## Tóm tắt

App **đã hỗ trợ sẵn** việc này — không cần tính năng mới. Leader chỉ cần mở PR của sale
dưới trướng rồi bấm **Báo đơn & Tạo gói học** như bình thường.

Đơn báo hộ **vẫn tính doanh thu/GMV cho sale**, không phải cho leader. Leader chỉ là người bấm thay.

## Điều kiện để leader thấy & báo đơn hộ

1. Sale và leader phải **cùng team + cùng nhóm nhỏ (sub-team)**.
   - VD: leader team "HN 1 / HN 1" thấy tất cả sale trong "HN 1 / HN 1".
   - Leader **không** thấy sale ở team/nhóm khác.
2. Tài khoản leader thuộc phòng ban có quyền **Quản lý thanh toán = Toàn quyền**
   (mặc định ban Bán hàng đã có).

Nếu leader mở app mà **không thấy** PR của sale → kiểm tra 2 điều kiện trên
(sai team/sub-team, hoặc phòng ban bị để "Chỉ xem"/"Không có quyền").

## Các bước thao tác (leader làm)

1. Đăng nhập app bằng tài khoản **leader** của mình.
2. Vào **Quản lý thanh toán**.
3. Tìm PR của bạn sale cần báo hộ (lọc/tìm theo tên khách hoặc mã PR).
   - PR phải **đã đủ tiền** và **các lần thanh toán đã có ảnh bill**.
4. Mở PR → bấm **Báo đơn & Tạo gói học**.
5. Điền thông tin gói học: **UID CRM**, tên bé, SĐT tạo gói, gói học, số tiền, nguồn/kênh.
   - Nhắc sale đã điền **địa chỉ khách trên CRM** (Tỉnh/Phường) trước khi tạo gói.
6. Bấm **Xác nhận báo đơn & tạo gói học**.

Xong: hệ thống tạo yêu cầu tạo gói học (AR), báo lên DingTalk kèm bill, **đứng tên sale**.

## Lưu ý

- **Doanh thu luôn ghi cho sale** (theo người sở hữu PR), dù leader là người bấm.
  Admin không "dí" được vì đơn đã lên hệ thống đúng ngày.
- Nếu PR **chưa đủ tiền** hoặc **thiếu ảnh bill** → nút báo đơn bị khóa.
  Đây là chặn về tiền/bill, **không phải** chặn về quyền. Up bill / thu đủ tiền trước.
- Muốn **đổi chủ sở hữu** PR hẳn (không chỉ bấm hộ) → dùng nút **Chuyển giao PR**
  (trục sale ↔ leader), khác với báo đơn hộ.
