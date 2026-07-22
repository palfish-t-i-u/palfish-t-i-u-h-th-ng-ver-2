# Đề xuất: Tạo hộ & Chuyển giao PR cho Sale (cấp Leader)

> **Ngày**: 22/07/2026
> **Nguồn nhu cầu**: Sale Leader (ghi nhận trong todo 22/07)
> **Trạng thái**: Nháp — chờ anh Hiếu đọc & chốt → sau đó confirm với các Sale Leader
> **Phạm vi doc**: mô tả vấn đề, giải pháp, sẽ làm thêm cái gì, và workflow kỳ vọng. Không đi vào kỹ thuật.

---

## 0. Tóm tắt nhanh (đọc trong 30 giây)

Hiện tại **ai bấm tạo PR thì PR thuộc về người đó**, và **không sửa được** sau khi tạo. Điều này gây sai lệch khi Leader tạo thanh toán hộ sale trong lúc sale đang chốt với khách.

Đề xuất **2 tính năng** + **1 cơ chế nền**:

1. **Tạo hộ PR** — Leader chọn sale từ danh sách rồi tạo PR đứng tên sale đó.
2. **Chuyển giao PR** — chuyển một PR đã tạo **giữa sale và leader của sale đó** (sale đẩy lên leader, hoặc leader giao cho sale). **Không** chuyển trực tiếp sale ↔ sale. (Tinh thần giống "Đổi NV bán hàng" của CRM, nhưng chỉ đi theo trục dọc sale–leader.)
3. **Nhật ký lưu chuyển PR** — ghi lại lịch sử ai nắm giữ PR trong khoảng thời gian nào, để đối soát doanh thu (mô phỏng "Nhật ký bán hàng" của CRM).

Điểm cốt lõi: mọi ghi nhận doanh thu / KPI / hoa hồng / thứ hạng (BXH) / thông báo Zalo–DingTalk đều bám theo **"sale sở hữu PR"**. Chỉ cần trường này đúng người thì tất cả tự động đúng theo.

---

## 1. Vấn đề đang gặp

**Cơ chế hiện tại:** Mỗi PR gắn cứng với **người bấm tạo**. Không có ô chọn sale, cũng không có cách đổi chủ sau khi tạo — muốn đổi phải hủy và làm lại từ đầu (mất bill, mất tiến trình).

**Tình huống thực tế phát sinh (theo Sale Leader):**
- Sale đang gọi điện chốt với khách. Giữa sale và leader có "chốt chéo".
- Leader muốn **tạo thanh toán hộ** để sale tập trung nói chuyện với khách.
- Nhưng khi Leader tạo → **PR bị ghi là của Leader**, không phải sale thực sự chốt đơn.

**Hệ quả khi ghi sai người sở hữu:**
- **Doanh thu & KPI** ghi nhầm sang Leader.
- **Hoa hồng** tính sai.
- **Thứ hạng / BXH** trên app hiển thị sai người.
- **Thông báo Zalo (báo tiền về) và DingTalk (báo đơn)** gửi về nhầm nhóm/team.
- Không có cách sửa → phải hủy tạo lại, hoặc để sai luôn.

---

## 2. Mục tiêu

1. Cho phép **Leader tạo PR đứng tên đúng sale** đã chốt đơn — ngay tại lúc tạo.
2. Cho phép **chuyển một PR đã tạo** giữa sale và leader khi cần (bàn giao, tiếp quản, trả lại).
3. Đảm bảo **doanh thu, KPI, thông báo luôn về đúng người sở hữu**.
4. **Lưu vết minh bạch** mọi lần tạo hộ / chuyển giao để đối soát doanh thu về sau — không để "mờ" ai đang giữ PR ở thời điểm nào.

---

## 3. Nguyên tắc nền — tách bạch 2 vai trò

Đây là ý tưởng gốc để mọi thứ khác chạy đúng. Trong một thao tác tạo/chuyển PR có **hai vai trò khác nhau**, mà hiện nay hệ thống đang **gộp làm một**:

| Vai trò | Là ai | Dùng để làm gì |
|---------|-------|----------------|
| **Người sở hữu đơn** | Người thực sự chốt / đang chăm khách (sale, hoặc leader khi tiếp quản) | Được ghi nhận doanh thu, KPI, hoa hồng, BXH; thông báo về team của người này |
| **Người thao tác** | Người thực sự bấm nút (có thể là Leader) | Chỉ để lưu vết "ai đã làm việc này" |

Tính năng mới = **tách hai vai trò này ra**. Người thao tác có thể khác người sở hữu. Khi đã tách đúng, toàn bộ hạ nguồn (doanh thu, báo cáo, thông báo) tự động chạy về đúng người mà không cần chỉnh gì thêm.

---

## 4. Tính năng A — Tạo hộ PR

