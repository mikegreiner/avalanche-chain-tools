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

// Static vAMM/sAMM pool data from GAUGE_MANAGER enumeration
// Generated: 2026-01-25 - 75 vAMM + 9 sAMM = 84 pools
// To regenerate: python scripts/enumerate_vamm_samm_pools.py
import { VAMM_SAMM_POOLS } from './vamm-samm-data.js';

// Legacy constant for backward compatibility
const KNOWN_VAMM_SAMM_POOLS = VAMM_SAMM_POOLS || [];

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
    this.poolsLoaded = false;
  }

  /**
   * Load known vAMM/sAMM pools from static data
   * @returns {Array} - Array of pool metadata objects
   */
  async loadKnownPools() {
    if (this.poolsLoaded) {
      return Array.from(this.knownPools.values());
    }
    
    // Load from static data
    for (const pool of KNOWN_VAMM_SAMM_POOLS) {
      const t0 = pool.token0 || {};
      const t1 = pool.token1 || {};
      const name = `${pool.type}-${t0.symbol || '?'}/${t1.symbol || '?'}`;
      
      this.knownPools.set(pool.id.toLowerCase(), {
        id: pool.id,
        type: pool.type,
        name: name,
        token0: t0,
        token1: t1,
        gauge: pool.gauge
      });
    }
    
    this.poolsLoaded = true;
    console.log(`[VammSammProvider] Loaded ${this.knownPools.size} vAMM/sAMM pools from static data`);
    return Array.from(this.knownPools.values());
  }
  
  /**
   * Get pool addresses from static data
   * @returns {Array<string>} - Array of pool addresses
   */
  getPoolAddresses() {
    return KNOWN_VAMM_SAMM_POOLS.map(p => p.id.toLowerCase());
  }
  
  /**
   * Get pool metadata by address
   * @param {string} address - Pool address
   * @returns {Object|null} - Pool metadata or null
   */
  getPoolMetadata(address) {
    return this.knownPools.get(address.toLowerCase()) || null;
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
   * Returns pools with data from static file + RPC weights
   * @param {Array<string>} addresses - Optional addresses to filter (if empty, uses all known pools)
   * @returns {Promise<Array<Pool>>} - Array of Pool objects
   */
  async getPools(addresses = null) {
    // Load known pools from static data
    await this.loadKnownPools();
    
    // Determine which addresses to use
    const poolAddresses = addresses && addresses.length > 0 
      ? addresses 
      : this.getPoolAddresses();
    
    if (poolAddresses.length === 0) {
      return [];
    }

    console.log(`[VammSammProvider] Fetching weights for ${poolAddresses.length} vAMM/sAMM pools`);

    // Get weights from Voter contract
    const weightsMap = await this.getPoolWeights(poolAddresses);
    const pools = [];

    for (const addr of poolAddresses) {
      const addrLower = addr.toLowerCase();
      const weightBigInt = weightsMap.get(addrLower) || 0n;
      const currentVotes = Number(weightBigInt) / 1e18;

      // Get pool metadata from static data
      const poolInfo = this.knownPools.get(addrLower);
      const poolType = poolInfo?.type || 'vAMM';
      const t0 = poolInfo?.token0 || {};
      const t1 = poolInfo?.token1 || {};
      const name = poolInfo?.name || `${poolType}-${t0.symbol || '?'}/${t1.symbol || '?'}`;

      // Create pool with data
      // Note: Rewards/VAPR will be calculated via RPC fees fetching (similar to CL pools)
      pools.push(new Pool({
        name: name,
        pool_id: addr,
        pool_type: poolType,
        fee_percentage: null, // vAMM/sAMM don't have standard fee tiers
        total_rewards: 0, // Will be filled from RPC fee calculation
        vapr: 0, // Will be calculated from fees/votes
        current_votes: currentVotes,
        token0: t0,
        token1: t1,
        gauge: poolInfo?.gauge
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
