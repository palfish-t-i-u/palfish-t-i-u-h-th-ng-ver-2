# PHIẾU LƯƠNG — GĐ1: KIẾN TRÚC + TODO/MILESTONE
**Ngày:** 06/08/2026 · **Chốt kiến trúc:** pull dữ liệu → **BigQuery** → Sheet → module app GMV.
**Phân vai:** Minh = code (BigQuery, view SQL, app, pipeline). Chung = DA (định nghĩa nguồn, logic COM/thuế với Trang–Vân, **đối soát khớp tháng 6/7**).
Xem thêm bản nghiệp vụ: `docs/plans/PLAN_PHIEU_LUONG_2026-08-05.md`.

---

## 1. LUỒNG DỮ LIỆU (chốt)
```
NGUỒN (GĐ1 = Sheet)         KHO CHUNG          REVIEW (Apps Script gate)      NHÂN VIÊN
- Sheet lương (Trang)                                                          Phiếu lương app GMV
  công đã CHỐT TAY    ==>    BigQuery     ==>   Sheet kết quả            ==>    (xem theo user,
- Sheet thuế (Vân)          (1 view tổng        Trang/Vân tick đủ ô             khoá mật khẩu)
- Sheet hồ sơ NS            -> tách 6 block,     xác minh --------------->      2 nút: yêu cầu
  (master)                  real-time)                                         xem xét / xác nhận
                                                ô "Xem xét lại" & "Sales   <-- (app ghi ngược
(máy chấm công/DingTalk=GĐ2)                     xác nhận"                       về Sheet)
```
- **BigQuery = "kho dữ liệu duy nhất"** trong đề xuất business — hiện thực hoá cụ thể.
- **Nguồn GĐ1 chỉ còn các Sheet** (công đã được Trang chốt tay → không cần nối máy chấm công).
- Gom → **1 view tổng** → tách **view theo 6 block giống app:** Lương cơ bản · Thưởng+COM · Phụ cấp · Bảo hiểm · Thuế+Bù tiền · Tổng tiền.
- **BQ → Sheet: real-time.** **Sheet → app: Apps Script** — Trang/Vân tick đủ ô xác minh thì tự bắn phiếu sang app.
- **App → Sheet (ghi ngược):** sales bấm *Yêu cầu xem xét lại* → tick ô "Xem xét lại"; bấm *Xác nhận* → cập nhật ô "Sales xác nhận".

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
| **M1** | **Nền dữ liệu — BigQuery + nối Sheet** | | | **~13/8** |
| 1.1 | Minh tạo BigQuery (project tài khoản Minh) + dataset + share (Chung editor, Hiếu viewer) + convention `M_/C_/prod_*` | Minh | 0,5 ngày | |
| 1.2 | Nối các Sheet nguồn (lương Trang, thuế Vân, hồ sơ NS) — external table, real-time | Minh | 0,5 ngày | |
| — | ~~Máy chấm công / DingTalk~~ → **GĐ2** (GĐ1 công chốt tay qua Sheet Trang) | | — | |
| **M2** | **Xử lý + TÍNH KHỚP (cổng đúng-sai quan trọng nhất)** | | | **~20/8** |
| 2.1 | Gom nguồn → 1 view tổng; tách view theo 6 block | Chung + Minh | 1,5 ngày | |
| 2.2 | Viết SQL từng block khớp công thức (từng ROUND) | Minh | 1,5 ngày | |
| 2.3 | **Đối chiếu kết quả với phiếu tháng 6 & 7 → đo % chính xác → sửa tới khớp từng đồng** | Chung | 1 ngày + lặp | |
| **M3** | **Sheet kết quả + xác minh (Apps Script)** | | | **~25/8** |
| 3.1 | BigQuery → Sheet kết quả (real-time) | Minh | 0,5 ngày | |
| 3.2 | Ô trạng thái xác minh + **Apps Script**: tick đủ ô → tự bắn phiếu sang app | Minh | 1 ngày | |
| **M4** | **Module phiếu lương trong app GMV** | | | **~31/8** |
| 4.1 | Module phiếu: xem theo user (RBAC), khoá mật khẩu tài khoản, audit | Minh | 1,5 ngày | |
| 4.2 | 2 nút (yêu cầu xem xét / xác nhận) + auto-khoá nút xem-xét vào mùng 4 | Minh | 1 ngày | |
| 4.3 | **Ghi ngược app→Sheet:** cập nhật ô "Xem xét lại" & "Sales xác nhận"; bắn phiếu qua Zalo/email (tái dùng notifier) | Minh | 1 ngày | |
| **PR** | **Chạy song song chu kỳ tháng 9, đối soát lệch = 0** | Cả nhóm + Trang/Vân | chờ chu kỳ | **1/9→4/9** |
| **GL** | **Go-live** nếu tháng 9 sạch | | | **chu kỳ tháng 10** |

