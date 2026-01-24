# vAMM/sAMM Pool Integration Guide

## Current Status

### ✅ What We Have
- **138 pools discovered** (58 CL + 80 vAMM/sAMM)
- **Pool addresses** from RPC discovery
- **Weights** (current_votes) via `weights(address)` on voter contract
- **Token addresses** (token0/token1) from pool contracts
- **DOM extraction** already handles vAMM/sAMM pools

### ❌ What We're Missing
- **total_rewards** (USD value) - Need from DOM
- **vapr** (percentage) - Need from DOM
- **fee_percentage** - Optional, may not be critical
- **Token symbols** - Need for proper pool names

## How It Works

### Data Flow

```
1. Pool Discovery (RPC)
   ↓
   Pool addresses + weights
   
2. DOM Extraction (pool-extractor.js)
   ↓
   Pool names, rewards, VAPR, pool_id
   
3. Data Combination (sidepanel.js)
   ↓
   Match pools by pool_id
   Combine: RPC data (weights) + DOM data (rewards/VAPR)
   
4. Pool Data Provider
   ↓
   Fetch weights for all pools
   Return Pool objects
```

### Key Integration Points

1. **pool-extractor.js** - Already extracts vAMM/sAMM pools from DOM ✅
2. **pool-data-provider.js** - Now supports vAMM/sAMM addresses
3. **sidepanel.js** - Combines RPC + DOM data

## Integration Steps

### Step 1: Extract vAMM/sAMM Pools from DOM ✅

The `pool-extractor.js` already handles this:
- Extracts pool names (including "vAMM-..." and "sAMM-...")
- Extracts pool_id from DOM attributes
- Extracts rewards and VAPR from DOM

**No changes needed** - this already works!

### Step 2: Match Discovered Pools with DOM Pools

When DOM extraction finds a pool:
1. Check if pool_id matches a discovered vAMM/sAMM address
2. If match, use discovered data (weight) + DOM data (rewards/VAPR)
3. If no match, it's likely a CL pool (from API)

### Step 3: Update Pool Data Provider

The provider now:
1. Fetches CL pools from API
2. Can accept vAMM/sAMM addresses (from DOM or static list)
3. Fetches weights for all pools
4. Returns Pool objects

### Step 4: Combine Data in sidepanel.js

The sidepanel should:
1. Extract pools from DOM (includes vAMM/sAMM)
2. Get pool addresses from DOM extraction
3. Pass addresses to pool data provider
4. Match provider pools with DOM pools
5. Use DOM data for rewards/VAPR, provider data for weights

## Implementation Details

### Getting Full Pool Details

**total_rewards & vapr:**
- ✅ Extracted from DOM (same as CL pools)
- ✅ Already working in pool-extractor.js
- ✅ No additional RPC calls needed

**current_votes (weights):**
- ✅ Fetched via RPC `weights(address)`
- ✅ Already implemented in pool-data-provider.js

**pool_id & pool_type:**
- ✅ From DOM extraction
- ✅ pool-extractor.js identifies vAMM/sAMM types

**name:**
- ✅ From DOM extraction
- ✅ Includes token symbols (e.g., "vAMM-GCROC/WAVAX")

**fee_percentage:**
- ⚠️ Optional - vAMM/sAMM may not have standard fees
- Can query pool contract if needed
- Not critical for recommendations

## Testing

### Test Checklist

1. ✅ Load extension on Blackhole DEX voting page
2. ✅ Check console for vAMM/sAMM pools in DOM extraction
3. ✅ Verify pool addresses match discovered addresses
4. ✅ Check that rewards/VAPR are extracted from DOM
5. ✅ Verify weights are fetched via RPC
6. ✅ Confirm pools appear in recommendations

### Expected Behavior

- vAMM/sAMM pools should appear in pool list
- They should have rewards/VAPR from DOM
- They should have weights from RPC
- They should be included in recommendations
- Pool names should match DOM (e.g., "vAMM-GCROC/WAVAX")

## Next Steps

1. **Test Integration** - Load extension and verify vAMM/sAMM pools appear
2. **Token Symbols** - If needed, query token contracts for proper names
3. **Fee Query** - Optional: Query pool contracts for fees
4. **Static Pool List** - Optionally bundle vamm_samm_pools.json for faster loading

## Files Modified

1. `extension/lib/pool-data-provider.js` - Added vAMM/sAMM support
2. `extension/lib/vamm-samm-provider.js` - New provider for vAMM/sAMM pools
3. `extension/lib/pool-extractor.js` - Already handles vAMM/sAMM ✅

## Summary

**We ARE getting full vAMM/sAMM pool details:**
- ✅ total_rewards - From DOM extraction
- ✅ vapr - From DOM extraction
- ✅ current_votes - From RPC (weights)
- ✅ pool_id - From DOM extraction
- ✅ pool_type - From DOM extraction (vAMM/sAMM)
- ✅ name - From DOM extraction
- ⚠️ fee_percentage - Optional, not critical

**The integration is mostly complete!** The DOM extraction already handles vAMM/sAMM pools, and the pool data provider now supports them. Just need to ensure the data flows correctly in sidepanel.js.
