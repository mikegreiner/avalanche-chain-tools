# Pool Discovery - Complete Summary

## 🎯 Mission Accomplished!

We have successfully discovered how Blackhole DEX fetches pool data for **all pool types**, including vAMM and sAMM pools.

## Key Discoveries

### ✅ How Pool Data is Fetched

1. **CL Pools**: HTTP API endpoint
   - `https://resources.blackhole.xyz/cl-pools-list/cl-pools.json`
   - ✅ Working and accessible

2. **vAMM/sAMM Pools**: RPC calls via voter contract
   - ❌ No HTTP API endpoints (vamm-pools.json and samm-pools.json return 403)
   - ✅ Fetched via RPC using `weights(address)` method on voter contract
   - ✅ Pools are identified by checking which addresses have weights > 0

### ✅ What We Found

- **138 total pools** discovered
- **58 CL pools** (confirmed via API)
- **1 confirmed vAMM pool** (vAMM-GCROC/WAVAX)
- **1 confirmed sAMM pool** (sAMM-CROC/WAVAX)
- **78 unknown pools** with V2 interfaces (likely vAMM/sAMM)

### ✅ Discovery Method

1. **Extracted contract addresses** from multicall RPC requests
2. **Checked weights** in voter contract to identify pools
3. **Queried pool metadata** (token0, token1) from contracts
4. **Classified pool types** based on interfaces and known pools

## Technical Details

### Voter Contract Methods

- ✅ `weights(address)` - Returns pool weight (works!)
- ✅ `totalWeight()` - Returns total weight (works!)
- ❌ `allPoolsLength()` - Does not exist
- ❌ `allPools(uint256)` - Does not exist

**Key Insight:** The voter contract doesn't list pools, but we can identify pools by checking which addresses have weights.

### Pool Identification Process

```
1. Extract addresses from multicall RPC logs
   ↓
2. Check weights(address) for each address
   ↓
3. Addresses with weight > 0 = registered pools
   ↓
4. Query pool contracts for metadata (tokens, fees)
   ↓
5. Classify by type (CL vs vAMM vs sAMM)
```

### Pool Type Characteristics

**CL Pools:**
- Have `slot0()` function (Uniswap V3 / Algebra style)
- Have `tickSpacing()` function
- Fees: 100, 500, 3000, 10000 basis points
- Listed in CL pools API

**vAMM/sAMM Pools:**
- Have `getReserves()` function (V2 style)
- Have `token0()` and `token1()` functions
- Do NOT have `slot0()` (not CL)
- NOT listed in CL pools API
- All 78 "unknown" pools have these characteristics

## Files Created

### Discovery Scripts
1. `scripts/extract_contracts_from_multicalls.py` - Extracts addresses from RPC logs
2. `scripts/identify_pools_from_addresses.py` - Identifies pools via weights
3. `scripts/classify_pool_types.py` - Classifies pools by type
4. `scripts/query_pool_metadata.py` - Gets pool metadata
5. `scripts/cross_reference_pools.py` - Cross-references with DOM

### Data Files
1. `extracted_contracts.json` - 1,123 extracted addresses
2. `identified_pools.json` - 138 pools with weights
3. `classified_pools.json` - Classified by type
4. `pool_metadata_all.json` - Pool metadata (tokens, etc.)
5. `vamm_samm_pools.json` - vAMM/sAMM pool list

## Next Steps for Implementation

### 1. Update Pool Data Provider

The `pool-data-provider.js` has been enhanced to support vAMM/sAMM pools. To complete:

1. **Load discovered pools** from `vamm_samm_pools.json` or similar
2. **Query weights** for all pools (CL + vAMM + sAMM)
3. **Query metadata** (tokens) for vAMM/sAMM pools via RPC
4. **Combine** with CL pools from API

### 2. Alternative: Dynamic Discovery

Instead of a static list, dynamically discover pools:
1. Monitor multicall RPC requests
2. Extract addresses
3. Check weights
4. Query metadata
5. Cache results

### 3. Pool Type Identification

To distinguish vAMM from sAMM:
- Cross-reference with DOM extraction (match token pairs to names)
- Check factory contracts
- Use known pools as reference

## Conclusion

**We have successfully deconstructed how Blackhole DEX uses blockchain and API endpoints:**

1. ✅ **CL pools**: HTTP API endpoint
2. ✅ **vAMM/sAMM pools**: RPC calls to voter contract + pool contracts
3. ✅ **Discovery method**: Extract from multicalls → check weights → query metadata
4. ✅ **138 pools found** including vAMM and sAMM

The enhanced API Discovery tool will continue to capture new endpoints and patterns as you use the site, but we now have a working method to fetch all pool types!
