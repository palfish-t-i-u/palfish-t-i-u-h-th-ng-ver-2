# Search normalize tiếng Việt — NFD thiếu đ→d

**Date:** 2026-07-11
**Commits:** a3cb6f5 (fix gốc, thiếu đ), 6e0c49d (patch đ→d)

## Problem

User gõ "như y" (không dấu) không khớp PR tên "Như Ý". Search dùng `toLowerCase().includes()` — chỉ so sánh nguyên gốc, không strip dấu tiếng Việt.

## Trap

Fix nhanh dùng `NFD decompose + strip combining marks` bỏ sót **đ/Đ** (U+0111/U+0110). Đây là base character riêng trong Unicode, KHÔNG bị NFD decompose thành `d + combining mark`. Kết quả: "Đặng" normalize thành "đang" nhưng user gõ "dang" → vẫn không khớp.

Đây là lỗi kinh điển khi làm Vietnamese text normalization bằng NFD — Google "NFD Vietnamese đ" sẽ thấy rất nhiều người mắc.

## Insight

Vietnamese normalization cần **2 bước bắt buộc**:
1. `NFD + strip combining marks (U+0300–U+036F)` — xoá sắc/huyền/hỏi/ngã/nặng, breve, circumflex, horn
2. `đ→d` — thủ công, vì đ là base character riêng

```ts
const normVi = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d");
```

## Rule

### Chưa triệt để — cần extract utility + áp dụng toàn app

Fix hiện tại inline `norm` trong `PaymentRequestsTab.tsx` useMemo. Còn **10 chỗ search tên tiếng Việt** cùng pattern `toLowerCase().includes()` chưa được fix:

| File | Dòng | Search field chứa tên VN |
|------|------|--------------------------|
| `ActivationTab.tsx` | 62–64 | name, uid |
| `ActivationTab.tsx` | 1881 | customerName, uid |
| `CardReconciliationTab.tsx` | 176 | cardholder_name |
| `CardReconciliationTab.tsx` | 286 | pr_name |
| `ReconciliationTab.tsx` | 472 | child_name, sale_name |
| `ReconciliationTab.tsx` | 574 | prName |
| `InvoiceRequestTab.tsx` | 281 | name |
| `AuthAccountsTab.tsx` | 202–204 | fullName, crmName |
| `ReportBC03Tab.tsx` | 772–774 | crm_name, display_name |
| `DeleteAccountsModal.tsx` | 41–43 | crmName, fullName |

**Không cần fix** (search trên giá trị không có dấu VN):
- `bank.ts:49` — "hcm" literal
- `DashboardTab.tsx:470` — "team" literal
- `CountryCombo.tsx:55` — country name tiếng Anh
- `PermissionsTab.tsx:440`, `StaffPickerModal.tsx:59` — department key
- `StaffPickerModal.tsx:47–49` — email, department (không có dấu VN)

### Fix đúng

1. Extract `normVi()` vào `frontend/src/lib/textUtils.ts`
2. Viết test: "Như Ý"→"nhu y", "Đặng"→"dang", "Nguyễn"→"nguyen", empty/null safe
3. Replace tất cả 10 chỗ trên: `v.toLowerCase().includes(q)` → `normVi(v).includes(normVi(q))` (hoặc pre-compute `normVi(q)` ngoài loop)
4. Xoá inline `norm` trong `PaymentRequestsTab.tsx`
