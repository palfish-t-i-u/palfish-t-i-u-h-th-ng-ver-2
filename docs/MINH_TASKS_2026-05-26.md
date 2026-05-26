# Minh — feedback 25/05 & kế hoạch 26/05

**Nguồn:** `E:\PalFish\DA\Report\Feedback công việc 25_05 và kế hoạch làm việc 26_05.pdf`  
**Prototype UI:** `c:\Users\silly\Downloads\PalFish CRM.html` — mở browser; chi tiết `docs/PROTOTYPE_PAYMENT_FLOW.md`  
**Bổ sung:** `docs/M5_DOI_CHIEU.md`, `E:\PalFish\DA\Report\ke-hoach-cai-thien-feedback-thu-hien.md`  
**Task tracking:** `docs/TODO.md` — block **Kế hoạch 26/05**

---

## 1. Bối cảnh (PDF 25/05)

Buổi pitching với sếp **thành công** — khen team ~5 ngày làm việc tương đương ~1 tháng dev. Hệ thống được ghi nhận: tự động hóa, workflow một chiều, phân quyền Sale Leader / Hệ thống rõ.

**Go-live với đội sale trong tuần này** — còn 4 nhóm việc gấp:

| # | Vấn đề (PDF) | Hướng xử lý |
|---|--------------|-------------|
| 1 | Logic **1 QR = 1 đơn** không đủ | Thêm **Payment Request** (many-to-many) |
| 2 | Thiếu **tiền mặt / thẻ / CK tay** ngoài QR | Module ghi nhận + đối soát tay |
| 3 | **HCM** dùng pháp nhân + PayOS riêng | Chọn tài khoản HN/HCM khi tạo PR |
| 4 | Báo cáo ~**95% đúng**, ~**5% lệch** | Lỗi copy thập phân/ngày từ file Thu Hiền → seed file **DingTalk gốc** |

**Họp 26/05 lúc 8:30** — toàn team rework Module 1–2–3–4 theo luồng mới.

---

## 2. Luồng mới — Logic kết nối B1–B4 (sơ đồ + prototype)

### Many-to-many (cùng PR-ID)

| Pattern | Ví dụ |
|---------|--------|
| N lần thanh toán → 1 PR → 1 Order | QR1 + QR2 + Cash1 → **PR-ID** → Order ID 1 |
| 1 lần thanh toán → 1 PR → N Order | QR1 → **PR-ID** → Order ID 1 + Order ID 2 |

### B1 — Tạo Payment Request

- Trường: **UID CRM**, Tên KH, Địa chỉ, SĐT, **Tổng số tiền**, Note.
- Output: **PR-ID**. Chưa cần gói học.

### B2 — Trong PR: tạo QR / lần thanh toán

- Mỗi lần CK: nhập số tiền → sinh **QR** (ảnh + nội dung).
- Cũng ghi nhận tiền mặt / thẻ (prototype + PDF).
- **Gate:** tiền về **đủ 100%** mới mở B3.

### B3 — Active Request / Yêu cầu tạo khóa học

- Nút **Yêu cầu tạo đơn hàng** — có thể nhiều khóa / nhiều UID.
- Output: **Course code** (prototype; PDF gọi Activate Code — cùng vai trò).
- **1 Course code = 1 Order ID** (Admin nhập Order ID tay sau khi tạo CRM).
- **1 hóa đơn** có thể gom **nhiều Course code**.
- Xuất HĐ khi tiền đủ — kể cả kích hoạt khóa tháng sau (trừ đặt cọc).

### B4 — Yêu cầu xuất hóa đơn

- Ghép dữ liệu **B1** + **B3** → 3 file TTS.

### Màn prototype (`PalFish CRM.html`)

| Module CSS trong file | Tab đề xuất |
|----------------------|-------------|
| Payment Request | B1 + B2 |
| Đối soát giao dịch | Sau B2 |
| Active Request (Kích hoạt khóa học) | B3 |
| Xuất hóa đơn | B4 |
| Sổ doanh thu | Song song — auto khi tiền về |

Chi tiết trường + map app cũ: **`docs/PROTOTYPE_PAYMENT_FLOW.md`**.

---

## 3. Ưu tiên ngay 26/05 — việc của Minh (bôi vàng PDF)

Làm **trước** wireframe Payment Request — go-live phụ thuộc số liệu đúng.

| ID | Việc | Kết quả |
|----|------|---------|
| **MINH-P0-01** | **Sửa / đối chiếu dữ liệu tất cả báo cáo** | Sổ, BC01, BC02 khớp nguồn chuẩn sau re-seed |
| MINH-P0-02 | Xóa dòng **M3 test** khỏi Sổ prod | SQL — xem `M5_OPERATIONS.md` §3.1 |
| MINH-P0-03 | Re-seed DingTalk (sau backup + approve Ops) | `seed_dingtalk_ledger.py --purge-gsheet --confirm` |
| MINH-P0-04 | Đối chiếu ngày mẫu + filter **team** vs tab GMV | Script `audit_day_20260525.py`; doc `M5_DOI_CHIEU.md` |
| MINH-P0-05 | Rà chênh **tháng 1–2–3** (PDF yêu cầu) | So Sổ vs file gốc / BC01 theo tháng |

