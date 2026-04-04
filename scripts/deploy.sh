#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════════════
# Human-Backed Trading Copilot — Full Deploy Script
#
# Prerequisites:
#   brew install railway vercel
#   railway login
#   vercel login
#   .env.local filled with all credentials
#
# Usage:
#   ./scripts/deploy.sh              # full deploy
#   ./scripts/deploy.sh infra        # Railway infra only
#   ./scripts/deploy.sh web          # Vercel only
#   ./scripts/deploy.sh worker       # Railway worker only
#   ./scripts/deploy.sh migrate      # DB migration only
#   ./scripts/deploy.sh seed         # Seed demo data only
#   ./scripts/deploy.sh trades       # Pre-execute 2 real trades
# ═══════════════════════════════════════════════════════════════════════

STEP="${1:-all}"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

log() { echo -e "\n\033[1;34m[deploy]\033[0m $1"; }
err() { echo -e "\033[1;31m[deploy] ERROR:\033[0m $1" >&2; exit 1; }

check_cli() {
  command -v "$1" >/dev/null 2>&1 || err "$1 not installed. Run: brew install $1"
}

# ── 1. Railway infrastructure (Postgres + Redis) ─────────────────────

deploy_infra() {
  log "Provisioning Railway infrastructure..."
  check_cli railway

  # Check if Railway project exists
  if ! railway status 2>/dev/null; then
    log "Creating Railway project..."
    railway init --name human-backed-copilot
  fi

  # Add Postgres if not present
  if ! railway variable list --json 2>/dev/null | grep -q DATABASE_URL; then
    log "Adding PostgreSQL..."
    railway add --database postgres
    log "Waiting for Postgres to provision..."
    sleep 10
  fi

  # Add Redis if not present
  if ! railway variable list --json 2>/dev/null | grep -q REDIS_URL; then
    log "Adding Redis..."
    railway add --database redis
    log "Waiting for Redis to provision..."
    sleep 10
  fi

  # Export DATABASE_PUBLIC_URL for local migration (internal URL only works inside Railway)
  RAILWAY_DB_URL=$(railway variable list --json 2>/dev/null | node -e "
    const d=require('fs').readFileSync('/dev/stdin','utf8');
    const v=JSON.parse(d);
    console.log(v.DATABASE_PUBLIC_URL||v.DATABASE_URL||'');
  " 2>/dev/null || echo "")

  if [ -n "$RAILWAY_DB_URL" ]; then
    log "Railway Postgres URL available"
    export DATABASE_URL="$RAILWAY_DB_URL"
  else
    log "Could not retrieve DATABASE_URL from Railway. Set it manually."
  fi

  log "Infrastructure ready"
}

# ── 2. Database migration ────────────────────────────────────────────

deploy_migrate() {
  log "Running Prisma migration on production DB..."

  if [ -z "${DATABASE_URL:-}" ]; then
    # Try Railway public URL first (internal URL only works inside Railway)
    DATABASE_URL=$(railway variable list --json 2>/dev/null | node -e "
      const d=require('fs').readFileSync('/dev/stdin','utf8');
      const v=JSON.parse(d);
      console.log(v.DATABASE_PUBLIC_URL||'');
    " 2>/dev/null || echo "")
    export DATABASE_URL

    # Fall back to .env.local
    if [ -z "${DATABASE_URL:-}" ] && [ -f .env.local ]; then
      DATABASE_URL=$(grep '^DATABASE_URL=' .env.local | cut -d= -f2-)
      export DATABASE_URL
    fi
  fi

  [ -z "${DATABASE_URL:-}" ] && err "DATABASE_URL not set"

  npx prisma migrate deploy
  npx prisma generate

  log "Migration complete"
}

# ── 3. Deploy Next.js to Vercel ──────────────────────────────────────

deploy_web() {
  log "Deploying Next.js to Vercel..."
  check_cli vercel

  # Set env vars from .env.local
  if [ -f .env.local ]; then
    log "Pushing env vars to Vercel..."
    while IFS= read -r line; do
      # Skip comments and empty lines
      [[ "$line" =~ ^#.*$ || -z "$line" ]] && continue
      key="${line%%=*}"
      value="${line#*=}"
      # Skip empty values
      [ -z "$value" ] && continue
      echo "$value" | vercel env add "$key" production --force 2>/dev/null || true
    done < .env.local
  fi

  vercel --prod

  VERCEL_URL=$(vercel inspect --json 2>/dev/null | node -e "
    const d=require('fs').readFileSync('/dev/stdin','utf8');
    try { console.log(JSON.parse(d).url); } catch { console.log(''); }
  " 2>/dev/null || echo "")

  if [ -n "$VERCEL_URL" ]; then
    log "Deployed to: https://$VERCEL_URL"
    log ""
    log "MANUAL STEP: Update Developer Portal app URL to https://$VERCEL_URL"
  else
    log "Deployed. Check vercel dashboard for production URL."
    log "MANUAL STEP: Update Developer Portal app URL to the production URL."
  fi
}

# ── 4. Deploy agent worker to Railway ────────────────────────────────

deploy_worker() {
  log "Deploying agent worker to Railway..."
  check_cli railway

  # Set env vars on Railway from .env.local
  if [ -f .env.local ]; then
    log "Pushing env vars to Railway..."
    while IFS= read -r line; do
      [[ "$line" =~ ^#.*$ || -z "$line" ]] && continue
      key="${line%%=*}"
      value="${line#*=}"
      [ -z "$value" ] && continue
      railway variable set "$key=$value" 2>/dev/null || true
    done < .env.local
  fi

  # Set the start command for the worker
  railway variable set "RAILWAY_START_COMMAND=npx tsx scripts/agent-worker.ts"

  # Also set DEMO_MODE for live demo
  railway variable set "DEMO_MODE=true"

  railway up --detach

  log "Worker deployed. Check railway dashboard for logs."
}

# ── 5. Seed demo data ────────────────────────────────────────────────

deploy_seed() {
  log "Seeding demo data..."
  npx tsx scripts/seed-demo.ts
  log "Seed complete"
}

# ── 6. Pre-execute real trades ───────────────────────────────────────

deploy_trades() {
  log "Pre-executing 2 real trades..."
  log "Make sure the wallet has ETH (gas) and WETH on World Chain (480)."
  npx tsx scripts/stage-trades.ts
  log "Trades complete"
}

# ── Router ───────────────────────────────────────────────────────────

case "$STEP" in
  infra)   deploy_infra ;;
  migrate) deploy_migrate ;;
  web)     deploy_web ;;
  worker)  deploy_worker ;;
  seed)    deploy_seed ;;
  trades)  deploy_trades ;;
  all)
    deploy_infra
    deploy_migrate
    deploy_web
    deploy_worker
    deploy_seed
    log ""
    log "Full deploy complete. Remaining manual steps:"
    log "  1. Update Developer Portal app URL"
    log "  2. Fund wallet: send ETH + WETH to $(grep WALLET_PRIVATE_KEY .env.local 2>/dev/null | head -1 | cut -d= -f2- || echo '<WALLET_ADDRESS>')"
    log "  3. Run: ./scripts/deploy.sh trades"
    ;;
  *)
    echo "Usage: $0 {all|infra|web|worker|migrate|seed|trades}"
    exit 1
    ;;
esac
