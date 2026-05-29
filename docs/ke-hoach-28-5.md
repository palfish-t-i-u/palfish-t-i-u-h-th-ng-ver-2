# KẾ HOẠCH CÔNG VIỆC — checklist anh Hiếu (v5 · chốt cuối ngày 29/05/2026)

> Master plan + trạng thái thực tế theo commit. Đây là **điểm neo để migrate sang session mới**.
> Các handoff chi tiết: `docs/task1234-BE.md`, `docs/HANDOFF_DUC_sandbox_provisioning.md`, `E:\PalFish\HANDOFF_import_so_doanh_thu.md`, `E:\PalFish\HANDOFF_task8_casso_bien_dong_so_du.md`

---

## TRẠNG THÁI 9 TASK (chốt cuối ngày)

| # | Task | Owner | Ưu tiên | Tiến độ | Còn lại |
|---|---|---|---|---|---|
| 1 | Phân quyền theo cấp độ | Đức/Đạt (BE) · Minh (FE) | TOP 1 | ✅ **DONE** | (nhỏ) ẩn option Manager ở dropdown FE; cân nhắc hạ quyền Ops |
| 2 | Kết nối PayOS HCM | Giang (BE) · Minh (FE) | TOP 2 | ⏸️ **~35% — HOLD** | PayOS không hỗ trợ VCB → chuyển hướng đối soát VCB sang Casso (Task 8) |
| 3 | Xoá test + cập nhật data thật | Đức/Đạt (BE) · Minh (FE) | TOP 1 | ✅ **DONE (xoá)** · 🔧 **import code xong, chưa commit** | Dry-run + commit fix import + nạp data tới 28 + bật cron (xem handoff import) |
| 4 | Môi trường Sandbox | Giang/Đức (BE) · Minh (FE) | TOP 2 | 🔧 **~70%** | Provisioning: Supabase project + clone schema, Vercel branch sandbox, điền secrets Render, chạy seed `--apply` (xem handoff Đức) |
| 5 | Redesign UI Kích hoạt khoá học | Minh (FE) | TOP 3 | ⬜ **0%** | FE only — mẫu "Pulse" (progress bar, avatar, toggle, viền accent) |
| 6 | Module thống kê sale/leader/system | TBD | P2 | ⬜ **0%** | Chờ wireframe anh Hiếu |
| 7 | Cải thiện tốc độ load | Giang (FE) | TOP 3 | ✅ **DONE (~4s)** | Lazy-load + render on-demand (`ee8011f`). Có thể thêm UptimeRobot ping `/healthz` nếu cold start còn |
| 8 | Casso Flow — biến động số dư | Minh (BE·FE) | TOP 2 | 🔧 **~25%** | MB đã nối Casso. Cần: tab "Biến động số dư" + webhook + backfill (xem handoff Casso). ⚠️ Ký HĐ 3 bên MB trong 7 ngày |
| 9 | Fix tạo gói vượt tiền + xuất HĐ không cần Order ID | Minh (FE) | TOP 3 | ⬜ **0%** | FE only — 2 lỗi, chi tiết bên dưới |

---

## CÔNG VIỆC HÔM NAY ĐÃ LÀM ĐƯỢC GÌ (commit thực tế 29/05)

- **Task 1 (BE)** `e8bc2bf` Đức — RBAC scope `sale_email` cho list/patch/cancel/create payment-request + schema patch.
- **Task 1 (FE)** `6d123b9` Minh — ẩn tab Đối soát/Kích hoạt/Xuất HĐ với sale/leader; bank HCM VCB dropdown theo team.
- **Task 3** `ab7aa27`/`ba858cf`/`80d881a` Đức+Đạt — script cleanup UAT (đã xoá 36 PR/72 line/36 AR/9 đơn/3 GD) + seed + rollback SQL.
- **Task 3 (Sổ doanh thu)** — Minh đã xoá tay 2 entry M3 cũ còn sót trong `so_doanh_thu` (loai_nhap='tu_dong') qua SQL.
- **Task 4** `01c9dc4` Giang (env_utils cách ly PayOS/DingTalk sandbox + seed) + `be2fabc` Đức (render.yaml service sandbox) + `a581d9a` Minh (banner SANDBOX khớp `VITE_APP_ENV`).
- **Task 7** `ee8011f` Giang — lazy-load + render on-demand → load còn ~4s.
- **Import fix (Task 3 phần Sheet)** — **đã code trong working tree, CHƯA commit**: `gsheet_ledger_import.py` + `xlsx_ledger_import.py` (UNFORMATTED_VALUE + serial→date + dedup `import:%` + dedup DB cho Excel).
- **Plan/docs** `a581d9a`/`31315b3` Minh.

---

