# Backend Audit Verification Tests

Bộ test để verify các fix từ [HANDOFF_BE_AUDIT_2026-06-03.md](../../docs/HANDOFF_BE_AUDIT_2026-06-03.md).

## Baseline

Commit: `8531f62f9d2db6de5244a77ef31e53a9fbd88ff4` (main)
Tại baseline, hầu hết test sẽ **FAIL** — đó là đúng, vì chưa có fix nào.

## Chạy test

```bash
cd backend

# Chạy tất cả
pip install pytest httpx  # nếu chưa có
pytest

# Chạy theo nhóm (theo người phụ trách)
pytest tests/test_audit_auth.py    # Đạt — auth/permissions
pytest tests/test_audit_db.py      # Đức — database/race conditions
pytest tests/test_audit_other.py   # Giang — webhook/encrypt/config

# Chạy 1 task cụ thể
pytest tests/test_audit_auth.py::TestAUTH01_ActivationRequiresAuth
pytest tests/test_audit_db.py::TestDB01_OrderSequenceAtomic
pytest tests/test_audit_other.py::TestOTHER01_WebhookHmacVerification
```

## Cách verify commit của team BE

```bash
# 1. Checkout commit/branch cần verify
git checkout <branch-or-commit>

# 2. Chạy test
cd backend && pytest

# 3. Xem test nào PASS → fix tương ứng đã đúng
#    Test nào FAIL → chưa fix hoặc fix chưa đúng
```

## Mapping test → task

| Test class | Task | Người |
|-----------|------|-------|
| TestAUTH01_ActivationRequiresAuth | AUTH-01 | Đạt |
| TestAUTH02_ReportBC03RequiresAuth | AUTH-02 | Đạt |
| TestAUTH03_CrmTokenRequiresAuth | AUTH-03 | Đạt |
| TestAUTH04_PaymentTransactionsRequireAuth | AUTH-04 | Đạt |
| TestAUTH05_DashboardFiltersRequiresAuth | AUTH-05 | Đạt |
| TestAUTH06_CORSNotTooWide | AUTH-06 | Đạt |
| TestAUTH07_NoWastedStaffQuery | AUTH-07 | Đạt |
| TestDB01_OrderSequenceAtomic | DB-01 | Đức |
| TestDB02_InvoiceSequenceAtomic | DB-02 | Đức |
| TestDB03_PaymentRequestSequenceAtomic | DB-03 | Đức |
| TestDB04_JsonbUpdateAtomic | DB-04 | Đức |
| TestDB05_KpiSaveAtomic | DB-05 | Đức |
| TestDB06_DashboardPaginationBounded | DB-06 | Đức |
| TestDB07_RevenueFetchBounded | DB-07 | Đức |
| TestOTHER01_WebhookHmacVerification | OTHER-01 | Giang |
| TestOTHER02_OrderCodeNoCollision | OTHER-02 | Giang |
| TestOTHER03_CrmTokenEncrypted | OTHER-03 | Giang |
| TestOTHER04_DeleteRevenueAuditLog | OTHER-04 | Giang |
| TestOTHER05_ExportBatchIdempotent | OTHER-05 | Giang |
| TestOTHER06_BulkDeletePartialResult | OTHER-06 | Giang |
| TestOTHER07_EnvDefaultSafe | OTHER-07 | Giang |
| TestOTHER08_TeamListConfigurable | OTHER-08 | Giang |
