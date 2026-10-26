# Phương án đẩy dữ liệu doanh thu (GMV + L8/L4) lên Facebook

**Người làm:** Minh

---

## Vấn đề và hướng giải quyết

Với dữ liệu hiện tại mà Facebook được cấp, Facebook chỉ biết được **kiểu khách nào sẽ để lại SĐT**  
(L1 tiềm năng), chứ **không biết ai sẽ vào học thử, ai sẽ thật sự đóng tiền** (L4, L8 tiềm năng). Muốn
Facebook nhắm trúng khách tốt hơn, phải **cho nó biết ai đã thật sự ra đơn và đóng bao nhiêu tiền**.

Có hai cách đưa dữ liệu này cho Facebook, có thể **làm song song**:

- **Cách 1 — Tạo tệp Lookalike (khách giống khách tốt).** Đưa Facebook một danh sách khách tốt làm  
"hạt giống", nó tự tìm tệp khách tương tự. Dùng được cả lịch sử cũ. **Làm trước** (nhanh, không phụ  
thuộc thời gian).
- **Cách 2 — Gửi doanh thu qua CAPI.** Báo số tiền từng đơn ngay trên đường Pancake đang chạy, để tối  
ưu quảng cáo theo đơn thật. Chỉ nên sử dụng dữ liệu các đơn chốt trong **7 ngày kể từ lúc khách bấm quảng cáo**.

**Ưu tiên:** làm **Cách 1 trước**. Nhưng **Cách 2 không phải "để sau nếu rảnh"** — số liệu cho thấy  
nó bắt được gần 6/10 doanh thu (xem mục ngay dưới).

---

## Phát hiện khi kiểm chứng tài khoản thật

**1. Điểm chặn nằm ở QUYỀN META — ảnh hưởng cả hai cách.** Tài khoản Meta của Minh **không thấy** tài  
khoản quảng cáo / dataset thật của PalFish (các business đều 0 tài sản; chỉ có 1 tài khoản quảng cáo  
cá nhân, không có dataset). Tài khoản quảng cáo + dataset thật nằm ở **một Business Manager (BM) mà Minh chưa có quyền**. → **Việc bắt buộc làm đầu tiên: xin quyền admin vào BM thật của PalFish** — có quyền mới tạo được tệp (Cách 1), lấy được token, và kiểm tra được CAPI.

**2. Pancake tự tạo "đơn rỗng" cho mỗi lead.** PalFish không chốt đơn qua Pancake POS, **nhưng mỗi khi  
khách để lại số, Pancake tự tạo một đơn rỗng** mang thông tin khách + **gắn sẵn cú bấm quảng cáo** (đơn đến từ ads có sẵn `ad_id`). → Nhờ vậy Cách 2 **làm được mà gọn**: khi khách đóng tiền (biết từ GMV),  
**tìm đúng đơn rỗng đó theo SĐT, điền doanh thu + đổi trạng thái** → Pancake tự bắn `Purchase` kèm giá trị. *(Đã thử API thật: đọc đơn chạy tốt, đơn đến từ ads mang `ad_id`+`ads_source=Facebook` — xem Phụ lục B.)*

---

## Vì sao Cách 2 (CAPI) đáng giá hơn tưởng tượng

Lo ngại ban đầu: *"khách chat qua lại nhiều ngày rồi mới cho số → cửa sổ 7 ngày ăn mất phần lớn đơn."* Dữ liệu anh Hiếu đo cho thấy lo ngại này không nghiêm trọng như vậy:

**Phân bố thời gian từ lead đến đơn (6–8/2026, 379 đơn):**

| Khoảng cách lead → đơn | Số đơn | % |
|-|-|-|
| 0–3 ngày | 111 | 29,3% |
| 4–7 ngày | 112 | 29,6% |
| 8–14 ngày | 74 | 19,5% |
| 15–30 ngày | 50 | 13,2% |
| > 30 ngày | 32 | 8,4% |

- **58,9% đơn chốt trong 7 ngày.** Trung vị thời gian **nhắn → cho số** (đo tháng 9) là **3–5 phút**  
→ "7 ngày từ cú bấm" ≈ "7 ngày từ lead". → CAPI bắt được **gần 6/10 doanh thu**, không phải phần nhỏ.

---

## Cách 1 — Tạo tệp Lookalike (làm trước)

Đưa Facebook một danh sách "khách tốt" làm hạt giống, nó tự tìm tệp khách tương tự. Không dính giới hạn 7 ngày (chỉ đưa danh sách người, không nối đơn về cú bấm).

