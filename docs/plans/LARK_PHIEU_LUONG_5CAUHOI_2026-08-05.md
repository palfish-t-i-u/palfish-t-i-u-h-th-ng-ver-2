# TỰ ĐỘNG HOÁ PHIẾU LƯƠNG — TRẢ LỜI 5 YÊU CẦU CỦA ANH HIẾU

> **Cách đọc:** Doc này sắp xếp lại đúng theo 5 mục anh Hiếu giao trên Zalo. Mỗi mục là một câu trả lời trực tiếp. Nội dung dựa trên **2 file Excel thật** — bảng lương chị Trang (tháng 3→7) và file tính thuế chị Vân — được ưu tiên hơn ghi chép tay trong họp.
>
> **Đội làm:** Minh (developer chính, code toàn bộ) · Chung (DA, làm chủ dữ liệu & logic, không code).

**Trạng thái 5 mục:** ✅ Mục 0–3 xong · 🟡 Mục 4 có wireframe sơ bộ (chờ team review bản hiện tại rồi chốt).

---

## MỤC 0 — MỤC TIÊU: GIẢI QUYẾT VẤN ĐỀ GÌ CHO BUSINESS

**Vấn đề hiện tại:** làm lương mất **vài ngày**, dữ liệu nằm rải rác ở nhiều file Excel rời của từng người (Trang một file, Vân một file) → chép tay qua lại, dễ sai lệch, khó kiểm tra, mỗi phòng một con số.

**Mục tiêu:** gom tất cả về **một chỗ duy nhất trên app**, để:
- Ra bảng lương **trong vòng 1 ngày** (thay vì vài ngày).
- Hết cảnh chép tay giữa file của Trang và file của Vân.
- Ai cũng nhìn **cùng một con số** — hết chuyện "lệch số" giữa các phòng.

**Cách đi (anh Hiếu chốt) — 2 giai đoạn, không cầu kỳ ngay:**
1. **GĐ1 — Làm giống hệt Excel hiện tại.** App tính ra kết quả trùng khít 100% file Trang. Chạy song song 1 tháng, đối chiếu **không lệch một đồng** rồi mới đi tiếp.
2. **GĐ2 — Cho máy làm thay khâu nhập liệu.** Nối máy chấm công, nhân viên tự xin phép trên app, tự tính hoa hồng / thuế, tự gửi phiếu.

---

## MỤC 1 — WIREFRAME CÔNG VIỆC HIỆN TẠI CỦA CHỊ TRANG

Quy trình mỗi tháng của chị Trang (giữ nguyên bảng gốc):

| # | Tên tác vụ | Thời gian hoàn thành | Ghi chú |
|---|---|---|---|
| 1 | Chốt công + doanh số | Mùng 1 | Lấy chấm công từ máy + doanh số sale; lọc tay ca máy ghi thiếu / làm bù |
| 2 | Ra bảng lương trước thuế (gross) | Mùng 1 | Cộng phụ cấp + hoa hồng; song song chị Vân tính thuế & bảo hiểm trên file riêng |
| 3 | Nhân viên xem lại bảng lương và fee | Mùng 2–3 | Ai thấy công/lương sai thì báo lại qua Zalo, Trang chỉnh |
| 4 | Gửi phiếu lương sau thuế cho mọi người | Mùng 4 | Xuất phiếu từng người, gửi tay qua Zalo (trước gửi email nhưng tốn phí) |
| 5 | Gửi lương cho mọi người | Mùng 5 | Chi lương cứng (lương công + phụ cấp − thuế − bảo hiểm) |
| 6 | Thanh toán tiền hoa hồng | Ngày 25 hàng tháng | Thưởng doanh số của sale, tách riêng đợt cho kế toán dễ theo dõi |

Nhìn theo dòng thời gian:

```
 Mùng 1          Mùng 2–3         Mùng 4          Mùng 5         Ngày 25
 Chốt công       Nhân viên        Gửi phiếu       Chi LƯƠNG      Chi HOA HỒNG
 + doanh số      soi lại, sai     lương           CỨNG
 Ra bảng gross   thì báo (Zalo)   từng người
```

---

## MỤC 2 — GUIDELINE CÁC STEP HIỆN TẠI (NGUỒN + LOGIC)

Mỗi bước ghi rõ **lấy dữ liệu ở đâu (Nguồn)** và **tính theo quy tắc nào (Logic)**.

