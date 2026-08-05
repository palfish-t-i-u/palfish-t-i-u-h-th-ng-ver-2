# KẾ HOẠCH — TỰ ĐỘNG HOÁ PHIẾU LƯƠNG
**Ngày họp:** 05/08/2026 · **Tham gia:** anh Hiếu, chị Trang (HR), chị Vân (kế toán), Minh, Chung
**Phân vai đội làm:** **Minh** — developer chính, code toàn bộ. **Chung** — DA, làm chủ dữ liệu & logic tính (không code).
**Cần cho sáng 06/08:** sơ đồ quy trình của chị Trang + chỉ ra chỗ nào có thể để máy làm thay.

> Tài liệu này viết cho người đọc là nghiệp vụ (HR/kế toán/sếp). Nội dung dựa trên **2 file Excel thật** (bảng lương chị Trang tháng 3→7 và file tính thuế chị Vân) — đây là chuẩn nhất, được ưu tiên hơn ghi chép tay trong họp.

---

## 0. CHECKLIST ANH HIẾU GIAO (Zalo) — đủ 5 mục thì mai chốt với chị Trang
- **0.** Xác định **mục tiêu** giải quyết vấn đề gì cho business → ✅ (mục 1)
- **1.** Vẽ **wireframe công việc HIỆN TẠI** của chị Trang → ✅ (wireframe)
- **2.** **Guideline các step hiện tại (Nguồn + Logic)** → ✅ (mục 2–3 + tầng "Dữ liệu nguồn")
- **3.** Xác định **phần có thể tối ưu** → ✅ (mục 4 + nhãn "tự động hoá được")
- **4.** Vẽ lại **luồng wireframe MỚI** (sau tối ưu, đơn giản theo step, chưa chi tiết) → ❌ **CHƯA LÀM — việc còn lại**

---

## 1. MỤC TIÊU
Hiện tại làm lương mất **vài ngày**, dữ liệu nằm rải rác ở nhiều file Excel rời của từng người → dễ sai lệch, khó kiểm tra.
Mục tiêu: gom tất cả về **một chỗ duy nhất trên app**, để:
- Ra bảng lương **trong vòng 1 ngày**.
- Không còn cảnh chép tay qua lại giữa file của Trang và file của Vân.
- Ai cũng nhìn cùng một con số, hết chuyện "lệch số" giữa các phòng.

Anh Hiếu chốt cách làm: **đi 2 giai đoạn, không làm cầu kỳ ngay từ đầu.**
1. **Giai đoạn 1 — Làm cho giống hệt Excel hiện tại.** App tính ra kết quả trùng khít 100% với file của Trang. Chạy song song 1 tháng, đối chiếu **không lệch một đồng** rồi mới đi tiếp.
2. **Giai đoạn 2 — Cho máy làm thay các khâu nhập liệu.** Nối máy chấm công, cho nhân viên tự xin phép trên app, tự tính hoa hồng, tự tính thuế, tự gửi phiếu.

---

## 2. QUY TRÌNH HIỆN TẠI CỦA CHỊ TRANG (mỗi tháng)

```
 Mùng 1          Mùng 2–3           Mùng 4           Mùng 5          Mùng 25
 Chốt công       Nhân viên          Gửi phiếu        Chi tiền        Chi tiền
 + doanh số      soi lại, ai        lương cho        LƯƠNG CỨNG      HOA HỒNG
 Ra bảng lương   sai thì báo        từng người
 nháp (gross)    lại (qua Zalo)
```

Diễn giải từng bước:
1. **Mùng 1 – Chốt công & doanh số.** Trang lấy dữ liệu chấm công từ máy, **lọc tay** những ca bị máy ghi thiếu / làm bù cuối tuần (mất rất nhiều thời gian). Lấy doanh số bán hàng của sale để tính hoa hồng.
2. **Mùng 2–3 – Đối soát.** Nhân viên xem lại, ai thấy công/lương sai thì báo lại, Trang chỉnh.
3. **Mùng 4 – Gửi phiếu lương.** Trang xuất phiếu lương từng người rồi **gửi tay qua Zalo cho từng người một** (rất tốn công). *Trước đây ở công ty cũ gửi qua email nhưng tốn phí, nên giờ gửi Zalo cho miễn phí.*
4. **Mùng 5 – Chi lương cứng** (lương theo công + phụ cấp − thuế − bảo hiểm).
5. **Mùng 25 – Chi hoa hồng** (thưởng doanh số của sale, tách riêng cho kế toán dễ theo dõi).

