import { ENS_PARENT_NAME } from './constants';

const DEFAULT_AGENT_LABEL = 'agent-xxxxxx';

export function deriveDefaultAgentEnsLabel(walletAddress: string): string {
  if (!/^0x[0-9a-fA-F]{40}$/.test(walletAddress)) {
    return DEFAULT_AGENT_LABEL;
  }

  return `agent-${walletAddress.slice(2, 8).toLowerCase()}`;
}

export function normalizeAgentEnsLabel(
  requestedLabel: string | null | undefined,
  walletAddress: string,
): string {
  const suffix = `.${ENS_PARENT_NAME}`;
  const trimmed = (requestedLabel ?? '').trim().toLowerCase();
  const withoutSuffix = trimmed.endsWith(suffix)
    ? trimmed.slice(0, -suffix.length)
    : trimmed;
  const normalized = withoutSuffix
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || deriveDefaultAgentEnsLabel(walletAddress);
}

export function toAgentEnsName(label: string): string {
  return `${label}.${ENS_PARENT_NAME}`;
}
