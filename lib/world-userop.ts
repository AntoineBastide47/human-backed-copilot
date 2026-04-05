import { parseAbiItem } from 'viem';
import { getPublicClient } from '@/services/wallet';

const WORLD_ENTRYPOINT_ADDRESS = '0x0000000071727De22E5E9d8BAf0edAc6f37da032' as const;
const USER_OPERATION_EVENT = parseAbiItem(
  'event UserOperationEvent(bytes32 indexed userOpHash, address indexed sender, address indexed paymaster, uint256 nonce, bool success, uint256 actualGasCost, uint256 actualGasUsed)',
);
const USER_OP_LOOKBACK_BLOCKS = BigInt(2_000);

export interface UserOperationResolution {
  status: 'pending' | 'confirmed' | 'failed';
  transactionHash: string | null;
  sender: string | null;
}

function isUserOpHash(value: string): value is `0x${string}` {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

export async function resolveUserOperation(userOpHash: string): Promise<UserOperationResolution> {
  if (!isUserOpHash(userOpHash)) {
    throw new Error('Invalid userOpHash');
  }

  const publicClient = getPublicClient();
  const latestBlock = await publicClient.getBlockNumber();
  const fromBlock =
    latestBlock > USER_OP_LOOKBACK_BLOCKS
      ? latestBlock - USER_OP_LOOKBACK_BLOCKS
      : BigInt(0);

  const logs = await publicClient.getLogs({
    address: WORLD_ENTRYPOINT_ADDRESS,
    event: USER_OPERATION_EVENT,
    args: { userOpHash },
    fromBlock,
    toBlock: latestBlock,
  });

  const match = logs[logs.length - 1];
  if (!match) {
    return {
      status: 'pending',
      transactionHash: null,
      sender: null,
    };
  }

  return {
    status: match.args.success ? 'confirmed' : 'failed',
    transactionHash: match.transactionHash,
    sender: match.args.sender ?? null,
  };
}

export { USER_OP_LOOKBACK_BLOCKS, WORLD_ENTRYPOINT_ADDRESS };
