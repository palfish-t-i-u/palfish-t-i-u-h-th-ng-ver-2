# Hướng dẫn quản lý thông tin khi làm việc với Claude

> Dành cho: thành viên team dùng Claude Chat (web) để hỗ trợ công việc hàng ngày.
> Tác giả: Minh — dựa trên quy trình đang vận hành tại team.

---

## Vấn đề

Khi dùng Claude Chat để làm việc, hay gặp 2 tình huống:

1. **Cuộc trò chuyện phình to** — hỏi nhiều thứ trong 1 cuộc, Claude bắt đầu quên những gì nói ở đầu, trả lời lệch hoặc lặp lại.
2. **Mở cuộc mới thì mất sạch** — sang cuộc trò chuyện mới, Claude không nhớ gì hết, phải giải thích lại từ đầu.

Nguyên nhân gốc: **Claude không có bộ nhớ dài hạn.** Mỗi cuộc trò chuyện là một tờ giấy nháp — viết xong rồi vứt. Nếu không ghi chép lại, thông tin mất.

---

## Nguyên tắc cốt lõi

> **Claude = bàn làm việc tạm.** Sổ ghi chép của mình = kho lưu trữ thật.

Nghĩa là:
- Dùng Claude để suy nghĩ, phân tích, soạn thảo — nhưng **kết quả cuối** phải lưu ra ngoài (file, Google Docs, Notion, sổ tay...).
- Không bao giờ dựa vào việc "Claude sẽ nhớ" — Claude không nhớ.
- Cuộc trò chuyện nào cũng sẽ kết thúc. Thông tin quan trọng phải rời khỏi cuộc trò chuyện trước khi đóng.

---

## Hệ thống 3 tầng

Chia thông tin thành 3 loại, mỗi loại lưu ở một nơi:

### Tầng 1 — Sổ công việc (cập nhật hàng ngày)

Một file duy nhất, luôn cập nhật, chứa:
- Danh sách việc đang làm và trạng thái (chưa bắt đầu / đang làm / xong / nghẽn)
- Việc nào ưu tiên, việc nào chờ ai
- Deadline gần nhất

**Ví dụ:**

```
# Sổ công việc — Chung · cập nhật 12/08/2026

## Đang làm
- [ ] Tính lương tháng 7 — chờ chị Trang gửi bảng công (deadline 14/08)
- [x] Đối soát GMV tuần 05-11/08 — XONG, đã gửi anh Hiếu
- [ ] Tổng hợp báo cáo doanh thu Q2 — đang gom số từ Metabase

## Chờ người khác
- Chị Trang: bảng công tháng 7 (nhắc lại nếu chưa có trước 13/08)
- Anh Hiếu: duyệt mẫu báo cáo mới

## Tuần sau
- Chuẩn bị số liệu cho họp review tháng 8 (19/08)
```

**Quy tắc:**
- Cập nhật cuối mỗi ngày làm việc (hoặc nhờ Claude cập nhật giúp — xem phần Quy trình).
- Giữ ngắn — chỉ ghi "cái gì" và "trạng thái gì", không ghi chi tiết cách làm.
- Xóa việc đã xong quá 1 tuần ra khỏi sổ (hoặc chuyển xuống mục "Đã xong").

### Tầng 2 — Ghi chú theo dự án (cập nhật khi có thay đổi)

Mỗi dự án hoặc mảng công việc lớn có **một file riêng**, chứa:
- Bối cảnh: dự án này là gì, mục tiêu, ai liên quan
- Quyết định đã chốt (quan trọng — để không phải hỏi lại)
- Số liệu, công thức, quy tắc nghiệp vụ cần nhớ
- Link đến tài liệu gốc (sheet, Lark, Metabase...)

**Ví dụ:**

```
# Dự án: Tính lương PalFish

## Bối cảnh
- Tính lương cho sale PalFish VN, theo tháng
- Dữ liệu gốc: GMV trên hệ thống app + bảng công từ HR
- Công thức chốt: lương = lương cơ bản + hoa hồng (GMV × tỉ lệ theo bậc)

## Quyết định đã chốt
- 05/08: Tỉ giá quy đổi RMB→VND dùng 3700 cố định (anh Hiếu chốt)
- 01/08: Ngày công tính theo bảng chấm công HR, không tính ngày nghỉ phép

## Nguồn dữ liệu
- Bảng công: chị Trang gửi qua Lark cuối tháng
- GMV: query từ Metabase, dashboard "Doanh thu Sale tháng"
- Bậc hoa hồng: sheet "Chính sách lương 2026" trên Lark
```