### Hai tệp nguồn — dùng cả hai, mỗi tệp một mục tiêu

| Tệp | Hạt giống | Số SĐT (xuất 09/10) | Kiểu lookalike | Nhắm tới |
|-|-|-|-|-|
| **L8** | Khách **đã đóng đủ tiền** (kèm dữ liệu doanh thu) | \~11.900 | **Theo giá trị** (tìm người giống nhóm *chi nhiều*) | Doanh thu |
| **L4** | Khách **đã học thử xong** (chưa có doanh thu) | \~26.600 | **Thường** (tìm người giống nhóm *đã học thử*) | Số lượng khách có thể kéo vào phễu chuyển đổi từ L4 -> L8 |

Làm cả hai vì: L8 chất lượng cao nhưng ít hơn (\~11.900) → hạt giống nhỏ hơn; L4 đông gấp \~2,2 lần (\~26.600) → Facebook học chuẩn hơn, kéo được nhiều hơn. Chạy 2 nhóm QC riêng để đo riêng.

**Tiêu chuẩn vào từng tệp:**

- **L8** = trạng thái **"Đã nộp đủ học phí"** (lấy kèm tổng tiền đã đóng).
- **L4** = trạng thái **L4 trở lên** — tức **đã HỌC THỬ XONG** (L4 Học thử xong; L5; L6), **trước L8**.  
*Không* chỉ "đặt được lịch" (nhiều khách đặt rồi không vào — nhóm "KVHT").

  > ⚠️ **Lưu ý:** trong "L4 trở lên" có nhóm **L5-KNM (không nghe máy sau học thử)**. Hiện **vẫn gộp nhóm này vào tệp L4 Lookalike** để seed; nếu sau này thấy tệp bị loãng/chất lượng không được như mong muốn thì cân nhắc loại nhóm này.

### Các bước thao tác (áp cho mỗi tệp)

1. **Lấy danh sách** từ CSDL lead (BigQuery): L8 = khách đã đóng tiền + tổng tiền; L4 = khách trạng  
thái L4 trở lên. Mỗi dòng một khách, gồm SĐT (+ số tiền cho L8).
2. **Làm sạch**: chuẩn hoá SĐT (thêm +84, bỏ số 0 đầu, bỏ ký tự thừa), gộp trùng theo người. Thêm  
email/tên/tỉnh/tuổi nếu có → Facebook khớp được nhiều hơn.
3. Trên **Meta Ads Manager → Đối tượng → "Danh sách khách hàng"**: tải tệp lên (Facebook tự mã hoá).  
L8 đánh dấu **"theo giá trị"** + chỉ cột tổng tiền; L4 để **"thường"**.
4. Từ mỗi danh sách, tạo **tệp Lookalike** cho Việt Nam, cỡ 1–3%. Gắn vào nhóm quảng cáo đang chạy.

**Yêu cầu (anh Hiếu chốt): không up tay từng file** — tệp lookalike phải **tự cập nhật liên tục**. → Dựng một **việc chạy tự động định kỳ** (tái dùng hạ tầng sẵn có của dự án): tự lấy danh sách L8/L4 từ kho dữ liệu → làm sạch + mã hoá SĐT → đẩy thẳng lên Danh sách khách hàng trên Meta. Lookalike tự làm mới theo danh sách nguồn → **dựng xong là không phải up tay lần nào nữa**.

> 🔧 **Chi tiết API và cách đẩy: Phụ lục A.**

---

## Cách 2 — Gửi doanh thu qua CAPI

Pancake và Meta **đã nối sẵn** (qua CAPI). Mặc định, khi một đơn chuyển sang **"Đã xác nhận"**, Pancake  
tự gửi lên Facebook một sự kiện **Purchase** (đã mua hàng). Việc của mình chỉ là **điền doanh thu vào  
đơn rỗng của khách rồi đổi trạng thái đơn sang "Đã xác nhận"**.

**Luồng (khi khách đóng tiền, trong 7 ngày):**

1. Biết khách đóng tiền từ GMV → lấy **SĐT + số tiền + khoá học**.
2. **Tìm đơn rỗng của khách** trên Pancake (theo SĐT, trạng thái "Mới", tạo trong 7 ngày).
3. **Điền doanh thu vào đơn (đặt giá đúng bằng số tiền khách đóng) + đổi trạng thái sang "Đã xác nhận"**  
→ Pancake tự bắn **Purchase** kèm số tiền, gắn đúng cú bấm quảng cáo gốc. Không cần tạo đơn mới, không  
cần tự bắt mã quảng cáo, cũng không cần dựng sẵn "sản phẩm khoá học" đúng giá (cách đặt giá xem Phụ lục B).

