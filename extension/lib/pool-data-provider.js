import { RpcClient } from './rpc-client.js';
import Pool from './pool.js';

const VOTER_ADDRESS = '0x6bD81E7eaFA4B21d5AD069B452Ab4b8bb40c4525';
const RPC_URL = 'https://api.avax.network/ext/bc/C/rpc';
const API_URL = 'https://resources.blackhole.xyz/cl-pools-list/cl-pools.json';

const SELECTORS = {
  length: '0x1f7b6d32',
  pools: '0xac4afa38',
  weights: '0xa7cac846',
  totalWeight: '0x96c82e57'
};

// Helper to encode uint256 for RPC calls
function encodeUint256(num) {
  return num.toString(16).padStart(64, '0');
}

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
            totalRewards: parseFloat(p.feesUSD || p.untrackedFeesUSD || 0)
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

  async getVoterPools() {
    try {
      // 1. Get pool count
      const lengthHex = await this.rpc.ethCall(VOTER_ADDRESS, SELECTORS.length);
      const count = Number(hexToBigInt(lengthHex));
      console.log(`Voter contract has ${count} pools`);

      if (count === 0) return [];

      // 2. Fetch pool addresses (batch/parallel)
      const poolAddresses = [];
      const batchSize = 20;
      
      for (let i = 0; i < count; i += batchSize) {
        const batch = [];
        for (let j = 0; j < batchSize && (i + j) < count; j++) {
          const index = i + j;
          const data = SELECTORS.pools + encodeUint256(index);
          batch.push(this.rpc.ethCall(VOTER_ADDRESS, data).then(res => {
            // Extract address (last 20 bytes of 32-byte word)
            return '0x' + res.slice(-40);
          }));
        }
        const results = await Promise.all(batch);
        poolAddresses.push(...results);
      }

      return poolAddresses;
    } catch (e) {
      console.error('Error fetching voter pools:', e);
      return [];
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
    const [metadataMap, voterPoolAddresses] = await Promise.all([
      this.fetchMetadata(),
      this.getVoterPools()
    ]);

    if (voterPoolAddresses.length === 0) {
      console.warn('No pools found in Voter contract');
      return [];
    }

    const weightsMap = await this.getPoolWeights(voterPoolAddresses);
    const pools = [];

    for (const addr of voterPoolAddresses) {
      const addrLower = addr.toLowerCase();
      const meta = metadataMap.get(addrLower) || {
        name: `Unknown Pool (${addr.slice(0, 6)}...${addr.slice(-4)})`,
        totalRewards: 0,
        feePercentage: '?',
        poolType: 'Unknown'
      };

      const weightBigInt = weightsMap.get(addrLower) || 0n;
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
