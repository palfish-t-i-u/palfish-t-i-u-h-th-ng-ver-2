# Kế hoạch thực hiện — GĐ2 Tự động hoá phiếu lương

Chốt tại buổi họp sáng ngày 7/8/2026 giữa Minh và Chung. Anh Hiếu không dự buổi này; hai người tự chốt nội dung theo đúng thứ tự anh Hiếu đã thống nhất từ trước là làm xong Giai đoạn 1 rồi mới hoạch định Giai đoạn 2.

## Mục tiêu Giai đoạn 2

Sau khi Giai đoạn 1 chạy song song và cho ra bảng lương khớp với file của chị Trang 100%, Giai đoạn 2 sẽ để máy làm thay những khâu hiện đang phải nhập liệu bằng tay. Cách làm là tối ưu dần từng khâu một, không ôm hết cùng lúc, với mục tiêu cuối cùng là giảm tải công việc thủ công cho bộ phận nhân sự (chị Trang).

## Phạm vi — bốn khâu sẽ tối ưu

Buổi họp thống nhất tập trung vào bốn khâu đang tốn nhiều công tay nhất:

1. **Chấm công và xin nghỉ phép** — để leader và nhân sự tự khai báo trên một biểu mẫu chung, thay cho việc chị Trang phải ngồi lọc tay từng trường hợp đi muộn, làm bù.
2. **Hoa hồng (COM)** — để máy tự tính dựa trên doanh số đã có sẵn trong app GMV, thay cho việc đội IH2 tính tay.
3. **Bảng lương** — gom về một sheet gọn gàng, toàn bộ dữ liệu các tháng được lưu trong kho BigQuery thay vì chất đống trên sheet.
4. **Gửi phiếu lương** — hệ thống tự gửi cho từng người qua cả Zalo lẫn email, rồi tự gom phản hồi về cho chị Trang.

Riêng khâu đối soát và xác nhận (hai nút "Xác nhận" và "Yêu cầu xem xét lại" trên phiếu lương) đã được đưa vào kế hoạch Giai đoạn 1 ở mục G1-T15, nên Giai đoạn 2 không nhắc lại.

## Nguồn dữ liệu và thông tin cần xin

Phần lớn phải xin từ chị Trang và chị Vân. Đây là những việc còn thiếu, chưa có thì chưa bắt tay làm được; một số mục là nối tiếp từ Giai đoạn 1.

- **G2-N1** — Chị Trang và các sale leader duyệt giúp biểu mẫu chấm công và xin phép, xác nhận các cột đã phản ánh đủ những thông tin hai bên vẫn trao đổi tay hằng ngày hay chưa, còn thiếu gì cần bổ sung thêm.
- **G2-N2** — Số ngày phép của từng người (đây là thông tin cá nhân), cùng quy tắc cộng dồn phép và thời điểm reset về không (cuối tháng hay cuối năm).
- **G2-N3** — Cách ghi nhận việc xin nghỉ phép của khối back office trên DingTalk, vì hiện tại nó chỉ hiện ra dưới dạng một thông báo chứ không phải một file có thể đọc lại được. Cần hỏi lại chị Trang xem đây có phải là một đơn duyệt (approval) hay không.
- **G2-N4** — Bảng phần trăm hoa hồng chi tiết theo từng level cho đội IH2. Khung logic đã rõ từ Giai đoạn 1, chỉ còn thiếu bảng phần trăm cụ thể.
- **G2-N5** — Mức lương đóng bảo hiểm ghi trong hợp đồng của từng người, và tỷ lệ bảo hiểm áp cho nhân viên chính thức so với người chưa chính thức.
- **G2-N6** — Chị Vân xác nhận cách áp khoản ăn ca khi tính thuế: bảng của chị Vân dùng mức 730.000đ trong khi bảng của chị Trang là 660.000đ, cần thống nhất trừ theo mức nào.

## Danh sách công việc

### Milestone 1 — Tự động hoá chấm công và xin nghỉ phép (ưu tiên cao nhất)

Đây là khâu ngốn thời gian nhất hiện nay. Buổi họp thống nhất sẽ không nối thẳng máy chấm công vào DingTalk để xác nhận đi muộn: nếu làm vậy, hệ thống sẽ tự động tính phạt tiền người đi muộn, phá vỡ cách làm hiện tại của chị Trang vốn không soi kỹ khoản đi muộn. Thay vào đó, giải pháp là một biểu mẫu để người phụ trách chủ động khai báo, và chỉ khai những trường hợp có thay đổi chứ không khai lại toàn bộ nhân sự.

