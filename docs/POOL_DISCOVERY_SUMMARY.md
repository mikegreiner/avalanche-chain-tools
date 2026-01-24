# Pool Discovery Summary

## What We've Accomplished

### ✅ Successfully Identified

1. **138 Total Pools** found via multicall RPC extraction
2. **58 CL Pools** - Confirmed via CL pools API
3. **1 vAMM Pool** - Confirmed (vAMM-GCROC/WAVAX)
4. **1 sAMM Pool** - Confirmed (sAMM-CROC/WAVAX)
5. **78 Unknown Pools** - All have V2-like interfaces (likely vAMM/sAMM)

### Key Findings

#### Pool Discovery Method
- **Voter contract does NOT have `allPoolsLength()` or `allPools(uint256)` methods**
- **BUT `weights(address)` works!** - This is how we identify pools
- Pools are discovered by:
  1. Extracting addresses from multicall RPC requests
  2. Checking which addresses have weights in voter contract
  3. Those with weights = registered pools

#### Pool Type Identification

**CL Pools:**
- Have HTTP API endpoint: `https://resources.blackhole.xyz/cl-pools-list/cl-pools.json`
- Have CL interface (slot0, tickSpacing functions)
- Fees: 100, 500, 3000, 10000 (basis points)

**vAMM/sAMM Pools:**
- **NO HTTP API endpoints found** (vamm-pools.json and samm-pools.json return 403)
- Have V2-like interfaces (getReserves, token0, token1)
- Do NOT have CL interface (no slot0)
- Likely fetched via RPC calls to contracts

#### The 78 Unknown Pools

All 78 unknown pools:
- ✅ Have weights in voter contract (confirmed pools)
- ✅ Have token0/token1 (can query tokens)
- ✅ Have V2-like interface (getReserves works)
- ❌ Do NOT have CL interface (not CL pools)
- ❌ Not in CL pools API

**Conclusion:** These 78 pools are almost certainly **vAMM and sAMM pools**.

### Evidence

1. **MHTML shows 29 vAMM and 3 sAMM pool names** in the DOM
2. **Unknown pools have V2 interfaces** (typical for vAMM/sAMM, not CL)
3. **Unknown pools are not in CL API** (confirms they're not CL)
4. **All have weights** (they're registered voting pools)

## Next Steps

### Immediate Actions

1. **Query Pool Metadata for All Unknown Pools**
   - Get token0/token1 for all 78 unknown pools
   - This will allow us to identify them by token pairs
   - Can cross-reference with MHTML pool names

2. **Create vAMM/sAMM Pool Data Provider**
   - Similar to CL pools provider
   - Query pools via RPC (weights + metadata)
   - No HTTP API needed - direct contract queries

3. **Update Pool Data Provider**
   - Integrate vAMM/sAMM pool fetching
   - Combine with CL pools from API
   - Use weights from voter contract for all types

### How to Identify vAMM vs sAMM

Since we can't easily distinguish vAMM from sAMM by contract interface alone:

1. **Cross-reference with DOM extraction** - Match token pairs to names
2. **Check factory contracts** - Query which factory created each pool
3. **Check pool creation events** - Look at blockchain events
4. **Use known pools as reference** - Pattern match based on known examples

### Recommended Implementation

```python
# Pseudo-code for vAMM/sAMM pool provider
class VammSammPoolProvider:
    def __init__(self):
        self.voter = "0xe30d0c8532721551a51a9fec7fb233759964d9e3"
        self.known_pools = self.load_identified_pools()  # From our discovery
    
    def get_pools(self):
        # Get all pools with weights
        pools = []
        for pool_addr in self.known_pools:
            weight = self.get_weight(pool_addr)
            if weight > 0:
                metadata = self.get_metadata(pool_addr)  # tokens, etc.
                pool_type = self.classify_type(pool_addr, metadata)
                pools.append({
                    'address': pool_addr,
                    'type': pool_type,
                    'weight': weight,
                    'token0': metadata['token0'],
                    'token1': metadata['token1']
                })
        return pools
```

## Files Created

1. `scripts/extract_contracts_from_multicalls.py` - Extracts addresses from RPC logs
2. `scripts/identify_pools_from_addresses.py` - Identifies pools via weights
3. `scripts/classify_pool_types.py` - Classifies pools by type
4. `scripts/query_pool_metadata.py` - Gets pool metadata (tokens, fees)
5. `scripts/cross_reference_pools.py` - Cross-references with DOM data
6. `extracted_contracts.json` - All extracted contract addresses
7. `identified_pools.json` - Pools with weights
8. `classified_pools.json` - Classified pools by type

## Conclusion

**We have successfully discovered the mechanism for vAMM/sAMM pools:**

1. ✅ They are NOT fetched via HTTP API (no endpoints found)
2. ✅ They ARE fetched via RPC calls (multicall to voter contract)
3. ✅ We can identify them by checking weights in voter contract
4. ✅ We can query their metadata (tokens) directly from contracts
5. ✅ We found 78+ likely vAMM/sAMM pools (the "unknown" ones)

**The solution:** Query pools via RPC using the voter contract's `weights(address)` method, then fetch metadata from each pool contract directly.