### Bước 1 — Mùng 1: Chốt công & doanh số
- **Nguồn:** ① máy chấm công (file thô) · ② doanh số bán hàng của sale (App GMV / sổ doanh thu) · ③ hồ sơ nhân sự (lương cơ bản theo từng tháng — sale hay đổi).
- **Logic:**
  - Công chuẩn = **24 ngày/tháng** (tháng ít ngày làm → chọn **23**).
  - **Lọc tay** ca máy ghi thiếu / làm bù cuối tuần — *ngày thừa chỉ tính khi Sale Leader xác nhận "làm bù"*; đi cuối tuần chỉ để giữ doanh số → không tính công.
  - Lương công (chính thức) = Lương cơ bản ÷ công chuẩn × số ngày công. Đi thừa (25–26) **không cap ở 24**, trả theo tỉ lệ vượt.
  - Thử việc × **85%** (⚠ Trang nói miệng 80% — cần chốt lại). Part-time = đơn giá giờ × số giờ.

### Bước 2 — Mùng 1: Ra bảng lương trước thuế (gross)
- **Nguồn:** kết quả Bước 1 + bảng phụ cấp + bảng level hoa hồng (COM).
- **Logic:**
  - Cộng **phụ cấp** theo ngày công thực đi: ăn trưa 660k, máy tính 700k, xe + trách nhiệm (gộp, khai tay).
  - Cộng **hoa hồng (COM)** của sale theo level.
  - Cộng/trừ **bù tiền** (truy lương thiếu / phạt lỗi).
  - **Gross = lương công + phụ cấp + COM + bù tiền.**
- **Song song — chị Vân (kế toán):** nhận bảng gross → tính **thuế TNCN + bảo hiểm** trên file Excel riêng → chép ngược con số thuế về bảng Trang.
  - *Thuế:* giảm trừ bản thân **15,5tr** + mỗi người phụ thuộc **6,2tr** (mức luật mới 01/01/2026); miễn phần ăn trưa (≤730k) + điện thoại; bậc luỹ tiến. Thử việc/CTV = thuế phẳng **10%**.
  - *Bảo hiểm:* chỉ trừ nhân viên chính thức, **10,5%** trên **mức đóng ghi trong hợp đồng** (không phải lương thực nhận).
  - 👉 **Đây chính là chỗ "2 file rời chép tay qua lại".**

### Bước 3 — Mùng 2–3: Nhân viên soi lại + fee
- **Nguồn:** bảng lương nháp gửi từng người.
- **Logic:** nhân viên tự kiểm công/lương, sai thì báo qua Zalo, Trang chỉnh tay.

### Bước 4 — Mùng 4: Gửi phiếu lương sau thuế
- **Nguồn:** bảng đã chốt (gross − thuế − bảo hiểm).
- **Logic:** xuất phiếu lương từng người (hiện dùng AutoCrat + Google Doc) → **gửi tay qua Zalo cho từng người** (trước gửi email nhưng tốn phí).

### Bước 5 — Mùng 5: Chi lương cứng
- **Nguồn:** bảng chốt.
- **Logic:** lương công + phụ cấp − thuế − bảo hiểm; xuất file chuyển khoản ngân hàng.

### Bước 6 — Ngày 25: Chi hoa hồng
- **Nguồn:** COM đã tính ở Bước 2.
- **Logic:** tách riêng đợt chi để kế toán dễ theo dõi.

> Chi tiết công thức đầy đủ (bậc thuế, các khoản nhập tay, part-time…) ở **Phụ lục A** cuối doc.

---

## MỤC 3 — NHỮNG CHỖ CÓ THỂ ĐỂ MÁY LÀM THAY (TỐI ƯU)

| Khâu đang làm tay | Vất vả ở đâu | Hướng để máy làm thay |
|---|---|---|
| Xuất chấm công rồi **sửa lỗi máy bằng tay** | Ngốn thời gian nhất | **GĐ2:** nối thẳng máy chấm công + nhân viên tự xin phép/báo làm bù trên app → dữ liệu công sạch sẵn |
| Tra **lương cơ bản** từng người | Lương đổi theo tháng (sale), dễ tra nhầm | Lưu hồ sơ nhân sự có lịch sử lương theo tháng → máy tự lấy đúng tháng |
| Tính **hoa hồng** (IH2 tính tay) | Công thức nhiều tầng | Máy tự tính theo quy tắc của Trang |
| Chị Vân tính **thuế** rồi chép tay sang | 2 file rời, dễ lệch | Máy tự tính thuế trong app, Vân chỉ kiểm & chốt |
| Đánh dấu **ai lên chính thức** để trừ BH | Nhớ/soát tay | Lưu ngày lên chính thức → máy tự áp bảo hiểm đúng tháng |
| Xuất **phiếu lương** từng người | Thủ công, chậm | Máy tự tạo phiếu (PDF) và lưu lại |
| **Gửi phiếu qua Zalo** từng người | Cực tốn công, không bảo mật | Máy tự gửi mỗi người qua **cả Zalo lẫn email**, ai phản hồi kênh nào thì tự gom về cho Trang |
| Xuất **file chuyển khoản** ngân hàng | Tay | Máy xuất sẵn 2 đợt: lương cứng (mùng 5) + hoa hồng (mùng 25) |

