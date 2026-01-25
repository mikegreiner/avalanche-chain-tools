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
 * RpcPoolProvider.js
 * 
 * High-level pool data provider using RPC calls instead of DOM scraping.
 * Provides the same interface as existing pool providers but 20x faster.
 */

console.log('[RPC] RpcPoolProvider.js loading...');

class RpcPoolProvider {
  constructor() {
    this.client = new BlackholeRpcClient();
    this.pools = [];
    this.totalVotes = 0;
    this.blackPrice = 0;
    this.lastFetchTimestamp = 0;
    this.isFetching = false;
  }

  /**
   * Fetch all pool data
   * @param {Object} options - Fetch options
   * @param {boolean} options.includeGauges - Whether to fetch gauge data (slower)
   * @param {number} options.limit - Max number of pools to fetch
   * @returns {Promise<Array>} - Array of pool objects
   */
  async fetchAllPools(options = {}) {
    const { includeGauges = true, limit = 100 } = options;

    if (this.isFetching) {
      console.log('Already fetching pools, waiting...');
      // Wait for current fetch to complete
      while (this.isFetching) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return this.pools;
    }

    this.isFetching = true;

    try {
      console.log('[RpcPoolProvider] Starting pool fetch...');
      const startTime = Date.now();

      // Step 1: Fetch pool metadata from static API (need this first for token list)
      console.log('[RpcPoolProvider] Fetching CL pool metadata...');
      const metadata = await this.client.fetchClPoolsMetadata();
      console.log(`[RpcPoolProvider] Found ${metadata.length} CL pools`);

      // Step 2: Extract all unique token addresses and cache decimals
      const tokenAddresses = new Set();
      for (const pool of metadata) {
        if (pool.token0?.id) {
          tokenAddresses.add(pool.token0.id.toLowerCase());
          this.client.setTokenDecimals(pool.token0.id, parseInt(pool.token0.decimals || 18));
        }
        if (pool.token1?.id) {
          tokenAddresses.add(pool.token1.id.toLowerCase());
          this.client.setTokenDecimals(pool.token1.id, parseInt(pool.token1.decimals || 18));
        }
      }
      console.log(`[RpcPoolProvider] Found ${tokenAddresses.size} unique tokens`);

      // Step 3: Fetch all token prices in one batch
      console.log('[RpcPoolProvider] Fetching token prices from DeFiLlama...');
      await this.client.fetchTokenPrices([...tokenAddresses]);
      this.blackPrice = await this.client.getBlackPrice();
      const avaxPrice = this.client.getTokenPrice(this.client.TOKENS.WAVAX);
      
      // Count how many tokens have prices
      let pricedTokens = 0;
      for (const addr of tokenAddresses) {
        if (this.client.getTokenPrice(addr) > 0) pricedTokens++;
      }
      console.log(`[RpcPoolProvider] Got prices for ${pricedTokens}/${tokenAddresses.size} tokens, BLACK: $${this.blackPrice.toFixed(5)}, AVAX: $${avaxPrice.toFixed(2)}`);

      // Step 4: Fetch total votes
      console.log('[RpcPoolProvider] Fetching total votes...');
      this.totalVotes = await this.client.getTotalVotes();
      console.log(`[RpcPoolProvider] Total votes: ${this.totalVotes.toLocaleString()}`);

      // Step 4: Process pools (limit if requested)
      const poolsToProcess = metadata.slice(0, limit);
      this.pools = [];

      console.log(`[RpcPoolProvider] Processing ${poolsToProcess.length} pools...`);

      // Batch process pools for better performance
      const batchSize = 10;
      for (let i = 0; i < poolsToProcess.length; i += batchSize) {
        const batch = poolsToProcess.slice(i, i + batchSize);
        
        const batchPromises = batch.map(async (meta) => {
          try {
            const pool = await this.client.buildPoolData(
              meta.id,
              meta,
              this.blackPrice
            );
            
            // Calculate vote share
            pool.voteShare = this.totalVotes > 0 
              ? (pool.votes / this.totalVotes) * 100 
              : 0;
            
            return pool;
          } catch (error) {
            console.error(`Failed to process pool ${meta.id}:`, error);
            return null;
          }
        });

        const results = await Promise.all(batchPromises);
        this.pools.push(...results.filter(p => p !== null));

        console.log(`[RpcPoolProvider] Processed ${Math.min(i + batchSize, poolsToProcess.length)}/${poolsToProcess.length} pools`);
      }

      const elapsed = Date.now() - startTime;
      console.log(`[RpcPoolProvider] ✓ Fetched ${this.pools.length} pools in ${elapsed}ms`);

      this.lastFetchTimestamp = Date.now();
      return this.pools;

    } catch (error) {
      console.error('[RpcPoolProvider] Fetch failed:', error);
      throw error;
    } finally {
      this.isFetching = false;
    }
  }

  /**
   * Get pools sorted by a specific field
   * @param {string} sortBy - Field to sort by (vapr, votes, tvl)
   * @param {boolean} ascending - Sort direction
   * @returns {Array} - Sorted pools
   */
  getSortedPools(sortBy = 'vapr', ascending = false) {
    const sorted = [...this.pools].sort((a, b) => {
      const aVal = a[sortBy] || 0;
      const bVal = b[sortBy] || 0;
      return ascending ? aVal - bVal : bVal - aVal;
    });
    return sorted;
  }

  /**
   * Get top N pools by VAPR
   * @param {number} count - Number of pools to return
   * @returns {Array} - Top pools
   */
  getTopPoolsByVapr(count = 10) {
    return this.getSortedPools('vapr', false).slice(0, count);
  }

  /**
   * Get top N pools by votes
   * @param {number} count - Number of pools to return
   * @returns {Array} - Top pools
   */
  getTopPoolsByVotes(count = 10) {
    return this.getSortedPools('votes', false).slice(0, count);
  }

  /**
   * Find pool by address
   * @param {string} address - Pool address
   * @returns {Object|null} - Pool object or null
   */
  findPoolByAddress(address) {
    const addrLower = address.toLowerCase();
    return this.pools.find(p => p.address.toLowerCase() === addrLower) || null;
  }

  /**
   * Search pools by name or address
   * @param {string} query - Search query
   * @returns {Array} - Matching pools
   */
  searchPools(query) {
    const queryLower = query.toLowerCase();
    return this.pools.filter(p => 
      p.name.toLowerCase().includes(queryLower) ||
      p.address.toLowerCase().includes(queryLower) ||
      p.token0.symbol.toLowerCase().includes(queryLower) ||
      p.token1.symbol.toLowerCase().includes(queryLower)
    );
  }

  /**
   * Check if data is stale
   * @param {number} maxAgeMs - Max age in milliseconds
   * @returns {boolean} - True if data is stale
   */
  isStale(maxAgeMs = 300000) { // Default 5 minutes
    return Date.now() - this.lastFetchTimestamp > maxAgeMs;
  }

  /**
   * Get pool statistics
   * @returns {Object} - Stats object
   */
  getStats() {
    const poolsWithGauges = this.pools.filter(p => p.gauge !== null).length;
    const poolsWithVotes = this.pools.filter(p => p.votes > 0).length;
    const avgVapr = this.pools.length > 0
      ? this.pools.reduce((sum, p) => sum + p.vapr, 0) / this.pools.length
      : 0;
    const totalTvl = this.pools.reduce((sum, p) => sum + p.tvl, 0);

    return {
      totalPools: this.pools.length,
      poolsWithGauges,
      poolsWithVotes,
      totalVotes: this.totalVotes,
      totalTvl,
      avgVapr,
      blackPrice: this.blackPrice,
      lastFetch: new Date(this.lastFetchTimestamp).toISOString(),
    };
  }