**Quy tắc:**
- Mỗi khi có quyết định mới (ai chốt, ngày nào), ghi vào ngay — đây là loại thông tin hay quên nhất.
- Không cần dài — 1 trang là đủ. Nếu dài hơn 2 trang, tách thành 2 dự án.

### Tầng 3 — Bài học rút ra (ghi khi vấp phải)

Khi gặp một vấn đề khó và đã giải quyết xong, ghi lại:
- **Vấn đề:** chuyện gì xảy ra
- **Bẫy:** cách làm tưởng đúng nhưng sai
- **Cách giải:** cách đã làm đúng
- **Quy tắc:** lần sau gặp tình huống tương tự thì làm gì

**Ví dụ:**

```
# Bài học: Lệch số GMV giữa Metabase và app

Vấn đề: Báo cáo tháng 6 bị lệch 12 triệu so với số trên app.
Bẫy: Tưởng Metabase sai → chạy lại query 3 lần, mất nửa ngày.
Cách giải: Hóa ra app tính theo ngày kích hoạt, Metabase tính theo ngày thanh toán. Hai nguồn đúng nhưng dùng mốc khác nhau.
Quy tắc: Khi so số giữa 2 nguồn, kiểm tra MỐC NGÀY trước — hỏi "ngày nào là ngày nào?" trước khi kết luận sai số.
```

**Quy tắc:**
- Chỉ ghi khi vấn đề **không hiển nhiên** — nếu lần sau gặp lại mà có thể tự giải trong 5 phút thì không cần ghi.
- Phần "Quy tắc" phải là 1 câu kiểm tra được (có thể làm theo), không phải lời khuyên chung chung kiểu "cẩn thận hơn".

---

## Quy trình hàng ngày

### Mở đầu ngày (2 phút)

Mở cuộc trò chuyện mới trên Claude, paste vào:

```
Đây là sổ công việc hiện tại của mình:

[paste nội dung Sổ công việc — Tầng 1]

Hôm nay mình cần tập trung vào: [việc cụ thể].
```

Nếu việc hôm nay liên quan đến dự án cụ thể, paste thêm ghi chú dự án (Tầng 2) vào.

**Mẹo:** Không cần paste hết mọi thứ — chỉ paste những gì liên quan đến việc hôm nay. Ít context = Claude trả lời chính xác hơn.

### Trong ngày (làm việc bình thường)

- Hỏi Claude bất kỳ điều gì cần.
- Khi Claude giúp ra được kết quả tốt (bảng tính, phân tích, bản nháp...) → **copy kết quả ra file lưu trữ ngay**, đừng để trong cuộc trò chuyện.
- Nếu cuộc trò chuyện bắt đầu dài (hơn ~30 lượt hỏi-đáp), nên mở cuộc mới.

### Cuối ngày (3 phút)

Nhờ Claude giúp cập nhật sổ công việc:

```
Hôm nay mình đã làm:
- [liệt kê ngắn gọn những gì đã làm]
- [vấn đề gặp phải, nếu có]
- [quyết định mới, nếu có]

Giúp mình cập nhật sổ công việc dựa trên tiến độ trên. Giữ format cũ.
```

Copy kết quả Claude trả ra, ghi đè vào file Sổ công việc.

### Sau khi họp

Nếu có ghi âm cuộc họp:
1. Upload lên AssemblyAI để tạo transcript
2. Tải file JSON về
3. Đưa cho Claude đọc (dùng skill `meeting-transcript` nếu có, hoặc đơn giản paste nội dung + nhờ "tóm tắt họp và liệt kê việc cần làm")
4. Từ kết quả, cập nhật Sổ công việc + Ghi chú dự án nếu có quyết định mới

---

## Khi nào mở cuộc trò chuyện mới?

