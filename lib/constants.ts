// World Chain
export const WORLD_CHAIN_ID = 480;
export const WORLD_CHAIN_CAIP2 = 'eip155:480';
export const WORLD_USDC = '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1';

// AgentBook (World Chain mainnet)
export const AGENT_BOOK_ADDRESS = '0xA23aB2712eA7BBa896930544C7d6636a96b944dA' as const;

// Uniswap
export const UNISWAP_API_BASE = 'https://trade-api.gateway.uniswap.org';
export const UNISWAP_ROUTER_VERSION = '2.0';

// World ID (our app)
export const WORLD_ID_ACTION = 'register-agent';

// AgentBook registration (World ID app & action used by AgentBook contract)
export const AGENTBOOK_APP_ID = 'app_a7c3e2b6b83927251a0db5345bd7146a';
export const AGENTBOOK_ACTION = 'agentbook-registration';
export const AGENTBOOK_RELAY_URL = 'https://x402-worldchain.vercel.app';

// ENS
export const ENS_PARENT_NAME = 'provix.eth';

// Token display map
export const TOKEN_MAP: Record<string, { symbol: string; color: string }> = {
  '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1': { symbol: 'USDC', color: '#16a34a' },
  '0x4200000000000000000000000000000000000006': { symbol: 'WETH', color: '#3b82f6' },
};

// Block explorer
export const txExplorerUrl = (hash: string) => `https://worldscan.org/tx/${hash}`;
