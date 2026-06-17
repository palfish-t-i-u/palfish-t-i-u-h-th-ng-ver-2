#!/usr/bin/env bash
# Trigger a Render deploy via its Deploy Hook.
#
# Secrets (the hook URLs) live in scripts/deploy-hooks.local — which is gitignored
# and NEVER committed. Copy scripts/deploy-hooks.local.example to create it.
#
# Usage:
#   bash scripts/deploy.sh            # deploy sandbox (default)
#   bash scripts/deploy.sh sandbox
#   bash scripts/deploy.sh prod
set -euo pipefail

TARGET="${1:-sandbox}"
HERE="$(cd "$(dirname "$0")" && pwd)"
HOOK_FILE="$HERE/deploy-hooks.local"

# Load KEY=URL lines from the local (gitignored) secrets file, if present.
if [ -f "$HOOK_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$HOOK_FILE"
  set +a
fi

case "$TARGET" in
  sandbox) HOOK="${RENDER_DEPLOY_HOOK_SANDBOX:-}" ;;
  prod)    HOOK="${RENDER_DEPLOY_HOOK_PROD:-}" ;;
  *) echo "Unknown target: '$TARGET' (use: sandbox | prod)"; exit 1 ;;
esac

VAR="RENDER_DEPLOY_HOOK_$(printf '%s' "$TARGET" | tr '[:lower:]' '[:upper:]')"
if [ -z "$HOOK" ]; then
  echo "Thiếu deploy hook cho '$TARGET'."
  echo "Tạo file scripts/deploy-hooks.local (copy từ .example) và thêm dòng:"
  echo "  $VAR=https://api.render.com/deploy/srv-...?key=..."
  exit 1
fi

echo "→ Trigger Render deploy: $TARGET"
RESP="$(curl -fsS -X POST "$HOOK")"
echo "Render: $RESP"
echo "✓ Đã gửi lệnh deploy. Theo dõi build trong Render dashboard (Events/Logs)."
