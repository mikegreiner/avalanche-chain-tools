import { RpcClient } from './rpc-client.js';
import Pool from './pool.js';

const VOTER_ADDRESS = '0xe30d0c8532721551a51a9fec7fb233759964d9e3';
const RPC_URL = 'https://api.avax.network/ext/bc/C/rpc';
const API_URL = 'https://resources.blackhole.xyz/cl-pools-list/cl-pools.json';

const SELECTORS = {
  weights: '0xa7cac846',
  totalWeight: '0x96c82e57'
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

  async getPools() {
    // 1. Fetch metadata first (API acts as the pool list source)
    const metadataMap = await this.fetchMetadata();
    const poolAddresses = Array.from(metadataMap.keys());

    if (poolAddresses.length === 0) {
      console.warn('No pools found in API');
      return [];
    }

    console.log(`Fetching weights for ${poolAddresses.length} pools from API list`);

    // 2. Fetch weights for these pools
    const weightsMap = await this.getPoolWeights(poolAddresses);
    const pools = [];

    for (const addr of poolAddresses) {
      const meta = metadataMap.get(addr);
      const weightBigInt = weightsMap.get(addr) || 0n;
      // formatted votes (assuming 18 decimals)
      const currentVotes = Number(weightBigInt) / 1e18;

      pools.push(new Pool({
        name: meta.name,
        pool_id: addr,
        pool_type: meta.poolType,
        fee_percentage: meta.feePercentage,
        total_rewards: meta.totalRewards, // Note: this is Fees only, missing Bribes
        vapr: 0, // Cannot calculate easily without emission rate & price
        current_votes: currentVotes
      }));
    }

    return pools;
  }
}