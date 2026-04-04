import {
  createAgentBookVerifier,
  createAgentkitHooks,
  declareAgentkitExtension,
  type AgentKitStorage,
  InMemoryAgentKitStorage,
  agentkitResourceServerExtension,
  parseAgentkitHeader,
  validateAgentkitMessage,
  verifyAgentkitSignature,
} from '@worldcoin/agentkit';
import { randomUUID } from 'crypto';
import { decodeAbiParameters } from 'viem';
import { getPublicClient, getWalletClient } from './wallet';
import { AGENT_BOOK_ADDRESS } from '@/lib/constants';
import type { WorldIdOnChainProof } from '@/types';

export const WORLD_CHAIN = 'eip155:480';
export const WORLD_USDC = '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1';

const FREE_TRIAL_USES = 3;
const AGENTKIT_CHALLENGE_TTL_SECONDS = 5 * 60;
const AGENTKIT_STATEMENT = 'Verify your agent is backed by a real human';

function getRpcUrl(): string | undefined {
  return process.env.WORLD_CHAIN_RPC;
}

class PrismaAgentKitStorage implements AgentKitStorage {
  private async getDb() {
    const { db } = await import('@/lib/db');
    return db;
  }

  async tryIncrementUsage(
    endpoint: string,
    humanId: string,
    limit: number,
  ): Promise<boolean> {
    const db = await this.getDb();
    const rows = await db.$queryRaw<{ usageCount: number }[]>`
      INSERT INTO "AgentKitUsage" ("id", "endpoint", "humanId", "usageCount", "createdAt", "updatedAt")
      VALUES (${randomUUID()}, ${endpoint}, ${humanId}, 1, NOW(), NOW())
      ON CONFLICT ("endpoint", "humanId") DO UPDATE
      SET
        "usageCount" = "AgentKitUsage"."usageCount" + 1,
        "updatedAt" = NOW()
      WHERE "AgentKitUsage"."usageCount" < ${limit}
      RETURNING "usageCount"
    `;

    return rows.length > 0;
  }

  async hasUsedNonce(nonce: string): Promise<boolean> {
    const db = await this.getDb();
    const record = await db.agentKitNonce.findUnique({ where: { nonce } });
    return record !== null;
  }

  async recordNonce(nonce: string): Promise<void> {
    const db = await this.getDb();
    await db.agentKitNonce.upsert({
      where: { nonce },
      update: {},
      create: { nonce },
    });
  }
}

function createStorage(): AgentKitStorage {
  if (process.env.NODE_ENV === 'test' || !process.env.DATABASE_URL) {
    return new InMemoryAgentKitStorage();
  }

  return new PrismaAgentKitStorage();
}

const storage = createStorage();

async function buildAgentkitChallenge(request: Request) {
  const enrichPaymentRequiredResponse =
    agentkitResourceServerExtension.enrichPaymentRequiredResponse;

  if (!enrichPaymentRequiredResponse) {
    throw new Error('AgentKit challenge enrichment is unavailable');
  }

  return enrichPaymentRequiredResponse(
    agentkitExtensionDeclaration.agentkit as never,
    {
      resourceInfo: { url: request.url },
      requirements: [{ network: WORLD_CHAIN }],
    } as never,
  );
}

// ── AgentBook contract ABI ──────────────────────────────────────────────

const AGENT_BOOK_ABI = [
  {
    inputs: [{ internalType: 'address', name: '', type: 'address' }],
    name: 'lookupHuman',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: '', type: 'address' }],
    name: 'getNextNonce',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'agent', type: 'address' },
      { internalType: 'uint256', name: 'root', type: 'uint256' },
      { internalType: 'uint256', name: 'nonce', type: 'uint256' },
      { internalType: 'uint256', name: 'nullifierHash', type: 'uint256' },
      { internalType: 'uint256[8]', name: 'proof', type: 'uint256[8]' },
    ],
    name: 'register',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

// ── AgentKit SDK (read-only verifier + hooks) ───────────────────────────

const agentBook = createAgentBookVerifier({ rpcUrl: getRpcUrl() });

const hooks = createAgentkitHooks({
  agentBook,
  storage,
  mode: { type: 'free-trial', uses: FREE_TRIAL_USES },
  rpcUrl: getRpcUrl(),
  onEvent: (event) => {
    console.log(
      '[agentkit]',
      event.type,
      'resource' in event ? event.resource : '',
      'address' in event ? event.address : '',
    );
  },
});

export const agentkitExtensionDeclaration = declareAgentkitExtension({
  network: WORLD_CHAIN,
  statement: AGENTKIT_STATEMENT,
  expirationSeconds: AGENTKIT_CHALLENGE_TTL_SECONDS,
  mode: { type: 'free-trial', uses: FREE_TRIAL_USES },
});

export { agentkitResourceServerExtension };
export const agentkitRequestHook = hooks.requestHook;
export const agentkitVerifyFailureHook = hooks.verifyFailureHook;