## 3 QUYẾT ĐỊNH QUAN TRỌNG HÔM NAY

1. **Phân quyền dùng mô hình 3 cấp** Sale → Leader → System (ẩn Manager). KHÔNG viết lại BE — `visible_creator_emails()` đã đúng. Đổi `role` trong bảng `nhan_su_sale` → quyền đổi ngay.
2. **PayOS không hỗ trợ Vietcombank** → bank VCB HCM dùng VietQR tĩnh; đối soát dòng tiền chuyển hẳn sang **Casso (Task 8)**.
3. **Import Sổ doanh thu: ưu tiên đường an toàn.** Data hiện tại 100% `import:dingtalk:%` (Excel). TUYỆT ĐỐI không bấm Sync Data khi chưa có fix dedup (sẽ nhân đôi 14.644 dòng). Fix đã code xong (chưa commit).

---

## CHI TIẾT TASK 9 — Fix 2 lỗi (FE only, TOP 3)

**Lỗi A — tạo gói học vượt tiền thực nhận:** `ActivationTab.tsx` dùng `pr.target` thay vì `pr.received` và không chặn. Fix: chặn `total > pr.received` khi lưu + progress bar "đã dùng / đã nhận / còn lại"; default gói mới = `max(0, pr.received − total)` (sửa dòng ~596/620).

**Lỗi B — không xuất HĐ khi thiếu Order ID:** bỏ `disabled={!course.orderId?.trim()}` tại `ActivationTab.tsx:1208`. BE `invoice_routes.py` không check Order ID — đã xác nhận, không cần sửa BE.

---

## CHI TIẾT TASK 5 — Redesign Kích hoạt khoá học (FE only, TOP 3)

KHÔNG đổi logic/nút bấm. Mẫu "Pulse": progress bar "X/Y gói đã kích hoạt" + tổng tiền cam; avatar tròn chữ cái đầu; toggle switch thay badge tĩnh; viền trái xanh accent cho card gói. File: `ActivationTab.tsx` + `ActiveRequestMiniCardV2` trong `PaymentRequestDetailDrawer.tsx`.

---

## TASK 8 — Casso (TOP 2) — tóm tắt

MB Bank HN đã nối Casso (Webhook V2). Cần xây tab **"Biến động số dư"** (nhóm "Đối soát & Hóa đơn", chỉ System thấy). 5 phase: bảng `bank_transactions` → `/webhook/casso` → backfill REST API → endpoint list RBAC system → FE tab + filters. **Chi tiết đầy đủ: `E:\PalFish\HANDOFF_task8_casso_bien_dong_so_du.md`.**
⚠️ Ký hợp đồng 3 bên MB **trong 7 ngày**. Cần xác nhận loại TK HCM (VCB DigiBiz hay iB@nking) + quota gói Standard.

---

## VIỆC ƯU TIÊN CHO NGÀY MAI

```
1. Commit + verify fix import Sổ doanh thu (đang dang dở trong working tree)
   → dry-run sync-gsheet → đối chiếu Excel → commit → nạp data tới 28 → bật cron
   (handoff: E:\PalFish\HANDOFF_import_so_doanh_thu.md)

2. Task 9 — fix 2 lỗi nghiệp vụ (FE, nhanh ~2-3h)

3. Task 8 — Casso tab "Biến động số dư" (BE+FE)
   (handoff: E:\PalFish\HANDOFF_task8_casso_bien_dong_so_du.md)

4. Task 5 — redesign Kích hoạt khoá học (FE)

5. Task 4 — provisioning sandbox (Đức, cần quyền Supabase/Vercel)
   (handoff: docs/HANDOFF_DUC_sandbox_provisioning.md)
```

---

## GHI CHÚ KỸ THUẬT QUAN TRỌNG

- **Import dedup:** fingerprint = `sha256(uid | pay_time[:10] | so_tien_vnd | sale_crm_name | sdt)`. Sau fix, dedup chống cả `import:gsheet:%` lẫn `import:dingtalk:%`.
- **Data Sổ hiện tại:** 13.847 SM + 797 HCM = 14.644 dòng, tag `import:dingtalk:%`. HCM thiếu ~51 dòng do `--hcm-max-row 798` (file thực 848). HCM có dòng ngày tương lai tới 10/2026.
- **Sandbox env convention:** `APP_ENV=sandbox` (BE) / `VITE_APP_ENV=sandbox` (FE). `.env.sandbox` đã gitignore.
- **Working tree đang có thay đổi chưa commit:** `gsheet_ledger_import.py`, `xlsx_ledger_import.py` (fix import), `frontend/.env.sandbox` (thêm VITE_APP_ENV).
- **Cảnh báo:** chưa bấm nút "Sync Data" trên UI cho tới khi fix dedup được commit + deploy.