**Ghi chú kỹ thuật đã biết (25/05):** GMV tab All File = **Inhouse 1**; Sổ filter **Tất cả teams** sẽ lệch (vd. 25/05: 21 vs 24). All File mất phần lẻ GMV — **không** dùng làm nguồn seed.

---

## 4. Đầu việc thiết kế UX — sau P0 (Minh)

| ID | Việc | Kết quả |
|----|------|---------|
| MINH-01 | Sơ đồ UX M1–M4 theo luồng PR → Activate → Order ID | Flowchart / wireframe — thống nhất họp 8:30 |
| MINH-02 | Màn **Payment Request** list + detail | Tổng cần thu, đã thu, thiếu/thừa, trạng thái, sale/team, lịch sử thanh toán |
| MINH-03 | Modal **thêm lần thanh toán** | QR PayOS, CK tay, tiền mặt, quẹt thẻ/trả góp — mỗi lần một mã |
| MINH-04 | UI **đối soát tiền** | Đủ / thiếu / thừa; GD chưa khớp; xác nhận tay cash/manual |
| MINH-05 | Luồng **Course code** (Active Request / B3) | Chỉ mở khi PR = 100%; 1 Course code = 1 Order ID; xuất HĐ trước CRM |
| MINH-06 | UX **Sổ doanh thu** | Tiền về → dòng Sổ chờ Ops duyệt; `+ Thêm dòng` chỉ ngoài app / lịch sử |
| MINH-07 | Nhãn **BC02** | Không gọi “Key Data đầy đủ”; mô tả = GMV ngày × nguồn từ Sổ |
| MINH-08 | Chọn **tài khoản HN / HCM** | HCM: pháp nhân + PayOS riêng; chỉ team HCM tạo QR HCM |
| MINH-09 | Checklist **UAT** cùng Giang & Đức | Many-to-many, PayOS, cash/card, HCM, RBAC, invoice trước CRM |
| MINH-10 | Catalog **tên sản phẩm HĐ** (feedback Thu Hiền) | Dropdown TTS — xem `ke-hoach-cai-thien-feedback-thu-hien.md` §2.1 |

---

## 5. Việc **không** thuộc Minh (PDF 26/05 — để sync họp)

| Việc | Người / team |
|------|----------------|
| Module **đối chiếu bank** — tiền thật vs Sổ | Giang / Đức — deadline “ngày mai” (26/05) |
| Logic so sánh tiền + email biến động số dư (CK tay) | Giang / Đức |
| Backend schema `payment_requests`, mã thanh toán, reconcile | Giang / Đức |
| PayOS **PalFish Saigon** (chỉ team HCM) | Giang / Đức |
| **Hướng dẫn sử dụng** go-live tuần 1 | Hiếu |
| **Thu feedback** đội sale | Hiếu |
| File gốc mới nhất cuối ngày 25/05 từ QL | Chờ cấp — input cho MINH-P0 |

---

## 6. Checklist test Minh bám (UAT)

- 1 PR → nhiều mã thanh toán: thiếu / đủ / thừa.
- 1 PR đủ tiền → nhiều Activate Code / gói học.
- Xuất hóa đơn ngay sau đủ tiền **dù chưa** Order ID CRM.
- Nhập Order ID CRM sau vẫn khớp Activate Code.
- Tiền mặt, thẻ/trả góp, CK tay → đối soát + Sổ.
- Team HCM chỉ chọn luồng ngân hàng HCM.
- RBAC: Sale / Leader / Manager / System đúng phạm vi.
- Sổ không trùng dòng khi đơn đã có mã app.
- BC01/BC02 đúng sau re-seed DingTalk.

---

## 7. Cần Giang/Đức cung cấp (để Minh test / vẽ UX)

- API + schema: `payment_requests`, payment attempts, reconcile status, activate codes, invoice queue, CRM matching.
- Enum trạng thái thống nhất: chưa thu, thu một phần, đủ tiền, thừa tiền, cần đối soát, đã activate, đã xuất HĐ, đã khớp CRM.
- Rule quyền: HCM bank/PayOS; ai xác nhận tiền mặt / CK tay.
- Dữ liệu test cố định cho case many-to-many.

---

## 8. Liên kết

| Doc | Nội dung |
|-----|----------|
| `docs/PROTOTYPE_PAYMENT_FLOW.md` | Sơ đồ B1–B4 + màn prototype HTML |
| `docs/M5_DOI_CHIEU.md` | Đối chiếu Sổ / GMV tab / DingTalk |
| `docs/M5_OPERATIONS.md` | Re-seed, xóa M3 test |
| `docs/TODO.md` | Task ID `F2605-*` |
| `E:\PalFish\DA\Report\ke-hoach-cai-thien-feedback-thu-hien.md` | Feedback Ops Thu Hiền (catalog HĐ, Sổ, BC02) |
