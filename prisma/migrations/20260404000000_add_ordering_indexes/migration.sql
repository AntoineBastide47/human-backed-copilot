-- Add composite indexes for hot query paths
--
-- GET /api/executions: WHERE agentId = ? ORDER BY executedAt DESC
-- Previously only @@index([agentId]) existed; the sort required a full scan
-- of the agentId index. The new composite index covers both the filter and sort.
CREATE INDEX "Execution_agentId_executedAt_idx" ON "Execution"("agentId", "executedAt" DESC);

-- GET /api/agents/[id]/proposals (no status filter): WHERE agentId = ? ORDER BY createdAt DESC
-- The existing @@index([agentId, status]) only helps filtered queries.
-- This composite index covers unfiltered listing ordered by createdAt.
CREATE INDEX "Proposal_agentId_createdAt_idx" ON "Proposal"("agentId", "createdAt" DESC);