| Tình huống | Nên mở mới? |
|---|---|
| Chuyển sang chủ đề hoàn toàn khác | Có |
| Cuộc hiện tại đã hơn 30 lượt hỏi-đáp | Có |
| Claude bắt đầu trả lời lệch / quên ngữ cảnh | Có |
| Vẫn cùng chủ đề, chưa đến 20 lượt | Chưa cần |
| Cần Claude nhớ quyết định vừa chốt 5 phút trước | Chưa cần |

**Khi mở cuộc mới:** luôn paste lại context cần thiết (sổ công việc + ghi chú dự án liên quan). Đừng giả định Claude biết bất cứ gì từ cuộc trước.

---

## Nâng cao: dùng Projects (nếu có Claude Pro)

Claude Pro có tính năng **Projects** — cho phép đính kèm tài liệu cố định, Claude tự đọc mỗi lần mở cuộc trò chuyện trong project đó.

Cách dùng:
1. Tạo 1 Project cho mảng công việc (ví dụ: "PalFish — Lương & Doanh thu").
2. Upload vào phần Knowledge:
   - Sổ công việc (cập nhật thường xuyên)
   - Ghi chú dự án liên quan
   - File bài học rút ra (nếu có)
3. Viết Project Instructions ngắn gọn, ví dụ:
   ```
   Mình là Chung, phụ trách tổng hợp số liệu và tính lương cho team PalFish VN.
   Các file đính kèm là sổ công việc và ghi chú dự án của mình.
   Khi mình hỏi, ưu tiên dựa trên thông tin trong các file đó.
   Cuối mỗi cuộc trò chuyện, nhắc mình cập nhật sổ công việc nếu có thay đổi.
   ```
4. Mỗi cuộc trò chuyện trong project này, Claude sẽ tự biết context mà không cần paste lại.

**Lưu ý:** File trong Project Knowledge không tự cập nhật — phải vào thay file mới khi sổ công việc thay đổi.

---

## Nâng cao: dùng Custom Instructions (miễn phí)

Nếu chưa có Pro, Claude Chat vẫn có mục **Custom Instructions** (Settings → Personalization). Đây là nơi viết 1 đoạn ngắn để Claude luôn nhớ mình là ai:

```
Mình là Chung, làm tổng hợp dữ liệu và tính lương cho PalFish VN.
Mình hay làm việc với: bảng tính, báo cáo doanh thu, đối soát số liệu.
Khi trả lời, ưu tiên cách làm thực tế, dùng công thức đơn giản.
Cuối mỗi cuộc trò chuyện, nhắc mình ghi lại kết quả quan trọng ra ngoài.
```

Đoạn này Claude sẽ đọc ở **mọi cuộc trò chuyện**, kể cả cuộc mới.

---

## Lưu file ở đâu?

Tuỳ thói quen, chọn một trong:

| Công cụ | Ưu điểm | Nhược điểm |
|---|---|---|
| Google Docs | Quen thuộc, truy cập mọi nơi, chia sẻ dễ | Không tự cấu trúc, phải tự sắp xếp |
| Notion | Cấu trúc tốt, database, template | Cần thời gian làm quen |
| File .txt trên máy | Đơn giản nhất, mở nhanh | Không đồng bộ, dễ mất nếu máy hỏng |
| Lark Docs | Team đang dùng, chia sẻ nội bộ tiện | Tìm kiếm kém hơn Notion/Docs |

**Khuyến nghị:** bắt đầu bằng thứ đơn giản nhất (1 file Google Docs cho Sổ công việc). Phức tạp hoá sau khi đã thành thói quen.

---

## Tóm tắt

1. **Claude không nhớ gì** — kết quả quan trọng phải lưu ra ngoài.
2. **3 loại file:** Sổ công việc (hàng ngày) · Ghi chú dự án (khi có thay đổi) · Bài học (khi vấp phải).
3. **Đầu ngày:** paste sổ công việc vào cuộc trò chuyện mới.
4. **Cuối ngày:** nhờ Claude cập nhật sổ, copy kết quả ra.
5. **Sau họp:** transcript → tóm tắt → cập nhật sổ + ghi chú.
6. **Cuộc trò chuyện dài = kẻ thù.** Mở mới khi chuyển chủ đề hoặc quá 30 lượt.
