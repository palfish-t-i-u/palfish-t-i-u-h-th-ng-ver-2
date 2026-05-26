# Prototype UI spec (auto-extracted)

**Source:** `c:\Users\silly\Downloads\PalFish CRM.html`

## CSS modules in HTML (Figma export blocks)

- Active Request (Kích hoạt khoá học)
- Address split
- App shell
- Buttons
- Cancel confirm modal
- Country code combobox
- Created at column
- Date range filter
- Drawer (detail)
- KPI cards
- Page content
- Payment method picker
- Reconciliation (Đối soát giao dịch)
- Revenue Ledger (Sổ doanh thu)
- Row cancel button
- Sidebar
- Table
- Tabs (Đang theo dõi / Đã huỷ)
- Toolbar / filters
- Topbar
- UID + phone merged cell

## Key labels found in HTML


## How dev should use this file

1. Open HTML in browser — this list tells which blocks exist.
2. Implement one block → one React component under `frontend/src/components/payment-request/`.
3. Do not invent layout — match column order and Vietnamese copy from HTML.
4. Re-run: `python scripts/extract_prototype_spec.py` after Hiếu updates HTML.
