# Fix for Recommendations Drop (10 → 4)

## Problem

After removing deep scan, recommendations dropped from 10 to 4, even though settings still request 10.

## Root Cause

1. **RPC provider returns 138 pools** with `total_rewards: 0` (default)
2. **Only 51 pools have rewards** in static `rewards_map.json`
3. **DOM extraction now only gets current page** (not all pages like deep scan did)
4. **Merge logic** only uses DOM rewards if pool exists in DOM
5. **Result**: Pools on other pages have 0 rewards and get sorted to bottom

## The Issue

**Before deep scan removal:**
- Deep scan navigated through all pages
- Extracted pools from DOM on each page
- All visible pools had rewards from DOM
- 10+ pools with rewards → 10 recommendations

**After deep scan removal:**
- Only current page is scanned
- Only ~10-20 pools visible on current page have DOM rewards
- RPC gets all 138 pools but with 0 rewards
- Only pools with rewards get sorted to top
- Result: Only 4 pools with rewards → 4 recommendations

## Solution

### Option 1: Ensure DOM Rewards Are Used (Current Fix)

The merge logic should properly use DOM rewards for all pools visible on the current page. This is already implemented, but we need to verify it's working.

### Option 2: Load Static Rewards Map (Quick Fix)

Load `rewards_map.json` as a fallback for pools without DOM rewards:

```javascript
// In pool-data-provider.js or extractPoolsHybrid
// Load static rewards map as fallback
const staticRewards = await loadStaticRewardsMap();
for (const pool of pools) {
  if (pool.total_rewards === 0) {
    const reward = staticRewards[pool.pool_id.toLowerCase()];
    if (reward) {
      pool.total_rewards = reward;
    }
  }
}
```

### Option 3: Ensure Real-Time Interception Works (Best Long-term)

Make sure `interceptMulticallResponses` is actually being called and extracting rewards in real-time as the page loads.

## Immediate Fix Applied

1. ✅ Fixed merge logic to properly preserve DOM rewards
2. ✅ Added logging to see how many pools have rewards
3. ⏳ Need to verify DOM extraction is getting rewards for current page pools

## Testing

To verify the fix works:

1. Check console logs:
   - "DOM extraction: X pools" - should show pools from current page
   - "Final merged pool count: X" - should show all pools
   - Check how many pools have `total_rewards > 0`

2. Check recommendations:
   - Should have 10 recommendations if 10+ pools have rewards
   - If only 4 pools have rewards, that's the actual data

## Next Steps

1. **Verify DOM extraction** is getting rewards for current page pools
2. **Load static rewards map** as fallback for pools without DOM rewards
3. **Set up real-time interception** to extract rewards from multicall responses
