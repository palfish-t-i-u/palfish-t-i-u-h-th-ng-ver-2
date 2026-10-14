# Hướng dẫn sử dụng Menu "⚙ Bảng lương"

*Cập nhật: 05/10/2026*

Mở sheet **"PalFish - Bảng lương tự động"** → thanh menu trên cùng → chọn **⚙ Bảng lương**.

> Không thấy menu, hoặc thiếu mục mới? Bấm **F5** tải lại trang rồi chờ vài giây cho menu nạp xong.

---

## Lần đầu dùng — cấp quyền (chỉ 1 lần)

Lần đầu bấm bất kỳ nút nào, Google sẽ hỏi cấp quyền:

1. Bấm nút trên menu → hiện hộp thoại **"Cần uỷ quyền"** → bấm **Tiếp tục**.
2. Chọn tài khoản Google của mình.
3. Nếu hiện cảnh báo **"Ứng dụng chưa được xác minh"** → bấm **Nâng cao** (góc dưới trái) → bấm **Đi tới PalFish - Bảng lương tự động (không an toàn)**.
4. Bấm **Cho phép**.
5. Quay lại sheet, bấm lại nút vừa bấm — lần này sẽ chạy bình thường.

Chỉ cần làm **một lần duy nhất**. Các lần sau bấm nút nào cũng chạy luôn.

---

## Quy trình hàng tháng (tóm tắt nhanh)

1. **Đầu kỳ — lấy số:** 🔄 Cập nhật bảng lương → 📊 Cập nhật bảng tính thuế → 📋 Đối soát với bảng mẫu.
2. **Kiểm tra:** 👁 Xem trước phiếu lương từng người, sửa ô nhập tay nếu cần.
3. **Gửi phiếu:** tick các cột trạng thái → 🧹 Xếp lại hàng đợi → 📤 Gửi phiếu đang chờ.
4. **Bản cho sếp:** 📤 Xuất bản gửi sếp (song ngữ).
5. **Cuối kỳ:** 💾 Lưu dữ liệu lương tháng này (trước khi sang tháng mới).

---

## Chi tiết từng nút

### Nhóm 1 — Cập nhật & đối soát số liệu

| Nút | Làm gì | Khi nào dùng |
|---|---|---|
| 🔄 **(1) Cập nhật bảng lương** | Kéo toàn bộ dữ liệu lương tháng này từ kho về sheet. Bảng cũ được thay bằng số mới nhất. Các ô **nhập tay (nền vàng)** được giữ nguyên, không bị ghi đè. | Đầu kỳ, hoặc bất kỳ khi nào muốn lấy số mới nhất |
| 📋 **(2) Đối soát với bảng lương mẫu** | So bảng trên sheet với file Excel bảng lương tổng, hiện các ô lệch để kiểm tra. | Sau khi chạy (1), muốn kiểm chéo |

### Nhóm 2 — Xem & xuất phiếu / báo cáo

| Nút | Làm gì | Khi nào dùng |
|---|---|---|
| 👁 **Xem trước phiếu lương (dòng đang chọn)** | Chọn 1 dòng nhân viên → xem trước phiếu đúng như nhân viên sẽ nhận. | Trước khi gửi, kiểm lại nội dung phiếu |
| 📥 **Xuất Excel theo Khối** | Tạo file Excel riêng cho từng khối/phòng ban (mỗi người một tab). | Khi cần gửi riêng cho từng trưởng khối |
| 📤 **Xuất bản gửi sếp (song ngữ)** 🆕 | Tạo tab **"Bảng lương (gửi sếp)"**: tiêu đề song ngữ Việt–Trung, bỏ các cột thao tác nội bộ, có dòng tổng **BOD**. | Khi cần bản gọn gàng, song ngữ để gửi sếp |

> **Lưu ý 📤 Xuất bản gửi sếp:** mỗi lần bấm sẽ **làm mới lại** tab "Bảng lương (gửi sếp)" (không tạo tab trùng). Tab này là bản chụp tự sinh — **đừng sửa tay trên đó** (bấm lần sau sẽ mất); cần sửa thì sửa ở tab "Bảng lương" gốc rồi bấm lại.

### Nhóm 3 — Định dạng, thuế, lưu trữ

| Nút | Làm gì | Khi nào dùng |
|---|---|---|
| 🎨 **Định dạng lại (không cần BQ)** | Tô lại màu, căn cột, format số, và **bật tiêu đề song ngữ** — không kéo lại dữ liệu. | Khi layout bị rối sau khi sửa tay, hoặc muốn bật song ngữ ngay |
| 📊 **Cập nhật bảng tính thuế (tham chiếu)** | Kéo dữ liệu thuế TNCN xuống tab "Bảng tính thuế". | Sau khi chạy (1), để tab thuế cập nhật theo |
| 💾 **Lưu dữ liệu lương tháng này** | Lưu bảng lương hiện tại vào kho để giữ lại cho tháng này. | Sau khi đã chốt lương, trước khi chạy (1) cho tháng mới |

### Nhóm 4 — Tạo tab (chỉ dùng một lần)

| Nút | Làm gì |
|---|---|
| 🧾 **Tạo tab Nhập tay (input)** | Tạo tab chứa các ô nhập tay (bảo hiểm, trợ cấp…). Chỉ chạy một lần. |
| 🗓️ **Tạo tab Chấm công** | Tạo tab chấm công để dán bảng công hàng tháng. Chỉ chạy một lần. |

### Nhóm 5 — Cổng gửi phiếu lương

