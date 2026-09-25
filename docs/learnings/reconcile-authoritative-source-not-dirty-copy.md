# Đối soát: khi nguồn A là chân lý, đừng lấy bản sao dơ B làm mốc "tìm A thiếu"

**Related files:** `docs/MEETING_NOTE_THONG_NHAT_1_NGUON_GMV_2026-09-18.md`, memory `project_dingtalk-source-sheets-to-allfile`, `docs/learnings/2026-08-11-bq-so-doanh-thu-dual-source-dup.md`

**Problem:** Quyết "tab Auto (đổ từ DingTalk) đã đủ thay tab tay (chị Hiền nhập) trong All File chưa" để bỏ nhập tay. Chạy diff Auto↔Tay để "tìm đơn Auto/DingTalk thiếu".

**Trap:** Vấp 3 lần liên tiếp trong 1 buổi, cùng một gốc:
1. **Sai mốc:** coi tab tay là reference → báo "auto thiếu 51 đơn = blocker". Nhưng công ty đã CHỐT DingTalk = nguồn chuẩn, All File tay = bản sao (Hiền chép/nhập). Auto ≠ Tay ⇒ mặc định TAY sai, không phải auto khuyết.
2. **Diff key cứng đẻ dương tính giả:** khóa `UID+gói+tiền` → 35 "lệch" chỉ là whitespace/format (vd `"48+5 Philip Fixed"` 1 vs 2 dấu cách; `3220812982` bị gắn "lệch" nhưng có 3 lần trong DingTalk).
3. **Đổi khóa vẫn sai:** lọc còn "16 đơn thật thiếu", rồi "5 đơn không có trong DingTalk" bằng match UID → phone. Domain owner dò tay: **cả 5 (thực ra cả 16) ĐỀU CÓ trong DingTalk.** False negative vì: (a) checker bỏ qua dòng **UID trống** bên auto (đơn DingTalk chưa điền UID → vô hình); (b) All File có **phone/UID SAI** (sale báo sai, sau sửa trên DingTalk nhưng quên sửa All File) → match phone/uid đều trượt; (c) **sync lag**: đơn mới (hôm qua) chưa vào snapshot tab Auto.

**Insight:** Bản sao do người nhập tay (All File) mang đủ loại rác: typo UID/SĐT, dữ liệu cũ chưa đồng bộ sau khi sửa nguồn, ô trống, lệch locale/format. So bản-sao-dơ với nguồn-sạch bằng BẤT KỲ khóa cứng nào → luôn ra "khác biệt" mà bản chất là rác của bản sao; càng đổi khóa (uid→phone) càng lộ lỗi kiểu mới. **Kết cục thật: 0 đơn thật thiếu — DingTalk phủ 100% tab tay.** Tự động hóa (bỏ nhập tay) không chỉ an toàn mà còn SỬA lỗi, vì thay nguồn dơ bằng nguồn đã chuẩn. Đây đúng bài học các đợt đối soát app-vs-AllFile trước (85% "lệch" là dương tính giả) — đã có trong docs mà vẫn lặp.

**Rule:** Khi domain owner đã chốt nguồn chân lý:
1. ĐỪNG đối soát nguồn-chuẩn với bản-sao-lỗi để "tìm nguồn thiếu". Mọi khác biệt mặc định là lỗi bản sao. Xác minh vài mẫu rồi DỪNG — đừng trình số diff thô như blocker.
2. Diff key cứng (uid/phone/amount) trên dữ liệu người-nhập LUÔN đầy dương-tính-giả (whitespace, typo, ô trống, sync lag). Số "lệch" ≠ bằng chứng mất dữ liệu.
3. Nếu buộc phải kiểm chất lượng thì so **Auto ↔ nguồn gốc (DingTalk)**, KHÔNG so Auto ↔ Tay.
4. Cờ đỏ nhận biết đang vấp: mình đang trình "N đơn của nguồn-mà-owner-nói-không-thể-sai bị thiếu". Nếu chưa tự dò tay được ≥1 case ra "thật sự không có" → coi như CHƯA có bằng chứng, mặc định là rác bản sao.

**Verify:** Owner dò tay 5/5 case script báo "thiếu" → đều có trong DingTalk (1 sync-lag, 1 UID-trống-bên-nguồn, 3 sai/khác sđt-uid bên bản sao). Quy tắc kiểm: nếu diff báo "nguồn chuẩn thiếu đơn" mà không dò tay ra được case thật sự vắng mặt trong nguồn chuẩn → kết luận là rác bản sao, không phải gap.
