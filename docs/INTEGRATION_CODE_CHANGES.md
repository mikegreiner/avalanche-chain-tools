# Code Changes for vAMM/sAMM Integration

## Problem

vAMM/sAMM pools are extracted from DOM but don't have `current_votes` (weights) because:
- They're not in the CL pools API
- DOM extraction doesn't fetch weights
- Only API pools get weights via RPC

## Solution

Fetch weights for ALL DOM pools (including vAMM/sAMM) after DOM extraction.

## Code Change

In `extension/content-bundle.js`, update `extractPoolsHybrid`:

```javascript
async function extractPoolsHybrid(deepScan = false) {
  console.log(`Attempting hybrid extraction (RPC + API) with Deep Scan: ${deepScan}...`);
  let apiPools = [];
  
  try {
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
  
  // *** NEW: Fetch weights for DOM pools (including vAMM/sAMM) ***
  const domPoolAddresses = domPools
    .map(p => p.pool_id)
    .filter(addr => addr && addr.startsWith('0x'));
  
  if (domPoolAddresses.length > 0 && typeof PoolDataProvider !== 'undefined') {
    console.log(`Fetching weights for ${domPoolAddresses.length} DOM pools...`);
    try {
      const provider = new PoolDataProvider();
      const weightsMap = await provider.getPoolWeights(domPoolAddresses);
      
      // Add weights to DOM pools
      for (const pool of domPools) {
        if (pool.pool_id) {
          const weightBigInt = weightsMap.get(pool.pool_id.toLowerCase()) || 0n;
          pool.current_votes = Number(weightBigInt) / 1e18;
        }
      }
      console.log(`✓ Added weights to ${domPools.length} DOM pools`);
    } catch (error) {
      console.warn('Failed to fetch weights for DOM pools:', error);
    }
  }
  
  // Merge lists (prefer API data if available as it has precise weights)
  const poolMap = new Map();
  const domPoolsByName = new Map();
  
  // ... rest of existing merge logic ...
}
```

## Alternative: Update PoolDataProvider

Alternatively, update `pool-data-provider.js` to accept DOM-extracted pool addresses:

```javascript
// In extractPoolsHybrid, after DOM extraction:
const vammSammAddresses = domPools
  .filter(p => (p.pool_type === 'vAMM' || p.pool_type === 'sAMM') && p.pool_id)
  .map(p => p.pool_id);

if (vammSammAddresses.length > 0) {
  poolDataProvider.setVammSammAddresses(vammSammAddresses);
  const vammSammPools = await poolDataProvider.getPools();
  // Merge with DOM pools...
}
```

## Testing

After making changes:
1. Load extension on Blackhole DEX voting page
2. Check console for "Fetching weights for X DOM pools"
3. Verify vAMM/sAMM pools have `current_votes` > 0
4. Confirm pools appear in recommendations with proper scores

## Files to Modify

1. `extension/content-bundle.js` - Update `extractPoolsHybrid` function
2. (Optional) `extension/lib/pool-data-provider.js` - Already supports vAMM/sAMM
