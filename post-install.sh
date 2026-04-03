#!/bin/bash
set -euo pipefail

# ============================================================================
# POST-INSTALL — Run this AFTER the repo is created (21h+).
# Assumes pre-install.sh was already run (node, pnpm, postgres, redis exist).
# No Docker. Postgres + Redis run via brew services.
# Run: chmod +x post-install.sh && ./post-install.sh
# Time: ~3-5 minutes
# ============================================================================

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
fail() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  POST-INSTALL — repo setup (no Docker)            ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# ── 0. Preflight checks ────────────────────────────────────────────────────
# Ensure pnpm globals are in PATH (pre-install.sh sets this up)
export PNPM_HOME="$HOME/Library/pnpm"
export PATH="$PNPM_HOME:$PATH"

command -v node      &>/dev/null || fail "node not found — run pre-install.sh first"
command -v pnpm      &>/dev/null || fail "pnpm not found — run pre-install.sh first"
command -v psql      &>/dev/null || fail "psql not found — run pre-install.sh first"
command -v redis-cli &>/dev/null || fail "redis-cli not found — run pre-install.sh first"
command -v ngrok     &>/dev/null || fail "ngrok not found — run pre-install.sh first"

# Ensure services are running
if ! brew services list | grep -q "postgresql.*started"; then
  warn "PostgreSQL not running — starting..."
  brew services start postgresql@16
  sleep 3
fi

if ! brew services list | grep -q "redis.*started"; then
  warn "Redis not running — starting..."
  brew services start redis
  sleep 2
fi

# Verify connectivity
psql hackathon -c "SELECT 1;" &>/dev/null 2>&1 || {
  warn "Database 'hackathon' not found — creating..."
  createdb hackathon 2>/dev/null || fail "Cannot create database. Is PostgreSQL running?"
}

redis-cli ping 2>/dev/null | grep -q PONG || fail "Redis not responding. Try: brew services restart redis"

log "Preflight checks passed (Postgres + Redis running)"

# ── 1. Repo URL ─────────────────────────────────────────────────────────────
if [[ -z "${REPO_URL:-}" ]]; then
  echo ""
  echo -e "${YELLOW}  Enter your GitHub repo URL:${NC}"
  echo -e "${YELLOW}  (e.g. https://github.com/your-org/human-backed-copilot.git)${NC}"
  echo ""
  read -rp "  > " REPO_URL
  echo ""
fi

[[ -z "$REPO_URL" ]] && fail "No repo URL provided"

PROJECT_DIR="${PROJECT_DIR:-$(basename "$REPO_URL" .git)}"

# ── 2. Clone ────────────────────────────────────────────────────────────────
if [[ ! -d "$PROJECT_DIR" ]]; then
  warn "Cloning $REPO_URL..."
  git clone "$REPO_URL" "$PROJECT_DIR"
  log "Cloned to $PROJECT_DIR"
else
  warn "$PROJECT_DIR already exists — pulling latest..."
  cd "$PROJECT_DIR" && git pull && cd ..
fi

cd "$PROJECT_DIR"

# ── 3. Install project dependencies ────────────────────────────────────────
warn "Installing project dependencies..."
pnpm install
log "pnpm install complete"

# ── 4. Install all SDK packages ─────────────────────────────────────────────
warn "Ensuring all required packages are present..."

pnpm add \
  @worldcoin/minikit-js \
  @worldcoin/agentkit   \
  @ensdomains/ensjs     \
  viem                  \
  ethers                \
  bullmq                \
  @prisma/client        \
  next-auth             \
  jsonwebtoken          \
  swr                   \
  date-fns              \
  next                  \
  react                 \
  react-dom             \
  2>/dev/null || true

pnpm add -D \
  prisma                \
  @types/node           \
  @types/react          \
  @types/react-dom      \
  @types/jsonwebtoken   \
  typescript            \
  tailwindcss           \
  postcss               \
  autoprefixer          \
  2>/dev/null || true

log "All SDK packages installed"

# ── 5. Init shadcn/ui + components ─────────────────────────────────────────
warn "Setting up shadcn/ui..."

pnpm dlx shadcn-ui@latest init -y 2>/dev/null || true

pnpm dlx shadcn-ui@latest add \
  button card input tabs badge skeleton dialog toast \
  -y 2>/dev/null || true

log "shadcn/ui components installed"

# ── 6. Create .env.local ───────────────────────────────────────────────────
# Detect the current macOS username for the Postgres connection string
# brew postgres uses the macOS user as the default role, no password
PG_USER=$(whoami)

if [[ ! -f .env.local ]]; then
  cat > .env.local << ENV
# ╔════════════════════════════════════════════════════════════╗
# ║  Fill in ALL values before running the app.               ║
# ║  Share completed .env.local via private group chat ONLY.  ║
# ║  NEVER commit this file.                                  ║
# ╚════════════════════════════════════════════════════════════╝

