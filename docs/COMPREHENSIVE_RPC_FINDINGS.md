# Comprehensive RPC Investigation Findings

## Executive Summary

After tenacious investigation of `getGauge()`, multicall patterns, and all RPC methods, here's what we discovered:

### ✅ What We CAN Get via RPC

1. **Pool Weights** (`weights(address)`) - ✅ **CONFIRMED WORKING**
   - Returns current voting weight for any pool
   - This is `current_votes` in our Pool class
   - Works for CL, vAMM, and sAMM pools

2. **Pool Metadata** - ✅ **CONFIRMED WORKING**
   - `token0()` / `token1()` - Token addresses
   - `fee()` - Swap fee (for CL pools)
   - `liquidity()` / `totalSupply()` - Pool liquidity

3. **Pool Addresses** - ✅ **CONFIRMED WORKING**
   - Via multicall extraction
   - Via voter contract weights check
   - Found 138 pools total

### ❌ What We CANNOT Get via RPC (Yet)

1. **Total Rewards (USD)** - ❌ **NOT FOUND**
   - No RPC function returns this directly
   - Not in gauge contracts (getGauge returns empty)
   - Not in pool contracts
   - **BUT**: Found large values in multicall responses that might be rewards

2. **VAPR Percentage** - ❌ **NOT FOUND**
   - Requires calculation from rewards + time + emission
   - Not directly queryable

3. **Bribe Amounts** - ❌ **NOT FOUND**
   - No bribe contracts found
   - No bribe-related functions work

## Key Discoveries from Latest Logs

### 1. Multicall Analysis

- **209 multicall requests** in comprehensive capture
- **`getGauge(address)` called 1,020 times** - but returns empty for tested pools
- **Unknown function selectors** found: `0x2af6e3be`, `0xedf59997`, `0x7116c60c`
- **Large values in responses**: $11M, $52M, $23M, etc.

### 2. Extracted Values from Responses

Successfully extracted values for **49 pools** from multicall responses:
- `0x4a930a63b13e6683a204cb10ef20f68310231459`: $11,241,961.53
- `0xf2b0f7482685d5cf1f40a3de4abfa2665052fa14`: $52,436,767.90
- `0xc3d792a7b51adeb521cd431ac75831d8c433801a`: $23,335,059.44
- `0x758909881a386e30e39490664f85f2247417c0de`: $2,144,857.97
- And 45 more pools...

**Important**: These values **DO NOT match weights**, suggesting they're different data (possibly rewards, TVL, or token balances).

### 3. Function Selectors Found

**Known selectors:**
- `0xa7cac846` = `weights(address)` - 1,020+ calls
- `0xcc56b2c5` = `getGauge(address)` - 1,020+ calls (but returns empty)
- `0x0dfe1681` = `token0()`
- `0xd21220a7` = `token1()`

**Unknown selectors (need identification):**
- `0x2af6e3be` - Appears frequently
- `0xedf59997` - Appears frequently  
- `0x7116c60c` - Appears frequently
- Many others

### 4. New API Endpoint Found

- `https://resources.blackhole.xyz/genesis-info/genesis.json` - Genesis pool info (not voting pools)

## What the Large Values Might Be

The extracted values ($11M, $52M, etc.) could be:

1. **Total Rewards** (fees + bribes) - Most likely if they're consistent
2. **Pool TVL** (Total Value Locked)
3. **Token Balances** (pool token balances)
4. **Lifetime Fees** (not epoch rewards)
5. **Something else** (need to identify the function)

**Key Insight**: These values are **consistent** across multiple requests for the same pool, suggesting they're real data, not random.

## Next Steps to Get Complete Pool Data

### Immediate Actions

1. **Identify Unknown Function Selectors**
   - Look up `0x2af6e3be`, `0xedf59997`, `0x7116c60c` on 4byte.directory
   - Check if they're reward-related functions
   - Match selectors to return values

2. **Verify Extracted Values**
   - Check if $11M values match DOM-extracted rewards
   - Cross-reference with known pool rewards
   - Determine if they're rewards, TVL, or something else

3. **Decode Multicall Structure Properly**
   - Match request function calls to response values
   - Identify which function returns which data
   - Create mapping: function → data type

### Medium-Term Actions

1. **Query Unknown Functions**
   - Try calling unknown selectors on pool/voter contracts
   - See what they return
   - Identify reward-related functions

2. **Calculate VAPR from Available Data**
   - If we can get rewards, calculate VAPR
   - Need: rewards, time period, emission rate
   - Formula: VAPR = (rewards / time) / (staked_amount * token_price) * 100

3. **Find Emission Rates**
   - Query for emission/distribution rates
   - Check voter contract for emission functions
   - Look for reward distribution contracts

## Conclusion

**We ARE making progress!**

✅ **We can get most pool data via RPC:**
- Weights (current_votes) ✅
- Token addresses ✅
- Pool fees ✅
- Pool liquidity ✅

✅ **We found large values in multicall responses:**
- 49 pools with extracted values
- Values range from $169 to $52M
- Consistent across requests (real data)

❓ **Unknown:**
- What do these values represent? (rewards? TVL? balances?)
- Which function returns them?
- How to calculate VAPR?

**The data IS there in the multicall responses - we just need to:**
1. Identify which functions return rewards
2. Properly decode the multicall structure
3. Match functions to their return values

This is very promising! The site is definitely getting this data via RPC, and we're close to finding it.
