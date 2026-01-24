/**
 * Content script bundle - includes all pool analysis logic
 * AUTO-GENERATED from lib/*.js - DO NOT EDIT DIRECTLY
 */

// --- From pool.js ---
/**
 * Pool class - represents a liquidity pool with its metrics
 * Ported from blackhole_pool_recommender.py
 */

class Pool {
  constructor(data) {
    this.name = data.name || 'Unknown';
    this.total_rewards = data.total_rewards || 0; // USD value
    this.vapr = data.vapr || 0; // VAPR percentage
    this.current_votes = data.current_votes ?? null;
    this.pool_id = data.pool_id || null;
    this.pool_type = data.pool_type || null; // vAMM, CL200, CL1, etc.
    this.fee_percentage = data.fee_percentage || null; // e.g., "0.7%", "0.05%"
  }

  /**
   * Calculate profitability score factoring in dilution.
   * Considers:
   * - Rewards per vote (accounts for dilution) - PRIMARY
   * - Total rewards (absolute size) - SECONDARY  
   * - VAPR (return percentage) - TERTIARY
   */
  profitabilityScore() {
    // Calculate rewards per vote if we have vote data
    let rewardsPerVote = null;
    if (this.current_votes !== null && this.current_votes > 0) {
      rewardsPerVote = this.total_rewards / this.current_votes;
    }

    // Normalize rewards per vote (primary metric, accounts for dilution)
    // Scale: assume max around $0.50 per vote is excellent, using square root for better distribution
    let rewardsPerVoteNormalized;
    if (rewardsPerVote !== null) {
      if (rewardsPerVote > 0) {
        // Normalize: $0.50 per vote = 100 points, using square root for gentler curve
        // This handles wide range: $0.001 to $0.50 per vote
        rewardsPerVoteNormalized = Math.min(100, Math.max(0, Math.pow(rewardsPerVote / 0.5, 0.5) * 100));
      } else {
        rewardsPerVoteNormalized = 0;
      }
    } else {
      // Fallback: if no vote data, use total rewards (less accurate)
      rewardsPerVoteNormalized = Math.min(this.total_rewards / 10000.0, 1.0) * 100;
    }

    // Normalize total rewards (secondary - absolute size matters too)
    const rewardsTotalNormalized = Math.min(this.total_rewards / 10000.0, 1.0) * 100;

    // Normalize VAPR (tertiary)
    const vaprNormalized = Math.min(this.vapr / 100.0, 10.0) * 10; // Cap at 1000% for normalization

    // Weighted combination:
    // - Rewards per vote: 60% (most important - accounts for dilution)
    // - Total rewards: 25% (absolute size still matters)
    // - VAPR: 15% (return percentage)
    const score = (rewardsPerVoteNormalized * 0.6) + (rewardsTotalNormalized * 0.25) + (vaprNormalized * 0.15);
    return score;
  }

  /**
   * Estimate USD rewards for the user if they vote with their voting power.
   * 
   * Formula:
   * - New total votes = current_votes + user_voting_power
   * - User's share = user_voting_power / new_total_votes
   * - Estimated reward = user_share * total_rewards
   */
  estimateUserRewards(userVotingPower) {
    if (this.current_votes === null || this.current_votes === 0) {
      // If no current votes, user would get 100% (unrealistic but for estimation)
      return this.total_rewards;
    }

    const newTotalVotes = this.current_votes + userVotingPower;
    const userShare = userVotingPower / newTotalVotes;
    const estimatedReward = userShare * this.total_rewards;

    return estimatedReward;
  }

  /**
   * Calculate the user's percentage share of the pool.
   */
  calculateShare(userVotingPower) {
    if (!userVotingPower || userVotingPower <= 0) return 0;
    const currentVotes = this.current_votes || 0;
    const newTotalVotes = currentVotes + userVotingPower;
    return (userVotingPower / newTotalVotes) * 100;
  }

  /**
   * Calculate stability score based on vote density and pool characteristics.
   * 
   * Based on analysis showing that vote density (votes per dollar of rewards)
   * is the best predictor of stability. Higher vote density = more stable.
   * 
   * Returns:
   *   Stability score (0-100, higher = more stable)
   */
  stabilityScore() {
    // Calculate vote density (votes per dollar of rewards)
    // Higher density = more votes relative to rewards = more stable
    if (this.total_rewards === null || this.total_rewards <= 0) {
      return 0.0;
    }

    if (this.current_votes === null || this.current_votes <= 0) {
      // No votes = very unstable (could see massive changes)
      return 0.0;
    }

    const voteDensity = this.current_votes / this.total_rewards;

    // Normalize vote density
    // Analysis showed median density around 200-500 votes per dollar
    // High density (stable): 500+ votes per dollar = 100 points
    // Low density (volatile): <100 votes per dollar = 0 points
    // Use square root for gentler curve
    let normalizedDensity;
    if (voteDensity > 0) {
      normalizedDensity = Math.min(100, Math.max(0, Math.pow(voteDensity / 500.0, 0.5) * 100));
    } else {
      normalizedDensity = 0;
    }

    // Reward size factor (larger rewards = slightly more stable)
    // But not as important as vote density
    let rewardSizeFactor;
    if (this.total_rewards >= 50000) {
      rewardSizeFactor = 20; // Large rewards
    } else if (this.total_rewards >= 20000) {
      rewardSizeFactor = 10; // Medium rewards
    } else {
      rewardSizeFactor = 0; // Small rewards (more volatile)
    }

    // Combine: vote density is primary (80%), reward size is secondary (20%)
    const stability = (normalizedDensity * 0.8) + (rewardSizeFactor * 0.2);

    return Math.min(100, Math.max(0, stability));
  }

  /**
   * Calculate stability-adjusted score optimized for your personal rewards.
   * 
   * When user_voting_power is provided, uses estimated reward (what you'll actually get)
   * combined with stability (how likely it is to remain stable near epoch close).
   * 
   * When user_voting_power is not provided, falls back to profitability + stability.
   * 
   * This is especially useful near epoch close when votes are pouring in and
   * you want to maximize your rewards while accounting for stability.
   * 
   * @param {number|null} userVotingPower - Your voting power in veBLACK (optional)
   * @returns {number} Stability-adjusted score (higher = better for your rewards)
   */
  stabilityAdjustedScore(userVotingPower = null) {
    const stability = this.stabilityScore();

    if (userVotingPower !== null && userVotingPower > 0) {
      // Use estimated reward (what you'll actually get)
      const estimatedReward = this.estimateUserRewards(userVotingPower);

      // Normalize estimated reward to 0-100 scale
      // Assume max reward around $500 is excellent (adjust based on your typical rewards)
      // Use square root for gentler curve
      let normalizedReward;
      if (estimatedReward > 0) {
        normalizedReward = Math.min(100, Math.max(0, Math.pow(estimatedReward / 500.0, 0.5) * 100));
      } else {
        normalizedReward = 0;
      }

      // Combine: 70% estimated reward, 30% stability
      // This maximizes your personal rewards while accounting for stability
      // Higher stability = less likely to drop as votes pour in near epoch close
      const adjustedScore = (normalizedReward * 0.7) + (stability * 0.3);
      return adjustedScore;
    } else {
      // Fallback: use profitability score when no voting power provided
      const profitability = this.profitabilityScore();
      const adjustedScore = (profitability * 0.7) + (stability * 0.3);
      return adjustedScore;
    }
  }

  /**
   * Calculate vote density (votes per dollar of rewards) - key stability predictor
   */
  voteDensity() {
    if (this.total_rewards && this.total_rewards > 0 && this.current_votes) {
      return this.current_votes / this.total_rewards;
    }
    return null;
  }

  /**
   * Calculate rewards per vote
   */
  rewardsPerVote() {
    if (this.current_votes !== null && this.current_votes > 0) {
      return this.total_rewards / this.current_votes;
    }
    return null;
  }
}

// Export for use in other modules

// --- From rpc-client.js ---
/**
 * Simple JSON-RPC 2.0 Client
 */
class RpcClient {
  constructor(url) {
    this.url = url;
    this.id = 1;
  }

  async call(method, params = []) {
    try {
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'PROXY_REQUEST',
          url: this.url,
          options: {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: method,
              params: params,
              id: this.id++,
            })
          }
        }, result => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(result);
          }
        });
      });

      if (!response.success) {
        throw new Error(response.error || `HTTP error! status: ${response.status}`);
      }

      const data = response.data;
      if (data.error) {
        throw new Error(data.error.message || 'RPC Error');
      }
      return data.result;
    } catch (error) {
      console.error(`RPC Call Error (${method}):`, error);
      throw error;
    }
  }

  async ethCall(to, data) {
    return this.call('eth_call', [{ to: to, data: data }, 'latest']);
  }

  async getBlockNumber() {
    return this.call('eth_blockNumber');
  }
}

// --- From rpc-pool-provider.js ---
/**
 * RPC-based Pool Data Provider
 * Gets pool data directly from blockchain via RPC calls
 * Fast and reliable - no DOM dependency for basic data
 */


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

class RpcPoolProvider {
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

// --- From rpc-rewards-provider.js ---
/**
 * RPC Rewards Provider
 * Gets rewards by intercepting multicall responses and extracting values
 * This is a hybrid approach: we intercept the site's multicalls and extract rewards
 */


const AGGREGATE_SELECTOR = '0x82ad56cb';

class RpcRewardsProvider {
  constructor(knownPools = []) {
    this.extractor = new RewardsExtractor(knownPools);
    this.rpc = new RpcClient(RPC_URL);
    this.rewardsCache = new Map(); // pool -> reward
  }

  /**
   * Extract rewards from a multicall response
   * This is called when we intercept a multicall response
   * Now uses improved decoding to match calls to returns
   */
  extractFromResponse(responseHex, requestHex = null) {
    // Try improved decoding if we have both request and response
    if (requestHex && requestHex.startsWith('0x82ad56cb')) {
      try {
        const requests = decodeMulticallRequest(requestHex);
        const { returns } = decodeMulticallResponse(responseHex);
        
        if (requests.length === returns.length) {
          const matched = matchCallsToReturns(requests, returns);
          const poolSet = new Set(
            Array.from(this.extractor.knownPools).map(p => p.toLowerCase().replace('0x', ''))
          );
          const decodedRewards = extractRewardsFromDecoded(matched, poolSet);
          
          // Update cache with decoded rewards
          for (const [pool, value] of Object.entries(decodedRewards)) {
            this.rewardsCache.set(pool.toLowerCase(), value);
          }
          
          if (Object.keys(decodedRewards).length > 0) {
            console.log(`✓ Decoded ${Object.keys(decodedRewards).length} rewards from multicall`);
            return decodedRewards;
          }
        }
      } catch (e) {
        console.warn('Improved decoding failed, falling back to pattern matching:', e);
      }
    }
    
    // Fallback to pattern matching
    const rewards = this.extractor.extractRewards(responseHex);
    
    // Update cache
    for (const [pool, value] of Object.entries(rewards)) {
      this.rewardsCache.set(pool.toLowerCase(), value);
    }
    
    return rewards;
  }

  /**
   * Get reward for a specific pool
   */
  getReward(poolAddress) {
    return this.rewardsCache.get(poolAddress.toLowerCase()) || 0;
  }

  /**
   * Get rewards for multiple pools
   */
  getRewards(poolAddresses) {
    const rewards = {};
    for (const addr of poolAddresses) {
      rewards[addr] = this.getReward(addr);
    }
    return rewards;
  }

  /**
   * Update known pools list
   */
  setKnownPools(pools) {
    this.extractor.setKnownPools(pools);
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.rewardsCache.clear();
  }

  /**
   * Get all cached rewards
   */
  getAllRewards() {
    const rewards = {};
    for (const [pool, value] of this.rewardsCache.entries()) {
      rewards[pool] = value;
    }
    return rewards;
  }
}

/**
 * Intercept fetch/XHR calls to RPC endpoints and extract rewards
 * This should be called from a content script that can intercept network requests
 */
function interceptMulticallResponses(rewardsProvider) {
  // Store request data to match with responses
  const requestCache = new Map();
  
  // Intercept fetch
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const url = args[0];
    const options = args[1] || {};
    
    // Check if it's an RPC call
    if (typeof url === 'string' && (url.includes('rpc') || url.includes('avax.network'))) {
      // Try to extract request data
      let requestHex = null;
      if (options.body) {
        try {
          const body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
          if (body.params && body.params[0] && body.params[0].data) {
            requestHex = body.params[0].data;
            // Store request with a unique ID (use timestamp + random)
            const requestId = body.id || Date.now();
            requestCache.set(requestId, requestHex);
          }
        } catch (e) {
          // Not JSON or no data
        }
      }
    }
    
    const response = await originalFetch.apply(this, args);
    
    // Check if it's an RPC call
    if (typeof url === 'string' && (url.includes('rpc') || url.includes('avax.network'))) {
      // Clone response to read it
      const clonedResponse = response.clone();
      
      clonedResponse.json().then(data => {
        if (data && data.result) {
          // Check if it's a multicall response
          if (data.result.startsWith('0x') && data.result.length > 1000) {
            // Try to get matching request
            const requestId = data.id;
            const requestHex = requestCache.get(requestId);
            
            // Extract rewards (with improved decoding if we have request)
            rewardsProvider.extractFromResponse(data.result, requestHex);
            
            // Clean up cache (keep last 100)
            if (requestCache.size > 100) {
              const firstKey = requestCache.keys().next().value;
              requestCache.delete(firstKey);
            }
          }
        }
      }).catch(() => {
        // Not JSON, ignore
      });
    }
    
    return response;
  };

  // Intercept XMLHttpRequest
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this._url = url;
    return originalOpen.apply(this, [method, url, ...rest]);
  };
  
  XMLHttpRequest.prototype.send = function(body) {
    // Store request data
    let requestHex = null;
    if (body && typeof body === 'string') {
      try {
        const bodyObj = JSON.parse(body);
        if (bodyObj.params && bodyObj.params[0] && bodyObj.params[0].data) {
          requestHex = bodyObj.params[0].data;
          const requestId = bodyObj.id || Date.now();
          requestCache.set(requestId, requestHex);
        }
      } catch (e) {
        // Not JSON
      }
    }
    
    this.addEventListener('load', function() {
      if (this._url && (this._url.includes('rpc') || this._url.includes('avax.network'))) {
        try {
          const data = JSON.parse(this.responseText);
          if (data && data.result && data.result.startsWith('0x') && data.result.length > 1000) {
            // Try to get matching request
            const requestId = data.id;
            const matchingRequest = requestCache.get(requestId) || requestHex;
            
            rewardsProvider.extractFromResponse(data.result, matchingRequest);
            
            // Clean up cache
            if (requestCache.size > 100) {
              const firstKey = requestCache.keys().next().value;
              requestCache.delete(firstKey);
            }
          }
        } catch (e) {
          // Not JSON, ignore
        }
      }
    });
    
    return originalSend.apply(this, arguments);
  };
}

// --- From rewards-extractor.js ---
/**
 * Rewards Extractor from Multicall Responses
 * Extracts reward values from multicall RPC responses by finding pool addresses
 * and nearby reward values in the hex data
 */

class RewardsExtractor {
  constructor(knownPools = []) {
    // Convert to lowercase set for fast lookup
    this.knownPools = new Set(
      knownPools.map(addr => addr.toLowerCase().replace('0x', ''))
    );
  }

  /**
   * Extract rewards from a multicall response
   * @param {string} responseHex - The hex response from multicall
   * @returns {Object} Map of pool address (lowercase) to reward value (USD)
   */
  extractRewards(responseHex) {
    if (!responseHex || responseHex === '0x') {
      return {};
    }

    // Remove 0x prefix and convert to lowercase
    let hexData = responseHex.startsWith('0x') 
      ? responseHex.slice(2).toLowerCase() 
      : responseHex.toLowerCase();

    const rewards = {};

    // Find each known pool address in the response
    for (const poolHex of this.knownPools) {
      const pos = hexData.indexOf(poolHex);
      
      if (pos === -1) continue;

      // Look for values after the address (within 500 chars)
      const searchArea = hexData.slice(pos + 40, pos + 500);

      // Find 64-char chunks (uint256 values)
      for (let i = 0; i < searchArea.length - 64; i += 64) {
        const chunk = searchArea.slice(i, i + 64);
        
        try {
          const value = BigInt('0x' + chunk);
          
          // Filter for reasonable reward values (1e20 to 1e27 wei)
          if (value > 1e20 && value < 1e27) {
            const usdValue = Number(value) / 1e18;
            
            // Filter for reasonable USD range (100 to 100M)
            if (usdValue > 100 && usdValue < 100000000) {
              const poolKey = '0x' + poolHex;
              const poolKeyLower = poolKey.toLowerCase();
              
              // Take the maximum value found (most recent/accurate)
              if (!rewards[poolKeyLower] || usdValue > rewards[poolKeyLower]) {
                rewards[poolKeyLower] = usdValue;
              }
              break; // Take first reasonable value
            }
          }
        } catch (e) {
          // Invalid hex, skip
          continue;
        }
      }
    }

    return rewards;
  }

  /**
   * Extract rewards from multiple multicall responses
   * @param {Array<string>} responses - Array of hex responses
   * @returns {Object} Map of pool address to reward value (max across all responses)
   */
  extractRewardsFromMultiple(responses) {
    const allRewards = {};

    for (const response of responses) {
      const rewards = this.extractRewards(response);
      
      for (const [pool, value] of Object.entries(rewards)) {
        if (!allRewards[pool] || value > allRewards[pool]) {
          allRewards[pool] = value;
        }
      }
    }

    return allRewards;
  }

  /**
   * Update known pools list
   */
  setKnownPools(pools) {
    this.knownPools = new Set(
      pools.map(addr => addr.toLowerCase().replace('0x', ''))
    );
  }
}

// --- From vamm-samm-provider.js ---
/**
 * vAMM/sAMM Pool Data Provider
 * Provides pool addresses discovered via RPC analysis
 * Rewards/VAPR are extracted from DOM via pool-extractor.js
 */




// Known pool addresses from discovery
// In production, this could be loaded from vamm_samm_pools.json
// For now, we'll use a subset and let DOM extraction fill in the rest
const KNOWN_VAMM_SAMM_POOLS = [
  // These will be populated from vamm_samm_pools.json or discovered dynamically
];

// Helper to decode hex to BigInt

// Helper to get address from hex result

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

