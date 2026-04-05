// P1 owns this file — ENS subname registration + resolution
// Write: JustaName SDK (offchain, zero gas) — primary path
//        On-chain via ProvixRegistrar on Base — when L2_REGISTRAR_ADDRESS is set
// Read:  JustaName SDK
import { createWalletClient, createPublicClient, http, parseAbi } from 'viem'
import { base } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import { JustaName } from '@justaname.id/sdk'
import { ENS_PARENT_NAME } from './constants'
import { normalizeAgentEnsLabel, toAgentEnsName } from './ens-name'

const MAINNET_CHAIN_ID = 1
const BASE_RPC_URL = process.env.BASE_RPC ?? 'https://mainnet.base.org'

type AgentEnsMeta = {
  strategy: string
  worldIdVerified: boolean
  owner: string
}

// ── JustaName client (offchain reads + fallback writes) ───────────────────────
let _client: ReturnType<typeof JustaName.init> | null = null

function getClient() {
  if (_client) return _client
  _client = JustaName.init({
    networks: [{ chainId: MAINNET_CHAIN_ID, providerUrl: process.env.MAINNET_RPC! }],
    ensDomains: [{
      chainId: MAINNET_CHAIN_ID,
      ensDomain: ENS_PARENT_NAME,
      apiKey: process.env.JUSTANAME_API_KEY!,
    }],
    config: {
      domain: 'provix.eth',
      origin: 'https://provix.eth.limo',
    },
  })
  return _client
}

function hasOnChainRegistrarConfig(): boolean {
  return Boolean(process.env.L2_REGISTRAR_ADDRESS && process.env.SERVER_WALLET_PRIVATE_KEY)
}

function hasOffchainRegistrarConfig(): boolean {
  return Boolean(process.env.JUSTANAME_API_KEY)
}

function getBasePublicClient() {
  return createPublicClient({
    chain: base,
    transport: http(BASE_RPC_URL),
  })
}

// ── Offchain write via JustaName (primary — zero gas) ─────────────────────────
async function registerOffchain(
  username: string,
  agentAddress: string,
  meta: AgentEnsMeta,
): Promise<void> {
  await getClient().subnames.addSubname({
    username,
    chainId: MAINNET_CHAIN_ID,
    overrideSignatureCheck: true,
    text: [
      { key: 'strategy', value: meta.strategy },
      { key: 'worldid',  value: meta.worldIdVerified ? 'verified:orb' : 'unverified' },
      { key: 'owner',    value: meta.owner },
    ],
    addresses: [{ coinType: '60', address: agentAddress }],
  })
}

// ── On-chain write via ProvixRegistrar on Base (when env vars are set) ─────────
const REGISTRAR_ABI = parseAbi([
  'function register(string calldata label, address agentAddress, bool worldIdVerified, string calldata ownerAddress) external',
  'function available(string calldata label) external view returns (bool)',
])

async function registerOnChain(
  label: string,
  agentAddress: string,
  meta: AgentEnsMeta,
): Promise<void> {
  const pk = process.env.SERVER_WALLET_PRIVATE_KEY as `0x${string}`
  const registrarAddress = process.env.L2_REGISTRAR_ADDRESS as `0x${string}`

  const account = privateKeyToAccount(pk)
  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http(BASE_RPC_URL),
  })
  const publicClient = getBasePublicClient()

  const hash = await walletClient.writeContract({
    address: registrarAddress,
    abi: REGISTRAR_ABI,
    functionName: 'register',
    args: [label, agentAddress as `0x${string}`, meta.worldIdVerified, meta.owner],
  })

  await publicClient.waitForTransactionReceipt({ hash })
}

async function isLabelAvailableOffchain(label: string): Promise<boolean> {
  const result = await getClient().subnames.isSubnameAvailable({
    subname: toAgentEnsName(label),
    chainId: MAINNET_CHAIN_ID,
  })

  return result.isAvailable
}

async function isLabelAvailableOnChain(label: string): Promise<boolean> {
  const publicClient = getBasePublicClient()
  const registrarAddress = process.env.L2_REGISTRAR_ADDRESS as `0x${string}`

  return publicClient.readContract({
    address: registrarAddress,
    abi: REGISTRAR_ABI,
    functionName: 'available',
    args: [label],
  })
}

export function isAgentEnsRegistrationConfigured(): boolean {
  return hasOnChainRegistrarConfig() || hasOffchainRegistrarConfig()
}

export async function isAgentEnsAvailable(
  agentAddress: string,
  requestedLabel?: string,
): Promise<{ available: boolean; ensName: string; label: string }> {
  const label = normalizeAgentEnsLabel(requestedLabel, agentAddress)
  const ensName = toAgentEnsName(label)

  if (hasOnChainRegistrarConfig()) {
    return {
      available: await isLabelAvailableOnChain(label),
      ensName,
      label,
    }
  }

  if (hasOffchainRegistrarConfig()) {
    return {
      available: await isLabelAvailableOffchain(label),
      ensName,
      label,
    }
  }

  throw new Error('ENS registration is not configured')
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Register an ENS subname for an agent under provix.eth.
 * Uses JustaName offchain (zero gas) by default.
 * Falls through to on-chain ProvixRegistrar on Base when
 * L2_REGISTRAR_ADDRESS + SERVER_WALLET_PRIVATE_KEY are set.
 *
 * @returns Full ENS name e.g. "agent-742d35.provix.eth"
 */
export async function registerAgentENS(
  agentAddress: string,
  meta: AgentEnsMeta,
  requestedLabel?: string,
): Promise<string> {
  const label = normalizeAgentEnsLabel(requestedLabel, agentAddress)

  if (hasOnChainRegistrarConfig()) {
    await registerOnChain(label, agentAddress, meta)
  } else if (hasOffchainRegistrarConfig()) {
    await registerOffchain(label, agentAddress, meta)
  } else {
    throw new Error('ENS registration is not configured')
  }

  return toAgentEnsName(label)
}

/**
 * Reverse resolve: wallet address → primary ENS name.
 * Returns null if no name is set or on error.
 */
export async function resolveAgentName(address: string): Promise<string | null> {
  try {
    const result = await getClient().subnames.getPrimaryNameByAddress({
      address,
      chainId: MAINNET_CHAIN_ID,
    })
    return (result as { name?: string })?.name ?? null
  } catch {
    return null
  }
}

/**
 * Forward resolve: ENS name → address + metadata text records.
 */
export async function lookupAgent(ensName: string): Promise<{
  address: string | null
  strategy: string | null
  worldIdVerified: boolean
}> {
  const result = await getClient().subnames.getRecords({
    ens: ensName,
    chainId: MAINNET_CHAIN_ID,
  })

  const texts: Array<{ key: string; value: string }> =
    (result as { records?: { texts?: Array<{ key: string; value: string }> } })
      ?.records?.texts ?? []
  const coins: Array<{ coinType?: number; id?: number; value?: string }> =
    (result as { records?: { coins?: Array<{ coinType?: number; id?: number; value?: string }> } })
      ?.records?.coins ?? []

  return {
    address: coins.find((c) => (c.coinType ?? c.id) === 60)?.value ?? null,
    strategy: texts.find((t) => t.key === 'strategy')?.value ?? null,
    worldIdVerified: texts.find((t) => t.key === 'worldid')?.value === 'verified:orb',
  }
}
