# PLAN — Đồng bộ định nghĩa doanh thu (A0/A2): làm app đủ chuẩn để thay All File

**Origin:** Bảng chốt định nghĩa doanh thu (Thu Hiền điền 29/7) + rà code app 29/7.
**Quyết định đã chốt:** Mục 1+8 = **Cách B** (Thu Hiền 17:15 29/7): Sổ chỉ ghi khi đơn đã thu đủ 100% — đúng hành vi app hiện tại. Còn **4 mục lệch phải sửa: 2, 3, 6, 7**.
**Mục tiêu cao hơn (kim chỉ nam):** app phải là **nguồn số duy nhất**, đủ tin để **thay thế hoàn toàn** file Excel "All File Thu Hiền" và luồng ghi tay. Mọi thiết kế bên dưới phục vụ mục tiêu đó — không chỉ vá điểm lệch.

**Bối cảnh (ĐÃ verify — rà code 29/7):** path:line dưới đây grep xác nhận trên nhánh `sandbox` 29/7. ⚠️ **Số dòng đã lệch ~10 dòng khi verify lại 30/7** — người thực thi lấy số dòng ĐÚNG trong 2 handoff (verify 30/7): `docs/HANDOFF_REV-01_DUC_LOC_TEST_GOM_MOC_THOI_GIAN.md` (Đức) + `docs/HANDOFF_REV-02_DAT_HOAN_HUY_GHI_GIAM.md` (Đạt).

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

## Thứ tự triển khai (rủi ro thấp → cao)

Định nghĩa đã chốt 29/7 → không còn gate, cả 4 việc code được.

| Đợt | Việc | Ngày |
|---|---|---|
| 0 | Backup `so_doanh_thu` (bắt buộc trước mọi migration) | 0.1 |
| 1 | **Việc 7** (lọc test) + **2a** (gom 1 cột) + **Việc 6** (hoàn/hủy, kỳ gốc) | 2.5 |
| 2 | **Việc 3** (net phí, trừ cả phí trả góp) | 1.5–2 |
| 3 | **2b** (luật 22h: đổi ngày + giờ thực + backfill) | 1.5–2 |

Đợt 1 làm app **tự khớp với chính nó** — điều kiện để bước A1 (đối chiếu Sổ ↔ All File) có nghĩa. Sau đợt 1 chạy lại BC01/02/03 trên sandbox, xác nhận cùng 1 CK ra cùng kỳ ở mọi báo cáo. **Lưu ý:** hết đợt 1 mọi báo cáo *tự khớp nhau* nhưng chưa theo đúng luật 22h — 2b (đợt 3) mới làm số *khớp luật Thu Hiền*.

---

## Phân công (theo `docs/PROJECT.md`)

- **Đức (BE: dashboard, exchange rate, DB):** Việc 7, 2a, 2b, 3 (migration + báo cáo đọc net).
- **Giang (BE: SePay, recon, import):** điểm ghép phí trong `mpos_import.py` (việc 3).
- **Đạt (BE: RBAC):** RBAC nút hoàn tiền (việc 6).
- **Minh (FE + QA + deploy):** toggle "hiện đơn test", cột Phí/Thực nhận, nút Ghi giảm (`SoDoanhThuTab.tsx`); chạy pytest + tsc -b + e2e; merge sandbox→main; migration prod.

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

**Chỉ 2 người: Đức + Đạt.** Đức đang **đi viện** → chưa vào việc ngay được. Vì vậy **bỏ hạn 31/7, không đặt deadline cứng** — nhưng chốt **trần: xong trong nửa đầu tháng 8, muộn nhất 15/8**. Định nghĩa đã chốt 29/7 → hết gate, cả 4 việc code được. **Đợt 1 = 3 việc gọn nhất (7 + 2a + 6); việc 3 (net) và 2b (luật 22h) đợt 2.**

**Phụ thuộc do Đức nghỉ:** Việc 6 (Đạt) độc lập → **chạy ngay được, không chờ Đức**. Việc 7 + 2a + cả đợt 2 đều thuộc Đức → **kẹt tới khi Đức khỏe lại**. Nếu Đức nghỉ dài, cân nhắc dồn việc 7 + 2a sang người khác để không nghẽn cả tuyến (đây là rủi ro tiến độ, không phải rủi ro kỹ thuật).

### Đợt 1 (làm trước — trần 15/8)

**ĐỨC — Việc 7 + Việc 2a** (đều thuộc revenue_routes/report_routes, domain của Đức). Ước ~1.5 ngày.

- *Việc 7 — lọc đơn test:*
  - Viết `apply_revenue_filters(query, include_test=False)` gom `is_test=false` (+ chừa chỗ cho `NON_VN_TEAMS`).
  - `_ledger_query` (`revenue_routes.py:521`) gọi hàm này; thêm tham số `include_test` truyền từ endpoint `/revenue/ledger` (:1271).
  - BC03 `_load_ledger_revenue` (`report_routes.py:237-241`) thêm `.eq("is_test", False)`.
  - BC01 (:1577-1582) / BC02 (:1604-1609) dùng chung `_ledger_query` → xác minh tự hưởng, không có nhánh bypass.
  - KHÔNG cần backfill (cột `is_test` đã đúng dữ liệu: `revenue_routes.py:982/1175/1455`).
