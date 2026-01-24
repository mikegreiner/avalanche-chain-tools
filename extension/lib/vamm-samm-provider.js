/**
 * vAMM/sAMM Pool Data Provider
 * Provides pool addresses discovered via RPC analysis
 * Rewards/VAPR are extracted from DOM via pool-extractor.js
 */

import { RpcClient } from './rpc-client.js';
import Pool from './pool.js';

const VOTER_ADDRESS = '0xe30d0c8532721551a51a9fec7fb233759964d9e3';
const RPC_URL = 'https://api.avax.network/ext/bc/C/rpc';

const SELECTORS = {
  weights: '0xa7cac846',
  token0: '0x0dfe1681',
  token1: '0xd21220a7',
  symbol: '0x95d89b41' // ERC20 symbol()
};

// Known pool addresses from discovery
// In production, this could be loaded from vamm_samm_pools.json
// For now, we'll use a subset and let DOM extraction fill in the rest
const KNOWN_VAMM_SAMM_POOLS = [
  // These will be populated from vamm_samm_pools.json or discovered dynamically
];

// Helper to decode hex to BigInt
function hexToBigInt(hex) {
  if (!hex || hex === '0x') return 0n;
  return BigInt(hex);
}

// Helper to get address from hex result
function hexToAddress(hex) {
  if (!hex || hex === '0x') return null;
  // Last 40 chars (20 bytes) = address
  const addr = '0x' + hex.slice(-40).toLowerCase();
  return addr;
}

/**
 * Get token symbol from contract
 */
async function getTokenSymbol(rpc, tokenAddress) {
  try {
    const result = await rpc.ethCall(tokenAddress, SELECTORS.symbol);
    if (!result || result === '0x') return null;
    
    // Decode string from hex (first 32 bytes = offset, next 32 = length, then data)
    // Simplified: just try to extract readable text
    const hex = result.slice(2);
    if (hex.length < 128) return null; // Need at least offset + length
    
    const lengthHex = hex.slice(64, 128);
    const length = parseInt(lengthHex, 16);
    if (length > 32 || length === 0) return null;
    
    const dataHex = hex.slice(128, 128 + (length * 2));
    const symbol = Buffer.from(dataHex, 'hex').toString('utf-8').replace(/\0/g, '').trim();
    
    return symbol || null;
  } catch (e) {
    console.warn(`Failed to get symbol for ${tokenAddress}:`, e);
    return null;
  }
}

/**
 * Get pool metadata (tokens) from contract
 */
async function getPoolMetadata(rpc, poolAddress) {
  try {
    const [token0Hex, token1Hex] = await Promise.all([
      rpc.ethCall(poolAddress, SELECTORS.token0),
      rpc.ethCall(poolAddress, SELECTORS.token1)
    ]);
    
    const token0 = hexToAddress(token0Hex);
    const token1 = hexToAddress(token1Hex);
    
    // Get symbols (optional, can be slow)
    // For now, skip to avoid too many RPC calls
    // Symbols can be extracted from DOM or use a token list
    
    return {
      token0,
      token1,
      token0Symbol: null, // Will be filled from DOM or token list
      token1Symbol: null
    };
  } catch (e) {
    console.warn(`Failed to get metadata for ${poolAddress}:`, e);
    return { token0: null, token1: null, token0Symbol: null, token1Symbol: null };
  }
}

export class VammSammProvider {
  constructor() {
    this.rpc = new RpcClient(RPC_URL);
    this.knownPools = new Map(); // address -> { type, weight, token0, token1 }
  }

  /**
   * Load known vAMM/sAMM pools from discovery data
   * In production, this could load from vamm_samm_pools.json
   */
  async loadKnownPools() {
    // For now, return empty - pools will be discovered via DOM
    // In future, could load from static file or fetch dynamically
    return [];
  }

  /**
   * Get pool weights for vAMM/sAMM pools
   */
  async getPoolWeights(addresses) {
    const weights = new Map();
    const batchSize = 20;

    for (let i = 0; i < addresses.length; i += batchSize) {
      const batch = addresses.slice(i, i + batchSize);
      const promises = batch.map(addr => {
        const cleanAddr = addr.replace('0x', '');
        const data = SELECTORS.weights + cleanAddr.padStart(64, '0');
        return this.rpc.ethCall(VOTER_ADDRESS, data);
      });

      const results = await Promise.all(promises);
      results.forEach((res, idx) => {
        weights.set(batch[idx].toLowerCase(), hexToBigInt(res));
      });
    }
    return weights;
  }

  /**
   * Get vAMM/sAMM pools
   * Returns pools with basic data (address, type, weight)
   * Rewards/VAPR should be filled from DOM extraction
   */
  async getPools(knownAddresses = []) {
    if (knownAddresses.length === 0) {
      // If no addresses provided, return empty
      // Pools will be discovered via DOM extraction
      return [];
    }

    console.log(`Fetching weights for ${knownAddresses.length} vAMM/sAMM pools`);

    // Get weights
    const weightsMap = await this.getPoolWeights(knownAddresses);
    const pools = [];

    for (const addr of knownAddresses) {
      const weightBigInt = weightsMap.get(addr.toLowerCase()) || 0n;
      const currentVotes = Number(weightBigInt) / 1e18;

      // Determine pool type (could be improved with better classification)
      const poolInfo = this.knownPools.get(addr.toLowerCase());
      const poolType = poolInfo?.type || 'vAMM'; // Default to vAMM

      // Create pool with basic data
      // Rewards/VAPR will be filled from DOM extraction
      pools.push(new Pool({
        name: poolInfo?.name || `vAMM/sAMM Pool ${addr.slice(0, 8)}`,
        pool_id: addr,
        pool_type: poolType,
        fee_percentage: null, // vAMM/sAMM may not have standard fees
        total_rewards: 0, // Will be filled from DOM
        vapr: 0, // Will be filled from DOM
        current_votes: currentVotes
      }));
    }

    return pools;
  }

  /**
   * Enrich pools with metadata (tokens, symbols)
   * This is optional and can be slow due to RPC calls
   */
  async enrichPoolsWithMetadata(pools) {
    console.log(`Enriching ${pools.length} pools with metadata...`);
    
    for (const pool of pools) {
      if (!pool.pool_id) continue;
      
      try {
        const metadata = await getPoolMetadata(this.rpc, pool.pool_id);
        if (metadata.token0 && metadata.token1) {
          // Update pool name if we have tokens
          // Symbols will be filled from DOM or token list
          pool.token0 = metadata.token0;
          pool.token1 = metadata.token1;
        }
      } catch (e) {
        console.warn(`Failed to enrich pool ${pool.pool_id}:`, e);
      }
    }
    
    return pools;
  }
}
