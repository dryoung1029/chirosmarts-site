#!/usr/bin/env bash
# ChiroSmarts — one-time Cloudflare provisioning + deploy.
#
# Provisions the resources the app needs (D1, R2, KV-for-adapter), writes the
# resulting IDs into wrangler.toml, runs the remote D1 migrations, and deploys
# the Pages project. Idempotent: existing resources are reused, not duplicated.
#
# Auth (non-interactive) is via env vars — either export them or prefix the call:
#   CLOUDFLARE_API_TOKEN=...  CLOUDFLARE_ACCOUNT_ID=...  bash scripts/cloudflare-setup.sh
#
# The token needs (account-scoped): D1:Edit, Workers KV Storage:Edit,
# Workers R2 Storage:Edit, Cloudflare Pages:Edit, Account Settings:Read.
#
# Resource IDs (database_id, kv id) are NOT secrets and are committed in
# wrangler.toml. API keys are never written here — set those with
#   wrangler pages secret put <NAME> --project-name chirosmarts-site
set -euo pipefail

PROJECT="chirosmarts-site"
DB_NAME="chirosmarts"
R2_BUCKET="chirosmarts-docs"
KV_BINDING="SESSION"
TOML="wrangler.toml"

: "${CLOUDFLARE_API_TOKEN:?set CLOUDFLARE_API_TOKEN}"
: "${CLOUDFLARE_ACCOUNT_ID:?set CLOUDFLARE_ACCOUNT_ID}"

wr() { npx wrangler "$@"; }

echo "==> D1: ensure database '$DB_NAME'"
DB_ID="$(wr d1 list --json 2>/dev/null | python3 -c "import sys,json;print(next((d['uuid'] for d in json.load(sys.stdin) if d['name']=='$DB_NAME'),''))" || true)"
if [ -z "$DB_ID" ]; then
  OUT="$(wr d1 create "$DB_NAME" 2>&1)"; echo "$OUT"
  DB_ID="$(printf '%s' "$OUT" | sed -n 's/.*database_id = "\([^"]*\)".*/\1/p' | head -1)"
fi
[ -n "$DB_ID" ] || { echo "could not resolve D1 id"; exit 1; }
echo "    database_id=$DB_ID"

echo "==> KV: ensure namespace bound as '$KV_BINDING'"
KV_TITLE="${PROJECT}-${KV_BINDING}"
KV_ID="$(wr kv namespace list 2>/dev/null | python3 -c "import sys,json;print(next((n['id'] for n in json.load(sys.stdin) if n['title']=='$KV_TITLE'),''))" || true)"
if [ -z "$KV_ID" ]; then
  OUT="$(wr kv namespace create "$KV_BINDING" 2>&1)"; echo "$OUT"
  KV_ID="$(printf '%s' "$OUT" | sed -n 's/.*id = "\([^"]*\)".*/\1/p' | head -1)"
fi
[ -n "$KV_ID" ] || { echo "could not resolve KV id"; exit 1; }
echo "    kv id=$KV_ID"

echo "==> R2: ensure bucket '$R2_BUCKET'"
wr r2 bucket create "$R2_BUCKET" 2>&1 | grep -iv "already" || true

echo "==> writing IDs into $TOML"
sed -i.bak "s|REPLACE_WITH_D1_DATABASE_ID|$DB_ID|; s|REPLACE_WITH_KV_NAMESPACE_ID|$KV_ID|" "$TOML"
rm -f "$TOML.bak"

echo "==> applying remote D1 migrations"
wr d1 migrations apply "$DB_NAME" --remote

echo "==> building"
npm run build

echo "==> deploying Pages project '$PROJECT'"
wr pages deploy ./dist --project-name "$PROJECT" --branch main --commit-dirty=true

echo
echo "✓ Done. Live at https://$PROJECT.pages.dev (and the per-deploy preview URL above)."
echo "  Next: set secrets when you have them, e.g.:"
echo "    npx wrangler pages secret put RESEND_API_KEY --project-name $PROJECT"
echo "  And seed the catalog once if you want the demo course live:"
echo "    npm run db:seed:remote"
