# Kế hoạch thực hiện — GĐ2 Tự động hoá phiếu lương (cập nhật 20/8/2026)

**Trạng thái: HOÀN THÀNH.** Milestone 2, 3 và 4 đã xong sớm trong Giai đoạn 1. Milestone 1 (chấm công tự động) được loại bỏ sau buổi họp 17/8 với chị Trang — chị chủ trương giữ quyền chốt số chấm công thủ công, dev chỉ cần lấy file cuối cùng của chị.

Bản gốc chốt tại buổi họp sáng 7/8 giữa Minh và Chung. Bản cập nhật này ghi nhận những gì đã hoàn thành — phần lớn các hạng mục Giai đoạn 2 đã được làm xong sớm hơn dự kiến trong quá trình triển khai Giai đoạn 1, bao gồm cả phần tính hoa hồng tự động (theo hướng chị Thúy đề xuất ngày 14/8).

## Tình trạng Giai đoạn 1

Giai đoạn 1 đã hoàn thành: đối soát đạt 99% (1.147/1.164 ô khớp với bảng lương chị Trang). Ba trường hợp lệch còn lại đều do dữ liệu phía nhân sự, không phải lỗi hệ thống:

- **HN0084** — An Thị Cẩm Ly làm song song hai vị trí, cột lương cơ bản và tổng công hiển thị cả hai dòng. Chị Trang sẽ sửa lại để chỉ hiển thị một vị trí; các cột còn lại đã khớp.
- **HN0036** — Lê Thị Thu Yến bị tính sai tổng GMV, dẫn đến thưởng COM lệch rồi kéo theo thuế và tổng lương lệch theo. Chị Trang xác nhận sẽ bù vào phần Bù tiền tháng tới; thuế sẽ tự khớp khi COM được điều chỉnh.
- **HN0147** — Nguyễn Việt Hoàng không được trừ tiền ăn ca vào thu nhập chịu thuế. Chị Vân xác nhận tính sai và sẽ sửa công thức từ tháng sau.

Module phiếu lương trên app GMV đã chạy trên production. Cổng gửi phiếu (Apps Script Gate) đã nối xong. Chị Trang đang kiểm tra thực tế trước khi bấm gửi đợt đầu tiên.

## Những hạng mục GĐ2 đã hoàn thành trong Giai đoạn 1

Trong quá trình triển khai, một số việc thuộc Giai đoạn 2 đã được làm luôn vì chúng nối trực tiếp vào phần đang xây dựng:

- **G2-T8** (bảng lương một sheet hiển thị từ BigQuery) — Đã xong. Script tạo bảng lương chỉ hiện đúng tháng đang cần, toàn bộ dữ liệu lưu trong kho BigQuery; sheet không còn chất đống nhiều tháng.

- **G2-T9** (công thức lương cứng viết trong view BigQuery) — Đã xong. Chung đã dựng các view tính lương trước thuế và sau thuế trên BigQuery, sheet chỉ hiển thị kết quả đổ ra.

- **G2-T10** (hoàn thiện thuế và bảo hiểm) — Đã xong. Thuế lũy tiến năm bậc theo luật 2026, bảo hiểm tính trên mức đóng ghi trong hợp đồng, số người phụ thuộc lấy từ hồ sơ nhân sự. Tất cả đã đối soát 99% với bảng của chị Trang.

- **G2-T11** (gửi phiếu tự động) — Đã xong, nhưng bằng cách khác so với plan gốc. Thay vì gửi qua Zalo và email, phiếu được gửi qua app GMV: chị Trang bấm nút trên sheet, phiếu đẩy sang app, nhân viên mở app để xem và xác nhận. Cách này gọn hơn vì tận dụng hệ thống phân quyền đã có sẵn trên app.

- **G2-T6, G2-T7** (tính hoa hồng tự động) — Đã xong. Chung thống nhất logic COM với chị Trang và dựng view `C_view_bang_thuong_com` trên BigQuery. Kết quả đổ thẳng vào bảng lương, đã đối soát 99%. Scope: chỉ tự động cho Sale IH1, IH2, Offline; nhóm đặc biệt (Leader, Manager, CS, GV) và Đào Trang vẫn nhập tay.

