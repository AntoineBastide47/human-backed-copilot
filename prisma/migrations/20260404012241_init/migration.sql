-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "nullifierHash" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "verificationLevel" TEXT NOT NULL,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "agentbookRegId" TEXT,
    "ensName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'registering',
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "freeTrialRemaining" INTEGER NOT NULL DEFAULT 3,
    "spendLimits" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentStrategy" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenIn" TEXT NOT NULL,
    "tokenOut" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL DEFAULT 480,
    "amountPerInterval" TEXT NOT NULL,
    "interval" TEXT NOT NULL,
    "autoExecute" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentStrategy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proposal" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "tokenIn" TEXT NOT NULL,
    "tokenOut" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "estimatedOutput" TEXT NOT NULL DEFAULT '0',
    "reasoning" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Proposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Execution" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "proposalId" TEXT,
    "txHash" TEXT NOT NULL,
    "amountIn" TEXT NOT NULL,
    "amountOut" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Execution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_nullifierHash_key" ON "User"("nullifierHash");

-- CreateIndex
CREATE INDEX "Agent_ownerId_idx" ON "Agent"("ownerId");

-- CreateIndex
CREATE INDEX "Agent_status_idx" ON "Agent"("status");

-- CreateIndex
CREATE INDEX "AgentStrategy_agentId_status_idx" ON "AgentStrategy"("agentId", "status");

-- CreateIndex
CREATE INDEX "Proposal_agentId_status_idx" ON "Proposal"("agentId", "status");

-- CreateIndex
CREATE INDEX "Proposal_strategyId_idx" ON "Proposal"("strategyId");

-- CreateIndex
CREATE INDEX "Proposal_createdAt_idx" ON "Proposal"("createdAt");

-- CreateIndex
CREATE INDEX "Proposal_agentId_createdAt_idx" ON "Proposal"("agentId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Proposal_agentId_strategyId_status_idx" ON "Proposal"("agentId", "strategyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Execution_proposalId_key" ON "Execution"("proposalId");

-- CreateIndex
CREATE INDEX "Execution_agentId_idx" ON "Execution"("agentId");

-- CreateIndex
CREATE INDEX "Execution_strategyId_idx" ON "Execution"("strategyId");

-- CreateIndex
CREATE INDEX "Execution_agentId_executedAt_idx" ON "Execution"("agentId", "executedAt" DESC);

-- CreateIndex
CREATE INDEX "Execution_strategyId_executedAt_idx" ON "Execution"("strategyId", "executedAt" DESC);

-- AddForeignKey
ALTER TABLE "Agent" ADD CONSTRAINT "Agent_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentStrategy" ADD CONSTRAINT "AgentStrategy_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "AgentStrategy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Execution" ADD CONSTRAINT "Execution_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Execution" ADD CONSTRAINT "Execution_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "AgentStrategy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Execution" ADD CONSTRAINT "Execution_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
