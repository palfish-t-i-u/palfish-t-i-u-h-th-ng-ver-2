# Task 3 — Cleanup Test/UAT Data

Date executed: **May 29, 2026**

## Script

- [`scripts/cleanup_task3_uat_data.py`](/C:/job/palfish-gmv-manager/scripts/cleanup_task3_uat_data.py)

Default behavior: `dry-run`.

```powershell
# Preview candidates
python scripts/cleanup_task3_uat_data.py

# Apply delete + auto backup JSON
python scripts/cleanup_task3_uat_data.py --apply
```

## Scope

Tables covered:

- `payment_requests`
- `payment_lines`
- `active_requests`
- `don_hang`
- `giao_dich`

Rule:

- match UAT/test keywords in business fields (`test`, `uat`, `manual`, `abc`, `fdgrg`, `bgjyg`, `hieu`, `webhook`, `persist`, `e2e`, ...)
- plus date filter `created_at >= 2026-05-20` (default, configurable)

## Result (executed)

Deleted counts:

- `active_requests`: **36**
- `payment_lines`: **72**
- `payment_requests`: **36**
- `giao_dich`: **3**
- `don_hang`: **9**

Backup file:

- [`docs/artifacts/task3_cleanup_backup_20260529_045733.json`](/C:/job/palfish-gmv-manager/docs/artifacts/task3_cleanup_backup_20260529_045733.json)

Post-check:

- Candidate rows = **0** for all 5 tables under current rule set.
