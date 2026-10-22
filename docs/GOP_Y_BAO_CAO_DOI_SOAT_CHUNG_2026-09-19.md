# Góp ý báo cáo đối soát doanh thu

Chung ơi, mình đọc kỹ báo cáo + 2 file Excel, và đào thêm 79 ca tồn (47 "chưa rõ" + 32 "nghi vấn") xuống tận DB để chốt cho chắc. Báo cáo của Chung làm rất chắc, số liệu đáng tin — phần dưới chủ yếu là kết quả đào tiếp phần đuôi, cộng 1 chỗ nhỏ cần sửa.

## 1. Sửa chỗ "Josh nói không khớp" → là Eric

Đầu Phần A đang ghi "sếp Josh phản hồi là không khớp". Thực ra người nói không khớp là **Eric** (Eric giữ kho dữ liệu, gửi file đối soát). Josh chỉ chuyển đạt lại. Sửa cho đúng người thôi, không ảnh hưởng phân tích.

## 2. Đào tiếp 79 ca tồn — phần lớn vô hại

Mình soi từng nhóm, đối chiếu thẳng App + All File. Kết quả: nghe "47 chưa rõ + 32 nghi vấn" thì to, nhưng **tiền thật sự cần xử lý chỉ khoảng 35 triệu**, còn lại không làm lệch đồng nào:

| Nhóm | Số ca | Thực chất | Lệch tiền |
|---|---|---|---|
| Rác 0đ (SĐT giả tăng dần …646/647/648) | 34 | Dòng nhập nháp, không phải đơn | 0 |
| Ô UID ghi nhầm thành SĐT | 21 | Khớp SĐT+tiền → cùng đơn, có ở cả 2 bên | 0 |
| "Nghi trùng" 2022–2023 | 11 | Khách mua lặp thật, chỉ đá nhầm ngày | 0 |
| Cùng đơn nhưng UID lệch/trống trên Sheet | ~8 | Có ở cả 2 bên, máy không ghép được | 0 |
| **Trùng do import chỉ-thêm** | 2 | Hiền sửa đơn → import đẻ dòng mới | **~35tr** |

### Cách mình soi 3 nhóm này (để Chung tự kiểm lại)

Mình xuất phát từ chính tab "Cần đối chiếu thêm (173)" của Chung, lọc 79 ca chưa gỡ. Có 3 nhóm mình xử lý kỹ/khác báo cáo, ghi rõ cách làm để Chung tái lập:

- **34 ca "rác 0đ"** *(báo cáo đang để "không tìm thấy ở DB" — đây là nhận định thêm của mình)*: trong 45 ca "Sheet had no bank date — no DB match", mình thấy 34 ca có **cột Amount = 0** và **cột Phone là số giả tăng dần** (cùng 1 khách có 2–3 dòng, SĐT chỉ khác chữ số cuối: …646/…647/…648). → Là dòng nhập nháp, không phải đơn. Chung lọc 2 cột Amount + Phone ngay trong tab đó là thấy.

- **21 ca "UID khác"** *(đúng kết luận của Chung "khớp SĐT+tiền, UID khác" — mình chỉ thêm chi tiết)*: so thêm cột UID với cột Phone → 13/21 ca ô UID chính là số điện thoại (ghi nhầm ô). Không phải đơn lạc, chỉ là ô UID bẩn.

- **11 ca "nghi trùng"** *(chỗ này mình kết LUẬN KHÁC Chung — nhờ Chung kiểm lại)*: Chung đang nghi trùng lặp; mình query thẳng bảng `so_doanh_thu` cho từng UID (`SELECT ... WHERE uid='...' ORDER BY ngay_tien_ve`) thì thấy mỗi khách có **cả chục đơn rải nhiều năm, nhiều mức giá khác nhau** (khách mua lặp đều), và các cặp "trùng" là **cùng gói nên cùng giá, cách nhau vài tháng** — giống mua lại hơn là nhập trùng. → Mình nghiêng về **mua lặp thật**. Nhưng để chắc 100%, Chung nên **đếm bên Sheet xem mỗi cặp có 1 hay 2 dòng**: Sheet có 2 dòng = mua thật; Sheet chỉ 1 = DB trùng. Mình chưa đối chiếu được số dòng bên Sheet nên để mở cho Chung chốt.

