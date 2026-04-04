# CLAUDE.md

## Project

**IMPORTANT** - THE PROJECt ONLY RUNS ON THE WORLD APP, NO WHERE ELSE

**Human-Backed Trading Copilot** — a mini app where verified humans register AI trading agents that propose DCA/rebalance actions, require human approval, and execute swaps on-chain. Bots get blocked, human-backed agents get through.

**Bounty targets:** World Agent Kit ($8k) + World ID 4.0 ($8k) + MiniKit 2.0 ($4k) + Uniswap API ($10k) + ENS AI Agents ($5k) + ENS Creative ($5k)

**Stack:** Next.js 14 App Router · TypeScript · Prisma · PostgreSQL · Redis · viem · @worldcoin/minikit-js · @worldcoin/agentkit · Uniswap Trading API · @ensdomains/ensjs · TailwindCSS · shadcn/ui

## Critical constants

- World Chain ID: 480 (CAIP2: eip155:480)
- World Chain USDC: 0x79A02482A880bCE3F13e09Da970dC34db4CD24d1
- Uniswap API: https://trade-api.gateway.uniswap.org (headers: x-api-key + x-universal-router-version: 2.0)
- World ID Action: 'register-agent' (MUST match Developer Portal)
- ENS parent: copilot.eth

## File ownership

- P0 (Execution): services/*
- P1 (Backend): lib/*, prisma/*, app/api/*, types/index.ts (sole editor)
- P2 (Frontend): app/ pages, components/*

## Silent failure modes

1. Permit2: send BOTH signature+permitData, or NEITHER. Never null.
2. Action string mismatch: frontend verify() action must equal backend verifyCloudProof() action.
3. MiniKit race: call install() before any commandsAsync call.
4. Wrong USDC address on World Chain = silent revert.
5. npx prisma outside project dir = infinite hang. Use prisma directly.
6. Agent loop on Vercel = timeout. Must run on Railway as always-on worker.

## Commands

```
pnpm dev                                  # dev server
brew services start postgresql@16         # Postgres :5432
brew services start redis                 # Redis :6379
ngrok http 3000                           # tunnel for World App
npx prisma studio                         # DB browser
npx prisma migrate dev --name X           # new migration
npx prisma db seed                        # demo data
```

See the full CLAUDE.md in the chat history for complete architecture, types, contracts, and request flows.

## Commit Guidelines

Use the european norms for commit titles, do not add yourself as a co-author and do not mention P0, P1 or P2