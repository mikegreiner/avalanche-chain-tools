# Deep Scan Setting - Recommendation

## What Deep Scan Does

**Current Behavior:**
- When enabled: Navigates through all pagination pages to find pools
- When disabled: Only scans current page

**Original Purpose:**
- Find pools not visible on first page
- Complete pool list when API was incomplete
- Fallback when RPC wasn't available

## Current State

### RPC Discovery Found All Pools ✅

- **138 pools** discovered via RPC (multicall/voter contract)
- **58 CL pools** + **1 vAMM** + **1 sAMM** + **78 Unknown** (likely vAMM/sAMM)
- **No pagination needed** - RPC gets all pools at once

### What We Still Use DOM For

1. **Current page extraction** - As fallback/merge with RPC data
2. **Rewards/VAPR** - But we extract these from multicall responses now!

## Recommendation: **Remove Deep Scan Setting** ❌

### Reasons

1. **RPC covers all pools** - 138 pools found, complete list
2. **RPC is faster** - No page navigation needed
3. **RPC is more reliable** - Contracts don't change, HTML does
4. **Adds unnecessary complexity** - Extra setting that's no longer needed
5. **DOM extraction still works** - But only for current page (which is fine as fallback)

### What to Keep

- ✅ Single-page DOM extraction (as fallback)
- ✅ Hybrid approach: RPC primary, DOM fallback
- ✅ Merge logic (combine RPC + DOM data)

### What to Remove

- ❌ Deep scan setting (checkbox)
- ❌ Pagination navigation logic
- ❌ Multi-page scanning code

## Impact

**Before:**
- User could enable deep scan to find pools on all pages
- Slow (navigates through pages)
- Needed when API was incomplete

**After:**
- RPC gets all pools instantly
- DOM extraction only for current page (as fallback)
- Faster and simpler

## Code Changes Needed

1. Remove `deepScan` parameter from functions
2. Remove pagination navigation logic
3. Remove setting from UI
4. Simplify `extractPoolsFromDOM()` to always be single-page
5. Update `extractPoolsHybrid()` to not pass `deepScan`

## Conclusion

**Recommendation: Remove Deep Scan Setting**

The RPC-based approach found all 138 pools without needing pagination. Deep scan is now redundant and adds unnecessary complexity.
