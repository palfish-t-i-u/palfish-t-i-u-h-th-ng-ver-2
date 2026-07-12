# PLAN — Thừa/thiếu tính theo NET (quẹt thẻ / trả góp)

- **Ngày**: 2026-07-12 · **Branch gốc**: main · **Trạng thái**: chưa code (plan only)
- **Chủ task**: anh Minh (dev) · **Nguồn spec**: anh Hiếu (TOP1), 4 ảnh workflow gửi 12/07
- **Một câu**: Đổi mốc tính "thừa/thiếu" + trạng thái đơn từ **gross → net** (tiền thực nhận sau phí), sửa **cả BE + FE** cho hết bug "phí bị cộng nhầm thành thừa".

---

## 1. Bối cảnh (đọc cái này là hiểu cả task)

**Vấn đề gốc**: giao dịch quẹt thẻ/trả góp có phí. Hệ thống cũ tính thừa/thiếu trên **gross** (số khách bấm chuyển) → phí bị tính nhầm thành khách trả dư.

**3 con số** anh Hiếu chốt tách bạch:
| Số | Nghĩa | Nguồn |
|----|-------|-------|
| **gross** (khách chuyển) | khách bấm chuyển bao nhiêu | sale nhập lúc tạo lần TT |
| **net** (thực nhận) | tiền về thật sau phí | mPOS — kế toán ghép giao dịch điền vào |
| **phí** | = gross − net | hệ thống tự tính, **chỉ ra được sau khi có net** |

**Ví dụ chuẩn của anh Hiếu**: dự kiến (giá gói) 18.544.000 · gross 19.600.000 · net 19.160.000 · phí 440.000
→ **Thừa thật = net − dự kiến = +616.000** (KHÔNG phải +1.056.000 như cách cũ cộng nhầm 440k phí).

**Quy trình 8 bước** (ảnh 3):
1. Sale nhập dự kiến = giá gói.
2. Sale tạo lần TT, chọn phương thức, nhập gross.
3. Hệ thống: **net ước tính = gross** (chưa biết phí → tạm coi chưa trừ) → không chặn sale.
4. net (ước tính) ≥ dự kiến → **mở kích hoạt ngay** (trạng thái "Đủ tạm").
5. Kế toán ghép mPOS → điền **net thật**.
6. Net thật thay net ước tính. Chỉ đối soát — **kích hoạt đã cấp KHÔNG bị khóa lại** (guardrail G1).
7. Hệ thống chốt: **Phí = gross − net · Thừa/thiếu = net − dự kiến**.
8. Trạng thái đơn gắn theo **net**.

**5 trạng thái** (ảnh 4):
| Case | net vs dự kiến | Trạng thái | Xử lý |
|------|----------------|-----------|-------|
| Chuyển khoản thường | net = gross | Đủ | chốt ngay, không cần kế toán |
| Thẻ/trả góp, lệch = đúng phí | = sau trừ phí | Đủ | "Thừa" cũ biến mất → về Đủ |
| Thẻ/trả góp, net vẫn dư | net > dự kiến | **Thừa thật** | báo +số dư để hoàn/ghi nhận |
| Net chưa đạt dự kiến | net < dự kiến | Thiếu | chờ thu thêm (KHÔNG khóa kích hoạt đã cấp) |
| Chờ kế toán ghép | ước tính ≥ dự kiến | **Đủ (tạm)** | mở kích hoạt trước, kế toán chốt sau |

**Chốt với anh Hiếu (12/07)**:
- **KHÔNG có bảng phí%.** Phí = gross − net, chỉ tính được sau khi kế toán ghép. Trước đó net ước tính = gross. → Bỏ hẳn phần "ước tính phí theo phương thức" trong ảnh bước 3 (giá gói vẫn giữ, chỉ khác cách hiểu net ước tính).
- Sửa **triệt để cả backend**, không chỉ màn hình.
- Dấu: net > dự kiến → Thừa (+), net < dự kiến → Thiếu (−), bằng → Đủ. Dev tự lo phần dấu.

---

## 2. Quy tắc LÕI (single source of truth — dùng chung BE + FE)

> **netCủaLine(line)** = `verified_received` NẾU (method ∈ {card, installment} VÀ verified_received đã có) NGƯỢC LẠI `amount` (gross).
>
> **received** = tổng netCủaLine của các line status=paid, chưa hủy.
> **delta = received − target** · **state**: received≤0→pending · <target→short · =target→done · >target→over.
> **Phí (hiển thị)** = gross − net, chỉ show khi net đã có (verified). net > gross → phí âm → clamp 0 + cờ cảnh báo (G5).

`method ∈ {card, installment}` = cả **quẹt thẻ + trả góp** (fee methods). ⚠️ Code FE hiện chỉ check `installment` — thiếu `card`, phải thêm.

---

## 3. Hiện trạng code (đã có sẵn gì)

