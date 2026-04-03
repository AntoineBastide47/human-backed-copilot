// P1 owns this file — P0 imports from here
// TODO: All business logic for agents, proposals, executions
import type {
  AgentStrategy,
  Proposal,
  Execution,
  CreateProposalInput,
  SaveExecutionInput,
} from '@/types';

export async function getAgentStrategies(agentId: string): Promise<AgentStrategy[]> {
  throw new Error('Not implemented — P1 task H3.5-7');
}

export async function createProposal(data: CreateProposalInput): Promise<Proposal> {
  throw new Error('Not implemented — P1 task H3.5-7');
}

export async function getApprovedProposals(agentId: string): Promise<Proposal[]> {
  throw new Error('Not implemented — P1 task H7.5-12');
}

export async function markProposalExecuted(
  proposalId: string,
  data: SaveExecutionInput
): Promise<void> {
  throw new Error('Not implemented — P1 task H7.5-12');
}

export async function saveExecution(data: SaveExecutionInput): Promise<Execution> {
  throw new Error('Not implemented — P1 task H7.5-12');
}