**Thử tay trước (một đơn) để kiểm tra:** làm bước 2–3 bằng tay trên 1 đơn → mở **Meta Events Manager**  
xem Purchase có về không, có kèm **số tiền + nhận diện cú bấm** không. **Đây là bước kiểm tra quan trọng  
nhất trước khi tự động hoá.** Nên dùng đơn của **khách đã đóng tiền thật** để sự kiện là thật.

**Đã kiểm tra cấu hình (09/10) — thử an toàn:**

- ✅ "Tự động gửi sự kiện **Mua hàng** cho Meta" đang **BẬT** → xác nhận đơn sẽ bắn `Purchase` thật  
(đúng mục đích); "Tạo đơn POS tự động khi có SĐT" cũng **BẬT** (đúng cơ chế đơn rỗng).
- ✅ Mọi tin nhắn tự động gửi khách (Pancake *Cấu hình > Thông báo > Pancake*: Vận chuyển / CSKH /  
Cập nhật đơn / Sự kiện) **đều tắt/trống**, "Tự động gửi hóa đơn" cũng **tắt** → **xác nhận đơn sẽ  
KHÔNG gửi tin nhắn nào cho khách**.

→ **Khi thử, chỉ có hai thứ thay đổi:** trạng thái của đúng đơn đó + một sự kiện Purchase gửi lên Meta.  
**Không** nhắn tin cho khách, **không** ghi vào GMV / CRM / Sổ doanh thu. (Vẫn nên chọn mẫu sản phẩm  
không trừ kho.)

**Đơn đã chọn sẵn để thử (09/10):** đơn Pancake **#23435** (shop Nền tảng) — khách **Lê Hà Việt Trinh /  
0981058979**, trạng thái "Mới", **đến từ ads** (có sẵn mã quảng cáo), và đã **đóng tiền thật  
17.654.724đ** (khớp Sổ doanh thu) → Purchase bắn lên sẽ là sự kiện thật, có gắn đúng quảng cáo. Đơn còn  
hiệu lực tới \~15/10 (trong 7 ngày kể từ cú bấm). Giá trị đơn sẽ đặt đúng bằng 17.654.724đ.

**⛔ Đang chờ để thử được:** tài khoản Meta của Minh **chưa có quyền** vào dataset thật của PalFish (nơi  
Pancake bắn Purchase) — kiểm tra 09/10: Events Manager chỉ thấy 2 dataset cá nhân (0 sự kiện), còn BM  
"Palfish Reading" hiện nút *"Yêu cầu quyền truy cập"*. **Phải xin quyền (anh Hiếu — người giữ BM thật)  
rồi mới bắn thử + kiểm tra được.** Dataset đích xem trong Pancake *Cấu hình → tích hợp Meta (chỗ bật  
"Gửi sự kiện Mua hàng cho Meta")*.

> 🔧 **Chi tiết API Pancake (tìm đơn, điền đơn, status codes, kết quả test thật): Phụ lục B.**  
> 🔧 **Cách thay thế (tự gửi CAPI thẳng, không qua Pancake): Phụ lục C.**

---

## Tổ chức công việc — ai làm gì

| Vai trò | Ai | Lo phần gì |
|-|-|-|
| **Chủ dữ liệu doanh thu** | Minh | Lấy + làm sạch SĐT/doanh thu, dựng job đẩy, nối Pancake |
| **Người chạy quảng cáo** | `[cần chốt tên]` | Dựng Danh sách khách hàng + lookalike, gắn nhóm QC, đọc hiệu quả |
| **Người giữ quyền Meta** | `[cần chốt tên]` | Cấp quyền ad account + dataset + System User token |
| **Lập trình viên** | `[Minh hay dev khác]` | Viết job nối GMV ↔ Meta/Pancake API |
| **Quản trị Pancake** | `[cần chốt tên]` | Tạo API key, canh setting/sự kiện CAPI |
| **Người duyệt** | anh Hiếu | Chốt ưu tiên, nghiệm thu ROAS |

→ **Khoảng trống lớn nhất:** ai **giữ quyền Meta** (BM thật) và ai **chạy quảng cáo** — hai vai này  
nằm ngoài nhóm data, thiếu một trong hai là cả hai cách đều không chạy được.

**Thứ tự triển khai:** (1) mở quyền Meta (đang chặn tất cả) → (2) lấy dữ liệu SĐT + doanh thu sạch →  
(3) dựng + bật Cách 1 → (4) thử tay Cách 2 + kiểm tra ở Events Manager → (5) tự động hoá Cách 2.

