# PLAN — Đồng bộ định nghĩa doanh thu (A0/A2): làm app đủ chuẩn để thay All File

**Origin:** Bảng chốt định nghĩa doanh thu (Thu Hiền điền 29/7) + rà code app 29/7.
**Quyết định đã chốt:** Mục 1+8 = **Cách B** (Thu Hiền 17:15 29/7): Sổ chỉ ghi khi đơn đã thu đủ 100% — đúng hành vi app hiện tại. Còn **4 mục lệch phải sửa: 2, 3, 6, 7**.
**Mục tiêu cao hơn (kim chỉ nam):** app phải là **nguồn số duy nhất**, đủ tin để **thay thế hoàn toàn** file Excel "All File Thu Hiền" và luồng ghi tay. Mọi thiết kế bên dưới phục vụ mục tiêu đó — không chỉ vá điểm lệch.

**Bối cảnh (ĐÃ verify — rà code 29/7):** path:line dưới đây grep xác nhận trên nhánh `sandbox` 29/7. ⚠️ **Số dòng đã lệch ~10 dòng khi verify lại 30/7** — người thực thi lấy số dòng ĐÚNG trong 2 handoff (verify 30/7): `docs/HANDOFF_REV-01_DUC_LOC_TEST_GOM_MOC_THOI_GIAN.md` (Đức) + `docs/HANDOFF_REV-02_DAT_HOAN_HUY_GHI_GIAM.md` (Đạt).

> **⚠️ CẬP NHẬT 2/8/2026 — đọc mục cuối "CẬP NHẬT TRIỂN KHAI (2/8)" TRƯỚC.** Cả 4 việc REV-01..04 đã code + test xong trên `sandbox` (280 pytest pass; `report_routes.py` đã hòa REV-01 is_test + REV-04 net). Phân công Đức/Đạt + thứ tự merge-rebase bên dưới **đã thực hiện xong** → chỉ còn giá trị tham khảo thiết kế. Việc 2b **KHÔNG backfill** (Thu Hiền chốt forward-only). Kế hoạch triển khai hiện hành = mục cuối file.

---

## Nguyên tắc xuyên suốt (áp cho cả 4 việc)

Để app tự khớp với chính nó (điều kiện tiên quyết trước khi so với All File), mọi báo cáo doanh thu phải dùng **CHUNG**:
1. **1 cột thời gian chuẩn** (kỳ doanh thu) — hiện 4 báo cáo xài 4 cột khác nhau.
2. **1 bộ lọc chuẩn** — `is_test = false` + loại team ngoài VN (`NON_VN_TEAMS`) — áp giống hệt ở mọi báo cáo.
3. **1 định nghĩa số tiền** — net phí cổng, thống nhất gross/net.
4. **Ghi giảm cùng cơ chế** — hoàn/hủy là dòng âm cùng bảng, không xóa, không sửa dòng gốc.

→ Chốt kiến trúc: gom logic "kỳ doanh thu" và "bộ lọc doanh thu" vào **1 hàm dùng chung** trong `revenue_routes.py`, cả BC01/BC02/BC03/Sổ/Dashboard đều import. Sửa 1 chỗ, cả hệ thống đổi theo. Đây là điểm "triệt để".

---

## Hiện trạng đã verify — bảng lệch

| Báo cáo | Endpoint | Cột thời gian đang dùng | Lọc is_test? |
|---|---|---|---|
| Sổ doanh thu (list) | `/revenue/ledger` `revenue_routes.py:1271` | `pay_time` (`_ledger_query` :521, :527-530) | ❌ không |
| BC01 (sales-performance) | `revenue_routes.py:1565` | `ngay_tien_ve` (`_row_month_date` :195-197) | ❌ không |
| BC02 (key-data) | `revenue_routes.py:1592` | `pay_time` fallback `ngay_tien_ve` (`_row_pay_date` :191-192) | ❌ không |
| BC03 | `report_routes.py:414` | `ngay_tien_ve` (`_load_ledger_revenue` :237-241) | ❌ không |
| Dashboard (bảng thi đua) | `dashboard_routes.py:467` | `payment_lines.created_at` (:485-486) — **nguồn khác: đọc payment_lines, KHÔNG đọc Sổ** | ✅ có (:487) |

**Cột trong `so_doanh_thu`** (`docs/supabase_schema_patch_v7_so_doanh_thu.sql:9-50` + `supabase/migrations/20260602_add_is_test_column.sql`):
`ngay_tien_ve` (date, trụ pivot) · `pay_time` (timestamptz — auto-sync ghi `{ngày}T00:00:00`, **không mang giờ thực**) · `so_tien_vnd` (bigint, VND) · `gmv_rmb` · `ty_gia_vnd_rmb` · `payment_method` · `loai_nhap` (`tu_dong`/`tay`/`import:*`) · `is_test` (bool, **đã có**) · `don_hang_id`, `ma_don_hang`, `crm_order_id`, `sale_crm_name`, `team`...