- **G2-N4** (bảng phần trăm COM theo level), **G2-N5** (mức đóng bảo hiểm), **G2-N6** (mức ăn ca khi tính thuế), **G2-N7** (số người phụ thuộc) — Đều đã có trong kho dữ liệu BigQuery của Chung, không cần xin thêm.

Nói gọn: **Milestone 2** (hoa hồng), **Milestone 3** (gọn bảng lương, thuế, bảo hiểm) và **Milestone 4** (gửi phiếu) đã xong.

## Phạm vi còn lại

Tất cả milestone phát triển (M2, M3, M4) đã hoàn thành. Milestone 1 (chấm công tự động) đã được **loại bỏ** — xem lý do bên dưới. Chỉ còn hai việc vận hành và hai task bảo trì kỹ thuật:

### Hoa hồng (COM) — đã hoàn thành

Ngày 13/8, anh Hiếu quyết định dev không sờ logic tính COM. Ngày 14/8, chị Thúy đề xuất mở lại cho nhóm có công thức rõ ràng (Sale IH1, IH2, Offline) vì đây là phần tốn thời gian nhất, đã có doanh số thì chỉ áp công thức. Minh và Chung đã triển khai theo hướng này: Chung dựng view tính COM trên BigQuery (`C_view_bang_thuong_com`), kết quả đổ thẳng vào bảng lương và đã đối soát 99% với bảng chị Trang. Nhóm đặc biệt (Leader, Manager, CS, GV) và Đào Trang vẫn nhập tay. Anh Hiếu chưa chính thức duyệt hướng này, nhưng phần việc đã hoàn thành.

### Chấm công tự động — BỎ

Trong buổi họp sáng 17/8 (Minh–Chung–Thu Trang), chị Trang bác bỏ rõ ràng phương án tự động hoá chấm công cho team sale, cho rằng "nhằng quá" (quá phức tạp). Chị cho biết:

- Chị có **file chấm công riêng**, tự theo dõi rồi chốt số cuối cùng — dev chỉ cần lấy bảng final dán lên sheet.
- Nghỉ phép trên DingTalk chỉ là **tin nhắn thông báo**, không phải đơn duyệt (approval form) — không có dữ liệu có cấu trúc để import.
- Chị **sửa số trực tiếp trên bảng lương**, không quay lại cập nhật file chấm công — nên không có nhu cầu đồng bộ hai chiều.

Do vậy toàn bộ G2-T1 đến G2-T5, G2-N1 đến G2-N3 được loại khỏi kế hoạch. Nếu sau này cần hỗ trợ phần chấm công, chỉ cần tạo một tab trên sheet để chị Trang dán file cuối cùng vào.

### Việc lẻ chờ vận hành

- **Gửi phiếu lương đợt đầu:** Cổng gửi phiếu (Gate) đã nối xong, app GMV đã deploy production. Chưa thông báo chị Trang là sheet đã sẵn sàng — cần thông báo để chị bấm "Gửi phiếu đang chờ" và kiểm tra phiếu trên app.

- **Ghi ngược trạng thái về sheet:** Khi nhân viên bấm "Xác nhận" hoặc "Yêu cầu xem xét" trên app, trạng thái đó cần ghi ngược về cột Trạng thái cuối trên sheet cho chị Trang theo dõi. Code backend đã build, chưa nối luồng Gate ngược (chờ kích hoạt gửi phiếu đợt đầu xong mới có dữ liệu để test).

## Nguồn dữ liệu

Tất cả nguồn dữ liệu cần thiết đã có đủ. Phần hoa hồng đã có trong BigQuery (cơ chế IH1/IH2/Offline đã thống nhất với chị Trang). Phần chấm công (G2-N1, N2, N3) không còn cần vì M1 đã bỏ — chị Trang tự chốt số chấm công và dán file cuối cùng.

## Danh sách công việc

> **Nguyên tắc xuyên suốt giữ nguyên:** phần TÍNH nằm ở BigQuery (các view), Google Sheet chỉ hiển thị kết quả cuối và là nơi chị Trang/Vân soi và xác minh.

### ~~Milestone 1 — Tự động hoá chấm công và xin nghỉ phép~~ ❌ BỎ

Loại khỏi kế hoạch sau buổi họp 17/8. Chị Trang giữ quyền chốt số chấm công thủ công; DingTalk phép chỉ là tin nhắn, không có dữ liệu để import. G2-T1 đến G2-T5 và G2-N1 đến G2-N3 không còn trong scope.