class VammSammProvider {
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

// --- From pool-data-provider.js ---

const API_URL = 'https://resources.blackhole.xyz/cl-pools-list/cl-pools.json';


// Helper to decode hex to BigInt

class PoolDataProvider {
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
// --- From pool-recommender.js ---
/**
 * Pool recommender logic
 * Ported from blackhole_pool_recommender.py recommend_pools method
 */


/**
 * Simple wildcard matching (like fnmatch)
 */
function fnmatch(pattern, string) {
  // Convert to regex
  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  const regex = new RegExp(`^${regexPattern}$`, 'i');
  return regex.test(string);
}

/**
 * Recommend top pools based on criteria
 * 
 * @param {Array<Pool>} pools - Array of Pool objects
 * @param {Object} options - Recommendation options
 * @param {number} options.topN - Number of top pools to return
 * @param {number|null} options.userVotingPower - User's voting power in veBLACK
 * @param {boolean} options.hideVamm - Filter out vAMM pools
 * @param {number|null} options.minRewards - Minimum total rewards in USD
 * @param {number|null} options.maxPoolPercentage - Maximum percentage of pool voting power
 * @param {string|Array<string>|null} options.poolName - Shell-style wildcard pattern(s) to filter pools
 * @param {string} options.sortBy - Sort method: 'auto', 'reward', 'profitability', or 'stability'
 * @returns {Array<Pool>} Recommended pools
 */
function recommendPools(pools, options = {}) {
  const {
    topN = 5,
    userVotingPower = null,
    hideVamm = false,
    minRewards = null,
    maxPoolPercentage = null,
    poolName = null,
    sortBy = 'auto'
  } = options;

  if (!pools || pools.length === 0) {
    return [];
  }

  let filteredPools = [...pools];

  // Filter out vAMM pools if requested
  if (hideVamm) {
    filteredPools = filteredPools.filter(p => p.pool_type !== 'vAMM');
  }

  // Filter out pools below minimum rewards threshold
  if (minRewards !== null) {
    filteredPools = filteredPools.filter(p => p.total_rewards >= minRewards);
  }

  // Filter pools by name using shell-style wildcards (case-insensitive)
  if (poolName !== null) {
    const patterns = Array.isArray(poolName) ? poolName : [poolName];
    
    filteredPools = filteredPools.filter(pool => {
      // Must match ALL patterns
      return patterns.every(p => {
        if (!p) return true;
        let pattern = p;
        if (!pattern.includes('*') && !pattern.includes('?')) {
          pattern = `*${pattern}*`;
        }
        return fnmatch(pattern, pool.name);
      });
    });
  }

  // Filter out pools where user would exceed max pool percentage threshold
  if (maxPoolPercentage !== null && userVotingPower !== null) {
    const poolsBefore = filteredPools.length;
    // Calculate roughly the minimum votes a pool needs to have to pass this filter
    // user_share = user_power / (current_votes + user_power) <= max_pct / 100
    // user_power / (max_pct/100) <= current_votes + user_power
    // (user_power * 100 / max_pct) - user_power <= current_votes
    const minVotesRequired = (userVotingPower * 100 / maxPoolPercentage) - userVotingPower;
    console.log(`Debug: To pass ${maxPoolPercentage}% filter with ${userVotingPower} power, pools need > ~${Math.floor(minVotesRequired).toLocaleString()} votes`);

    filteredPools = filteredPools.filter(pool => {
      // Skip pools without vote data (can't calculate percentage)
      if (pool.current_votes === null || pool.current_votes === 0) {
        // If pool has no votes, user would have 100% - include only if threshold allows
        return maxPoolPercentage >= 100.0;
      }

      // Calculate new total votes after user votes
      const newTotalVotes = pool.current_votes + userVotingPower;
      // Calculate user's percentage of the pool
      const userPercentage = (userVotingPower / newTotalVotes) * 100;

      // Include pool only if user percentage is <= threshold
      return userPercentage <= maxPoolPercentage;
    });
    
    if (poolsBefore > 0 && filteredPools.length === 0) {
      console.warn(`Warning: All ${poolsBefore} pools were filtered out by max pool percentage (${maxPoolPercentage}%). Try increasing this value or decreasing voting power.`);
    }
  }

  // Determine sort method
  let sortMethod;
  if (sortBy === 'auto') {
    // Default behavior: reward if voting power provided, else profitability
    sortMethod = userVotingPower !== null ? 'reward' : 'profitability';
  } else {
    sortMethod = sortBy;
  }

  // Sort pools based on selected method
  let sortedPools;
  if (sortMethod === 'reward') {
    if (userVotingPower === null) {
      // Fallback if no voting power but reward sort requested
      sortedPools = filteredPools.sort((a, b) => b.total_rewards - a.total_rewards);
    } else {
      sortedPools = filteredPools.sort((a, b) => {
        return b.estimateUserRewards(userVotingPower) - a.estimateUserRewards(userVotingPower);
      });
    }
  } else if (sortMethod === 'profitability') {
    sortedPools = filteredPools.sort((a, b) => {
      return b.profitabilityScore() - a.profitabilityScore();
    });
  } else if (sortMethod === 'stability') {
    sortedPools = filteredPools.sort((a, b) => {
      return b.stabilityAdjustedScore(userVotingPower) - a.stabilityAdjustedScore(userVotingPower);
    });
  } else {
    // Default fallback
    sortedPools = filteredPools.sort((a, b) => b.total_rewards - a.total_rewards);
  }

  return sortedPools.slice(0, topN);
}

// --- From pool-extractor.js ---
/**
 * Pool data extraction from DOM
 * Ported from blackhole_pool_recommender.py _extract_pools_from_elements
 */


/**
 * Extract pool data from DOM elements on the voting page
 * Now handles pagination to extract pools from all pages
 */
async function extractPoolsFromDOM() {
  const pools = [];
  const foundPoolIds = new Set(); // Track to avoid duplicates
  
  // Helper function to extract pools from current page
  function extractPoolsFromCurrentPage() {
    let poolElements = document.querySelectorAll('div.liquidity-pool-cell.even, div.liquidity-pool-cell.odd');
    
    if (poolElements.length === 0) {
      const allPoolElements = document.querySelectorAll('div.liquidity-pool-cell');
      poolElements = Array.from(allPoolElements).filter(elem => {
        const classes = elem.className || '';
        return classes.includes('even') || classes.includes('odd');
      });
    }

    for (const element of poolElements) {
      try {
        const pool = extractPoolFromElement(element);
        if (pool) {
          // Use pool_id to avoid duplicates (in case same pool appears on multiple pages)
          const poolKey = pool.pool_id ? pool.pool_id.toLowerCase() : pool.name.toLowerCase();
          if (!foundPoolIds.has(poolKey)) {
            pools.push(pool);
            foundPoolIds.add(poolKey);
          }
        }
      } catch (error) {
        console.warn('Error extracting pool from element:', error);
      }
    }
    
    return poolElements.length;
  }
  
  // Extract pools from current page
  const poolsOnCurrentPage = extractPoolsFromCurrentPage();
  console.log(`Found ${poolsOnCurrentPage} pool elements on current page, ${pools.length} unique pools so far`);
  
  // Check if pagination exists - if so, try to temporarily increase page size
  const paginationContainer = document.querySelector('.pagination');
  let originalPageSize = null;
  let pageSizeSelector = null;
  let pageSizeChanged = false;
  
  // Try to find and change page size selector to 100
  // Based on the HTML structure: <div class="size-per-page"> with clickable dropdown
  console.log('Searching for page size selector...');
  
  // First, try to find the size-per-page element (custom dropdown)
  const sizePerPageElement = document.querySelector('.size-per-page');
  if (sizePerPageElement) {
    // Extract current page size from the text (e.g., "Pools/Page: 10")
    const textContent = sizePerPageElement.textContent || '';
    const pageSizeMatch = textContent.match(/Pools\/Page:\s*(\d+)/i) || textContent.match(/(\d+)/);
    if (pageSizeMatch) {
      originalPageSize = pageSizeMatch[1];
      console.log(`Found size-per-page element, current value: ${originalPageSize}`);
      
      // Store reference to the clickable element (the whole size-per-page div is likely clickable)
      pageSizeSelector = sizePerPageElement;
    }
  }
  
  // Also try standard select elements as fallback
  if (!pageSizeSelector) {
    const possibleSelectors = [
      'select[class*="page"]',
      'select[class*="size"]',
      'select[class*="per"]',
      '.pagination select',
      '[class*="page-size"] select'
    ];
    
    for (const selector of possibleSelectors) {
      const element = document.querySelector(selector);
      if (element && element.tagName === 'SELECT') {
        const option100 = Array.from(element.options).find(opt => {
          const val = opt.value || opt.textContent.trim();
          return val === '100';
        });
        if (option100) {
          pageSizeSelector = element;
          originalPageSize = element.value;
          console.log(`Found page size select element, current value: ${originalPageSize}`);
          break;
        }
      }
    }
  }
  
  if (!pageSizeSelector) {
    console.log('Could not find page size selector. Will navigate through pages normally.');
  }
  
  // If we found a page size selector, temporarily change it to 100
  if (pageSizeSelector && originalPageSize !== '100') {
    try {
      console.log(`Temporarily changing page size from ${originalPageSize} to 100...`);
      
      // Check if it's a standard select element
      if (pageSizeSelector.tagName === 'SELECT') {
        pageSizeSelector.value = '100';
        
        // Trigger change event
        const changeEvent = new Event('change', { bubbles: true });
        pageSizeSelector.dispatchEvent(changeEvent);
        
        // Also try input event
        const inputEvent = new Event('input', { bubbles: true });
        pageSizeSelector.dispatchEvent(inputEvent);
      } else {
        // It's a custom dropdown (like .size-per-page)
        // Click to open the dropdown
        console.log('Clicking page size dropdown to open it...');
        pageSizeSelector.click();
        
        // Wait a bit for dropdown to open
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Look for the "100" option in the dropdown menu
        // The dropdown might be a sibling, child, or appear elsewhere in the DOM
        let option100 = null;
        
        // Try multiple strategies to find the dropdown menu
        const strategies = [
          // Strategy 1: Look for a dropdown menu near the size-per-page element
          () => {
            const parent = pageSizeSelector.parentElement;
            if (parent) {
              return parent.querySelector('[class*="menu"], [class*="dropdown"], [class*="option"]');
            }
            return null;
          },
          // Strategy 2: Look for elements with "100" text that appeared after click
          () => {
            const allElements = document.querySelectorAll('div, span, button, a');
            for (const elem of allElements) {
              const text = elem.textContent.trim();
              if (text === '100') {
                const rect = elem.getBoundingClientRect();
                const selectorRect = pageSizeSelector.getBoundingClientRect();
                // Check if it's near the selector (likely the dropdown option)
                if (Math.abs(rect.top - selectorRect.bottom) < 200 && 
                    Math.abs(rect.left - selectorRect.left) < 100) {
                  return elem;
                }
              }
            }
            return null;
          },
          // Strategy 3: Look for any visible element with "100" that's clickable
          () => {
            const allElements = document.querySelectorAll('div, span, button, a, [role="menuitem"], [role="option"]');
            for (const elem of allElements) {
              const text = elem.textContent.trim();
              const style = getComputedStyle(elem);
              if (text === '100' && 
                  style.display !== 'none' && 
                  style.visibility !== 'hidden' &&
                  style.opacity !== '0') {
                return elem;
              }
            }
            return null;
          }
        ];
        
        for (const strategy of strategies) {
          option100 = strategy();
          if (option100) {
            console.log('Found "100" option in dropdown');
            break;
          }
        }
        
        if (option100) {
          // Click the 100 option
          console.log('Clicking "100" option...');
          option100.click();
          pageSizeChanged = true;
        } else {
          console.warn('Could not find "100" option in dropdown. Trying to search more broadly...');
          // Last resort: search the entire document for clickable "100"
          const allClickable = document.querySelectorAll('div, span, button, a');
          for (const elem of allClickable) {
            if (elem.textContent.trim() === '100') {
              const rect = elem.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0) { // Element is visible
                console.log('Found visible "100" element, clicking it...');
                elem.click();
                pageSizeChanged = true;
                break;
              }
            }
          }
        }
      }
      
      if (pageSizeChanged) {
        // Wait for page to reload with new page size
        console.log('Waiting for page to reload with new page size...');
        await new Promise(resolve => setTimeout(resolve, 3000)); // Wait for page to update
        
        // Verify the change took effect by checking if more pools are visible
        const poolCountAfter = document.querySelectorAll('div.liquidity-pool-cell').length;
        console.log(`Page size changed. Pools visible: ${poolCountAfter}`);
        
        // Also check if the text updated
        if (sizePerPageElement) {
          const updatedText = sizePerPageElement.textContent || '';
          console.log(`Page size element now shows: ${updatedText}`);
        }
        
        // CRITICAL: Extract pools from this expanded first page immediately
        const poolsFromPage1 = extractPoolsFromCurrentPage();
        console.log(`Extracted ${poolsFromPage1} pools from expanded Page 1`);
      }
      
    } catch (error) {
      console.warn('Error changing page size:', error);
      pageSizeChanged = false;
    }
  }
  
  let pageItems = [];
  let nextButton = null;
  
  if (paginationContainer) {
    // Find all page number items
    pageItems = Array.from(paginationContainer.querySelectorAll('.item')).filter(item => {
      const text = item.textContent ? item.textContent.trim() : '';
      return /^\d+$/.test(text) && !item.classList.contains('extreme') && !item.classList.contains('selected');
    });
    
    // Find next button (right arrow)
    const rightExtreme = paginationContainer.querySelector('.item.extreme.right');
    if (rightExtreme) {
      nextButton = rightExtreme;
    }
  }
  
  // Store the current page to return to it later (after we potentially changed page size)
  const currentPageItem = paginationContainer ? paginationContainer.querySelector('.item.selected') : null;
  const currentPageNum = currentPageItem ? parseInt(currentPageItem.textContent.trim()) : 1;
  