**Ai được dùng:** Leader (và Manager). Sale thường **không** thấy tính năng này — vẫn tạo như cũ, mặc định PR đứng tên chính mình.

**Sẽ thêm gì (nhìn thấy trên màn hình):**
- Trên form **Tạo PR**, thêm **một ô chọn "Sale sở hữu đơn"** (dạng danh sách chọn / gõ tìm).
- Ô này **chỉ hiện với Leader/Manager**.
- Danh sách trong ô = **các sale thuộc team/nhóm mà Leader quản lý** (hệ thống đã biết sẵn ai thuộc team nào — không cần khai báo thêm).
- Mặc định để trống hoặc mặc định là chính Leader; nếu Leader chọn một sale khác → PR sẽ đứng tên sale đó.

**Kết quả sau khi tạo:**
- PR đứng tên **sale được chọn** ngay từ đầu.
- Toàn bộ doanh thu / KPI / thông báo về đơn này **tự động thuộc về sale đó** — vì hệ thống luôn bám theo "sale sở hữu PR".
- **Nhật ký lưu chuyển** ghi 1 dòng: *"Leader [X] tạo hộ cho Sale [Y] lúc [thời gian]."*

> Vì đơn đứng tên đúng sale **ngay từ lúc tạo**, tính năng A **không** gây vấn đề doanh thu quá khứ. Chuyện quá khứ/tương lai chỉ phát sinh ở tính năng B bên dưới.

---

## 5. Tính năng B — Chuyển giao PR (chỉ theo trục sale ↔ leader)

> **Quy tắc chiều chuyển (anh Hiếu chốt):** PR chỉ được chuyển **giữa một sale và leader của sale đó** — **KHÔNG** chuyển trực tiếp sale ↔ sale. Hai chiều hợp lệ:
> - **Sale → Leader**: sale đẩy PR của mình lên leader.
> - **Leader → Sale**: leader giao PR cho một sale trong team.
>
> *(Ai được bấm & phạm vi cụ thể — xem mục 8.)*

**Sẽ thêm gì (nhìn thấy trên màn hình):**
- Trên một PR đã tạo, thêm nút chuyển giao (tinh thần giống "Đổi NV bán hàng" bên CRM), hiện theo vai trò:
  - **Sale** nhìn PR của mình → nút **"Chuyển cho Leader"** (đẩy lên leader của mình — không phải chọn ai) + (tùy chọn) nhập lý do.
  - **Leader** → nút **"Chuyển cho Sale"** → chọn **một sale trong team** + (tùy chọn) nhập lý do → xác nhận.

**Kết quả sau khi chuyển:**
- Kể từ thời điểm chuyển, PR thuộc **người nhận** (leader hoặc sale).
- **Nhật ký lưu chuyển** ghi 1 dòng: *"Chuyển giao: [người trước] → [người sau], người thao tác [...], lý do [...], lúc [thời gian]."*

### 5.1. Ảnh hưởng tới doanh thu — Quá khứ vs Tương lai ⚠️ (phần quan trọng nhất)

Cách app ghi doanh thu: **Sổ doanh thu chốt tên người sở hữu vào dòng doanh thu tại thời điểm đơn được *kích hoạt*** (bước cuối của vòng thanh toán). Từ đó suy ra:

| Thời điểm chuyển | Doanh thu bị ảnh hưởng thế nào |
|------------------|-------------------------------|
| **Trước khi đơn được kích hoạt** | Doanh thu (khi phát sinh) **tự động ghi cho người nhận mới**. Sạch sẽ, không cần chỉnh gì. |
| **Sau khi đơn đã kích hoạt & đã lên Sổ doanh thu** | Dòng doanh thu cũ **đã chốt tên người cũ** → **không tự đổi hồi tố**. Doanh thu *mới phát sinh sau đó* mới ghi cho người mới. |

**Ví dụ:** 1/7 Sale A chốt đơn 10 triệu, đơn kích hoạt → Sổ doanh thu ghi 10 triệu cho A (KPI/hoa hồng tháng 7 của A đã tính). 20/7 chuyển PR sang leader → 10 triệu **vẫn ở A**; chỉ doanh thu phát sinh sau 20/7 mới ghi cho người mới.

**Về thông báo đã gửi:** Các thông báo đã bắn đi trước thời điểm chuyển (báo tiền về qua Zalo, báo đơn qua DingTalk) đã đến nhóm của **người cũ** — **không thu hồi được** (Zalo/DingTalk không cho rút tin đã vào nhóm). Nhật ký lưu chuyển dùng để giải thích chênh lệch này khi đối soát.