Song song, **chị Vân (kế toán)** nhận bảng lương gross của Trang → tính thuế thu nhập cá nhân và bảo hiểm trên **file Excel riêng** → chép ngược con số thuế trở lại bảng của Trang. Đây chính là chỗ "2 file rời phải chép tay qua lại".

---

## 3. CÁC QUY TẮC TÍNH LƯƠNG (lấy từ file thật)

### 3.1. Lương theo ngày công
- **Công chuẩn = 24 ngày/tháng** (đủ 24 công → hưởng 100% lương cơ bản). Đi thiếu → trừ theo ngày.
- **Đi thừa (25–26 ngày): KHÔNG cap ở 24** — trả theo tỉ lệ vượt (vd lương 10tr, đi 25 ngày → 10,42tr). *(Xác nhận trong họp chiều — bản trước tôi ghi "cap 24" là SAI; file thật có 1 bạn Sales admin thử việc đi 29 công vẫn được trả theo 29/24.)*
  - **Điều kiện:** ngày thừa **chỉ tính nếu Sale Leader xác nhận là "làm bù"**; đi làm cuối tuần chỉ để đảm bảo doanh số → không tính công.
- Tháng có ít ngày làm → **công chuẩn = 23** cho tháng đó (là một **ô chọn 23/24** trước khi xuất bảng).
- **Chính thức:** Lương hưởng = Lương cơ bản ÷ công chuẩn × số ngày công.
- **Thử việc:** × **85%** *(sheet tính 85% — đã verify 3 người HR/CS/Sales admin; nhưng Trang nói miệng 80% → **cần hỏi lại Trang cho chắc**).*
- **Part-time:** trả **theo giờ** = đơn giá giờ × số giờ (cột "Công" điền giờ). Đơn vị công 2 dạng: ngày (FT) / giờ (PT) tuỳ vị trí.

### 3.2. Phụ cấp (tính theo ngày công thực đi)
- **Hỗ trợ ăn trưa:** 660.000đ/tháng (đủ 24 công), đi thiếu công thì trừ theo tỉ lệ.
- **Hỗ trợ máy tính:** 700.000đ/tháng, tính tương tự.
- **Hỗ trợ tiền xe + phụ cấp trách nhiệm:** gộp chung 1 khoản. Phụ cấp trách nhiệm (quản lý thêm 1 team) phải **khai tay** cho từng người.
- 3 khoản ăn trưa / máy tính / xe: mỗi nhân viên chỉ cần bật/tắt "có hưởng hay không".

### 3.3. Bảo hiểm (chỉ trừ với nhân viên chính thức)
- Trừ **10,5%** vào lương nhân viên (gồm 8% BHXH + 1,5% BHYT + 1% BHTN). *(Ghi chép ghi "15%" là nhầm — 10,5% là phần người lao động chịu.)*
- Trừ trên **"mức lương đóng bảo hiểm" ghi trong hợp đồng** (con số cố định), **không** phải lương thực nhận. Ví dụ mức 7.000.000đ → trừ 735.000đ/tháng.
- Người thử việc / part-time / cộng tác viên: **không** trừ bảo hiểm.

### 3.4. Thuế thu nhập cá nhân
- **Nhân viên chính thức:** tính theo bậc luỹ tiến, sau khi trừ:
  - **Giảm trừ bản thân 15.500.000đ/tháng** + **mỗi người phụ thuộc 6.200.000đ/tháng** (càng nhiều người phụ thuộc, giảm trừ càng cao). ✅ *Đây đúng là mức luật mới hiệu lực 01/01/2026 — file làm chuẩn.* (Trên sheet ghi **tổng** giảm trừ phụ thuộc, vd 18,6tr = 3 người × 6,2tr.)
  - Miễn thuế phần ăn trưa (tối đa 730.000đ) và điện thoại.
  - Bậc thuế trong file: đến 10tr → 5%; 10–30tr → 10%; 30–60tr → 20%; 60–100tr → 30%; trên 100tr → 35%.