  // If we changed page size, we might only need to check 1-2 pages now instead of many
  if (paginationContainer && (pageItems.length > 0 || nextButton)) {
    console.log(`Pagination detected. Extracting pools from all pages...`);
    
    // Helper function to wait for page to load by checking if page number has updated
    async function waitForPageLoad(previousPageNum, maxWaitTime = 10000) {
      const startTime = Date.now();
      while (Date.now() - startTime < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Check for loading indicators (optional, but good practice)
        const isLoading = document.querySelector('.loading') || 
                         document.querySelector('.spinner');
        
        if (!isLoading) {
            const pagination = document.querySelector('.pagination');
            if (pagination) {
                const selectedItem = pagination.querySelector('.item.selected');
                if (selectedItem) {
                    const newPageNum = parseInt(selectedItem.textContent.trim());
                    // If page number has changed, we are good
                    if (!isNaN(newPageNum) && newPageNum !== previousPageNum) {
                        await new Promise(resolve => setTimeout(resolve, 500)); // Extra wait for table render
                        return true;
                    }
                }
            }
        }
      }
      console.warn(`Page load timeout: Page number did not change from ${previousPageNum} within ${maxWaitTime}ms`);
      return false;
    }
    
    // Helper function to get current page number
    function getCurrentPageNum() {
      const pagination = document.querySelector('.pagination');
      if (!pagination) return null;
      const selectedItem = pagination.querySelector('.item.selected');
      if (!selectedItem) return null;
      const text = selectedItem.textContent.trim();
      const pageNum = parseInt(text);
      return isNaN(pageNum) ? null : pageNum;
    }
    
    // Navigate through all pages to extract pools
    // If we successfully changed page size to 100, we'll need fewer pages
    const maxPagesToCheck = pageSizeChanged ? 5 : 100; // Safety limit (fewer if page size is 100)
    let pagesChecked = 1;
    let consecutiveFailures = 0;
    const maxConsecutiveFailures = 3;
    
    // First, make sure we're on page 1 to start from the beginning
    const initialPageNum = getCurrentPageNum();
    if (initialPageNum && initialPageNum > 1) {
      console.log(`Starting from page ${initialPageNum}, navigating to page 1 first...`);
      const pagination = document.querySelector('.pagination');
      if (pagination) {
        const page1Item = Array.from(pagination.querySelectorAll('.item')).find(item => {
          const text = item.textContent.trim();
          return /^1$/.test(text) && !item.classList.contains('extreme');
        });
        if (page1Item) {
          const clickable = page1Item.closest('.item') || page1Item.parentElement || page1Item;
          clickable.click();
          // Wait for page 1 to load (previous was initialPageNum)
          await waitForPageLoad(initialPageNum, 5000);
          // Re-extract from page 1 (we already got it, but this ensures we're synced)
          extractPoolsFromCurrentPage();
        }
      }
    } else {
       // If we are already on page 1 and haven't extracted yet (e.g. didn't change page size)
       // ensure we extract the current page before navigating
       if (!pageSizeChanged) {
         extractPoolsFromCurrentPage();
       }
    }
    
    // Now navigate through all pages using next button
    // If page size was changed to 100, we should only need 1-2 pages
    while (pagesChecked < maxPagesToCheck && consecutiveFailures < maxConsecutiveFailures) {
      const pagination = document.querySelector('.pagination');
      if (!pagination) {
        console.log('Pagination container disappeared');
        break;
      }
      
      const currentPageBefore = getCurrentPageNum();
      const previousPoolCount = pools.length;
      
      // Find next button
      const rightExtreme = pagination.querySelector('.item.extreme.right');
      if (!rightExtreme) {
        console.log('No next button found');
        break;
      }
      
      const clickable = rightExtreme.closest('.item') || rightExtreme.parentElement || rightExtreme;
      const isDisabled = clickable.classList.contains('disabled') || 
                        clickable.hasAttribute('disabled') ||
                        clickable.style.pointerEvents === 'none' ||
                        getComputedStyle(clickable).pointerEvents === 'none';
      
      if (isDisabled) {
        console.log('Next button is disabled - reached last page');
        break;
      }
      
      // Click next button
      console.log(`Clicking next button (currently on page ${currentPageBefore || 'unknown'})...`);
      clickable.click();
      
      // Wait for page to load (pass current page number to check for change)
      const pageLoaded = await waitForPageLoad(currentPageBefore, 6000); // Reduced timeout
      
      // Verify we actually moved to a new page
      const currentPageAfter = getCurrentPageNum();
      if (currentPageAfter === currentPageBefore) {
        // If page didn't change, we likely hit the end of the list even if button wasn't disabled
        console.log(`Page did not advance from ${currentPageBefore}. Assuming reached last page.`);
        break;
      }
      
      consecutiveFailures = 0; // Reset on success
      
      // Extract pools from this page
      const poolsOnPage = extractPoolsFromCurrentPage();
      pagesChecked++;
      console.log(`Extracted ${poolsOnPage} pools from page ${currentPageAfter} (${pools.length} total unique pools so far)`);
      
      // Small delay between pages
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    console.log(`Finished navigating through ${pagesChecked} pages`);
    
    // Restore original page size if we changed it
    if (pageSizeChanged && pageSizeSelector && originalPageSize !== null) {
      try {
        console.log(`Restoring page size from 100 back to ${originalPageSize}...`);
        
        // Check if it's a standard select element
        if (pageSizeSelector.tagName === 'SELECT') {
          pageSizeSelector.value = originalPageSize;
          
          // Trigger change event
          const changeEvent = new Event('change', { bubbles: true });
          pageSizeSelector.dispatchEvent(changeEvent);
          
          // Also try input event
          const inputEvent = new Event('input', { bubbles: true });
          pageSizeSelector.dispatchEvent(inputEvent);
        } else {
          // It's a custom dropdown (like .size-per-page)
          // Click to open the dropdown
          pageSizeSelector.click();
          
          // Wait for dropdown to open
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Look for the original page size option (e.g., "10")
          let originalOption = null;
          
          // Try to find the option with the original page size value
          const allElements = document.querySelectorAll('div, span, button, a, [role="menuitem"], [role="option"]');
          for (const elem of allElements) {
            const text = elem.textContent.trim();
            if (text === originalPageSize) {
              const rect = elem.getBoundingClientRect();
              const selectorRect = pageSizeSelector.getBoundingClientRect();
              // Check if it's near the selector (likely the dropdown option)
              if (rect.width > 0 && rect.height > 0 && // Element is visible
                  Math.abs(rect.top - selectorRect.bottom) < 200 && 
                  Math.abs(rect.left - selectorRect.left) < 100) {
                originalOption = elem;
                break;
              }
            }
          }
          
          if (originalOption) {
            console.log(`Found "${originalPageSize}" option, clicking it...`);
            originalOption.click();
          } else {
            console.warn(`Could not find "${originalPageSize}" option in dropdown`);
          }
        }
        
        // Wait for page to reload with original page size
        await new Promise(resolve => setTimeout(resolve, 3000));
        console.log('Page size restored');
        
        // After restoring page size, we need to navigate back to the original page
        // because changing page size likely reset us to page 1
        if (currentPageNum > 1) {
          console.log(`Navigating back to original page ${currentPageNum}...`);
          const restoredPagination = document.querySelector('.pagination');
          if (restoredPagination) {
            const allPageItems = Array.from(restoredPagination.querySelectorAll('.item')).filter(item => {
              const text = item.textContent.trim();
              return /^\d+$/.test(text) && !item.classList.contains('extreme');
            });
            
            const targetPageItem = allPageItems.find(item => {
              const pageNum = parseInt(item.textContent.trim());
              return pageNum === currentPageNum;
            });
            
            if (targetPageItem) {
              const clickable = targetPageItem.closest('.item') || targetPageItem.parentElement || targetPageItem;
              clickable.click();
              await new Promise(resolve => setTimeout(resolve, 2000));
              console.log(`Returned to page ${currentPageNum}`);
            } else {
              console.warn(`Could not find page ${currentPageNum} button after restoring page size`);
            }
          }
        }
      } catch (error) {
        console.warn('Error restoring page size:', error);
      }
    } else if (currentPageNum > 1) {
      // If we didn't change page size, just return to original page normally
      console.log(`Returning to page ${currentPageNum}...`);
      const finalPagination = document.querySelector('.pagination');
      if (finalPagination) {
        const allPageItems = Array.from(finalPagination.querySelectorAll('.item')).filter(item => {
          const text = item.textContent ? item.textContent.trim() : '';
          return /^\d+$/.test(text) && !item.classList.contains('extreme');
        });
        
        const targetPageItem = allPageItems.find(item => {
          const pageNum = parseInt(item.textContent.trim());
          return pageNum === currentPageNum;
        });
        
        if (targetPageItem) {
          const clickable = targetPageItem.closest('.item') || targetPageItem.parentElement || targetPageItem;
          clickable.click();
          await new Promise(resolve => setTimeout(resolve, 1500));
        } else {
          // Try to go to page 1 and navigate from there
          const page1Item = allPageItems.find(item => {
            const pageNum = parseInt(item.textContent.trim());
            return pageNum === 1;
          });
          if (page1Item) {
            const clickable = page1Item.closest('.item') || page1Item.parentElement || page1Item;
            clickable.click();
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            // Navigate to target page if needed
            if (currentPageNum > 1) {
              const updatedPagination = document.querySelector('.pagination');
              if (updatedPagination) {
                const updatedPageItems = Array.from(updatedPagination.querySelectorAll('.item')).filter(item => {
                  const text = item.textContent ? item.textContent.trim() : '';
                  return /^\d+$/.test(text) && !item.classList.contains('extreme');
                });
                const targetItem = updatedPageItems.find(item => {
                  const pageNum = parseInt(item.textContent.trim());
                  return pageNum === currentPageNum;
                });
                if (targetItem) {
                  const clickable = targetItem.closest('.item') || targetItem.parentElement || targetItem;
                  clickable.click();
                  await new Promise(resolve => setTimeout(resolve, 1500));
                }
              }
            }
          }
        }
      }
    }
  }
  
  console.log(`Extraction complete: Found ${pools.length} unique pools across all pages`);
  return pools;
}

/**
 * Extract pool data from a single DOM element
 */
function extractPoolFromElement(element) {
  const text = element.textContent.trim();
  if (!text || text.length < 10) {
    return null;
  }

  let name = 'Unknown';
  let poolType = null;
  let feePercentage = null;
  let poolId = null;

  try {
    // Try multiple selectors for pool name
    let nameText = '';
    const nameSelectors = [
      'div.name',
      '[class*="name"]',
      '[class*="pool-name"]',
      '[class*="title"]',
      'div:first-child',
      'span:first-child'
    ];
    
    for (const selector of nameSelectors) {
      const nameElements = element.querySelectorAll(selector);
      if (nameElements.length > 0) {
        nameText = nameElements[0].textContent.trim();
        if (nameText && nameText.length > 2 && nameText.length < 100) {
          break;
        }
      }
    }
    
    // Fallback: extract from first line of text
    if (!nameText || nameText.length < 2) {
      const lines = text.split('\n').filter(l => l.trim().length > 0);
      if (lines.length > 0) {
        nameText = lines[0].trim();
      }
    }
    
    // Extract pool name pattern (e.g., "CL200-WAVAX/BLACK" or "WAVAX/USDC")
    if (nameText) {
      const nameMatch = nameText.match(/((?:vAMM|CL\d+|CL200|CL1|CL50|sAMM)[\s-]*)?([A-Z0-9\.]+(?:\.[a-z]+)?\/[A-Z0-9\.]+(?:\.[a-z]+)?)/i);
      if (nameMatch) {
        name = nameMatch[0].trim();
        if (nameMatch[1]) {
          if (nameMatch[1].includes('vAMM')) {
            poolType = 'vAMM';
          } else if (nameMatch[1].includes('CL200') || nameMatch[1].includes('CL50')) {
            poolType = 'CL200';
          } else if (nameMatch[1].includes('CL1')) {
            poolType = 'CL1';
          }
        }
      } else {
        name = nameText.substring(0, 50); // Use first 50 chars as fallback
      }
    }

    poolId = element.getAttribute('data-pool-id') ||
             element.getAttribute('data-pool-address') ||
             element.getAttribute('data-address') ||
             element.getAttribute('data-id');

    if (!poolId) {
      const idElements = element.querySelectorAll('[data-pool-id], [data-pool-address], [data-address]');
      if (idElements.length > 0) {
        poolId = idElements[0].getAttribute('data-pool-id') ||
                 idElements[0].getAttribute('data-pool-address') ||
                 idElements[0].getAttribute('data-address');
      }
    }

    if (!poolId) {
      const innerHTML = element.innerHTML || '';
      const ethAddressMatch = innerHTML.match(/0x[a-fA-F0-9]{40}/);
      if (ethAddressMatch) {
        poolId = ethAddressMatch[0];
      }
    }

    const gasInfoElements = element.querySelectorAll('div.gas-info div.text');
    if (gasInfoElements.length > 0) {
      feePercentage = gasInfoElements[0].textContent.trim();
    }
  } catch (error) {
    console.warn('Error extracting pool metadata:', error);
  }

  let totalRewards = 0.0;
  let vapr = 0.0;
  let currentVotes = null;

  try {
    // Find the right section - it has class "liquidity-pool-cell-right"
    let rightSection = element.querySelector('div.liquidity-pool-cell-right');
    
    if (!rightSection) {
      // Fallback: try other selectors
      const fallbackSelectors = [
        '[class*="cell-right"]',
        '[class*="pool-cell-right"]'
      ];
      for (const selector of fallbackSelectors) {
        const section = element.querySelector(selector);
        if (section) {
          rightSection = section;
          break;
        }
      }
    }
    
    if (rightSection) {
      // Get all liquidity-pool-cell-data sections (each column)
      const dataSections = rightSection.querySelectorAll('div.liquidity-pool-cell-data');
      
      // Find specific sections by their classes
      let totalRewardsSection = null;
      let vaprSection = null;
      let votesSection = null;
      
      for (const section of dataSections) {
        const classes = section.className || '';
        if (classes.includes('total-rewards')) {
          totalRewardsSection = section;
        } else if (classes.includes('last')) {
          vaprSection = section;
        } else if (classes.includes('end')) {
          votesSection = section;
        }
      }
      
      // Extract VAPR
      if (vaprSection) {
        const firstDiv = vaprSection.querySelector('div.voting-pool-cell-vapr-info div.first');
        if (firstDiv) {
          const vaprMatch = firstDiv.textContent.match(/([\d,]+\.?\d*)\s*%/);
          if (vaprMatch) {
            vapr = parseFloat(vaprMatch[1].replace(/,/g, ''));
          }
        }
      }
      
      // Extract total rewards
      if (totalRewardsSection) {
        const totalData = totalRewardsSection.querySelector('div.voting-pool-data.total');
        if (totalData) {
          const rewardsMatch = totalData.textContent.match(/~?\$([\d,]+\.?\d*)\s*([kKmMbB])?/);
          if (rewardsMatch) {
            let val = parseFloat(rewardsMatch[1].replace(/,/g, ''));
            const suffix = rewardsMatch[2];
            if (suffix) {
              const suffixLower = suffix.toLowerCase();
              if (suffixLower === 'k') val *= 1000;
              else if (suffixLower === 'm' || suffixLower === 'b') val *= 1000000;
            }
            totalRewards = val;
          }
        }
      }
      
      // Extract votes
      if (votesSection) {
        const votesData = votesSection.querySelector('div.voting-pool-data.total');
        if (votesData) {
          const votesMatch = votesData.textContent.match(/([\d,]+\.?\d*)\s*([MmKk])\b/);
          if (votesMatch) {
            let votes = parseFloat(votesMatch[1].replace(/,/g, ''));
            const suffix = votesMatch[2].toLowerCase();
            if (suffix === 'm') votes *= 1000000;
            else if (suffix === 'k') votes *= 1000;
            currentVotes = votes;
          }
        }
      }
    }
    
    // Fallback: Text-based extraction if section-based failed
    const allText = element.textContent || '';
    if (totalRewards === 0.0) {
      const dollarAmounts = allText.matchAll(/~?\$([\d,]+\.?\d*)\s*([kKmMbB])?/g);
      let maxVal = 0;
      for (const match of dollarAmounts) {
        let val = parseFloat(match[1].replace(/,/g, ''));
        const suffix = match[2];
        if (suffix) {
          const suffixLower = suffix.toLowerCase();
          if (suffixLower === 'k') val *= 1000;
          else if (suffixLower === 'm' || suffixLower === 'b') val *= 1000000;
        }
        maxVal = Math.max(maxVal, val);
      }
      totalRewards = maxVal;
    }
    
    if (vapr === 0.0) {
      const percentages = allText.match(/([\d,]+\.?\d*)\s*%/g);
      if (percentages) {
        const vaprValues = percentages.map(p => parseFloat(p.replace(/,/g, '').replace('%', '')))
          .filter(v => v >= 1 && v < 10000);
        if (vaprValues.length > 0) vapr = Math.max(...vaprValues);
      }
    }
    
    if (!currentVotes) {
      const votesMatch = allText.match(/([\d,]+\.?\d*)\s*([MmKk])\b/);
      if (votesMatch) {
        let votes = parseFloat(votesMatch[1].replace(/,/g, ''));
        const suffix = votesMatch[2].toLowerCase();
        if (suffix === 'm') votes *= 1000000;
        else if (suffix === 'k') votes *= 1000;
        currentVotes = votes;
      }
    }
  } catch (error) {
    console.warn('Error extracting pool metrics:', error);
  }

  return new Pool({
    name,
    total_rewards: totalRewards,
    vapr,
    current_votes: currentVotes,
    pool_id: poolId,
    pool_type: poolType,
    fee_percentage: feePercentage
  });
}

/**
 * Try to extract pools from API response (if available)
 */
async function extractPoolsFromAPI() {
  try {
    const response = await fetch('https://resources.blackhole.xyz/cl-pools-list/cl-pools.json', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
        'Accept': 'application/json'
      }
    });

    if (!response.ok) return [];

    const data = await response.json();
    const pools = [];
    const poolsData = data.pools || data.data?.pools || (Array.isArray(data) ? data : []);

    for (const poolData of poolsData) {
      try {
        if (poolData.token0 && poolData.token1) {
          const poolName = `${poolData.token0.symbol}/${poolData.token1.symbol}`;
          const fee = parseInt(poolData.fee || '0');
          let poolType = 'CL200';
          let feePct = `${fee / 10000}%`;
          if (fee === 100) { poolType = 'CL1'; feePct = '0.01%'; } 
          else if (fee === 500) { poolType = 'CL200'; feePct = '0.05%'; } 

          pools.push(new Pool({
            name: poolName,
            total_rewards: parseFloat(poolData.feesUSD || poolData.untrackedFeesUSD || 0),
            vapr: 0.0,
            current_votes: null,
            pool_id: poolData.id,
            pool_type: poolType,
            fee_percentage: feePct
          }));
        }
      } catch (e) {}
    }
    return pools;
  } catch (error) {
    console.warn('Error fetching pools from API:', error);
    return [];
  }
}

/**
 * Hybrid extraction using RPC and API
 */
async function extractPoolsHybrid() {
  console.log('Attempting hybrid extraction (RPC + API)...');
  let apiPools = [];
  
  try {
    // PoolDataProvider is available in the bundle scope
    if (typeof PoolDataProvider !== 'undefined') {
      const provider = new PoolDataProvider();
      apiPools = await provider.getPools();
      if (apiPools && apiPools.length > 0) {
        console.log(`API extraction success: ${apiPools.length} pools`);
      }
    } else {
      console.warn('PoolDataProvider not found in scope');
    }
  } catch (error) {
    console.warn('Hybrid extraction failed:', error);
  }
  
  // Always fetch from DOM to ensure we don't miss pools not in the API (e.g. vAMM/sAMM)
  console.log('Fetching from DOM to supplement/fallback...');
  const domPools = await extractPoolsFromDOM();
  console.log(`DOM extraction: ${domPools.length} pools`);
  
  // Merge lists (prefer API data if available as it has precise weights)
  const poolMap = new Map();
  const domPoolsByName = new Map();
  
  // Add DOM pools first
  for (const p of domPools) {
    const key = p.pool_id ? p.pool_id.toLowerCase() : p.name;
    poolMap.set(key, p);
    if (p.name) {
      domPoolsByName.set(p.name.toLowerCase(), p);
    }
  }
  
  // Add/Override with API pools
  for (const p of apiPools) {
    const key = p.pool_id ? p.pool_id.toLowerCase() : p.name;
    
    let domP = poolMap.get(key);
    
    // Fallback: If not found by ID, try matching by name
    if (!domP && p.name) {
      const apiNameLower = p.name.toLowerCase();
      // Try exact name match
      domP = domPoolsByName.get(apiNameLower);
      
      // Try substring match (e.g. API "XAUt0/WAVAX" matches DOM "CL200-XAUt0/WAVAX")
      if (!domP) {
        for (const [domName, pool] of domPoolsByName.entries()) {
          if (domName.includes(apiNameLower)) {
            domP = pool;
            break;
          }
        }
      }
    }
    
    if (domP) {
      // If pool exists in DOM, merge intelligently
      
      // Use DOM data for rewards/VAPR (API has lifetime fees, DOM has epoch rewards)
      // We set API rewards to 0 in provider, so if DOM has data, use it.
      p.total_rewards = domP.total_rewards;
      p.vapr = domP.vapr > 0 ? domP.vapr : p.vapr;
      
      // Use DOM name if available (often better formatted)
      if (domP.name && domP.name !== 'Unknown') {
        p.name = domP.name;
      }
      
      // Keep other DOM metadata if missing in API
      if (!p.fee_percentage && domP.fee_percentage) p.fee_percentage = domP.fee_percentage;
      if (!p.pool_type && domP.pool_type) p.pool_type = domP.pool_type;
      
      // API provides accurate current_votes (RPC), so we keep p.current_votes
      
      // Remove the original DOM entry if it was stored under a different key (like name)
      const domKey = domP.pool_id ? domP.pool_id.toLowerCase() : domP.name;
      if (domKey !== key) {
        poolMap.delete(domKey);
      }
    }
    
    // Only add if it has rewards (DOM match) or if we want to show it anyway
    // If it's an API pool with 0 rewards and no DOM match, it might be a dead pool
    // But for coverage, we'll add it.
    poolMap.set(key, p);
  }
  
  const mergedPools = Array.from(poolMap.values());
  console.log(`Final merged pool count: ${mergedPools.length}`);
  
  return mergedPools;
}
// --- From static-rewards-loader.js ---
/**
 * Load static rewards map as fallback
 * This provides rewards for pools that don't have DOM data
 */

// Static rewards map (from analysis of multicall responses)
// This is a fallback when DOM extraction or real-time interception doesn't have rewards
const STATIC_REWARDS_MAP = {
  "0x04a954bc8af9a1fdc2ce5f3192bdca369a4512cc": 169.05428592971938,
  "0x0c128cd9ea013c0638b28df7e210e022376bcc38": 22047.912352010124,
  "0x0e5aad7522acf208c5f691d3f20af0c26d1d669a": 17317.85528615543,
  "0x1131d1e669f6652cffe404213bfd0cc6b4676b48": 389940.79738262977,
  "0x14e4a5bed2e5e688ee1a5ca3a4914250d1abd573": 852862.2466530642,
  "0x152e06cce8049f1e42ffd0c0cf842b9ffca6035b": 2091.057460441644,
  "0x15c5133f63c4914d4e151cbf4babfc8f51707477": 26955.537717263433,
  "0x15c79629b9e2508726385b013dd5f550db0d49d9": 186.5984288231345,
  "0x202b3e7af2635bbde922582909df6ebccf244d2a": 75794.43954851283,
  "0x2466f2d17689b734ed988eb0843aa2ac056c5c09": 53742.22098027629,
  "0x2625e03748213f82485061ac17f22d84b5312ec0": 6142.375469146795,
  "0x2eda50d933fcff98ff0bbd9913bae53f71fdd68a": 535.9757716546034,
  "0x3afadc8477fc516dcd05259baee96ec586174ff4": 12151.194840770413,
  "0x3e70ddb1b82c311e49f16deff3b3805c94cdfe26": 56938.35836230534,
  "0x403822e6cfa57d10c32a4e910ed740f9ced8c615": 13739.159884146402,
  "0x409985a488f7b1a79d964398d827b450a33a86a0": 418295.7473737611,
  "0x419b7d20c1dabaa6fb333c07bf0a006bd6bf3600": 152859.16045231026,
  "0x42712c828ccdc5034aeac5f2e1acfb72fcda5b25": 161980.20619363495,
  "0x4a930a63b13e6683a204cb10ef20f68310231459": 11241975.569143604,
  "0x4c33a727e3744009f7413d2d1fbbad77d7df207f": 8694334.887259468,
  "0x4d5df15ff7dde069b2ff175f45c845e168b20cd5": 22161.33636200877,
  "0x4f905251040d1b31cd7eff74ef0c91bbf08022c0": 111623.30887373125,
  "0x5785c26501355206a7a136d50764d6a31816a9da": 218407.342694937,
  "0x59faf1480cb7cd749ee517c2aa7a15a26c0fb9af": 224788.28967990316,
  "0x5a758f607542c8a12aadc29f74dfba5f14df00b3": 13721.68118598134,
  "0x612a0664a2c2b6d0b8e85c291181d9cff0b5dc60": 276479.1725076629,
  "0x624e692595dfa46974179b39b9c23f664e9a23c3": 74183.56526763739,
  "0x6e6be1750b883b324caaeb97cce819a7d025a817": 5580.507249920544,
  "0x737f1cab9cd97c40bbe4d59c85b0d2c1fdbaa37d": 2690.979437982621,
  "0x746472ebffe89b1ce1357f26d3e73fa1d4e3116c": 95729.74040695795,
  "0x758909881a386e30e39490664f85f2247417c0de": 2144857.967039499,
  "0x76eb2c0c8adabc6be513a1f3b6cc9191d017fac7": 4579.719961382134,
  "0x78f5a53731564894a7e4fff827a88e5fbf9cfcb6": 4278.37477619742,
  "0x85bec030b05da25871d2cf82f1e4442e7e044902": 3022952.4755633017,
  "0x8abd9e4ab4132116de3c3531edbb628f1b221e5c": 716425.4213327002,
  "0x8e798638b28d9e677b2c0fa500d93989acf5d717": 84361.4826470168,
  "0x921ca54e1d32008c25b352bb75aa00593288f1b3": 2378.150181699723,
  "0x932dc494e571c4588a7e4927aa1c5cfaaa044491": 12839.691112142482,
  "0x955514594f1b43514156c1c9e7a89cbd4815c172": 99926.72607517657,
  "0xaf7b503b9c1d0c7cacbfc984a91dea1a9f8b8fbf": 7797741.710089478,
  "0xb46af12bbcd6540d63b8580601c0b149b2c6f8f5": 15518.316366840823,
  "0xbbb931e832bf3c789bab467e4a6f6c1551791d3e": 239.37333983523197,
  "0xc2582deaa593bf8ef800ee980609824d412b6cbd": 23404.39052847654,
  "0xc3d792a7b51adeb521cd431ac75831d8c433801a": 23335059.442871414,
  "0xd299699e69adc03fc65e14ec605286758facf1d8": 3380.8655545629254,
  "0xe89550d1986afd3ea82f9193a24bf5198f77f111": 1960984.558367595,
  "0xedcfa2d80cf06fb7642e956a1e95dbc37c75995b": 42503.84997948438,
  "0xef94b376b0e9cb81287be8114a3c4e81aafa47a5": 91325.04640188717,
  "0xf2b0f7482685d5cf1f40a3de4abfa2665052fa14": 52436767.89768887,
  "0xfcbdd05f764702ec1cb56c6324a45d6472b51f74": 815688.3581432106,
  "0xfff3a856e0f9644e360e4dfc99550b56238084f0": 15233.032941791034,
};

