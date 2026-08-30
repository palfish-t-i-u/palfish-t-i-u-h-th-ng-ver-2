# BC04 — Báo cáo Dòng tiền về hàng ngày (thay báo cáo tiền về thủ công của chị Vân)

**Ngày:** 2026-08-27 · **Trạng thái:** PLAN v6 — grounded theo file mẫu thật (chờ duyệt cuối) · **Người yêu cầu:** chị Vân · **Giao:** Đức (FE) + Đạt (BE)
**Chạm data prod:** 1 migration (+ bảng `cash_in_annotations`) · **KHÔNG** đụng logic đối soát/khớp hiện có

> **Mục tiêu:** thay **luồng lập báo cáo tiền về THỦ CÔNG** của chị Vân bằng báo cáo tự động — xem trong app **và** xuất Excel theo **đúng layout sheet `HN BANK 26`** trong file `越南教育管报 2026.xlsx` để gửi Trung Quốc.

---

## 1. Mục đích & phạm vi

Liệt kê **mọi khoản tiền THỰC VỀ tài khoản MB Hà Nội (1680011668899)** mỗi ngày — CK khách, cọc, tiền thẻ (mPOS+Payoo), rút TikTok, nội bộ, khoản lạ — kèm số dư cộng dồn + phân loại quản báo. Chỉ **tiền VÀO**.

**Phạm vi v1 = tài khoản HN MB** (mảng Giáo dục, cái SePay đọc). Các TK/pháp nhân khác trong file (ND BANK VND/USD/CASH) **ngoài phạm vi v1**.

**Khác Sổ doanh thu:** Sổ = đơn đã thu đủ; BC04 = từng khoản tiền vào TK.

## 2. Quyết định đã chốt (Vân + Minh)

- Chỉ **tiền VÀO** (Output để 0, khớp sheet HN BANK 26 vốn Output=0 toàn bộ).
- Tiền thẻ = **HYBRID**: tách per-đơn từ Đối soát Quẹt thẻ (có sale/team); đợt chưa đồng bộ → fallback cục bank.
- **Bộ cột theo bản 2026** (sheet `HN BANK 26`) — §4.
- Phân loại quản báo = **auto khoản rõ + sửa tay dropdown** (taxonomy từ sheet `管报项目类别`) — §5.
- **Tỷ giá cấu hình theo kỳ** (mặc định 3700) — cơ chế Sổ doanh thu.
- **Xuất Excel** đúng layout HN BANK 26.

## 3. Nguồn dữ liệu — HYBRID (bank + gateway, nối bằng phiếu chi)

Tiền về TK MB 1680011668899; SePay đọc hết. Tiền thẻ về **1 CỤC GỘP** (VD `+60.732.000đ`, nội dung `CDSNL... PC 79492392`), app có chi tiết per-đơn ở **Đối soát Quẹt thẻ** (`gateway_transactions`).

| Loại | Nguồn | Ngày |
|---|---|---|
| CK khách + cọc | `bank_transactions` (mỗi CK 1 dòng) | `transaction_date` |
| Rút TikTok / nội bộ / lạ | `bank_transactions` (`ignored`/`pending`) | `transaction_date` |
| Tiền thẻ (đã đồng bộ) | `gateway_transactions` (per-đơn, có sale/team/thực nhận) | `funded_date` |
| Tiền thẻ (chưa đồng bộ) | fallback cục `bank_transactions` | `transaction_date` |

**Nối + chống trùng bằng PHIẾU CHI:** bank content `PC (\d+)` = gateway `settlement_code`. Đợt PC đã có trong gateway → bỏ cục bank, hiện per-đơn; chưa có → giữ cục. (Ca vàng: PC 79492392 = 60.732.000 = Σ 4 GD — §12 M3-N1.) → mỗi đồng đúng 1 lần, luôn đủ tiền.

Facts: SePay insert mọi khoản gồm `ignored` ([sepay_routes.py:573, 594-629](../../backend/sepay_routes.py)); gateway có `settlement_code`, `net_amount`, `funded_date`, `payment_line_id` ([gateway_routes.py:186-245, 395-410](../../backend/gateway_routes.py)); nhận diện cục `_MPOS_SETTLE_SIGNALS`/`_PAYOO_SETTLE_SIGNALS` ([sepay_routes.py:55-64](../../backend/sepay_routes.py)).

## 4. Bộ cột (đúng sheet `HN BANK 26`)

Ô `B1` = tỷ giá. Header dòng 2. Nhãn xuất Excel giữ **song ngữ y file mẫu** (dev copy trực tiếp từ `HN BANK 26`).