- *Việc 2a — gom 1 cột thời gian:*
  - **Trước khi sửa**, chạy query đếm ảnh hưởng (SQL Editor): `SELECT count(*) FROM so_doanh_thu WHERE pay_time::date <> ngay_tien_ve;` — báo Minh số này trước khi đổi.
  - Viết `ky_doanh_thu(row) -> date` trả `ngay_tien_ve` (chỗ duy nhất để 2b sau sửa).
  - `_ledger_query` (:527-530): đổi lọc `pay_time` → `ngay_tien_ve`.
  - BC02 `_row_pay_date` (:191-192): bucket theo `ngay_tien_ve`, bỏ nhánh `pay_time`.
- *Nghiệm thu Đức:* `python -m pytest backend/tests/test_ledger_is_test_filter.py backend/tests/test_revenue_period_bucket.py -v` PASS; trên sandbox cùng kỳ → **BC01 = BC02 = BC03 = tổng Sổ**, và đơn `@dev` không lọt tổng nào.

**ĐẠT — Việc 6 (hoàn/hủy)** — dựng được TOÀN BỘ ngay (Q3 chốt kỳ gốc, không còn dòng nào treo). Hợp domain Đạt (RBAC + validation). Ước ~1 ngày.

- Migration: mở CHECK `loai_nhap` thêm `'hoan'`; thêm cột `hoan_ref_id uuid null`. (Backup `so_doanh_thu` trước.)
- Endpoint `POST /revenue/ledger/{id}/refund` (`revenue_routes.py`, **thêm hàm route MỚI ở cuối vùng ledger — không sửa `_ledger_query` để tránh đụng Đức**), body `amount`,`reason`.
  - Insert dòng âm: `so_tien_vnd=-amount`, `gmv_rmb` âm, `loai_nhap='hoan'`, `hoan_ref_id=id gốc`, `is_test`/`team`/`sale_crm_name` **kế thừa dòng gốc**.
  - `ngay_tien_ve = ngày dòng gốc` (Thu Hiền chốt: truy về kỳ gốc, ghi giảm ở kỳ đó — số kỳ gốc đổi hồi tố).
  - **Guard chống hoàn quá tay:** `sum(dòng hoan_ref_id=id) + amount ≤ so_tien_vnd gốc` → nếu vượt trả 400. Cho hoàn 1 phần.
  - RBAC: dùng mẫu `require_min_role` (tham chiếu upsert tỷ giá `revenue_routes.py:1396`) — chỉ kế toán/leader; Sale → 403.
  - Giữ nguyên dòng gốc (KHÔNG xóa/sửa — audit).
- FE nút "Ghi giảm / Hoàn tiền" (`SoDoanhThuTab.tsx`) — Minh làm phần UI, Đạt lo endpoint + guard.
- *Nghiệm thu Đạt:* `python -m pytest backend/tests/test_ledger_refund.py -v` PASS (hoàn full→tổng gốc=0 giữ dòng gốc; hoàn 1 phần; vượt gốc→400; role Sale→403; dòng hoàn kế thừa team/sale/is_test).

**Điểm coi chừng chung file:** cả Đức và Đạt đụng `revenue_routes.py`. Đức sửa vùng query/filter (`_ledger_query`, `_row_pay_date`); Đạt **chỉ thêm hàm route mới ở cuối** — không sửa vùng của Đức. Chia vùng rõ, merge cuối ngày theo thứ tự Đức trước → Đạt rebase. (Bài học `lesson_concurrent_sessions_worktree`.)

### ĐỢT 2 — ngay sau đợt 1 (hết gate, không chờ ai)

- **Việc 3 (net phí).** Migration `phi_cong`/`so_tien_net`/`gateway_txn_id`; báo cáo đọc `so_tien_net` fallback gross; điểm ghép phí dùng `computed_net` sẵn (`mpos_import.py:283-285`, net = amount − fee − installment_fee) stamp lên dòng Sổ khớp `don_hang_id`/`ma_don_hang`. Người: Đức (migration + báo cáo) + phần stamp ở `mpos_import` vốn của Giang — Giang không tham gia thì Đức gánh. ~1.5–2 ngày.
- **Việc 2b (luật 22h).** Sửa auto-sync ghi `pay_time` = giờ thực VN (`revenue_routes.py:963`/`:1156`); `ngay_tien_ve = ky_doanh_thu(pay_time)` áp luật 22h + cuối tháng 00h (`ZoneInfo("Asia/Ho_Chi_Minh")`, `revenue_routes` chưa có tz VN → thêm); backfill `ngay_tien_ve` dòng lịch sử từ giờ thực. Người: Đức. ~1.5–2 ngày.

### Việc Minh (trước khi 2 dev merge)
- Backup `so_doanh_thu` trên prod trước mọi migration.
- FE: toggle "hiện đơn test" + nút "Ghi giảm".
- Chạy `cd frontend && npx tsc -b` + `npm run test`; review 2 nhánh Đức/Đạt khi xong (trần 15/8).
