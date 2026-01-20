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

// --- From pool-data-provider.js ---

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

class PoolDataProvider {
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
 * @param {boolean} deepScan - If true, navigate through all pages. If false, only scan current page.
 */
async function extractPoolsFromDOM(deepScan = false) {
  const pools = [];
  const foundPoolIds = new Set(); // Track to avoid duplicates
  
  // Helper to extract from current page
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

  // Always extract current page
  const poolsOnCurrentPage = extractPoolsFromCurrentPage();
  console.log(`Found ${poolsOnCurrentPage} pool elements on current page`);

  // If not deep scan, return immediately
  if (!deepScan) {
    return pools;
  }

  console.log('Deep Scan enabled: checking for pagination...');
  
  // Pagination Logic
  const paginationContainer = document.querySelector('.pagination');
  if (!paginationContainer) {
    console.log('No pagination found, scan complete.');
    return pools;
  }

  // Helper to wait for page load
  async function waitForPageLoad(previousCount, maxWait = 5000) {
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      await new Promise(r => setTimeout(r, 200));
      const currentCount = document.querySelectorAll('div.liquidity-pool-cell').length;
      // Simple check: if we have pools, we assume page loaded (could be improved)
      if (currentCount > 0) return true;
    }
    return false;
  }

  // Iterate pages
  let pagesChecked = 1;
  const maxPages = 20; // Safety limit
  
  while (pagesChecked < maxPages) {
    const pagination = document.querySelector('.pagination');
    if (!pagination) break;

    const rightExtreme = pagination.querySelector('.item.extreme.right');
    if (!rightExtreme) break;

    const clickable = rightExtreme.closest('.item') || rightExtreme.parentElement || rightExtreme;
    if (clickable.classList.contains('disabled') || clickable.hasAttribute('disabled')) {
      console.log('Next button disabled, reached last page.');
      break;
    }

    console.log(`Navigating to page ${pagesChecked + 1}...`);
    clickable.click();
    
    // Wait for load
    await waitForPageLoad(0);
    
    // Extract
    const count = extractPoolsFromCurrentPage();
    console.log(`Extracted ${count} pools from page ${pagesChecked + 1}`);
    pagesChecked++;
    
    // Small delay
    await new Promise(r => setTimeout(r, 500));
  }

  // Restore page 1? Probably good UX but maybe not strictly required if we just want data.
  // Let's try to go back to page 1 to leave the user in a consistent state.
  console.log('Deep Scan complete. Returning to page 1...');
  const firstPage = document.querySelector('.pagination .item:not(.extreme)');
  if (firstPage && firstPage.textContent.trim() === '1') {
    firstPage.click();
  }

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
async function extractPoolsHybrid(deepScan = false) {
  console.log(`Attempting hybrid extraction (RPC + API) with Deep Scan: ${deepScan}...`);
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
  const domPools = await extractPoolsFromDOM(deepScan);
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

function injectApiDiscovery() {
  try {
    console.log('Blackhole DEX Tools: Injecting API discovery...');
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('lib/api-discovery.js');
    (document.head || document.documentElement).appendChild(script);
    script.onload = () => script.remove();
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
        pools = await extractPoolsHybrid(settings.deepScan);
      } else {
        pools = await extractPoolsFromDOM(settings.deepScan);
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
