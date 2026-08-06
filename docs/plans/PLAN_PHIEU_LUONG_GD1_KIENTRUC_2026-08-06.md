# PHIẾU LƯƠNG — GĐ1: KIẾN TRÚC + TODO/MILESTONE
**Ngày:** 06/08/2026 · **Chốt kiến trúc:** pull dữ liệu → **BigQuery** → Sheet → module app GMV.
**Phân vai:** Minh = code (BigQuery, view SQL, app, pipeline). Chung = DA (định nghĩa nguồn, logic COM/thuế với Trang–Vân, **đối soát khớp tháng 6/7**).
Xem thêm bản nghiệp vụ: `docs/plans/PLAN_PHIEU_LUONG_2026-08-05.md`.

---

## 1. LUỒNG DỮ LIỆU (chốt)
```
NGUỒN THÔ                          KHO CHUNG            REVIEW               NHÂN VIÊN
- Google Sheet 1-2-3 (Trang, Vân)
- Máy chấm công            ==>     BigQuery      ==>    Sheet kết quả   ==>   Module phiếu app GMV
- DingTalk (phép/nghỉ)             (1 view tổng ->      Trang/Vân xác         (mỗi người chỉ xem
                                    tách view theo       nhận + bấm nút        phiếu của mình,
                                    6 block)             xác minh)             khoá mật khẩu)
```
- **BigQuery = "kho dữ liệu duy nhất"** trong đề xuất business — hiện thực hoá cụ thể.
- Gom mọi nguồn → **1 view tổng**, rồi tách thành **các view theo block giống app GMV:** Lương cơ bản · Thưởng+COM · Phụ cấp · Bảo hiểm · Thuế+Bù tiền · Tổng tiền.
- BigQuery → **Sheet kết quả** → Trang/Vân xác nhận → bấm **nút xác minh** → đủ điều kiện → **tự bắn phiếu** về module app.

## 2. BẢO MẬT & PHÂN QUYỀN (lương = dữ liệu nhạy cảm)
- **BigQuery:** Minh = owner; **Chung = editor**; **anh Hiếu = viewer**. (Dữ liệu lương thật nằm ở đây → siết quyền, không share rộng.)
- **Module app:** mỗi người **chỉ xem phiếu của chính mình** (RBAC theo user). 
- **Khoá phiếu bằng mật khẩu tài khoản app** (re-auth trước khi xem) + ghi audit log ai xem lúc nào.
- **Không** đẩy dữ liệu lương cá nhân qua kênh nhóm; tài liệu nguồn (sheet/transcript) **không commit lên repo public**.

## 3. QUY ƯỚC ĐẶT TÊN VIEW (BigQuery)
- **View cá nhân / khám phá:** tiền tố initials — `M_general`, `C_custom`, `M_reconcile`… để phân biệt người tạo.
- **View production dùng chung (đề xuất bổ sung):** tiền tố rõ ràng theo block, vd `prod_luong_coban`, `prod_thue`… để không lẫn với view cá nhân. → *cần chốt convention này.*

## 4. HAI BỀ MẶT
**A. Sheet kết quả (Trang/Vân — nội bộ):** hiển thị bảng lương tính từ BigQuery; Trang/Vân soi & bấm **nút xác minh**; đủ điều kiện → phát hành.
**B. Module phiếu lương trong app (nhân viên):** ngoài các block thông tin lương, có **2 nút**:
- **Yêu cầu xem xét lại** (khiếu nại) — **tự khoá, không cho tương tác khi tới hạn: trước ngày gửi lương 1 ngày (= mùng 4, vì mùng 5 là ngày gửi tiền).**
- **Xác nhận.**

---

## 5. CẦN CHỐT VỚI CHỊ TRANG / CHỊ VÂN (hôm nay) — trước khi làm
*(Đầu mối: Chung. Viết theo ngôn ngữ nghiệp vụ để 2 chị duyệt.)*
1. **Bảng hồ sơ nhân sự** (đang thiếu): lương cơ bản theo tháng, thử việc/chính thức + ngày lên chính thức, số người phụ thuộc, lương hợp đồng (mức đóng BH), phụ cấp được hưởng.
2. **Bảng % hoa hồng theo level** (IH2) — logic khung đã rõ, thiếu bảng % từng level.
3. **Thử việc 80% hay 85%?** (chị Trang nói 80%, sheet tính 85%).
4. **Bậc thuế** (chị Vân): file dùng 10/30/60/100tr vs luật 2026 là 10/20/50/100tr — dùng mốc nào?
5. Đồng ý quy trình mới: xem & xác nhận phiếu **trên app** (khoá mật khẩu), 2 nút xem-xét/xác-nhận, tự khoá nút xem-xét vào **mùng 4**.
6. Cho phép **chia sẻ 3 file Sheet** hiện tại để nối vào BigQuery.