**GĐ2 (sau khi GĐ1 lệch = 0):** API máy chấm công · portal xin phép/làm bù · engine COM auto · thuế auto · gửi phiếu hybrid + gom phản hồi.

---

## 7. QUYẾT ĐỊNH ĐÃ CHỐT (06/08 chiều)
1. **Máy chấm công: KHÔNG nối vào BQ.** Chỉ cần biết web; **công cuối cùng do Trang chốt tay** → vào hệ thống qua Sheet của Trang. ⇒ Nguồn GĐ1 thực chất chỉ còn các **Google Sheet**. (Nối máy chấm công/DingTalk = GĐ2.)
2. **BigQuery → Sheet: real-time.** **Sheet → app: qua bước xác minh bằng Apps Script** — tick đủ các ô trạng thái xác minh thì mới tự bắn phiếu sang app.
3. **Convention view production `prod_*`** — chốt dùng (cạnh view cá nhân `M_/C_`).
4. **Billing: tài khoản Minh trả trước;** phát sinh chi phí thì đề xuất dời sang tài khoản công ty sau.
5. **Khoá nút "yêu cầu xem xét" = mùng 4** (1 ngày trước mùng 5) — đúng.
6. **Hai lớp xác nhận — đúng, kèm luồng app→Sheet.** Trên Sheet có 2 ô trạng thái:
   - **"Xem xét lại":** tick = sales có feedback (lấy từ app khi sales bấm *Yêu cầu xem xét lại*); không tick = không vấn đề.
   - **"Sales xác nhận":** cập nhật khi sales bấm nút *Xác nhận* trên phiếu ở app.

*Trạng thái (05):* đã chốt phương án với Trang/Vân; 2 chị đang soạn nguồn dữ liệu, dự kiến **có trong chiều 06/08**.

---

## 8. TRẠNG THÁI THỰC THI (06/08)
**Nền BigQuery đã dựng (nằm trên cloud — không phụ thuộc máy):**
- Project **`pf-salary`** · dataset **`payroll`** @ `asia-southeast1`.
- Auth: tài khoản Minh (đã cấp **Drive scope** để `bq` đọc được Google Sheet).
- **IAM (cấp project):** Chung = *BigQuery Data Editor* + *Job User*; Hiếu = *BigQuery Data Viewer* + *Job User*. Xem tại **IAM & Admin → IAM** (`console.cloud.google.com/iam-admin/iam?project=pf-salary`).
- `bq` CLI đã chạy được (test `SELECT 1` OK).

**Còn lại (M2+):** external table từ Sheet sạch (Trang/Vân giao) → **6 view `prod_*`** theo block → **đối chiếu phiếu T6/T7** → M3 (Apps Script gate) → M4 (module app).

**⚠️ Khi đổi máy:** project/dataset/IAM còn nguyên trên cloud. NHƯNG gcloud/bq + đăng nhập là **theo từng máy** → máy mới phải: cài Google Cloud SDK → `gcloud auth login --enable-gdrive-access --update-adc` → `gcloud config set project pf-salary`. *(Nếu path cài có dấu cách trong tên user thì `bq` phải gọi qua đường dẫn 8.3 rút gọn — xem ghi nhớ dự án.)*

**Máy laptop (user `silly`, 06/08):** SDK cài tại `C:\Users\silly\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin`; auth `anhminhcv0512@gmail.com` OK, `SELECT 1` + `bq ls payroll` chạy được (dataset rỗng, đúng trạng thái M2). Gotcha khi gọi `bq` từ Git-Bash: phải có `gcloud` trên PATH mới lấy được creds → `export PATH=".../google-cloud-sdk/bin:$PATH"` trước lệnh `bq` (nếu không: `Error retrieving auth credentials from gcloud [WinError 2]`). Terminal thật (PS/CMD) đã có PATH sẵn.
