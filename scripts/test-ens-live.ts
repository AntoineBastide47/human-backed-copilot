/**
 * Live end-to-end ENS registration test.
 * Registers a test agent subname under provix.eth and verifies it resolves.
 *
 * Usage: npx tsx scripts/test-ens-live.ts
 */
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

import { getAddress } from 'viem';
import { registerAgentENS, resolveAgentName, lookupAgent } from '../lib/ens';

// Test wallet — deterministic slug: agent-dead00
const TEST_WALLET = getAddress('0xdead00abcdef1234567890abcdef1234567890ab');

async function main(): Promise<void> {
  console.log('=== Live ENS registration test ===\n');
  console.log(`Test wallet : ${TEST_WALLET}`);
  console.log(`Expected slug: agent-dead00.provix.eth\n`);

  // ── Step 1: Register ───────────────────────────────────────────────────────
  console.log('Step 1: Registering ENS subname...');
  let ensName: string;
  try {
    ensName = await registerAgentENS(TEST_WALLET, {
      strategy: 'dca',
      worldIdVerified: true,
      owner: '0x29726Aa08d560d3d2cA8e6b5e376dC403899b63e',
    });
    console.log(`  PASS  Registered: ${ensName}`);
  } catch (err) {
    console.error(`  FAIL  Registration failed:`, err);
    process.exit(1);
  }

  // ── Step 2: Forward resolve (ENS name → records) ───────────────────────────
  console.log('\nStep 2: Looking up records for', ensName);
  try {
    const record = await lookupAgent(ensName);
    console.log(`  address        : ${record.address}`);
    console.log(`  strategy       : ${record.strategy}`);
    console.log(`  worldIdVerified: ${record.worldIdVerified}`);

    if (record.address?.toLowerCase() === TEST_WALLET.toLowerCase()) {
      console.log('  PASS  Address matches test wallet');
    } else {
      console.warn(`  WARN  Address mismatch — got ${record.address}, expected ${TEST_WALLET}`);
    }
    if (record.strategy === 'dca') {
      console.log('  PASS  Strategy record correct');
    } else {
      console.warn(`  WARN  Strategy mismatch — got ${record.strategy}`);
    }
    if (record.worldIdVerified) {
      console.log('  PASS  worldIdVerified=true');
    } else {
      console.warn('  WARN  worldIdVerified=false (may take a moment to propagate)');
    }
  } catch (err) {
    console.warn('  WARN  lookupAgent failed (may not have propagated yet):', err);
  }

  // ── Step 3: Reverse resolve (address → name) ──────────────────────────────
  console.log('\nStep 3: Reverse resolving', TEST_WALLET);
  try {
    const name = await resolveAgentName(TEST_WALLET);
    if (name) {
      console.log(`  PASS  Reverse resolved: ${name}`);
    } else {
      console.log('  INFO  No primary name set yet (offchain reverse resolve may need manual setup)');
    }
  } catch (err) {
    console.warn('  WARN  resolveAgentName failed:', err);
  }

  console.log('\n=== Done ===');
  console.log(`\nCheck on-chain: https://basescan.org/address/0x8d8aC5e97aD0984975d50D1ce9218A09C43C134e`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