### Milestone 2 — Tự động tính hoa hồng (COM) ✅

Đã hoàn thành, scope thu hẹp so với plan gốc: chỉ tự động cho nhóm có công thức rõ ràng (Sale IH1, IH2, Offline); nhóm đặc biệt (Leader, Manager, CS, GV) và Đào Trang vẫn nhập tay.

- **G2-T6** ✅ — Chung đã thống nhất với chị Trang logic tính COM từng level, gồm IH1, IH2 và Offline.

- **G2-T7** ✅ — Chung dựng view tính COM trên BigQuery (`C_view_bang_thuong_com`), lấy doanh số từ app GMV, kết quả đổ thẳng vào bảng lương. Đã đối soát 99% với bảng chị Trang — chỉ lệch ở ba trường hợp dữ liệu HR (xem phần Tình trạng Giai đoạn 1).

### Việc lẻ chờ vận hành

- **Thông báo chị Trang** — Sheet bảng lương và cổng gửi phiếu đã sẵn sàng; cần thông báo chị Trang để bắt đầu kiểm tra và bấm gửi đợt đầu tiên. Sau khi gửi xong, nhân viên sẽ nhận phiếu trên app và bấm xác nhận/phản hồi.

- **G2-T12** — Ghi ngược trạng thái phản hồi của nhân viên từ app về cột Trạng thái cuối trên sheet Bảng lương, để chị Trang biết ai đã xác nhận, ai yêu cầu xem xét lại. Code backend đã build, chờ gửi phiếu đợt đầu xong mới có dữ liệu để nối và test.

- **Cập nhật script đối soát khi file chị Trang đổi layout** — Script so sánh hiện đọc cột xlsx theo vị trí cố định; nếu chị Trang thêm hoặc bớt cột thì cần cập nhật lại. Không gấp, chỉ sửa khi layout thật sự thay đổi.

## Mốc thời gian (cập nhật)

| Mốc | Nội dung | Thời điểm |
|-----|----------|-----------|
| ~~M0~~ | ~~Chốt kế hoạch GĐ2~~ | ✅ 7–8/8 |
| ~~—~~ | ~~Chờ GĐ1 khớp lệch = 0~~ | ✅ 19/8 (99%, ba trường hợp do dữ liệu HR) |
| ~~M3~~ | ~~Gọn bảng lương, thuế, bảo hiểm~~ | ✅ Hoàn thành trong GĐ1 |
| ~~M4~~ | ~~Gửi phiếu tự động~~ | ✅ Hoàn thành trong GĐ1 (qua app) |
| ~~M2~~ | ~~Hoa hồng tự động~~ | ✅ Hoàn thành (Chung dựng view BQ, đối soát 99%) |
| ~~M1~~ | ~~Chấm công + xin phép~~ | ❌ BỎ (họp 17/8: chị Trang giữ thủ công) |
| — | Thông báo chị Trang + gửi phiếu đợt đầu | Làm ngay khi sẵn sàng |

Nguyên tắc giữ nguyên: làm xong khâu này chạy ổn mới sang khâu tiếp. Không đặt hạn cứng cho từng khâu.

## Phân công

- **Minh** — ghi ngược phản hồi nhân viên (G2-T12), thông báo và hỗ trợ chị Trang kích hoạt gửi phiếu đợt đầu.

- **Chung** — hỗ trợ đối soát nếu 3 case lệch còn lại cần rà thêm số liệu.

## Ghi chú

- **Nguyên tắc kiến trúc giữ nguyên:** BigQuery làm phần tính (các view), Google Sheet chỉ hiển thị kết quả cuối và là nơi xác minh — không dựng lại công thức tính trên sheet.

- Milestone 2, 3 và 4 hoàn thành sớm hơn dự kiến nhờ được làm song song trong Giai đoạn 1. Milestone 1 (chấm công) bỏ theo ý chị Trang (họp 17/8). **Giai đoạn 2 hoàn thành.**

- Về lâu dài, bảng lương trên sheet sẽ được bỏ hẳn và chuyển thành tính năng trên app, nên không đầu tư quá sâu vào phần sheet.

- Xuất Excel theo phòng ban (mỗi team một file, mỗi nhân viên một tab riêng đúng mẫu phiếu lương chị Trang) và xem trước/tải PDF phiếu lương đã hoàn thành và commit vào repo code ngày 20/8.
