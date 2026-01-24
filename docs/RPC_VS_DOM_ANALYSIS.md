# RPC vs DOM Analysis - Can We Get All Data from RPC?

## Your Question

> "Can we really not get all needed pool data from the api/rpc calls? It seems the live web site must be able to do this, so why can't we?"

## Analysis Results

### What We Found

1. **Multicall3 is heavily used** - 148 multicall requests in our capture
2. **`getGauge(address)` is called 766 times** - This suggests gauges exist
3. **No reward-related function selectors found** in multicalls:
   - No `claimable()`
   - No `earned(address)`
   - No `rewardRate()`
   - No `rewards(address)`

### What This Means

**The site likely gets rewards/VAPR from:**
1. **A separate API endpoint** (not found in our captures yet)
2. **Calculated client-side** from other data
3. **Events/logs** (not direct calls)
4. **A different contract pattern** we haven't identified

### Current State

**What we CAN get from RPC:**
- ✅ Pool addresses (via multicall extraction)
- ✅ Weights (via `weights(address)`)
- ✅ Token addresses (via `token0()` / `token1()`)
- ✅ Pool types (via contract interfaces)

**What we CANNOT get from RPC (yet):**
- ❌ Total rewards (USD value)
- ❌ VAPR percentage
- ❌ Bribe amounts
- ❌ Fee amounts (for vAMM/sAMM)

### Why DOM Extraction Works

The DOM already has rewards/VAPR because:
- The site fetches this data from somewhere (API or calculation)
- Renders it in the DOM
- We extract it from the rendered HTML

### Next Steps to Find RPC Solution

1. **Find the rewards API endpoint**
   - Check for hidden API endpoints
   - Monitor network requests more carefully
   - Look for GraphQL or other API patterns

2. **Investigate gauge contracts**
   - `getGauge(address)` returns addresses
   - Query those gauge contracts for reward data
   - Check if rewards are calculated from emission rates

3. **Check for event-based data**
   - Rewards might come from blockchain events
   - Query recent events for reward distributions
   - Calculate from emission rates and time

4. **Reverse engineer the calculation**
   - If site calculates client-side, we can too
   - Need to find the formula/data sources

## Conclusion

**You're absolutely right** - the site must get this data somehow, and it's likely faster than DOM extraction. However, our current analysis shows:

- **RPC calls don't directly fetch rewards/VAPR**
- **No API endpoint found yet** (but may exist)
- **DOM extraction works but is slow**

**Best path forward:**
1. Continue monitoring network requests to find rewards API
2. Investigate gauge contracts returned by `getGauge(address)`
3. For now, use DOM extraction but optimize it (cache, batch, etc.)
4. Once we find the API/RPC method, switch to that

The fact that `getGauge(address)` is called so frequently suggests there's a pattern we haven't fully decoded yet!