---

## Về việc khớp khách bằng SĐT

Ghép "khách từ ads" và "khách ra đơn" bằng SĐT chỉ đúng **tương đối** (khách gõ sai số, sai mã nước, hoặc  
inbox một số nhưng đóng tiền số khác). Việc chuẩn hoá SĐT chỉ xử được nhóm *sai định dạng*, không xử được nhóm *hai  
số khác nhau*.

- **Cách 1 gần như không sao** (chỉ cần thông tin người đã đóng tiền, không nối ngược hội thoại).
- **Cách 2 bị giới hạn ở đây** → chỉ đẩy trường hợp SĐT liên hệ = SĐT ra đơn; không rõ thì bỏ (nối  
nhầm hại hơn đẩy thiếu).

---

## Các điểm cần chốt

**Còn tồn đọng:**

- ⛔ **Quyền Meta (điểm chặn số 1, đang chờ anh Hiếu)**: tài khoản quảng cáo + dataset thật nằm ở BM mà
nhóm data hiện chưa có quyền. **Không nhất thiết Minh phải là người làm** — chọn một trong hai hướng:
  - **(A) Cấp quyền:** anh Hiếu (người giữ BM) cấp cho người được giao (vd Minh): **(các) tài khoản
quảng cáo** + **dataset** Pancake gửi tới (tối thiểu quyền xem) + **token `ads_management`**. Người đó
làm theo báo cáo này.
  - **(B) Không muốn share quyền:** đưa **báo cáo này cho người có thẩm quyền trên BM** để họ tự bám
theo làm — các bước Cách 1 + Cách 2 và Phụ lục API đã đủ chi tiết. Nhóm data chỉ cần gửi kèm **2 tệp
L8/L4** (đã xuất sẵn) và phối hợp phần lấy / nối dữ liệu doanh thu từ hệ thống.
- Dataset đích (cần cho cả hai hướng): xem trong Pancake *Cấu hình → tích hợp Meta*.
- ⏳ **Kiểm tra ở Events Manager**: Purchase có về kèm số tiền + nhận diện cú bấm không (làm ngay khi có  
quyền; đơn thử #23435 đã chọn sẵn, còn hiệu lực tới \~15/10).
- ⬜ **Mỗi page dùng tài khoản QC / dataset nào** (chung hay riêng): 4 page = 4 shop Pancake — `4290954`  
(Nền tảng) · `407210836` (English) · `20111293` (in Vietnam) · `30161808` (3-15 tuổi).

**Đã chốt / đã gỡ:**

- ✅ Luồng Marketing API (đẩy tệp) — chi tiết Phụ lục A.
- ✅ API Pancake điền đơn + CAPI — chi tiết Phụ lục B (đã test đọc thật qua MCP connector).
- ✅ Giá trị đơn: đặt thẳng đúng bằng số tiền khách đóng (cách đặt xem Phụ lục B) → **không cần tạo sẵn  
"sản phẩm khoá học" đúng giá**. Pancake chỉ có các gói ưu đãi buổi học thử, nhưng không dùng tới vì mình  
ghi đè giá cho từng đơn.

---

## Phụ lục A — Marketing API (đẩy tệp lookalike)

Graph API của Meta (`v25.0`). Ba bước, lặp cho mỗi tệp (L8 & L4):

**1) Tạo Danh sách khách hàng (một lần/tệp):**

```
POST https://graph.facebook.com/v25.0/act_<AD_ACCOUNT_ID>/customaudiences
  subtype=CUSTOM · customer_file_source=USER_PROVIDED_ONLY
  name="L8 - đã đóng tiền" (hoặc "L4 - học thử xong") · access_token=<token>
→ trả về CUSTOM_AUDIENCE_ID
```

**2) Băm SĐT + đẩy người (job lặp bước này):**

- Chuẩn hoá: bỏ ký tự thừa, bỏ 0 đầu, thêm 84 → **SHA-256** chữ thường.

```
POST https://graph.facebook.com/v25.0/<CUSTOM_AUDIENCE_ID>/users
  payload={"schema":"PHONE","data":[["<sđt đã băm>"], ...]} · access_token=<token>
```

- Tối đa **10.000 người/lần**; nhiều hơn chia batch (`session_id` + `batch_seq`, `last_batch_flag` ở  
batch cuối). Meta xử lý tới \~24h.
- **Tệp L8 (value-based):** mỗi dòng kèm **giá trị = tổng tiền đã đóng**. *(Tên cột giá trị trong  
schema cần xác nhận lại ở doc value-based của Meta khi dựng.)*

