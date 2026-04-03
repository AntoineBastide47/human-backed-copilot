// World Chain
export const WORLD_CHAIN_ID = 480;
export const WORLD_CHAIN_CAIP2 = 'eip155:480';
export const WORLD_USDC = '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1';

// Uniswap
export const UNISWAP_API_BASE = 'https://trade-api.gateway.uniswap.org';
export const UNISWAP_ROUTER_VERSION = '2.0';

// World ID
export const WORLD_ID_ACTION = 'register-agent';

// ENS
export const ENS_PARENT_NAME = 'copilot.eth';

// Token display map
export const TOKEN_MAP: Record<string, { symbol: string; color: string }> = {
  '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1': { symbol: 'USDC', color: '#16a34a' },
  '0x4200000000000000000000000000000000000006': { symbol: 'WETH', color: '#3b82f6' },
};

// Block explorer
export const txExplorerUrl = (hash: string) => `https://worldscan.org/tx/${hash}`;
