-- Compound index for getRecentProposal(agentId, strategyId, windowMs)
-- Query shape: WHERE agentId=? AND strategyId=? AND status IN (?) AND createdAt>=?
CREATE INDEX "Proposal_agentId_strategyId_status_idx" ON "Proposal"("agentId", "strategyId", "status");

-- Compound index for getLastExecutionForStrategy(strategyId)
-- Query shape: WHERE strategyId=? ORDER BY executedAt DESC (take 1)
CREATE INDEX "Execution_strategyId_executedAt_idx" ON "Execution"("strategyId", "executedAt" DESC);

-- Partial unique constraint: only one pending-or-approved proposal per strategy
-- at any given time. Guards against concurrent agent-loop proposal creation
-- races that getRecentProposal time-window logic cannot prevent alone.
CREATE UNIQUE INDEX "Proposal_strategy_active_uniq"
  ON "Proposal"("strategyId")
  WHERE status IN ('pending', 'approved');
