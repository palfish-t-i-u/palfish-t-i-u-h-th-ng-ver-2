# BE gate without FE mirror = silent rejection

**Related files:** `frontend/src/components/InvoiceRequestTab.tsx`, `frontend/src/components/ActivationTab.tsx`, `frontend/src/contexts/PaymentFlowContext.tsx`, `backend/activation_routes.py`

**Problem:** Added BE validation (MST/company_name/email required for business invoices) but forgot to update the FE pre-check (`isRowComplete`) in the invoice tab — button stayed enabled, BE rejected, catch block swallowed the specific error, user saw generic "kiểm tra Order ID và thông tin KH" with no idea what was missing.

**Trap:** Fixing a validation gap in the BE gate (`activation_routes.py:_course_invoice_blockers` + gate issue endpoint) and the B3 FE blocker (`ActivationTab.tsx:getInvoiceBlockers`) but missing the B4 FE pre-check (`InvoiceRequestTab.tsx:isRowComplete`). There are THREE places that gate invoice issuance, not two: BE blocker function, FE B3 blocker (ActivationTab), and FE B4 completeness check (InvoiceRequestTab). The B4 `isRowComplete` is easy to miss because it's a simple boolean in a different file from the detailed blocker logic.

**Insight:** The invoice system has a "mirror pattern" documented as BE↔FE, but it's actually BE↔FE(B3)↔FE(B4) — three mirrors. `getInvoiceBlockers` (B3) returns detailed blocker objects with keys and messages. `isRowComplete` (B4) returns a simple boolean used to enable/disable the "Xuất HĐ" button. They check overlapping-but-not-identical conditions, and `isRowComplete` has no test coverage to catch drift. Additionally, FE catch blocks that swallow API error details make debugging impossible for end users.

**Rule:** When adding a new invoice validation rule, grep for ALL three gates and update each:
```bash
grep -n "_course_invoice_blockers\|getInvoiceBlockers\|isRowComplete" backend/activation_routes.py frontend/src/components/ActivationTab.tsx frontend/src/components/InvoiceRequestTab.tsx
```
All three must check the same conditions for the same customer types.

**Verify:** `cd frontend && npx vitest run src/components/InvoiceRequestTab.isRowComplete.test.ts src/components/ActivationTab.invoiceBlockers.test.ts --reporter=verbose 2>&1 | grep -E "Tests|passed|failed"`