---

## 6. TODO + PHÂN CÔNG + MILESTONE
> Deadline là **mục tiêu**, phụ thuộc chị Trang giao bảng hồ sơ nhân sự (blocker). Mốc neo theo **chu kỳ lương tháng 9** để chạy song song GĐ1 (chốt công 1/9 → phiếu ~4/9).

| # | Việc | Ai | Ước lượng | Mốc |
|---|---|---|---|---|
| 0 | Chốt phương án + GĐ1 với Hiếu; chốt §5 với Trang/Vân | Minh+Chung | 0,5 ngày | **6/8** |
| **M1** | **Nền dữ liệu — BigQuery + nối nguồn** | | | **~13/8** |
| 1.1 | Tạo BigQuery (project+dataset) + share (Chung editor, Hiếu viewer) + convention tên view | Minh | 0,5 ngày | |
| 1.2 | Nối Google Sheet 1-2-3 (external table / scheduled load) | Minh | 0,5 ngày | |
| 1.3 | Nối DingTalk (phép/xin nghỉ) — tái dùng tích hợp sẵn trong repo | Minh+Chung | 0,5 ngày | |
| 1.4 | Nối máy chấm công ⚠️ **chưa có API (Hiếu xác nhận chỉ có web)** → GĐ1 dùng **export tay vào Sheet**; API để GĐ2 | Chung | 0,5 ngày (tay) | |
| **M2** | **Xử lý + TÍNH KHỚP (cổng đúng-sai quan trọng nhất)** | | | **~20/8** |
| 2.1 | Gom nguồn → 1 view tổng; tách view theo 6 block | Chung + Minh | 1,5 ngày | |
| 2.2 | Viết SQL từng block khớp công thức (từng ROUND) | Minh | 1,5 ngày | |
| 2.3 | **Đối chiếu kết quả với phiếu tháng 6 & 7 → đo % chính xác → sửa tới khớp từng đồng** | Chung | 1 ngày + lặp | |
| **M3** | **Sheet kết quả + nút xác minh (Trang/Vân)** | | | **~25/8** |
| 3.1 | BigQuery → Sheet kết quả (scheduled) | Minh | 0,5 ngày | |
| 3.2 | Nút trạng thái + xác minh; logic "đủ điều kiện → phát hành" | Minh | 1 ngày | |
| **M4** | **Module phiếu lương trong app GMV** | | | **~31/8** |
| 4.1 | Module phiếu: xem theo user (RBAC), khoá mật khẩu tài khoản, audit | Minh | 1,5 ngày | |
| 4.2 | 2 nút (yêu cầu xem xét / xác nhận) + auto-khoá nút xem-xét vào mùng 4 | Minh | 1 ngày | |
| 4.3 | Bắn phiếu tự động khi phát hành (tái dùng Zalo/email notifier) | Minh | 0,5 ngày | |
| **PR** | **Chạy song song chu kỳ tháng 9, đối soát lệch = 0** | Cả nhóm + Trang/Vân | chờ chu kỳ | **1/9→4/9** |
| **GL** | **Go-live** nếu tháng 9 sạch | | | **chu kỳ tháng 10** |

**GĐ2 (sau khi GĐ1 lệch = 0):** API máy chấm công · portal xin phép/làm bù · engine COM auto · thuế auto · gửi phiếu hybrid + gom phản hồi.

---

## 7. QUYẾT ĐỊNH CÒN MỞ (cần Minh chốt)
1. **Máy chấm công:** GĐ1 export tay (đề xuất) hay cố nối API ngay? — ảnh hưởng M1.
2. **Trigger BigQuery→Sheet→app:** scheduled query + backend đọc BQ (đề xuất) hay Apps Script?
3. **Convention view production** (`prod_*` theo block) — chốt để khỏi lẫn view cá nhân.
4. **BigQuery:** dùng project/billing của ai? (tài khoản Minh hay GCP công ty?) — có chi phí.
5. Xác nhận **mốc khoá nút "yêu cầu xem xét" = mùng 4** (1 ngày trước mùng 5).
6. Hai lớp xác nhận (Trang/Vân trên Sheet + nhân viên trên app) — giữ cả hai đúng không?