- **Người thử việc & cộng tác viên:** thuế phẳng **10%** (thử việc vẫn được miễn phần ăn trưa; cộng tác viên dưới 5tr/tháng thì không thu thuế).

  ⚠️ **Điểm duy nhất cần chị Vân xác nhận:** ranh giới bậc thuế. File dùng mốc **10/30/60/100tr**, còn **biểu 5 bậc chính thức 2026 là 10/20/50/100tr** (bậc 2–4 lệch). Cùng thu nhập, mốc của file ra thuế thấp hơn luật một chút → hỏi Vân dùng mốc nào cho bản chạy thật (file có thể là bản nháp).

### 3.5. Các khoản nhập tay
- **Thưởng hoa hồng (COM):** của sale.
- **Bù tiền:** cộng thêm (truy lương tháng trước thiếu) hoặc trừ (phạt lỗi) — chỉ là khoản nhập lại.
- **Thưởng lễ tết, khoản khác:** nhập tay.

---

## 4. NHỮNG CHỖ ĐANG LÀM TAY → CÓ THỂ ĐỂ MÁY LÀM THAY
*(Đây là phần trả lời câu hỏi của anh Hiếu: khâu nào tự động/tối ưu được.)*

| Khâu đang làm tay | Vất vả ở đâu | Hướng để máy làm thay |
|---|---|---|
| Xuất chấm công rồi **sửa lỗi máy bằng tay** | Ngốn nhiều thời gian nhất | **GĐ2:** nối thẳng máy chấm công + cho nhân viên tự xin phép/báo làm bù trên app → dữ liệu công sạch sẵn |
| Tra **lương cơ bản** từng người | Lương đổi theo tháng (nhất là sale), dễ tra nhầm | Lưu sẵn hồ sơ nhân sự có lịch sử lương theo tháng → máy tự lấy đúng tháng |
| Tính **hoa hồng** (đội IH2 tính tay) | Công thức nhiều tầng | Máy tự tính theo quy tắc của Trang |
| Chị Vân tính **thuế** trên Excel rồi chép tay sang | 2 file rời, dễ lệch | Máy tự tính thuế trong app, Vân chỉ việc kiểm tra & chốt |
| Đánh dấu **ai lên chính thức** để bắt đầu trừ bảo hiểm | Nhớ/soát tay | Lưu ngày lên chính thức → máy tự áp bảo hiểm đúng tháng |
| Xuất **phiếu lương** từng người | Thủ công, chậm | Máy tự tạo phiếu (file PDF) và lưu lại |
| **Gửi phiếu qua Zalo** từng người | Cực tốn công, không bảo mật | Máy **tự gửi mỗi người qua CẢ Zalo lẫn email**; ai phản hồi kênh nào thì **tự gom lại đẩy về cho Trang xử lý** |
| Xuất file chuyển khoản ngân hàng | Tay | Máy xuất sẵn 2 đợt: lương cứng (mùng 5) và hoa hồng (mùng 25) |

---

## 5. KẾ HOẠCH LÀM (2 giai đoạn)

**Giai đoạn 1 — Làm giống hệt Excel, đối soát không lệch (ưu tiên số 1)**
- Dựng nơi lưu hồ sơ nhân sự + bảng lương từng tháng trên app.
- Đưa file chấm công vào → app tự ráp thành bảng lương nháp.
- App tính: lương theo công, phụ cấp, thuế, bảo hiểm → ra đúng như file Trang & Vân.
- Trang xem và chốt bảng gross; Vân xem và chốt phần thuế/bảo hiểm.
- App tạo phiếu lương (PDF) + xuất file chuyển khoản 2 đợt.
- **Chạy song song 1 tháng, đối chiếu tới khi khớp từng đồng.**

**Giai đoạn 2 — Cho máy làm thay khâu nhập liệu** (làm sau khi GĐ1 đã khớp)
- Nối máy chấm công + cho nhân viên tự xin phép/báo làm bù trên app.
- Máy tự tính hoa hồng.
- Máy tự tính thuế (Vân chỉ kiểm tra & chốt).
- **Gửi phiếu hybrid Zalo + email + tự gom phản hồi** như mục 4.

