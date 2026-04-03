import {
  createAgentBookVerifier,
  createAgentkitHooks,
  declareAgentkitExtension,
  InMemoryAgentKitStorage,
  agentkitResourceServerExtension,
  parseAgentkitHeader,
  validateAgentkitMessage,
  verifyAgentkitSignature,
} from '@worldcoin/agentkit';

export const WORLD_CHAIN = 'eip155:480';
export const WORLD_USDC = '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1';

const FREE_TRIAL_USES = 3;

function getRpcUrl(): string | undefined {
  return process.env.WORLD_CHAIN_RPC;
}

const agentBook = createAgentBookVerifier({ rpcUrl: getRpcUrl() });
const storage = new InMemoryAgentKitStorage();

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
  mode: { type: 'free-trial', uses: FREE_TRIAL_USES },
});

export { agentkitResourceServerExtension };
export const agentkitRequestHook = hooks.requestHook;
export const agentkitVerifyFailureHook = hooks.verifyFailureHook;

export async function registerAgent(
  walletAddress: string,
): Promise<{ registered: boolean }> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(walletAddress)) {
    throw new Error(`Invalid wallet address: ${walletAddress}`);
  }
  const humanId = await agentBook.lookupHuman(walletAddress, WORLD_CHAIN);
  return { registered: humanId !== null };
}

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

export type AgentkitVerifyResult =
  | { granted: true }
  | { granted: false; status: number; body: Record<string, unknown> };

export async function verifyAgentkitRequest(
  request: Request,
): Promise<AgentkitVerifyResult> {
  const headerValue =
    request.headers.get('agentkit') ?? request.headers.get('Agentkit');

  if (!headerValue) {
    return {
      granted: false,
      status: 402,
      body: {
        error: 'Payment Required',
        message:
          'This endpoint requires an AgentKit credential. Register your agent at AgentBook.',
        extensions: { agentkit: agentkitExtensionDeclaration },
      },
    };
  }

  try {
    const payload = parseAgentkitHeader(headerValue);
    const url = new URL(request.url);
    const resourceUri = `${url.origin}${url.pathname}`;

    const validation = await validateAgentkitMessage(payload, resourceUri);
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

    const humanId = await agentBook.lookupHuman(
      sigResult.address!,
      WORLD_CHAIN,
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
