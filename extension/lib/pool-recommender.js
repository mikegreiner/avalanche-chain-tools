/**
 * Pool recommender logic
 * Ported from blackhole_pool_recommender.py recommend_pools method
 */

import Pool from './pool.js';

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
export function recommendPools(pools, options = {}) {
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

export { fnmatch };