**Đề xuất xử lý (chờ anh Hiếu chốt):**
- **Mặc định: KHÔNG sửa hồi tố doanh thu quá khứ.** Giữ nguyên bản ghi cũ như một dữ kiện lịch sử ("tại thời điểm đó, người cũ là người nắm giữ"). Dùng **nhật ký lưu chuyển** làm mốc ranh giới để đối soát.
- Nếu có trường hợp thực sự cần chuyển cả doanh thu quá khứ → làm **thao tác đối soát riêng, thủ công, có kiểm soát** — không gộp vào nút "Chuyển giao" để tránh vô tình xáo trộn số liệu đã chốt.

---

## 6. Nhật ký lưu chuyển PR (mô phỏng "Nhật ký bán hàng" của CRM)

Đây chính là đề xuất "ghi chép lịch sử lưu chuyển" — để đối soát **ai nắm giữ PR trong khoảng thời gian nào**, phục vụ ghi nhận doanh thu chính xác. Bên CRM PalFish đã có "Nhật ký bán hàng"; ta làm bản tương đương **cho vòng đời PR trên app GMV**.

**Nơi hiển thị:** một mục/tab **"Lịch sử lưu chuyển"** ngay trong màn hình chi tiết của PR.

**Nội dung mỗi dòng:**

| Thời gian | Hành động | Người trước | Người sau | Người thao tác | Lý do |
|-----------|-----------|-------------|-----------|----------------|-------|
| 22/07 14:06 | Tạo hộ | — | Trịnh Thị Hoa (sale) | Leader Đào Thị Trang | Chốt chéo qua điện thoại |
| 22/07 15:20 | Chuyển giao | Trịnh Thị Hoa (sale) | Leader Đào Thị Trang | Trịnh Thị Hoa | Sale bận, đẩy lên leader tiếp quản |

- **Hành động** gồm: *Tạo hộ*, *Chuyển giao* (và có thể ghi cả *Tạo thường* để đủ dấu vết).
- Đối chiếu với CRM: cột "Sale" ↔ **Người sở hữu**, cột "Người thao tác" ↔ **Người thao tác**, "phương thức phân phối / lý do" ↔ **Lý do**. Nếu anh Hiếu muốn giống hệt CRM, có thể thêm danh sách lý do cố định (vd. "Thay thế NV bán hàng", "Phân phối chỉ định cá nhân").

**Giá trị mang lại:**
- Kế toán / vận hành nhìn vào là biết **từ mốc thời gian nào PR thuộc về ai** → khớp với các dòng doanh thu.
- Minh bạch trách nhiệm: ai tạo hộ ai, ai chuyển cho ai.
- Chống lạm dụng: mọi thao tác đổi chủ đều để lại dấu vết.

---

## 7. Workflow kỳ vọng sau khi sửa

**Kịch bản 1 — Leader tạo hộ (nhu cầu gốc):**
1. Sale A đang gọi điện chốt với khách.
2. Leader mở form Tạo PR → ở ô "Sale sở hữu đơn" **chọn Sale A**.
3. Điền thông tin khách, tạo PR như bình thường.
4. PR đứng tên Sale A. Doanh thu, KPI, thông báo về đúng Sale A.
5. Nhật ký ghi: *Leader tạo hộ cho Sale A*.

**Kịch bản 2 — Sale tự tạo (không đổi gì so với hiện tại):**
1. Sale mở form Tạo PR → **không thấy ô chọn sale** → PR mặc định đứng tên mình.
2. Mọi thứ như cũ.

**Kịch bản 3 — Chuyển giao PR (chỉ theo trục sale ↔ leader):**

> **Quy tắc (anh Hiếu chốt):** PR chỉ chuyển **giữa một sale và leader của sale đó** — **không** chuyển trực tiếp sale ↔ sale.

*3a — Sale → Leader* (sale bận/nghỉ, cần leader tiếp quản chăm khách):
1. Sale (hoặc Leader) mở chi tiết PR → bấm **"Chuyển cho Leader"** → nhập lý do → xác nhận.
2. PR chuyển sang Leader. Doanh thu **phát sinh sau đó** ghi cho Leader; doanh thu **đã ghi trước đó** giữ nguyên sale cũ.
3. Nhật ký ghi: *Chuyển giao Sale → Leader*.

*3b — Leader → Sale* (leader tạo hộ xong giao lại, hoặc giao khách cho một sale trong team):
1. Leader mở chi tiết PR → bấm **"Chuyển cho Sale"** → chọn sale trong team → nhập lý do → xác nhận.
2. PR chuyển sang sale đó. Doanh thu **phát sinh sau đó** ghi cho sale đó; doanh thu **đã ghi trước đó** giữ nguyên người cũ.
3. Nhật ký ghi: *Chuyển giao Leader → Sale*.

*Trường hợp "PR của Sale A nhưng đáng lẽ là Sale B" (hai sale khác nhau):* **không** chuyển thẳng A → B được. Nếu muốn xử lý, phải đi vòng qua leader **A → Leader → B** (2 bước, mỗi bước ghi nhật ký). → Cần anh Hiếu chốt có mở đường vòng này không (mục 8, câu 8).

