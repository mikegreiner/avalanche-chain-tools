# RPC Rewards Status - Current State

## The Challenge

**Goal**: Get total pool rewards via RPC/API without DOM extraction

**Current Status**: ❌ **Not fully achievable via direct RPC calls**

## What We've Tried

### 1. Direct Contract Calls ❌
- `getGauge(address)` on voter contract → Returns empty/zero
- `claimable()`, `rewardRate()`, `totalRewards()` on pools → Not found
- `tokens_per_week(uint256)` → Function exists but doesn't work on tested contracts
- Direct calls to gauge contracts → No gauge addresses found

### 2. Multicall Response Pattern Matching ✅ (Partial)
- **Works**: Extract large values near pool addresses in multicall hex responses
- **Limitation**: Requires intercepting the site's multicall responses
- **Result**: Found rewards for 51 pools via pattern matching
- **Issue**: Not real-time, requires the site to make multicalls first

### 3. Static Rewards Map ✅ (Current Solution)
- **Works**: Provides rewards for 51 pools as fallback
- **Source**: Extracted from multicall responses via pattern matching
- **Limitation**: Not real-time, may become stale

## Why Direct RPC Doesn't Work

1. **Gauge addresses not accessible**: `getGauge(address)` returns empty
2. **Reward functions not on pools**: Pools don't have `claimable()`, `rewardRate()`, etc.
3. **Rewards in complex structures**: Values are in multicall responses but need proper decoding
4. **Site uses internal logic**: The site may calculate rewards from multiple sources (bribes, emissions, etc.)

## Current Best Approach

### Hybrid: Intercept + Pattern Match + Static Fallback

1. **Intercept multicall responses** (real-time)
   - Hook into `window.fetch` and `XMLHttpRequest`
   - Extract hex responses
   - Pattern match for pool addresses + large values

2. **Static rewards map** (fallback)
   - Use when interception hasn't captured data yet
   - Provides rewards for 51 known pools

3. **DOM extraction** (current page only)
   - Get real-time rewards for visible pools
   - Most accurate but limited to current page

## What Would Make Full RPC Possible

1. **Decode multicall responses properly**
   - Full ABI decoding of `Multicall3.aggregate()` return data
   - Match function calls to return values
   - Currently blocked by complex nested structure

2. **Find the actual reward source**
   - Identify which contract stores rewards
   - Could be a separate bribe contract
   - Could be calculated from multiple sources

3. **Reverse engineer site's logic**
   - The site successfully gets rewards
   - Need to understand their exact sequence of calls
   - May involve multiple contracts or off-chain data

## Recommendation

**For now**: Continue with hybrid approach
- Intercept multicall responses (real-time when available)
- Use static rewards map (fallback)
- Use DOM extraction (current page, most accurate)

**Future work**: 
- Improve multicall response decoding
- Investigate bribe contracts
- Try to reverse engineer site's exact reward fetching logic