function getStaticReward(poolAddress) {
  const key = poolAddress.toLowerCase();
  return STATIC_REWARDS_MAP[key] || 0;
}

function applyStaticRewards(pools) {
  let updated = 0;
  for (const pool of pools) {
    if (pool.pool_id && pool.total_rewards === 0) {
      const reward = getStaticReward(pool.pool_id);
      if (reward > 0) {
        pool.total_rewards = reward;
        updated++;
      }
    }
  }
  return updated;
}

// --- From multicall-decoder.js ---
/**
 * Improved Multicall3 Response Decoder
 * Properly decodes aggregate() return data to match function calls to return values
 * 
 * Structure:
 *   aggregate((address,bytes)[]) returns (uint256 blockNumber, (bool success, bytes returnData)[])
 */

const MULTICALL3_ADDRESS = '0xca11bde05977b3631167028862be2a173976ca11';

/**
 * Decode Multicall3 aggregate() request
 * @param {string} requestHex - The hex calldata
 * @returns {Array<{target: string, selector: string, args: string}>}
 */
function decodeMulticallRequest(requestHex) {
  if (!requestHex || !requestHex.startsWith(AGGREGATE_SELECTOR)) {
    return [];
  }

  // Remove selector
  let hexData = requestHex.slice(10); // Remove "0x82ad56cb"
  if (hexData.startsWith('0x')) {
    hexData = hexData.slice(2);
  }
  hexData = hexData.toLowerCase();

  try {
    // Array encoding: offset (32 bytes) + length (32 bytes) + data
    const offset = parseInt(hexData.slice(0, 64), 16);
    const arrayStart = offset * 2; // offset is in bytes, hexData is in hex chars

    if (arrayStart >= hexData.length) {
      return [];
    }

    const length = parseInt(hexData.slice(arrayStart, arrayStart + 64), 16);
    const calls = [];
    let dataPos = arrayStart + 64;

    for (let i = 0; i < length; i++) {
      if (dataPos >= hexData.length) break;

      // Each tuple: (address, bytes)
      // Address is 32 bytes (right-aligned, last 20 bytes are the address)
      const addrHex = hexData.slice(dataPos, dataPos + 64);
      const target = '0x' + addrHex.slice(-40);
      dataPos += 64;

      // Bytes offset (points to where bytes data is stored)
      const bytesOffset = parseInt(hexData.slice(dataPos, dataPos + 64), 16);
      dataPos += 64;

      // Bytes data is stored at: offset + bytesOffset
      const bytesDataStart = (offset + bytesOffset) * 2;
      if (bytesDataStart >= hexData.length) break;

      // Get bytes length
      const bytesLength = parseInt(hexData.slice(bytesDataStart, bytesDataStart + 64), 16);
      const bytesDataPos = bytesDataStart + 64;

      // Round up to 32-byte boundary
      const paddedLength = Math.ceil(bytesLength / 32) * 32;
      if (bytesDataPos + (paddedLength * 2) > hexData.length) break;

      // Get bytes data
      const bytesDataHex = hexData.slice(bytesDataPos, bytesDataPos + (bytesLength * 2));
      const bytesData = '0x' + bytesDataHex;

      // Extract selector (first 4 bytes = 8 hex chars)
      const selector = bytesData.slice(0, 10);
      const args = bytesData.slice(10);

      calls.push({
        index: i,
        target,
        selector,
        args,
        calldata: bytesData,
      });
    }

    return calls;
  } catch (e) {
    console.warn('Error decoding multicall request:', e);
    return [];
  }
}

/**
 * Decode Multicall3 aggregate() response
 * @param {string} responseHex - The hex response
 * @returns {{blockNumber: number, returns: Array<{success: boolean, returnData: string}>}}
 */
function decodeMulticallResponse(responseHex) {
  if (!responseHex || responseHex === '0x') {
    return { blockNumber: 0, returns: [] };
  }

  let hexData = responseHex;
  if (hexData.startsWith('0x')) {
    hexData = hexData.slice(2);
  }
  hexData = hexData.toLowerCase();

  if (hexData.length < 64) {
    return { blockNumber: 0, returns: [] };
  }

  try {
    // Structure: (uint256 blockNumber, (bool success, bytes returnData)[])
    // First 32 bytes: offset to blockNumber
    const blockOffset = parseInt(hexData.slice(0, 64), 16);
    const blockPos = blockOffset * 2;
    const blockNumber = parseInt(hexData.slice(blockPos, blockPos + 64), 16);

    // Next 32 bytes: offset to returnData array
    const returnsOffset = parseInt(hexData.slice(64, 128), 16);
    const returnsArrayStart = returnsOffset * 2;

    if (returnsArrayStart >= hexData.length) {
      return { blockNumber, returns: [] };
    }

    // Get array length
    const returnsLength = parseInt(hexData.slice(returnsArrayStart, returnsArrayStart + 64), 16);
    const returns = [];
    let dataPos = returnsArrayStart + 64;

    for (let i = 0; i < returnsLength; i++) {
      if (dataPos >= hexData.length) break;

      // Each element is a tuple: (bool success, bytes returnData)
      // Get offset to this tuple
      const tupleOffset = parseInt(hexData.slice(dataPos, dataPos + 64), 16);
      const tupleStart = (returnsOffset + tupleOffset) * 2;
      dataPos += 64;

      if (tupleStart >= hexData.length) break;

      // Decode tuple: (bool, bytes)
      // Bool is 32 bytes (padded)
      const successHex = hexData.slice(tupleStart, tupleStart + 64);
      const success = parseInt(successHex, 16) !== 0;

      // Bytes: offset (32 bytes) + length (32 bytes) + data
      const bytesOffset = parseInt(hexData.slice(tupleStart + 64, tupleStart + 128), 16);
      const bytesDataStart = tupleStart + (bytesOffset * 2);

      if (bytesDataStart >= hexData.length) {
        returns.push({ success, returnData: '0x' });
        continue;
      }

      // Get length
      const bytesLength = parseInt(hexData.slice(bytesDataStart, bytesDataStart + 64), 16);
      const bytesDataPos = bytesDataStart + 64;

      // Get data (padded to 32-byte boundary)
      const paddedLength = Math.ceil(bytesLength / 32) * 32;
      if (bytesDataPos + (paddedLength * 2) > hexData.length) {
        returns.push({ success, returnData: '0x' });
        continue;
      }

      const bytesDataHex = hexData.slice(bytesDataPos, bytesDataPos + (bytesLength * 2));
      const returnData = '0x' + bytesDataHex;

      returns.push({ success, returnData });
    }

    return { blockNumber, returns };
  } catch (e) {
    console.warn('Error decoding multicall response:', e);
    return { blockNumber: 0, returns: [] };
  }
}

/**
 * Decode function return value based on selector
 * @param {string} returnData - The hex return data
 * @param {string} selector - The function selector
 * @returns {any} Decoded value
 */
function decodeFunctionReturn(returnData, selector) {
  if (!returnData || returnData === '0x') {
    return null;
  }

  const funcSig = KNOWN_SELECTORS[selector];
  if (!funcSig) {
    return null;
  }

  try {
    let hexData = returnData;
    if (hexData.startsWith('0x')) {
      hexData = hexData.slice(2);
    }

    if (funcSig === 'weights(address)') {
      // Returns uint256
      const value = BigInt('0x' + hexData.slice(0, 64));
      return Number(value) / 1e18;
    } else if (funcSig === 'getGauge(address)') {
      // Returns address
      const addr = '0x' + hexData.slice(-40);
      if (addr === '0x' + '0'.repeat(40)) {
        return null;
      }
      return addr;
    } else if (funcSig === 'token0()' || funcSig === 'token1()') {
      // Returns address
      const addr = '0x' + hexData.slice(-40);
      if (addr === '0x' + '0'.repeat(40)) {
        return null;
      }
      return addr;
    } else if (funcSig === 'fee()') {
      // Returns uint24 (padded to uint256)
      return parseInt(hexData.slice(0, 64), 16);
    } else if (funcSig === 'liquidity()' || funcSig === 'totalSupply()') {
      // Returns uint256
      const value = BigInt('0x' + hexData.slice(0, 64));
      return Number(value) / 1e18;
    } else if (funcSig === 'tokens_per_week(uint256)') {
      // Returns uint256
      const value = BigInt('0x' + hexData.slice(0, 64));
      return Number(value) / 1e18;
    } else {
      // Unknown function, return raw hex
      return returnData;
    }
  } catch (e) {
    console.warn(`Error decoding function return for ${funcSig}:`, e);
    return null;
  }
}

/**
 * Match function calls to their return values
 * @param {Array} requests - Decoded requests
 * @param {Array} returns - Decoded returns
 * @returns {Array<Object>} Matched calls with their return values
 */
function matchCallsToReturns(requests, returns) {
  const matched = [];

  for (let i = 0; i < Math.min(requests.length, returns.length); i++) {
    const req = requests[i];
    const ret = returns[i];

    const funcName = KNOWN_SELECTORS[req.selector] || `unknown(${req.selector})`;
    let decodedValue = null;

    if (ret.success && ret.returnData) {
      decodedValue = decodeFunctionReturn(ret.returnData, req.selector);
    }

    matched.push({
      index: i,
      target: req.target,
      selector: req.selector,
      function: funcName,
      args: req.args,
      success: ret.success,
      returnData: ret.returnData,
      decodedValue,
    });
  }

  return matched;
}

/**
 * Extract rewards from decoded multicall data
 * Looks for large uint256 values that could be rewards
 * @param {Array} matched - Matched calls from matchCallsToReturns
 * @param {Set<string>} knownPools - Set of known pool addresses (lowercase, no 0x)
 * @returns {Object} Map of pool address to reward value
 */
function extractRewardsFromDecoded(matched, knownPools) {
  const rewards = {};

  for (const call of matched) {
    // Check if this call is for a known pool
    const targetLower = call.target.toLowerCase();
    const poolKey = targetLower.slice(2); // Remove 0x

    if (!knownPools.has(poolKey)) {
      continue;
    }

    // Check if return value is a large number (could be reward)
    if (call.decodedValue !== null && typeof call.decodedValue === 'number') {
      const value = call.decodedValue;
      // Filter for reasonable reward range (100 to 100M USD)
      if (value > 100 && value < 100000000) {
        const poolAddr = targetLower;
        if (!rewards[poolAddr] || value > rewards[poolAddr]) {
          rewards[poolAddr] = value;
        }
      }
    }

    // Also check raw return data for large values
    if (call.returnData && call.returnData !== '0x' && call.returnData.length >= 66) {
      try {
        const hexData = call.returnData.slice(2);
        const value = BigInt('0x' + hexData.slice(0, 64));
        const usdValue = Number(value) / 1e18;

        if (usdValue > 100 && usdValue < 100000000) {
          const poolAddr = targetLower;
          if (!rewards[poolAddr] || usdValue > rewards[poolAddr]) {
            rewards[poolAddr] = usdValue;
          }
        }
      } catch (e) {
        // Not a valid number
      }
    }
  }

  return rewards;
}

// Now include the main content script logic
console.log('Blackhole DEX Tools: Content script loaded');

let settings = {
  votingPower: null,
  topN: 10,
  minRewards: null,
  maxPoolPercentage: null,
  sortBy: 'auto',
  hideVamm: false,
  enableOverlay: true
};

// Forward API discovery logs to extension
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  
  if (event.data && event.data.type === 'NETWORK_REQUEST') {
    try {
      chrome.runtime.sendMessage(event.data);
    } catch (e) {
      // Extension context might be invalidated
    }
  }
});

// Load settings with error handling
try {
  if (chrome.runtime && chrome.runtime.id) {
    chrome.storage.local.get(['blackholeSettings'], (result) => {
      if (result && result.blackholeSettings) {
        settings = { ...settings, ...result.blackholeSettings };
      }
      init();
    });
  } else {
    console.warn('Extension context not available, using default settings');
    init();
  }
} catch (error) {
  console.warn('Error loading settings:', error);
  init();
}

// Set up storage change listener with error handling
try {
  if (chrome.runtime && chrome.runtime.id) {
    chrome.storage.onChanged.addListener((changes) => {
      try {
        if (changes.blackholeSettings) {
          settings = { ...settings, ...changes.blackholeSettings.newValue };
          updateOverlay();
        }
      } catch (error) {
        console.warn('Error handling storage change:', error);
      }
    });
  }
} catch (error) {
  console.warn('Error setting up storage listener:', error);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SETTINGS_UPDATED') {
    safeStorageGet(['blackholeSettings']).then((result) => {
      if (result && result.blackholeSettings) {
        settings = { ...settings, ...result.blackholeSettings };
        // Update overlay visibility based on enableOverlay setting
        let overlay = document.getElementById('blackhole-tools-overlay');
        if (!overlay) {
          overlay = injectOverlay();
        }
        overlay.style.display = settings.enableOverlay ? 'block' : 'none';
        // Always update overlay content (even if hidden) so it's ready when shown
        updateOverlay();
      }
      sendResponse({ success: true });
    }).catch((error) => {
      console.warn('Error loading settings:', error);
      sendResponse({ success: false, error: error.message });
    });
  } else if (message.type === 'REFRESH_POOL_DATA') {
    // Reset retry counter
    window._poolExtractionRetries = 0;
    fetchPoolData(true).then(() => {
      sendResponse({ success: true });
    }).catch(() => {
      sendResponse({ success: false });
    });
  } else if (message.type === 'GET_SELECTED_POOLS') {
    getSelectedPools().then(selectedPools => {
      sendResponse({ success: true, selectedPools: selectedPools.map(p => ({ poolId: p.poolId })) });
    }).catch(err => {
      console.error('Error getting selected pools:', err);
      sendResponse({ success: false, error: err.message });
    });
    return true; // Keep channel open for async response
  } else if (message.type === 'SHOW_OVERLAY') {
    // Show overlay if hidden
    let overlay = document.getElementById('blackhole-tools-overlay');
    if (!overlay) {
      overlay = injectOverlay();
    }
    overlay.style.display = 'block';
    // Update enableOverlay setting to true
    settings.enableOverlay = true;
    safeStorageSet({ 
      overlayVisible: true,
      blackholeSettings: settings
    }).catch((error) => {
      console.warn('Error saving settings:', error);
    });
    updateOverlay();
    sendResponse({ success: true });
  } else if (message.type === 'TOGGLE_OVERLAY') {
    // Toggle overlay visibility
    let overlay = document.getElementById('blackhole-tools-overlay');
    if (!overlay) {
      overlay = injectOverlay();
    }
    const isVisible = overlay.style.display !== 'none' && overlay.offsetParent !== null;
    overlay.style.display = isVisible ? 'none' : 'block';
    settings.enableOverlay = !isVisible;
    safeStorageSet({ 
      overlayVisible: !isVisible,
      blackholeSettings: settings
    }).catch((error) => {
      console.warn('Error saving settings:', error);
    });
    if (!isVisible) {
      updateOverlay();
    }
    sendResponse({ success: true });
  } else if (message.type === 'SELECT_POOL') {
    selectSinglePool(message.poolId).then(() => {
      sendResponse({ success: true });
    });
  } else if (message.type === 'SELECT_POOLS') {
    const poolIds = message.poolIds || [];
    // Process sequentially to avoid UI conflicts
    (async () => {
      for (const id of poolIds) {
        await selectSinglePool(id);
        await new Promise(r => setTimeout(r, 100));
      }
      updateOverlay();
      sendResponse({ success: true });
    })();
  } else if (message.type === 'CLEAR_ALL_VOTES') {
    clearAllSelectedPools().then((count) => {
      updateOverlay();
      sendResponse({ success: true, count });
    });
  } else if (message.type === 'SPLIT_VOTES') {
    splitVotesEvenly().then(() => {
      updateOverlay();
      sendResponse({ success: true });
    });
  } else if (message.type === 'TOGGLE_VOTE_PANEL') {
    toggleVotePanel().then((isOpen) => {
      sendResponse({ success: true, isOpen });
    }).catch((e) => {
      sendResponse({ success: false, error: e.message });
    });
  } else if (message.type === 'CHECK_VOTE_PANEL') {
    const modal = document.querySelector('.voting-modal, .sc-modal-overlay.show');
    const isOpen = !!(modal && (modal.offsetParent !== null || window.getComputedStyle(modal).display !== 'none'));
    sendResponse({ success: true, isOpen });
  }
  return true;
});

// Global rewards provider for early multicall interception
let globalRewardsProvider = null;

function injectApiDiscovery() {
  try {
    console.log('Blackhole DEX Tools: Injecting API discovery...');
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('lib/api-discovery.js');
    (document.head || document.documentElement).appendChild(script);
    script.onload = () => script.remove();
    
    // Set up multicall interception EARLY, before page loads
    // This allows us to capture rewards from the site's initial multicall requests
    if (typeof PoolDataProvider !== 'undefined' && typeof interceptMulticallResponses === 'function') {
      try {
        const provider = new PoolDataProvider();
        globalRewardsProvider = provider.getRewardsProvider();
        if (globalRewardsProvider) {
          interceptMulticallResponses(globalRewardsProvider);
          console.log('✓ Multicall interception enabled - capturing rewards from network requests');
        }
      } catch (e) {
        console.warn('Failed to set up multicall interception:', e);
      }
    }
  } catch (error) {
    console.warn('Blackhole DEX Tools: Failed to inject API discovery script:', error);
  }
}

function init() {
  console.log('Blackhole DEX Tools: Initializing...');
  
  // Inject discovery tool into page context
  injectApiDiscovery();
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setupExtension();
    });
  } else {
    setupExtension();
  }
}

function setupExtension() {
  setTimeout(() => {
    fetchPoolData();
    observePoolList();
    
    // Always inject overlay (visibility controlled by enableOverlay setting)
    injectOverlay();
  }, 3000);
}

let isFetchingPoolData = false;
let lastFetchTime = 0;
const FETCH_COOLDOWN = 5000; // Don't fetch more than once every 5 seconds