**Điểm chốt cho từng việc:**
- `is_test` **đã được auto-sync ghi đúng** vào Sổ (`revenue_routes.py:982` từ `pr.is_test`, `:1175`/`:1455` từ email `@dev`) → mục 7 chỉ thiếu **bộ lọc đọc**, không cần backfill cột.
- `payment_method` **có sẵn** trong Sổ (`:971`, `:1444`) → mục 3 lọc dòng thẻ theo phương thức được.
- Phí cổng nằm ở `gateway_transactions.fee` + `net_amount` (`docs/migrations/2026-06-16-gateway-transactions.sql:14-15`; `mpos_import.py:283-285` tính `net = amount - fee - installment_fee`). **`payment_lines` KHÔNG có cột fee; `so_doanh_thu` KHÔNG có cột fee** → phí chưa từng chảy vào Sổ.
- `pay_time` auto-sync = nửa đêm của `ngay_tien_ve`, **mất giờ thực** → không cắt mốc 22h từ dữ liệu hiện có được (xem mục 2, câu hỏi mở).

---

## ĐỊNH NGHĨA ĐÃ CHỐT (Thu Hiền 29/7) — hết gate, code được cả 4 việc

- **Q1 mốc 22h (mục 2) = ĐỔI NGÀY GHI NHẬN.** Nguyên văn: "Chốt doanh thu báo cáo theo ngày lấy mốc 22h, sau 22h tính doanh thu vào ngày kế tiếp. Riêng ngày cuối tháng chốt tới 00h." → Luật: giao dịch **sau 22h VN → tính sang ngày hôm sau**; **ngày cuối tháng** ngưỡng nới tới **00h** (tiền 22h–24h ngày cuối tháng vẫn thuộc tháng đó, không đẩy sang tháng mới). ⇒ **phải có giờ thực** giao dịch để áp luật (hiện `pay_time` = nửa đêm, mất giờ) → việc 2b là code thật.
- **Q2 net phí (mục 3) = thẻ + trả góp, CÓ trừ phí trả góp.** Áp cho quẹt thẻ + trả góp; CK/tiền mặt phí=0. `net = amount − fee − installment_fee` — **đúng công thức `mpos_import.py:283-285` đã tính sẵn (`computed_net`)** → dùng lại, khỏi tính mới.
- **Q3 hoàn/hủy (mục 6) = truy về kỳ gốc.** Nguyên văn: "Truy về ngày ghi nhận doanh thu gốc và ghi giảm ở kỳ đó." → dòng âm mang `ngay_tien_ve = ngày gốc`, tổng kỳ gốc đổi hồi tố. Chốt cứng.

---

## VIỆC 7 — Lọc đơn test khỏi Sổ + BC01/02/03  ·  BE  ·  Nhỏ nhất  ·  KHÔNG cần gate

**Root:** cột `is_test` đã đúng dữ liệu, nhưng 4 báo cáo không lọc → đơn `@dev` (test.user@dev...) lọt vào số doanh thu.

**Thiết kế:** thêm `.eq("is_test", False)` vào đúng nơi query đọc Sổ:
- `_ledger_query` (`revenue_routes.py:521`) — thêm mặc định lọc `is_test=false`, có tham số `include_test=False` để màn admin/audit vẫn xem được khi cần.
- BC01 fetch (`revenue_routes.py:1577-1582`), BC02 fetch (`:1604-1609`) — dùng chung `_ledger_query` nên tự hưởng; xác minh không bypass.
- BC03 `_load_ledger_revenue` (`report_routes.py:237-241`) — thêm `.eq("is_test", False)`.
- Gom thành 1 hàm `apply_revenue_filters(query, include_test=False)` để 4 chỗ gọi giống nhau (nguyên tắc 2).

**Guardrails:**
- Dòng import (`loai_nhap LIKE 'import:%'`, `tay` thật) có `is_test=false` → không bị lọc nhầm. ✅ (mặc định cột = false).
- Màn "Sổ doanh thu" cho kế toán: thêm toggle "Hiện đơn test" (off mặc định) để không mất khả năng soi.
- KHÔNG đụng Dashboard (đã lọc sẵn :487).

**Test (pytest, `backend/tests/test_ledger_is_test_filter.py` mới):**
1. Seed 3 dòng Sổ: 2 thật + 1 `is_test=true`. `/revenue/ledger` mặc định trả 2, tổng không tính dòng test.
2. `include_test=true` → trả 3.
3. BC01/BC02/BC03 tổng loại trừ dòng test.
4. Dòng `import:*` với `is_test=false` vẫn xuất hiện.

