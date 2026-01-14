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
export default Pool;