| Cột | Nhãn app (VI) | Nhãn Excel (gốc) | Nguồn / công thức |
|---|---|---|---|
| A | Ngày | `Date` | `transaction_date` (bank) / `funded_date` (thẻ) |
| B | Nội dung | `Details Description` | nhãn theo nhóm §5 (khách trả→"用户付款"/"Khách trả"; thẻ→"Quẹt thẻ"; TikTok→"Rút TikTok"...) |
| C | Chi ra | `Output (VND)` | **0** (chỉ tiền vào) |
| D | Thu vào | `Input (VND)` | `amount` (bank>0) / `net_amount` (thẻ) |
| E | **Số dư** | `Balance` | **`= số dư đầu kỳ + Σ(Input − Output)` cộng dồn theo thứ tự ngày** (KHÔNG lấy SePay) |
| F | (phụ) income | `income` | `= Thu vào` |
| G | (phụ) expenditure | `expenditure` | `= Chi ra` (=0) |
| H | Dòng nghiệp vụ | `管报-业务线 / MR - Business Line` | auto/dropdown §5 (mặc định "Giáo dục / 教育") |
| I | Đội | `团队 / Team` | sale→team qua khớp đơn (trống nếu chưa khớp) |
| J | Ghi chú | `备注、说明` | `cash_in_annotations.note` (sửa tay) |
| K | **Thu RMB** | `收 / RMB` | `= Thu vào ÷ tỷ giá(kỳ)` |
| L | Nguồn dữ liệu | `数据表源` | `HN BANK` / `mPOS` / `Payoo` |

**Số dư đầu kỳ:** ô nhập trong bộ lọc (chị Vân nhập từ sao kê tại mốc đầu khoảng xem), lưu lại theo tài khoản; Balance cộng dồn từ đó. (File mẫu để số cứng ở dòng đầu = 9.580.473.038 rồi cascade.)

## 5. Phân loại quản báo (auto + dropdown)

Taxonomy lấy từ sheet `管报项目类别` (song ngữ). Tập liên quan tiền VÀO (seed v1):

| Dòng nghiệp vụ (VI / gốc) | Nhóm lớn | Chi tiết | Khi nào |
|---|---|---|---|
| Giáo dục / 教育 | Doanh thu / 收入 | Doanh thu / 收入 | **auto** cho `khach_tra`, `the`, `the_gop` |
| Giáo dục / 教育 | Hoàn tiền / 退款 | Hoàn tiền / 退款 | (hiếm ở tiền vào) — dropdown |
| Giáo dục / 教育 | — | Lãi tiền gửi / 利息收入 | dropdown |
| Không tính quản báo / 不计入管报 | Công nợ nội bộ / 往来款 | Chuyển nhầm / 转账错误 | dropdown (nội bộ/chuyển nhầm) |
| *(trống)* | — | — | mặc định cho `rut_tiktok` / `khac` → chị Vân chọn dropdown |

- **Auto**: khoản khách trả/thẻ → điền sẵn Giáo dục/Doanh thu.
- **Sửa tay**: các khoản khác để trống + **dropdown** cho chị Vân chọn (giống thao tác tay hiện tại nhưng trong app). Lựa chọn lưu vào `cash_in_annotations`.
- `classify_cash_in(...)` (trong `sepay_routes.py`) chỉ quyết **nhóm nội bộ** (`khach_tra`/`the`/`the_gop`/`rut_tiktok`/`khac`) để auto-fill + gắn nhãn cột B; KHÔNG đổi `match_status`.

## 6. Backend — endpoint mới trong `report_routes.py`

**`GET /api/v1/reports/cash-in`** — `?from=&to=&opening_balance=&team=`. RBAC `require_module_access(sb, actor, "bc04")`; tỷ giá `get_rate_for_date`.

Luồng:
1. Query `gateway_transactions WHERE funded_date` trong kỳ, `match_status != 'ignored'` → per-đơn thẻ; join `payment_line_id` lấy sale/team; tập `settlement_code` = G.
2. Query `bank_transactions WHERE amount>0 AND transaction_date` trong kỳ, `account_number=1680011668899` (HN MB), KHÔNG lọc `match_status`. Cục settlement (`_is_mpos_settlement`): trích PC; PC∈G → bỏ; else fallback.
3. Non-card → join `payment_line_id`. Gán nhóm (`classify_cash_in`) → nhãn cột B + auto phân loại.
4. LEFT JOIN `cash_in_annotations` (source, txn_id) → override phân loại/note nếu chị Vân đã sửa tay.
5. Sắp theo ngày (giờ VN — G5) → tính **Số dư cộng dồn** (`opening_balance + Σ Input` chạy dồn). Thu RMB = Input ÷ tỷ giá.
6. Trả summary + days[] + rows[].