Task "Tên bé" trước đã dựng sẵn ~70% hạ tầng net:
- ✅ Cột DB `verified_received`, `verified_total`, `sale_received` trên `payment_lines` (đã tồn tại, **không cần migration**).
- ✅ Kế toán ghép mPOS điền net: `gateway_routes.py:489-492` (set `verified_total`/`verified_received`), endpoint confirm `payment_request_routes.py:2381-2386` (set + **đã gọi `recompute` sẵn**).
- ✅ FE `displayReceived()` [paymentRequestUtils.ts:720] ưu tiên net khi verified — NHƯNG chỉ cho `installment`, và **comment ghi rõ "KHÔNG dùng cho state"**.
- ✅ FE `hasUnverifiedInstallment()` [:729] — dùng làm cờ "Đủ tạm".
- ✅ Zalo builder đã net-aware [utils/zalo_message_builder.py:174-179].

❌ Chưa có (đúng phần task này):
- **Thừa/thiếu + state vẫn tính trên gross** ở CẢ 2 nơi: BE `_sum_paid_amount` [payment_request_routes.py:258] cộng `amount`; FE `normalizeRequest` [paymentRequestUtils.ts:208] cộng `p.amount`.
- Layout 3 ô ở drawer (dự kiến / net kèm gross−phí / thừa-thiếu net).
- Card breakdown từng lần TT (gross − phí = net).
- Trạng thái "Đủ (tạm)" hiển thị.
- `card` chưa được `displayReceived` tính net (chỉ `installment`).

---

## 4. Thay đổi cần làm

### 4A. Backend — `payment_request_routes.py`

**Đây là chốt triệt để: sửa 1 hàm, cả hệ thống theo.** `recompute_payment_request_totals` [:1235] đã được gọi ở mọi nơi (thêm/sửa/hủy line: :1311/:1341/:1789/:2120/:2205; kế toán set net: :2386; SePay: sepay_routes.py:382/:619). Nên chỉ cần đổi cách cộng.

1. **`_sum_paid_amount` [:258-268]** → cộng NET thay gross. Thân hàm mới: với mỗi line paid, lấy `verified_received` nếu (`method` ∈ {card,installment} và verified_received truthy) else `amount`. Giữ pandas hoặc chuyển loop thường (list nhỏ). Trả về tổng net.
   - ⚠️ line **1921** cũng gọi `_sum_paid_amount(lines)` — tự động đúng theo, kiểm tra ngữ cảnh không vỡ.
2. **`_compute_state` [:248]** giữ nguyên (received giờ là net).
3. **Thêm helper `_line_net(line)`** để dùng lại, tránh lặp logic (khớp quy tắc mục 2).
4. **Không đổi** `delta = received − target` [:297] — tự đúng.
5. Kiểm tra response mapper [:696-698, :736-738] có trả `verified_received`, `amount` (gross) đủ cho FE dựng breakdown — thêm nếu thiếu.

### 4B. Frontend — `paymentRequestUtils.ts`

1. **Tách helper `lineNet(p)`** = quy tắc mục 2 (fee method + verified → net, else gross). Dùng chung.
2. **`normalizeRequest` [:208]**: `received = live.filter(paid).reduce((s,p)=>s+lineNet(p),0)`. state/delta tự đúng.
3. **`displayReceived` [:720]**: viết lại theo `lineNet`, **thêm `card`** (bỏ chỉ-`installment`). Bỏ comment "KHÔNG dùng cho state" (giờ dùng chung).
4. **Thêm `grossReceived(pr)`** (tổng gross paid) + **`feeTotal(pr)` = gross − net** (clamp ≥0) để dựng ô "gross − phí".
5. **`hasUnverifiedInstallment` → đổi tên/mở rộng `hasUnverifiedFeeLine`** (gồm card). Giữ alias cũ nếu nơi khác import.

### 4C. Frontend — hiển thị

- **`PaymentRequestDetailDrawer.tsx` [~1783-1792]**: dựng **3 ô** (ảnh 1):
  - Tổng dự kiến (`target`).
  - Đã nhận (net) + dòng phụ `Khách chuyển (gross) … / Phí … −`. Nếu còn unverified → badge "chưa trừ phí / Đủ (tạm)".
  - Thừa/thiếu = `net − target`, label Thừa(+)/Thiếu(−)/Đủ.
- **Từng lần TT** (ảnh 2): card `gross − phí = net`, badge "✓ Đã ghép" khi verified, "chờ kế toán" khi chưa. Tận dụng chỗ [ReconciliationTab.tsx:1112-1119] + drawer line render.

---

## 5. Guardrails (bắt buộc — tiêu chí "không lỗi con")