**Ước lượng:** 0.5 ngày. 1 file BE + 1 toggle FE (`SoDoanhThuTab.tsx`).

---

## VIỆC 2 — Thống nhất mốc/kỳ thời gian  ·  BE  ·  To nhất  ·  Q1 chốt (đổi ngày sau 22h)

Chia 2 phần. 2a (gom 1 cột) = đợt 1; 2b (áp luật 22h, cần giờ thực + backfill) → đợt 2 ngay sau.

### 2a — Gom về 1 cột thời gian chuẩn
**Root:** Sổ+BC02 lọc/bucket theo `pay_time`; BC01+BC03 theo `ngay_tien_ve` → cùng 1 CK rơi kỳ khác nhau tùy báo cáo.

**Thiết kế:** chọn **`ngay_tien_ve`** làm trụ kỳ doanh thu duy nhất (đã là trụ pivot của BC01/BC03; là `date` đúng ngữ nghĩa "ngày tiền về"; `pay_time` auto-sync vốn = nửa đêm của nó, không thêm thông tin).
- Sổ list `_ledger_query`: đổi lọc `pay_time` → `ngay_tien_ve` (:527-530).
- BC02 `_row_pay_date` (:191-192): bucket theo `ngay_tien_ve` (bỏ nhánh `pay_time`).
- Viết 1 hàm `ky_doanh_thu(row) -> date` trả `ngay_tien_ve`; BC01/BC02/BC03/Sổ đều gọi. 2b sau này chỉ sửa hàm này.

**Guardrail chống lỗi con:** đổi cột lọc làm **số theo NGÀY xê dịch** với các dòng có `pay_time` lệch ngày `ngay_tien_ve` (dòng import cũ). Trước khi đổi, chạy query đếm số dòng `pay_time::date <> ngay_tien_ve` để biết ảnh hưởng; nếu nhiều, backfill `pay_time = ngay_tien_ve` cho dòng auto. Tổng THÁNG hầu như không đổi (chỉ ngày trong tháng dịch).

### 2b — Luật mốc 22h / cuối tháng (Thu Hiền CHỐT: đổi ngày)
Luật: giao dịch **sau 22h VN → ngày hôm sau**; ngày **cuối tháng** ngưỡng tới **00h** (22h–24h cuối tháng giữ nguyên tháng đó).
1. Sửa auto-sync ghi `pay_time` = **giờ thực** giao dịch giờ VN (`payment_lines.paid_at` / `giao_dich.thoi_gian_giao_dich`), thay `{ngày}T00:00:00` (`revenue_routes.py:963`, `:1156`).
2. `ngay_tien_ve = ky_doanh_thu(pay_time)` áp luật 22h + cuối tháng 00h, dùng `ZoneInfo("Asia/Ho_Chi_Minh")` (mẫu `dashboard_routes.py:41`; `revenue_routes` chưa có tz VN → thêm).
3. Backfill `ngay_tien_ve` dòng lịch sử từ giờ thực; dòng import không có giờ thực giữ nguyên.
**Đợt 2** (đụng auto-sync + backfill) → sau đợt 1. Người: Đức.

**Test (`backend/tests/test_revenue_period_bucket.py`):**
1. Cùng bộ dòng → BC01/BC02/BC03/Sổ trả cùng kỳ cho mỗi dòng (2a).
2. (2b) giao dịch 21:59 → ngày N; 22:01 → ngày N+1; 31/M 22:30 → vẫn tháng M (không nhảy tháng M+1); 1 tháng mới 00:30 → tháng mới.
3. Timezone: 23:30 giờ VN (=16:30 UTC) rơi đúng ngày VN.

**Ước lượng:** 2a = 1 ngày (đợt 1). 2b = 1.5–2 ngày (đợt 2: auto-sync + backfill + tz).

---

## VIỆC 3 — Ghi doanh thu NET (trừ phí cổng thẻ)  ·  BE  ·  Vừa  ·  Q2 chốt (thẻ+trả góp, trừ cả phí trả góp)

**Root:** phí cổng chỉ nằm ở `gateway_transactions.fee`, không chảy vào Sổ → Sổ ghi gross, doanh thu bị thổi phồng phần phí với đơn quẹt thẻ.

**Thách thức "không lỗi con": phí về SAU.** Dòng Sổ được auto-sync ghi lúc kích hoạt/đủ tiền; nhưng phí chỉ biết khi **sao kê cổng (mPOS/Payoo) được import** (`gateway_transactions`) — có thể muộn hơn. → Không thể tính net chắc chắn tại thời điểm ghi.

