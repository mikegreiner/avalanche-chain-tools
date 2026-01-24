# Deep Scan Setting Analysis

## What Deep Scan Does

**Current Implementation:**
1. When enabled: Navigates through all pagination pages
2. Scrapes DOM on each page to find pools
3. Returns to page 1 when done
4. When disabled: Only scans current page

**Purpose (Original):**
- Find pools not visible on first page
- Get complete pool list when API was incomplete
- Fallback when RPC wasn't available

## Current State with RPC

### What We Have Now

1. **RPC Pool Discovery** ✅
   - Found **138 pools** via multicall/voter contract
   - Complete list of all active pools
   - No pagination needed

2. **RPC Data Fetching** ✅
   - Weights via `weights(address)`
   - Tokens via `token0()` / `token1()`
   - Fees via `fee()` (CL pools)
   - Liquidity via `liquidity()` / `totalSupply()`

3. **Rewards Extraction** ✅
   - From multicall responses
   - 51 pools with extracted rewards
   - No DOM needed

### What Deep Scan Was For

**Before RPC:**
- API only had CL pools (58 pools)
- Needed to scan pages to find vAMM/sAMM pools
- DOM was primary data source

**Now with RPC:**
- We have all 138 pools via RPC
- No need to scan pages
- DOM is only for rewards/VAPR (which we extract from multicall)

## Recommendation

### ❌ Remove Deep Scan Setting

**Reasons:**
1. **RPC covers all pools** - 138 pools found, no pagination needed
2. **RPC is faster** - No page navigation, instant data
3. **RPC is more reliable** - Contracts don't change, HTML does
4. **Adds complexity** - Extra setting that's no longer needed
5. **DOM extraction still works** - But only for current page (which is fine)

### Alternative: Keep DOM Extraction (No Deep Scan)

**What to keep:**
- DOM extraction for current page (as fallback)
- Hybrid approach: RPC primary, DOM fallback

**What to remove:**
- Deep scan setting
- Pagination navigation logic
- Multi-page scanning

## Impact of Removal

### What Would Change

1. **Settings UI** - Remove "Deep Scan" checkbox
2. **Code** - Remove `deepScan` parameter from functions
3. **Logic** - Always use single-page DOM extraction (if needed)

### What Would Stay

1. **DOM extraction** - Still works for current page
2. **Hybrid approach** - RPC + DOM (current page only)
3. **Fallback** - DOM as backup if RPC fails

## Migration Path

### Option 1: Remove Completely (Recommended)

```javascript
// Remove deepScan parameter
async function extractPoolsFromDOM() {  // No parameter
  // Always single-page extraction
  // Remove pagination logic
}

// Remove from settings
// Remove from UI
```

### Option 2: Keep as Hidden Fallback

```javascript
// Keep code but remove UI setting
// Only use if RPC completely fails
// Not user-configurable
```

## Conclusion

**Recommendation: Remove Deep Scan Setting**

- ✅ RPC provides all pools (138 found)
- ✅ No pagination needed
- ✅ Faster and more reliable
- ✅ Simplifies codebase
- ✅ Reduces user confusion

**Keep:**
- Single-page DOM extraction (as fallback)
- Hybrid RPC + DOM approach

**Remove:**
- Deep scan setting
- Pagination navigation
- Multi-page scanning logic
