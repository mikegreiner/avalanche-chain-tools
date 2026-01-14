// Pool class matching the content script implementation
export class Pool {
  constructor(data) {
    this.name = data.name || 'Unknown';
    this.total_rewards = data.total_rewards || 0;
    this.vapr = data.vapr || 0;
    this.current_votes = data.current_votes ?? null;
    this.pool_id = data.pool_id || null;
    this.pool_type = data.pool_type || null;
    this.fee_percentage = data.fee_percentage || null;
  }

  profitabilityScore() {
    let rewardsPerVote = null;
    if (this.current_votes !== null && this.current_votes > 0) {
      rewardsPerVote = this.total_rewards / this.current_votes;
    }

    let rewardsPerVoteNormalized;
    if (rewardsPerVote !== null) {
      if (rewardsPerVote > 0) {
        rewardsPerVoteNormalized = Math.min(100, Math.max(0, Math.pow(rewardsPerVote / 0.5, 0.5) * 100));
      } else {
        rewardsPerVoteNormalized = 0;
      }
    } else {
      rewardsPerVoteNormalized = Math.min(this.total_rewards / 10000.0, 1.0) * 100;
    }

    const rewardsTotalNormalized = Math.min(this.total_rewards / 10000.0, 1.0) * 100;
    const vaprNormalized = Math.min(this.vapr / 100.0, 10.0) * 10;
    const score = (rewardsPerVoteNormalized * 0.6) + (rewardsTotalNormalized * 0.25) + (vaprNormalized * 0.15);
    return score;
  }

  estimateUserRewards(userVotingPower) {
    if (this.current_votes === null || this.current_votes === 0) {
      return this.total_rewards;
    }
    const newTotalVotes = this.current_votes + userVotingPower;
    const userShare = userVotingPower / newTotalVotes;
    return userShare * this.total_rewards;
  }

  calculateShare(userVotingPower) {
    if (!userVotingPower || userVotingPower <= 0) return 0;
    const currentVotes = this.current_votes || 0;
    const newTotalVotes = currentVotes + userVotingPower;
    return (userVotingPower / newTotalVotes) * 100;
  }

  stabilityScore() {
    if (this.total_rewards === null || this.total_rewards <= 0) {
      return 0.0;
    }
    if (this.current_votes === null || this.current_votes <= 0) {
      return 0.0;
    }
    const voteDensity = this.current_votes / this.total_rewards;
    let normalizedDensity;
    if (voteDensity > 0) {
      normalizedDensity = Math.min(100, Math.max(0, Math.pow(voteDensity / 500.0, 0.5) * 100));
    } else {
      normalizedDensity = 0;
    }
    let rewardSizeFactor;
    if (this.total_rewards >= 50000) {
      rewardSizeFactor = 20;
    } else if (this.total_rewards >= 20000) {
      rewardSizeFactor = 10;
    } else {
      rewardSizeFactor = 0;
    }
    const stability = (normalizedDensity * 0.8) + (rewardSizeFactor * 0.2);
    return Math.min(100, Math.max(0, stability));
  }

  stabilityAdjustedScore(userVotingPower = null) {
    const stability = this.stabilityScore();
    if (userVotingPower !== null && userVotingPower > 0) {
      const estimatedReward = this.estimateUserRewards(userVotingPower);
      let normalizedReward;
      if (estimatedReward > 0) {
        normalizedReward = Math.min(100, Math.max(0, Math.pow(estimatedReward / 500.0, 0.5) * 100));
      } else {
        normalizedReward = 0;
      }
      return (normalizedReward * 0.7) + (stability * 0.3);
    } else {
      const profitability = this.profitabilityScore();
      return (profitability * 0.7) + (stability * 0.3);
    }
  }

  rewardsPerVote() {
    if (this.current_votes !== null && this.current_votes > 0) {
      return this.total_rewards / this.current_votes;
    }
    return null;
  }
}

function fnmatch(pattern, string) {
  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  const regex = new RegExp(`^${regexPattern}$`, 'i');
  return regex.test(string);
}

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

  if (hideVamm) {
    filteredPools = filteredPools.filter(p => p.pool_type !== 'vAMM');
  }

  if (minRewards !== null) {
    filteredPools = filteredPools.filter(p => p.total_rewards >= minRewards);
  }

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

  if (maxPoolPercentage !== null && userVotingPower !== null) {
    filteredPools = filteredPools.filter(pool => {
      if (pool.current_votes === null || pool.current_votes === 0) {
        return maxPoolPercentage >= 100.0;
      }
      const newTotalVotes = pool.current_votes + userVotingPower;
      const userPercentage = (userVotingPower / newTotalVotes) * 100;
      return userPercentage <= maxPoolPercentage;
    });
  }

  let sortMethod;
  if (sortBy === 'auto') {
    sortMethod = userVotingPower !== null ? 'reward' : 'profitability';
  } else {
    sortMethod = sortBy;
  }

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
