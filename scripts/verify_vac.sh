#!/usr/bin/env bash
# Verify guardrails for VAC-03/04/05/06/08/09 — run after team fix to confirm.
# Usage: bash scripts/verify_vac.sh [task]
#        bash scripts/verify_vac.sh        # all
#        bash scripts/verify_vac.sh VAC-03 # only VAC-03
set -euo pipefail

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TASK="${1:-ALL}"
TASK_UPPER="$(printf '%s' "$TASK" | tr '[:lower:]' '[:upper:]')"
FAILED=0
SKIPPED=0

print_header() {
  echo ""
  echo "================================================================"
  echo "  $1"
  echo "================================================================"
}

run_section() {
  local tag="$1"   # e.g. VAC-03
  if [ "$TASK_UPPER" = "ALL" ] || [ "$TASK_UPPER" = "$tag" ]; then
    return 0  # proceed
  fi
  return 1  # skip
}

# ---------------------------------------------------------------------------
# VAC-03  Installment over-receive guard (BE — Đạt)
# ---------------------------------------------------------------------------
print_header "VAC-03  Installment validation guard (pytest)"

if run_section "VAC-03"; then
  cd "$REPO_ROOT/backend"
  pytest tests/test_vac_03_installment_validate.py -v
  echo ""
  echo "[VAC-03] PASS"
else
  echo "[VAC-03] SKIPPED (not selected)"
  SKIPPED=$((SKIPPED + 1))
fi

# ---------------------------------------------------------------------------
# VAC-04  sandbox → main merge readiness (git)
# ---------------------------------------------------------------------------
print_header "VAC-04  sandbox -> main merge readiness (git)"

if run_section "VAC-04"; then
  cd "$REPO_ROOT"

  echo "--- Fetching remote refs ---"
  git fetch origin

  echo ""
  echo "--- Commits in sandbox not yet in origin/main ---"
  PENDING=$(git log origin/main..sandbox --oneline)
  if [ -z "$PENDING" ]; then
    echo "(none — sandbox is already merged into main)"
  else
    echo "$PENDING"
  fi

  echo ""
  echo "--- Checking for untracked critical files ---"
  CRITICAL_PATTERNS=(
    "backend/migrations/*.sql"
    "frontend/src/components/*.tsx"
    "backend/*.py"
  )
  UNTRACKED_CRITICAL=""
  while IFS= read -r line; do
    for pat in "${CRITICAL_PATTERNS[@]}"; do
      # shellcheck disable=SC2254
      case "$line" in
        $pat)
          UNTRACKED_CRITICAL="$UNTRACKED_CRITICAL\n  $line"
          ;;
      esac
    done
  done < <(git ls-files --others --exclude-standard)

  if [ -n "$UNTRACKED_CRITICAL" ]; then
    echo "WARNING: untracked critical files found (not staged/committed):"
    printf '%b\n' "$UNTRACKED_CRITICAL"
    echo ""
    echo "[VAC-04] WARNING — untracked critical files; stage or .gitignore them before merge"
    FAILED=$((FAILED + 1))
  else
    echo "(none — no untracked critical files)"
    echo ""
    echo "[VAC-04] PASS"
  fi
else
  echo "[VAC-04] SKIPPED (not selected)"
  SKIPPED=$((SKIPPED + 1))
fi

# ---------------------------------------------------------------------------
# VAC-05  Exchange rate no hard-code fallback (BE — Đức)
# ---------------------------------------------------------------------------
print_header "VAC-05  Exchange rate no hard-code fallback (pytest)"

if run_section "VAC-05"; then
  cd "$REPO_ROOT/backend"
  pytest tests/test_vac_05_exchange_rate_no_fallback.py -v
  echo ""
  echo "[VAC-05] PASS"
else
  echo "[VAC-05] SKIPPED (not selected)"
  SKIPPED=$((SKIPPED + 1))
fi

# ---------------------------------------------------------------------------
# VAC-06  Module6Tab reads exchange rate from API, not hard-code (FE — Đạt)
# ---------------------------------------------------------------------------
print_header "VAC-06  Module6Tab exchange rate from API (vitest)"

if run_section "VAC-06"; then
  cd "$REPO_ROOT/frontend"
  npm run test -- Module6Tab.rate
  echo ""
  echo "[VAC-06] PASS"
else
  echo "[VAC-06] SKIPPED (not selected)"
  SKIPPED=$((SKIPPED + 1))
fi

# ---------------------------------------------------------------------------
# VAC-08  CRM backfill concurrency cap (BE — Đức) — fix OOM
# ---------------------------------------------------------------------------
print_header "VAC-08  CRM backfill concurrency cap (pytest)"

if run_section "VAC-08"; then
  cd "$REPO_ROOT/backend"
  pytest tests/test_vac_08_crm_concurrency_cap.py -v
  echo ""
  echo "[VAC-08] PASS"
else
  echo "[VAC-08] SKIPPED (not selected)"
  SKIPPED=$((SKIPPED + 1))
fi

# ---------------------------------------------------------------------------
# VAC-09  Export endpoints use FileResponse not StreamingResponse(BytesIO) (BE — Đức) — fix OOM
# ---------------------------------------------------------------------------
print_header "VAC-09  Export tempfile + FileResponse (pytest)"

if run_section "VAC-09"; then
  cd "$REPO_ROOT/backend"
  pytest tests/test_vac_09_export_use_file_response.py -v
  echo ""
  echo "[VAC-09] PASS"
else
  echo "[VAC-09] SKIPPED (not selected)"
  SKIPPED=$((SKIPPED + 1))
fi

# ---------------------------------------------------------------------------
# TypeScript + build (runs for ALL or if not a specific VAC task)
# Run last so BE/FE unit tests surface first on failures
# ---------------------------------------------------------------------------
print_header "Build gate: tsc -b + vite build (frontend)"

if [ "$TASK_UPPER" = "ALL" ]; then
  cd "$REPO_ROOT/frontend"

  echo "--- npx tsc -b ---"
  npx tsc -b

  echo ""
  echo "--- npm run build ---"
  npm run build

  echo ""
  echo "[Build gate] PASS"
else
  echo "[Build gate] SKIPPED (only runs in ALL mode)"
  SKIPPED=$((SKIPPED + 1))
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
print_header "SUMMARY"
if [ "$FAILED" -eq 0 ]; then
  echo "All selected checks PASSED."
  if [ "$SKIPPED" -gt 0 ]; then
    echo "($SKIPPED section(s) skipped — run without argument to check all)"
  fi
  exit 0
else
  echo "$FAILED check(s) FAILED. See output above."
  exit 1
fi