---

## MỤC 4 — WIREFRAME LUỒNG MỚI (SAU TỐI ƯU)

> 🟡 **Trạng thái:** bản step-level dưới đây là hướng đi. Wireframe chi tiết (màn hình app) đã có bản nháp — **chờ team review bản hiện tại xong mới vẽ chi tiết & chốt với chị Trang.**

Luồng mới rút gọn còn **3 điểm chạm người thật** (còn lại máy làm):

```
 [1] MÁY GOM DỮ LIỆU          [2] NGƯỜI CHỐT           [3] MÁY GỬI & CHI
 ─────────────────────        ──────────────────       ────────────────────
 • Máy chấm công → app        • Trang: xem & chốt      • Máy tạo phiếu PDF
 • Nhân viên tự xin phép/       bảng gross             • Tự gửi Zalo + email
   báo làm bù trên app        • Vân: xem & chốt          + gom phản hồi
 • Doanh số sale tự về          thuế/bảo hiểm          • Xuất file CK 2 đợt
 • Máy ráp bảng lương nháp                                (lương / hoa hồng)
   (lương+phụ cấp+COM+thuế)
```

So với 6 bước tay hiện tại: người chỉ còn **2 việc kiểm-và-chốt** (Trang gross, Vân thuế), mọi khâu nhập liệu và gửi phiếu để máy làm. Đây là hình dạng để **GĐ2** hướng tới; GĐ1 vẫn giữ nguyên các bước tay của Trang, chỉ thay Excel bằng app tính-song-song để đối soát không lệch.

---

## PHỤ LỤC A — CHI TIẾT CÔNG THỨC (tham chiếu khi cần)

**Lương theo ngày công:** chính thức = LCB ÷ công chuẩn × công; thử việc ×85% (⚠ chốt 80/85); part-time = đơn giá giờ × số giờ. Đi thừa không cap 24 (cần Leader xác nhận làm bù).

**Phụ cấp (theo công thực đi):** ăn trưa 660k · máy tính 700k · xe + trách nhiệm (khai tay). Mỗi người bật/tắt từng khoản.

**Bảo hiểm:** chỉ chính thức, 10,5% (8% BHXH + 1,5% BHYT + 1% BHTN) trên mức đóng hợp đồng (vd 7tr → 735k/tháng). Thử việc/PT/CTV không trừ.

**Thuế TNCN:** chính thức = luỹ tiến sau giảm trừ 15,5tr + 6,2tr/phụ thuộc, miễn ăn trưa ≤730k + điện thoại. Bậc trong file: ≤10tr 5% · 10–30tr 10% · 30–60tr 20% · 60–100tr 30% · >100tr 35%. Thử việc/CTV = 10% phẳng (CTV <5tr không thu).
⚠ **Cần chị Vân chốt:** ranh giới bậc — file dùng 10/30/60/100tr, biểu chính thức 2026 là **10/20/50/100tr**.

**Khoản nhập tay:** COM, bù tiền, thưởng lễ tết / khác.

---

## PHỤ LỤC B — CÒN CẦN CHỐT TRƯỚC KHI LÀM (đầu mối: Chung)

**Chị Trang:** ① bảng hồ sơ nhân sự tổng hợp (lương/tháng, thử việc↔chính thức + ngày lên, số phụ thuộc, mức đóng BH, phụ cấp được hưởng) — *đang thiếu* · ② bảng % hoa hồng chi tiết theo level (IH2) · ③ thử việc 80% hay 85% · ④ cách xử lý quên chấm công / xin phép + nút "lên chính thức".

**Chị Vân:** ① ranh giới bậc thuế (10/30/60/100 hay 10/20/50/100) · ② quy tắc trừ BH khi vào/nghỉ giữa tháng.

**Anh Hiếu:** làm trọn GĐ1 một tháng rồi mới sang GĐ2, hay chạy song song vài khâu?