**`PUT /api/v1/reports/cash-in/{source}/{txn_id}/annotation`** — `{business_line, main_cat, detail, note}` → upsert `cash_in_annotations` + `log_audit`. RBAC full.

## 7. Migration + Tỷ giá + RBAC

**Migration** `backend/migrations/2026-08-27-cash-in-annotations.sql`:
```sql
create table if not exists cash_in_annotations (
  source text not null,                 -- 'bank' | 'gateway'
  txn_id uuid not null,                 -- bank_transactions.id | gateway_transactions.id
  business_line text,
  main_cat text,
  detail text,
  note text,
  updated_by_email text,
  updated_at timestamptz default now(),
  primary key (source, txn_id)
);
```
> `accumulated` KHÔNG dùng (Số dư tự cộng dồn). Sandbox → prod (G2). Taxonomy dropdown: seed hằng trong code (tập §5), mở rộng sau nếu cần.

**Tỷ giá:** dùng LẠI `exchange_rates` + `get_rate_for_date` + [admin/ExchangeRatesPanel.tsx](../../frontend/src/components/admin/ExchangeRatesPanel.tsx). **KHÔNG làm mới.**

**RBAC key `bc04`** (mẫu [admin_routes.py:141, 167, 1141-1145](../../backend/admin_routes.py)): `MODULE_LIST` += `"bc04"`; `DEFAULT_DEPT_PERMISSIONS` = sale/leader/marketing/cs=none, hr=full. FE wiring như BC01–03: ViewId [MainPage.tsx:59-61](../../frontend/src/pages/MainPage.tsx); `reportChildren` [:327-333](../../frontend/src/pages/MainPage.tsx); lazy+PRELOAD [:18-20,43-45,283](../../frontend/src/pages/MainPage.tsx); renderActiveView [:417-419](../../frontend/src/pages/MainPage.tsx); wideContent [:395-397](../../frontend/src/pages/MainPage.tsx); `can('bc04')` [:275-280](../../frontend/src/pages/MainPage.tsx); `endpoints.reports.cashIn` [api.ts:445](../../frontend/src/lib/api.ts). **Cấp quyền TK chị Vân sau deploy.**

## 8. Xuất Excel (đúng sheet HN BANK 26)

FE tạo `.xlsx` **clone layout `HN BANK 26`**: ô B1=tỷ giá; header dòng 2 song ngữ (copy y file mẫu); 12 cột A–L; cột E (Balance) cộng dồn; F/G = income/expenditure; K = income÷tỷ giá; L = nguồn. Tham chiếu thư viện: [utils/taxInvoiceXlsxExport.ts](../../frontend/src/utils/taxInvoiceXlsxExport.ts). Đối chiếu byte-level với file mẫu chị Vân trước khi giao.

## 9. Guardrails

- **G1 — Chỉ ĐỌC** logic đối soát/matching/webhook. `cash_in_annotations` độc lập.
- **G2 — Sandbox trước prod.** Migration idempotent.
- **G3 — Đủ tiền, không trùng (§3).** Cục bank chỉ giữ khi PC chưa có trong gateway. **Test khẳng định 1 PC không đếm 2 lần** (§10.2).
- **G4 — Webhook rớt + đồng bộ thẻ.** Nút Làm mới gọi `sepay/sync-pending` + nhắc đồng bộ thẻ.
- **G5 — Múi giờ VN**; Số dư cộng dồn theo đúng thứ tự thời gian.

## 10. Test

**BE (`backend/tests/test_cash_in_report.py`):**
1. `classify_cash_in`: TikTok→`rut_tiktok`; `payment_line_id`→`khach_tra`; lạ→`khac`.
2. **Hybrid dedup:** cục PC=X + gateway settlement_code=X → chỉ đếm gateway (X không 2 lần); PC=Y không có gateway → giữ cục.
3. Số dư cộng dồn: `opening + Σ Input` đúng theo thứ tự; Thu RMB = Input ÷ rate(kỳ).
4. Auto phân loại khách trả/thẻ = Giáo dục/Doanh thu; `cash_in_annotations` override đúng.
5. RBAC sale→403, hr→200. PUT annotation + audit.

**FE:** unit test summary + RMB + cộng dồn Số dư; E2E: mở BC04 → dòng CK + đơn thẻ + số dư → chọn phân loại dropdown 1 dòng lạ → reload giữ → Xuất Excel khớp layout HN BANK 26.

## 11. Đánh giá 5 tiêu chí

