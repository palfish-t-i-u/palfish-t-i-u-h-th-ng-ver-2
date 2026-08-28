# Bàn giao BC04 — Báo cáo Dòng tiền về hàng ngày (Đức + Đạt)

**Ngày:** 2026-08-27 · **Từ:** Minh · **Cho:** Đạt (Backend) + Đức (Frontend)
**Spec đầy đủ (đọc trước khi code):** [`docs/plans/PLAN_BC04_DONG_TIEN_VE_2026-08-27.md`](PLAN_BC04_DONG_TIEN_VE_2026-08-27.md)

---

## Tóm tắt 1 phút

Làm **báo cáo mới BC04 "Dòng tiền về"** trong nhóm **Báo cáo** — thay báo cáo tiền về thủ công của chị Vân. Mỗi dòng = 1 khoản tiền thực về TK MB Hà Nội (CK khách, cọc, tiền thẻ, rút TikTok, khoản lạ), gom theo ngày, kèm số dư cộng dồn + phân loại quản báo, **xuất Excel đúng layout sheet `HN BANK 26`** (file mẫu chị Vân).

**Nguồn:** hybrid — `bank_transactions` (CK khách + khoản lạ) + `gateway_transactions` (tiền thẻ per-đơn, nối cục bank bằng số **phiếu chi**). Chi tiết + thuật toán chống trùng: spec §3.

## Quy tắc làm việc

- **1 branch chung cho task:** `feature/bc04-dong-tien-ve`. Cả 2 làm trên branch này (hoặc nhánh con rồi merge vào đây).
- **Song song, không chặn nhau:** BE và FE đụng file khác nhau (BE: `report_routes.py`, `sepay_routes.py`, migration; FE: `components/reports/`, `MainPage.tsx`, `api.ts`). Không giẫm chân.
- **Handshake FE↔BE:** Đạt **chốt shape response trước** (spec §6 đã có JSON mẫu) → Đức **mock theo §6 (MSW), code song song ngay**, không chờ BE xong.
- **Preview theo giai đoạn:** cần test thì deploy bản preview riêng lên **sandbox** (FE: push branch → Vercel preview; BE: deploy hook Render sandbox `palfish-gmv-api-sandbox`). Xem skill `deploying-gmv`. **Warm URL sandbox 1 lần trước khi test** (Free tier, cold start ~50s).
- **Chưa live:** chỉ merge vào `main` (→ prod) **sau khi Minh review kết quả cuối**.

## Đạt — Backend (M1, ~2 ngày)

Chi tiết spec §5–§7, §10. Thứ tự:
1. **M1-T1** Migration bảng `cash_in_annotations` (spec §7) → sandbox.
2. **M1-T2** Hàm `classify_cash_in` + trích số phiếu chi từ nội dung CK + unit test (§5).
3. **M1-T3** Endpoint `GET /api/v1/reports/cash-in` (§6): query gateway per-đơn (theo `funded_date`) + query bank HN MB (gồm `ignored`) + **dedup hybrid theo phiếu chi** + **số dư cộng dồn** (số dư đầu kỳ + Σ tiền vào) + Thu RMB (tỷ giá theo kỳ) + auto phân loại + LEFT JOIN annotations + summary.
4. **M1-T4** `PUT …/annotation` (lưu phân loại + ghi chú sửa tay).
5. **M1-T5** RBAC key `bc04` + tests (§10).

⚠️ **Chống đếm trùng là phần dễ sai nhất** — bám ca vàng verify: phiếu chi **79492392** = 60.732.000 = Σ 4 GD (spec §12 M3-N1). Viết test khẳng định 1 phiếu chi không đếm 2 lần.

## Đức — Frontend (M2, ~2.5–3 ngày)

Chi tiết spec §4, §8, §10. Mock theo §6 để chạy ngay:
1. **M2-T1** Wiring BC04 vào nhóm Báo cáo (ViewId/sidebar/lazy/RBAC — path:line trong §7).
2. **M2-T2** Bộ lọc (từ/đến ngày, ô **số dư đầu kỳ**, nút Làm mới) + thẻ tổng.
3. **M2-T3** Bảng **12 cột đúng sheet HN BANK 26** (§4) — số dư cộng dồn, badge nhóm, dòng tổng ngày.
4. **M2-T4** Dropdown phân loại quản báo + ghi chú inline (gọi `PUT …/annotation`).
5. **M2-T5** **Xuất Excel clone layout `HN BANK 26`** (§8) — copy nhãn cột song ngữ + ô tỷ giá B1 + số dư cộng dồn từ file mẫu. Đối chiếu với file mẫu chị Vân.
6. **M2-T6** Mobile RowCards + E2E smoke.

## Definition of Done (trước khi báo Minh review)

- `cd frontend && npx tsc -b` sạch; unit test + E2E smoke pass; BE tests pass.
- Ca vàng dedup (phiếu chi 79492392) đúng: đồng bộ rồi → 4 dòng thẻ, chưa → 1 cục, cả 2 = 60.732.000.
- Excel BC04 đối chiếu khớp từng dòng + số dư với sheet HN BANK 26 file mẫu (1 dải ngày).
- Deploy preview sandbox cho Minh xem trước khi merge `main`.