  /**
   * Format pool data for display
   * @param {Object} pool - Pool object
   * @returns {Object} - Formatted data
   */
  formatPoolForDisplay(pool) {
    return {
      address: pool.address,
      name: pool.name,
      tvl: `$${pool.tvl.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
      votes: pool.votes > 1e6 
        ? `${(pool.votes / 1e6).toFixed(2)}M`
        : pool.votes.toLocaleString(undefined, { maximumFractionDigits: 0 }),
      voteShare: `${pool.voteShare.toFixed(2)}%`,
      vapr: `${pool.vapr.toFixed(1)}%`,
      weeklyRewards: `$${pool.weeklyRewards.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
      hasGauge: pool.gauge !== null,
    };
  }

  /**
   * Export pools to JSON
   * @returns {string} - JSON string
   */
  exportToJson() {
    return JSON.stringify({
      timestamp: new Date(this.lastFetchTimestamp).toISOString(),
      blackPrice: this.blackPrice,
      totalVotes: this.totalVotes,
      pools: this.pools,
      stats: this.getStats(),
    }, null, 2);
  }

  /**
   * Clear cached data
   */
  clearCache() {
    this.pools = [];
    this.totalVotes = 0;
    this.blackPrice = 0;
    this.lastFetchTimestamp = 0;
    console.log('[RpcPoolProvider] Cache cleared');
  }
}

console.log('[RPC] RpcPoolProvider loaded successfully, class available:', typeof RpcPoolProvider !== 'undefined');

// --- From rpc-rewards-provider.js ---
/**
 * RPC Rewards Provider
 * Gets rewards by intercepting multicall responses and extracting values
 * This is a hybrid approach: we intercept the site's multicalls and extract rewards
 */


const RPC_URL = 'https://api.avax.network/ext/bc/C/rpc';
const MULTICALL3_ADDRESS = '0xca11bde05977b3631167028862be2a173976ca11';
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

// --- From vamm-samm-data.js ---
/**
 * vAMM/sAMM Pool Data
 * 
 * Static pool data for vAMM (volatile AMM) and sAMM (stable AMM) pools.
 * Generated from GAUGE_MANAGER enumeration.
 * 
 * Generated: 2026-01-25T06:23:10.696128+00:00
 * vAMM pools: 75
 * sAMM pools: 9
 */

const VAMM_SAMM_POOLS = [
  {
    "id": "0x495b296c3fc52283fd9565b421386d36f628d55e",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0x6aa38edd7f32a28b7b2c2dc86fc5b0bf2ae61579",
      "symbol": "CHAMP",
      "decimals": "18"
    },
    "token1": {
      "id": "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e",
      "symbol": "USDC",
      "decimals": "6"
    },
    "gauge": "0x6de3cf0586b964761ad6b6e9c2feaabe5802a528"
  },
  {
    "id": "0x9d848cf080c46b92b797218835ae7e89e04c1515",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0x09fa58228bb791ea355c90da1e4783452b9bd8c3",
      "symbol": "SUPER",
      "decimals": "18"
    },
    "token1": {
      "id": "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e",
      "symbol": "USDC",
      "decimals": "6"
    },
    "gauge": "0x3ca186d289242cc0ee292c74ab5f7ed2747ebcce"
  },
  {
    "id": "0x5a758f607542c8a12aadc29f74dfba5f14df00b3",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0xacfb898cff266e53278cc0124fc2c7c94c8cb9a5",
      "symbol": "NOCHILL",
      "decimals": "18"
    },
    "token1": {
      "id": "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7",
      "symbol": "WAVAX",
      "decimals": "18"
    },
    "gauge": "0xb49c396d693f6bd06a124c59ff24d360d8cbcf56"
  },
  {
    "id": "0x0e5aad7522acf208c5f691d3f20af0c26d1d669a",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0x5c09a9ce08c4b332ef1cc5f7cadb1158c32767ce",
      "symbol": "fBOMB",
      "decimals": "18"
    },
    "token1": {
      "id": "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7",
      "symbol": "WAVAX",
      "decimals": "18"
    },
    "gauge": "0xf8fcd596cdabf21dbde29052fdf06a72b85ae697"
  },
  {
    "id": "0x921ca54e1d32008c25b352bb75aa00593288f1b3",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0x49d5c2bdffac6ce2bfdb6640f4f80f226bc10bab",
      "symbol": "WETH.e",
      "decimals": "18"
    },
    "token1": {
      "id": "0x5c09a9ce08c4b332ef1cc5f7cadb1158c32767ce",
      "symbol": "fBOMB",
      "decimals": "18"
    },
    "gauge": "0xb4543cb100fff235280e74b748764d45ea1a5a97"
  },
  {
    "id": "0x9d8a9fdf8890942e2b2364b843116bee8920a506",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0x9b9fd410d5f01a6a60acf4678a5a99d8027fa5a7",
      "symbol": "MYTH",
      "decimals": "18"
    },
    "token1": {
      "id": "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e",
      "symbol": "USDC",
      "decimals": "6"
    },
    "gauge": "0x5c51be155d9f63aa17a9f2cedc452b4ade28fde6"
  },
  {
    "id": "0x152e06cce8049f1e42ffd0c0cf842b9ffca6035b",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0x9b3a8159e119eb09822115ae08ee1526849e1116",
      "symbol": "MMA",
      "decimals": "18"
    },
    "token1": {
      "id": "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7",
      "symbol": "WAVAX",
      "decimals": "18"
    },
    "gauge": "0x4f0fa660d9a6747a135411cbdd6e57d81fcecc94"
  },
  {
    "id": "0x7c0781874f5f0e78a920b7a8c840813c69c6e746",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0x152b9d0fdc40c096757f570a51e494bd4b943e50",
      "symbol": "BTC.b",
      "decimals": "8"
    },
    "token1": {
      "id": "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7",
      "symbol": "WAVAX",
      "decimals": "18"
    },
    "gauge": "0x08b68f884c2d323cdc5f15804569888c4c0ce83e"
  },
  {
    "id": "0x737f1cab9cd97c40bbe4d59c85b0d2c1fdbaa37d",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0x49d5c2bdffac6ce2bfdb6640f4f80f226bc10bab",
      "symbol": "WETH.e",
      "decimals": "18"
    },
    "token1": {
      "id": "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7",
      "symbol": "WAVAX",
      "decimals": "18"
    },
    "gauge": "0x1cff2d0e05b2635480c9e87043434988d9594fce"
  },
  {
    "id": "0x2625e03748213f82485061ac17f22d84b5312ec0",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0x79bbf4508b1391af3a0f4b30bb5fc4aa9ab0e07c",
      "symbol": "Anon",
      "decimals": "18"
    },
    "token1": {
      "id": "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7",
      "symbol": "WAVAX",
      "decimals": "18"
    },
    "gauge": "0x5f4810694a639e084b4470a895396c4bb8eeba1b"
  },
  {
    "id": "0x409985a488f7b1a79d964398d827b450a33a86a0",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0x8729438eb15e2c8b576fcc6aecda6a148776c0f5",
      "symbol": "QI",
      "decimals": "18"
    },
    "token1": {
      "id": "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7",
      "symbol": "WAVAX",
      "decimals": "18"
    },
    "gauge": "0x9d2a42743cb5baaab1ede8a6f0a777e4c1ffc052"
  },
  {
    "id": "0x7c1db2f875dcbeb509757dc0f442312a7425e56e",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0x46b9144771cb3195d66e4eda643a7493fadcaf9d",
      "symbol": "BLS",
      "decimals": "18"
    },
    "token1": {
      "id": "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e",
      "symbol": "USDC",
      "decimals": "6"
    },
    "gauge": "0xd6d083d2f9b4c9c0e4672c33973683ff2ee75bff"
  },
  {
    "id": "0x202b3e7af2635bbde922582909df6ebccf244d2a",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7",
      "symbol": "WAVAX",
      "decimals": "18"
    },
    "token1": {
      "id": "0xffff003a6bad9b743d658048742935fffe2b6ed7",
      "symbol": "KET",
      "decimals": "18"
    },
    "gauge": "0x2f48e25f8381b6b2828127542804e8c7f29181bc"
  },
  {
    "id": "0x758909881a386e30e39490664f85f2247417c0de",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0x34a528da3b2ea5c6ad1796eba756445d1299a577",
      "symbol": "ID",
      "decimals": "18"
    },
    "token1": {
      "id": "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7",
      "symbol": "WAVAX",
      "decimals": "18"
    },
    "gauge": "0x884853411a52f0e09d282466609c3660b98f62fd"
  },
  {
    "id": "0x6d75a6fa7c7d95051b62f2858113634e63420ba0",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0x26debd39d5ed069770406fca10a0e4f8d2c743eb",
      "symbol": "GUN",
      "decimals": "18"
    },
    "token1": {
      "id": "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e",
      "symbol": "USDC",
      "decimals": "6"
    },
    "gauge": "0xbab6926da761a6376f15b16f9d740f4927340136"
  },
  {
    "id": "0x04a954bc8af9a1fdc2ce5f3192bdca369a4512cc",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0x432d38f83a50ec77c409d086e97448794cf76dcf",
      "symbol": "HERESY",
      "decimals": "18"
    },
    "token1": {
      "id": "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7",
      "symbol": "WAVAX",
      "decimals": "18"
    },
    "gauge": "0xdf45c39e247fcd2dcd7697b42016337547f3aa0e"
  },
  {
    "id": "0x419b7d20c1dabaa6fb333c07bf0a006bd6bf3600",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0x9209e7ebd056d72c5996220e99df6049253debcf",
      "symbol": "MEOW",
      "decimals": "18"
    },
    "token1": {
      "id": "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7",
      "symbol": "WAVAX",
      "decimals": "18"
    },
    "gauge": "0x20dec7b989b6972d96ceaad820ed0440c0009513"
  },
  {
    "id": "0x4c33a727e3744009f7413d2d1fbbad77d7df207f",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0x420fca0121dc28039145009570975747295f2329",
      "symbol": "COQ",
      "decimals": "18"
    },
    "token1": {
      "id": "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7",
      "symbol": "WAVAX",
      "decimals": "18"
    },
    "gauge": "0x063acccd367a4269077be9f89f2866dedd5bf462"
  },
  {
    "id": "0x4f905251040d1b31cd7eff74ef0c91bbf08022c0",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0x6f43ff77a9c0cf552b5b653268fbfe26a052429b",
      "symbol": "LAMBO",
      "decimals": "18"
    },
    "token1": {
      "id": "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7",
      "symbol": "WAVAX",
      "decimals": "18"
    },
    "gauge": "0xced0e15dfa87806c0bdc5d88023220381c392273"
  },
  {
    "id": "0x1131d1e669f6652cffe404213bfd0cc6b4676b48",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7",
      "symbol": "WAVAX",
      "decimals": "18"
    },
    "token1": {
      "id": "0xb8d7710f7d8349a506b75dd184f05777c82dad0c",
      "symbol": "ARENA",
      "decimals": "18"
    },
    "gauge": "0x3a88eb1133b4f85160126ba7c2ba3d75f39e2957"
  },
  {
    "id": "0x6be0fa795883493bdc0fff1eb7d13abe64079ec6",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0x2b2c81e08f1af8835a78bb2a90ae924ace0ea4be",
      "symbol": "sAVAX",
      "decimals": "18"
    },
    "token1": {
      "id": "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7",
      "symbol": "WAVAX",
      "decimals": "18"
    },
    "gauge": "0xdc7f54f96a110b09aa2e4af8eef01c104617e799"
  },
  {
    "id": "0x3afadc8477fc516dcd05259baee96ec586174ff4",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0x153374c6d6786b6ca2c4bc96f9c3a471428f2bc7",
      "symbol": "WILD",
      "decimals": "18"
    },
    "token1": {
      "id": "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7",
      "symbol": "WAVAX",
      "decimals": "18"
    },
    "gauge": "0xd42a7e2016960966a278ac2027bb86853b3ad796"
  },
  {
    "id": "0x624e692595dfa46974179b39b9c23f664e9a23c3",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0x5ddc8d968a94cf95cfeb7379f8372d858b9c797d",
      "symbol": "WOLFI",
      "decimals": "18"
    },
    "token1": {
      "id": "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7",
      "symbol": "WAVAX",
      "decimals": "18"
    },
    "gauge": "0x982a5c48b210c11d0ff56ffd630d40c74ebe5680"
  },
  {
    "id": "0x955514594f1b43514156c1c9e7a89cbd4815c172",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0xb02f37a282c028958de65711158422199a61e9ae",
      "symbol": "SFUND",
      "decimals": "18"
    },
    "token1": {
      "id": "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7",
      "symbol": "WAVAX",
      "decimals": "18"
    },
    "gauge": "0x37179b4dad8f8f02a2582b4a239b9cd1304f344c"
  },
  {
    "id": "0x4a930a63b13e6683a204cb10ef20f68310231459",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0x09fa58228bb791ea355c90da1e4783452b9bd8c3",
      "symbol": "SUPER",
      "decimals": "18"
    },
    "token1": {
      "id": "0xcd94a87696fac69edae3a70fe5725307ae1c43f6",
      "symbol": "BLACK",
      "decimals": "18"
    },
    "gauge": "0x349fc3d5ef17524f69f68ba8ff50a947479989eb"
  },
  {
    "id": "0x0d9fd6dd9b1ff55fb0a9bb0e5f1b6a2d65b741a3",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e",
      "symbol": "USDC",
      "decimals": "6"
    },
    "token1": {
      "id": "0xcd94a87696fac69edae3a70fe5725307ae1c43f6",
      "symbol": "BLACK",
      "decimals": "18"
    },
    "gauge": "0x7ebc43b2f0aa6f15b0050d504313814345bc08fb"
  },
  {
    "id": "0x14e4a5bed2e5e688ee1a5ca3a4914250d1abd573",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7",
      "symbol": "WAVAX",
      "decimals": "18"
    },
    "token1": {
      "id": "0xcd94a87696fac69edae3a70fe5725307ae1c43f6",
      "symbol": "BLACK",
      "decimals": "18"
    },
    "gauge": "0x5a8b3e88383767f477bd016e86c0d8de2a6ae82c"
  },
  {
    "id": "0x15c79629b9e2508726385b013dd5f550db0d49d9",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0x59414b3089ce2af0010e7523dea7e2b35d776ec7",
      "symbol": "YAK",
      "decimals": "18"
    },
    "token1": {
      "id": "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7",
      "symbol": "WAVAX",
      "decimals": "18"
    },
    "gauge": "0x7d59d7844bd36af53ae3b81ec7c904f8ab64658e"
  },
  {
    "id": "0x8b8961133d63d8c5f7b84bdc359d1c04f99a9cfb",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0x13af0fe9eb35e91758b467f95cbc78e16fdd8b6b",
      "symbol": "BYTES",
      "decimals": "18"
    },
    "token1": {
      "id": "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e",
      "symbol": "USDC",
      "decimals": "6"
    },
    "gauge": "0x6843a1d9e3209be90429650de83d5d57fc7c19b3"
  },
  {
    "id": "0x932dc494e571c4588a7e4927aa1c5cfaaa044491",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0x5a3534720a4f29fa0dc53ce474db88973a95f65c",
      "symbol": "UNDEAD",
      "decimals": "18"
    },
    "token1": {
      "id": "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7",
      "symbol": "WAVAX",
      "decimals": "18"
    },
    "gauge": "0xb868d718554a55a01bc517cd7ba7234eee2b886b"
  },
  {
    "id": "0xbf71d22c5092df34bd0b29b4ef717c3aa4d551f9",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0x5a3534720a4f29fa0dc53ce474db88973a95f65c",
      "symbol": "UNDEAD",
      "decimals": "18"
    },
    "token1": {
      "id": "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e",
      "symbol": "USDC",
      "decimals": "6"
    },
    "gauge": "0x05235a49bf810a37a9e3fb9f7972e83f25bd5828"
  },
  {
    "id": "0xaf7b503b9c1d0c7cacbfc984a91dea1a9f8b8fbf",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0x6aa38edd7f32a28b7b2c2dc86fc5b0bf2ae61579",
      "symbol": "CHAMP",
      "decimals": "18"
    },
    "token1": {
      "id": "0xcd94a87696fac69edae3a70fe5725307ae1c43f6",
      "symbol": "BLACK",
      "decimals": "18"
    },
    "gauge": "0x72a0f2cbb0788900faab7b4cc12861607b8037fc"
  },
  {
    "id": "0xc636951478ca5d543dcd26186c39f001d7fb4d1c",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0x6edac263561da41ade155a992759260fafb87b43",
      "symbol": "VERTAI",
      "decimals": "18"
    },
    "token1": {
      "id": "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e",
      "symbol": "USDC",
      "decimals": "6"
    },
    "gauge": "0xe1e46e0588e59cccb1637fc809e6504a79367f35"
  },
  {
    "id": "0xef94b376b0e9cb81287be8114a3c4e81aafa47a5",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0x13af0fe9eb35e91758b467f95cbc78e16fdd8b6b",
      "symbol": "BYTES",
      "decimals": "18"
    },
    "token1": {
      "id": "0xcd94a87696fac69edae3a70fe5725307ae1c43f6",
      "symbol": "BLACK",
      "decimals": "18"
    },
    "gauge": "0x5e6f53b6b9cba6981709d2b4ec5bebc02276a481"
  },
  {
    "id": "0x4d5df15ff7dde069b2ff175f45c845e168b20cd5",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0x5c09a9ce08c4b332ef1cc5f7cadb1158c32767ce",
      "symbol": "fBOMB",
      "decimals": "18"
    },
    "token1": {
      "id": "0xcd94a87696fac69edae3a70fe5725307ae1c43f6",
      "symbol": "BLACK",
      "decimals": "18"
    },
    "gauge": "0x964302d3cb785f96e4b897bd9fe79e99a00d1783"
  },
  {
    "id": "0x403822e6cfa57d10c32a4e910ed740f9ced8c615",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0x5c09a9ce08c4b332ef1cc5f7cadb1158c32767ce",
      "symbol": "fBOMB",
      "decimals": "18"
    },
    "token1": {
      "id": "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e",
      "symbol": "USDC",
      "decimals": "6"
    },
    "gauge": "0x05de8d02562eea9c2b1e717d38f8a04f046f6027"
  },
  {
    "id": "0xc3d792a7b51adeb521cd431ac75831d8c433801a",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0x34a528da3b2ea5c6ad1796eba756445d1299a577",
      "symbol": "ID",
      "decimals": "18"
    },
    "token1": {
      "id": "0xcd94a87696fac69edae3a70fe5725307ae1c43f6",
      "symbol": "BLACK",
      "decimals": "18"
    },
    "gauge": "0x2038c450e5f2a2de77c04b02b153351b7674284c"
  },
  {
    "id": "0x36bece6964782fc1652a8e9a25e6b8756a37323e",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0x00000000efe302beaa2b3e6e1b18d08d69a9012a",
      "symbol": "AUSD",
      "decimals": "6"
    },
    "token1": {
      "id": "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7",
      "symbol": "WAVAX",
      "decimals": "18"
    },
    "gauge": "0xf80feda1cd078e8f58399b1f7b36fa3b0ab95137"
  },
  {
    "id": "0x1dcec3446261334e9bdcb5f4b6e334fd72473d03",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0x67ea3abd5cee0b99d743155051c191b09135f93c",
      "symbol": "AXD",
      "decimals": "18"
    },
    "token1": {
      "id": "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e",
      "symbol": "USDC",
      "decimals": "6"
    },
    "gauge": "0x1f0fa6ec7edb8d589fff51b362039b392b117dbd"
  },
  {
    "id": "0xf2b0f7482685d5cf1f40a3de4abfa2665052fa14",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0xa659d083b677d6bffe1cb704e1473b896727be6d",
      "symbol": "PEPE",
      "decimals": "18"
    },
    "token1": {
      "id": "0xcd94a87696fac69edae3a70fe5725307ae1c43f6",
      "symbol": "BLACK",
      "decimals": "18"
    },
    "gauge": "0x2754d3d85e42050389cb6752945bcfcf905a1a40"
  },
  {
    "id": "0xd2f97b0a08452c8aa4386123c8a32133c2fa6a12",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0xcd94a87696fac69edae3a70fe5725307ae1c43f6",
      "symbol": "BLACK",
      "decimals": "18"
    },
    "token1": {
      "id": "0xeb2729257280580694a06c499cb8c622e74215c8",
      "symbol": "MOG",
      "decimals": "18"
    },
    "gauge": "0x75c3f4d074f6215cac264f480f21d0ef2ec42276"
  },
  {
    "id": "0x8e798638b28d9e677b2c0fa500d93989acf5d717",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0x6f911b6b39bcc665a463129c94b5380a4387b7eb",
      "symbol": "SPX",
      "decimals": "18"
    },
    "token1": {
      "id": "0xcd94a87696fac69edae3a70fe5725307ae1c43f6",
      "symbol": "BLACK",
      "decimals": "18"
    },
    "gauge": "0xcf9786220d859df6a352cbd96d1be40716de0cc1"
  },
  {
    "id": "0x5785c26501355206a7a136d50764d6a31816a9da",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0x9b3a8159e119eb09822115ae08ee1526849e1116",
      "symbol": "MMA",
      "decimals": "18"
    },
    "token1": {
      "id": "0xcd94a87696fac69edae3a70fe5725307ae1c43f6",
      "symbol": "BLACK",
      "decimals": "18"
    },
    "gauge": "0x58fa451d1f31f35b1955d6f98a31e85fc987c530"
  },
  {
    "id": "0x6e6be1750b883b324caaeb97cce819a7d025a817",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0x79bbf4508b1391af3a0f4b30bb5fc4aa9ab0e07c",
      "symbol": "Anon",
      "decimals": "18"
    },
    "token1": {
      "id": "0xcd94a87696fac69edae3a70fe5725307ae1c43f6",
      "symbol": "BLACK",
      "decimals": "18"
    },
    "gauge": "0x495b8951bcc6e6bdfc43f2958d4a14f066ba773f"
  },
  {
    "id": "0x2eda50d933fcff98ff0bbd9913bae53f71fdd68a",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0x49d5c2bdffac6ce2bfdb6640f4f80f226bc10bab",
      "symbol": "WETH.e",
      "decimals": "18"
    },
    "token1": {
      "id": "0x6aa38edd7f32a28b7b2c2dc86fc5b0bf2ae61579",
      "symbol": "CHAMP",
      "decimals": "18"
    },
    "gauge": "0xe7f6f295dd23e206f69217f515228a156049e4d9"
  },
  {
    "id": "0xe89550d1986afd3ea82f9193a24bf5198f77f111",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0xcd94a87696fac69edae3a70fe5725307ae1c43f6",
      "symbol": "BLACK",
      "decimals": "18"
    },
    "token1": {
      "id": "0xffff003a6bad9b743d658048742935fffe2b6ed7",
      "symbol": "KET",
      "decimals": "18"
    },
    "gauge": "0xd204666717ec1aba10fff3910cc7f8e242f2b9cb"
  },
  {
    "id": "0x42712c828ccdc5034aeac5f2e1acfb72fcda5b25",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0xb8d7710f7d8349a506b75dd184f05777c82dad0c",
      "symbol": "ARENA",
      "decimals": "18"
    },
    "token1": {
      "id": "0xcd94a87696fac69edae3a70fe5725307ae1c43f6",
      "symbol": "BLACK",
      "decimals": "18"
    },
    "gauge": "0x6a1d3c245e810846bcf584f89445072150c59d5f"
  },
  {
    "id": "0x8abd9e4ab4132116de3c3531edbb628f1b221e5c",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0x5ddc8d968a94cf95cfeb7379f8372d858b9c797d",
      "symbol": "WOLFI",
      "decimals": "18"
    },
    "token1": {
      "id": "0xcd94a87696fac69edae3a70fe5725307ae1c43f6",
      "symbol": "BLACK",
      "decimals": "18"
    },
    "gauge": "0xd9a899ad9af3ab11da200eb6f3f98e49085a0bd5"
  },
  {
    "id": "0x612a0664a2c2b6d0b8e85c291181d9cff0b5dc60",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0x9209e7ebd056d72c5996220e99df6049253debcf",
      "symbol": "MEOW",
      "decimals": "18"
    },
    "token1": {
      "id": "0xcd94a87696fac69edae3a70fe5725307ae1c43f6",
      "symbol": "BLACK",
      "decimals": "18"
    },
    "gauge": "0x6e3b2cfd102608ade520d5dbcc4789c4473dcea8"
  },
  {
    "id": "0x2466f2d17689b734ed988eb0843aa2ac056c5c09",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0x153374c6d6786b6ca2c4bc96f9c3a471428f2bc7",
      "symbol": "WILD",
      "decimals": "18"
    },
    "token1": {
      "id": "0xcd94a87696fac69edae3a70fe5725307ae1c43f6",
      "symbol": "BLACK",
      "decimals": "18"
    },
    "gauge": "0x71c1d10984fccdb59e40e49c9b158d6ba3fb5923"
  },
  {
    "id": "0xc2582deaa593bf8ef800ee980609824d412b6cbd",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0x9b9fd410d5f01a6a60acf4678a5a99d8027fa5a7",
      "symbol": "MYTH",
      "decimals": "18"
    },
    "token1": {
      "id": "0xcd94a87696fac69edae3a70fe5725307ae1c43f6",
      "symbol": "BLACK",
      "decimals": "18"
    },
    "gauge": "0x6fbdb1ae00c6fe858ab70926ad344adf86261449"
  },
  {
    "id": "0x746472ebffe89b1ce1357f26d3e73fa1d4e3116c",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0x46b9144771cb3195d66e4eda643a7493fadcaf9d",
      "symbol": "BLS",
      "decimals": "18"
    },
    "token1": {
      "id": "0xcd94a87696fac69edae3a70fe5725307ae1c43f6",
      "symbol": "BLACK",
      "decimals": "18"
    },
    "gauge": "0x4745aa58b5e0613353a5a38d841371b8791d7179"
  },
  {
    "id": "0x85bec030b05da25871d2cf82f1e4442e7e044902",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0x420fca0121dc28039145009570975747295f2329",
      "symbol": "COQ",
      "decimals": "18"
    },
    "token1": {
      "id": "0xcd94a87696fac69edae3a70fe5725307ae1c43f6",
      "symbol": "BLACK",
      "decimals": "18"
    },
    "gauge": "0x97ae5e272a1f015a0d6798c48fd912f336a62e7c"
  },
  {
    "id": "0xbbb931e832bf3c789bab467e4a6f6c1551791d3e",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0x09fa58228bb791ea355c90da1e4783452b9bd8c3",
      "symbol": "SUPER",
      "decimals": "18"
    },
    "token1": {
      "id": "0x49d5c2bdffac6ce2bfdb6640f4f80f226bc10bab",
      "symbol": "WETH.e",
      "decimals": "18"
    },
    "gauge": "0x650b141adb8b842f4e88dcb19320b80842da5d29"
  },
  {
    "id": "0x15c5133f63c4914d4e151cbf4babfc8f51707477",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0x09fa58228bb791ea355c90da1e4783452b9bd8c3",
      "symbol": "SUPER",
      "decimals": "18"
    },
    "token1": {
      "id": "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7",
      "symbol": "WAVAX",
      "decimals": "18"
    },
    "gauge": "0x292bce3049c1860b5928a3f24ae77f15b53f462c"
  },
  {
    "id": "0xaf8208b27692e0b41f2e32d1f13054c3b0fa310a",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0x09fa58228bb791ea355c90da1e4783452b9bd8c3",
      "symbol": "SUPER",
      "decimals": "18"
    },
    "token1": {
      "id": "0x152b9d0fdc40c096757f570a51e494bd4b943e50",
      "symbol": "BTC.b",
      "decimals": "8"
    },
    "gauge": "0x5f1693e45b295964f2860c9893bb1fa0500fa3e4"
  },
  {
    "id": "0x0c128cd9ea013c0638b28df7e210e022376bcc38",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0x49d5c2bdffac6ce2bfdb6640f4f80f226bc10bab",
      "symbol": "WETH.e",
      "decimals": "18"
    },
    "token1": {
      "id": "0xcd94a87696fac69edae3a70fe5725307ae1c43f6",
      "symbol": "BLACK",
      "decimals": "18"
    },
    "gauge": "0x0dfe4ca9b14a43aeabd60ab6cf946b0d0089b89d"
  },
  {
    "id": "0x3e70ddb1b82c311e49f16deff3b3805c94cdfe26",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0x48f88a3fe843ccb0b5003e70b4192c1d7448bef0",
      "symbol": "CAI",
      "decimals": "18"
    },
    "token1": {
      "id": "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7",
      "symbol": "WAVAX",
      "decimals": "18"
    },
    "gauge": "0x9a61155382d3c91287ddd7f00812b0b0643fc3ca"
  },
  {
    "id": "0x5d9579592f328bd486de991d96859ecc97a81ddd",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7",
      "symbol": "WAVAX",
      "decimals": "18"
    },
    "token1": {
      "id": "0xf197ffc28c23e0309b5559e7a166f2c6164c80aa",
      "symbol": "MXNB",
      "decimals": "6"
    },
    "gauge": "0x8b2170456d17e00ee4775840d430d46679427de8"
  },
  {
    "id": "0x78f5a53731564894a7e4fff827a88e5fbf9cfcb6",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0x02d159a0c393b3a982c4acb3d03816a42d94f1ab",
      "symbol": "GCROC",
      "decimals": "18"
    },
    "token1": {
      "id": "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7",
      "symbol": "WAVAX",
      "decimals": "18"
    },
    "gauge": "0x51cbdd137d39af1b4bfe8cdd78a81ba5b33d9d43"
  },
  {
    "id": "0xde8d1e2385836f18788da140641a79110eecab36",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e",
      "symbol": "USDC",
      "decimals": "6"
    },
    "token1": {
      "id": "0xf8b22737cbfea137f9b2737d1dab2a8a21608cee",
      "symbol": "TRADER",
      "decimals": "18"
    },
    "gauge": "0x6ee54998505677d8f155ac083943129db2ec3326"
  },
  {
    "id": "0xfff3a856e0f9644e360e4dfc99550b56238084f0",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0x49d5c2bdffac6ce2bfdb6640f4f80f226bc10bab",
      "symbol": "WETH.e",
      "decimals": "18"
    },
    "token1": {
      "id": "0x8e48d9f6d73e9805df87dcf63f7b35ae04079713",
      "symbol": "KIGU",
      "decimals": "18"
    },
    "gauge": "0xf47c916ceb9aa7541753aebb5d47daf5700e6fb3"
  },
  {
    "id": "0x03eb46b34129a77ac7a115e87da19ae91d66019c",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0x451532f1c9eb7e4dc2d493db52b682c0acf6f5ef",
      "symbol": "SUZ",
      "decimals": "18"
    },
    "token1": {
      "id": "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e",
      "symbol": "USDC",
      "decimals": "6"
    },
    "gauge": "0xb126d152bb7c5e1d2f0536b2fd12d95fa52bf43c"
  },
  {
    "id": "0x59faf1480cb7cd749ee517c2aa7a15a26c0fb9af",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0x451532f1c9eb7e4dc2d493db52b682c0acf6f5ef",
      "symbol": "SUZ",
      "decimals": "18"
    },
    "token1": {
      "id": "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7",
      "symbol": "WAVAX",
      "decimals": "18"
    },
    "gauge": "0xd4d76f0932dfa7ae49241f11fcd2f47e464f9ab1"
  },
  {
    "id": "0xfcbdd05f764702ec1cb56c6324a45d6472b51f74",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7",
      "symbol": "WAVAX",
      "decimals": "18"
    },
    "token1": {
      "id": "0xeec951bfdeb358371a19512c6c33cdd840d47db0",
      "symbol": "MOANI",
      "decimals": "18"
    },
    "gauge": "0x0fd4841580653fa7ae1c91dd31b006a8dd377086"
  },
  {
    "id": "0x64d05ecc2cdc3e80d45bd1b25b0e8a7f7bf15cfc",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7",
      "symbol": "USDt",
      "decimals": "6"
    },
    "token1": {
      "id": "0xcd94a87696fac69edae3a70fe5725307ae1c43f6",
      "symbol": "BLACK",
      "decimals": "18"
    },
    "gauge": "0x3b75286ad8a042ea5fbd5ded1e4624fd54d3ae40"
  },
  {
    "id": "0x503e7d44fffda3b23bcd38fcb93d3dc795643874",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0x133879524ddb38582cf0b93d10adb789601ff397",
      "symbol": "BORNE",
      "decimals": "18"
    },
    "token1": {
      "id": "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e",
      "symbol": "USDC",
      "decimals": "6"
    },
    "gauge": "0xd451373fef5ac77ce5e25d20e31635e7448dcec7"
  },
  {
    "id": "0x552e01991a4086fa290a4b826c33dde78e3d9966",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0x700103766c23fb8da956caf94c756b90106eeb41",
      "symbol": "WLFI",
      "decimals": "18"
    },
    "token1": {
      "id": "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e",
      "symbol": "USDC",
      "decimals": "6"
    },
    "gauge": "0x944103c072ccdbdcef5eca20249cbe38f6b6986c"
  },
  {
    "id": "0xae93b851e2e526a46ab91bb9b045f0d41d45bd4e",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0x152b9d0fdc40c096757f570a51e494bd4b943e50",
      "symbol": "BTC.b",
      "decimals": "8"
    },
    "token1": {
      "id": "0xcd94a87696fac69edae3a70fe5725307ae1c43f6",
      "symbol": "BLACK",
      "decimals": "18"
    },
    "gauge": "0xe7834672020af111b612b34963d3535d6bf2673f"
  },
  {
    "id": "0xb46af12bbcd6540d63b8580601c0b149b2c6f8f5",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0x8e48d9f6d73e9805df87dcf63f7b35ae04079713",
      "symbol": "KIGU",
      "decimals": "18"
    },
    "token1": {
      "id": "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7",
      "symbol": "WAVAX",
      "decimals": "18"
    },
    "gauge": "0x0b7be117e4e7662f3d6755cdfc4518868fb24155"
  },
  {
    "id": "0x535e3dce46ff44cfa66e8d72cd24a508579feaed",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0x634608ed64c61ca9e741f8095193c0bfa0fa19cc",
      "symbol": "SOL",
      "decimals": "18"
    },
    "token1": {
      "id": "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7",
      "symbol": "WAVAX",
      "decimals": "18"
    },
    "gauge": "0xa703cb651d77ef7c6b6bdf3c876452df2cfed746"
  },
  {
    "id": "0xdb0ef0808b53219beed7ff5dca8da99d009d69a0",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0x5c09a9ce08c4b332ef1cc5f7cadb1158c32767ce",
      "symbol": "fBOMB",
      "decimals": "18"
    },
    "token1": {
      "id": "0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7",
      "symbol": "USDt",
      "decimals": "6"
    },
    "gauge": "0x4986c056e569b2556af0b18981ab617b5f7058a6"
  },
  {
    "id": "0x14c0c65e70ec101f8c4aabc97c4f29211e32f221",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0x297731eb3cab3834525fc9ea061fd71d8f4645c9",
      "symbol": "BLAZE",
      "decimals": "18"
    },
    "token1": {
      "id": "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e",
      "symbol": "USDC",
      "decimals": "6"
    },
    "gauge": "0x3d6f436015e4303c0b794cb68028adbbb7d4ea76"
  },
  {
    "id": "0x132a80e5cec87eca9137333f2ecfcb7572b45d56",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0x2775d5105276781b4b85ba6ea6a6653beed1dd32",
      "symbol": "XAUt0",
      "decimals": "6"
    },
    "token1": {
      "id": "0xcd94a87696fac69edae3a70fe5725307ae1c43f6",
      "symbol": "BLACK",
      "decimals": "18"
    },
    "gauge": "0xafcef7ffe301708555afe2d9b816fb9a84be6cde"
  },
  {
    "id": "0xf81c84fc05baed862eeeb8ccdc0c6d4882f76c7b",
    "type": "vAMM",
    "stable": false,
    "token0": {
      "id": "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e",
      "symbol": "USDC",
      "decimals": "6"
    },
    "token1": {
      "id": "0xca58b8ad4a83d9e456ca88dab228803714074e23",
      "symbol": "ARTERY",
      "decimals": "18"
    },
    "gauge": "0xb20850b5be54a47c20e81d1171ee1cf8cc6ae63e"
  },
  {
    "id": "0x65f83ccacabaac4ed2f80289a02df4d35d744ae8",
    "type": "sAMM",
    "stable": true,
    "token0": {
      "id": "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e",
      "symbol": "USDC",
      "decimals": "6"
    },
    "token1": {
      "id": "0xc891eb4cbdeff6e073e859e987815ed1505c2acd",
      "symbol": "EURC",
      "decimals": "6"
    },
    "gauge": "0xcb76d9bc96368f3dc137c94e23beee489ee9eb87"
  },
  {
    "id": "0x4f80724e5f2d2af81cb2a1eeb2cc049ab2a33089",
    "type": "sAMM",
    "stable": true,
    "token0": {
      "id": "0x06d47f3fb376649c3a9dafe069b3d6e35572219e",
      "symbol": "savUSD",
      "decimals": "18"
    },
    "token1": {
      "id": "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e",
      "symbol": "USDC",
      "decimals": "6"
    },
    "gauge": "0x5f91c81eb2b133b6e599200abb61f0504ee783d2"
  },
  {
    "id": "0xcd44913b74bee551af32a5cde2151821b6fcf04e",
    "type": "sAMM",
    "stable": true,
    "token0": {
      "id": "0x3d75f2bb8abcdbd1e27443cb5cbce8a668046c81",
      "symbol": "HLP0",
      "decimals": "6"
    },
    "token1": {
      "id": "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e",
      "symbol": "USDC",
      "decimals": "6"
    },
    "gauge": "0xb3d2427dea7678528248b462499761328135c97e"
  },
  {
    "id": "0xd299699e69adc03fc65e14ec605286758facf1d8",
    "type": "sAMM",
    "stable": true,
    "token0": {
      "id": "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7",
      "symbol": "WAVAX",
      "decimals": "18"
    },
    "token1": {
      "id": "0xdf788ad40181894da035b827cdf55c523bf52f67",
      "symbol": "rsAVAX",
      "decimals": "18"
    },
    "gauge": "0x004e0337745c446784cfc3f5b8e5a11a147f3ff3"
  },
  {
    "id": "0xedcfa2d80cf06fb7642e956a1e95dbc37c75995b",
    "type": "sAMM",
    "stable": true,
    "token0": {
      "id": "0x4cb85e39d5622af604405077a589c3078f3a59b2",
      "symbol": "CROC",
      "decimals": "18"
    },
    "token1": {
      "id": "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7",
      "symbol": "WAVAX",
      "decimals": "18"
    },
    "gauge": "0xa329a89cd68ddde18c7b5ce5247319124e9f5576"
  },
  {
    "id": "0x5c2e48c07f27f6250e7a1709d12d01b6b92205ba",
    "type": "sAMM",
    "stable": true,
    "token0": {
      "id": "0x49d5c2bdffac6ce2bfdb6640f4f80f226bc10bab",
      "symbol": "WETH.e",
      "decimals": "18"
    },
    "token1": {
      "id": "0xcd94a87696fac69edae3a70fe5725307ae1c43f6",
      "symbol": "BLACK",
      "decimals": "18"
    },
    "gauge": "0x1cccecd6768b297764a93177539165314aee9521"
  },
  {
    "id": "0xc26e546b632348e76ebbd2811f4458a32ea29b7a",
    "type": "sAMM",
    "stable": true,
    "token0": {
      "id": "0x180af87b47bf272b2df59dccf2d76a6eafa625bf",
      "symbol": "reUSD",
      "decimals": "18"
    },
    "token1": {
      "id": "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e",
      "symbol": "USDC",
      "decimals": "6"
    },
    "gauge": "0x228b1fedc62b770e073037d3ab0ca3068c146ed1"
  },
  {
    "id": "0xdc9ec8f6aca746f13253f14e79647265737bbb35",
    "type": "sAMM",
    "stable": true,
    "token0": {
      "id": "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e",
      "symbol": "USDC",
      "decimals": "6"
    },
    "token1": {
      "id": "0xf197ffc28c23e0309b5559e7a166f2c6164c80aa",
      "symbol": "MXNB",
      "decimals": "6"
    },
    "gauge": "0x517635a9bf71ea022a984ebe1e8647089de51c08"
  },
  {
    "id": "0xd3c446d7a9f2031873a32b0310567b8a3206352b",
    "type": "sAMM",
    "stable": true,
    "token0": {
      "id": "0xb2f85b7ab3c2b6f62df06de6ae7d09c010a5096e",
      "symbol": "XSGD",
      "decimals": "6"
    },
    "token1": {
      "id": "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e",
      "symbol": "USDC",
      "decimals": "6"
    },
    "gauge": "0x8eefa333d86a639221ca7fe4b980581dfee5c2fc"
  }
];

