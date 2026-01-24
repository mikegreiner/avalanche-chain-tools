# Pool Stability Analysis - Key Findings

## Analysis Summary

Analyzed pool tracking data from two epochs (2025-11-05 and 2025-11-12) to identify patterns in pool stability and profitability changes over time.

## Key Findings

### 1. Hypothesis Test: Large Rewards + Large Votes = More Stable?

**Result: HYPOTHESIS NOT SUPPORTED**

- **Large Rewards + Large Votes**: Average RPV Stability (CV) = 22-30% (LESS stable)
- **Small Rewards + Small Votes**: Average RPV Stability (CV) = 12-18% (MORE stable)

**Insight**: Smaller pools with fewer votes are actually MORE stable in terms of rewards-per-vote. However, this may be because they're less attractive and receive fewer late votes.

### 2. Vote Density is a Better Predictor of Stability

**Finding**: High vote density (votes per dollar of rewards) correlates with stability:

- **High Vote Density** (above median): 10-18% RPV stability
- **Low Vote Density** (below median): 25-28% RPV stability

**Insight**: Pools that already have many votes relative to their rewards are more stable. This suggests they're "saturated" and less likely to see dramatic changes.

### 3. Massive Reward Gains Are Possible

Some pools showed dramatic improvements:
- **CL200-BTC.b/BLACK**: +177% estimated reward gain
- **vAMM-WAVAX/MOANI**: +216% estimated reward gain
- **CL200-USDC/BLACK**: +140% estimated reward gain

**Insight**: Smaller, less popular pools can see massive gains as they receive late votes, but this comes with volatility.

### 4. Most Stable Pools

Consistently stable pools across both epochs:
- **vAMM-SUPER/USDC**: 0.01-0.32% RPV stability
- **CL200-SUPER/USDC**: 1-4% RPV stability
- **CL200-WETH.e/USDt**: 1.47% RPV stability

**Characteristics**:
- Medium-sized rewards ($5K-$15K)
- Medium vote counts (5M-14M)
- Moderate vote density

### 5. Vote Velocity Patterns

- **Median vote velocity**: 2,010 - 716,760 votes/hour
- **Average vote velocity**: 143,827 - 1,514,914 votes/hour
- **Range**: -808,676 to 8,859,311 votes/hour

**Insight**: Vote velocity varies wildly. Some pools lose votes (negative velocity), while others gain votes rapidly. The large difference between median and average suggests outliers (some pools get massive vote influxes).

## Recommendations for Stability-Adjusted Scoring

### 1. Use Vote Density as Primary Stability Factor

Instead of just "large rewards + large votes", use:
- **Vote Density** = `current_votes / total_rewards`
- Higher density = more stable (less room for change)
- Lower density = more volatile (more room for growth/decline)

### 2. Create a Stability Score Component

```
Stability Score = f(
    vote_density,           # Primary factor
    reward_size_category,   # Secondary factor
    vote_velocity,          # Momentum indicator
    time_to_epoch_close     # Closer = stability matters more
)
```

### 3. Consider Two Scoring Modes

**Conservative Mode** (prioritize stability):
- Higher weight on vote density
- Prefer pools with moderate-high vote density
- Lower weight on current profitability

**Aggressive Mode** (prioritize upside):
- Lower weight on vote density
- Prefer pools with low vote density (more room to grow)
- Higher weight on current profitability

### 4. Time-to-Epoch Factor

As epoch close approaches:
- Increase weight on stability factors
- Decrease weight on upside potential
- Pools that are stable now are more likely to remain stable

### 5. Pool Characteristics That Predict Stability

**Most Stable Pools Share**:
- Medium rewards ($5K-$20K range)
- Medium vote counts (5M-15M range)
- Moderate vote density (not too high, not too low)
- Consistent pool types (CL200-SUPER/USDC appears in both epochs)

**Least Stable Pools**:
- Very large rewards + very large votes (attractive but volatile)
- Very small rewards + very small votes (can see massive swings)

## Proposed Algorithm

### Stability-Adjusted Profitability Score

```
Base Score = Current Profitability Score (existing calculation)

Stability Factor = (
    0.4 * vote_density_normalized +
    0.3 * reward_stability_score +
    0.2 * vote_velocity_score +
    0.1 * time_to_epoch_factor
)

Final Score = Base Score * (1 + stability_weight * Stability Factor)
```

Where:
- `vote_density_normalized`: Normalized vote density (0-1 scale)
- `reward_stability_score`: Based on historical reward volatility (if available)
- `vote_velocity_score`: Inverse of vote velocity (slower = more stable)
- `time_to_epoch_factor`: Increases as epoch close approaches
- `stability_weight`: Configurable (0.0-1.0) to adjust how much stability matters

## Next Steps

1. **Implement vote density calculation** in pool recommender
2. **Add stability metrics** to pool data structure
3. **Create stability-adjusted scoring** algorithm
4. **Add configuration option** for stability weight
5. **Test with real data** to validate improvements

## Data Quality Notes

- Analysis based on 18-20 pools per epoch
- Some pools have very few snapshots (limited time span)
- Vote velocity has extreme outliers (some pools gain/lose votes rapidly)
- More data over longer time periods would improve accuracy