// ── On-chain registration ───────────────────────────────────────────────

/**
 * Get the next nonce required by AgentBook for a given agent address.
 */
export async function getAgentBookNonce(
  agentAddress: `0x${string}`,
): Promise<bigint> {
  const client = getPublicClient();
  return client.readContract({
    address: AGENT_BOOK_ADDRESS,
    abi: AGENT_BOOK_ABI,
    functionName: 'getNextNonce',
    args: [agentAddress],
  });
}

/**
 * Decode an ABI-encoded proof string into a fixed-length uint256[8] tuple.
 */
function decodeProof(proofHex: string): readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint] {
  const [decoded] = decodeAbiParameters(
    [{ type: 'uint256[8]' }],
    proofHex as `0x${string}`,
  );
  return decoded as readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint];
}

/**
 * Register an agent on-chain in the AgentBook contract.
 * Submits a transaction using the backend service wallet.
 */
export async function registerAgent(
  walletAddress: string,
  worldIdProof: WorldIdOnChainProof,
): Promise<{ registered: boolean; txHash: string }> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(walletAddress)) {
    throw new Error(`Invalid wallet address: ${walletAddress}`);
  }

  const agentAddress = walletAddress as `0x${string}`;
  const nonce = await getAgentBookNonce(agentAddress);
  const proofArray = decodeProof(worldIdProof.proof);

  const wallet = getWalletClient();
  const publicClient = getPublicClient();

  const txHash = await wallet.writeContract({
    address: AGENT_BOOK_ADDRESS,
    abi: AGENT_BOOK_ABI,
    functionName: 'register',
    args: [
      agentAddress,
      BigInt(worldIdProof.merkle_root),
      nonce,
      BigInt(worldIdProof.nullifier_hash),
      proofArray,
    ],
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== 'success') {
    throw new Error(`AgentBook register tx reverted: ${txHash}`);
  }

  return { registered: true, txHash };
}

/**
 * Check whether an agent wallet is already registered in AgentBook.
 */
export async function verifyAgentIsHuman(
  walletAddress: string,
): Promise<boolean> {
  try {
    const humanId = await agentBook.lookupHuman(walletAddress, WORLD_CHAIN);
    return humanId !== null;
  } catch {
    return false;
  }
}

// ── AgentKit request verification (X402) ────────────────────────────────

export type AgentkitVerifyResult =
  | { granted: true }
  | { granted: false; status: number; body: Record<string, unknown> };

export async function verifyAgentkitRequest(
  request: Request,
): Promise<AgentkitVerifyResult> {
  const headerValue =
    request.headers.get('agentkit') ?? request.headers.get('Agentkit');

  if (!headerValue) {
    const challenge = await buildAgentkitChallenge(request);
    return {
      granted: false,
      status: 402,
      body: {
        error: 'Payment Required',
        message:
          'This endpoint requires an AgentKit credential. Register your agent at AgentBook.',
        extensions: { agentkit: challenge },
      },
    };
  }

  try {
    const payload = parseAgentkitHeader(headerValue);
    const url = new URL(request.url);
    const resourceUri = `${url.origin}${url.pathname}`;
    const hasUsedNonce = storage.hasUsedNonce?.bind(storage);
    const checkNonce = hasUsedNonce
      ? async (nonce: string) => !(await hasUsedNonce(nonce))
      : undefined;

    const validation = await validateAgentkitMessage(payload, resourceUri, {
      checkNonce,
    });
    if (!validation.valid) {
      return {
        granted: false,
        status: 403,
        body: { error: 'Invalid agentkit message', reason: validation.error },
      };
    }

    const sigResult = await verifyAgentkitSignature(
      payload,
      getRpcUrl(),
    );
    if (!sigResult.valid) {
      return {
        granted: false,
        status: 403,
        body: { error: 'Invalid agentkit signature', reason: sigResult.error },
      };
    }

    if (!sigResult.address) {
      return {
        granted: false,
        status: 403,
        body: { error: 'Invalid agentkit signature', reason: 'Missing signer address' },
      };
    }

    if (storage.recordNonce) {
      await storage.recordNonce(payload.nonce);
    }

    const humanId = await agentBook.lookupHuman(
      sigResult.address,
      payload.chainId,
    );
    if (!humanId) {
      return {
        granted: false,
        status: 403,
        body: {
          error: 'Agent not registered in AgentBook',
          address: sigResult.address,
        },
      };
    }

    const canUse = await storage.tryIncrementUsage(
      url.pathname,
      humanId,
      FREE_TRIAL_USES,
    );
    if (!canUse) {
      return {
        granted: false,
        status: 402,
        body: { error: 'Free trial exhausted', humanId },
      };
    }

    return { granted: true };
  } catch (err) {
    return {
      granted: false,
      status: 403,
      body: {
        error: 'Agentkit verification failed',
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}