**Ai làm gì:**
- **Chung (DA):** gom bảng hồ sơ nhân sự từ Trang; chốt logic tính hoa hồng (IH2) & xác nhận quy tắc thuế/bảo hiểm với Vân; **đối soát số liệu** app vs Excel Trang ở giai đoạn 1. → lo phần "dữ liệu & logic phải đúng".
- **Minh (dev chính) + hỗ trợ:** dựng app, viết phần tính, làm màn hình, tích hợp gửi phiếu. → lo phần "biến logic thành code chạy".

---

## 6. CẦN CHỊ TRANG / CHỊ VÂN CUNG CẤP (trước khi bắt tay làm)
*(Đầu mối thu thập & chốt các mục dưới đây: **Chung**.)*

**Chị Trang:**
1. **Một bảng hồ sơ nhân sự tổng hợp** (hiện chưa có): mỗi người gồm lương cơ bản theo từng tháng, đang thử việc hay chính thức + ngày lên chính thức, số người phụ thuộc, **"lương hợp đồng" (mức đóng BH — chuyên viên 7tr)**, được hưởng phụ cấp nào. → *Đây là thứ đang thiếu, chưa có thì chưa tính được.*
2. **Bảng level % tính hoa hồng đầy đủ** cho IH2. *(Đã rõ từ họp: tổng DT <80tr → 0 com; ≥80tr & bán mới ≥80tr → com bán mới; ≥80tr nhưng bán mới <80tr → chỉ com gia hạn; gia hạn <30tr → 0, ≥30tr → 2,5% rồi tăng theo level. **CÒN THIẾU: bảng % chi tiết theo từng level.**)*
3. Xác nhận **thử việc 80% hay 85%** (chị nói 80% nhưng sheet tính 85%).
4. Cách xử lý **quên chấm công** + **xin phép** (sale qua leader, back office qua DingTalk → kéo từ DingTalk); và **nút "lên chính thức"** ghi thời điểm để bắt đầu trừ BHXH.

**Chị Vân:**
3. Xác nhận **ranh giới bậc thuế**: file dùng mốc 10/30/60/100tr, còn biểu 5 bậc chính thức 2026 là **10/20/50/100tr** — bản chạy thật dùng mốc nào? *(Giảm trừ 15,5tr/6,2tr đã đúng luật 2026, không cần hỏi.)*
4. Quy tắc trừ bảo hiểm khi nhân viên **vào/nghỉ giữa tháng**.
- ~~Gửi file thuế mẫu~~ → **ĐÃ CÓ** (chính là sheet Vân gửi, đã đọc). ✓

**Anh Hiếu:** làm xong trọn vẹn Giai đoạn 1 một tháng rồi mới sang Giai đoạn 2, hay làm song song vài khâu?

---

## 7. GHI CHÚ KỸ THUẬT (nội bộ Minh — người khác bỏ qua)
- Module mới trong repo GMV: bảng `payroll_employees` (master effective-dated), `payroll_periods`, `payroll_lines`, `payroll_adjustments`, `payroll_config` (công chuẩn/rate BH/giảm trừ/bậc thuế để đổi linh hoạt). Route `payroll_routes.py`, engine tính bằng Pandas khớp từng `ROUND`. Tab FE "Phiếu lương" (3 màn HR / nhân viên / kế toán).
- **Tái dùng hạ tầng sẵn có:** Zalo OA notifier, DingTalk, email invoice, import GSheet/xlsx, RBAC, audit log — không dựng thêm hạ tầng mới.
- Công thức chân lý (từ 2 sheet): lương công FT `=LCB/24*công`; thử việc `*85%`; PT `=đơn giá giờ*số giờ`. Gross F `= I+K(bảo hiểm)+M+N+O(phụ cấp)+P(thuế)+Q(bù tiền)`; E `= F+J(COM)`. Thuế/BHXH theo mục 3.3–3.4. Phiếu hiện dùng AutoCrat+Google Doc → thay bằng render PDF.
