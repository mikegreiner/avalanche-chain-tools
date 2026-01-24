# Fix for Recommendations Drop (10 → 4)

## Problem

After removing deep scan, recommendations dropped from 10 to 4, even though settings still request 10.

## Root Cause

**The Issue:**
1. RPC provider returns **138 pools** with `total_rewards: 0` (default)
2. Only **51 pools have rewards** in static `rewards_map.json`
3. DOM extraction now only gets **current page** (not all pages like deep scan did)
4. **Merge logic** only uses DOM rewards if pool exists in DOM
5. **Result**: Pools on other pages have 0 rewards and get sorted to bottom

**Before deep scan removal:**
- Deep scan navigated through all pages
- Extracted pools from DOM on each page
- All visible pools had rewards from DOM
- 10+ pools with rewards → 10 recommendations ✅

**After deep scan removal:**
- Only current page is scanned
- Only ~10-20 pools visible on current page have DOM rewards
- RPC gets all 138 pools but with 0 rewards
- Only pools with rewards get sorted to top
- Result: Only 4 pools with rewards → 4 recommendations ❌

## Solution Applied

### 1. Static Rewards Map as Fallback ✅

Created `static-rewards-loader.js` that:
- Loads rewards for 51 pools from `rewards_map.json`
- Applies as fallback when DOM doesn't have rewards
- Ensures pools not visible on current page still have rewards

### 2. Updated Merge Logic ✅

- Properly preserves DOM rewards when available
- Applies static rewards as fallback
- Logs how many pools got rewards from each source

### 3. Rebuilt Bundle ✅

- Added `static-rewards-loader.js` to build process
- Functions now available in `content-bundle.js`

## How It Works Now

```javascript
// In extractPoolsHybrid():
1. Get pools from RPC (138 pools, rewards = 0)
2. Get pools from DOM (current page only, has rewards)
3. Merge: Use DOM rewards if available
4. Apply static rewards as fallback for pools without DOM rewards
5. Result: 51 pools with rewards (from static map) + DOM pools
```

## Expected Result

**Before fix:**
- 4 recommendations (only current page pools with DOM rewards)

**After fix:**
- 10+ recommendations (51 pools with static rewards + DOM pools)

## Testing

To verify:
1. Check console: "Applied static rewards to X pools"
2. Check recommendations: Should have 10+ pools
3. Verify pools have rewards > 0

## Note

This is a **temporary fix** using static rewards. The ideal solution is:
- Real-time interception of multicall responses (already implemented)
- Extract rewards as page loads
- Update pools dynamically

But the static map ensures we have rewards even if interception hasn't happened yet.