| Nút | Làm gì | Khi nào dùng |
|---|---|---|
| 🔌 **Cài đặt cổng gửi phiếu** | Nối sheet với app để gửi phiếu. Chỉ chạy một lần (lúc thiết lập). |
| 🧹 **Xếp lại hàng đợi (quét bù tick sót)** 🆕 | Quét lại cả bảng, tìm những dòng đã tick "Gửi BL" mà chưa vào hàng đợi rồi **xếp bù**. Bấm nút này **trước** "Gửi phiếu đang chờ" là chắc ăn đủ người. | Khi tick nhiều dòng liên tiếp, hoặc nghi gửi sót |
| 🩹 **Khớp tick đã gửi (sửa ô rụng)** 🆕 | Nếu ô "Gửi BL" của phiếu **đã gửi** bị rụng dấu tick, nút này tick lại cho khớp thực tế. **Không gửi lại phiếu.** | Khi thấy ô "Gửi" của người đã nhận phiếu lại trống |
| 🔄 **Gửi lại phiếu (dòng đang chọn)** 🆕 | Gửi lại phiếu **đã sửa** cho nhân viên: chọn dòng NV → bấm nút → app nhận số mới (ghi đè, không tạo bản trùng). Nếu số đổi, NV phải xác nhận lại. Ô "Gửi" vẫn giữ khóa. | Khi cần sửa 1 phiếu ĐÃ gửi rồi gửi lại |
| 📤 **Gửi phiếu đang chờ** | Gửi tất cả phiếu đang chờ sang app cho nhân viên xem. | Khi đã kiểm tra xong và sẵn sàng gửi |
| 📋 **Mở hàng đợi** | Xem danh sách phiếu đã gửi / đang chờ / lỗi. | Khi muốn kiểm tra trạng thái gửi |
| 🔃 **Đồng bộ xác nhận từ app** | Kéo trạng thái "nhân viên đã xác nhận" từ app về tick lên sheet (lưới an toàn nếu một lần đẩy bị rớt). | Khi tick xác nhận trên sheet chưa khớp app |
| 🧪 **Test kết nối Gate** | Kiểm tra cổng gửi phiếu có hoạt động không. | Một lần, lúc cài đặt |

---

## Cách gửi phiếu lương — 5 cột trạng thái

Trên tab "Bảng lương" có 5 cột tick, **làm tuần tự từ trái sang phải**:

1. **Xác nhận thông tin** — bạn (người làm lương) xác nhận số của nhân viên đã đúng.
2. **Gửi BL trước thuế** — tick để xếp phiếu *bản trước thuế* vào hàng đợi.
3. **NV xác nhận trước thuế** — nhân viên bấm xác nhận trong app (tự tick về).
4. **Gửi BL sau thuế** — tick để xếp phiếu *bản sau thuế* vào hàng đợi.
5. **NV xác nhận sau thuế** — nhân viên xác nhận lần cuối → kế toán đi lệnh ngân hàng.

Mỗi nút "Gửi" chỉ tick được khi cột điều kiện trước nó đã tick. Sau khi tick xong, bấm **🧹 Xếp lại hàng đợi** rồi **📤 Gửi phiếu đang chờ** để phát.

> **⚠️ Quy tắc quan trọng — ô "Gửi" đã gửi sẽ bị KHÓA:**
> Khi một phiếu đã gửi, ô "Gửi BL" của nó **không bỏ tick được nữa**. Nếu lỡ bỏ, hệ thống tự tick lại và báo *"🔒 Đã gửi, không bỏ được"*. Việc này để Sheet luôn khớp với phiếu nhân viên đã nhận.
> Muốn **sửa** một phiếu đã gửi → **KHÔNG** bỏ tick ô "Gửi"; dùng nút **🔄 Gửi lại phiếu** (xem ngay dưới).

### Sửa & gửi lại phiếu đã gửi 🆕

Khi một phiếu đã gửi mà phát hiện sai số, **không bỏ tick ô "Gửi"**. Làm thế này:

1. Sửa số trên tab **"Bảng lương"** (ngay dòng nhân viên đó).
2. Bấm chọn 1 ô ở dòng đó → menu **⚙ Bảng lương → 🔄 Gửi lại phiếu (dòng đang chọn)** → bấm **Có** để xác nhận.
3. App nhận **số mới** (ghi đè bản cũ, **không** tạo thêm bản). Nếu số **đổi**, dấu "NV xác nhận" của phiếu đó **tự rụng** → nhân viên phải **xác nhận lại** bản mới. Gửi lại y hệt (không đổi số) thì giữ nguyên xác nhận.
4. Ô "Gửi" vẫn giữ ✔ (khóa) suốt quá trình — đúng thiết kế.

---

## Tiêu đề song ngữ Việt–Trung 🆕

Tab "Bảng lương" và bản gửi sếp hiển thị tiêu đề cột **2 dòng: tiếng Việt ở trên, tiếng Trung ở dưới** (ví dụ: *Tổng lương + thưởng / 总收入*).

- Tiêu đề song ngữ tự giữ qua mỗi lần **🔄 Cập nhật bảng lương**. Muốn bật ngay mà không kéo lại dữ liệu thì bấm **🎨 Định dạng lại**.
- Bản gọn gàng song ngữ để gửi sếp: bấm **📤 Xuất bản gửi sếp (song ngữ)**.

> Không cần sửa tay tiếng Trung vào ô tiêu đề. Việc gõ tay tiếng Trung thẳng lên tab "Bảng lương" sẽ làm lỗi các nút gửi phiếu và sẽ bị mất khi cập nhật lại — hãy để hệ thống tự điền.