async function fetchPoolData(forceRefresh = false) {
  // Prevent concurrent fetches
  if (isFetchingPoolData) {
    console.log('Pool data fetch already in progress, skipping...');
    return;
  }
  
  // Rate limiting - don't fetch too frequently
  const now = Date.now();
  if (!forceRefresh && (now - lastFetchTime) < FETCH_COOLDOWN) {
    console.log('Pool data fetch cooldown active, skipping...');
    return;
  }
  
  isFetchingPoolData = true;
  lastFetchTime = now;
  
  try {
    console.log('Fetching pool data...');
    let pools = [];
    
    // Wait a bit more for React to fully render
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    try {
      // Use hybrid extraction (RPC/API -> DOM fallback)
      if (typeof extractPoolsHybrid === 'function') {
        pools = await extractPoolsHybrid();
      } else {
        pools = await extractPoolsFromDOM();
      }
      console.log(`Extracted ${pools.length} pools`);
      
      // Debug: log first pool to see what we're getting (only once)
      if (pools.length > 0 && !window._loggedSamplePool) {
        // Also log the raw text and slot structure to see what we're parsing
        const firstElement = document.querySelector('div.liquidity-pool-cell.even, div.liquidity-pool-cell.odd');
        const rawText = firstElement ? firstElement.textContent : 'N/A';
        
        // Log slot structure
        if (firstElement) {
          const rightSection = firstElement.querySelector('div.liquidity-pool-cell-right');
          if (rightSection) {
            const slots = rightSection.querySelectorAll('div.voting-pool-cell-slot');
            console.log(`Slot structure: ${slots.length} slots found`);
            for (let i = 0; i < Math.min(slots.length, 9); i++) {
              const slotText = slots[i].textContent.trim();
              console.log(`  Slot ${i}: "${slotText.substring(0, 100)}"`);
            }
          }
        }
        
        console.log('Sample pool data:', {
          name: pools[0].name,
          total_rewards: pools[0].total_rewards,
          vapr: pools[0].vapr,
          current_votes: pools[0].current_votes,
          pool_id: pools[0].pool_id
        });
        
        // Show raw text snippet for debugging
        const textSnippet = rawText.substring(0, 500);
        console.log('Raw text snippet (first 500 chars):', textSnippet);
        
        // Check for specific known pools and compare
        if (pools[0].name.includes('WETH.e/WAVAX')) {
          console.warn('⚠️ CL200-WETH.e/WAVAX extraction check:');
          console.warn(`  Expected: rewards ~$39.34K (39340), VAPR 216.5%, votes 11.09M (11090000)`);
          console.warn(`  Got: rewards $${pools[0].total_rewards}, VAPR ${pools[0].vapr}%, votes ${pools[0].current_votes}`);
        }
        
        // Check if votes look suspiciously low (might be missing k/M suffix)
        if (pools[0].current_votes && pools[0].current_votes < 100000) {
          console.warn(`⚠️ Warning: Pool "${pools[0].name}" has suspiciously low votes (${pools[0].current_votes}). Expected values in thousands/millions.`);
          console.warn('Looking for vote patterns in raw text...');
          const votePatterns = rawText.match(/([\d,]+\.?\d*)\s*([MmKk])\b/g);
          if (votePatterns) {
            console.warn('Found potential vote patterns:', votePatterns);
          }
        }
        
        // Check if VAPR looks wrong (picking up fee percentage)
        if (pools[0].vapr && pools[0].vapr < 1 && pools[0].vapr > 0) {
          console.warn(`⚠️ Warning: Pool "${pools[0].name}" has very low VAPR (${pools[0].vapr}%). Might be picking up fee percentage instead.`);
          console.warn('Looking for VAPR patterns in raw text...');
          const vaprPatterns = rawText.match(/([\d,]+\.?\d*)\s*%/g);
          if (vaprPatterns) {
            console.warn('Found percentage patterns:', vaprPatterns);
            const pctValues = vaprPatterns.map(p => parseFloat(p.replace('%', '').replace(/,/g, '')));
            const largePcts = pctValues.filter(v => v > 50);
            if (largePcts.length > 0) {
              console.warn(`  Large percentages found (likely VAPR): ${largePcts.join(', ')}`);
            }
          }
        }
        
        window._loggedSamplePool = true;
      }
    } catch (error) {
      console.warn('Error extracting from DOM:', error);
      // Don't log stack trace repeatedly
      if (!window._loggedExtractionError) {
        console.error('Extraction error details:', error.stack);
        window._loggedExtractionError = true;
      }
    }
    
    if (pools.length === 0) {
      console.warn('No pools extracted. Page may not be fully loaded. Retrying...');
      // Retry after a delay (max 3 retries)
      if (!window._poolExtractionRetries) {
        window._poolExtractionRetries = 0;
      }
      window._poolExtractionRetries++;
      if (window._poolExtractionRetries < 3) {
        isFetchingPoolData = false; // Allow retry
        setTimeout(() => fetchPoolData(forceRefresh), 3000);
        return;
      } else {
        console.error('Failed to extract pools after 3 retries. Check page structure.');
        // Show error in overlay if it exists
        const contentEl = document.getElementById('blackhole-tools-content');
        if (contentEl) {
          contentEl.innerHTML = '<p style="color: #ff8c00;">Failed to extract pool data. Try refreshing the page.</p>';
        }
        isFetchingPoolData = false;
        return;
      }
    }
    
    // Reset retry counter on success
    window._poolExtractionRetries = 0;
    
    chrome.storage.local.set({ 
      poolData: pools.map(p => ({
        name: p.name,
        total_rewards: p.total_rewards,
        vapr: p.vapr,
        current_votes: p.current_votes,
        pool_id: p.pool_id,
        pool_type: p.pool_type,
        fee_percentage: p.fee_percentage
      })),
      poolDataTimestamp: Date.now()
    });
    
    // Always update overlay (even if hidden) so it's ready when shown
    // The overlay visibility is controlled by enableOverlay setting
    updateOverlay();
  } catch (error) {
    console.error('Error fetching pool data:', error);
  } finally {
    isFetchingPoolData = false;
  }
}

let poolObserver = null;
let updateOverlayTimer = null;

function observePoolList() {
  // Don't create multiple observers
  if (poolObserver) {
    return;
  }
  
  // Watch for changes to the pool list container with debouncing
  poolObserver = new MutationObserver(() => {
    // Debounce updates to prevent infinite loops
    if (updateOverlayTimer) {
      clearTimeout(updateOverlayTimer);
    }
    updateOverlayTimer = setTimeout(() => {
      // Always update overlay (even if hidden) so it's ready when shown
      updateOverlay();
    }, 2000); // Wait 2 seconds after last change
  });
  
  const checkForPoolContainer = setInterval(() => {
    const poolContainer = document.querySelector('[data-pool-list]') || 
                         document.querySelector('.pool-list') ||
                         document.body;
    if (poolContainer) {
      poolObserver.observe(poolContainer, {
        childList: true,
        subtree: true
      });
      clearInterval(checkForPoolContainer);
      console.log('Blackhole DEX Tools: Pool observer started');
    }
  }, 1000);
  
  setTimeout(() => clearInterval(checkForPoolContainer), 10000);
}