**Thiết kế (giữ gross cho audit + đối soát ngân hàng, thêm net):**
- Migration thêm cột Sổ: `phi_cong` (bigint default 0) + `so_tien_net` (bigint) + `gateway_txn_id` (uuid, link dòng sao kê).
- `so_tien_vnd` giữ **gross** (khớp PR + đối soát). `so_tien_net = so_tien_vnd - phi_cong`. Với CK/tiền mặt: `phi_cong=0`, net=gross.
- **Điểm ghép phí:** tại bước đối soát/import sao kê cổng, dùng lại `computed_net` sẵn trong `mpos_import.py:283-285` (`net = amount − fee − installment_fee` — Q2 chốt trừ cả phí trả góp), stamp `phi_cong` + `so_tien_net` + `gateway_txn_id` lên dòng Sổ tương ứng (khớp theo `don_hang_id`/`ma_don_hang`/số tiền). Chỉ dòng `payment_method ∈ {thẻ, trả góp}`.
- **Báo cáo đọc net:** BC01/BC02/BC03/Sổ tổng theo `so_tien_net` (khi null → fallback `so_tien_vnd`, để dòng chưa ghép phí vẫn có số). Thêm cột "Phí" + "Thực nhận" hiển thị trên Sổ.

**Guardrails:**
- Đơn thẻ chưa có sao kê → `so_tien_net` null → tạm dùng gross, có nhãn "chờ phí". Khi sao kê về, stamp lại. Không double-trừ (idempotent theo `gateway_txn_id`).
- Không đổi `so_tien_vnd` gốc → đối soát ngân hàng và liên kết PR không vỡ (không lỗi con).
- RMB: `gmv_rmb` quy từ `so_tien_net` khi stamp (doanh thu RMB theo net, đồng bộ với VND net).

**Test (`backend/tests/test_ledger_net_fee.py`):**
1. Dòng thẻ gross 10.000.000, sao kê fee 200.000 → sau stamp `so_tien_net=9.800.000`, gross giữ nguyên.
2. Dòng CK → `phi_cong=0`, net=gross.
3. Stamp 2 lần cùng `gateway_txn_id` → không trừ chồng (idempotent).
4. BC01/BC02 tổng dùng net; dòng chưa ghép phí fallback gross.

**Ước lượng:** 1.5–2 ngày. Migration + `mpos_import.py` stamp + báo cáo đọc net + FE hiển thị cột phí.

---

## VIỆC 6 — Cơ chế hoàn/hủy giảm doanh thu  ·  FE + BE  ·  Nhỏ (hiếm)  ·  Q3 chốt (về kỳ gốc)

**Root:** app không có đường ghi giảm; hủy PR bị chặn cứng khi đã có tiền (`payment_request_routes.py:2056`/`:2065`; `main.py:870`); xóa Sổ chỉ cho `loai_nhap=tay` (`revenue_routes.py:1555`).

**Thiết kế (dòng âm, không xóa — an toàn audit):**
- Nút "Ghi giảm / Hoàn tiền" trên dòng Sổ (RBAC: kế toán/leader).
- Endpoint `POST /revenue/ledger/{id}/refund` với `amount` (≤ số dòng gốc), `reason`.
- Tạo **dòng mới** `so_tien_vnd = -amount`, `gmv_rmb` âm tương ứng, `loai_nhap='hoan'` (giá trị mới trong CHECK), `ngay_tien_ve = ngày gốc` (kỳ gốc — theo Thu Hiền), `hoan_ref_id = id gốc`. **Giữ nguyên dòng gốc.**
- Báo cáo tổng SUM tự cộng dòng âm → kỳ gốc tự tính lại (báo cáo đọc Sổ live).

**Guardrails:**
- **Chống hoàn quá tay:** tổng đã hoàn (`sum` các dòng `hoan_ref_id=id`) + `amount` mới ≤ số gốc. Hỗ trợ hoàn 1 phần.
- Migration: mở CHECK `loai_nhap` thêm `'hoan'`; thêm cột `hoan_ref_id` (uuid null).
- Dòng `hoan` cũng mang `is_test` + `team` + `sale_crm_name` **theo dòng gốc** (để lọc test và quy sale nhất quán).
- `ngay_tien_ve = ngày gốc` (Thu Hiền chốt: truy về kỳ gốc — số kỳ gốc đổi hồi tố). Chốt cứng, không còn nhánh "kỳ hiện tại".
- 1 dòng quy tắc kế toán (Thu Hiền): kỳ gốc đã trả hoa hồng thì xử lý com ngoài app (app chỉ lo doanh thu).

