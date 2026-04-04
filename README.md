# Human-Backed Copilot

AI trading agents verified by World ID. Bots get blocked — human-backed agents get through.

Built at **ETHGlobal Cannes 2026**.

---

## What it does

Users verify their humanity with **World ID**, then register an AI trading agent that proposes DCA and rebalance actions on **World Chain**. Every trade requires explicit human approval before execution. The agent gets an **ENS subname** (`name.copilot.eth`) and is registered on-chain via **World AgentKit**.


---

## Stack

- **Next.js 14** App Router · TypeScript
- **Prisma** + PostgreSQL + Redis
- **viem** · World Chain (chain ID 480)
- **@worldcoin/minikit-js** — World App mini app SDK
- **@worldcoin/agentkit** — AgentBook on-chain registration, x402 payment hooks
- **Uniswap Trading API** — quote + permit2 + swap
- **@ensdomains/ensjs** — off-chain ENS subnames
- TailwindCSS · shadcn/ui

> **Important:** this app only runs inside the **World App** mobile webview. It will not work in a regular browser.

---

## Architecture

```
World App (mobile webview)
  └─ Mini App (Next.js) ──→ World ID verify (Orb / Device)
        │
        │ fetch() to API routes
        ▼
  Next.js API Routes
  Auth · Agent CRUD · Proposals · Executions
  World ID verify · ENS subnames
        │
   ┌────┴──────────────┬────────────────┐
   ▼                   ▼                ▼
Agent Kit          Uniswap          PostgreSQL
AgentBook          Trading API      + Redis
x402 hooks         quote+swap
   │
   ▼
Agent Runtime (always-on worker on Railway)
monitor → propose → [human approves] → execute
```

---

## Pages

| Route | Description |
|-------|-------------|
| `/` | Verification center — World ID login |
| `/dashboard` | Active agent overview, strategies, delete |
| `/agent/setup` | Register a new agent |
| `/agent/strategies` | Add a DCA / rebalance strategy |
| `/agent/proposals` | Approve or reject pending trade proposals |
| `/agent/history` | Execution history with tx links |

---

## API routes

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/verify` | Verify World ID proof, create/upsert user |
| GET/POST | `/api/agents` | List or create agents |
| GET/PATCH/DELETE | `/api/agents/[id]` | Get, update status, or delete agent |
| GET/POST | `/api/agents/[id]/strategies` | List or add strategies |
| GET | `/api/agents/[id]/proposals` | List proposals (filter by `?status=`) |
| POST | `/api/agents/[id]/approve` | Approve proposal → execute swap |
| POST | `/api/agents/[id]/reject` | Reject proposal |
| GET | `/api/executions` | List executions (`?agentId=`) |


---

## Local setup

### Prerequisites

- Node.js 20+, pnpm
- Docker (for local Postgres + Redis) **or** `brew services start postgresql@16 redis`
- ngrok (World App requires HTTPS)

### 1. Install dependencies

```bash
pnpm install
```

### 2. Environment variables

Create `.env.local` and fill in:

```env
# World
APP_ID=app_xxx
WLD_CLIENT_ID=
WLD_CLIENT_SECRET=

# Uniswap
UNISWAP_API_KEY=

# Chain
WALLET_PRIVATE_KEY=0x...
WORLD_CHAIN_RPC=
PAY_TO=0x...

# Database
DATABASE_URL=postgresql://...
REDIS_URL=redis://...

# Auth
NEXTAUTH_SECRET=
JWT_SECRET=

# ENS
MAINNET_RPC=

# Dev tunnel
NGROK_URL=
```

### 3. Database

```bash
docker-compose up -d          # local Postgres + Redis
npx prisma migrate dev --name init
npx prisma db seed            # optional demo data
npx prisma studio             # visual DB browser
```

### 4. Dev server + tunnel

```bash
pnpm dev                      # http://localhost:3000
ngrok http 3000               # expose over HTTPS for World App
# Update Developer Portal app URL to the ngrok URL
```

### 5. Register an agent wallet (one-time)

```bash
npx @worldcoin/agentkit-cli register <agent-wallet-address>
```


---

## Deployment

| Service | What runs there |
|---------|----------------|
| Vercel | Next.js app (frontend + API routes) |
| Railway | Agent runtime worker (always-on loop) |
| Railway / Supabase | PostgreSQL |
| Upstash / Railway | Redis |

> The agent runtime **cannot** run on Vercel — function timeouts kill the loop. Deploy it as a separate always-on worker on Railway.

```bash
vercel deploy --prod
```

---

## Key gotchas

**Uniswap permit2** — if `quote.permitData` exists, sign it and include both `signature` + `permitData` in the swap request. Never send one without the other or omit both when present.

**World ID action string** — `'register-agent'` must be identical on the frontend (`MiniKit.commandsAsync.verify`) and backend (`verifyCloudProof`). A mismatch causes silent failure with no error in logs.

**MiniKit install race** — call `MiniKit.install()` before any `commandsAsync` call, or guard with `MiniKit.isInstalled()`.

**Agent loop** — runs on Railway as an always-on worker. `InMemoryAgentKitStorage` resets on restart; implement `DatabaseAgentKitStorage` for production persistence.

**Wrong USDC address** — always use the World Chain USDC (`0x79A02482A880bCE3F13e09Da970dC34db4CD24d1`). Using mainnet USDC causes silent reverts.

**ENS subnames** — off-chain (no gas) for hackathon speed. Text records: `strategy`, `worldid`, `owner`, `url`.
