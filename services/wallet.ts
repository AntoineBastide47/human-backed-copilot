import {
  createWalletClient,
  createPublicClient,
  http,
  type Chain,
  type WalletClient,
  type PublicClient,
  type Transport,
  type Account,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

export const WORLD_CHAIN_ID = 480;

export const worldChain: Chain = {
  id: WORLD_CHAIN_ID,
  name: 'World Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env.WORLD_CHAIN_RPC || 'https://worldchain-mainnet.g.alchemy.com/public'],
    },
  },
  blockExplorers: {
    default: { name: 'Worldscan', url: 'https://worldscan.org' },
  },
};

function getRpcUrl(): string {
  const url = process.env.WORLD_CHAIN_RPC;
  if (!url) throw new Error('WORLD_CHAIN_RPC is not set');
  return url;
}

function getAccount(): Account {
  const key = process.env.WALLET_PRIVATE_KEY;
  if (!key) throw new Error('WALLET_PRIVATE_KEY is not set');
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error('WALLET_PRIVATE_KEY must be a 0x-prefixed 32-byte hex string');
  }
  return privateKeyToAccount(key as `0x${string}`);
}

let _walletClient: WalletClient<Transport, Chain, Account> | null = null;
let _publicClient: PublicClient | null = null;

export function getWalletClient(): WalletClient<Transport, Chain, Account> {
  if (!_walletClient) {
    _walletClient = createWalletClient({
      account: getAccount(),
      chain: worldChain,
      transport: http(getRpcUrl()),
    });
  }
  return _walletClient;
}

export function getPublicClient(): PublicClient {
  if (!_publicClient) {
    _publicClient = createPublicClient({
      chain: worldChain,
      transport: http(getRpcUrl()),
    });
  }
  return _publicClient;
}

export function getWalletAddress(): `0x${string}` {
  return getWalletClient().account.address;
}