// --- From vamm-samm-provider.js ---
/**
 * vAMM/sAMM Pool Data Provider
 * Provides pool addresses discovered via RPC analysis
 * Rewards/VAPR are extracted from DOM via pool-extractor.js
 */


const VOTER_ADDRESS = '0xe30d0c8532721551a51a9fec7fb233759964d9e3';

// Static vAMM/sAMM pool data from GAUGE_MANAGER enumeration
// Generated: 2026-01-25 - 75 vAMM + 9 sAMM = 84 pools
// To regenerate: python scripts/enumerate_vamm_samm_pools.py

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

class VammSammProvider {
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

// --- From pool-data-provider.js ---

const API_URL = 'https://resources.blackhole.xyz/cl-pools-list/cl-pools.json';

const SELECTORS = {
  weights: '0xa7cac846',
  totalWeight: '0x96c82e57',
  token0: '0x0dfe1681',
  token1: '0xd21220a7'
};

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
// --- From ui-manager.js ---
/**
 * UI Manager - Handles loading overlays and other visual feedback
 */

function showLoadingOverlay(message = 'Refreshing Pools...') {
  // Remove existing if any
  hideLoadingOverlay();

  const overlay = document.createElement('div');
  overlay.id = 'blackhole-loading-overlay';
  overlay.innerHTML = `
    <div class="loading-spinner-container">
      <div class="loading-spinner"></div>
      <div class="loading-text">${message}</div>
    </div>
  `;
  document.body.appendChild(overlay);
}

function hideLoadingOverlay() {
  const overlay = document.getElementById('blackhole-loading-overlay');
  if (overlay) {
    overlay.style.opacity = '0';
    setTimeout(() => {
      if (overlay.parentElement) {
        overlay.remove();
      }
    }, 300);
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
 * @param {boolean} options.hideVamm - Filter out vAMM and sAMM pools (non-CL pools)
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

  // Filter out vAMM/sAMM pools if requested (keep only CL pools)
  if (hideVamm) {
    filteredPools = filteredPools.filter(p => p.pool_type !== 'vAMM' && p.pool_type !== 'sAMM');
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
        
        // Force return to top of Page 1 if that's where we started
        if (currentPageNum === 1) {
          console.log('Returning to Page 1 and resetting view...');
          const restoredPagination = document.querySelector('.pagination');
          if (restoredPagination) {
            const page1Item = Array.from(restoredPagination.querySelectorAll('.item')).find(item => {
              const text = item.textContent.trim();
              return /^1$/.test(text) && !item.classList.contains('extreme');
            });
            
            if (page1Item) {
              const clickable = page1Item.closest('.item') || page1Item.parentElement || page1Item;
              clickable.click();
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }
          // Scroll multiple times to ensure we beat any lazy-loading/rendering jumps
          window.scrollTo(0, 0);
          setTimeout(() => window.scrollTo(0, 0), 500);
          setTimeout(() => window.scrollTo(0, 0), 1500);
        } else if (currentPageNum > 1) {
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
            }
          }
        }
      } catch (error) {
        console.warn('Error restoring page size:', error);
      }
    } else {
      // If we didn't change page size, we need to manually return to the original page
      if (currentPageNum === 1) {
        console.log('Returning to Page 1...');
        const finalPagination = document.querySelector('.pagination');
        if (finalPagination) {
           const page1Item = Array.from(finalPagination.querySelectorAll('.item')).find(item => {
             const text = item.textContent.trim();
             return /^1$/.test(text) && !item.classList.contains('extreme');
           });
           
           if (page1Item) {
             const clickable = page1Item.closest('.item') || page1Item.parentElement || page1Item;
             clickable.click();
             await new Promise(resolve => setTimeout(resolve, 1500));
           }
        }
        window.scrollTo(0, 0);
        setTimeout(() => window.scrollTo(0, 0), 500);
      } else if (currentPageNum > 1) {
        console.log(`Returning to page ${currentPageNum}...`);
        const finalPagination = document.querySelector('.pagination');
        if (finalPagination) {
          const allPageItems = Array.from(finalPagination.querySelectorAll('.item')).filter(item => {
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
            await new Promise(resolve => setTimeout(resolve, 1500));
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


// Known function selectors
const KNOWN_SELECTORS = {
  '0xa7cac846': 'weights(address)',
  '0xcc56b2c5': 'getGauge(address)',
  '0x0dfe1681': 'token0()',
  '0xd21220a7': 'token1()',
  '0xddca3f43': 'fee()',
  '0x1a686502': 'liquidity()',
  '0x18160ddd': 'totalSupply()',
  '0xedf59997': 'tokens_per_week(uint256)',
  '0x7116c60c': 'totalSupplyAtT(uint256)',
};

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
    // Get selected pools - use in-memory tracking (FAST!)
    // Only use vote panel for initial sync if needed
    (async () => {
      try {
        console.log('[GET_SELECTED] Getting selected pools...');
        
        // Strategy 1: Use in-memory tracking (instant, no UI disruption)
        let selectedSet = new Set(selectedPoolIdsSet);
        console.log(`[GET_SELECTED] In-memory tracking has ${selectedSet.size} pools`);
        
        // Strategy 2: If empty, check current page DOM (no vote panel!)
        if (selectedSet.size === 0) {
          console.log('[GET_SELECTED] In-memory empty, checking current page DOM...');
          const currentPageCells = document.querySelectorAll('div.liquidity-pool-cell');
          
          for (const cell of currentPageCells) {
            const clearLink = cell.querySelector('span.link.underline');
            if (clearLink && clearLink.textContent.toLowerCase().includes('clear')) {
              const innerHTML = cell.innerHTML || '';
              const addressMatch = innerHTML.match(/0x[a-fA-F0-9]{40}/i);
              if (addressMatch) {
                selectedSet.add(addressMatch[0].toLowerCase());
                selectedPoolIdsSet.add(addressMatch[0].toLowerCase());
              }
            }
          }
          console.log(`[GET_SELECTED] Current page found ${selectedSet.size} pools`);
        }

        // Return selected pools
        const selectedPools = Array.from(selectedSet).map(poolId => ({ poolId }));
        console.log(`[GET_SELECTED] Returning ${selectedPools.length} selected pools`);
        sendResponse({ success: true, selectedPools });
      } catch (error) {
        console.error('[GET_SELECTED] Error getting selected pools:', error);
        // Fallback to in-memory set
        const selectedPools = Array.from(selectedPoolIdsSet).map(poolId => ({ poolId }));
        sendResponse({ success: true, selectedPools });
      }
    })();
    return true; // Keep channel open for async response
  } else if (message.type === 'CHECK_POOLS_SELECTION') {
    // Check selection state for specific pools via search
    const poolIds = message.poolIds || [];

    (async () => {
      try {
        const selectedSet = await discoverSelectedPools(poolIds);
        const selectedPools = Array.from(selectedSet);
        sendResponse({ success: true, selectedPools });
      } catch (error) {
        console.error('Error checking pool selection:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
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
    const forceSelect = message.forceSelect !== false; // Default true
    
    // Process sequentially to avoid UI conflicts
    (async () => {
      for (let i = 0; i < poolIds.length; i++) {
        const poolId = poolIds[i];
        const isLast = i === poolIds.length - 1;
        
        // Skip if already selected (when forceSelect=true, don't toggle off)
        if (forceSelect && selectedPoolIdsSet.has(poolId.toLowerCase())) {
          console.log(`[SELECT_POOLS] Pool ${poolId} already selected, skipping`);
          continue;
        }
        
        // Skip search clear for all but the last pool
        await selectSinglePool(poolId, { skipSearchClear: !isLast });
        await new Promise(r => setTimeout(r, 150)); // Slightly longer delay
      }
      updateOverlay();
      sendResponse({ success: true });
    })();
    return true; // Keep channel open
  } else if (message.type === 'CLEAR_ALL_VOTES') {
    (async () => {
      try {
        console.log('[CLEAR_ALL] Starting clear all operation...');
        
        // Strategy 1: Try using the "Clear Votes" button in vote panel (FASTEST!)
        let clearedViaPanel = false;
        try {
          console.log('[CLEAR_ALL] Attempting to use "Clear Votes" button...');
          clearedViaPanel = await clearAllVotesViaVotePanel();
          
          if (clearedViaPanel) {
            console.log('[CLEAR_ALL] Successfully cleared via vote panel button!');
            selectedPoolIdsSet.clear();
            updateOverlay();
            sendResponse({ success: true, method: 'votePanel' });
            return;
          }
        } catch (votePanelError) {
          console.warn('[CLEAR_ALL] Vote panel button method failed:', votePanelError);
        }
        
        // Strategy 2: Get selected pools from vote panel and clear them individually
        let discoveredPools = new Set();
        try {
          console.log('[CLEAR_ALL] Attempting to discover pools via vote panel...');
          discoveredPools = await getSelectedPoolsFromVotePanel(true); // Close panel after
          console.log(`[CLEAR_ALL] Vote panel discovery found ${discoveredPools.size} pools`);
        } catch (discoveryError) {
          console.warn('[CLEAR_ALL] Vote panel discovery failed:', discoveryError);
        }
        
        // Strategy 3: If vote panel didn't find anything, check current page DOM
        if (discoveredPools.size === 0) {
          console.log('[CLEAR_ALL] Vote panel found nothing, checking current page...');
          const currentPageCells = document.querySelectorAll('div.liquidity-pool-cell');
          
          for (const cell of currentPageCells) {
            // Check if this pool is selected
            const clearLink = cell.querySelector('span.link.underline');
            if (clearLink && clearLink.textContent.toLowerCase().includes('clear')) {
              // Extract pool ID
              const innerHTML = cell.innerHTML || '';
              const addressMatch = innerHTML.match(/0x[a-fA-F0-9]{40}/i);
              if (addressMatch) {
                const poolId = addressMatch[0].toLowerCase();
                discoveredPools.add(poolId);
              }
            }
          }
          console.log(`[CLEAR_ALL] Current page method found ${discoveredPools.size} pools`);
        }
        
        // Update our in-memory tracking with discovered pools
        discoveredPools.forEach(poolId => selectedPoolIdsSet.add(poolId));
        
        console.log(`[CLEAR_ALL] Total pools to clear: ${discoveredPools.size}`);
        
        if (discoveredPools.size === 0) {
          console.log('[CLEAR_ALL] No selected pools found');
          sendResponse({ success: true, count: 0 });
          return;
        }
        
        // Use search-based clear with discovered pools
        const clearedCount = await clearAllViaSearch(discoveredPools, (current, total, status) => {
          console.log(`Clear progress: ${current}/${total} - ${status}`);
        });

        selectedPoolIdsSet.clear();
        updateOverlay();
        sendResponse({ success: true, count: clearedCount });
      } catch (error) {
        console.error('Clear all failed:', error);
        // Fallback to old method
        clearAllSelectedPools().then((count) => {
          updateOverlay();
          sendResponse({ success: true, count });
        });
      }
    })();
    return true; // Keep channel open for async response
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

// Initialize selected pools set from current page state (one-time sync)
async function initializeSelectedPoolsSet() {
  try {
    // Only check current page to avoid navigation on init
    const allPoolCells = document.querySelectorAll('div.liquidity-pool-cell');
    for (let cell of allPoolCells) {
      const selectToVoteContainer = cell.querySelector('.select-to-vote-container');
      if (selectToVoteContainer) {
        const completedText = selectToVoteContainer.querySelector('.select-to-vote.completed');
        if (completedText && completedText.textContent.includes('Selected')) {
          // Extract pool ID
          const innerHTML = cell.innerHTML || '';
          const addressMatch = innerHTML.match(/0x[a-fA-F0-9]{40}/i);
          if (addressMatch) {
            selectedPoolIdsSet.add(addressMatch[0].toLowerCase());
          }
        }
      }
    }
    console.log(`Initialized selected pools set with ${selectedPoolIdsSet.size} pools from current page`);
  } catch (e) {
    console.warn('Error initializing selected pools set:', e);
  }
}

function setupExtension() {
  setTimeout(async () => {
    // Wait for page to be fully loaded with pools visible
    let attempts = 0;
    const maxAttempts = 20; // 10 seconds max
    while (attempts < maxAttempts) {
      const poolCells = document.querySelectorAll('div.liquidity-pool-cell');
      if (poolCells.length > 0) {
        console.log(`Page ready with ${poolCells.length} pools visible`);
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 500));
      attempts++;
    }
    
    // Scrape all pools to memory FIRST (one-time operation)
    // This will also populate selectedPoolIdsSet with any pre-selected pools
    await scrapeAllPoolsToMemory();
    
    console.log(`Setup complete. Found ${selectedPoolIdsSet.size} pre-selected pools`);
    
    // Don't auto-fetch pool data - let user trigger refresh manually
    // fetchPoolData(); // Removed: User must manually refresh via side panel
    observePoolList();
    
    // Always inject overlay (visibility controlled by enableOverlay setting)
    injectOverlay();
    
    // Update overlay AFTER scraping completes to show pre-selected pools
    if (!isUpdatingOverlay) {
      console.log(`Updating overlay after scrape, selected pools: ${selectedPoolIdsSet.size}`);
      updateOverlay();
    }
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

  // Show loading overlay
  if (typeof showLoadingOverlay === 'function') {
    showLoadingOverlay('Refreshing Pools...');
  }
  
  isFetchingPoolData = true;
  lastFetchTime = now;
  
  try {
    console.log('Fetching pool data...');
    let pools = [];
    
    // Get settings to check hideVamm preference
    const settings = await new Promise(resolve => {
      chrome.storage.sync.get('settings', result => {
        resolve(result.settings || {});
      });
    });
    const hideVamm = settings.hideVamm || false;
    
    // Wait a bit more for React to fully render
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    try {
      // Use hybrid extraction (RPC/API -> DOM fallback)
      if (typeof extractPoolsHybrid === 'function') {
        pools = await extractPoolsHybrid();
      } else {
        pools = await extractPoolsFromDOM();
      }
      
      // Filter out vAMM/sAMM pools early if hideVamm is set (saves processing time)
      if (hideVamm && pools.length > 0) {
        const beforeCount = pools.length;
        pools = pools.filter(p => p.pool_type !== 'vAMM' && p.pool_type !== 'sAMM');
        console.log(`Filtered vAMM/sAMM: ${beforeCount} → ${pools.length} pools (hideVamm=true)`);
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
    // Hide loading overlay
    if (typeof hideLoadingOverlay === 'function') {
      hideLoadingOverlay();
    }
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
    // Don't trigger if we're already updating the overlay
    if (isUpdatingOverlay) {
      console.log('Skipping observer update - overlay already updating');
      return;
    }
    
    // Debounce updates to prevent infinite loops
    if (updateOverlayTimer) {
      clearTimeout(updateOverlayTimer);
    }
    updateOverlayTimer = setTimeout(() => {
      // Always update overlay (even if hidden) so it's ready when shown
      if (!isUpdatingOverlay) {
        updateOverlay();
      }
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
  // Prevent infinite loops from observer triggering itself
  if (isUpdatingOverlay) {
    console.log('updateOverlay: Already updating, skipping to prevent loop');
    return;
  }
  
  isUpdatingOverlay = true;
  console.log(`updateOverlay called, selectedPoolIdsSet has ${selectedPoolIdsSet.size} pools:`, Array.from(selectedPoolIdsSet));
  const contentEl = document.getElementById('blackhole-tools-content');
  if (!contentEl) {
    console.warn('updateOverlay: contentEl not found');
    isUpdatingOverlay = false;
    return;
  }
  
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
        testPools = testPools.filter(p => p.pool_type !== 'vAMM' && p.pool_type !== 'sAMM');
        console.log(`After hideVamm: ${testPools.length} (removed ${before - testPools.length} vAMM/sAMM)`);
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
        testPools = testPools.filter(p => p.pool_type !== 'vAMM' && p.pool_type !== 'sAMM');
        filterSteps.push(`hideVamm: ${before} → ${testPools.length} (removed ${before - testPools.length} vAMM/sAMM)`);
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
      
      // Check if this pool is currently selected (using in-memory tracking)
      const isSelected = pool.pool_id ? selectedPoolIdsSet.has(pool.pool_id.toLowerCase()) : false;
      const selectedClass = isSelected ? 'pool-selected' : '';
      const buttonText = isSelected ? 'Deselect' : 'Select';
      
      if (isSelected) {
        console.log(`Pool ${pool.pool_id} is selected, applying 'pool-selected' class`);
      }
      
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
    
    // Temporarily disconnect observer while updating content to prevent loops
    if (poolObserver) {
      poolObserver.disconnect();
    }
    
    contentEl.innerHTML = html;
    
    // Force a reflow to ensure styles are applied
    void contentEl.offsetHeight;
    
    // Verify the classes were applied
    const selectedItems = contentEl.querySelectorAll('.recommendation-item.pool-selected');
    console.log(`After HTML update: Found ${selectedItems.length} items with 'pool-selected' class`);
    if (selectedItems.length > 0) {
      selectedItems.forEach(item => {
        const poolId = item.getAttribute('data-pool-id');
        const computedStyle = window.getComputedStyle(item);
        console.log(`  Pool ${poolId}: background=${computedStyle.backgroundColor}, border-color=${computedStyle.borderColor}`);
      });
    }
    
    // Reconnect observer after content update
    if (poolObserver) {
      setTimeout(() => {
        const poolContainer = document.querySelector('[data-pool-list]') || 
                           document.querySelector('.pool-list') ||
                           document.body;
        if (poolContainer) {
          poolObserver.observe(poolContainer, {
            childList: true,
            subtree: true
          });
        }
      }, 100);
    }
    
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
  
  const normalizedPoolId = poolId.toLowerCase().trim();
  const poolCells = document.querySelectorAll('div.liquidity-pool-cell');
  
  for (let cell of poolCells) {
    // Check if this cell contains the pool ID (case-insensitive)
    let cellContainsId = false;
    
    // Check data attributes
    const dataAttrs = ['data-pool-id', 'data-pool-address', 'data-address', 'data-id'];
    for (const attr of dataAttrs) {
      const value = cell.getAttribute(attr);
      if (value && value.toLowerCase().trim() === normalizedPoolId) {
        cellContainsId = true;
        break;
      }
    }
    
    // Check innerHTML/innerText if data attributes didn't match
    if (!cellContainsId) {
      const innerHTML = (cell.innerHTML || '').toLowerCase();
      const innerText = (cell.innerText || '').toLowerCase();
      cellContainsId = innerHTML.includes(normalizedPoolId) || innerText.includes(normalizedPoolId);
    }
    
    if (cellContainsId) {
      // Check for "Selected to vote" indicator
      const selectToVoteContainer = cell.querySelector('.select-to-vote-container');
      if (selectToVoteContainer) {
        const completedText = selectToVoteContainer.querySelector('.select-to-vote.completed');
        if (completedText && completedText.textContent.includes('Selected')) {
          return true;
        }
      }
      
      // Alternative check: look for "CLEAR" button/link (indicates selected)
      const clearLink = Array.from(cell.querySelectorAll('*')).find(el => {
        const text = (el.textContent || '').trim().toUpperCase();
        return text === 'CLEAR' && !text.includes('ADD') && !text.includes('INCENTIVE');
      });
      if (clearLink) {
        return true;
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

// Helper function to restore page size and navigation state (shared logic from extractor)
async function restorePageSizeAndNavigation(originalPageSize, pageSizeSelector, pageSizeChanged, initialPageNum) {
  console.log(`restorePageSizeAndNavigation called: originalPageSize=${originalPageSize}, pageSizeChanged=${pageSizeChanged}, initialPageNum=${initialPageNum}`);
  
  // Flag to prevent any further navigation after we've successfully reached target
  let navigationComplete = false;
  
  // Always navigate to page 1 and scroll to top first
  const pagination = document.querySelector('.pagination');
  if (pagination) {
    const page1Item = Array.from(pagination.querySelectorAll('.item')).find(item => {
      const text = item.textContent.trim();
      return /^1$/.test(text) && !item.classList.contains('extreme');
    });
    if (page1Item) {
      const clickable = page1Item.closest('.item') || page1Item.parentElement || page1Item;
      clickable.click();
      await new Promise(resolve => setTimeout(resolve, 2000));
      console.log('Navigated to page 1');
    }
  }
  
  // Scroll to top
  window.scrollTo(0, 0);
  setTimeout(() => window.scrollTo(0, 0), 500);
  setTimeout(() => window.scrollTo(0, 0), 1500);
  console.log('Scrolled to top');
  
  // If we didn't change page size, we're done (already on page 1, scrolled to top)
  if (!pageSizeChanged || originalPageSize === null || originalPageSize === '100') {
    console.log('No page size restoration needed');
    return;
  }
  
  try {
    console.log(`Restoring page size from 100 back to ${originalPageSize}...`);
    
    // Re-query for page size selector (DOM might have changed after navigation)
    let currentPageSizeSelector = pageSizeSelector;
    if (!currentPageSizeSelector || !document.contains(currentPageSizeSelector)) {
      // Try to find the size-per-page element again
      const sizePerPageElement = document.querySelector('.size-per-page');
      if (sizePerPageElement) {
        currentPageSizeSelector = sizePerPageElement;
      } else {
        // Try standard select elements as fallback
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
            currentPageSizeSelector = element;
            break;
          }
        }
      }
    }
    
    if (!currentPageSizeSelector) {
      console.warn('Could not find page size selector for restoration');
      // Still try to navigate back
      if (initialPageNum === 1) {
        const pagination = document.querySelector('.pagination');
        if (pagination) {
          const page1Item = Array.from(pagination.querySelectorAll('.item')).find(item => {
            const text = item.textContent.trim();
            return /^1$/.test(text) && !item.classList.contains('extreme');
          });
          if (page1Item) {
            const clickable = page1Item.closest('.item') || page1Item.parentElement || page1Item;
            clickable.click();
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
        window.scrollTo(0, 0);
        setTimeout(() => window.scrollTo(0, 0), 500);
        setTimeout(() => window.scrollTo(0, 0), 1500);
      }
      return;
    }
    
    // Check if it's a standard select element
    if (currentPageSizeSelector.tagName === 'SELECT') {
      currentPageSizeSelector.value = originalPageSize;
      
      // Trigger change event
      const changeEvent = new Event('change', { bubbles: true });
      currentPageSizeSelector.dispatchEvent(changeEvent);
      
      // Also try input event
      const inputEvent = new Event('input', { bubbles: true });
      currentPageSizeSelector.dispatchEvent(inputEvent);
    } else {
      // It's a custom dropdown (like .size-per-page)
      // Click to open the dropdown
      currentPageSizeSelector.click();
      
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
          const selectorRect = currentPageSizeSelector.getBoundingClientRect();
          // Check if it's near the selector (likely the dropdown option)
          if (rect.width > 0 && rect.height > 0 && // Element is visible
              Math.abs(rect.top - selectorRect.bottom) < 200 && 
              Math.abs(rect.left - selectorRect.left) < 100) {
            originalOption = elem;
            break;
          }
        }
      }
      
      // If not found with proximity check, try broader search
      if (!originalOption) {
        for (const elem of allElements) {
          const text = elem.textContent.trim();
          if (text === originalPageSize) {
            const rect = elem.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              originalOption = elem;
              break;
            }
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
    
    // Re-navigate to page 1 after page size change (page reload might have changed our position)
    const restoredPagination = document.querySelector('.pagination');
    if (restoredPagination) {
      const page1Item = Array.from(restoredPagination.querySelectorAll('.item')).find(item => {
        const text = item.textContent.trim();
        return /^1$/.test(text) && !item.classList.contains('extreme');
      });
      
      if (page1Item) {
        const clickable = page1Item.closest('.item') || page1Item.parentElement || page1Item;
        clickable.click();
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log('Re-navigated to page 1 after page size change');
      }
    }
    
    // Scroll to top again after page size change
    window.scrollTo(0, 0);
    setTimeout(() => window.scrollTo(0, 0), 500);
    setTimeout(() => window.scrollTo(0, 0), 1500);
    console.log('Scrolled to top after page size restoration');
    
    // If we started on a different page, navigate back to it
    if (initialPageNum > 1) {
      console.log(`Navigating back to original page ${initialPageNum}...`);
      const restoredPagination = document.querySelector('.pagination');
      if (restoredPagination) {
        // Helper to get current page number
        function getCurrentPageNum() {
          const selectedItem = restoredPagination.querySelector('.item.selected');
          if (!selectedItem) return 1;
          const text = selectedItem.textContent.trim();
          const pageNum = parseInt(text);
          return isNaN(pageNum) ? 1 : pageNum;
        }
        
        // First, try to find the page number in visible items
        const allPageItems = Array.from(restoredPagination.querySelectorAll('.item')).filter(item => {
          const text = item.textContent.trim();
          return /^\d+$/.test(text) && !item.classList.contains('extreme');
        });
        
        console.log(`Found ${allPageItems.length} visible page number items:`, allPageItems.map(item => item.textContent.trim()));
        
        let targetPageItem = allPageItems.find(item => {
          const pageNum = parseInt(item.textContent.trim());
          return pageNum === initialPageNum;
        });
        
        if (targetPageItem) {
          // Page number is visible, click it directly
          console.log(`Page ${initialPageNum} is visible, clicking directly...`);
          const clickable = targetPageItem.closest('.item') || targetPageItem.parentElement || targetPageItem;
          clickable.click();
          await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
          // Page number not visible, navigate using next/prev buttons
          console.log(`Page ${initialPageNum} not visible, navigating using next/prev buttons...`);
          let currentPage = getCurrentPageNum();
          const maxAttempts = 20; // Safety limit
          let attempts = 0;
          
          while (currentPage !== initialPageNum && attempts < maxAttempts && !navigationComplete) {
            // Safety check at start of each iteration
            if (navigationComplete) {
              console.log('Navigation marked complete at start of loop iteration, breaking');
              break;
            }
            
            const pagination = document.querySelector('.pagination');
            if (!pagination) break;
            
            if (currentPage < initialPageNum) {
              // Need to go forward
              const nextButton = pagination.querySelector('.item.extreme.right');
              if (nextButton && !nextButton.classList.contains('disabled')) {
                const clickable = nextButton.closest('.item') || nextButton.parentElement || nextButton;
                clickable.click();
                await new Promise(resolve => setTimeout(resolve, 2000));
                currentPage = getCurrentPageNum();
                console.log(`Navigated forward, now on page ${currentPage}`);
                
                // Check immediately after navigation
                if (currentPage === initialPageNum) {
                  console.log(`Reached target page ${initialPageNum} after forward navigation - stopping`);
                  navigationComplete = true;
                  window.scrollTo(0, 0);
                  break;
                }
              } else {
                console.warn('Next button disabled, cannot reach target page');
                break;
              }
            } else if (currentPage > initialPageNum) {
              // Need to go backward
              const prevButton = pagination.querySelector('.item.extreme.left');
              if (prevButton && !prevButton.classList.contains('disabled')) {
                const clickable = prevButton.closest('.item') || prevButton.parentElement || prevButton;
                clickable.click();
                await new Promise(resolve => setTimeout(resolve, 2000));
                currentPage = getCurrentPageNum();
                console.log(`Navigated backward, now on page ${currentPage}`);
                
                // Check immediately after navigation
                if (currentPage === initialPageNum) {
                  console.log(`Reached target page ${initialPageNum} after backward navigation - stopping`);
                  navigationComplete = true;
                  window.scrollTo(0, 0);
                  break;
                }
              } else {
                console.warn('Prev button disabled, cannot reach target page');
                break;
              }
            }
            
            // Check if target page is now visible and can be clicked directly
            const newPagination = document.querySelector('.pagination');
            if (newPagination && !navigationComplete) {
              const newPageItems = Array.from(newPagination.querySelectorAll('.item')).filter(item => {
                const text = item.textContent.trim();
                return /^\d+$/.test(text) && !item.classList.contains('extreme');
              });
              targetPageItem = newPageItems.find(item => {
                const pageNum = parseInt(item.textContent.trim());
                return pageNum === initialPageNum;
              });
              
              if (targetPageItem) {
                console.log(`Page ${initialPageNum} is now visible, clicking directly...`);
                const clickable = targetPageItem.closest('.item') || targetPageItem.parentElement || targetPageItem;
                clickable.click();
                await new Promise(resolve => setTimeout(resolve, 2000));
                currentPage = getCurrentPageNum();
                console.log(`After clicking page ${initialPageNum}, current page is: ${currentPage}`);
                if (currentPage === initialPageNum) {
                  console.log(`Successfully navigated to page ${initialPageNum} - stopping navigation`);
                  navigationComplete = true;
                  window.scrollTo(0, 0);
                  break; // Exit loop immediately
                }
              }
            }
            
            attempts++;
          }
          
          // If we exited the loop and reached target, we're done
          if (navigationComplete || getCurrentPageNum() === initialPageNum) {
            console.log(`Navigation complete - on page ${getCurrentPageNum()}`);
            // Scroll to top multiple times to handle lazy loading
            window.scrollTo(0, 0);
            setTimeout(() => window.scrollTo(0, 0), 500);
            setTimeout(() => window.scrollTo(0, 0), 1500);
            return; // Exit function
          }
          
          // Final check (only reached if loop ended without reaching target)
          const finalPage = getCurrentPageNum();
          if (finalPage === initialPageNum) {
            console.log(`Successfully navigated to page ${initialPageNum}`);
            // Scroll to top of the page we're on
            window.scrollTo(0, 0);
            setTimeout(() => window.scrollTo(0, 0), 500);
            setTimeout(() => window.scrollTo(0, 0), 1500);
          } else {
            console.warn(`Could not reach page ${initialPageNum}, ended on page ${finalPage}`);
          }
        }
      } else {
        console.warn('Could not find pagination container when trying to navigate back');
      }
    } else {
      console.log('Started on page 1, staying on page 1');
      // Scroll to top
      window.scrollTo(0, 0);
      setTimeout(() => window.scrollTo(0, 0), 500);
      setTimeout(() => window.scrollTo(0, 0), 1500);
    }
    
    // Final scroll to top to ensure we're at the top of whatever page we ended on
    window.scrollTo(0, 0);
    setTimeout(() => window.scrollTo(0, 0), 500);
    setTimeout(() => window.scrollTo(0, 0), 1500);
    console.log('Final scroll to top completed');
  } catch (error) {
    console.warn('Error restoring page size:', error);
  }
}

// Flag to prevent getSelectedPools from running during clear/restore operations
let isRestoringNavigation = false;

// Track selected pool IDs in memory to avoid repeated page navigation
let selectedPoolIdsSet = new Set();

// In-memory pool data structure: Map<poolId, {cell, isSelected, selectButton, clearLink, poolId}>
// This allows us to manipulate pools without navigating pages
let poolsInMemory = new Map();
let poolsScraped = false; // Flag to track if we've scraped all pools
let isUpdatingOverlay = false; // Flag to prevent infinite loops in observer

/**
 * Scrape all pools from all pages once and store in memory
 * This avoids repeated page navigation
 */
async function scrapeAllPoolsToMemory() {
  if (poolsScraped && poolsInMemory.size > 0) {
    console.log(`Using cached pool data (${poolsInMemory.size} pools)`);
    return;
  }
  
  // Check if page has pools before attempting scrape
  const initialPoolCheck = document.querySelectorAll('div.liquidity-pool-cell');
  if (initialPoolCheck.length === 0) {
    console.warn('No pools found on page yet, scraping aborted');
    poolsScraped = false;
    return;
  }
  
  console.log('Scraping all pools to memory (one-time operation)...');
  poolsInMemory.clear();
  
  const paginationContainer = document.querySelector('.pagination');
  if (!paginationContainer) {
    // No pagination, just scrape current page
    const allPoolCells = document.querySelectorAll('div.liquidity-pool-cell');
    for (let cell of allPoolCells) {
      const poolId = extractPoolIdFromCell(cell);
      if (poolId) {
        const normalizedId = poolId.toLowerCase();
        const isSelected = isPoolSelectedOnCell(cell);
        const selectButton = cell.querySelector('button.btn.yellow-btn.clickable') ||
                          cell.querySelector('button.btn.yellow-btn:not([disabled])');
        const clearLink = findClearLinkInCell(cell);
        
        // Extract pool name from cell for search functionality
        const poolName = extractPoolNameFromCell(cell);
        
        poolsInMemory.set(normalizedId, {
          cell,
          isSelected,
          selectButton,
          clearLink,
          poolId: normalizedId,
          poolName: poolName
        });
        
        if (isSelected) {
          selectedPoolIdsSet.add(normalizedId);
        }
      }
    }
    poolsScraped = true;
    console.log(`Scraped ${poolsInMemory.size} pools from current page`);
    return;
  }
  
  // Store original state
  const initialPageNum = paginationContainer ? (() => {
    const selectedItem = paginationContainer.querySelector('.item.selected');
    if (!selectedItem) return 1;
    const text = selectedItem.textContent.trim();
    const pageNum = parseInt(text);
    return isNaN(pageNum) ? 1 : pageNum;
  })() : 1;
  
  // Temporarily set page size to 100
  let originalPageSize = null;
  let pageSizeSelector = null;
  let pageSizeChanged = false;
  
  console.log('Checking for page size selector...');
  const sizePerPageElement = document.querySelector('.size-per-page');
  if (sizePerPageElement) {
    const textContent = sizePerPageElement.textContent || '';
    const pageSizeMatch = textContent.match(/Pools\/Page:\s*(\d+)/i) || textContent.match(/(\d+)/);
    if (pageSizeMatch) {
      originalPageSize = pageSizeMatch[1];
      pageSizeSelector = sizePerPageElement;
      console.log(`Found page size selector, current size: ${originalPageSize}`);
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
  
  // Change to page size 100 if needed
  if (pageSizeSelector && originalPageSize !== '100') {
    try {
      console.log(`Changing page size from ${originalPageSize} to 100...`);
      
      // Check if it's a standard select element
      if (pageSizeSelector.tagName === 'SELECT') {
        pageSizeSelector.value = '100';
        const changeEvent = new Event('change', { bubbles: true });
        pageSizeSelector.dispatchEvent(changeEvent);
        pageSizeChanged = true;
        await new Promise(resolve => setTimeout(resolve, 3000)); // Wait for page reload
      } else {
        // It's a custom dropdown (like .size-per-page)
        pageSizeSelector.click();
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Find and click "100" option - try multiple strategies
        let option100 = null;
        
        // Strategy 1: Look near the selector
        const allElements = document.querySelectorAll('div, span, button, a');
        for (const elem of allElements) {
          if (elem.textContent.trim() === '100') {
            const rect = elem.getBoundingClientRect();
            const selectorRect = pageSizeSelector.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              // Check if it's near the selector (likely the dropdown option)
              if (Math.abs(rect.top - selectorRect.bottom) < 200 && 
                  Math.abs(rect.left - selectorRect.left) < 100) {
                option100 = elem;
                break;
              }
            }
          }
        }
        
        // Strategy 2: If not found, try any visible "100" element
        if (!option100) {
          for (const elem of allElements) {
            if (elem.textContent.trim() === '100') {
              const rect = elem.getBoundingClientRect();
              const style = getComputedStyle(elem);
              if (rect.width > 0 && rect.height > 0 && 
                  style.display !== 'none' && 
                  style.visibility !== 'hidden' &&
                  style.opacity !== '0') {
                option100 = elem;
                break;
              }
            }
          }
        }
        
        if (option100) {
          console.log('Found "100" option, clicking it...');
          option100.click();
          pageSizeChanged = true;
          await new Promise(resolve => setTimeout(resolve, 3000)); // Wait for page reload
          
          // Verify the change took effect
          const poolCountAfter = document.querySelectorAll('div.liquidity-pool-cell').length;
          console.log(`Page size changed. Pools visible: ${poolCountAfter}`);
          if (poolCountAfter < 50) {
            console.warn(`Page size may not have changed - only ${poolCountAfter} pools visible`);
          }
        } else {
          console.warn('Could not find "100" option in dropdown');
        }
      }
    } catch (e) {
      console.warn('Error changing page size:', e);
    }
  } else if (originalPageSize === '100') {
    console.log('Page size is already 100, no change needed');
  } else {
    console.warn('Could not find page size selector');
  }
  
  // Navigate to page 1 and scrape
  // Find page 1 button by checking text content
  const allPageItems = Array.from(paginationContainer.querySelectorAll('.item')).filter(item => {
    const text = item.textContent ? item.textContent.trim() : '';
    return /^1$/.test(text) && !item.classList.contains('extreme');
  });
  if (allPageItems.length > 0) {
    const page1Item = allPageItems[0];
    const clickable = page1Item.closest('.item') || page1Item.parentElement || page1Item;
    clickable.click();
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  // Scrape all pools from all pages
  let nextButton = document.querySelector('.pagination .item.extreme.right');
  let pagesChecked = 0;
  const maxPages = 20; // Safety limit
  let previousPoolCount = 0;
  let consecutiveEmptyPages = 0;
  
  while (pagesChecked < maxPages) {
    const allPoolCells = document.querySelectorAll('div.liquidity-pool-cell');
    const poolsOnThisPage = allPoolCells.length;
    console.log(`Scraping page ${pagesChecked + 1}, found ${poolsOnThisPage} pools`);
    
    let newPoolsFound = 0;
    for (let cell of allPoolCells) {
      const poolId = extractPoolIdFromCell(cell);
      if (poolId) {
        const normalizedId = poolId.toLowerCase();
        if (!poolsInMemory.has(normalizedId)) { // Avoid duplicates
          const isSelected = isPoolSelectedOnCell(cell);
          const selectButton = cell.querySelector('button.btn.yellow-btn.clickable') ||
                            cell.querySelector('button.btn.yellow-btn:not([disabled])');
          const clearLink = findClearLinkInCell(cell);
          
          // Extract pool name from cell for search functionality
          const poolName = extractPoolNameFromCell(cell);
          
          poolsInMemory.set(normalizedId, {
            cell,
            isSelected,
            selectButton,
            clearLink,
            poolId: normalizedId,
            poolName: poolName
          });
          
          if (isSelected) {
            selectedPoolIdsSet.add(normalizedId);
          }
          newPoolsFound++;
        }
      }
    }
    
    console.log(`  Added ${newPoolsFound} new pools (total: ${poolsInMemory.size})`);
    
    // Stop if we found no new pools on this page (we've seen everything)
    if (newPoolsFound === 0 && poolsOnThisPage > 0) {
      console.log('No new pools found on this page, stopping scrape');
      break;
    }
    
    // Stop if page is empty or we're seeing the same pool count repeatedly (might be stuck)
    if (poolsOnThisPage === 0) {
      consecutiveEmptyPages++;
      if (consecutiveEmptyPages >= 2) {
        console.log('Multiple empty pages, stopping scrape');
        break;
      }
    } else {
      consecutiveEmptyPages = 0;
    }
    
    // Check if there's a next page
    nextButton = document.querySelector('.pagination .item.extreme.right');
    if (!nextButton || nextButton.classList.contains('disabled')) {
      console.log('No next page available, stopping scrape');
      break;
    }
    
    const clickable = nextButton.closest('.item') || nextButton.parentElement || nextButton;
    if (clickable.classList.contains('disabled')) {
      console.log('Next button is disabled, stopping scrape');
      break;
    }
    
    // Before clicking next, verify page size is still 100
    const currentPageSize = sizePerPageElement ? (() => {
      const textContent = sizePerPageElement.textContent || '';
      const match = textContent.match(/Pools\/Page:\s*(\d+)/i) || textContent.match(/(\d+)/);
      return match ? match[1] : null;
    })() : null;
    
    if (currentPageSize && currentPageSize !== '100' && pageSizeChanged) {
      console.warn(`Page size reset to ${currentPageSize}, re-setting to 100...`);
      // Re-set to 100
      try {
        pageSizeSelector.click();
        await new Promise(resolve => setTimeout(resolve, 500));
        const allElements = document.querySelectorAll('div, span, button, a');
        for (const elem of allElements) {
          if (elem.textContent.trim() === '100') {
            const rect = elem.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              elem.click();
              await new Promise(resolve => setTimeout(resolve, 2000));
              break;
            }
          }
        }
      } catch (e) {
        console.warn('Error re-setting page size:', e);
      }
    }
    
    clickable.click();
    await new Promise(resolve => setTimeout(resolve, 2000));
    pagesChecked++;
  }
  
  // Restore original page size and page number
  if (pageSizeChanged && pageSizeSelector) {
    await restorePageSizeAndNavigation(originalPageSize, pageSizeSelector, true, initialPageNum);
  }
  
  poolsScraped = true;
  console.log(`Scraped ${poolsInMemory.size} unique pools from ${pagesChecked + 1} pages`);
}

// Helper functions
function extractPoolIdFromCell(cell) {
  let poolId = cell.getAttribute('data-pool-id') ||
               cell.getAttribute('data-pool-address') ||
               cell.getAttribute('data-address') ||
               cell.getAttribute('data-id');
  
  if (!poolId) {
    const idElements = cell.querySelectorAll('[data-pool-id], [data-pool-address], [data-address]');
    if (idElements.length > 0) {
      poolId = idElements[0].getAttribute('data-pool-id') ||
               idElements[0].getAttribute('data-pool-address') ||
               idElements[0].getAttribute('data-address');
    }
  }
  
  if (!poolId) {
    const innerHTML = cell.innerHTML || '';
    const ethAddressMatch = innerHTML.match(/0x[a-fA-F0-9]{40}/i);
    if (ethAddressMatch) {
      poolId = ethAddressMatch[0];
    }
  }
  
  return poolId ? poolId.toLowerCase().trim() : null;
}

function isPoolSelectedOnCell(cell) {
  const selectToVoteContainer = cell.querySelector('.select-to-vote-container');
  if (selectToVoteContainer) {
    const completedText = selectToVoteContainer.querySelector('.select-to-vote.completed');
    if (completedText && completedText.textContent.includes('Selected')) {
      return true;
    }
  }
  
  // Check for CLEAR link
  const clearLink = findClearLinkInCell(cell);
  if (clearLink) {
    return true;
  }
  
  // Check button state
  const selectButton = cell.querySelector('button.btn.yellow-btn');
  if (selectButton && !selectButton.classList.contains('clickable') && !selectButton.disabled) {
    return true;
  }
  
  return false;
}

function findClearLinkInCell(cell) {
  const selectToVoteContainer = cell.querySelector('.select-to-vote-container');
  if (selectToVoteContainer) {
    const clearLink = Array.from(selectToVoteContainer.querySelectorAll('*')).find(el => {
      const text = (el.textContent || '').trim().toUpperCase();
      return text === 'CLEAR' && !text.includes('ADD') && !text.includes('INCENTIVE');
    });
    if (clearLink) return clearLink;
  }
  
  return Array.from(cell.querySelectorAll('*')).find(el => {
    const text = (el.textContent || '').trim().toUpperCase();
    return text === 'CLEAR' && !text.includes('ADD') && !text.includes('INCENTIVE');
  });
}

// Extract pool name from cell for search functionality
function extractPoolNameFromCell(cell) {
  // Try to find pool name in common locations
  const nameSelectors = [
    '.pool-name',
    '.liquidity-pool-name',
    '[class*="pool-name"]',
    '[class*="name"]',
    'h3',
    'h4',
    '.title'
  ];
  
  for (const selector of nameSelectors) {
    const elem = cell.querySelector(selector);
    if (elem && elem.textContent) {
      const name = elem.textContent.trim();
      if (name && name.length > 0) {
        return name;
      }
    }
  }
  
  // Fallback: look for text that looks like a pool name (contains "/" or common token patterns)
  const allText = cell.textContent || '';
  const lines = allText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  for (const line of lines) {
    // Pool names often contain "/" (e.g., "USDC/USDT") or are short descriptive names
    if (line.includes('/') || (line.length > 3 && line.length < 50 && !line.match(/^0x[a-fA-F0-9]{40}$/i))) {
      return line;
    }
  }
  
  return null;
}

// Clear all selected pools - Use page size strategy like extractor
async function clearAllSelectedPools() {
  let clearedCount = 0;
  const clearLinks = [];
  
  // Set flag to prevent interference from other navigation
  isRestoringNavigation = true;
  
  try {
    // Store initial state - capture BEFORE any operations
    const paginationContainer = document.querySelector('.pagination');
  const initialPageNum = paginationContainer ? (() => {
    const selectedItem = paginationContainer.querySelector('.item.selected');
    if (!selectedItem) {
      console.log('No selected pagination item found, assuming page 1');
      return 1;
    }
    const text = selectedItem.textContent.trim();
    const pageNum = parseInt(text);
    const detected = isNaN(pageNum) ? 1 : pageNum;
    console.log(`Detected initial page number: ${detected} (from text: "${text}")`);
    return detected;
  })() : 1;
  
  // Helper function to find selected pools on current page
  function findSelectedPoolsOnCurrentPage() {
    const allPoolCells = document.querySelectorAll('div.liquidity-pool-cell');
    const found = [];
    
    console.log(`Checking ${allPoolCells.length} pool cells for selected state...`);
    
    for (let cell of allPoolCells) {
      // Try to extract pool ID for debugging
      const cellHTML = cell.innerHTML || '';
      const poolIdMatch = cellHTML.match(/0x[a-fA-F0-9]{40}/i);
      const poolId = poolIdMatch ? poolIdMatch[0] : 'unknown';
      
      let isSelected = false;
      let clearLink = null;
      
      // Method 1: Check for "Selected to vote" indicator
      const selectToVoteContainer = cell.querySelector('.select-to-vote-container');
      if (selectToVoteContainer) {
        const completedText = selectToVoteContainer.querySelector('.select-to-vote.completed');
        if (completedText && completedText.textContent.includes('Selected')) {
          isSelected = true;
          console.log(`Pool ${poolId}: Found "Selected" text indicator`);
        }
      }
      
      // Method 2: Look for "CLEAR" button/link (indicates selected)
      if (!isSelected) {
        const allElements = cell.querySelectorAll('*');
        for (const el of allElements) {
          const text = (el.textContent || '').trim().toUpperCase();
          if (text === 'CLEAR' && !text.includes('ADD') && !text.includes('INCENTIVE')) {
            isSelected = true;
            clearLink = el;
            console.log(`Pool ${poolId}: Found CLEAR link`);
            break;
          }
        }
      }
      
      // Method 3: Check button state (SELECT button not clickable = selected)
      if (!isSelected) {
        const selectButton = cell.querySelector('button.btn.yellow-btn');
        if (selectButton) {
          const isClickable = selectButton.classList.contains('clickable');
          const isDisabled = selectButton.disabled;
          
          if (!isClickable && !isDisabled) {
            // Button exists but isn't clickable - might be selected
            // Double-check by looking for CLEAR link nearby
            const nearbyClear = selectToVoteContainer ? 
              Array.from(selectToVoteContainer.querySelectorAll('*')).find(el => {
                const text = (el.textContent || '').trim().toUpperCase();
                return text === 'CLEAR';
              }) : null;
            if (nearbyClear) {
              isSelected = true;
              clearLink = nearbyClear;
              console.log(`Pool ${poolId}: Found non-clickable button + CLEAR link`);
            }
          }
        }
      }
      
      if (isSelected) {
        // Make sure we have the clear link
        if (!clearLink) {
          if (selectToVoteContainer) {
            clearLink = Array.from(selectToVoteContainer.querySelectorAll('*')).find(el => {
              const text = (el.textContent || '').trim().toUpperCase();
              return text === 'CLEAR' && !text.includes('ADD') && !text.includes('INCENTIVE');
            });
          }
          if (!clearLink) {
            clearLink = Array.from(cell.querySelectorAll('*')).find(el => {
              const text = (el.textContent || '').trim().toUpperCase();
              return text === 'CLEAR' && !text.includes('ADD') && !text.includes('INCENTIVE');
            });
          }
        }
        
        if (clearLink) {
          found.push({ cell, link: clearLink, poolId });
          console.log(`Pool ${poolId}: Added to clear list`);
        } else {
          console.warn(`Pool ${poolId}: Found selected but could not find CLEAR link. Cell HTML:`, cell.innerHTML.substring(0, 200));
        }
      }
    }
    
    return found;
  }
  
  // Step 1: Record and increase page size to 100 (like extractor does)
  let originalPageSize = null;
  let pageSizeSelector = null;
  let pageSizeChanged = false;
  
  if (paginationContainer) {
    // Try to find the size-per-page element (custom dropdown)
    const sizePerPageElement = document.querySelector('.size-per-page');
    if (sizePerPageElement) {
      const textContent = sizePerPageElement.textContent || '';
      const pageSizeMatch = textContent.match(/Pools\/Page:\s*(\d+)/i) || textContent.match(/(\d+)/);
      if (pageSizeMatch) {
        originalPageSize = pageSizeMatch[1];
        pageSizeSelector = sizePerPageElement;
        console.log(`Current page size: ${originalPageSize}`);
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
        }
        
      } catch (error) {
        console.warn('Error changing page size:', error);
        pageSizeChanged = false;
      }
    }
  }
  
  // Helper function to get selected pool count from vote box
  function getSelectedPoolCountFromVoteBox() {
    // Look for the count element: .selection-details .selected .count
    // Structure: <div class="selection-details"><div class="selected"><div class="count">0</div>...
    const countElement = document.querySelector('.selection-details .selected .count');
    
    if (countElement) {
      const text = countElement.textContent.trim();
      const count = parseInt(text);
      if (!isNaN(count)) {
        return count;
      }
    }
    
    // Fallback: try .selected .count (in case structure is slightly different)
    const fallbackCount = document.querySelector('.selected .count');
    if (fallbackCount) {
      const text = fallbackCount.textContent.trim();
      const count = parseInt(text);
      if (!isNaN(count)) {
        return count;
      }
    }
    
    // Fallback: try to find it by searching for "Pools Selected" text nearby
    const poolsSelectedText = Array.from(document.querySelectorAll('*')).find(el => {
      const text = el.textContent || '';
      return text.trim() === 'Pools Selected';
    });
    
    if (poolsSelectedText) {
      // Look for a number element nearby (sibling or parent)
      const parent = poolsSelectedText.parentElement;
      if (parent) {
        const countEl = parent.querySelector('.count');
        if (countEl) {
          const count = parseInt(countEl.textContent.trim());
          if (!isNaN(count)) {
            return count;
          }
        }
      }
    }
    
    return null;
  }
  
  // Get initial selected pool count from vote box
  const initialSelectedCount = getSelectedPoolCountFromVoteBox();
  console.log(`Initial selected pool count from vote box: ${initialSelectedCount}`);
  
  return initialSelectedCount;
  
  // Step 2: Navigate to page 1 and check all pages, clicking CLEAR immediately when found
  if (paginationContainer) {
    // Go to page 1
    const allPageItems = Array.from(paginationContainer.querySelectorAll('.item')).filter(item => {
      const text = item.textContent ? item.textContent.trim() : '';
      return /^1$/.test(text) && !item.classList.contains('extreme');
    });
    if (allPageItems.length > 0) {
      const page1Item = allPageItems[0];
      const clickable = page1Item.closest('.item') || page1Item.parentElement || page1Item;
      clickable.click();
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // Check all pages and click CLEAR immediately when found (don't collect stale references)
    let nextButton = document.querySelector('.pagination .item.extreme.right');
    let pagesChecked = 0;
    const maxPagesToCheck = 5; // Should only need 1-2 pages with size 100
    
    while (nextButton && pagesChecked < maxPagesToCheck) {
      // Check if all pools are already cleared before checking this page
      const countBeforePage = getSelectedPoolCountFromVoteBox();
      if (countBeforePage !== null && countBeforePage === 0) {
        console.log(`All pools already cleared (vote box shows 0). Stopping navigation.`);
        break;
      }
      
      const pageSelected = findSelectedPoolsOnCurrentPage();
      if (pageSelected.length > 0) {
        console.log(`Found ${pageSelected.length} selected pools on current page, clearing now...`);
        // Click immediately while we're on this page
        for (const { cell, link, poolId } of pageSelected) {
          try {
            // Scroll into view if needed
            const rect = cell.getBoundingClientRect();
            const isVisible = rect.top >= -100 && rect.bottom <= window.innerHeight + 100;
            if (!isVisible) {
              cell.scrollIntoView({ behavior: 'auto', block: 'center' });
              await new Promise(resolve => setTimeout(resolve, 200));
            }
            
            // Click the CLEAR link immediately
            link.click();
            clearedCount++;
            // Update in-memory tracking
            if (poolId) {
              selectedPoolIdsSet.delete(poolId.toLowerCase());
            }
            console.log(`✓ Cleared pool ${poolId} on current page`);
            
            // Check if vote box count has reached 0 (all pools cleared)
            await new Promise(resolve => setTimeout(resolve, 300)); // Small delay for DOM update
            const currentCount = getSelectedPoolCountFromVoteBox();
            if (currentCount !== null && currentCount === 0) {
              console.log(`Vote box shows 0 selected pools - all cleared! Stopping navigation.`);
              break; // Exit the for loop
            }
            
            // Small delay between clicks
            await new Promise(resolve => setTimeout(resolve, 200));
          } catch (e) {
            console.warn(`Error clearing pool ${poolId}:`, e);
          }
        }
        
        // Check again after clearing all pools on this page
        const countAfterPage = getSelectedPoolCountFromVoteBox();
        if (countAfterPage !== null && countAfterPage === 0) {
          console.log(`All pools cleared (vote box shows 0). Stopping page navigation.`);
          break; // Exit the while loop
        }
      }
      
      // Check count before navigating to next page
      const countBeforeNext = getSelectedPoolCountFromVoteBox();
      if (countBeforeNext !== null && countBeforeNext === 0) {
        console.log(`All pools cleared before next page. Stopping navigation.`);
        break;
      }
      
      const clickable = nextButton.closest('.item') || nextButton.parentElement || nextButton;
      const isDisabled = clickable.classList.contains('disabled');
      
      if (isDisabled) break;
      
      clickable.click();
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      pagesChecked++;
      nextButton = document.querySelector('.pagination .item.extreme.right');
      if (!nextButton || nextButton.classList.contains('disabled')) break;
    }
    
    // Check final page (only if we haven't already cleared everything)
    const finalCount = getSelectedPoolCountFromVoteBox();
    if (finalCount !== null && finalCount > 0) {
      const finalPageSelected = findSelectedPoolsOnCurrentPage();
      if (finalPageSelected.length > 0) {
        console.log(`Found ${finalPageSelected.length} selected pools on final page, clearing now...`);
        for (const { cell, link, poolId } of finalPageSelected) {
          try {
            const rect = cell.getBoundingClientRect();
            const isVisible = rect.top >= -100 && rect.bottom <= window.innerHeight + 100;
            if (!isVisible) {
              cell.scrollIntoView({ behavior: 'auto', block: 'center' });
              await new Promise(resolve => setTimeout(resolve, 200));
            }
            
            link.click();
            clearedCount++;
            // Update in-memory tracking
            if (poolId) {
              selectedPoolIdsSet.delete(poolId.toLowerCase());
            }
            console.log(`✓ Cleared pool ${poolId} on final page`);
            
            // Check if all cleared
            await new Promise(resolve => setTimeout(resolve, 300));
            const countAfterClear = getSelectedPoolCountFromVoteBox();
            if (countAfterClear !== null && countAfterClear === 0) {
              console.log(`All pools cleared. Stopping.`);
              break;
            }
            
            await new Promise(resolve => setTimeout(resolve, 200));
          } catch (e) {
            console.warn(`Error clearing pool ${poolId}:`, e);
          }
        }
      }
    }
  } else {
    // No pagination, just check current page and click immediately
    const currentPageSelected = findSelectedPoolsOnCurrentPage();
    if (currentPageSelected.length > 0) {
      console.log(`Found ${currentPageSelected.length} selected pools, clearing now...`);
      for (const { cell, link, poolId } of currentPageSelected) {
        try {
          const rect = cell.getBoundingClientRect();
          const isVisible = rect.top >= -100 && rect.bottom <= window.innerHeight + 100;
          if (!isVisible) {
            cell.scrollIntoView({ behavior: 'auto', block: 'center' });
            await new Promise(resolve => setTimeout(resolve, 200));
          }
          
          link.click();
          clearedCount++;
          // Update in-memory tracking
          if (poolId) {
            selectedPoolIdsSet.delete(poolId.toLowerCase());
          }
          console.log(`✓ Cleared pool ${poolId}`);
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (e) {
          console.warn(`Error clearing pool ${poolId}:`, e);
        }
      }
    }
  }
  
  // Step 3: Restore page size and navigation using shared helper
  console.log(`About to restore: pageSizeChanged=${pageSizeChanged}, originalPageSize=${originalPageSize}, initialPageNum=${initialPageNum}`);
  if (paginationContainer) {
    await restorePageSizeAndNavigation(originalPageSize, pageSizeSelector, pageSizeChanged, initialPageNum);
  }
  
  // Note: clearedCount was already incremented during page navigation above
  console.log(`Cleared ${clearedCount} selected pools`);
  
  // Clear all selected pool IDs from memory (in case we missed any)
  selectedPoolIdsSet.clear();
  
    // Update overlay after a brief delay to let DOM updates settle
    setTimeout(() => {
      isRestoringNavigation = false; // Clear flag after a delay
      updateOverlay();
    }, 1000); // Longer delay to ensure restoration is complete
    return clearedCount;
  } finally {
    // Ensure flag is cleared even if there's an error
    setTimeout(() => {
      isRestoringNavigation = false;
    }, 2000);
  }
}

// ============================================================================
// SEARCH-BASED POOL SELECTION - Fast pool discovery without page navigation
// ============================================================================

/**
 * Get the search input element
 */
function getSearchInput() {
  return document.querySelector('.search-container input.input, .search-bar-outer input.input');
}

/**
 * Trigger search with all necessary events
 */
function triggerSearch(input, value) {
  input.value = value;
  input.focus();
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
  input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter' }));
}

/**
 * Wait helper
 */
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if pool is selected via search (fast, no page navigation)
 * Note: Uses helper functions defined earlier: getSearchInput, triggerSearch, wait,
 * findPoolCellById, isPoolSelectedOnCell
 */
async function checkPoolSelectionViaSearch(poolId) {
  const searchInput = getSearchInput();
  if (!searchInput) {
    console.warn('Search input not found');
    return false;
  }

  // Search for the pool
  triggerSearch(searchInput, poolId);
  await wait(400);

  // Check if pool is selected
  const cell = findPoolCellById(poolId);
  if (!cell) {
    console.warn(`Pool ${poolId} not found after search`);
    return false;
  }

  const isSelected = isPoolSelectedOnCell(cell);
  return isSelected;
}

/**
 * Discover which pools from a list are currently selected
 * Uses search to avoid page navigation
 *
 * @param {string[]} poolIds - Array of pool IDs to check
 * @param {Function} progressCallback - Optional callback for progress updates
 * @returns {Promise<Set<string>>} - Set of selected pool IDs
 */
async function discoverSelectedPools(poolIds, progressCallback = null) {
  const searchInput = getSearchInput();
  if (!searchInput) {
    console.warn('Search input not found - cannot discover selected pools');
    return new Set();
  }

  const selectedSet = new Set();
  const total = poolIds.length;

  console.log(`Discovering selection state for ${total} pools...`);

  for (let i = 0; i < total; i++) {
    const poolId = poolIds[i];

    if (progressCallback) {
      progressCallback(i + 1, total, `Checking ${poolId.slice(0, 10)}...`);
    }

    try {
      const isSelected = await checkPoolSelectionViaSearch(poolId);
      if (isSelected) {
        selectedSet.add(poolId.toLowerCase());
      }
    } catch (error) {
      console.warn(`Failed to check pool ${poolId}:`, error);
    }
  }

  // Clear search
  triggerSearch(searchInput, '');
  await wait(300);

  console.log(`Found ${selectedSet.size} selected pools out of ${total} checked`);
  return selectedSet;
}

/**
 * Clear all selected pools using search (no page navigation)
 *
 * @param {Set<string>} selectedPoolIds - Set of pool IDs to clear
 * @param {Function} progressCallback - Optional callback for progress updates
 */
async function clearAllViaSearch(selectedPoolIds, progressCallback = null) {
  const searchInput = getSearchInput();
  if (!searchInput) {
    throw new Error('Search input not found');
  }

  const poolIdsArray = Array.from(selectedPoolIds);
  const total = poolIdsArray.length;
  let cleared = 0;

  console.log(`Clearing ${total} selected pools via search...`);

  for (let i = 0; i < total; i++) {
    const poolId = poolIdsArray[i];

    if (progressCallback) {
      progressCallback(i + 1, total, `Clearing ${poolId.slice(0, 10)}...`);
    }

    try {
      // Search for pool
      triggerSearch(searchInput, poolId);
      await wait(400);

      // Find cell
      const cell = findPoolCellById(poolId);
      if (!cell) {
        console.warn(`Pool ${poolId} not found`);
        continue;
      }

      // Find and click CLEAR link
      const clearLink = cell.querySelector('span.link.underline');
      if (clearLink && clearLink.textContent.toLowerCase().includes('clear')) {
        clearLink.click();
        cleared++;
        await wait(150);
      } else {
        console.warn(`No CLEAR link found for ${poolId}`);
      }
    } catch (error) {
      console.error(`Failed to clear pool ${poolId}:`, error);
    }
  }

  // Clear search
  triggerSearch(searchInput, '');
  await wait(300);

  console.log(`Cleared ${cleared}/${total} pools`);
  return cleared;
}

/**
 * Get selected pools from recommendations (fast)
 * Only checks pools the user cares about, not all 100+ pools
 */
async function getSelectedPoolsInRecommendations() {
  try {
    // Get pool data and settings from storage
    const result = await safeStorageGet(['poolData', 'blackholeSettings']);
    const poolData = result.poolData || [];
    const settings = result.blackholeSettings || {};

    if (poolData.length === 0) {
      console.warn('No pool data available');
      return new Set();
    }

    // Create Pool instances
    const pools = poolData.map(data => {
      // Check if data is already a Pool instance
      if (data instanceof Pool) {
        return data;
      }
      return new Pool(data);
    });

    // Get recommended pools (typically top 10-20)
    const recommendations = recommendPools(pools, {
      topN: settings.topN || 20,  // Check a few more than displayed
      userVotingPower: settings.votingPower,
      hideVamm: settings.hideVamm,
      minRewards: settings.minRewards,
      maxPoolPercentage: settings.maxPoolPercentage,
      poolName: settings.poolNameFilter,
      sortBy: settings.sortBy || 'auto'
    });

    const recommendedIds = recommendations.map(p => p.pool_id);
    console.log(`Checking selection state for ${recommendedIds.length} recommended pools`);

    // Discover which are selected
    const selectedSet = await discoverSelectedPools(recommendedIds, (current, total, status) => {
      console.log(`Discovery progress: ${current}/${total} - ${status}`);
    });

    return selectedSet;
  } catch (error) {
    console.error('Error getting selected pools in recommendations:', error);
    return new Set();
  }
}

/**
 * Notify sidepanel of selection state change
 */
function notifySelectionChanged(poolId, isSelected) {
  try {
    chrome.runtime.sendMessage({
      type: 'POOL_SELECTION_CHANGED',
      poolId: poolId,
      isSelected: isSelected
    });
  } catch (error) {
    console.warn('Failed to notify sidepanel:', error);
  }
}

// ============================================================================
// END SEARCH-BASED POOL SELECTION
// ============================================================================

// Get all currently selected pools (checks all pages if pagination exists)
async function getSelectedPools() {
  // Don't navigate if we're in the middle of restoring navigation
  if (isRestoringNavigation) {
    console.log('Skipping getSelectedPools - navigation restoration in progress');
    // Just return pools from current page without navigating
    const selectedPools = [];
    const allPoolCells = document.querySelectorAll('div.liquidity-pool-cell');
    for (let cell of allPoolCells) {
      const selectToVoteContainer = cell.querySelector('.select-to-vote-container');
      if (selectToVoteContainer) {
        const completedText = selectToVoteContainer.querySelector('.select-to-vote.completed');
        if (completedText && completedText.textContent.includes('Selected to vote')) {
          const innerHTML = cell.innerHTML || '';
          const addressMatch = innerHTML.match(/0x[a-fA-F0-9]{40}/i);
          if (addressMatch) {
            selectedPools.push({ poolId: addressMatch[0], cell: cell });
          }
        }
      }
    }
    return selectedPools;
  }
  
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
  console.log(`[SPLIT] Attempting to fill ${poolInputs.length} inputs...`);
  
  for (const poolInput of poolInputs) {
    try {
      console.log(`[SPLIT] Processing pool ${poolInput.pool.poolId}, allocating ${poolInput.percentage}%`);
      
      // Don't scroll - it's disruptive
      // poolInput.input.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // await new Promise(resolve => setTimeout(resolve, 100));
      
      // Focus and set value (percentage, not absolute votes)
      poolInput.input.focus();
      poolInput.input.value = poolInput.percentage.toString();
      
      // Trigger input events to ensure React/UI updates
      poolInput.input.dispatchEvent(new Event('input', { bubbles: true }));
      poolInput.input.dispatchEvent(new Event('change', { bubbles: true }));
      poolInput.input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
      poolInput.input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
      
      // Also try setting value property directly (for React controlled components)
      try {
        const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        if (valueSetter) {
          valueSetter.call(poolInput.input, poolInput.percentage.toString());
          poolInput.input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      } catch (setterError) {
        console.warn('[SPLIT] Value setter error (non-critical):', setterError);
      }
      
      filledCount++;
      console.log(`[SPLIT] ✓ Allocated ${poolInput.percentage}% to pool ${poolInput.pool.poolId} (${filledCount}/${poolInputs.length})`);
      
      // Shorter delay between inputs (faster)
      await new Promise(resolve => setTimeout(resolve, 50));
    } catch (e) {
      console.error(`[SPLIT] Error setting percentage for pool ${poolInput.pool.poolId}:`, e);
      // Continue with other pools even if one fails
    }
  }
  
  console.log(`[SPLIT] Finished: filled ${filledCount}/${poolInputs.length} inputs`);
  
  // Show feedback
  const contentEl = document.getElementById('blackhole-tools-content');
  if (contentEl) {
    const originalHTML = contentEl.innerHTML;
    if (filledCount > 0) {
      contentEl.innerHTML = `<p style="color: #32cd32; text-align: center; padding: 20px;">✓ Split 100% voting power across ${filledCount} pool(s)<br><small style="color: #999;">Check vote panel to verify</small></p>`;
    } else {
      contentEl.innerHTML = `<p style="color: #ff8c00; text-align: center; padding: 20px;">⚠️ Could not find vote allocation inputs.<br><small>Make sure the voting dialog is open and pools are selected.</small></p>`;
    }
    setTimeout(() => {
      contentEl.innerHTML = originalHTML;
      updateOverlay();
    }, 3000);
  }
}

/**
 * Clear all votes using the "Clear Votes" button in the vote panel (FASTEST!)
 * @returns {Promise<boolean>} True if successful, false otherwise
 */
async function clearAllVotesViaVotePanel() {
  console.log('[VotePanel] Attempting to clear all votes via vote panel button...');
  
  // Check if modal is already open
  let modal = document.querySelector('.voting-modal, .sc-modal-overlay.show');
  let wasOpen = !!(modal && (modal.offsetParent !== null || window.getComputedStyle(modal).display !== 'none'));
  
  // Open the vote panel if it's not already open
  if (!wasOpen) {
    console.log('[VotePanel] Opening vote panel...');
    await toggleVotePanel();
    await new Promise(resolve => setTimeout(resolve, 500)); // Wait for modal to fully render
    modal = document.querySelector('.voting-modal, .sc-modal-overlay.show');
  }
  
  if (!modal) {
    console.warn('[VotePanel] Could not find vote panel');
    return false;
  }
  
  // Look for "Clear Votes" button
  // Structure: <div class="extra-func">...<div class="uppercase clickable">Clear Votes</div>...
  const clearVotesButtons = Array.from(modal.querySelectorAll('.uppercase.clickable'));
  const clearVotesButton = clearVotesButtons.find(btn => 
    btn.textContent && btn.textContent.trim().toLowerCase() === 'clear votes'
  );
  
  if (clearVotesButton) {
    console.log('[VotePanel] Found "Clear Votes" button, clicking...');
    clearVotesButton.click();
    
    // Wait for action to complete
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // ALWAYS close the panel (whether we opened it or not)
    // User expects panel to be closed after "Clear All"
    console.log('[VotePanel] Closing vote panel...');
    await toggleVotePanel();
    
    console.log('[VotePanel] Successfully cleared all votes via vote panel');
    return true;
  }
  
  console.warn('[VotePanel] Could not find "Clear Votes" button');
  
  // Close the panel if we opened it
  if (!wasOpen) {
    await toggleVotePanel();
  }
  
  return false;
}

/**
 * Get selected pools from the vote panel (FAST - no page navigation!)
 * This opens the vote modal, extracts pool IDs, then optionally closes it
 * 
 * @param {boolean} closeAfter - Whether to close the vote panel after extracting (default: true)
 * @returns {Promise<Set<string>>} Set of selected pool IDs (lowercase)
 */
async function getSelectedPoolsFromVotePanel(closeAfter = true) {
  console.log('[VotePanel] Getting selected pools from vote panel...');
  
  // Check if modal is already open
  let modal = document.querySelector('.voting-modal, .sc-modal-overlay.show');
  let wasOpen = !!(modal && (modal.offsetParent !== null || window.getComputedStyle(modal).display !== 'none'));
  
  // Open the vote panel if it's not already open
  if (!wasOpen) {
    console.log('[VotePanel] Opening vote panel...');
    await toggleVotePanel();
    await new Promise(resolve => setTimeout(resolve, 500)); // Wait for modal to fully render
    modal = document.querySelector('.voting-modal, .sc-modal-overlay.show');
  }
  
  if (!modal) {
    console.warn('[VotePanel] Could not find vote panel');
    return new Set();
  }
  
  const selectedPoolIds = new Set();
  
  // Method 1: Look for pool-address-tooltip attributes (most reliable for blackhole.xyz)
  // Format: data-tooltip-id="pool-address-tooltip-0xA02Ec3Ba8d17887567672b2CDCAF525534636Ea0"
  const tooltipElements = modal.querySelectorAll('[data-tooltip-id^="pool-address-tooltip-"]');
  console.log(`[VotePanel] Found ${tooltipElements.length} tooltip elements`);
  
  for (const element of tooltipElements) {
    const tooltipId = element.getAttribute('data-tooltip-id');
    if (tooltipId) {
      // Extract address from tooltip ID: "pool-address-tooltip-0xABCD..."
      const match = tooltipId.match(/pool-address-tooltip-(0x[a-fA-F0-9]{40})/i);
      if (match && match[1]) {
        selectedPoolIds.add(match[1].toLowerCase());
        console.log('[VotePanel] Found pool from tooltip:', match[1]);
      }
    }
  }
  
  // Method 2: Look for liquidity-pool-cell elements in the vote panel
  if (selectedPoolIds.size === 0) {
    console.log('[VotePanel] Method 1 found nothing, trying method 2 (pool cells)...');
    const poolCells = modal.querySelectorAll('.liquidity-pool-cell');
    console.log(`[VotePanel] Found ${poolCells.length} pool cells`);
    
    for (const cell of poolCells) {
      // Try to find pool address in the cell HTML
      const html = cell.innerHTML || '';
      const addressMatch = html.match(/0x[a-fA-F0-9]{40}/i);
      if (addressMatch) {
        selectedPoolIds.add(addressMatch[0].toLowerCase());
        console.log('[VotePanel] Found pool from cell:', addressMatch[0]);
      }
    }
  }
  
  // Method 3: Search all modal HTML for addresses (fallback)
  if (selectedPoolIds.size === 0) {
    console.log('[VotePanel] Method 2 found nothing, trying method 3 (regex)...');
    const modalHTML = modal.innerHTML || '';
    const addressRegex = /0x[a-fA-F0-9]{40}/gi;
    const matches = modalHTML.match(addressRegex);
    
    if (matches) {
      // Deduplicate and add to set
      matches.forEach(addr => {
        selectedPoolIds.add(addr.toLowerCase());
      });
      console.log('[VotePanel] Found', matches.length, 'addresses via regex');
    }
  }
  
  console.log(`[VotePanel] Total discovered: ${selectedPoolIds.size} selected pools`);
  
  // Close the panel if requested and it wasn't already open
  if (closeAfter && !wasOpen) {
    console.log('[VotePanel] Closing vote panel...');
    await toggleVotePanel();
  }
  
  return selectedPoolIds;
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

// Select or deselect a single pool by ID - FAST DIRECT APPROACH
async function selectSinglePool(poolId, options = {}) {
  if (!poolId) {
    console.warn('No pool ID provided');
    return;
  }

  const { skipSearchClear = false } = options;

  const normalizedPoolId = poolId.toLowerCase().trim();
  console.log(`Selecting pool: ${poolId}${skipSearchClear ? ' (batch mode)' : ''}`);
  
  // Ensure pools are scraped to memory
  await scrapeAllPoolsToMemory();
  
  // Get pool from memory
  let poolData = poolsInMemory.get(normalizedPoolId);
  if (!poolData) {
    console.warn(`Pool ${poolId} not found in memory. Re-scraping...`);
    poolsScraped = false; // Force re-scrape
    await scrapeAllPoolsToMemory();
    poolData = poolsInMemory.get(normalizedPoolId);
    if (!poolData) {
      alert(`Could not find pool ${poolId}. The pool may not exist or may not be visible.`);
      return;
    }
  }
  
  // Check if already selected from memory
  const isSelected = poolData.isSelected || selectedPoolIdsSet.has(normalizedPoolId);
  console.log(`Pool ${poolId} current state: isSelected=${isSelected}, in memory=${poolData.isSelected}, in set=${selectedPoolIdsSet.has(normalizedPoolId)}`);
  
  // Use search bar to filter page to show only this pool
  const searchInput = document.querySelector('.search-container input.input, .search-bar-outer input.input');
  let cell = null;
  
  if (searchInput) {
    // Search by pool ADDRESS (unique) instead of name (can match multiple)
    console.log(`Trying search term: "${poolId}" (pool address)`);
    
    // Clear any existing search
    searchInput.value = '';
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    searchInput.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Set search term to pool address
    searchInput.value = poolId;
    searchInput.focus();
    
    // Trigger multiple events to ensure the search works
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    searchInput.dispatchEvent(new Event('change', { bubbles: true }));
    searchInput.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    searchInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter' }));
    searchInput.dispatchEvent(new KeyboardEvent('keypress', { bubbles: true, key: 'Enter' }));
    
    // Wait for page to filter
    await new Promise(resolve => setTimeout(resolve, 800));
    
    // Now find the pool on the filtered page
    const allCells = document.querySelectorAll('div.liquidity-pool-cell');
    console.log(`Found ${allCells.length} pools after searching for pool address`);
    
    if (allCells.length === 1) {
      // Perfect - only one pool matches
      cell = allCells[0];
      poolData.cell = cell;
      console.log(`✓ Found pool using address search`);
    } else if (allCells.length > 1) {
      // Multiple pools found, find exact match
      for (let c of allCells) {
        const id = extractPoolIdFromCell(c);
        if (id === normalizedPoolId) {
          cell = c;
          poolData.cell = c;
          console.log(`✓ Found pool using address search (${allCells.length} candidates)`);
          break;
        }
      }
    }
  }
  
  // If search didn't work or search bar not found, try finding on current page
  if (!cell) {
    console.log('Search did not find pool, trying current page...');
    const allCells = document.querySelectorAll('div.liquidity-pool-cell');
    for (let c of allCells) {
      const id = extractPoolIdFromCell(c);
      if (id === normalizedPoolId) {
        cell = c;
        poolData.cell = c;
        break;
      }
    }
  }
  
  if (!cell) {
    console.warn(`Pool ${poolId} not found after search. Clearing search...`);
    // Clear search
    if (searchInput) {
      searchInput.value = '';
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      searchInput.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    alert(`Could not find pool ${poolId} on the page. The pool may not exist or the search may have failed.`);
    return;
  }
  
  // Get fresh button/link references from the cell
  // Try multiple selector patterns since the DOM might vary
  const selectButton = cell.querySelector('button.btn.yellow-btn.clickable') ||
                      cell.querySelector('button.btn.yellow-btn:not([disabled])') ||
                      cell.querySelector('button.yellow-btn') ||
                      cell.querySelector('.select-to-vote-container button');
  const clearLink = findClearLinkInCell(cell);
  
  console.log(`Found elements in cell: selectButton=${!!selectButton}, clearLink=${!!clearLink}, isSelected=${isSelected}`);
  
  // Debug: log the cell's HTML structure if we can't find buttons
  if (!selectButton && !clearLink) {
    console.warn('No buttons found in cell. Cell HTML:', cell.innerHTML.substring(0, 500));
  }
  
  // If we think it's selected but can't find clear link, check actual DOM state
  if (isSelected && !clearLink) {
    console.warn('Pool marked as selected but no clear link found. Checking actual DOM state...');
    const actualIsSelected = isPoolSelectedOnCell(cell);
    console.log(`DOM shows pool is ${actualIsSelected ? 'SELECTED' : 'NOT SELECTED'}`);
    
    if (!actualIsSelected && selectButton) {
      console.log('Memory was wrong - pool not actually selected, using select button');
      // Memory was stale, update it
      selectedPoolIdsSet.delete(normalizedPoolId);
      poolData.isSelected = false;
      // Fall through to select logic below
    }
  }
  
  // Scroll into view if needed
  const rect = cell.getBoundingClientRect();
  const isVisible = rect.top >= -100 && rect.bottom <= window.innerHeight + 100 && 
                   rect.left >= -100 && rect.right <= window.innerWidth + 100;
  if (!isVisible) {
    cell.scrollIntoView({ behavior: 'auto', block: 'center' });
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  
  // Click the appropriate button/link - re-check state after DOM verification
  const finalIsSelected = selectedPoolIdsSet.has(normalizedPoolId);
  if (finalIsSelected && clearLink) {
    try {
      clearLink.click();
      console.log(`✓ Deselected pool: ${poolId}`);
      // Update in-memory tracking
      selectedPoolIdsSet.delete(normalizedPoolId);
      poolData.isSelected = false;

      // Notify sidepanel immediately
      notifySelectionChanged(poolId, false);

      await new Promise(resolve => setTimeout(resolve, 300));

      // Clear search field unless in batch mode
      if (!skipSearchClear) {
        const currentSearchInput = document.querySelector('.search-container input.input, .search-bar-outer input.input');
        if (currentSearchInput) {
          try {
            currentSearchInput.value = '';
            currentSearchInput.dispatchEvent(new Event('input', { bubbles: true }));
            currentSearchInput.dispatchEvent(new Event('change', { bubbles: true }));
            await new Promise(resolve => setTimeout(resolve, 300)); // Wait for page to unfilter
          } catch (searchErr) {
            console.warn('Error clearing search (non-critical):', searchErr);
          }
        }
      }

      // Update overlay immediately (don't block on errors)
      updateOverlay().catch(err => console.warn('updateOverlay error (non-critical):', err));
    } catch (e) {
      console.error(`Error during pool deselection:`, e);
      console.error(`Error details: ${e.message}, stack: ${e.stack}`);
      // Don't show alert if the pool was actually deselected
      const wasDeselected = !selectedPoolIdsSet.has(normalizedPoolId);
      if (!wasDeselected) {
        alert(`Error clearing pool ${poolId}. Please try manually.`);
      } else {
        console.log(`Pool ${poolId} was deselected despite error, continuing...`);
      }
      return;
    }
  } else if (!finalIsSelected && selectButton) {
    try {
      selectButton.click();
      console.log(`✓ Selected pool: ${poolId}`);
      // Update in-memory tracking
      selectedPoolIdsSet.add(normalizedPoolId);
      poolData.isSelected = true;

      // Notify sidepanel immediately
      notifySelectionChanged(poolId, true);

      await new Promise(resolve => setTimeout(resolve, 300));

      // Clear search field unless in batch mode
      if (!skipSearchClear) {
        const currentSearchInput = document.querySelector('.search-container input.input, .search-bar-outer input.input');
        if (currentSearchInput) {
          try {
            currentSearchInput.value = '';
            currentSearchInput.dispatchEvent(new Event('input', { bubbles: true }));
            currentSearchInput.dispatchEvent(new Event('change', { bubbles: true }));
            await new Promise(resolve => setTimeout(resolve, 300)); // Wait for page to unfilter
          } catch (searchErr) {
            console.warn('Error clearing search (non-critical):', searchErr);
          }
        }
      }

      // Update overlay immediately (don't block on errors)
      updateOverlay().catch(err => console.warn('updateOverlay error (non-critical):', err));
    } catch (e) {
      console.error(`Error during pool selection:`, e);
      console.error(`Error details: ${e.message}, stack: ${e.stack}`);
      // Don't show alert if the pool was actually selected
      const wasSelected = selectedPoolIdsSet.has(normalizedPoolId);
      if (!wasSelected) {
        alert(`Error selecting pool ${poolId}. Please try manually.`);
      } else {
        console.log(`Pool ${poolId} was selected despite error, continuing...`);
      }
      return;
    }
  } else {
    const action = isSelected ? 'CLEAR' : 'SELECT';
    console.warn(`Could not find ${action} button for pool: ${poolId}`);
    alert(`Could not find ${action} button for pool ${poolId}. The pool may already be in the desired state.`);
    return;
  }
}
