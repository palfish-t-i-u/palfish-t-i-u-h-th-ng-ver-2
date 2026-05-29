# Codex Handoff Prompt — PalFish GMV Reconciliation (30/05/2026)

Dùng prompt dưới đây để tiếp tục công việc trên Codex hoặc session AI mới.

---

## PROMPT

```
Tôi tiếp tục dự án PalFish GMV Reconciliation (FastAPI + Supabase + React/Vite) tại repo palfish-t-i-u/palfish-t-i-u-h-th-ng-ver-2, branch ui/ux.

## Context nhanh
- Branch `ui/ux` @ `73f1950` — 19 commits ahead, 6 behind `origin/main`
- Production: `origin/main` @ `ce69d2f`
- Working tree SẠCH (vừa commit xong fix import `73f1950`)

## Đọc trước (theo thứ tự ưu tiên)
1. `docs/HANDOFF_CODEX_2026-05-30.md` — trạng thái tổng quan 9 task + branch audit + việc cần làm
2. `docs/HANDOFF_task8_casso.md` — chi tiết 5 phase Casso (nếu làm Task 8)
3. `docs/HANDOFF_DUC_sandbox_provisioning.md` — provisioning sandbox (nếu làm Task 4)
4. `docs/ke-hoach-28-5.md` — master plan v5 gốc (reference)

## Trạng thái 9 task (tóm tắt)
- ✅ DONE: Task 1 (RBAC), Task 3 (cleanup + import fix), Task 7 (lazy-load)
- ⏸️ HOLD: Task 2 (PayOS HCM → chuyển sang Casso)
- 🔧 IN PROGRESS: Task 4 (~70%, chờ Đức provisioning), Task 8 (~25%, cần code)
- ⬜ NOT STARTED: Task 5 (redesign FE), Task 6 (chờ wireframe), Task 9 (2 lỗi FE)

## Việc cần làm (theo ưu tiên)

### P0 — Merge + deploy (bắt buộc trước mọi thứ)
1. Merge `origin/main` vào `ui/ux` (6 commits behind: RBAC BE, sandbox, lazy-load, env sync)
2. Push `ui/ux`
3. Merge `ui/ux` → `main` (PR hoặc direct merge)
4. Verify deploy OK

### P1 — Nạp data Sổ doanh thu
Sau khi deploy, chạy sync-gsheet (dry_run=False) hoặc bấm "Sync Data" trên UI.
Kỳ vọng: ~96 dòng mới. Sau đó bật cron tự động hàng ngày.

### P2 — Task 9: Fix 2 lỗi FE (nhanh ~2-3h)
- Lỗi A: `ActivationTab.tsx` ~dòng 596/620 — chặn tạo gói vượt `pr.received` (hiện dùng `pr.target`)
- Lỗi B: `ActivationTab.tsx:1208` — bỏ `disabled={!course.orderId?.trim()}` cho xuất HĐ

### P3 — Task 8: Casso tab "Biến động số dư" (BE+FE, ~1-2 ngày)
Đọc `docs/HANDOFF_task8_casso.md` — 5 phase: bảng DB → webhook → backfill → API list → FE tab.

### P4 — Task 5: Redesign Kích hoạt (FE only)
Mẫu "Pulse" trong `ActivationTab.tsx` + `PaymentRequestDetailDrawer.tsx`.

## Ràng buộc
- ⚠️ KHÔNG bấm "Sync Data" trên UI production cho tới khi import fix (`73f1950`) được deploy lên main
- ⚠️ Task 8 Casso: ký HĐ 3 bên MB Bank deadline ~05/06/2026
- `feature-dat` (Đạt) và `feature-duc` (Đức) có code chưa merge — cẩn thận conflict khi merge

## Bắt đầu từ đâu?
Hãy đọc `docs/HANDOFF_CODEX_2026-05-30.md` rồi bắt đầu P0 (merge + deploy). Sau đó chuyển sang P2 (Task 9) vì nhanh nhất.
```

---

## GHI CHÚ SỬ DỤNG

- Copy toàn bộ phần trong block ``` ``` phía trên làm prompt đầu tiên cho Codex
- Codex sẽ đọc các file handoff trong repo rồi tự nắm context
- Nếu Codex hỏi về creds (GOOGLE_SERVICE_ACCOUNT_JSON, CASSO_API_KEY): các creds này ở `backend/.env` (local, không commit)
- Nếu cần chạy dev server: FE `cd frontend && npm run dev` (:5173), BE `cd backend && python run.py` (:8000)
