# Tenacious RPC/API Investigation Results

## Executive Summary

After deep investigation of `getGauge()`, multicall patterns, and all RPC methods, here's what we found:

### ✅ What We CAN Get via RPC

1. **Pool Weights** (`weights(address)`) - ✅ Working
   - Returns current voting weight for any pool
   - This is `current_votes` in our Pool class

2. **Pool Metadata** - ✅ Working
   - `token0()` / `token1()` - Token addresses
   - `fee()` - Swap fee (basis points)
   - `liquidity()` / `totalSupply()` - Pool liquidity

3. **Pool Addresses** - ✅ Working
   - Via multicall extraction
   - Via voter contract weights check

### ❌ What We CANNOT Get via RPC

1. **Total Rewards (USD)** - ❌ Not available
   - No RPC function returns this
   - Not in gauge contracts (if they exist)
   - Not in pool contracts

2. **VAPR Percentage** - ❌ Not available
   - Requires calculation from rewards + time + emission
   - Not directly queryable

3. **Bribe Amounts** - ❌ Not available
   - No bribe contracts found
   - No bribe-related functions work

4. **Gauge Contracts** - ❌ Not found
   - `getGauge(address)` returns zero/empty for all tested pools
   - Despite 766 calls in multicalls, no gauges found for our pools

## Key Findings

### 1. getGauge() Investigation

- **Called 766 times** in captured multicalls
- **Returns zero/empty** for all tested pools (CL, vAMM, sAMM)
- **Conclusion**: Either:
  - Gauges don't exist for these pools
  - Different pools have gauges (not the ones we tested)
  - Function signature is wrong

### 2. Multicall Analysis

- **148 multicall requests** in our capture
- **Most common calls**:
  - `weights(address)` - Getting pool weights
  - `token0()` / `token1()` - Getting token addresses
  - Unknown selectors - Could be reward-related but we can't decode

### 3. Pool Contract Queries

- **CL pools**: Have `fee()` function (returns basis points)
- **vAMM/sAMM pools**: Have `totalSupply()` but no `fee()`
- **All pools**: Have `token0()` and `token1()`

### 4. Reward Data Sources

**Not found in:**
- ❌ Gauge contracts
- ❌ Bribe contracts  
- ❌ Pool contracts
- ❌ Voter contract
- ❌ Direct RPC calls

**Likely sources:**
1. **Separate API endpoint** (not captured in our logs)
2. **Client-side calculation** from:
   - Emission rates (if we can find them)
   - Time periods
   - Historical data
3. **Blockchain events** (not direct calls)
4. **GraphQL/WebSocket** (not HTTP RPC)

## Recommendations

### Short Term (Use DOM)

Since RPC doesn't provide rewards/VAPR:
1. **Use DOM extraction** (already working)
2. **Optimize DOM extraction**:
   - Cache results
   - Batch operations
   - Extract only visible pools
   - Use MutationObserver for updates

### Medium Term (Find API)

1. **Monitor network requests** more carefully:
   - Check for GraphQL endpoints
   - Look for WebSocket connections
   - Check authenticated endpoints
   - Monitor requests after page load

2. **Reverse engineer calculation**:
   - If site calculates client-side, we can too
   - Need to find emission rates
   - Need to find time periods
   - Need to find price data

### Long Term (Full RPC Solution)

1. **Find the rewards API**:
   - Could be a separate service
   - Could require authentication
   - Could be rate-limited

2. **Query events**:
   - Reward distribution events
   - Bribe events
   - Emission events

## Conclusion

**You're absolutely right** - the site must get this data faster than DOM extraction. However, our investigation shows:

- ✅ **We CAN get most pool data via RPC** (weights, tokens, fees)
- ❌ **We CANNOT get rewards/VAPR via RPC** (not available in any contract we tested)
- 🔍 **The data likely comes from**:
  - A separate API endpoint (not found yet)
  - Client-side calculation
  - Events/logs

**Best path forward:**
1. Continue using DOM extraction (optimized)
2. Keep monitoring for rewards API
3. Investigate client-side calculation methods
4. Consider querying blockchain events

The investigation was thorough, but rewards/VAPR simply aren't available via the RPC methods we tested. The site must be using a different mechanism that we haven't discovered yet.