**3) Tạo Lookalike (một lần/tệp):**

```
POST https://graph.facebook.com/v25.0/act_<AD_ACCOUNT_ID>/customaudiences
  subtype=LOOKALIKE · origin_audience_id=<CUSTOM_AUDIENCE_ID> (cần ≥100 người)
  lookalike_spec={"ratio":0.01,"country":"VN"} (ratio 0.01–0.20 = top 1–20%) · access_token=<token>
```

**Quyền cần:** System User token có `ads_management`; ad account liên kết Business Manager.

---

## Phụ lục B — Pancake POS API (điền đơn cho Cách 2)

- **Base**`https://pos.pages.fm/api/v1` · **Auth**`?api_key=<key>` (tạo trong Pancake *Cài đặt > API*,  
hiện 1 lần) · `shop_id` là số · 1.000 req/phút. Docs chính thức: `docs.pancake.biz/pos/api/`.
- **Status:**`0` Mới (→ InitiateCheckout) · `1` Đã xác nhận (→ **Purchase**) · `2` đã gửi ĐVVC (khoá).

**1) Tìm đơn rỗng của khách:**

```
GET /shops/<SHOP_ID>/orders?api_key=<key>  → lọc bill_phone_number + status=0 + tạo trong 7 ngày
```

**2) Điền 1 dòng hàng (đặt giá = số tiền thật) + xác nhận (một lần gọi):**

```
PUT /shops/<SHOP_ID>/orders/<ORDER_ID>?api_key=<key>
body: { "items":[{ "variation_id":"<mẫu bất kỳ, vd SKU trial>", "quantity":1,
                   "variation_info": { "retail_price": <SỐ TIỀN THẬT khách đóng> } }],
        "status":1 }
```

- **Giá trị đơn đặt thẳng qua `items[].variation_info.retail_price`** (schema: *"recommended … so the  
line price is correct"*) → **không cần sản phẩm "khoá học" đúng giá**; dùng mẫu bất kỳ (nên chọn mẫu  
không trừ kho) rồi ghi đè giá bằng số tiền GMV thật. (Các trường bổ trợ nếu cần: `surcharge`,  
`total_discount`, `discount_each_product`.)
- **Ràng buộc:** không đổi items sau khi đã xác nhận (status≥1) → gửi `items`+`status:1`**cùng một PUT**.
- ✅ **Đã test thật (09/10, qua MCP connector, chỉ GET):** đọc đơn OK; đơn **từ ads mang `ad_id` +  
`ads_source="Facebook"`** (≈8/30 đơn gần nhất) → có sẵn mã nhận diện để Pancake gắn Purchase. Đơn  
organic thì `ad_id` trống (lọc bỏ).
- ⏳ Chưa gọi `PUT` thật (sẽ bắn Purchase thật — làm khi anh cho phép, trên 1 đơn khách L8 thật).

---

## Phụ lục C — Cách 2 "hướng tự chủ" (tự gửi CAPI thẳng, nếu không muốn qua Pancake)

Tự gửi sự kiện lên Meta, không phụ thuộc Pancake:

1. **Bắt mã cú bấm `ctwa_clid`** từ tin nhắn đầu của khách (chỉ về một lần — lưu cùng SĐT + mã hội thoại).
2. Khi khách đóng tiền trong 7 ngày, gọi Conversions API:

```
POST https://graph.facebook.com/<ver>/{DATASET_ID}/events?access_token=...
  event_name="Purchase" · action_source="business_messaging" · messaging_channel="messenger"
  user_data: page_id + page-scoped user id (hoặc ctwa_clid) + SĐT đã mã hoá
  custom_data: value=<số tiền>, currency="VND" · event_id=<mã đơn, chung với Pancake để khỏi đếm trùng>
```

1. Đơn chốt chậm hơn 7 ngày → gửi mốc sớm còn trong 7 ngày (vd L4 Học thử xong) làm dấu hiệu chất lượng.

*(Hiện không cần hướng này vì hướng gọn chạy được — giữ đây làm phương án dự phòng.)*

---

## Nguồn

- Meta Marketing API — Custom Audiences / Lookalike (`developers.facebook.com`).
- Meta — Conversions API cho tin nhắn kinh doanh.
- Pancake POS API — `docs.pancake.biz/pos/api/` (xác minh bằng call API thật).
- Dữ liệu phân bố thời gian lead→đơn + L4/L8: BigQuery `crm_leads` (anh Hiếu/Chung), đo 2026.