1. **Triệt để** — ✅ clone đúng sheet chị Vân đang dùng; hybrid đủ mọi khoản; auto phân loại + dropdown thay thao tác tay; xuất Excel khớp → thay được luồng thủ công.
2. **Không lỗi con** — ✅ dedup theo phiếu chi + test; Số dư cộng dồn (không phụ thuộc SePay N/A); chỉ đọc; annotations tách bảng riêng.
3. **Không tăng gánh hạ tầng** — ✅ +1 bảng nhỏ, +1 endpoint đọc + 1 PUT; tái dùng gateway/tỷ giá/cron.
4. **Tối ưu token** — ✅ tái dùng scaffolding BC03/RBAC/tỷ giá/export.
5. **Bền vững qua compact** — ✅ self-contained (schema file thật + path:line + thuật toán + test).

## 12. Chia task (Đức + Đạt)

### M1 — Backend (Đạt)
- **M1-T1** — Migration `cash_in_annotations` → sandbox. `~0.5h`
- **M1-T2** — `classify_cash_in` + trích PC + unit test. `~2h`
- **M1-T3a** — Query gateway per-đơn (funded_date) + join sale/team + tập settlement_code. `~2.5h`
- **M1-T3b** — Query bank (HN MB, gồm `ignored`) + dedup hybrid theo PC + gom ngày. `~3.5h`
- **M1-T3c** — Số dư cộng dồn (opening_balance) + Thu RMB (tỷ giá kỳ) + auto phân loại + LEFT JOIN annotations + summary. `~2.5h`
- **M1-T4** — `PUT …/annotation` + audit. `~1h`
- **M1-T5** — RBAC `bc04` BE + tests (§10). `~2h`

### M2 — Frontend (Đức)
- **M2-T1** — Wiring BC04 + `endpoints.reports.cashIn`. `~2h`
- **M2-T2** — Bộ lọc (ngày, số dư đầu kỳ, Làm mới) + thẻ tổng. `~2.5h`
- **M2-T3** — Bảng 12 cột đúng HN BANK 26 (Số dư cộng dồn, badge nhóm, dòng tổng ngày). `~4h`
- **M2-T4** — Dropdown phân loại + Ghi chú inline (PUT annotation). `~2.5h`
- **M2-T5** — **Xuất Excel** clone layout HN BANK 26 (song ngữ, B1 tỷ giá, cộng dồn). `~3.5h`
- **M2-T6** — Mobile RowCards + E2E smoke. `~2.5h`

### M3 — Verify & vận hành
- **M3-N1** — Ca vàng dedup PC: PC **79492392** = mPOS net 60.732.000 (62.160.000 − phí 1.428.000) = cục bank `+60.732.000` = Σ 4 GD (Dao thi quynh anh 9.340.500 + NGUYEN M K TRANG 17.676.000 + LAI ANH TUAN 25.057.500 + NGUYEN THI N HUYEN 8.658.000). Đồng bộ rồi → 4 dòng thẻ, không cục; chưa → 1 cục. Cả hai = 60.732.000.
- **M3-N2** — So Excel BC04 ↔ sheet HN BANK 26 file mẫu (1 dải ngày) khớp từng dòng + số dư.
- **M3-N3** — Deploy sandbox → đối chiếu sao kê + báo cáo thủ công → prod → cấp quyền chị Vân.

### Deadline (2 dev song song)

| Milestone | Người | Ước lượng | Ghi chú |
|---|---|---|---|
| M1 (BE) | Đạt | ~2 ngày | hybrid dedup + cộng dồn là phần nặng |
| M2 (FE) | Đức | ~2.5-3 ngày | T1 chờ T3 có response mẫu |
| M3 | Minh + ops | ~0.5 ngày | verify + deploy |
| **Tổng** | | **~3-3.5 ngày** | FE + hybrid là đường găng |

## 13. Còn mở (nhỏ, không chặn)

1. **Nhãn cột B (Details Description)**: mặc định nhãn theo nhóm ("用户付款"/"Quẹt thẻ"/"Rút TikTok"). Nếu chị Vân muốn giữ đúng "用户付款" cho mọi dòng như file → chỉnh 1 dòng.
2. **Mở rộng taxonomy**: v1 seed tập tiền-vào (§5). Nếu cần đủ bộ (chi phí/thuế…) khi mở rộng sang tiền ra → thêm bảng `mr_categories` sau.
3. **Số dư đầu kỳ**: nhập tay từ sao kê (mặc định). Nếu muốn tự lấy mốc từ SePay → cân nhắc sau (SePay N/A nên nhập tay an toàn hơn).
