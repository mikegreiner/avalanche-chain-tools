import { RpcClient } from './rpc-client.js';
import Pool from './pool.js';
import { VammSammProvider } from './vamm-samm-provider.js';
import { RpcPoolProvider } from './rpc-pool-provider.js';
import { RpcRewardsProvider } from './rpc-rewards-provider.js';

const VOTER_ADDRESS = '0xe30d0c8532721551a51a9fec7fb233759964d9e3';
const RPC_URL = 'https://api.avax.network/ext/bc/C/rpc';
const API_URL = 'https://resources.blackhole.xyz/cl-pools-list/cl-pools.json';

const SELECTORS = {
  weights: '0xa7cac846',
  totalWeight: '0x96c82e57',
  token0: '0x0dfe1681',
  token1: '0xd21220a7'
};

// Helper to decode hex to BigInt
function hexToBigInt(hex) {
  if (!hex || hex === '0x') return 0n;
  return BigInt(hex);
}

export class PoolDataProvider {
  constructor() {
    this.rpc = new RpcClient(RPC_URL);
    this.apiCache = null;
    this.vammSammProvider = new VammSammProvider();
    this.rpcProvider = new RpcPoolProvider();
    this.rewardsProvider = new RpcRewardsProvider([]); // Will be populated with pool addresses
    this.vammSammAddresses = null; // Will be loaded from discovery or DOM
  }

  async fetchMetadata() {
    if (this.apiCache) return this.apiCache;
    
    try {
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'PROXY_REQUEST',
          url: API_URL,
          options: { method: 'GET' }
        }, result => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve(result);
        });
      });

      if (!response.success) throw new Error(response.error || 'Failed to fetch API metadata');
      const data = response.data;
      
      const poolsData = data.pools || data.data?.pools || (Array.isArray(data) ? data : []);
      const metadata = new Map(); // Address -> Info
      
      for (const p of poolsData) {
        if (p.id && p.token0 && p.token1) {
          const fee = parseInt(p.fee || '0');
          let poolType = 'CL200';
          let feePct = `${fee / 10000}%`;
          if (fee === 100) { poolType = 'CL1'; feePct = '0.01%'; }
          else if (fee === 500) { poolType = 'CL200'; feePct = '0.05%'; }
          
          metadata.set(p.id.toLowerCase(), {
            name: `${p.token0.symbol}/${p.token1.symbol}`,
            feePercentage: feePct,
            poolType: poolType,
            totalRewards: 0 // API only provides lifetime fees, which we don't want
          });
        }
      }
      this.apiCache = metadata;
      return metadata;
    } catch (e) {
      console.warn('Metadata fetch failed:', e);
      return new Map();
    }
  }

  async getPoolWeights(addresses) {
    const weights = new Map(); // Address -> Weight (BigInt)
    const batchSize = 20;

    for (let i = 0; i < addresses.length; i += batchSize) {
      const batch = addresses.slice(i, i + batchSize);
      const promises = batch.map(addr => {
        // Remove 0x prefix for padding
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
   * Load vAMM/sAMM pool addresses
   * Can be from:
   * 1. Static list (vamm_samm_pools.json)
   * 2. DOM extraction (discover pools on page)
   * 3. RPC discovery (check weights for known addresses)
   */
  async loadVammSammAddresses() {
    if (this.vammSammAddresses) {
      return this.vammSammAddresses;
    }

    // Try to load from static file (if bundled)
    // For now, return empty - will be populated from DOM extraction
    // In future, could fetch from a hosted JSON file or bundle it
    this.vammSammAddresses = [];
    return this.vammSammAddresses;
  }

  /**
   * Set vAMM/sAMM pool addresses (e.g., from DOM extraction)
   */
  setVammSammAddresses(addresses) {
    this.vammSammAddresses = addresses;
  }

  /**
   * Get pools using RPC for all available data
   * This is faster than DOM extraction for basic data
   */
  async getPoolsViaRpc(poolAddresses, poolTypes = {}) {
    console.log(`Fetching RPC data for ${poolAddresses.length} pools...`);
    
    // Use RPC provider to get all available data
    const pools = await this.rpcProvider.getPoolsData(poolAddresses, poolTypes);
    
    console.log(`✓ Got RPC data for ${pools.length} pools`);
    console.log(`  Note: Rewards/VAPR not available via RPC - will need DOM or multicall decoding`);
    
    return pools;
  }

  async getPools() {
    // 1. Fetch CL pools metadata from API
    const clMetadataMap = await this.fetchMetadata();
    const clPoolAddresses = Array.from(clMetadataMap.keys());

    // 2. Get vAMM/sAMM pool addresses
    const vammSammAddresses = await this.loadVammSammAddresses();
    
    // Combine all pool addresses
    const allPoolAddressesForWeights = [...clPoolAddresses, ...vammSammAddresses];

    if (allPoolAddressesForWeights.length === 0) {
      console.warn('No pools found');
      return [];
    }

    console.log(`Fetching weights for ${allPoolAddressesForWeights.length} pools (${clPoolAddresses.length} CL + ${vammSammAddresses.length} vAMM/sAMM)`);

    // 3. Fetch weights for all pools
    const weightsMap = await this.getPoolWeights(allPoolAddressesForWeights);
    const pools = [];

    // Add CL pools
    for (const addr of clPoolAddresses) {
      const meta = clMetadataMap.get(addr);
      const weightBigInt = weightsMap.get(addr) || 0n;
      const currentVotes = Number(weightBigInt) / 1e18;

      pools.push(new Pool({
        name: meta.name,
        pool_id: addr,
        pool_type: meta.poolType,
        fee_percentage: meta.feePercentage,
        total_rewards: meta.totalRewards, // API sets to 0, DOM will fill
        vapr: 0, // DOM will fill
        current_votes: currentVotes
      }));
    }

    // Add vAMM/sAMM pools
    // Note: Rewards/VAPR will be filled from DOM extraction or RPC rewards provider
    const vammSammPools = await this.vammSammProvider.getPools(vammSammAddresses);
    pools.push(...vammSammPools);

    // Try to get rewards from RPC rewards provider (if available)
    // Note: This only works if multicall responses have been intercepted
    // For now, rewards will come from DOM extraction in hybrid mode
    const allPoolAddresses = pools.map(p => p.pool_id);
    this.rewardsProvider.setKnownPools(allPoolAddresses);
    const rewards = this.rewardsProvider.getAllRewards();
    
    // Update pools with rewards if available (from intercepted multicall responses)
    for (const pool of pools) {
      const reward = rewards[pool.pool_id.toLowerCase()];
      if (reward && reward > 0) {
        pool.total_rewards = reward;
        // VAPR calculation would go here (needs time period and emission data)
        // For now, leave VAPR as 0 or calculate from rewards if we have the data
      }
    }
    
    // Note: Most pools will have total_rewards = 0 here
    // DOM extraction in extractPoolsHybrid() will fill in rewards for visible pools

    return pools;
  }

  /**
   * Extract rewards from a multicall response
   * Call this when intercepting multicall responses
   */
  extractRewardsFromResponse(responseHex) {
    return this.rewardsProvider.extractFromResponse(responseHex);
  }

  /**
   * Get rewards provider for direct access
   */
  getRewardsProvider() {
    return this.rewardsProvider;
  }
}