- **G1 — Không khóa lại kích hoạt đã cấp**: khi net về làm state tụt done/over → short, activation đã tạo KHÔNG bị revoke. Kiểm tra `activation_routes.py` + `activeRequestAllocation` [paymentRequestUtils.ts:345] có phụ thuộc `received` để chặn không. Nếu có → tách "đã kích hoạt" khỏi "đủ tiền". Viết test G1.
- **G2 — 1 nguồn quy tắc net**: BE `_line_net` và FE `lineNet` phải KHỚP tuyệt đối (fee method set, điều kiện truthy). Ghi comment trỏ chéo 2 file. Drift = bug lệch số BE/FE.
- **G3 — verified_received = 0/null**: BE [:2382] `_parse_amount(...) or None` biến 0→None (coi như chưa ghép). Giữ đúng vậy; net=0 vô nghĩa. Test biên.
- **G4 — Cả state LẪN display đổi sang net** cùng lúc: không để 1 chỗ gross 1 chỗ net (nguồn lệch cũ). Xóa comment cảnh báo [:719].
- **G5 — Phí âm**: net > gross (kế toán nhập sai) → phí = 0 + cờ cảnh báo đỏ, không hiển thị số âm.
- **G6 — Thông báo**: Zalo đã net-aware; kiểm **DingTalk builder** (dingtalk_notifier) + BC01/02/03 (report_routes/revenue_routes) có xài `received`/gross không — nếu có, tự theo BE mới, verify số không vỡ.
- **G7 — Chuyển khoản (qr) không đổi**: method qr/cash → net = gross luôn (không có verified). Test đảm bảo hành vi cũ y hệt (regression).

---

## 6. Tests

**BE** (`backend/tests/`, chạy `pytest`):
- `test_line_net`: hỗn hợp line — qr(gross), installment verified(net), installment chưa verified(gross fallback), card verified(net). Assert tổng.
- `test_state_flip_after_verify`: PR gross ≥ target (over/done tạm) → kế toán set net < target → state short + **G1: activation vẫn còn**.
- `test_thua_thiet_dung_phi`: case "lệch = đúng phí → Đủ" (ảnh 4 dòng 2) → delta = 0.
- Regression: mở rộng `test_gateway_routes.py` (đã có verified_received) assert `received`/`state` PR sau ghép.

**FE** (`frontend`, `npm run test`):
- `paymentRequestUtils.test.ts`: `lineNet`, `normalizeRequest` net-based, `displayReceived` gồm card, `feeTotal`, phí âm (G5) — phủ 5 case ảnh 4.
- Drawer component test: render 3 ô, số thừa = net−target, dòng gross−phí, badge "Đủ tạm".
- Regression qr thuần (G7).

**E2E** (tùy, `npm run e2e`): PR trả góp → kế toán ghép mPOS → drawer hiện thừa đúng + phí. Chỉ thêm nếu còn thời gian.

**Cổng trước push**: `cd frontend && npx tsc -b && npm run test` · `cd backend && pytest`.

---

## 7. Ngoài phạm vi (KHÔNG làm — tiêu chí "không tăng gánh nặng hạ tầng")

- ❌ Bảng phí% / config phí theo phương thức (anh Hiếu xác nhận không cần).
- ❌ Migration DB (cột verified_* đã có).
- ❌ Legacy tabs (Module3/4, PayosHistory…).
- ❌ Đổi luồng kế toán ghép mPOS (đã chạy) — chỉ dùng lại output net.

---

## 8. Self-check 4 tiêu chí

- **Triệt để**: sửa tại chốt cộng tiền (BE `_sum_paid_amount` + FE `lineNet`) → mọi nơi hiển thị/report/thông báo theo sau. ✅
- **Không lỗi con**: G1–G7 khóa các rủi ro (revoke kích hoạt, lệch BE/FE, phí âm, regression qr). ✅
- **Không tăng hạ tầng**: 0 cột mới, 0 config, tái dùng verified_received + recompute có sẵn. ✅
- **Tối ưu token/việc**: 3 hàm lõi + lớp hiển thị; không dựng bảng phí; tận dụng hạ tầng task trước. ✅

---

## 9. Resume note (đổi máy / hỏi lại thì đọc mục này)

- **Task là gì**: đổi thừa/thiếu + trạng thái PR từ gross → net cho quẹt thẻ/trả góp. Chi tiết mục 1.
- **Đã chốt gì**: không bảng phí% (phí=gross−net sau khi kế toán ghép), sửa cả BE, dấu Thừa/Thiếu dev tự lo. Mục 1 cuối.
- **File phải đụng**: BE `backend/payment_request_routes.py` (`_sum_paid_amount:258`, `_compute_state:248`, `recompute_payment_request_totals:1235`). FE `frontend/src/components/payment-request/paymentRequestUtils.ts` (`normalizeRequest:205`, `displayReceived:720`, `hasUnverifiedInstallment:729`) + `PaymentRequestDetailDrawer.tsx` (card ~1783) + `ReconciliationTab.tsx` (line render ~1112).
- **Chốt kỹ thuật**: `recompute_payment_request_totals` đã được gọi khi kế toán set `verified_received` [:2386] → chỉ cần đổi `_sum_paid_amount` sang net là BE tự đúng toàn hệ.
- **Chưa bắt đầu code.** Bước tiếp: làm mục 4A (BE) trước → test → 4B/4C (FE) → test → tsc -b.
- **Learning Law**: xong chạy skill `extract-approach` (CLAUDE.md).
