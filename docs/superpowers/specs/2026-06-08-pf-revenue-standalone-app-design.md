# Design Spec: pf-revenue — Standalone Revenue Management App

> **Ngày**: 2026-06-08
> **Người thiết kế**: Josh / Minh
> **Spec gốc từ anh Hiếu**: `docs/SPEC_DOANH_THU.md`
> **Source code archive**: branch `payments-module-archive` trên repo GMV

## Bối cảnh

Module Quản lý Doanh Thu đã được phát triển trong app GMV Reconciliation (~2,940 dòng FE+BE), sau đó anh Hiếu đính chính: module này cần tách thành **nền tảng riêng** vì bản chất là hệ thống quản lý doanh thu độc lập, không liên quan nghiệp vụ đối soát GMV PalFish.

Code đã được revert khỏi GMV app (commit `3c7cd12`) và lưu tại branch `payments-module-archive`.

## Quyết định kiến trúc

**Approach được chọn:** Clone stack GMV (React+Vite+FastAPI+Supabase+Vercel+Render).

Lý do: code đã có ~80%, chỉ cần tách + scaffold. Streamlit phải rewrite FE từ đầu (1454 dòng React → Python). Supabase-only (no BE) phải rewrite ~1200 dòng Python logic thành SQL/RLS.

---

## 1. Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌──────────────────────┐
│  Vercel (FE)    │────▶│  Render (BE)     │────▶│  Supabase (DB mới)   │
│  React 19+Vite  │     │  FastAPI          │     │  pf-revenue project  │
│  Tailwind+AG    │     │  pf-revenue-api   │     │  Auth riêng          │
│  Grid Community │     │                   │     │  7 tables            │
└─────────────────┘     └──────────────────┘     └──────────────────────┘
```

- **DB riêng**: Supabase project mới `pf-revenue`, hoàn toàn tách biệt GMV
- **Auth riêng**: Tạo 5-15 accounts trong project mới (cùng email/password nếu muốn)
- **Không phụ thuộc GMV**: app mới chạy độc lập, GMV không bị ảnh hưởng

## 2. Repo Structure

Monorepo mới `pf-revenue/`:

```
pf-revenue/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── PaymentsTab.tsx          ← archive branch (1454 dòng)
│   │   │   ├── AuthAccountsTab.tsx      ← copy GMV (478 dòng)
│   │   │   ├── auth/                    ← copy GMV (3 sub-components)
│   │   │   ├── permissions/             ← copy GMV (PermissionsTab + 3 files, ~1555 dòng)
│   │   │   └── ui/                      ← copy GMV (shared UI components)
│   │   ├── layouts/
│   │   │   └── AppShell.tsx             ← copy GMV (sidebar navigation)
│   │   ├── hooks/
│   │   │   ├── useAuth.ts              ← copy GMV
│   │   │   ├── usePermission.ts        ← copy GMV
│   │   │   └── useMe.ts               ← copy GMV
│   │   ├── lib/
│   │   │   ├── api.ts                  ← copy GMV, cắt bớt chỉ payments endpoints
│   │   │   └── cn.ts                   ← copy GMV
│   │   ├── types/
│   │   │   ├── permissions.ts          ← copy GMV, MODULE_LIST thu gọn
│   │   │   └── profile.ts             ← copy GMV
│   │   ├── pages/
│   │   │   ├── LoginPage.tsx           ← copy GMV
│   │   │   ├── MainPage.tsx            ← viết mới (đơn giản, 4 nav items)
│   │   │   └── ProfilePage.tsx         ← copy GMV
│   │   └── App.tsx                     ← viết mới
│   ├── tailwind.config.ts              ← copy GMV (design tokens)
│   ├── package.json                    ← mới (React, Vite, AG Grid, Tailwind)
│   └── vite.config.ts
├── backend/
│   ├── main.py                         ← viết mới (FastAPI app, mount routers)
│   ├── rbac.py                         ← copy GMV (262 dòng)
│   ├── admin_routes.py                 ← copy GMV (1132 dòng), cắt MODULE_LIST
│   ├── payment_routes.py               ← archive branch (694 dòng)
│   ├── payment_report_routes.py        ← archive branch (494 dòng)
│   ├── payment_logic.py                ← archive branch (28 dòng)
│   ├── sheet_row_parsers.py            ← archive branch (268 dòng)
│   └── requirements.txt
└── docs/
    └── SPEC_DOANH_THU.md               ← copy từ GMV (spec gốc anh Hiếu)
