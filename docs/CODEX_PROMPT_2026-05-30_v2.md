# Codex Handoff Prompt — 30/05/2026 (v2)

Copy prompt dưới đây vào session mới.

---

## PROMPT

```
Tôi tiếp tục dự án PalFish GMV Reconciliation (FastAPI + Supabase + React 19/Vite/TypeScript/Tailwind).

Repo: palfish-t-i-u/palfish-t-i-u-h-th-ng-ver-2
Branch: main @ ca83253 (fully synced, worktree clean)
Codebase: E:\PalFish\DA\pf-gmv-reconciliation\palfish-t-i-u-h-th-ng-ver-2

## Đọc trước
1. docs/PLAN_30-05-2026.md — plan 3 task hôm nay + trạng thái 9 task hôm qua
2. docs/HANDOVER_CODEX.md — tổng quan dự án (stack, cấu trúc, API, DB, auth, RBAC)
3. docs/HANDOFF_task8_casso.md — chi tiết Casso nếu cần (chưa ưu tiên hôm nay)

## Trạng thái hiện tại
- 9 task hôm qua: 7/9 DONE (Task 1,3,5,7,9 done; Task 2 HOLD; Task 4 chờ Đức infra). Chỉ Task 8 (Casso) chưa code.
- main đã merge: ui/ux + feature-dat (PR #13). All branches synced.
- Import Sổ doanh thu: fix đã deploy, có thể Sync Data an toàn.
- Đức commit dbe8e64: sync Sổ doanh thu khi PATCH order_id.

## 3 Task hôm nay

### Task 1 — Module "Bảng thông tin" (FE + BE) — TOP 2
File mẫu HTML từ anh Hiếu: C:\Users\silly\Downloads\Bảng thông tin (standalone).html
Mở file này trong browser để xem design mẫu, rồi implement y theo.

4 vùng:
1. Tính hoa hồng: để trắng, hiện "Đang phát triển"
2. Vinh danh hôm nay + Bảng xếp hạng tháng: query so_doanh_thu (tổng GMV/VND theo sale_crm_name hôm nay → top 1 vinh danh; tháng → ranking)
3. Bảng nhiệm vụ & thưởng tuần: nội dung static copy từ mẫu
4. Bảng sự kiện nội bộ: nội dung static copy từ mẫu

FE: Tạo DashboardTab.tsx (hoặc BangThongTinTab.tsx). Thêm vào MainPage.tsx — sidebar ĐẦU TIÊN, mọi role thấy.
BE: Endpoint GET /dashboard/bang-thong-tin hoặc tái dùng revenue pivot + filter.

### Task 2 — Verify sync Sổ doanh thu khi kích hoạt khóa học — TOP 1
Đức đã commit dbe8e64 thêm sync_ledger_from_ar_course. Cần verify: kích hoạt 1 khoá học (PATCH order_id) → check Sổ doanh thu có dòng mới không.
Files: backend/activation_routes.py:1185, backend/revenue_routes.py (sync_ledger_from_ar_course).

### Task 3 — Đổi icon + favicon + tên miền — TOP 3
Icon inapp (sidebar logo): C:\Users\silly\Downloads\Avatar 5.png
Favicon (browser tab): C:\Users\silly\Downloads\Avatar 3.png
Hiện tại: frontend/public/favicon.svg + frontend/index.html:5

Tên miền: muốn đổi sang subdomain palfish.vn (vd: gmv.palfish.vn).
Domain palfish.vn đang active trên iNET Portal (portal.inet.vn).
Cách làm: iNET DNS → thêm CNAME "gmv" → cname.vercel-dns.com. Vercel Dashboard → Domains → Add gmv.palfish.vn.

## Ràng buộc
- Sync Data sổ doanh thu: có thể bấm an toàn (dedup import:% đã deploy)
- Casso Task 8: chưa code, deadline ký HĐ 3 bên ~05/06
- Stale branches có thể xoá: feature-kem, test-integration-final, ui/ux-anh-minh

## Bắt đầu
Đọc docs/PLAN_30-05-2026.md rồi bắt đầu Task 1 (Bảng thông tin) — mở file HTML mẫu trong browser trước.
```