function injectOverlay() {
  // Check if overlay already exists
  let overlay = document.getElementById('blackhole-tools-overlay');
  if (overlay) {
    // Overlay exists, just update it
    updateOverlay();
    return overlay;
  }
  
  overlay = document.createElement('div');
  overlay.id = 'blackhole-tools-overlay';
  // Set default visibility to block (will be adjusted by settings)
  overlay.style.display = 'block';
  overlay.innerHTML = `
    <div class="blackhole-tools-panel">
      <div class="blackhole-tools-header">
        <h3>Pool Recommendations</h3>
        <div class="blackhole-tools-header-actions">
          <button class="blackhole-tools-select-all" id="blackhole-tools-select-all" title="Select all recommended pools">Select All</button>
          <button class="blackhole-tools-clear-all" id="blackhole-tools-clear-all" title="Clear all selected pools">Clear All</button>
          <button class="blackhole-tools-split-votes" id="blackhole-tools-split-votes" title="Split votes evenly across selected pools">Split Votes</button>
          <button class="blackhole-tools-close" id="blackhole-tools-close" title="Hide panel">×</button>
        </div>
      </div>
      <div class="blackhole-tools-content" id="blackhole-tools-content">
        <p>Loading recommendations...</p>
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  console.log('Blackhole DEX Tools: Overlay injected');
  console.log('Overlay element created:', overlay);
  console.log('Overlay initial display:', overlay.style.display);
  console.log('Overlay in DOM:', document.body.contains(overlay));
  
  // Load saved position or use default
  safeStorageGet(['blackholeOverlayPosition']).then((result) => {
    if (result && result.blackholeOverlayPosition && result.blackholeOverlayPosition.top && result.blackholeOverlayPosition.left) {
      const savedTop = parseFloat(result.blackholeOverlayPosition.top);
      const savedLeft = parseFloat(result.blackholeOverlayPosition.left);
      
      // Validate position is within viewport
      const overlayWidth = 460; // Match CSS width
      const overlayHeight = 400; // Approximate height
      const maxLeft = window.innerWidth - overlayWidth;
      const maxTop = window.innerHeight - overlayHeight;
      
      // Only use saved position if it's within reasonable bounds
      if (savedLeft >= 0 && savedLeft <= maxLeft && savedTop >= 0 && savedTop <= maxTop) {
        overlay.style.setProperty('top', result.blackholeOverlayPosition.top, 'important');
        overlay.style.setProperty('left', result.blackholeOverlayPosition.left, 'important');
        overlay.style.setProperty('right', 'auto', 'important');
        console.log('Loaded saved overlay position:', savedLeft, savedTop);
      } else {
        console.warn('Saved overlay position is off-screen, using default:', { savedLeft, savedTop, maxLeft, maxTop, viewport: { width: window.innerWidth, height: window.innerHeight } });
        // Use default position
        overlay.style.setProperty('top', '20px', 'important');
        overlay.style.setProperty('left', 'auto', 'important');
        overlay.style.setProperty('right', '40px', 'important');
      }
    } else {
      // No saved position, use default
      overlay.style.setProperty('top', '20px', 'important');
      overlay.style.setProperty('left', 'auto', 'important');
      overlay.style.setProperty('right', '40px', 'important');
      console.log('Using default overlay position');
    }
  }).catch((error) => {
    console.warn('Error loading overlay position:', error);
    // Use default position on error
    overlay.style.setProperty('top', '20px', 'important');
    overlay.style.setProperty('left', 'auto', 'important');
    overlay.style.setProperty('right', '40px', 'important');
  });
  
  // Make header draggable
  const header = overlay.querySelector('.blackhole-tools-header');
  const headerActions = header.querySelector('.blackhole-tools-header-actions');
  let isDragging = false;
  let dragOffset = { x: 0, y: 0 };
  
  header.addEventListener('mousedown', (e) => {
    // Don't start drag if clicking on buttons or the actions container
    if (e.target.closest('button') || e.target === headerActions || headerActions.contains(e.target)) {
      return;
    }
    
    isDragging = true;
    const rect = overlay.getBoundingClientRect();
    
    // Calculate offset from mouse to overlay top-left corner
    dragOffset.x = e.clientX - rect.left;
    dragOffset.y = e.clientY - rect.top;
    
    // Switch to left/top positioning for dragging
    // Always set both left and top as inline styles for reliable dragging
    // Use setProperty to override !important rules
    overlay.style.setProperty('left', rect.left + 'px', 'important');
    overlay.style.setProperty('top', rect.top + 'px', 'important');
    overlay.style.setProperty('right', 'auto', 'important');
    overlay.style.setProperty('bottom', 'auto', 'important');
    
    overlay.style.transition = 'none'; // Disable transitions during drag
    e.preventDefault();
    
    console.log('Drag start:', { 
      mouseX: e.clientX, 
      mouseY: e.clientY, 
      rectLeft: rect.left, 
      rectTop: rect.top,
      dragOffsetX: dragOffset.x,
      dragOffsetY: dragOffset.y
    });
  });
  
  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    
    let newLeft = e.clientX - dragOffset.x;
    let newTop = e.clientY - dragOffset.y;
    
    // Constrain to viewport
    const rect = overlay.getBoundingClientRect();
    const maxLeft = window.innerWidth - rect.width;
    const maxTop = window.innerHeight - rect.height;
    
    newLeft = Math.max(0, Math.min(newLeft, maxLeft));
    newTop = Math.max(0, Math.min(newTop, maxTop));
    
    // Force update both positions using setProperty to override !important
    overlay.style.setProperty('left', newLeft + 'px', 'important');
    overlay.style.setProperty('top', newTop + 'px', 'important');
    overlay.style.setProperty('right', 'auto', 'important');
    overlay.style.setProperty('bottom', 'auto', 'important');
  });
  
  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      overlay.style.transition = ''; // Re-enable transitions
      // Save position
      const position = {
        top: overlay.style.top,
        left: overlay.style.left
      };
      safeStorageSet({ blackholeOverlayPosition: position }).catch((error) => {
        console.warn('Error saving overlay position:', error);
      });
    }
  });
  
  // Close button - hide overlay and update setting
  document.getElementById('blackhole-tools-close').addEventListener('click', (e) => {
    e.stopPropagation();
    overlay.style.display = 'none';
    settings.enableOverlay = false;
    safeStorageSet({ 
      overlayVisible: false,
      blackholeSettings: settings
    }).catch((error) => {
      console.warn('Error saving settings:', error);
    });
  });
  
  // Select all button
  document.getElementById('blackhole-tools-select-all').addEventListener('click', async (e) => {
    e.stopPropagation();
    await selectRecommendedPools();
    // Refresh overlay to show updated selection state
    setTimeout(() => updateOverlay(), 500);
  });
  
  // Clear all votes button
  document.getElementById('blackhole-tools-clear-all').addEventListener('click', async (e) => {
    e.stopPropagation();
    const clearedCount = await clearAllSelectedPools();
    
    // Show brief feedback
    const contentEl = document.getElementById('blackhole-tools-content');
    if (contentEl && clearedCount > 0) {
      const originalHTML = contentEl.innerHTML;
      contentEl.innerHTML = `<p style="color: #32cd32; text-align: center; padding: 20px;">✓ Cleared ${clearedCount} selected pool(s)</p>`;
      setTimeout(() => {
        updateOverlay();
      }, 1000);
    } else if (clearedCount === 0) {
      const originalHTML = contentEl.innerHTML;
      contentEl.innerHTML = `<p style="color: #999; text-align: center; padding: 20px;">No pools were selected</p>`;
      setTimeout(() => {
        updateOverlay();
      }, 1000);
    }
  });
  
  // Split votes evenly button
  document.getElementById('blackhole-tools-split-votes').addEventListener('click', async (e) => {
    e.stopPropagation();
    await splitVotesEvenly();
  });
  
  // Load visibility state from enableOverlay setting
  safeStorageGet(['blackholeSettings']).then((result) => {
    const enableOverlay = result && result.blackholeSettings && result.blackholeSettings.enableOverlay !== false; // Default to true
    console.log('Overlay visibility setting:', enableOverlay, 'from settings:', result?.blackholeSettings);
    overlay.style.display = enableOverlay ? 'block' : 'none';
    console.log('Overlay display set to:', overlay.style.display);
    if (enableOverlay) {
      updateOverlay();
    }
  }).catch((error) => {
    console.warn('Error loading overlay visibility:', error);
    // Default to showing overlay if we can't load settings
    overlay.style.display = 'block';
    console.log('Overlay display set to block (default due to error)');
    updateOverlay();
  });
  
  // Also check computed style and position to debug
  setTimeout(() => {
    const computedStyle = window.getComputedStyle(overlay);
    const rect = overlay.getBoundingClientRect();
    console.log('Overlay computed display:', computedStyle.display, 'visibility:', computedStyle.visibility, 'opacity:', computedStyle.opacity);
    console.log('Overlay position:', { 
      top: computedStyle.top, 
      left: computedStyle.left, 
      right: computedStyle.right,
      boundingRect: { top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
      viewport: { width: window.innerWidth, height: window.innerHeight }
    });
    console.log('Overlay element:', overlay);
    console.log('Overlay in DOM:', document.body.contains(overlay));
    console.log('Overlay offsetParent:', overlay.offsetParent);
  }, 500);
  
  return overlay;
}

// Note: Toggle button removed - overlay visibility is now controlled via extension popup

// Select recommended pools for voting
async function selectRecommendedPools() {
  return new Promise(async (resolve) => {
    try {
      const result = await safeStorageGet(['poolData', 'blackholeSettings']);
      const poolData = result.poolData || [];
      const settings = result.blackholeSettings || {};
      
      if (poolData.length === 0) {
        alert('No pool data available. Please refresh the page and wait for pools to load.');
        resolve();
        return;
      }
    
      const pools = poolData.map(data => new Pool(data));
    const userVotingPower = (settings.votingPower !== null && settings.votingPower !== undefined) 
      ? settings.votingPower 
      : null;
    
    const recommendations = recommendPools(pools, {
      topN: settings.topN || 10,
      userVotingPower: userVotingPower,
      hideVamm: settings.hideVamm,
      minRewards: settings.minRewards,
      maxPoolPercentage: settings.maxPoolPercentage,
      sortBy: settings.sortBy || 'auto'
    });
    
    if (recommendations.length === 0) {
      alert('No pools to select. Check your filters.');
      return;
    }
    
    const poolAddresses = recommendations
      .map(p => p.pool_id)
      .filter(id => id && id.startsWith('0x'));
    
    if (poolAddresses.length === 0) {
      alert('No pool addresses found. Cannot select pools automatically.');
      return;
    }
    
    console.log('Selecting pools:', poolAddresses);
    
    // First, clear all previously selected pools (if any)
    const clearedCount = await clearAllSelectedPools();
    if (clearedCount > 0) {
      // Wait a bit for the page to update after clearing
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Track which pools still need to be selected
    const poolsToSelect = new Set(poolAddresses);
    let selectedCount = 0;
    
    // Helper function to select pools on the current page
    async function selectPoolsOnCurrentPage() {
      const poolCells = document.querySelectorAll('div.liquidity-pool-cell');
      let foundOnThisPage = 0;
      
      for (const address of Array.from(poolsToSelect)) {
        let found = false;
        
        for (let cell of poolCells) {
          const innerHTML = cell.innerHTML || '';
          const innerText = cell.innerText || '';
          
          if (innerHTML.includes(address) || innerText.includes(address)) {
            // Find the select button
            const selectButton = cell.querySelector('button.btn.yellow-btn.clickable') ||
                                cell.querySelector('button.btn.yellow-btn') ||
                                cell.querySelector('.liquidity-pool-cell-btn button') ||
                                cell.querySelector('.liquidity-pool-cell-right button') ||
                                cell.querySelector('button[class*="yellow-btn"]') ||
                                cell.querySelector('button:not([disabled])');
            
            if (selectButton && !selectButton.disabled) {
              try {
                selectButton.click();
                console.log(`✓ Selected pool: ${address}`);
                selectedCount++;
                foundOnThisPage++;
                poolsToSelect.delete(address);
                found = true;
                // Small delay between clicks
                await new Promise(resolve => setTimeout(resolve, 100));
                break;
              } catch (e) {
                console.warn(`Error clicking button for ${address}:`, e);
              }
            }
          }
        }
        
        if (!found) {
          // Pool not found on this page - will check other pages
        }
      }
      
      return foundOnThisPage;
    }
    
    // First, try to select pools on the current page
    await selectPoolsOnCurrentPage();
    
    // If there are still pools to select and pagination exists, navigate through pages
    if (poolsToSelect.size > 0) {
      const paginationContainer = document.querySelector('.pagination');
      let pageItems = [];
      let nextButton = null;
      
      if (paginationContainer) {
        // Find all page number items
        pageItems = Array.from(paginationContainer.querySelectorAll('.item')).filter(item => {
          const text = item.textContent ? item.textContent.trim() : '';
          return /^\d+$/.test(text) && !item.classList.contains('extreme') && !item.classList.contains('selected');
        });
        
        // Find next button (right arrow)
        const rightExtreme = paginationContainer.querySelector('.item.extreme.right');
        if (rightExtreme) {
          nextButton = rightExtreme;
        }
      }
      
      if (paginationContainer && (pageItems.length > 0 || nextButton)) {
        console.log(`Pagination detected. ${poolsToSelect.size} pools still need to be selected. Navigating through pages...`);
        
        // Store the current page to return to it later
        const currentPageItem = paginationContainer.querySelector('.item.selected');
        const currentPageNum = currentPageItem ? parseInt(currentPageItem.textContent.trim()) : 1;
        
        // Navigate through pages to find remaining pools
        const maxPagesToCheck = 20; // Safety limit
        let pagesChecked = 1;
        let hadMorePools = poolsToSelect.size > 0;
        
        // Start from page 2 if we found page number buttons
        if (pageItems.length > 0) {
          for (const pageItem of pageItems) {
            if (poolsToSelect.size === 0) break;
            if (pagesChecked >= maxPagesToCheck) break;
            
            const pageNum = parseInt(pageItem.textContent.trim());
            if (pageNum > 1) {
              console.log(`Navigating to page ${pageNum} to find remaining pools...`);
              
              // Click the page item
              const clickable = pageItem.closest('.item') || pageItem.parentElement || pageItem;
              clickable.click();
              await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for page to load
              
              // Try to select pools on this page
              const foundOnPage = await selectPoolsOnCurrentPage();
              pagesChecked++;
              
              if (foundOnPage > 0) {
                console.log(`Found and selected ${foundOnPage} pool(s) on page ${pageNum}`);
                hadMorePools = true;
              }
            }
          }
        } else if (nextButton) {
          // Use next button to navigate
          while (poolsToSelect.size > 0 && pagesChecked < maxPagesToCheck) {
            const clickable = nextButton.closest('.item') || nextButton.parentElement || nextButton;
            const isDisabled = clickable.classList.contains('disabled') || clickable.hasAttribute('disabled');
            
            if (isDisabled) {
              console.log('Reached last page');
              break;
            }
            
            clickable.click();
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for page to load
            
            const foundOnPage = await selectPoolsOnCurrentPage();
            pagesChecked++;
            
            if (foundOnPage > 0) {
              console.log(`Found and selected ${foundOnPage} pool(s) on page ${pagesChecked + 1}`);
              hadMorePools = true;
            } else {
              // No pools found on this page, might be at the end
              break;
            }
            
            // Check if next button is still available
            const newPagination = document.querySelector('.pagination');
            if (newPagination) {
              const newRightExtreme = newPagination.querySelector('.item.extreme.right');
              if (newRightExtreme && (newRightExtreme.classList.contains('disabled') || newRightExtreme.hasAttribute('disabled'))) {
                break;
              }
              nextButton = newRightExtreme;
            } else {
              break;
            }
          }
        }
        
        // Return to the original page
        if (currentPageNum > 1) {
          console.log(`Returning to page ${currentPageNum}...`);
          const finalPagination = document.querySelector('.pagination');
          if (finalPagination) {
            const allPageItems = Array.from(finalPagination.querySelectorAll('.item')).filter(item => {
              const text = item.textContent ? item.textContent.trim() : '';
              return /^\d+$/.test(text) && !item.classList.contains('extreme');
            });
            
            const targetPageItem = allPageItems.find(item => {
              const pageNum = parseInt(item.textContent.trim());
              return pageNum === currentPageNum;
            });
            
            if (targetPageItem) {
              const clickable = targetPageItem.closest('.item') || targetPageItem.parentElement || targetPageItem;
              clickable.click();
              await new Promise(resolve => setTimeout(resolve, 1500));
            } else {
              // Try to go to page 1 and navigate from there
              const page1Item = allPageItems.find(item => {
                const pageNum = parseInt(item.textContent.trim());
                return pageNum === 1;
              });
              if (page1Item) {
                const clickable = page1Item.closest('.item') || page1Item.parentElement || page1Item;
                clickable.click();
                await new Promise(resolve => setTimeout(resolve, 1500));
                
                // Navigate to target page if needed
                if (currentPageNum > 1) {
                  const updatedPagination = document.querySelector('.pagination');
                  if (updatedPagination) {
                    const updatedPageItems = Array.from(updatedPagination.querySelectorAll('.item')).filter(item => {
                      const text = item.textContent ? item.textContent.trim() : '';
                      return /^\d+$/.test(text) && !item.classList.contains('extreme');
                    });
                    const targetItem = updatedPageItems.find(item => {
                      const pageNum = parseInt(item.textContent.trim());
                      return pageNum === currentPageNum;
                    });
                    if (targetItem) {
                      const clickable = targetItem.closest('.item') || targetItem.parentElement || targetItem;
                      clickable.click();
                      await new Promise(resolve => setTimeout(resolve, 1500));
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
    
    // Log any pools that couldn't be found
    if (poolsToSelect.size > 0) {
      console.warn(`Could not find ${poolsToSelect.size} pool(s) on any page:`, Array.from(poolsToSelect));
    }
    
    console.log(`Selection complete: ${selectedCount} pools selected`);
    // Show feedback in overlay instead of alert
    const contentEl = document.getElementById('blackhole-tools-content');
    if (contentEl) {
      const originalHTML = contentEl.innerHTML;
      contentEl.innerHTML = `<p style="color: #32cd32; text-align: center; padding: 20px;">✓ Selected ${selectedCount} of ${poolAddresses.length} recommended pools!</p>`;
      setTimeout(() => {
        contentEl.innerHTML = originalHTML;
        updateOverlay();
      }, 2000);
    }
    resolve();
    } catch (error) {
      console.warn('Error selecting pools:', error);
      alert('Error loading pool data. Please reload the page.');
      resolve();
    }
  });
}

// Helper function to safely call chrome.storage
async function safeStorageGet(keys) {
  try {
    // Check if extension context is still valid
    if (!chrome.runtime || !chrome.runtime.id) {
      throw new Error('Extension context invalidated');
    }
    return await chrome.storage.local.get(keys);
  } catch (error) {
    if (error.message.includes('Extension context invalidated') || 
        error.message.includes('message port closed')) {
      console.warn('Extension context invalidated. Please reload the page.');
      throw error;
    }
    throw error;
  }
}

async function safeStorageSet(data) {
  try {
    if (!chrome.runtime || !chrome.runtime.id) {
      throw new Error('Extension context invalidated');
    }
    return await chrome.storage.local.set(data);
  } catch (error) {
    if (error.message.includes('Extension context invalidated') || 
        error.message.includes('message port closed')) {
      console.warn('Extension context invalidated. Please reload the page.');
      throw error;
    }
    throw error;
  }
}

async function updateOverlay() {
  const contentEl = document.getElementById('blackhole-tools-content');
  if (!contentEl) return;
  
  let poolData = [];
  try {
    const result = await safeStorageGet(['poolData']);
    poolData = result.poolData || [];
  } catch (error) {
    contentEl.innerHTML = '<p style="color: #ff8c00; text-align: center; padding: 20px;">⚠️ Extension context invalidated. Please reload the page.</p>';
    return;
  }
  
  if (poolData.length === 0) {
    contentEl.innerHTML = '<p>No pool data available. Click "Refresh Pool Data" in the extension popup.</p>';
    return;
  }
  
  const pools = poolData.map(data => new Pool(data));
  
  // Debug: log pool data (only once per session to avoid spam)
  const poolsWithData = pools.filter(p => p.total_rewards > 0 || p.vapr > 0);
  
  if (!window._loggedPoolProcessing) {
    console.log(`Processing ${pools.length} pools with filters:`, {
      topN: settings.topN || 10,
      votingPower: settings.votingPower,
      hideVamm: settings.hideVamm,
      minRewards: settings.minRewards,
      maxPoolPercentage: settings.maxPoolPercentage,
      sortBy: settings.sortBy || 'auto'
    });
    
    console.log(`Pools with data: ${poolsWithData.length} of ${pools.length}`);
    if (poolsWithData.length > 0) {
      console.log('Sample pool:', {
        name: poolsWithData[0].name,
        total_rewards: poolsWithData[0].total_rewards,
        vapr: poolsWithData[0].vapr,
        current_votes: poolsWithData[0].current_votes
      });
    }
    window._loggedPoolProcessing = true;
  }
  
  try {
    // Handle null/undefined voting power (convert to null for consistency)
    const userVotingPower = (settings.votingPower !== null && settings.votingPower !== undefined) 
      ? settings.votingPower 
      : null;
    
    // Debug: check what's being filtered (only once)
    if (!window._loggedFilterDebug) {
      console.log('=== FILTER DEBUG ===');
      console.log('Filter settings:', {
        hideVamm: settings.hideVamm,
        minRewards: settings.minRewards,
        maxPoolPercentage: settings.maxPoolPercentage,
        userVotingPower: userVotingPower,
        topN: settings.topN || 10,
        sortBy: settings.sortBy || 'auto'
      });
      
      // Test filtering manually to see what's happening
      let testPools = [...pools];
      console.log(`Starting with ${testPools.length} pools`);
      
      if (settings.hideVamm) {
        const before = testPools.length;
        testPools = testPools.filter(p => p.pool_type !== 'vAMM');
        console.log(`After hideVamm: ${testPools.length} (removed ${before - testPools.length})`);
      }
      
      if (settings.minRewards !== null && settings.minRewards !== undefined) {
        const before = testPools.length;
        testPools = testPools.filter(p => p.total_rewards >= settings.minRewards);
        console.log(`After minRewards (>=${settings.minRewards}): ${testPools.length} (removed ${before - testPools.length})`);
      }
      
      if (settings.maxPoolPercentage !== null && settings.maxPoolPercentage !== undefined && userVotingPower) {
        const before = testPools.length;
        let removedCount = 0;
        let keptCount = 0;
        const removedPools = [];
        const keptPools = [];
        
        // Calculate minimum votes needed to pass the filter
        // userPercentage = (userVotingPower / (poolVotes + userVotingPower)) * 100 <= maxPoolPercentage
        // Solving for poolVotes: poolVotes >= userVotingPower * (100/maxPoolPercentage - 1)
        const minVotesNeeded = userVotingPower * (100 / settings.maxPoolPercentage - 1);
        console.log(`To pass ${settings.maxPoolPercentage}% filter, pools need at least ${minVotesNeeded.toLocaleString(undefined, {maximumFractionDigits: 0})} votes`);
        
        testPools = testPools.filter(p => {
          if (p.current_votes === null || p.current_votes === 0) {
            const keep = settings.maxPoolPercentage >= 100.0;
            if (!keep && removedCount < 3) {
              removedPools.push({ name: p.name, reason: 'no votes (would be 100%)' });
            }
            return keep;
          }
          const newTotalVotes = p.current_votes + userVotingPower;
          const userPercentage = (userVotingPower / newTotalVotes) * 100;
          const keep = userPercentage <= settings.maxPoolPercentage;
          
          if (!keep && removedCount < 3) {
            removedPools.push({ 
              name: p.name, 
              votes: p.current_votes.toLocaleString(undefined, {maximumFractionDigits: 0}), 
              userPct: userPercentage.toFixed(2) + '%',
              reason: `user would have ${userPercentage.toFixed(2)}% (threshold: ${settings.maxPoolPercentage}%)`
            });
            removedCount++;
          } else if (keep && keptCount < 3) {
            keptPools.push({
              name: p.name,
              votes: p.current_votes.toLocaleString(undefined, {maximumFractionDigits: 0}),
              userPct: userPercentage.toFixed(2) + '%'
            });
            keptCount++;
          }
          return keep;
        });
        
        console.log(`After maxPoolPercentage (<=${settings.maxPoolPercentage}%): ${testPools.length} (removed ${before - testPools.length})`);
        if (removedPools.length > 0) {
          console.log('Example removed pools:', removedPools);
        }
        if (keptPools.length > 0) {
          console.log('Example kept pools:', keptPools);
        } else {
          console.warn(`⚠️ All pools removed by maxPoolPercentage filter! Pools need at least ${minVotesNeeded.toLocaleString(undefined, {maximumFractionDigits: 0})} votes to pass.`);
        }
      }
      
      console.log(`Final filtered pools: ${testPools.length}`);
      console.log('=== END FILTER DEBUG ===');
      window._loggedFilterDebug = true;
    }
    
    // Reset the max pool filter log flag so we can see what's happening
    window._loggedMaxPoolFilter = false;
    
    const recommendations = recommendPools(pools, {
      topN: settings.topN || 10,
      userVotingPower: userVotingPower,
      hideVamm: settings.hideVamm,
      minRewards: settings.minRewards,
      maxPoolPercentage: settings.maxPoolPercentage,
      sortBy: settings.sortBy || 'auto'
    });
    
    // Log recommendations
    if (!window._loggedRecommendations) {
      console.log(`Generated ${recommendations.length} recommendations`);
      if (recommendations.length > 0) {
        console.log('Top recommendations:', recommendations.slice(0, 3).map(p => ({
          name: p.name,
          estimatedReward: userVotingPower ? p.estimateUserRewards(userVotingPower) : null,
          total_rewards: p.total_rewards,
          current_votes: p.current_votes
        })));
      }
      window._loggedRecommendations = true;
    }
    
    if (recommendations.length === 0) {
      // Calculate what filters are removing pools
      let testPools = [...pools];
      let filterSteps = [];
      
      if (settings.hideVamm) {
        const before = testPools.length;
        testPools = testPools.filter(p => p.pool_type !== 'vAMM');
        filterSteps.push(`hideVamm: ${before} → ${testPools.length} (removed ${before - testPools.length})`);
      }
      
      if (settings.minRewards !== null && settings.minRewards !== undefined) {
        const before = testPools.length;
        testPools = testPools.filter(p => p.total_rewards >= settings.minRewards);
        filterSteps.push(`minRewards (>=$${settings.minRewards}): ${before} → ${testPools.length} (removed ${before - testPools.length})`);
      }
      
      if (settings.maxPoolPercentage !== null && settings.maxPoolPercentage !== undefined && userVotingPower) {
        const before = testPools.length;
        testPools = testPools.filter(p => {
          if (p.current_votes === null || p.current_votes === 0) {
            return settings.maxPoolPercentage >= 100.0;
          }
          const newTotalVotes = p.current_votes + userVotingPower;
          const userPercentage = (userVotingPower / newTotalVotes) * 100;
          return userPercentage <= settings.maxPoolPercentage;
        });
        filterSteps.push(`maxPoolPercentage (<=${settings.maxPoolPercentage}%): ${before} → ${testPools.length} (removed ${before - testPools.length})`);
      }
      
      let message = '<p style="color: #ff8c00;">No pools match your criteria. Try adjusting filters.</p>';
      message += `<p style="font-size: 11px; color: #999; margin-top: 8px;">`;
      message += `Total pools: ${pools.length}<br>`;
      message += `Pools with data: ${poolsWithData.length}<br>`;
      if (filterSteps.length > 0) {
        message += `<br><strong>Filter steps:</strong><br>`;
        filterSteps.forEach(step => {
          message += `${step}<br>`;
        });
      }
      message += `</p>`;
      message += `<p style="font-size: 11px; color: #ffd700; margin-top: 8px;">`;
      if (settings.maxPoolPercentage !== null && settings.maxPoolPercentage !== undefined) {
        message += `💡 <strong>Tip:</strong> Your maxPoolPercentage filter (${settings.maxPoolPercentage}%) is removing all pools. `;
        message += `With ${userVotingPower ? userVotingPower.toLocaleString() : 'your'} veBLACK, pools need at least ~${userVotingPower ? userVotingPower.toLocaleString() : 'equal'} votes to pass this filter. `;
        message += `Try removing this filter or setting it much higher (90-100%).`;
      } else {
        message += `💡 Check your other filters or try refreshing pool data.`;
      }
      message += `</p>`;
      contentEl.innerHTML = message;
      isUpdatingOverlay = false;
      return;
    }
    
    let html = '<div class="recommendations-list">';
    
    recommendations.forEach((pool, index) => {
      const estimatedReward = userVotingPower ? pool.estimateUserRewards(userVotingPower) : null;
      const poolShare = userVotingPower ? pool.calculateShare(userVotingPower) : null;
      const profitabilityScore = pool.profitabilityScore();
      const stabilityScore = pool.stabilityScore();
      const rewardsPerVote = pool.rewardsPerVote();
      
      // Add click handler to select this pool
      const poolIdAttr = pool.pool_id ? `data-pool-id="${pool.pool_id}"` : '';
      
      // Check if this pool is currently selected
      const isSelected = pool.pool_id ? isPoolSelected(pool.pool_id) : false;
      const selectedClass = isSelected ? 'pool-selected' : '';
      const buttonText = isSelected ? 'Deselect' : 'Select';
      
      html += `
        <div class="recommendation-item ${selectedClass}" ${poolIdAttr} data-pool-name="${pool.name}">
          <div class="pool-rank">#${index + 1}</div>
          <div class="pool-info">
            <div class="pool-name">${pool.name || 'Unknown Pool'}</div>
            <div class="pool-metrics">
              <span>Rewards: $${pool.total_rewards > 0 ? pool.total_rewards.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '0'}</span>
              <span>VAPR: ${pool.vapr > 0 ? pool.vapr.toFixed(0) : '0'}%</span>
              ${pool.current_votes ? `<span>Votes: ${formatNumber(pool.current_votes)}</span>` : ''}
              ${poolShare ? `<span>Share: ${poolShare.toFixed(1)}%</span>` : ''}
            </div>
            ${estimatedReward ? `<div class="estimated-reward">Est. Reward: $${estimatedReward.toFixed(2)}</div>` : ''}
            <div class="pool-scores">
              <span>Profit: ${profitabilityScore.toFixed(0)}</span>
              <span>Stability: ${stabilityScore.toFixed(0)}</span>
            </div>
            ${pool.pool_id ? `<button class="select-pool-btn ${isSelected ? 'selected' : ''}" data-pool-id="${pool.pool_id}">${buttonText}</button>` : ''}
          </div>
        </div>
      `;
    });
    
    html += '</div>';
    contentEl.innerHTML = html;
    
    // Add click handlers for individual pool selection
    contentEl.querySelectorAll('.select-pool-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const poolId = btn.getAttribute('data-pool-id');
        await selectSinglePool(poolId);
      });
    });
    
  } catch (error) {
    console.error('Error generating recommendations:', error);
    contentEl.innerHTML = `<p style="color: #ff8c00;">Error generating recommendations: ${error.message}</p>`;
    console.error('Full error:', error);
  } finally {
    isUpdatingOverlay = false;
  }
}

function formatNumber(num) {
  if (num === null || num === undefined) return '0';
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

// Check if a pool is currently selected
function isPoolSelected(poolId) {
  if (!poolId) return false;
  
  const poolCells = document.querySelectorAll('div.liquidity-pool-cell');
  for (let cell of poolCells) {
    const innerHTML = cell.innerHTML || '';
    const innerText = cell.innerText || '';
    
    if (innerHTML.includes(poolId) || innerText.includes(poolId)) {
      // Check for "Selected to vote" indicator
      const selectToVoteContainer = cell.querySelector('.select-to-vote-container');
      if (selectToVoteContainer) {
        const completedText = selectToVoteContainer.querySelector('.select-to-vote.completed');
        if (completedText) {
          return true;
        }
      }
      // Alternative check: look for button that's not clickable (selected state)
      const selectButton = cell.querySelector('button.btn.yellow-btn');
      if (selectButton && !selectButton.classList.contains('clickable')) {
        return true;
      }
    }
  }
  return false;
}

// Clear all selected pools (including those not visible)
async function clearAllSelectedPools() {
  // Find ALL pool cells, including those not in viewport
  // Also check for pools in different containers or sections
  const allPoolCells = document.querySelectorAll('div.liquidity-pool-cell');
  let clearedCount = 0;
  const poolsToClear = [];
  
  console.log(`Searching for selected pools in ${allPoolCells.length} total pool cells...`);
  
  // First pass: identify all selected pools
  // Check multiple ways to detect selected state
  for (let cell of allPoolCells) {
    let isSelected = false;
    
    // Method 1: Check for .select-to-vote.completed
    const selectToVoteContainer = cell.querySelector('.select-to-vote-container');
    if (selectToVoteContainer) {
      const completedText = selectToVoteContainer.querySelector('.select-to-vote.completed');
      if (completedText && completedText.textContent.includes('Selected to vote')) {
        isSelected = true;
      }
    }
    
    // Method 2: Check for "CLEAR" button/link (indicates selected)
    if (!isSelected) {
      const clearButton = Array.from(cell.querySelectorAll('*')).find(el => {
        const text = el.textContent ? el.textContent.trim().toUpperCase() : '';
        return text === 'CLEAR' && !text.includes('ADD') && !text.includes('INCENTIVE');
      });
      if (clearButton) {
        isSelected = true;
      }
    }
    
    // Method 3: Check button state (SELECT button might be disabled/hidden when selected)
    if (!isSelected) {
      const selectButton = cell.querySelector('button.btn.yellow-btn');
      if (selectButton) {
        const buttonText = selectButton.textContent ? selectButton.textContent.trim().toUpperCase() : '';
        // If button says something other than SELECT, or is disabled, might be selected
        const hasClearText = cell.textContent.toUpperCase().includes('CLEAR');
        const hasSelectedText = cell.textContent.toUpperCase().includes('SELECTED TO VOTE');
        if (hasClearText || hasSelectedText) {
          isSelected = true;
        }
      }
    }
    
    if (isSelected) {
      poolsToClear.push(cell);
      // Extract pool name for logging
      const poolName = cell.querySelector('[class*="name"], [class*="title"]')?.textContent || 'Unknown';
      console.log(`Found selected pool: ${poolName}`);
    }
  }
  
  console.log(`Found ${poolsToClear.length} selected pools to clear`);
  
  if (poolsToClear.length === 0) {
    console.warn('No selected pools found. Checking if pools might be on different pages or in different containers...');
    // Try alternative selectors
    const alternativeCells = document.querySelectorAll('[class*="pool"], [class*="liquidity"]');
    console.log(`Found ${alternativeCells.length} alternative pool elements`);
  }
  
  // Second pass: clear them (scroll into view if needed)
  for (let cell of poolsToClear) {
    // Check if cell is in viewport (with some tolerance)
    const rect = cell.getBoundingClientRect();
    const isVisible = rect.top >= -50 && rect.bottom <= window.innerHeight + 50 && 
                     rect.left >= -50 && rect.right <= window.innerWidth + 50;
    
    if (!isVisible) {
      // Scroll the cell into view
      console.log('Scrolling pool into view for clearing...');
      cell.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Wait longer for smooth scroll to complete
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Re-check visibility after scroll
      const newRect = cell.getBoundingClientRect();
      const nowVisible = newRect.top >= -50 && newRect.bottom <= window.innerHeight + 50 && 
                        newRect.left >= -50 && newRect.right <= window.innerWidth + 50;
      
      if (!nowVisible) {
        // Try instant scroll as fallback
        cell.scrollIntoView({ behavior: 'auto', block: 'center' });
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    // Find the "CLEAR" link/button to deselect it
    // When selected, the page shows "CLEAR" instead of "SELECT"
    // IMPORTANT: Must check text content to avoid clicking "Add Incentives" link
    const selectContainer = cell.querySelector('.select-to-vote-container');
    let clearLink = null;
    
    if (selectContainer) {
      // Look for CLEAR link specifically in the select-to-vote-container
      const allLinks = selectContainer.querySelectorAll('.voting-pool-add-incentives, div, button, a, span');
      for (const link of allLinks) {
        const text = link.textContent ? link.textContent.trim().toUpperCase() : '';
        if (text === 'CLEAR' || text.includes('CLEAR')) {
          // Double-check it's not "Add Incentives" or similar
          const parentText = link.parentElement ? link.parentElement.textContent.toUpperCase() : '';
          if (!parentText.includes('ADD INCENTIVE') && !parentText.includes('ADD INCENTIVES')) {
            clearLink = link;
            break;
          }
        }
      }
    }
    
    // Fallback: search entire cell for CLEAR (but not Add Incentives)
    if (!clearLink) {
      const allClickables = cell.querySelectorAll('.voting-pool-add-incentives, div.clickable, button, a, span');
      for (const link of allClickables) {
        const text = link.textContent ? link.textContent.trim().toUpperCase() : '';
        // Make sure it says CLEAR and NOT "Add Incentives"
        if ((text === 'CLEAR' || text.includes('CLEAR')) && !text.includes('ADD') && !text.includes('INCENTIVE')) {
          const parentText = link.parentElement ? link.parentElement.textContent.toUpperCase() : '';
          if (!parentText.includes('ADD INCENTIVE') && !parentText.includes('ADD INCENTIVES')) {
            clearLink = link;
            break;
          }
        }
      }
    }
    
    if (clearLink) {
      try {
        // Ensure link is visible before clicking
        const linkRect = clearLink.getBoundingClientRect();
        if (linkRect.width === 0 || linkRect.height === 0) {
          console.warn('CLEAR link has zero dimensions, trying parent');
          const parent = clearLink.parentElement;
          if (parent) {
            parent.click();
          } else {
            clearLink.click();
          }
        } else {
          clearLink.click();
        }
        clearedCount++;
        console.log(`✓ Cleared pool (${clearedCount}/${poolsToClear.length})`);
        // Small delay between clicks to allow page to update
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (e) {
        console.warn('Error clicking CLEAR for pool:', e, cell);
      }
    } else {
      console.warn('Could not find CLEAR button for selected pool. Cell HTML:', cell.innerHTML.substring(0, 200));
    }
  }
  
  console.log(`Cleared ${clearedCount} selected pools on current page`);
  
  // Check for pagination and navigate through other pages
  // Look for Blackhole DEX pagination structure: .pagination .item
  const paginationContainer = document.querySelector('.pagination');
  let pageItems = [];
  let nextButton = null;
  let prevButton = null;
  
  if (paginationContainer) {
    // Find all page number items
    pageItems = Array.from(paginationContainer.querySelectorAll('.item')).filter(item => {
      const text = item.textContent ? item.textContent.trim() : '';
      // Exclude extreme items (arrows) and selected item
      return /^\d+$/.test(text) && !item.classList.contains('extreme') && !item.classList.contains('selected');
    });
    
    // Find next button (right arrow)
    const rightExtreme = paginationContainer.querySelector('.item.extreme.right');
    if (rightExtreme) {
      nextButton = rightExtreme;
    }
    
    // Find prev button (left arrow) - though we probably don't need it
    const leftExtreme = paginationContainer.querySelector('.item.extreme:not(.right)');
    if (leftExtreme) {
      prevButton = leftExtreme;
    }
    
    // Also try to find the parent clickable div
    if (nextButton && nextButton.parentElement) {
      const parent = nextButton.parentElement;
      if (parent.classList.contains('item') || parent.onclick) {
        nextButton = parent;
      }
    }
    
    console.log('Pagination detected:', {
      container: !!paginationContainer,
      pageItems: pageItems.length,
      pageNumbers: pageItems.map(p => p.textContent.trim()),
      nextButton: !!nextButton,
      prevButton: !!prevButton
    });
  }
  
  if (paginationContainer && (pageItems.length > 0 || nextButton)) {
    console.log('Pagination detected. Checking other pages for selected pools...');
    
    // Try to navigate through pages (with safety limit)
    const maxPagesToCheck = 5;
    let pagesChecked = 1;
    let hadMorePools = clearedCount > 0;
    
    // Start from page 2 if we found page number buttons
    if (pageItems.length > 0) {
      for (const pageItem of pageItems) {
        const pageNum = parseInt(pageItem.textContent.trim());
        if (pageNum > 1 && pagesChecked < maxPagesToCheck) {
          console.log(`Navigating to page ${pageNum}...`);
          
          // Click the page item (might need to click parent div)
          const clickable = pageItem.closest('.item') || pageItem.parentElement || pageItem;
          clickable.click();
          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for page to load
          
          // Clear pools on this page
          const allPoolCells = document.querySelectorAll('div.liquidity-pool-cell');
          const poolsToClear = [];
          
          for (let cell of allPoolCells) {
            const selectToVoteContainer = cell.querySelector('.select-to-vote-container');
            if (selectToVoteContainer) {
              const completedText = selectToVoteContainer.querySelector('.select-to-vote.completed');
              if (completedText && completedText.textContent.includes('Selected to vote')) {
                poolsToClear.push(cell);
              }
            }
          }
          
          // Clear pools found on this page
          for (let cell of poolsToClear) {
            const selectContainer = cell.querySelector('.select-to-vote-container');
            let clearLink = null;
            
            if (selectContainer) {
              const allLinks = selectContainer.querySelectorAll('div, button, a, span');
              for (const link of allLinks) {
                const text = link.textContent ? link.textContent.trim().toUpperCase() : '';
                if (text === 'CLEAR') {
                  const parentText = link.parentElement ? link.parentElement.textContent.toUpperCase() : '';
                  if (!parentText.includes('ADD INCENTIVE')) {
                    clearLink = link;
                    break;
                  }
                }
              }
            }
            
            if (clearLink) {
              try {
                clearLink.click();
                clearedCount++;
                console.log(`✓ Cleared pool on page ${pageNum}`);
                await new Promise(resolve => setTimeout(resolve, 200));
              } catch (e) {
                console.warn('Error clearing pool on page', pageNum, e);
              }
            }
          }
          
          pagesChecked++;
          if (poolsToClear.length === 0 && !hadMorePools) {
            break; // No more selected pools
          }
        }
      }
    } else if (nextButton) {
      // Use next button (right arrow) to navigate
      let currentNextBtn = nextButton;
      while (currentNextBtn && currentNextBtn.offsetParent !== null && pagesChecked < maxPagesToCheck) {
        console.log(`Clicking next button (page ${pagesChecked + 1})...`);
        // Click the next button (might need to click parent)
        const clickable = currentNextBtn.closest('.item') || currentNextBtn.parentElement || currentNextBtn;
        clickable.click();
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Clear pools on this page (same logic as above)
        const allPoolCells = document.querySelectorAll('div.liquidity-pool-cell');
        const poolsToClear = [];
        
        for (let cell of allPoolCells) {
          const selectToVoteContainer = cell.querySelector('.select-to-vote-container');
          if (selectToVoteContainer) {
            const completedText = selectToVoteContainer.querySelector('.select-to-vote.completed');
            if (completedText && completedText.textContent.includes('Selected to vote')) {
              poolsToClear.push(cell);
            }
          }
        }
        
        for (let cell of poolsToClear) {
          const selectContainer = cell.querySelector('.select-to-vote-container');
          let clearLink = selectContainer?.querySelector('*');
          
          if (clearLink) {
            const text = clearLink.textContent ? clearLink.textContent.trim().toUpperCase() : '';
            if (text === 'CLEAR') {
              try {
                clearLink.click();
                clearedCount++;
                await new Promise(resolve => setTimeout(resolve, 200));
              } catch (e) {
                console.warn('Error clearing pool:', e);
              }
            }
          }
        }
        
        pagesChecked++;
        // Find next button again (it might have changed after page load)
        const newPagination = document.querySelector('.pagination');
        if (newPagination) {
          const newRightExtreme = newPagination.querySelector('.item.extreme.right');
          if (newRightExtreme) {
            currentNextBtn = newRightExtreme;
          } else {
            currentNextBtn = null; // No more pages
          }
        } else {
          currentNextBtn = null; // Pagination disappeared
        }
        
        if (poolsToClear.length === 0 && pagesChecked > 1) {
          break; // No more selected pools and we've checked at least one additional page
        }
      }
    }
    
    console.log(`Checked ${pagesChecked} pages total`);
    
    // Navigate back to page 1
    const finalPagination = document.querySelector('.pagination');
    if (finalPagination) {
      // Wait a bit for page to settle
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Find all page number items
      const allPageItems = Array.from(finalPagination.querySelectorAll('.item')).filter(item => {
        const text = item.textContent ? item.textContent.trim() : '';
        return /^\d+$/.test(text) && !item.classList.contains('extreme');
      });
      
      // Check if we're already on page 1
      const currentPageItem = finalPagination.querySelector('.item.selected');
      const currentPageText = currentPageItem ? currentPageItem.textContent.trim() : '';
      const isOnPage1 = currentPageText === '1';
      
      if (!isOnPage1) {
        console.log('Not on page 1, navigating back...');
        // Find page 1 item
        const page1Item = allPageItems.find(item => item.textContent.trim() === '1');
        
        if (page1Item) {
          console.log('Found page 1 button, clicking...');
          // Try multiple click strategies
          // Strategy 1: Click the item itself
          try {
            page1Item.click();
            await new Promise(resolve => setTimeout(resolve, 1000));
          } catch (e) {
            console.warn('Direct click failed, trying parent:', e);
          }
          
          // Strategy 2: Click parent div if it exists
          const parentDiv = page1Item.parentElement;
          if (parentDiv && parentDiv.classList.contains('item')) {
            try {
              parentDiv.click();
              await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (e) {
              console.warn('Parent click failed:', e);
            }
          }
          
          // Strategy 3: Use mouse event
          try {
            const clickEvent = new MouseEvent('click', {
              bubbles: true,
              cancelable: true,
              view: window
            });
            page1Item.dispatchEvent(clickEvent);
            await new Promise(resolve => setTimeout(resolve, 1000));
          } catch (e) {
            console.warn('MouseEvent dispatch failed:', e);
          }
          
          // Verify we're on page 1
          await new Promise(resolve => setTimeout(resolve, 500));
          const newCurrentPage = finalPagination.querySelector('.item.selected');
          const newPageText = newCurrentPage ? newCurrentPage.textContent.trim() : '';
          if (newPageText === '1') {
            console.log('✓ Successfully returned to page 1');
            
            // Continuous scroll reset for 600ms to catch layout updates immediately
            const startTime = performance.now();
            const duration = 600;
            
            const scrollLoop = (currentTime) => {
              // Reset main window scroll
              window.scrollTo(0, 0);
              document.documentElement.scrollTop = 0;
              document.body.scrollTop = 0;
              
              // Find scrolled containers (optimization: only check divs/mains/sections)
              const containers = document.querySelectorAll('div, main, section, ul');
              for (const el of containers) {
                if (el.scrollTop > 0) {
                  el.scrollTop = 0;
                }
              }
              
              if (currentTime - startTime < duration) {
                requestAnimationFrame(scrollLoop);
              }
            };
            
            requestAnimationFrame(scrollLoop);
          } else {
            console.warn(`Still on page ${newPageText}, page 1 navigation may have failed`);
          }
        } else {
          console.warn('Could not find page 1 button in pagination');
        }
      } else {
        console.log('Already on page 1');
        
        const startTime = performance.now();
        const duration = 600;
        
        const scrollLoop = (currentTime) => {
          window.scrollTo(0, 0);
          document.documentElement.scrollTop = 0;
          document.body.scrollTop = 0;
          
          const containers = document.querySelectorAll('div, main, section, ul');
          for (const el of containers) {
            if (el.scrollTop > 0) {
              el.scrollTop = 0;
            }
          }
          
          if (currentTime - startTime < duration) {
            requestAnimationFrame(scrollLoop);
          }
        };
        
        requestAnimationFrame(scrollLoop);
      }
    }
  } else {
    // No pagination detected - maybe it's infinite scroll or all pools are loaded
    // Try scrolling to bottom to see if more pools load
    console.log('No pagination controls found. Checking if all pools are loaded or if infinite scroll is used...');
    const initialPoolCount = document.querySelectorAll('div.liquidity-pool-cell').length;
    console.log(`Initial pool count: ${initialPoolCount}`);
    
    // Try scrolling to bottom to trigger lazy loading
    window.scrollTo(0, document.body.scrollHeight);
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const afterScrollCount = document.querySelectorAll('div.liquidity-pool-cell').length;
    console.log(`After scroll pool count: ${afterScrollCount}`);
    
    if (afterScrollCount > initialPoolCount) {
      console.log('More pools loaded after scrolling. Checking for selected pools...');
      // Re-check for selected pools after scroll
      const newPoolsToClear = [];
      const allPoolCells = document.querySelectorAll('div.liquidity-pool-cell');
      
      for (let cell of allPoolCells) {
        const selectToVoteContainer = cell.querySelector('.select-to-vote-container');
        if (selectToVoteContainer) {
          const completedText = selectToVoteContainer.querySelector('.select-to-vote.completed');
          if (completedText && completedText.textContent.includes('Selected to vote')) {
            newPoolsToClear.push(cell);
          }
        }
      }
      
      // Clear any newly found pools
      for (let cell of newPoolsToClear) {
        const selectContainer = cell.querySelector('.select-to-vote-container');
        let clearLink = null;
        
        if (selectContainer) {
          const allLinks = selectContainer.querySelectorAll('div, button, a, span');
          for (const link of allLinks) {
            const text = link.textContent ? link.textContent.trim().toUpperCase() : '';
            if (text === 'CLEAR') {
              const parentText = link.parentElement ? link.parentElement.textContent.toUpperCase() : '';
              if (!parentText.includes('ADD INCENTIVE')) {
                clearLink = link;
                break;
              }
            }
          }
        }
        
        if (clearLink) {
          try {
            clearLink.click();
            clearedCount++;
            console.log(`✓ Cleared additional pool after scroll`);
            await new Promise(resolve => setTimeout(resolve, 200));
          } catch (e) {
            console.warn('Error clearing pool after scroll:', e);
          }
        }
      }
    }
  }
  
  console.log(`Cleared ${clearedCount} selected pools total`);
  
  // Update UI to reflect changes
  updateOverlay();
  
  return clearedCount;
}

// Get all currently selected pools (checks all pages if pagination exists)
async function getSelectedPools() {
  const selectedPools = [];
  const foundPoolIds = new Set(); // Track to avoid duplicates
  
  // Helper function to collect selected pools on current page
  function collectSelectedPoolsOnCurrentPage() {
    const allPoolCells = document.querySelectorAll('div.liquidity-pool-cell');
    
    for (let cell of allPoolCells) {
      const selectToVoteContainer = cell.querySelector('.select-to-vote-container');
      if (selectToVoteContainer) {
        const completedText = selectToVoteContainer.querySelector('.select-to-vote.completed');
        if (completedText && completedText.textContent.includes('Selected to vote')) {
          // Try to find pool address/ID using multiple strategies
          let poolId = cell.getAttribute('data-pool-id') || 
                       cell.getAttribute('data-pool-address') || 
                       cell.getAttribute('data-id');
          
          if (!poolId) {
            const idElem = cell.querySelector('[data-pool-id], [data-pool-address], [data-id]');
            if (idElem) {
              poolId = idElem.getAttribute('data-pool-id') || 
                       idElem.getAttribute('data-pool-address') || 
                       idElem.getAttribute('data-id');
            }
          }

          if (!poolId) {
            // Fallback to regex
            const innerHTML = cell.innerHTML || '';
            const addressMatch = innerHTML.match(/0x[a-fA-F0-9]{40}/i);
            if (addressMatch) {
              poolId = addressMatch[0];
            }
          }
          
          if (poolId && !foundPoolIds.has(poolId.toLowerCase())) {
            selectedPools.push({
              poolId: poolId,
              cell: cell
            });
            foundPoolIds.add(poolId.toLowerCase());
          }
        }
      }
    }
  }
  
  // First, collect pools on current page
  collectSelectedPoolsOnCurrentPage();
  
  // Check if pagination exists and navigate through pages
  const paginationContainer = document.querySelector('.pagination');
  let pageItems = [];
  let nextButton = null;
  
  if (paginationContainer) {
    // Find all page number items
    pageItems = Array.from(paginationContainer.querySelectorAll('.item')).filter(item => {
      const text = item.textContent ? item.textContent.trim() : '';
      return /^\d+$/.test(text) && !item.classList.contains('extreme') && !item.classList.contains('selected');
    });
    
    // Find next button (right arrow)
    const rightExtreme = paginationContainer.querySelector('.item.extreme.right');
    if (rightExtreme) {
      nextButton = rightExtreme;
    }
  }
  
  if (paginationContainer && (pageItems.length > 0 || nextButton)) {
    // Store the current page to return to it later
    const currentPageItem = paginationContainer.querySelector('.item.selected');
    const currentPageNum = currentPageItem ? parseInt(currentPageItem.textContent.trim()) : 1;
    
    // Navigate through pages to find all selected pools
    const maxPagesToCheck = 20; // Safety limit
    let pagesChecked = 1;
    
    if (pageItems.length > 0) {
      for (const pageItem of pageItems) {
        if (pagesChecked >= maxPagesToCheck) break;
        
        const pageNum = parseInt(pageItem.textContent.trim());
        if (pageNum > 1) {
          // Click the page item
          const clickable = pageItem.closest('.item') || pageItem.parentElement || pageItem;
          clickable.click();
          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for page to load
          
          // Collect pools on this page
          collectSelectedPoolsOnCurrentPage();
          pagesChecked++;
        }
      }
    } else if (nextButton) {
      // Use next button to navigate
      while (pagesChecked < maxPagesToCheck) {
        const clickable = nextButton.closest('.item') || nextButton.parentElement || nextButton;
        const isDisabled = clickable.classList.contains('disabled') || clickable.hasAttribute('disabled');
        
        if (isDisabled) {
          break;
        }
        
        clickable.click();
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for page to load
        
        collectSelectedPoolsOnCurrentPage();
        pagesChecked++;
        
        // Check if next button is still available
        const newPagination = document.querySelector('.pagination');
        if (newPagination) {
          const newRightExtreme = newPagination.querySelector('.item.extreme.right');
          if (newRightExtreme && (newRightExtreme.classList.contains('disabled') || newRightExtreme.hasAttribute('disabled'))) {
            break;
          }
          nextButton = newRightExtreme;
        } else {
          break;
        }
      }
    }
    
    // Return to the original page
    if (currentPageNum > 1) {
      const finalPagination = document.querySelector('.pagination');
      if (finalPagination) {
        const allPageItems = Array.from(finalPagination.querySelectorAll('.item')).filter(item => {
          const text = item.textContent ? item.textContent.trim() : '';
          return /^\d+$/.test(text) && !item.classList.contains('extreme');
        });
        
        const targetPageItem = allPageItems.find(item => {
          const pageNum = parseInt(item.textContent.trim());
          return pageNum === currentPageNum;
        });
        
        if (targetPageItem) {
          const clickable = targetPageItem.closest('.item') || targetPageItem.parentElement || targetPageItem;
          clickable.click();
          await new Promise(resolve => setTimeout(resolve, 1500));
        } else {
          // Try to go to page 1 and navigate from there
          const page1Item = allPageItems.find(item => {
            const pageNum = parseInt(item.textContent.trim());
            return pageNum === 1;
          });
          if (page1Item) {
            const clickable = page1Item.closest('.item') || page1Item.parentElement || page1Item;
            clickable.click();
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            // Navigate to target page if needed
            if (currentPageNum > 1) {
              const updatedPagination = document.querySelector('.pagination');
              if (updatedPagination) {
                const updatedPageItems = Array.from(updatedPagination.querySelectorAll('.item')).filter(item => {
                  const text = item.textContent ? item.textContent.trim() : '';
                  return /^\d+$/.test(text) && !item.classList.contains('extreme');
                });
                const targetItem = updatedPageItems.find(item => {
                  const pageNum = parseInt(item.textContent.trim());
                  return pageNum === currentPageNum;
                });
                if (targetItem) {
                  const clickable = targetItem.closest('.item') || targetItem.parentElement || targetItem;
                  clickable.click();
                  await new Promise(resolve => setTimeout(resolve, 1500));
                }
              }
            }
          }
        }
      }
    }
  }
  
  return selectedPools;
}

// Split votes evenly across selected pools
async function splitVotesEvenly() {
  // Get all selected pools
  let selectedPools = await getSelectedPools();
  
  if (selectedPools.length === 0) {
    alert('No pools are currently selected. Please select pools first.');
    return;
  }

  // SORTING LOGIC: Sort selected pools by profitability/rewards so the best ones get rounding remainder
  try {
    const result = await safeStorageGet(['poolData', 'blackholeSettings']);
    const poolData = result.poolData || [];
    const settings = result.blackholeSettings || {};
    const userVotingPower = settings.votingPower || null;

    if (poolData.length > 0) {
      // Create a map for quick lookup
      const poolMap = new Map();
      poolData.forEach(data => {
        poolMap.set(data.pool_id?.toLowerCase(), new Pool(data));
      });

      // Sort selectedPools based on metrics
      selectedPools.sort((a, b) => {
        const poolA = poolMap.get(a.poolId?.toLowerCase());
        const poolB = poolMap.get(b.poolId?.toLowerCase());
        
        if (!poolA) return 1;
        if (!poolB) return -1;

        // Use profitability score or estimated rewards for sorting
        if (userVotingPower) {
          return poolB.estimateUserRewards(userVotingPower) - poolA.estimateUserRewards(userVotingPower);
        } else {
          return poolB.profitabilityScore() - poolA.profitabilityScore();
        }
      });
      console.log('Sorted selected pools by metrics for vote distribution');
    }
  } catch (err) {
    console.warn('Could not sort pools by metrics, using default order:', err);
  }
  
  // Calculate even percentage split (100% / number of pools)
  const percentagePerPool = 100 / selectedPools.length;
  const roundedPercentage = Math.round(percentagePerPool * 100) / 100; // Round to 2 decimal places
  
  console.log(`Splitting 100% voting power across ${selectedPools.length} pools: ~${roundedPercentage}% each`);
  
  // Try to find and open the vote dialog/modal
  // Look for VOTE button and click it if dialog isn't already open
  const voteButton = document.querySelector('button.btn.yellow-btn.vote-btn') ||
                    document.querySelector('button[class*="vote-btn"]') ||
                    Array.from(document.querySelectorAll('button')).find(btn => 
                      btn.textContent && btn.textContent.trim().toUpperCase().includes('VOTE')
                    );
  
  // Check if dialog is already open by looking for "VOTING" title or voting power inputs
  const votingDialog = document.querySelector('[class*="modal"], [class*="dialog"], [class*="overlay"]');
  const hasVotingTitle = votingDialog && (votingDialog.textContent || '').includes('VOTING');
  const hasVotingInputs = document.querySelector('input[placeholder*="%" i], input[type="text"]') && 
                          document.querySelector('input[type="text"]')?.closest('[class*="pool"], [class*="row"]');
  
  if (voteButton && !hasVotingTitle && !hasVotingInputs) {
    voteButton.click();
    // Wait for dialog to open
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  
  // First, find the voting dialog and all pool rows within it
  const votingDialogs = Array.from(document.querySelectorAll('[class*="modal"], [class*="dialog"], [class*="overlay"]'))
    .filter(dialog => dialog.textContent && dialog.textContent.includes('VOTING'));
  
  // If no voting dialog found, search entire document
  let allPoolRows = [];
  if (votingDialogs.length > 0) {
    for (const dialog of votingDialogs) {
      const rows = Array.from(dialog.querySelectorAll('*')).filter(el => {
        // Look for elements that contain pool addresses and have voting power inputs
        const hasPoolAddress = selectedPools.some(pool => 
          el.innerHTML.includes(pool.poolId) || el.textContent.includes(pool.poolId)
        );
        const hasInput = el.querySelector('input[type="text"], input[type="number"]');
        return hasPoolAddress && hasInput;
      });
      allPoolRows.push(...rows);
    }
  }
  
  // If still no rows found, search entire document
  if (allPoolRows.length === 0) {
    allPoolRows = Array.from(document.querySelectorAll('*')).filter(el => {
      const hasPoolAddress = selectedPools.some(pool => 
        el.innerHTML.includes(pool.poolId) || el.textContent.includes(pool.poolId)
      );
      const hasInput = el.querySelector('input[type="text"], input[type="number"]');
      return hasPoolAddress && hasInput;
    });
  }
  
  console.log(`Found ${allPoolRows.length} potential pool rows in voting dialog`);
  
  // Match each selected pool to its row and find its input
  const poolInputs = [];
  const usedInputs = new Set(); // Track inputs we've already matched
  
  // Calculate percentages with smart rounding to distribute evenly
  // Voting inputs only accept 1 decimal place, so we use 1 decimal precision
  const basePercentage = 100 / selectedPools.length;
  const percentages = [];
  
  // Round base percentage to 1 decimal place
  const baseRounded = Math.round(basePercentage * 10) / 10;
  
  // Calculate what the total would be if we used baseRounded for all
  const totalIfAllBase = baseRounded * selectedPools.length;
  const remainder = Math.round((100 - totalIfAllBase) * 10) / 10;
  
  // Distribute the remainder: adjust by 0.1 for first |remainder * 10| pools
  const poolsToAdjust = Math.round(Math.abs(remainder) * 10);
  const adjustment = remainder > 0 ? 0.1 : -0.1;
  
  for (let i = 0; i < selectedPools.length; i++) {
    let pct = baseRounded;
    // Apply adjustment to first pools to account for rounding remainder
    if (i < poolsToAdjust) {
      pct += adjustment;
    }
    percentages.push(Math.round(pct * 10) / 10);
  }
  
  // Final check: ensure total is exactly 100% by adjusting the last pool
  const total = percentages.reduce((sum, p) => sum + p, 0);
  if (Math.abs(total - 100) > 0.01) {
    const diff = 100 - total;
    percentages[percentages.length - 1] = Math.round((percentages[percentages.length - 1] + diff) * 10) / 10;
  }
  
  for (let i = 0; i < selectedPools.length; i++) {
    const pool = selectedPools[i];
    const percentageToAllocate = percentages[i];
    
    // Find the row that contains this pool's address
    let matchedRow = null;
    for (const row of allPoolRows) {
      if ((row.innerHTML.includes(pool.poolId) || row.textContent.includes(pool.poolId)) &&
          !usedInputs.has(row)) {
        matchedRow = row;
        break;
      }
    }
    
    if (!matchedRow) {
      console.warn(`Could not find row for pool ${pool.poolId}`);
      continue;
    }
    
    // Find the voting power input in this row
    let allocationInput = null;
    const inputs = matchedRow.querySelectorAll('input[type="text"], input[type="number"]');
    
    for (const input of inputs) {
      // Skip if we've already used this input
      if (usedInputs.has(input)) continue;
      
      // Check if this input is for voting power (has "%" nearby or "Voting Power" label)
      const parent = input.parentElement;
      const parentText = parent.textContent || '';
      const siblings = Array.from(parent.children || []);
      const hasPercentSymbol = siblings.some(sib => sib.textContent && sib.textContent.includes('%')) ||
                              parentText.includes('%');
      const hasVotingPowerLabel = parentText.includes('Voting Power');
      
      // Check nearby elements
      const prevSibling = input.previousElementSibling;
      const nextSibling = input.nextElementSibling;
      const nearbyText = (prevSibling?.textContent || '') + (nextSibling?.textContent || '');
      
      if (hasPercentSymbol || hasVotingPowerLabel || nearbyText.includes('Voting Power') || nearbyText.includes('%')) {
        allocationInput = input;
        break;
      }
    }
    
    // Fallback: use the first unused input in the row
    if (!allocationInput && inputs.length > 0) {
      for (const input of inputs) {
        if (!usedInputs.has(input)) {
          allocationInput = input;
          break;
        }
      }
    }
    
    if (allocationInput) {
      poolInputs.push({
        pool: pool,
        input: allocationInput,
        percentage: percentageToAllocate
      });
      usedInputs.add(allocationInput);
      usedInputs.add(matchedRow);
      console.log(`Matched pool ${pool.poolId} to input, will allocate ${percentageToAllocate}%`);
    } else {
      console.warn(`Could not find voting power input for pool ${pool.poolId} in matched row`);
    }
  }
  
  // Now fill all the inputs
  let filledCount = 0;
  for (const poolInput of poolInputs) {
    try {
      // Scroll input into view
      poolInput.input.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Focus and set value (percentage, not absolute votes)
      poolInput.input.focus();
      poolInput.input.value = poolInput.percentage.toString();
      
      // Trigger input events to ensure React/UI updates
      poolInput.input.dispatchEvent(new Event('input', { bubbles: true }));
      poolInput.input.dispatchEvent(new Event('change', { bubbles: true }));
      
      // Also try setting value property directly (for React controlled components)
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      if (valueSetter) {
        valueSetter.call(poolInput.input, poolInput.percentage.toString());
        poolInput.input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      
      filledCount++;
      console.log(`✓ Allocated ${poolInput.percentage}% to pool ${poolInput.pool.poolId}`);
      
      // Small delay between inputs
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (e) {
      console.warn(`Error setting percentage for pool ${poolInput.pool.poolId}:`, e);
    }
  }
  
  // Show feedback
  const contentEl = document.getElementById('blackhole-tools-content');
  if (contentEl) {
    const originalHTML = contentEl.innerHTML;
    if (filledCount > 0) {
      contentEl.innerHTML = `<p style="color: #32cd32; text-align: center; padding: 20px;">✓ Split 100% voting power across ${filledCount} pool(s)<br><small style="color: #999;">~${roundedPercentage}% per pool</small></p>`;
    } else {
      contentEl.innerHTML = `<p style="color: #ff8c00; text-align: center; padding: 20px;">⚠️ Could not find vote allocation inputs.<br><small>Make sure the voting dialog is open and pools are selected.</small></p>`;
    }
    setTimeout(() => {
      contentEl.innerHTML = originalHTML;
      updateOverlay();
    }, 3000);
  }
}

// Toggle the in-page voting modal (show/hide)
async function toggleVotePanel() {
  // Check if modal is already open and visible
  const modal = document.querySelector('.voting-modal, .sc-modal-overlay.show');
  const isVisible = !!(modal && (modal.offsetParent !== null || window.getComputedStyle(modal).display !== 'none'));
  
  if (isVisible) {
    // Modal is open, try to close it
    console.log('Closing vote window...');
    // Try multiple close button selectors from the provided HTML
    const closeBtn = modal.querySelector('.sc-modal-close') || 
                     modal.querySelector('.modal-close.clickable') || 
                     modal.querySelector('.modal-close') ||
                     Array.from(modal.querySelectorAll('div, span, button')).find(el => 
                       el.textContent === '×' || el.classList.contains('clickable') && el.textContent === '×'
                     );
    
    if (closeBtn) {
      closeBtn.click();
      console.log('✓ Clicked close button');
      return false; // Now closed
    }
    
    // Fallback: click the overlay background to close
    modal.click();
    return false;
  }

  // Modal is closed, try to find and click the main VOTE button to open it
  const voteButton = document.querySelector('button.btn.yellow-btn.clickable.vote-btn') ||
                     document.querySelector('.vote-btn') ||
                     Array.from(document.querySelectorAll('button')).find(btn => {
                       const text = btn.textContent ? btn.textContent.trim().toUpperCase() : '';
                       return text === 'VOTE' || (text.includes('VOTE') && btn.classList.contains('yellow-btn'));
                     });

  if (voteButton) {
    voteButton.click();
    console.log('✓ Opened vote window via VOTE button click');
    return true; // Now open
  } else {
    console.error('Vote button not found. Available buttons:', Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()));
    throw new Error('Vote button not found on page');
  }
}

// Select or deselect a single pool by ID
async function selectSinglePool(poolId) {
  if (!poolId) {
    console.warn('No pool ID provided');
    return;
  }
  
  // First check if the pool is already selected
  const isSelected = isPoolSelected(poolId);
  
  // Try to find the pool in currently visible cells
  let poolCell = null;
  const poolCells = document.querySelectorAll('div.liquidity-pool-cell');
  
  for (let cell of poolCells) {
    const innerHTML = cell.innerHTML || '';
    const innerText = cell.innerText || '';
    
    if (innerHTML.includes(poolId) || innerText.includes(poolId)) {
      poolCell = cell;
      break;
    }
  }
  
  // If pool not found in visible cells, try to scroll/find it
  if (!poolCell) {
    // Try to find it by searching all elements (including those not in viewport)
    // Some pools might be in collapsed sections or different pages
    const allCells = document.querySelectorAll('div.liquidity-pool-cell');
    for (let cell of allCells) {
      const innerHTML = cell.innerHTML || '';
      const innerText = cell.innerText || '';
      
      if (innerHTML.includes(poolId) || innerText.includes(poolId)) {
        poolCell = cell;
        // Scroll the pool into view
        poolCell.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Wait a bit for scroll to complete
        await new Promise(resolve => setTimeout(resolve, 300));
        break;
      }
    }
  }
  
  if (!poolCell) {
    console.warn(`Could not find pool: ${poolId} in DOM`);
    if (isSelected) {
      // Pool is selected but not in DOM - might be on a different pagination page
      // Try to find it by searching through all possible elements, including hidden ones
      // Some pools might be in collapsed sections or on different pages
      const allPossibleCells = document.querySelectorAll('div[class*="liquidity-pool-cell"], div[class*="pool-cell"]');
      for (let cell of allPossibleCells) {
        const innerHTML = cell.innerHTML || '';
        if (innerHTML.includes(poolId)) {
          poolCell = cell;
          // Try to make it visible and scroll to it
          if (cell.style.display === 'none') {
            cell.style.display = '';
          }
          cell.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await new Promise(resolve => setTimeout(resolve, 500));
          break;
        }
      }
    }
    
    if (!poolCell) {
      if (isSelected) {
        // Pool is selected but not found - show helpful message
        alert(`Pool ${poolId} is selected but not currently visible on this page.\n\nThis pool may be on a different page. Use "Clear All" to deselect all pools, or navigate to find this pool manually.`);
      } else {
        alert(`Could not find pool ${poolId} on the page. Make sure the pool is visible.`);
      }
      return;
    }
  }
  
  // If pool is selected, find and click the "CLEAR" link
  // If pool is not selected, find and click the "SELECT" button
  if (isSelected) {
    // Pool is selected - look for "CLEAR" link/button
    // IMPORTANT: Must check text content to avoid clicking "Add Incentives" link
    // "CLEAR" is in select-to-vote-container, "Add Incentives" is in incentives section
    const selectContainer = poolCell.querySelector('.select-to-vote-container');
    let clearLink = null;
    
    if (selectContainer) {
      // Look for CLEAR link specifically in the select-to-vote-container
      // It should be a div with class "voting-pool-add-incentives" that contains "CLEAR" text
      const allLinks = selectContainer.querySelectorAll('.voting-pool-add-incentives, div, button, a');
      for (const link of allLinks) {
        const text = link.textContent ? link.textContent.trim().toUpperCase() : '';
        if (text === 'CLEAR') {
          clearLink = link;
          break;
        }
      }
    }
    
    // Fallback: search entire cell for CLEAR (but not Add Incentives)
    if (!clearLink) {
      const allClickables = poolCell.querySelectorAll('.voting-pool-add-incentives, div.clickable, button, a');
      for (const link of allClickables) {
        const text = link.textContent ? link.textContent.trim().toUpperCase() : '';
        // Make sure it says CLEAR and NOT "Add Incentives"
        if (text === 'CLEAR' && !text.includes('ADD') && !text.includes('INCENTIVE')) {
          clearLink = link;
          break;
        }
      }
    }
    
    if (clearLink) {
      try {
        clearLink.click();
        console.log(`✓ Deselected pool: ${poolId}`);
        // Update overlay to show updated state
        setTimeout(() => updateOverlay(), 300);
      } catch (e) {
        console.warn(`Error clicking CLEAR for pool ${poolId}:`, e);
      }
    } else {
      console.warn(`Could not find CLEAR button for selected pool: ${poolId}`);
    }
  } else {
    // Pool is not selected - find and click the SELECT button
    const selectButton = poolCell.querySelector('button.btn.yellow-btn.clickable') ||
                        poolCell.querySelector('button.btn.yellow-btn') ||
                        poolCell.querySelector('.liquidity-pool-cell-btn button') ||
                        poolCell.querySelector('.liquidity-pool-cell-right button') ||
                        poolCell.querySelector('button[class*="yellow-btn"]') ||
                        poolCell.querySelector('button:not([disabled])');
    
    if (selectButton && !selectButton.disabled) {
      try {
        selectButton.click();
        console.log(`✓ Selected pool: ${poolId}`);
        // Update overlay to show selected state
        setTimeout(() => updateOverlay(), 300);
      } catch (e) {
        console.warn(`Error clicking SELECT button for pool ${poolId}:`, e);
      }
    } else {
      console.warn(`Could not find SELECT button for pool: ${poolId}`);
    }
  }
}