```

## 3. Code Reuse Summary

| Nguồn | Dòng code | Hành động |
|-------|-----------|-----------|
| archive branch (PaymentsTab, BE routes, logic) | ~2,940 | Copy nguyên |
| GMV app (auth, permissions, AppShell, hooks, UI) | ~4,000 | Copy + cắt bớt |
| Viết mới (App.tsx, MainPage.tsx, main.py) | ~200 | Scaffold đơn giản |
| **Tổng** | **~7,140** | |

## 4. Navigation & Layout

```
┌─ Header: logo "Quản lý Doanh thu" + user avatar + logout ───┐
├─ Sidebar (thu gọn được, copy AppShell từ GMV):               │
│   📊 Doanh thu     ← PaymentsTab (4 sub-tabs bên trong)     │
│   👤 Tài khoản Auth                                          │
│   🔒 Phân quyền                                              │
│   👤 Thông tin cá nhân                                        │
└──────────────────────────────────────────────────────────────┘
```

MODULE_LIST thu gọn (4 items thay vì 14 trong GMV):

```typescript
export const MODULE_LIST: ModuleDef[] = [
  { key: "payments", label: "Quản lý Doanh thu", description: "Nhập / sửa doanh thu, báo cáo, đối soát", section: "Doanh thu" },
  { key: "authAccounts", label: "Tài khoản Auth", description: "Quản lý tài khoản đăng nhập", section: "Hệ thống" },
  { key: "permissions", label: "Phân quyền", description: "Ma trận phân quyền phòng ban × module", section: "Hệ thống" },
  { key: "profile", label: "Thông tin cá nhân", description: "Hồ sơ cá nhân", section: "Hệ thống" },
];
```

## 5. Database

### Supabase project mới: `pf-revenue`

Region: `ap-northeast-1` (giống sandbox GMV).

### Tables (7 bảng, schema từ `SPEC_DOANH_THU.md`):

| Table | Mô tả | Data migrate từ sandbox |
|-------|--------|------------------------|
| `payments` | Doanh thu (grain = 1 khoản TT) | 15,099 rows |
| `customers` | Khách hàng (uid = PK) | 9,977 rows |
| `sales` | Master nhân sự | 198 rows |
| `channels` | Master kênh | 34 rows |
| `packages` | Master gói | 153 rows |
| `bank_transactions` | Giao dịch NH (tương lai) | 0 rows |
| `crm_orders` | Đơn CRM (tương lai) | 0 rows |

Thêm tables hệ thống (copy từ GMV):

| Table | Mô tả |
|-------|--------|
| `department_permissions` | Ma trận phân quyền |
| `permission_overrides` | Override cá nhân |

### Data migration

1. Export từ sandbox Supabase (`pxgybyfiwywksesyogti`) — 5 tables có data
2. Import vào project mới
3. Tạo auth accounts cho 5-15 users

Thời gian: ~1 giờ.

## 6. Auth & RBAC

### Auth

Supabase Auth riêng (project mới). Email/password login. Tạo accounts cho 5-15 nội bộ PalFish.

### RBAC — 4 cấp (theo spec anh Hiếu)

| Hành động | sale | leader | data/manager | system |
|-----------|------|--------|--------------|--------|
| Xem báo cáo team mình | — | V | V | V |
| Xem toàn bộ doanh thu | — | — | V | V |
| Thêm / sửa / import doanh thu | — | — | V | V |
| Hoàn tiền / khôi phục | — | — | V | V |
| Upload & đối soát ngân hàng | — | — | V | V |
| Sửa master (Sale↔team, kênh, gói) | — | — | V | V |
| Sửa config tỷ giá GMV | — | — | — | V |
| Xóa (soft delete) | — | — | — | V |

**Team-scoped access:** Leader chỉ xem data team mình — giữ nguyên logic `resolve_actor()` + team filter từ `rbac.py`.

### Default permission matrix

| Module | sale | hr/manager | data | system |
|--------|------|------------|------|--------|
| payments | none | full | full | full |
| authAccounts | none | full | none | full |
| permissions | none | full | none | full |
| profile | full | full | full | full |

## 7. API Endpoints

### Payments CRUD (copy từ archive)

| Method | Path | Mô tả | Role |
|--------|------|--------|------|
| GET | `/api/v1/payments` | List + filter + summary | leader+ |
| POST | `/api/v1/payments` | Tạo payment | data+ |
| PATCH | `/api/v1/payments/{id}` | Sửa field | data+ |
| POST | `/api/v1/payments/{id}/refund` | Hoàn tiền | data+ |
| POST | `/api/v1/payments/{id}/restore` | Khôi phục | data+ |
| POST | `/api/v1/payments/{id}/link-crm` | Gán CRM thủ công | data+ |
| DELETE | `/api/v1/payments/{id}` | Soft delete | system |
| GET | `/api/v1/customers/search` | Tìm khách | data+ |

### Master data CRUD (copy từ archive)

| Method | Path | Role |
|--------|------|------|
| GET/POST/PATCH | `/api/v1/payments/master/sales` | manager+ |
| GET/POST/PATCH | `/api/v1/payments/master/channels` | manager+ |
| GET/POST/PATCH | `/api/v1/payments/master/packages` | manager+ |
| PATCH | `/api/v1/payments/master/customers/{uid}` | data+ |

### Reports (copy từ archive)

| Method | Path | Mô tả | Role |
|--------|------|--------|------|
| GET | `/api/v1/reports/bctb` | BCTB ngày×team | leader+ |
| GET | `/api/v1/reports/team` | Theo team | leader+ |
| GET | `/api/v1/reports/channel` | Theo kênh | leader+ |
| GET | `/api/v1/reports/{type}/export` | Xuất Excel | leader+ |
| GET | `/api/v1/recon/internal` | Cảnh báo nội bộ | data+ |

### Chưa có (Phase 2)

| Method | Path | Mô tả |
|--------|------|--------|
| POST | `/api/v1/payments/import` | Import Excel |
| GET | `/api/v1/payments/export` | Export grid chính |
| POST | `/api/v1/recon/bank/import` | Upload file NH |
| POST | `/api/v1/recon/bank/match` | Khớp thủ công |
| GET | `/api/v1/recon/bank` | Đơn chưa khớp NH |
| GET | `/api/v1/recon/crm` | Đơn treo CRM |

## 8. Deployment

| Service | Platform | Tier | Chi phí |
|---------|----------|------|---------|
| Frontend | Vercel | Free (Hobby) | $0 |
| Backend | Render | Free hoặc Starter | $0-7/mo |
| Database | Supabase | Free | $0 |
| **Tổng** | | | **$0-7/mo** |

Auto-deploy từ `main` branch. Dev server local: Vite :5173 + uvicorn :8000.

## 9. Phân pha

### Phase 1 — MVP (tuần 1)

- [ ] Scaffold repo `pf-revenue` (frontend + backend)
- [ ] Copy code từ archive branch + GMV
- [ ] Chỉnh MODULE_LIST, MainPage, App.tsx, main.py
- [ ] Tạo Supabase project mới + chạy SQL schema
- [ ] Migrate data từ sandbox (5 tables)
- [ ] Tạo auth accounts
- [ ] Deploy Vercel + Render
- [ ] Verify: 4 sub-tabs hoạt động, RBAC đúng, auth đúng

### Phase 2 — Hoàn thiện (tuần 2)

- [ ] Import Excel từ file upload (`POST /payments/import`)
- [ ] Export Excel cho grid chính (`GET /payments/export`)
- [ ] Đối soát ngân hàng: upload file NH + khớp tự động
- [ ] E2E tests (Playwright)

## 10. Rủi ro & Giảm thiểu

| Rủi ro | Xác suất | Giảm thiểu |
|--------|----------|------------|
| Copy code có import lỗi (reference module GMV không tồn tại) | Cao | Chạy `tsc --noEmit` ngay sau copy, fix từng lỗi |
| Data migration mất/sai | Thấp | Export → verify row count → import → verify lại |
| User quên password app mới | Thấp | Tạo cùng email/password với GMV, gửi link reset |
| Supabase free tier giới hạn | Rất thấp | 5-15 users, 25k rows — rất xa limit |