**Test (`backend/tests/test_ledger_refund.py`):**
1. Hoàn full → tổng kỳ gốc = 0; dòng gốc còn nguyên; 2 dòng trong Sổ.
2. Hoàn 1 phần 2 lần, tổng ≤ gốc; lần vượt gốc → 400.
3. Dòng hoàn kế thừa `team`/`sale`/`is_test` từ gốc.
4. RBAC: role Sale gọi → 403.

**Ước lượng:** 1 ngày. Migration + endpoint + nút FE (`SoDoanhThuTab.tsx`) + drawer xác nhận.

---

## Thứ tự triển khai — 2 tuyến song song (không ai chờ ai)

Định nghĩa đã chốt 29/7 → không còn gate. Chia theo **topo code**: cụm read-query `revenue_routes.py` (7+2a+2b) **không cắt được** (cùng sửa `_ledger_query`/`ky_doanh_thu`) → 1 người = **Đức**. Phần độc lập (route mới + migration + stamp + file khác) → **Đạt**. Workload ~cân, mắt nối tối thiểu.

| Tuyến | Người | Việc (thứ tự nội bộ) | Handoff | Ngày |
|---|---|---|---|---|
| 0 | Minh | Backup `so_doanh_thu` (trước mọi migration) | — | 0.1 |
| **Đức** | Đức | Việc 7 + 2a → rồi 2b | REV-01, REV-03 | ~3.25 |
| **Đạt** | Đạt | Việc 6 → rồi Việc 3 | REV-02, REV-04 | ~3 |

**Mắt nối duy nhất:** REV-04 (việc 3, Đạt) sửa 1 dòng chung với REV-01 (Đức) ở `report_routes.py` `_load_ledger_revenue` → **Đức merge REV-01 trước, Đạt rebase REV-04**. Ngoài mắt đó, 2 tuyến chạy độc lập.

**Cột mốc ý nghĩa:** xong 7 + 2a + 6 → app **tự khớp với chính nó** (điều kiện để bước A1 đối chiếu Sổ ↔ All File có nghĩa); xong thêm 2b → số **khớp luật 22h Thu Hiền**; xong thêm việc 3 → số là **net phí** đúng định nghĩa. Sau mỗi mốc chạy lại BC01/02/03 sandbox xác nhận cùng 1 CK ra cùng kỳ + cùng số ở mọi báo cáo.

---

## Phân công — 2 tuyến, workload ~cân, không ai chờ ai

Chia theo **topo code** (không theo phân môn cũ ở `docs/PROJECT.md`): cụm read-query `revenue_routes.py` (7 + 2a + 2b cùng sửa `_ledger_query` / `ky_doanh_thu`) **không cắt được** → dồn 1 người. Phần độc lập (route mới + migration + stamp + file khác) tách sang người kia.

- **Tuyến Đức — Việc 7 + 2a → 2b** (`REV-01` rồi `REV-03`). Toàn bộ cụm read-query 1 tay: `apply_revenue_filters`, `ky_doanh_thu`, gom `ngay_tien_ve`, luật 22h + backfill. ~3.25 ngày. **Không migration cột mới** (chỉ đổi giá trị ghi + backfill).
- **Tuyến Đạt — Việc 6 → Việc 3** (`REV-02` rồi `REV-04`). Route refund mới + 2 migration (`hoan_ref_id`; `phi_cong`/`so_tien_net`/`gateway_txn_id`) + stamp net phí (`gateway_routes`, `mpos_import`, auto-sync) + BC03 đọc net. ~3 ngày. **Giang không tham gia** — phần `mpos_import` gộp vào tuyến Đạt.
- **Minh (FE + QA + deploy):** backup `so_doanh_thu`; toggle "hiện đơn test", cột Phí/Thực nhận, nút Ghi giảm (`SoDoanhThuTab.tsx`); pytest + tsc -b + e2e; merge sandbox→main theo thứ tự **REV-01 trước → REV-04 rebase**; migration prod.

**Mắt nối duy nhất giữa 2 tuyến:** REV-04 sửa `report_routes.py` `_load_ledger_revenue` (dòng `select` + đọc VND) — trùng REV-01. → Đức merge REV-01 trước, Đạt rebase REV-04. Ngoài mắt đó độc lập hoàn toàn.

---

## Tiêu chí nghiệm thu (mỗi việc)

1. `python -m pytest backend/tests/<file mới>.py -v` PASS (chạy từ repo root).
2. `cd frontend && npx tsc -b` PASS; `cd frontend && npm run test` PASS.
3. Sandbox: cùng bộ dữ liệu → **BC01 = BC02 = BC03 = tổng Sổ** cho cùng kỳ + cùng bộ lọc (đây là bằng chứng app tự khớp).
4. Query đối chứng: đơn `@dev` không xuất hiện trong tổng bất kỳ báo cáo nào.
5. 3-criteria self-check ghi trong PR: **triệt để** (gom 1 hàm dùng chung, không vá lẻ) · **không lỗi con** (giữ gross, idempotent stamp phí, chống hoàn quá tay, backup trước migration) · **không tăng gánh nặng hạ tầng** (không thêm vòng lặp/heap; báo cáo vẫn 1 query + cap 50k giữ nguyên — coi chừng `analytics_limits` truncation, không nâng cap).