- **G2-T1** — Soạn một Google Sheet chấm công gồm ba tab. Tab thứ nhất "Xác nhận công" để sale leader khai báo hằng ngày ai đi muộn, ai làm bù công, ai bù doanh số. Tab thứ hai "Xin nghỉ phép" để ghi nhận đơn nghỉ: nhân viên sale xin qua leader và leader xác nhận rồi điền lên, còn khối back office thì chị Trang điền; hai nhóm được phân biệt bằng một cột "phòng ban". Tab thứ ba "Đầu nối dữ liệu" để kéo các thông tin cá nhân, chẳng hạn số ngày phép còn lại, từ kho dữ liệu vào sheet.
- **G2-T2** — Đưa biểu mẫu trên cho chị Trang và các sale leader duyệt, chốt lại các cột cho đúng (gắn với mục G2-N1).
- **G2-T3** — Dựng phần tính phép: chỉ nhân viên chính thức mới có phép, phép được cộng dồn theo tháng và reset vào cuối kỳ; đồng thời nối số ngày phép còn lại từ kho dữ liệu ra sheet để hệ thống tự trừ.
- **G2-T4** — Đấu nối biểu mẫu với kho dữ liệu theo hai chiều: dữ liệu công và phép từ sheet chảy vào kho, ghép thẳng với dữ liệu máy chấm công mà không còn phải qua tay chị Trang; ngược lại, số phép còn lại từ kho chảy ra sheet.
- **G2-T5** — (làm sau) Nối trực tiếp máy chấm công cùng lịch nghỉ phép để hệ thống tự phát hiện trường hợp quên chấm công: ngày nào máy chấm công trống mà lịch phép cũng trống thì coi như quên, gắn cờ để hỏi lại. Việc này khó vì dữ liệu nghỉ phép trên DingTalk chỉ là một thông báo, nên có thể để lại làm sau.

### Milestone 2 — Tự động tính hoa hồng (COM)

- **G2-T6** — Chung làm việc với chị Trang để thống nhất trọn vẹn logic tính hoa hồng theo từng level, gồm các nhóm IH1, IH2 và bán offline (gắn với mục G2-N4).
- **G2-T7** — Minh chuyển logic đó thành công thức tính trên sheet, lấy số liệu doanh số trực tiếp từ app GMV, và cho kết quả hoa hồng đổ thẳng vào bảng lương chứ không để ở một tab riêng.

### Milestone 3 — Gọn lại bảng lương và hoàn thiện phần thuế, bảo hiểm

- **G2-T8** — Làm bảng lương thành một sheet duy nhất, chỉ chứa khung định dạng và công thức cố định. Toàn bộ dữ liệu của mọi tháng được chốt và lưu trong kho BigQuery; sheet chỉ hiển thị đúng tháng đang cần và xuất Excel của riêng tháng đó, nhờ vậy sheet luôn nhẹ. Sở dĩ bỏ cách để mỗi tháng một tab hoặc dồn tất cả vào một tab là vì sau khoảng ba tháng, số dòng lên hơn một nghìn khiến sheet nặng và khó thao tác.
- **G2-T9** — Cố định công thức lương cứng: lương cứng chỉ phụ thuộc vào lương cơ bản ghi trong hợp đồng cộng với phần KPI vượt, không phụ thuộc lương cứng của tháng trước, nên công thức tháng nào cũng giống nhau.
- **G2-T10** — Hoàn thiện phần thuế và bảo hiểm: bổ sung phần xác định ai là nhân viên chính thức để áp đúng tỷ lệ bảo hiểm (gắn với G2-N5), và áp mức ăn ca 730.000đ khi tính thuế theo bảng của chị Vân (gắn với G2-N6).

### Milestone 4 — Tự động gửi phiếu lương

- **G2-T11** — Hệ thống tự gửi phiếu lương cho từng người qua cả Zalo lẫn email, tận dụng lại phần gửi thông báo đã có sẵn.
- **G2-T12** — Tự gom phản hồi của nhân viên, dù họ trả lời qua Zalo hay email, rồi đẩy về một mối cho chị Trang xử lý.

## Mốc thời gian

Giai đoạn 2 chỉ khởi động sau khi Giai đoạn 1 chạy khớp không lệch một đồng, tức là sau khi chạy song song trong chu kỳ lương tháng 9 và dự kiến go-live từ tháng 10. Những việc dựng nền như soạn biểu mẫu hay thống nhất logic hoa hồng có thể làm song song ngay trong tháng 9, vì chúng không đụng đến con số của Giai đoạn 1; còn phần triển khai thật thì làm từ tháng 10 trở đi. Không đặt hạn cứng cho từng khâu — làm xong khâu này chạy ổn mới sang khâu tiếp theo.

| Mốc | Nội dung | Thời điểm |
|---|---|---|
| M0 | Chốt kế hoạch Giai đoạn 2 (chính là việc này) | 7–8/8 |
| — | Chờ Giai đoạn 1 khớp lệch = 0 (chạy song song chu kỳ tháng 9) | (chặn) |
| M1 | Tự động hoá chấm công và xin nghỉ phép | sau Giai đoạn 1 |
| M2 | Tự động tính hoa hồng | sau M1 |
| M3 | Gọn bảng lương, hoàn thiện thuế và bảo hiểm | sau M1 |
| M4 | Tự động gửi phiếu lương | sau M3 |

## Phân công gợi ý

- **Minh** phụ trách phần code: biểu mẫu và sheet chấm công, đấu nối kho dữ liệu hai chiều, công thức tính hoa hồng, bảng lương một sheet, và tích hợp gửi phiếu.
- **Chung** phụ trách phần dữ liệu và nghiệp vụ: thống nhất logic hoa hồng, thuế và phép với chị Trang và chị Vân, duyệt biểu mẫu, và đối soát số liệu.

## Ghi chú

- Về lâu dài, bảng tính lương trên sheet sẽ được bỏ hẳn và chuyển thành một tính năng trong app, nên không đầu tư quá sâu vào phần sheet.
- Vài việc lề ngoài phạm vi phiếu lương: Chung gửi Minh danh sách thông tin cần đăng ký cho app riêng (GMV); còn trường hợp khách hàng không hiện trên app GMV thì đã xác nhận không phải lỗi, mà do khoá học chưa được kích hoạt.
