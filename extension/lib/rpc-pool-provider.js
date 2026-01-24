/**
 * RPC-based Pool Data Provider
 * Gets pool data directly from blockchain via RPC calls
 * Fast and reliable - no DOM dependency for basic data
 */

import { RpcClient } from './rpc-client.js';
import Pool from './pool.js';

const VOTER_ADDRESS = '0xe30d0c8532721551a51a9fec7fb233759964d9e3';
const RPC_URL = 'https://api.avax.network/ext/bc/C/rpc';

const SELECTORS = {
  weights: '0xa7cac846',
  token0: '0x0dfe1681',
  token1: '0xd21220a7',
  fee: '0xddca3f43',
  liquidity: '0x1a686502',
  totalSupply: '0x18160ddd',
};

// Helper to decode hex to BigInt
function hexToBigInt(hex) {
  if (!hex || hex === '0x') return 0n;
  return BigInt(hex);
}

// Helper to get address from hex
function hexToAddress(hex) {
  if (!hex || hex === '0x') return null;
  return '0x' + hex.slice(-40).toLowerCase();
}

export class RpcPoolProvider {
  constructor() {
    this.rpc = new RpcClient(RPC_URL);
    this.poolCache = new Map(); // address -> pool data
  }

  /**
   * Get pool weight (current_votes) from voter contract
   */
  async getPoolWeight(poolAddress) {
    try {
      const cleanAddr = poolAddress.replace('0x', '').toLowerCase().padStart(64, '0');
      const data = SELECTORS.weights + cleanAddr;
      const result = await this.rpc.ethCall(VOTER_ADDRESS, data);
      return Number(hexToBigInt(result)) / 1e18;
    } catch (e) {
      console.warn(`Failed to get weight for ${poolAddress}:`, e);
      return 0;
    }
  }

  /**
   * Get pool metadata (tokens, fee, liquidity) from pool contract
   */
  async getPoolMetadata(poolAddress) {
    const metadata = {
      token0: null,
      token1: null,
      fee: null,
      liquidity: null,
      totalSupply: null,
    };

    try {
      // Get token0
      const token0Result = await this.rpc.ethCall(poolAddress, SELECTORS.token0);
      metadata.token0 = hexToAddress(token0Result);

      // Get token1
      const token1Result = await this.rpc.ethCall(poolAddress, SELECTORS.token1);
      metadata.token1 = hexToAddress(token1Result);

      // Get fee (for CL pools)
      try {
        const feeResult = await this.rpc.ethCall(poolAddress, SELECTORS.fee);
        const fee = Number(hexToBigInt(feeResult));
        if (fee > 0 && fee < 100000) {
          metadata.fee = fee;
        }
      } catch (e) {
        // Fee not available (vAMM/sAMM pools)
      }

      // Get liquidity or totalSupply
      try {
        const liqResult = await this.rpc.ethCall(poolAddress, SELECTORS.liquidity);
        const liquidity = Number(hexToBigInt(liqResult)) / 1e18;
        if (liquidity > 0) {
          metadata.liquidity = liquidity;
        }
      } catch (e) {
        // Try totalSupply instead
        try {
          const supplyResult = await this.rpc.ethCall(poolAddress, SELECTORS.totalSupply);
          const supply = Number(hexToBigInt(supplyResult)) / 1e18;
          if (supply > 0) {
            metadata.totalSupply = supply;
          }
        } catch (e2) {
          // Neither available
        }
      }
    } catch (e) {
      console.warn(`Failed to get metadata for ${poolAddress}:`, e);
    }

    return metadata;
  }

  /**
   * Get complete pool data via RPC
   * Returns Pool object with all available RPC data
   */
  async getPoolData(poolAddress, poolType = null) {
    // Check cache
    if (this.poolCache.has(poolAddress.toLowerCase())) {
      return this.poolCache.get(poolAddress.toLowerCase());
    }

    // Get weight and metadata in parallel
    const [weight, metadata] = await Promise.all([
      this.getPoolWeight(poolAddress),
      this.getPoolMetadata(poolAddress),
    ]);

    // Determine pool type if not provided
    if (!poolType) {
      if (metadata.fee) {
        // CL pool
        if (metadata.fee === 100) poolType = 'CL1';
        else if (metadata.fee === 500) poolType = 'CL200';
        else poolType = 'CL200';
      } else {
        // vAMM or sAMM (can't distinguish without more data)
        poolType = 'vAMM'; // Default
      }
    }

    // Create pool name from tokens (if available)
    let name = `Pool ${poolAddress.slice(0, 8)}`;
    if (metadata.token0 && metadata.token1) {
      // We'd need token symbols, but for now use addresses
      name = `${poolType || 'Pool'}-${metadata.token0.slice(0, 6)}/${metadata.token1.slice(0, 6)}`;
    }

    // Determine fee percentage
    let feePercentage = null;
    if (metadata.fee) {
      if (metadata.fee === 100) feePercentage = '0.01%';
      else if (metadata.fee === 500) feePercentage = '0.05%';
      else feePercentage = `${metadata.fee / 10000}%`;
    }

    const pool = new Pool({
      name: name,
      pool_id: poolAddress,
      pool_type: poolType,
      fee_percentage: feePercentage,
      total_rewards: 0, // Not available via RPC yet
      vapr: 0, // Not available via RPC yet
      current_votes: weight,
    });

    // Cache result
    this.poolCache.set(poolAddress.toLowerCase(), pool);

    return pool;
  }

  /**
   * Get pool data for multiple pools (batched)
   */
  async getPoolsData(poolAddresses, poolTypes = {}) {
    const pools = [];

    // Process in batches to avoid overwhelming RPC
    const batchSize = 10;
    for (let i = 0; i < poolAddresses.length; i += batchSize) {
      const batch = poolAddresses.slice(i, i + batchSize);
      const batchPromises = batch.map(addr =>
        this.getPoolData(addr, poolTypes[addr.toLowerCase()])
      );
      const batchResults = await Promise.all(batchPromises);
      pools.push(...batchResults);
    }

    return pools;
  }

  /**
   * Load pools from discovered pool list
   * Can load from static JSON or fetch dynamically
   */
  async loadDiscoveredPools() {
    // Option 1: Load from static file (if bundled)
    // Option 2: Use discovered addresses from previous analysis
    // Option 3: Fetch dynamically (future)

    // For now, return empty - will be populated by caller
    // In production, could load from vamm_samm_pools.json or similar
    return [];
  }
}
