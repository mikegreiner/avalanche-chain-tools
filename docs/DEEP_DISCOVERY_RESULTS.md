# Deep API Discovery - Final Report

## Major Discovery: Epoch Management Contract

**Contract Address:** `0x3935f7e11e33e676b6108f6e86ab8578d8e32d43`

### What We Found

#### ✅ Working Functions
1. **`getNextEpochStart()`** - selector `0x65c5f94a`
   - Returns: Unix timestamp of next epoch start
   - Example: 1769644800 = Jan 28, 2026 at 17:00 UTC
   - **This tells us when epochs change!**

2. **`voter()`** - selector `0x46c96aac`
   - Returns: `0xe30d0c8532721551a51a9fec7fb233759964d9e3` (Voter contract we already know)

3. **`getAllPair(address pool, uint256 offset, uint256 limit)`** - selector `0xabcf3d6a`
   - Returns: Some data array (not yet fully decoded)
   - Could contain rewards/incentives data

#### ❌ Still Missing
- **Epoch fees/rewards** - The $61,836 value for CL1-WAVAX/USDC
- Exact function to get rewards for current epoch
- How incentives are tracked

## Summary of ALL Data We Can Get via RPC/API

| Data Point | Source | Available? | Notes |
|------------|--------|-----------|-------|
| Pool Name | Static API (cl-pools.json) | ✅ | Need to add CL1/CL50/CL200 prefix based on tickSpacing |
| Pool Type | Static API (tickSpacing) | ✅ | CL1=tickSpacing:1, CL50=50, CL200=200 |
| TVL | Static API (totalValueLockedUSD) | ✅ | Close match (~$5.74M vs $5.80M) |
| Current Votes | RPC (Voter.weights) | ✅ | Exact match (79.91M) |
| Epoch Start Time | RPC (EpochContract.getNextEpochStart) | ✅ | NEW! |
| Epoch Fees | ❌ | ❌ | Still not found |
| Incentives | ❌ | ❌ | Still not found |
| Total Rewards | ❌ | ❌ | fees + incentives |
| VAPR | ❌ | ❌ | Needs total rewards |

## Contracts Discovered

1. **Voter:** `0xe30d0c8532721551a51a9fec7fb233759964d9e3`
   - `weights(address pool)` → current votes ✅

2. **Multicall3:** `0xca11bde05977b3631167028862be2a173976ca11`
   - Used by site to batch RPC calls

3. **Epoch Manager:** `0x3935f7e11e33e676b6108f6e86ab8578d8e32d43`
   - `getNextEpochStart()` → epoch timing ✅
   - `getAllPair(address,uint256,uint256)` → unknown data
   - `getPair(address,address)` → unknown data

4. **Unknown Contract:** `0xfe926062fb99ca5653080d6c14fe945ad68c265c`
   - Site calls `getFee(address,bool)` on this
   - Returns small integers, not rewards

5. **Incentive Token (example):** `0xc081b59fe4fb3de77e641342b210bebf882d0ea4`
   - Found when testing "add incentives" action

## Recommended Next Steps

### Option A: Continue Digging (High Effort, Uncertain)
1. Capture more API logs during different actions:
   - Voting
   - Claiming rewards
   - End of epoch
2. Analyze the site's JavaScript bundle to find hardcoded endpoints
3. Try all functions on Epoch Manager contract with different parameters
4. Check if rewards are calculated from blockchain events

### Option B: Hybrid Approach (Pragmatic)
Use what we CAN get via RPC/API, keep DOM scraping for what we can't:

```javascript
// Fast (~3 seconds)
const pools = await fetchFromAPI('cl-pools.json');
const votes = await batchFetchVotes(pools);  // Voter.weights()
const epochStart = await getNextEpochStart(); // Epoch contract

// Slow but necessary (~10 seconds)  
const rewards = await scrapeRewardsFromDOM();

// Combine
const complete = pools.map(p => ({
  ...p,
  votes: votes[p.id],
  rewards: rewards[p.id],
  vapr: calculateVAPR(rewards[p.id], votes[p.id])
}));
```

**Total time: ~13 seconds vs 30-60 currently = 2-4x speedup**

### Option C: Accept Limitations
Show pools without VAPR, sorted by TVL or votes instead.

## My Recommendation

**Go with Option B (Hybrid).**

Why:
- We've spent significant time searching and still can't find epoch rewards via RPC
- The site likely uses a private backend or calculates from events
- Hybrid gives us 2-4x speedup while still showing complete data
- We can always replace DOM scraping later if we find the API

The effort to find the missing API is yielding diminishing returns. Better to ship a faster, working solution now.

## Files Generated During Investigation

- `tmp/test_rpc_fetch.py` - Tested fetching votes
- `tmp/test_complete_fetch.py` - Full pool data test
- `tmp/test_wavax_usdc.py` - Analyzed specific pool
- `tmp/test_rewards_contract.py` - Tested contract 0xfe92...
- `tmp/test_gauge_fees.py` - Searched for gauges
- `tmp/test_epoch_contract.py` - Found epoch timing ✅
- `tmp/test_getAllPair.py` - Tested getAllPair function

All test scripts are in `tmp/` and can be run independently.
