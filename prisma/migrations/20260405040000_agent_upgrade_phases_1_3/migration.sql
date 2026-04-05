-- Phase 1: Stateful, portfolio-aware strategies
ALTER TABLE "AgentStrategy" ADD COLUMN "strategyType" TEXT NOT NULL DEFAULT 'dca';
ALTER TABLE "AgentStrategy" ADD COLUMN "targetAllocationBps" INTEGER;
ALTER TABLE "AgentStrategy" ADD COLUMN "rebalanceBandBps" INTEGER;
ALTER TABLE "AgentStrategy" ADD COLUMN "maxSlippageBps" INTEGER;
ALTER TABLE "AgentStrategy" ADD COLUMN "minNotionalUsd" TEXT;
ALTER TABLE "AgentStrategy" ADD COLUMN "cooldownMinutes" INTEGER;
ALTER TABLE "AgentStrategy" ADD COLUMN "lastTriggeredAt" TIMESTAMP(3);

-- Phase 3: Structured proposal metadata
ALTER TABLE "Proposal" ADD COLUMN "triggerType" TEXT;
ALTER TABLE "Proposal" ADD COLUMN "triggerSummary" TEXT;
ALTER TABLE "Proposal" ADD COLUMN "notionalUsd" TEXT;
ALTER TABLE "Proposal" ADD COLUMN "expectedSlippageBps" INTEGER;
ALTER TABLE "Proposal" ADD COLUMN "marketSnapshot" JSONB;