# ── World (P1 fills) ──
APP_ID=app_
WLD_CLIENT_ID=
WLD_CLIENT_SECRET=

# ── Uniswap (P0 fills) ──
UNISWAP_API_KEY=

# ── Chain (P0 fills) ──
WALLET_PRIVATE_KEY=0x
WORLD_CHAIN_RPC=
PAY_TO=0x

# ── Database (auto-filled for local brew postgres — no password) ──
DATABASE_URL=postgresql://${PG_USER}@localhost:5432/hackathon
REDIS_URL=redis://localhost:6379

# ── Auth (P1 fills) ──
NEXTAUTH_SECRET=
JWT_SECRET=

# ── ENS (P1 fills) ──
MAINNET_RPC=

# ── Dev tunnel (auto-filled by this script) ──
NGROK_URL=
ENV
  log ".env.local created (Postgres user: $PG_USER, no password)"
else
  warn ".env.local already exists — not overwriting"
fi

# ── 7. Prisma migrate ──────────────────────────────────────────────────────
if [[ -f prisma/schema.prisma ]]; then
  warn "Running Prisma migration..."
  npx prisma generate 2>/dev/null || true
  npx prisma migrate dev --name init 2>/dev/null && log "Migration complete" || warn "Migration failed — P1 will fix during H1-3"
else
  warn "No prisma/schema.prisma yet — P1 will create it"
fi

# ── 8. Ensure .gitignore ───────────────────────────────────────────────────
if [[ -f .gitignore ]]; then
  grep -q '.env.local' .gitignore || echo '.env.local' >> .gitignore
  grep -q 'node_modules' .gitignore || echo 'node_modules' >> .gitignore
else
  cat > .gitignore << 'GITIGNORE'
node_modules
.env
.env.local
.env.*.local
.next
*.tsbuildinfo
GITIGNORE
fi
log ".gitignore verified"

# ── 9. Start ngrok ─────────────────────────────────────────────────────────
warn "Starting ngrok tunnel on port 3000..."

pkill -f "ngrok http" 2>/dev/null || true
sleep 1

ngrok http 3000 --log=stdout > /tmp/ngrok.log 2>&1 &
NGROK_PID=$!
sleep 4

NGROK_URL=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null | jq -r '.tunnels[0].public_url // empty')

if [[ -n "$NGROK_URL" ]]; then
  log "ngrok running: $NGROK_URL (PID: $NGROK_PID)"
  sed -i '' "s|^NGROK_URL=.*|NGROK_URL=$NGROK_URL|" .env.local 2>/dev/null || true
else
  warn "ngrok started but URL not detected. Check http://localhost:4040"
  NGROK_URL="(check http://localhost:4040)"
  NGROK_PID="?"
fi

# ── 10. Final verification ─────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  Verification                                    ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

for pkg in @worldcoin/minikit-js @worldcoin/agentkit @ensdomains/ensjs viem bullmq swr; do
  if [[ -d "node_modules/$pkg" ]] || [[ -d "node_modules/.pnpm/$pkg"* ]]; then
    log "$pkg: installed"
  else
    warn "$pkg: not found in node_modules"
  fi
done

echo ""

if psql hackathon -c "SELECT 1;" &>/dev/null 2>&1; then
  log "Postgres: connected to 'hackathon'"
else
  warn "Postgres: cannot connect"
fi

if redis-cli ping 2>/dev/null | grep -q PONG; then
  log "Redis: PONG"
else
  warn "Redis: not responding"
fi

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  POST-INSTALL COMPLETE (no Docker)               ║"
echo "║                                                  ║"
echo "║  ngrok: $NGROK_URL"
echo "║                                                  ║"
echo "║  ┌────────────────────────────────────────────┐  ║"
echo "║  │  BEFORE YOU CODE:                          │  ║"
echo "║  │                                            │  ║"
echo "║  │  1. Fill .env.local (split per P0/P1/P2)   │  ║"
echo "║  │  2. Developer Portal:                      │  ║"
echo "║  │     → App URL = ngrok URL                  │  ║"
echo "║  │     → Incognito Action: register-agent     │  ║"
echo "║  │  3. Uniswap key: hub.uniswap.org          │  ║"
echo "║  │  4. Fund wallet on World Chain             │  ║"
echo "║  │  5. pnpm dev                               │  ║"
echo "║  └────────────────────────────────────────────┘  ║"
echo "║                                                  ║"
echo "║  Quick commands:                                 ║"
echo "║    pnpm dev                    → dev server      ║"
echo "║    npx prisma studio           → DB browser      ║"
echo "║    npx prisma migrate dev -n X → new migration   ║"
echo "║    npx prisma db seed          → load demo data  ║"
echo "║    brew services list          → service status   ║"
echo "║    brew services restart postgresql@16            ║"
echo "║    brew services restart redis                    ║"
echo "║    psql hackathon              → SQL shell        ║"
echo "║    redis-cli                   → Redis shell      ║"
echo "║    kill $NGROK_PID                  → stop ngrok  ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