## Anti-patterns (đừng làm)

1. Đừng làm 2b (22h) trước 2a — 2a gom `ngay_tien_ve` là nền, 2b chỉ sửa cách tính `ngay_tien_ve`. Làm ngược = sửa 2 lần.
2. Đừng ghi net đè lên `so_tien_vnd` — mất gross, vỡ đối soát ngân hàng + liên kết PR.
3. Đừng xóa/sửa dòng Sổ khi hoàn tiền — phải là dòng âm mới (audit).
4. Đừng lọc `is_test` bằng cách sửa từng query rời rạc — gom `apply_revenue_filters` 1 chỗ, tránh sót báo cáo thứ 5 sau này.
5. Đừng chạy migration khi chưa backup `so_doanh_thu` (doctrine skill so-doanh-thu-revenue).
6. Đừng nâng `MAX_ANALYTICS_ROWS` để "cho đủ số" — xử lý truncation flag đang bị nuốt (`fetch_rows_capped` trả `_`), không nâng cap mù.

---

## PHÂN CÔNG & LỊCH — chốt 29/7; không deadline cố định, xong nửa đầu tháng 8 (trần 15/8)

**Chỉ 2 người: Đức + Đạt.** Đức đang **đi viện** → chưa vào việc ngay được. Vì vậy **bỏ hạn 31/7, không đặt deadline cứng** — nhưng chốt **trần: xong trong nửa đầu tháng 8, muộn nhất 15/8**. Định nghĩa đã chốt 29/7 → hết gate, cả 4 việc code được. Chia **2 tuyến song song, workload ~cân, không ai chờ ai** (trừ 1 mắt rebase).

**4 tờ handoff (đọc trước khi code):**
- `docs/HANDOFF_REV-01_DUC_LOC_TEST_GOM_MOC_THOI_GIAN.md` — Đức, Việc 7 + 2a.
- `docs/HANDOFF_REV-03_DUC_LUAT_22H_DOI_NGAY.md` — Đức, Việc 2b (sau REV-01).
- `docs/HANDOFF_REV-02_DAT_HOAN_HUY_GHI_GIAM.md` — Đạt, Việc 6.
- `docs/HANDOFF_REV-04_DAT_NET_PHI_CONG.md` — Đạt, Việc 3 (rebase phần BC03 sau REV-01).

**Phụ thuộc do Đức nghỉ:** cả tuyến Đức (7 + 2a + 2b) **kẹt tới khi Đức khỏe**. Tuyến Đạt (6 → 3) **độc lập, chạy ngay được** — chỉ 1 mắt (BC03 trong REV-04) phải rebase sau khi REV-01 của Đức merge; phần còn lại của Đạt (route refund + 2 migration + stamp) không chờ Đức. Nếu Đức nghỉ dài, cân nhắc dồn tuyến Đức sang người khác để không nghẽn (rủi ro tiến độ, không phải kỹ thuật).

### TUYẾN ĐỨC — Việc 7 + 2a → 2b (`REV-01` → `REV-03`)

**Bước 1 — REV-01 (Việc 7 + 2a).** Toàn bộ cụm read-query. Ước ~1.5 ngày. Không migration.
- *Việc 7 — lọc đơn test:* viết `apply_revenue_filters(query, include_test=False)` gom `is_test=false` (+ chừa chỗ `NON_VN_TEAMS`); `_ledger_query` gọi hàm này + tham số `include_test` từ endpoint `/revenue/ledger`; BC03 `_load_ledger_revenue` thêm `.eq("is_test", False)`; BC01/BC02 (query riêng) gọi trực tiếp `apply_revenue_filters`. KHÔNG backfill (cột `is_test` đã đúng).
- *Việc 2a — gom 1 cột thời gian:* trước khi sửa chạy `SELECT count(*) FROM so_doanh_thu WHERE pay_time::date <> ngay_tien_ve;` báo Minh; viết `ky_doanh_thu(row) -> date` trả `ngay_tien_ve` (chỗ duy nhất 2b sau sửa); `_ledger_query` + `_row_pay_date` chuyển `pay_time` → `ngay_tien_ve`.
- *Số dòng chính xác:* xem REV-01 (đã verify grep 30/7 — lệch ~10 dòng so số cũ trong plan này).
- *Nghiệm thu:* `pytest test_ledger_is_test_filter.py test_revenue_period_bucket.py` PASS; sandbox cùng kỳ → **BC01 = BC02 = BC03 = tổng Sổ**; đơn `@dev` không lọt tổng nào.