---

## 8. Câu hỏi cần anh Hiếu chốt

| # | Câu hỏi | Gợi ý mặc định |
|---|---------|----------------|
| 1 | **Phạm vi danh sách sale khi Leader tạo hộ:** chỉ sale **trong team/nhóm mình**, hay cả sale **ở team khác**? | Chỉ trong team mình |
| 2 | **Manager** có được tạo hộ / chuyển cho bất kỳ sale nào không? | Có, phạm vi rộng hơn Leader |
| 3 | **Chuyển PR được phép ở giai đoạn nào?** (chỉ khi chưa thanh toán? hay cả sau khi đã thanh toán / đã kích hoạt?) | Cho phép mọi giai đoạn, nhưng **không** đụng doanh thu đã chốt |
| 4 | **Doanh thu quá khứ** khi chuyển: giữ nguyên (khuyến nghị) hay đổi hồi tố? | Giữ nguyên, dùng nhật ký đối soát |
| 5 | **Lý do chuyển**: bắt buộc hay tùy chọn? Có cần danh sách lý do cố định như CRM không? | Tùy chọn; danh sách cố định nếu muốn giống CRM |
| 6 | Khi tạo hộ / chuyển, có **báo cho người được gán** không (Zalo / thông báo trong app)? | Nên có thông báo trong app cho minh bạch |
| 7 | **Ai được bấm chuyển?** Sale được **tự đẩy PR của mình lên leader** không, hay chỉ leader mới được thao tác cả 2 chiều? | Sale tự đẩy lên leader; leader thao tác chiều còn lại |
| 8 | **Đổi từ Sale A sang Sale B**: có mở đường vòng **A → Leader → B** (2 bước qua leader) không, hay case này không hỗ trợ? | Cho đi vòng qua leader, mỗi bước ghi nhật ký |
| 9 | **Phạm vi người nhận khi leader chuyển cho sale:** chỉ sale **trong team mình**, hay cả sale **ở team khác** (vd. leader Team 1 bàn giao cho sale Team 3/4)? | Chỉ trong team mình; chuyển chéo team để Manager xử lý |

---

## 9. Điểm cần confirm với Sale Leader (sau khi anh Hiếu duyệt hướng)

- Cách chọn sale trong lúc đang gọi điện có đủ **nhanh/tiện** không? Có cần thao tác "tạo hộ nhanh" để đỡ bước không?
- Tình huống **chốt chéo** thực tế diễn ra thế nào: thường ai tạo hộ cho ai, tần suất bao nhiêu?
- Chiều **Sale → Leader** thực tế có hay dùng không, hay chủ yếu chỉ cần **Leader tạo hộ / Leader → Sale**?
- Có tình huống cần đổi **giữa 2 sale** (đi vòng qua leader) thường xuyên không?
- Lý do chuyển hay gặp là gì → để chuẩn hóa danh sách lý do (nếu chọn phương án danh sách cố định).
- Có cần Leader **xem/lọc theo sale** trong danh sách PR để quản lý không? (đã có sẵn cột cho Leader, có thể tận dụng)

---

## 10. Phạm vi KHÔNG làm (để tránh phình & rủi ro số liệu)

- **Không** chuyển trực tiếp **sale ↔ sale** — mọi chuyển giao đi theo trục **sale ↔ leader**; muốn đổi giữa 2 sale phải đi vòng qua leader (nếu anh Hiếu cho phép — câu 8).
- **Không** tự động sửa hồi tố doanh thu đã chốt khi chuyển PR (trừ khi anh Hiếu quyết khác — và nếu có sẽ tách thành thao tác đối soát riêng).
- **Không** thu hồi các thông báo đã gửi trước thời điểm chuyển (bất khả thi; nhật ký để giải thích).
- **Không** đồng bộ ngược thay đổi này về CRM PalFish — tính năng chỉ nằm trong app GMV.

---

## 11. Vì sao hướng này gọn và an toàn

- **Triệt để**: giải quyết đúng gốc — tách "người sở hữu" khỏi "người thao tác"; mọi hạ nguồn tự đúng theo mà không phải sửa từng chỗ.
- **Không đẻ lỗi con**: giữ nguyên số liệu doanh thu đã chốt (không xáo trộn lịch sử); mọi thay đổi đều có nhật ký; chuyển giao gò theo trục sale–leader nên không loạn quyền.
- **Tận dụng cái đã có**: hệ thống đã biết sẵn team/nhóm của từng sale và đã có sẵn "phạm vi sale mà Leader được nhìn" — danh sách chọn sale dùng lại cơ chế này, không phải dựng mới.
- **Mở rộng dần**: có thể làm tính năng A trước (giải quyết ngay nhu cầu gốc), tính năng B + nhật ký làm sau nếu cần.