## 3. Chốt phần đuôi: chỉ ~35 triệu là trùng thật, còn lại đều có đủ 2 bên

Mình soi 13 ca "chưa rõ" còn tiền, đối chiếu App + All File từng đơn. Kết quả: **4 đơn tưởng "chỉ có ở DB" thực ra đều có trên cả Sheet lẫn App — chỉ là UID lệch hoặc để trống nên máy không ghép được.** Chúng KHÔNG lệch tiền:

| Mã đơn | Số tiền | Vị trí trên Sheet | Vì sao không ghép được |
|---|---|---|---|
| CC-1346-002 | 4.790.500 | dòng 16154 | UID trên Sheet (3317054741) khác UID App (3317112365) |
| CC-1747-001 | 8.700.000 | dòng 16552 | cùng UID, chỉ lệch ngày (16 vs 17/09) |
| CC-1477-002 | 9.010.000 | dòng 16311 (bé Yến) | UID trên Sheet (3289528586) khác UID App (3317340328) |
| CC-0994-002 | 17.490.000 | dòng 16314 (bé Mia) | Sheet để trống cả tên lẫn UID |

Bản chất lệch UID ở đây (theo xác nhận nghiệp vụ): mấy khách này có **2 UID — một tài khoản HỌC THỬ, một tài khoản HỌC THẬT**. All File ghi UID học thử (bé Khánh Linh `3317054741`, bé Yến `3289528586`), còn App ghi UID học thật (`3317112365`, `3317340328`) — cả hai đều là **cùng một người**, đơn không hề trùng hay thiếu. Lưu ý đây là **ca hiếm**: thường khách học thử ở tài khoản nào thì đặt đơn và lên L8 luôn ở tài khoản đó nên UID khớp; chỉ số ít mới tách 2 UID như vầy (hay rơi vào đơn REFER).

**Chỉ 2 ca là trùng thật, DB đang dư ~35 triệu** — Hiền sửa đơn trên Sheet nhưng import tạo dòng MỚI thay vì cập nhật, nên DB giữ cả bản cũ:

| UID | Ngày | Dòng cũ (DB dư, nên xoá) | Dòng đúng (Sheet đang có) | Hiền sửa lúc |
|---|---|---|---|---|
| 3312083253 | 29/05/2026 | 17.820.000 (sale Bui Lam Linh) | 17.320.000 (sale Dao Ngoc Lan Anh) | đổi sale ngày 11/06 |
| 3312790940 | 24/06/2026 | 17.652.000 | 17.703.600 | sửa số ngày 25/06 |

## 4. Hai gốc rễ thật

Soi kỹ thì phần đuôi lệch nhau chủ yếu vì 2 chuyện:
1. **Ghép theo UID không phải lúc nào cũng đúng.** Thường thì UID khớp giữa 2 nguồn. Nhưng có số ít khách dùng **2 UID (học thử vs học thật)** mà App và All File ghi khác tài khoản nhau (hay gặp ở đơn REFER), hoặc UID để trống một bên — thế là cùng 1 đơn bị đá thành "chỉ có 1 bên". → Ghép theo **mã đơn (Course code CC-xxxx)** thì chắc hơn, không phụ thuộc UID.
2. **Import chỉ-thêm, không cập nhật** → mỗi lần Hiền sửa đơn là đẻ thêm 1 dòng trùng.

Cả hai đều được xử lý khi thống nhất về 1 nguồn (DingTalk → All File) + luồng import thành thêm/cập nhật/xoá và có mã đơn làm khoá. Việc tay lúc này chỉ còn xoá 2 dòng trùng ~35 triệu.

---

Tóm lại: báo cáo chắc, kết luận 0,46% đúng. Sau khi soi tận từng đơn, phần "chưa rõ" gần như tan hết — chỉ còn **2 dòng trùng ~35 triệu** cần xoá, còn lại đều có đủ 2 bên (lệch UID chứ không mất tiền). Ngoài ra sửa giúp tên Eric ở đầu Phần A.