**Bước 2 — REV-03 (Việc 2b, luật 22h).** SAU khi REV-01 merge (cần `ky_doanh_thu` + cột đã gom). Ước ~1.5–2 ngày. Có backfill, không migration cột.
- Auto-sync ghi `pay_time` = **giờ thực VN** (không còn nửa đêm); `ngay_tien_ve = ky_tu_gio_thuc(giờ thực)` áp luật 22h + ngoại lệ cuối tháng 00h (`ZoneInfo("Asia/Ho_Chi_Minh")`, thêm import tz).
- Thêm biến thể resolver `*_time` trả datetime tz-aware (giữ nguyên `_resolve_payment_date*` cũ).
- Backfill `ngay_tien_ve` dòng `loai_nhap='tu_dong'` truy được giờ thực (dry-run mặc định; backup trước).
- *Nghiệm thu:* `pytest test_revenue_22h_rule.py` PASS (21:59→N; 22:01→N+1; cuối tháng giữ tháng; tz UTC không lệch ngày).

### TUYẾN ĐẠT — Việc 6 → Việc 3 (`REV-02` → `REV-04`)

**Bước 1 — REV-02 (Việc 6, hoàn/hủy).** Độc lập hoàn toàn, **chạy ngay không chờ Đức**. Ước ~1 ngày.
- Migration: `hoan_ref_id uuid null`; mở CHECK `loai_nhap` thêm `'hoan'`. (Backup trước.)
- Endpoint `POST /revenue/ledger/{id}/refund` — **thêm route MỚI ở CUỐI vùng ledger (sau `sync-gsheet` ~1710), không đụng `_ledger_query`** (tránh đè vùng Đức). Insert dòng âm: `so_tien_vnd=-amount`, `gmv_rmb` âm, `loai_nhap='hoan'`, `hoan_ref_id=id gốc`, `ngay_tien_ve = ngày dòng gốc` (Thu Hiền chốt kỳ gốc), kế thừa `is_test`/`team`/`sale_crm_name`. Guard chống hoàn quá tay (tổng hoàn ≤ gốc → vượt 400). RBAC `require_min_role(actor,"manager")`; Sale → 403. Giữ nguyên dòng gốc.
- *Nghiệm thu:* `pytest test_ledger_refund.py` PASS.

**Bước 2 — REV-04 (Việc 3, net phí).** Migration + stamp độc lập chạy song song REV-01; **chỉ phần BC03 rebase sau REV-01**. Ước ~1.5–2 ngày.
- Migration: `phi_cong bigint default 0`, `so_tien_net bigint null`, `gateway_txn_id uuid null`. (Backup trước.)
- Hàm chung `stamp_net_fee(...)` idempotent (guard `is_("gateway_txn_id","null")`); set `gmv_rmb = vnd_to_rmb(net, rate)` → BC01/BC02 tự net.
- Stamp 2 điểm: `gateway_routes.py` `match_gateway_txn` (~592, phí về sau) + auto-sync `revenue_routes.py` (963/1156, phí về trước). Dùng `computed_net` sẵn (`mpos_import.py:285`, net = amount − fee − installment_fee). Chỉ dòng `payment_method ∈ {thẻ, trả góp}`.
- BC03 `report_routes.py`: `select` thêm `so_tien_net`/`phi_cong`, VND đọc `coalesce(so_tien_net, so_tien_vnd)` — **rebase sau REV-01** (Đức cũng sửa dòng select thêm `is_test`).
- **KHÔNG** đè `so_tien_vnd` gross (giữ đối soát ngân hàng + link PR). **KHÔNG** stamp dòng CK/tiền mặt.
- *Nghiệm thu:* `pytest test_ledger_net_fee.py` PASS (net đúng, gross giữ, idempotent, fallback gross khi chưa ghép phí).

### Mắt nối 2 tuyến (thứ tự merge)
Đức merge **REV-01 trước** → Đạt **rebase REV-04** phần BC03 (`_load_ledger_revenue`). REV-03 (2b) cũng rebase trên REV-01 đã merge. Ngoài mắt đó 2 tuyến độc lập. (Bài học `lesson_concurrent_sessions_worktree` — chia vùng rõ, không cùng sửa 1 hàm.)

### Việc Minh (song song + khi 2 dev xong)
- Backup `so_doanh_thu` trên prod **trước mọi migration**.
- FE: toggle "hiện đơn test" (REV-01) + cột Phí/Thực nhận (REV-04) + nút "Ghi giảm" (REV-02).
- Chạy `cd frontend && npx tsc -b` + `npm run test`; review + merge 2 nhánh theo thứ tự REV-01 → REV-04 rebase (trần 15/8).

---

## CẬP NHẬT TRIỂN KHAI (2/8/2026) — SUPERSEDES §Thứ tự triển khai + §Phân công + §PHÂN CÔNG&LỊCH phía trên

### Trạng thái thực tế
- REV-01, REV-02, REV-03, REV-04 **đã code + test xong trên `sandbox`** (280 pytest pass; `report_routes.py` đã hòa REV-01 `is_test` + REV-04 net). Màn phân công Đức/Đạt + rebase REV-01→REV-04 ở trên **đã xong**, giờ chỉ là hồ sơ thiết kế.
- Backend REV chưa lên `main`/prod. Migration **chưa apply** (kể cả sandbox DB — test dùng mock, không đụng DB thật).
- Frontend 3 việc (toggle đơn test / nút Ghi giảm / cột Phí-Thực nhận) **chưa làm** (grep 0 hit trên `SoDoanhThuTab.tsx`).

### Quyết định backfill 22h — HỦY (Thu Hiền chốt 2/8)
- **Forward-only:** luật 22h chỉ áp cho đơn MỚI từ lúc deploy; đơn cũ giữ nguyên.
- Lý do (verify code `ky_tu_gio_thuc` `revenue_routes.py:175`): đơn sau 22h đẩy sang ngày sau **cùng tháng**, đơn cuối tháng giữ nguyên → **không đơn nào nhảy tháng** → tổng THÁNG bất biến, COM tháng không đổi. Dịch mốc chỉ đổi số theo NGÀY trong quá khứ — Hiền không cần.
- ⇒ **Bỏ hẳn bước chạy `scripts/backfill_ngay_tien_ve_22h.py`** (script để dormant trong repo phòng sau đổi ý). §2b "backfill dòng lịch sử" + mọi Anti-pattern/Nghiệm thu liên quan backfill: BỎ QUA. "Seam" pre/post-deploy vô hại (tổng tháng như nhau).

### Kế hoạch triển khai hiện hành — 2 nhóm song song → trục deploy
Nguyên tắc: **không ai làm thêm việc** — Hiền số cũ nguyên vẹn; Sales mọi thứ additive, mặc định ẩn/không bắt thao tác thêm.

**Nhóm A — Frontend (song song, additive, 1 file `SoDoanhThuTab.tsx`; làm tuần tự A1→A2→A3 tránh đụng edit):**
- A1. Toggle "Hiện đơn test" — mặc định ẩn (BE REV-01 đã lọc `is_test`; đây chỉ là nút bật xem lại, truyền `include_test=true`).
- A2. Nút "Ghi giảm" + drawer xác nhận (REV-02) — gọi `POST /revenue/ledger/{id}/refund`; RBAC ≥ manager (Sale ẩn nút). Đọc contract THỰC từ route đã implement, không chỉ handoff.
- A3. Cột "Phí" + "Thực nhận" (REV-04) — hiển thị `phi_cong` + `so_tien_net` (fallback `so_tien_vnd` khi null, nhãn "chờ phí").

**Nhóm B — Migration DB (song song với A):**
- B0. Apply 2 migration lên **sandbox DB trước** (idempotent) — CẦN cho A2/A3 test thật + verify BC trên số thật, vì tests hiện dùng mock. Xác nhận cột đã có.
- B1. **Backup** `so_doanh_thu` prod: `CREATE TABLE so_doanh_thu_backup_20260802 AS SELECT * FROM so_doanh_thu;` (SQL Editor prod `jozcvbbypwvzaefteoxn`). Bắt buộc trước B2.
- B2. Apply `docs/migrations/2026-07-30-ledger-refund.sql` + `2026-07-30-ledger-net-fee.sql` lên **prod** (đều `ADD COLUMN IF NOT EXISTS` → cột mới NULL, số cũ không đổi).

**Trục chính (tuần tự, sau khi A + B xong):**
- C. Merge `sandbox`→`main` (1 merge sạch — `merge-tree` exit 0; main GIỮ country-dial ISO + SePay suppress fix).
- D. Deploy BE Render thủ công `bash scripts/deploy.sh` (Render Auto-Deploy OFF).
- E. FE Vercel auto-deploy khi push `main`.
- F. ~~Backfill 22h~~ — **HỦY**.
- G. Verify prod: BC01 = BC02 = BC03 = tổng Sổ cùng kỳ + spot-check vài đơn → nhắn Thu Hiền "xong".

**Thứ tự chạy:** A ∥ B → C → D → E → G. Rủi ro còn lại ~0: không bước nào ghi đè số lịch sử.
